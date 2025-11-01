// Importações
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// ---------------------- Utils de Parsing ----------------------
function normalizeNumber(x) {
  if (x === null || x === undefined) return 0;
  const n = parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function pickBestServing(servingsArr) {
  if (!Array.isArray(servingsArr) || servingsArr.length === 0) return null;

  // 1) Preferir 100 g quando disponível
  let s100g = servingsArr.find(s => (s.metric_serving_unit === 'g' || s.metric_serving_unit === 'gram')
    && normalizeNumber(s.metric_serving_amount) === 100);
  if (s100g) return s100g;

  // 2) Servings com métricas em gramas (mais fácil converter)
  let sGram = servingsArr.find(s => (s.metric_serving_unit === 'g' || s.metric_serving_unit === 'gram'));
  if (sGram) return sGram;

  // 3) Servings marcados como padrão
  let sDefault = servingsArr.find(s => String(s.is_default) === '1');
  if (sDefault) return sDefault;

  // 4) Primeiro disponível
  return servingsArr[0];
}

function toPer100g(serving) {
  // Se tiver métrica em g, converter para 100 g
  const unit = serving.metric_serving_unit;
  const amount = normalizeNumber(serving.metric_serving_amount);

  const base = {
    serving_desc: serving.serving_description || 'Porção',
    cals: normalizeNumber(serving.calories),
    carbs: normalizeNumber(serving.carbohydrate),
    protein: normalizeNumber(serving.protein),
    fat: normalizeNumber(serving.fat),
  };

  if ((unit === 'g' || unit === 'gram') && amount > 0) {
    if (amount === 100) {
      return { ...base, serving_desc: '100g' };
    }
    const factor = 100 / amount;
    return {
      serving_desc: '100g',
      cals: base.cals * factor,
      carbs: base.carbs * factor,
      protein: base.protein * factor,
      fat: base.fat * factor,
    };
  }

  // Sem métrica em gramas: retornar por porção original
  return base;
}

function extractMacrosFromFood(food) {
  // v2 sempre traz "servings.serving" com 1..n itens
  const servings = food?.servings?.serving;
  const arr = Array.isArray(servings) ? servings : (servings ? [servings] : []);
  if (arr.length === 0) {
    return null;
  }
  const best = pickBestServing(arr);
  if (!best) return null;

  return toPer100g(best);
}

// ---------------------- Handler ----------------------
export default async function handler(request, response) {
  const searchQuery = request.query.food;
  const page = Number(request.query.page ?? 0);
  const maxResults = Math.min(Number(request.query.max_results ?? 20), 50);

  if (!searchQuery || String(searchQuery).trim() === '') {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' }); // [web:1][web:7]
  }

  const CONSUMER_KEY = process.env.FATSECRET_CLIENT_ID;
  const CONSUMER_SECRET = process.env.FATSECRET_CLIENT_SECRET;

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Consumer Key/Secret) não configuradas.' }); // [web:8]
  }

  try {
    const oauth = new OAuth({
      consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    // Opção A: manter server.api e usar method=foods.search.v2
    const url = 'https://platform.fatsecret.com/rest/server.api'; // [web:1][web:7]

    const baseParams = {
      method: 'foods.search.v2',      // versão v2 do método
      search_expression: searchQuery, // termo de busca
      page_number: page,              // paginação zero-based
      max_results: maxResults,        // até 50
      region: 'BR',                   // filtra por Brasil
      language: 'pt',                 // retorna em pt quando possível
      format: 'json',                 // JSON
      oauth_consumer_key: CONSUMER_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_version: '1.0',
    };

    const authData = oauth.authorize({ url, method: 'GET',  baseParams });
    const qs = new URLSearchParams({ ...baseParams, ...authData }).toString();
    const finalUrl = `${url}?${qs}`;

    const res = await fetch(finalUrl);
    const data = await res.json();

    // Tratamento de erro da API (códigos OAuth/param)
    if (data?.error?.code) {
      return response.status(502).json({ error: data.error.message || 'Erro da API FatSecret', code: data.error.code }); // [web:7]
    }

    // Estrutura v2: { foods_search: { total_results, page_number, results: { food: [...] } } }
    const foodsSearch = data?.foods_search;
    const total = normalizeNumber(foodsSearch?.total_results);
    const resultsNode = foodsSearch?.results;
    const foods = resultsNode?.food;

    if (!foodsSearch || total === 0 || !foods) {
      return response.status(200).json([]); // sem resultados // [web:7]
    }

    const foodsArray = Array.isArray(foods) ? foods : [foods];

    const formatted = foodsArray.map(food => {
      const macros = extractMacrosFromFood(food);
      return {
        id: food.food_id,
        name: food.food_name,
        brand: food.brand_name || null,
        serving_desc: macros?.serving_desc || 'Porção',
        cals: macros ? Number(macros.cals.toFixed(2)) : 0,
        carbs: macros ? Number(macros.carbs.toFixed(2)) : 0,
        protein: macros ? Number(macros.protein.toFixed(2)) : 0,
        fat: macros ? Number(macros.fat.toFixed(2)) : 0,
        type: food.food_type,
      };
    }).filter(f => f.cals > 0); // manter somente itens com macros válidos

    return response.status(200).json(formatted);
  } catch (err) {
    console.error('ERRO CRÍTICO:', err?.message || err);
    return response.status(500).json({ error: 'Falha interna ao consultar FatSecret.' }); // [web:8]
  }
}
