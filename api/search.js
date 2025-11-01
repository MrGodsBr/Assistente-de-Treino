// Importa o 'fetch' e as novas bibliotecas de autenticação
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto'; 

// [FUNÇÃO 1: Lê o TEXTO (para Marcas)]
function parseFoodDescription(description) {
  const macros = { serving_desc: "1 porção", cals: 0, protein: 0, carbs: 0, fat: 0 };
  try {
    const servingMatch = description.match(/^Per (.*?) -/);
    let servingText = "1 porção";
    if (servingMatch && servingMatch[1]) {
      servingText = servingMatch[1]; 
      macros.serving_desc = servingText;
    }
    const calMatch = description.match(/Calories: ([0-9.]+)k?/i); 
    if (calMatch && calMatch[1]) macros.cals = parseFloat(calMatch[1]);
    const protMatch = description.match(/Protein: ([0-9.]+)g/i);
    if (protMatch && protMatch[1]) macros.protein = parseFloat(protMatch[1]);
    const carbMatch = description.match(/Carbs: ([0-9.]+)g/i);
    if (carbMatch && carbMatch[1]) macros.carbs = parseFloat(carbMatch[1]);
    const fatMatch = description.match(/Fat: ([0-9.]+)g/i);
    if (fatMatch && fatMatch[1]) macros.fat = parseFloat(fatMatch[1]);

    const gramMatch = servingText.match(/([0-9.]+)\s*g/);
    if (gramMatch && gramMatch[1]) {
      const gramAmount = parseFloat(gramMatch[1]);
      if (gramAmount > 0 && gramAmount !== 100) {
        const factor = 100 / gramAmount; 
        macros.cals *= factor;
        macros.protein *= factor;
        macros.carbs *= factor;
        macros.fat *= factor;
        macros.serving_desc = "100g"; 
      }
    }
  } catch (e) { console.error("Erro (parseFoodDescription):", e); }
  return macros;
}

// [FUNÇÃO 2: Lê o OBJETO (para Genéricos)]
function parseGenericServings(serving) {
    let servingData = { cals: 0, carbs: 0, protein: 0, fat: 0, serving_desc: "Porção" };
    let servingToParse = null;
    if (Array.isArray(serving)) {
        servingToParse = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
        if (!servingToParse) servingToParse = serving.find(s => s.calories); 
        if (!servingToParse) servingToParse = serving[0]; 
    } else {
        servingToParse = serving; 
    }
    if (servingToParse) {
        servingData.cals = parseFloat(servingToParse.calories) || 0;
        servingData.carbs = parseFloat(servingToParse.carbohydrate) || 0;
        servingData.protein = parseFloat(servingToParse.protein) || 0;
        servingData.fat = parseFloat(servingToParse.fat) || 0;
        servingData.serving_desc = servingToParse.serving_description || "Porção";
    }
    return servingData;
}

// [HANDLER PRINCIPAL DA API (OAuth 1.0)]
export default async function handler(request, response) {
  const searchQuery = request.query.food;
  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // Lê as chaves (Consumer Key / Consumer Secret)
  const CONSUMER_KEY = process.env.FATSECRET_CLIENT_ID; 
  const CONSUMER_SECRET = process.env.FATSECRET_CLIENT_SECRET;
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Consumer Key/Secret) não configuradas no Vercel.' });
  }

  try {
    const oauth = new OAuth({
      consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const requestData = {
      url: 'https://platform.fatsecret.com/rest/server.api',
      method: 'GET',
      data: {
        method: 'foods.search',
        search_expression: searchQuery, // Busca o termo (em inglês)
        format: 'json',
        oauth_consumer_key: CONSUMER_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000),
        oauth_version: '1.0',
      },
    };

    const authData = oauth.authorize(requestData);
    const paramString = new URLSearchParams({ ...requestData.data, ...authData }).toString();
    const finalUrl = `${requestData.url}?${paramString}`;

    const foodResponse = await fetch(finalUrl);
    const foodData = await foodResponse.json();

    let formattedResults = [];
    if (foodData.error || (foodData.foods && foodData.foods.total_results === "0")) {
       return response.status(200).json([]); 
    }
    
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];
      formattedResults = foods.map(food => {
        let macros;
        if (food.food_description) {
            macros = parseFoodDescription(food.food_description);
        } else if (food.servings && food.servings.serving) { 
            macros = parseGenericServings(food.servings.serving);
        } else {
            macros = { cals: 0 }; 
        }
        return {
          id: food.food_id,
          name: food.food_name, // O nome virá em inglês
          serving_desc: macros.serving_desc, 
          cals: macros.cals,         
          carbs: macros.carbs,       
          protein: macros.protein,   
          fat: macros.fat            
        };
      }).filter(f => f.cals > 0); 
    }
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('ERRO CRÍTICO NA API (search.js):', error.message);
    response.status(500).json({ error: error.message });
  }
}
