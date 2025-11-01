// pages/api/fatsecret-search.js (Next/Vercel)
// Requer FATSECRET_CLIENT_ID e FATSECRET_CLIENT_SECRET definidos no ambiente.

import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// ---------- Helpers numéricos ----------
function n(x) {
  if (x === null || x === undefined) return 0;
  const v = parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

// ---------- Escolha de porção ----------
function pickBestServing(servingsArr) {
  if (!Array.isArray(servingsArr) || servingsArr.length === 0) return null;

  let s100g = servingsArr.find(s =>
    (s.metric_serving_unit === 'g' || s.metric_serving_unit === 'gram') &&
    n(s.metric_serving_amount) === 100
  );
  if (s100g) return s100g;

  let sGram = servingsArr.find(s =>
    (s.metric_serving_unit === 'g' || s.metric_serving_unit === 'gram') &&
    n(s.metric_serving_amount) > 0
  );
  if (sGram) return sGram;

  let sDefault = servingsArr.find(s => String(s.is_default) === '1');
  if (sDefault) return sDefault;

  return servingsArr[0];
}

// ---------- Conversão para 100 g quando possível ----------
function toPer100g(serving) {
  const unit = serving.metric_serving_unit;
  const amount = n(serving.metric_serving_amount);

  const base = {
    serving_desc: serving.serving_description || 'Porção',
    cals: n(serving.calories),
    carbs: n(serving.carbohydrate),
    protein: n(serving.protein),
    fat: n(serving.fat),
  };

  if ((unit === 'g' || unit === 'gram') && amount > 0) {
    if (amount === 100) return { ...base, serving_desc: '100g' };
    const factor = 100 / amount;
    return {
      serving_desc: '100g',
      cals: base.cals * factor,
      carbs: base.carbs * factor,
      protein: base.protein * factor,
      fat: base.fat * factor,
    };
  }

  return base;
}

// ---------- Extrai macros do objeto food (v2) ----------
function extractMacros(food) {
  const servings = food?.servings?.serving;
  const arr = Array.isArray(servings) ? servings : (servings ? [servings] : []);
  if (arr.length === 0) return null;
  const best = pickBestServing(arr);
  if (!best) return null;
  return toPer100g(best);
}

// ---------- Montagem estável da query (não usar URLSearchParams após assinar) ----------
function buildQuery(params) {
  return Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

// ---------- Handler ----------
export default async function handler(req, res) {
  const searchQuery = req.query.food;
  const page = Number(req.query.page ?? 0);
  const maxResults = Math.min(Number(req.query.max_results ?? 20), 50);

  if (!searchQuery || String(searchQuery).trim() === '') {
    return res.status(400).json({ error: 'Parâmetro "food" é obrigatório.' }); // [web:7]
  }

  const CONSUMER_KEY = process.env.FATSECRET_CLIENT_ID;
  const CONSUMER_SECRET = process.env.FATSECRET_CLIENT_SECRET;
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return res.status(500).json({ error: 'Chaves de API não configuradas.' }); // [web:8]
  }

  try {
    const oauth = new OAuth({
      consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        // HMAC-SHA1 em base64
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const url = 'https://platform.fatsecret.com/rest/server.api'; // endpoint assinado [web:7]
    const params = {
      method: 'foods.search.v2',             // método v2 [web:7]
      search_expression: searchQuery,        // termo de busca (ex.: "Peixe")
      page_number: page,                     // paginação zero-based [web:7]
      max_results: maxResults,               // até 50 [web:7]
      region: 'BR',                          // localização [web:7]
      language: 'pt',                        // idioma dependente de region [web:7]
      format: 'json',                        // JSON
      // OAuth 1.0 obrigatórios:
      oauth_consumer_key: CONSUMER_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000), // segundos Unix [web:8]
      oauth_version: '1.0',
    };

    // Assinar com exatamente os mesmos parâmetros que irão na URL
    const auth = oauth.authorize({ url, method: 'GET',  params });
    const fullParams = { ...params, ...auth };
    const qs = buildQuery(fullParams);
    const finalUrl = `${url}?${qs}`;

    const r = await fetch(finalUrl, { method: 'GET' });
    const bodyText = await r.text();

    // Parse seguro (pode vir XML em erros antigos; normalmente é JSON)
    let data = null;
    try { data = JSON.parse(bodyText); } catch { /* deixa data como null */ }

    if (!r.ok) {
      // Expor erro detalhado ao front para depuração
      return res.status(r.status).json({ error: 'Falha ao consultar FatSecret', status: r.status, body: bodyText }); // [web:29]
    }

    // Erros semânticos da API (códigos OAuth 1.0, etc.)
    if (data?.error?.code) {
      return res.status(502).json({ error: data.error.message || 'Erro FatSecret', code: data.error.code }); // [web:29]
    }

    // Estrutura v2: foods_search { total_results, page_number, results { food } } [web:7]
    const foodsSearch = data?.foods_search;
    const total = Number(foodsSearch?.total_results ?? 0);
    const foodsNode = foodsSearch?.results?.food;

    if (!foodsSearch || total === 0 || !foodsNode) {
      return res.status(200).json([]); // nenhum resultado [web:7]
    }

    const foodsArr = Array.isArray(foodsNode) ? foodsNode : [foodsNode];

    const out = foodsArr.map(food => {
      const m = extractMacros(food);
      return {
        id: food.food_id,
        name: food.food_name,
        brand: food.brand_name || null,
        type: food.food_type,
        serving_desc: m?.serving_desc || 'Porção',
        cals: m ? Number(m.cals.toFixed(2)) : 0,
        carbs: m ? Number(m.carbs.toFixed(2)) : 0,
        protein: m ? Number(m.protein.toFixed(2)) : 0,
        fat: m ? Number(m.fat.toFixed(2)) : 0,
      };
    }).filter(x => x.cals > 0);

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Erro inesperado' }); // [web:29]
  }
}
