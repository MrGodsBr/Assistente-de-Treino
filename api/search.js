// ... mesmas imports e utils do script anterior

function buildQuery(params) {
  // Estável e explícita, evita reordenações inesperadas
  return Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

export default async function handler(request, response) {
  const searchQuery = request.query.food;
  const page = Number(request.query.page ?? 0);
  const maxResults = Math.min(Number(request.query.max_results ?? 20), 50);

  if (!searchQuery || String(searchQuery).trim() === '') {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' }); // [web:7]
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

    const url = 'https://platform.fatsecret.com/rest/server.api'; // [web:7]
    const baseParams = {
      method: 'foods.search.v2',
      search_expression: searchQuery,     // cuidado com espaços
      page_number: page,
      max_results: maxResults,
      region: 'BR',
      language: 'pt',
      format: 'json',
      oauth_consumer_key: CONSUMER_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000), // segundos Unix [web:8]
      oauth_version: '1.0',
    };

    // Assina usando exatamente os mesmos params que irão na URL
    const auth = oauth.authorize({ url, method: 'GET',  baseParams });
    const fullParams = { ...baseParams, ...auth };

    // Evita URLSearchParams para não reprocessar encoding após a assinatura
    const qs = buildQuery(fullParams);
    const finalUrl = `${url}?${qs}`;

    const res = await fetch(finalUrl, { method: 'GET' });
    const text = await res.text();

    // Tenta parsear JSON, mas preserva corpo bruto em caso de XML/erro
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok) {
      return response.status(res.status).json({
        error: 'Falha ao consultar FatSecret',
        status: res.status,
        body: text
      }); // [web:29]
    }

    if (data?.error?.code) {
      return response.status(502).json({
        error: data.error.message || 'Erro da API FatSecret',
        code: data.error.code
      }); // [web:29]
    }

    // Estrutura v2
    const foodsSearch = data?.foods_search;
    const total = normalizeNumber(foodsSearch?.total_results);
    const foodsNode = foodsSearch?.results?.food;

    if (!foodsSearch || total === 0 || !foodsNode) {
      return response.status(200).json([]);
    }

    const foodsArray = Array.isArray(foodsNode) ? foodsNode : [foodsNode];
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
    }).filter(f => f.cals > 0);

    return response.status(200).json(formatted);
  } catch (err) {
    return response.status(500).json({ error: err?.message || 'Erro inesperado' }); // [web:29]
  }
}
