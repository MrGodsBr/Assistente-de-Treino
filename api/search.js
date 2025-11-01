// Importa o 'fetch' e as novas bibliotecas de autenticação
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto'; // Biblioteca interna do Node.js

// Esta é a função principal que o Vercel vai executar
export default async function handler(request, response) {
  // 1. Pega o que o usuário digitou
  const searchQuery = request.query.food;

  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // 2. Pega as chaves secretas (Consumer Key/Secret) que você salvou no Vercel
  const CONSUMER_KEY = process.env.FATSECRET_CLIENT_ID; // (Ainda usa o mesmo nome de variável)
  const CONSUMER_SECRET = process.env.FATSECRET_CLIENT_SECRET; // (Ainda usa o mesmo nome de variável)

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Consumer Key/Secret) não configuradas no Vercel.' });
  }

  try {
    // 3. Etapa de Autenticação (OAuth 1.0)
    const oauth = new OAuth({
      consumer: {
        key: CONSUMER_KEY,
        secret: CONSUMER_SECRET,
      },
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
        search_expression: searchQuery,
        food_type: 'generic',
        format: 'json',
        language: 'pt',
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

    // 4. Etapa de Busca
    const foodResponse = await fetch(finalUrl);
    const foodData = await foodResponse.json();

    // ####################################################################
    // ##                        ETAPA DE DEBUG (DE VOLTA)             ##
    // ####################################################################
    // Vamos loggar o que a API do FatSecret REALMENTE enviou com o OAuth 1.0
    console.log('RESPOSTA CRUA (OAUTH 1.0):', JSON.stringify(foodData));
    // ####################################################################


    // 5. Etapa de Formatação
    let formattedResults = [];
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        let servingData = { cals: 0, carbs: 0, protein: 0, fat: 0, serving_desc: "Porção" };

        if (food.servings && food.servings.serving) {
            let servingToParse = null;
            const serving = food.servings.serving;

            if (Array.isArray(serving)) {
                servingToParse = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
                if (!servingToParse) servingToParse = serving.find(s => s.calories || s.calorias); 
                if (!servingToParse) servingToParse = serving[0]; 
            } else {
                servingToParse = serving; 
            }

            if (servingToParse) {
                servingData.cals = parseFloat(servingToParse.calorias || servingToParse.calories) || 0;
                servingData.carbs = parseFloat(servingToParse.carboidrato || servingToParse.carbohydrate) || 0;
                servingData.protein = parseFloat(servingToParse.proteina || servingToParse.protein) || 0;
                servingData.fat = parseFloat(servingToParse.gordura || servingToParse.fat) || 0;
                servingData.serving_desc = servingToParse.serving_description || "Porção";
            }
        }

        return {
          id: food.food_id,
          name: food.food_name,
          serving_desc: servingData.serving_desc,
          cals: servingData.cals,
          carbs: servingData.carbs,
          protein: servingData.protein,
          fat: servingData.fat
        };
      }).filter(f => f.cals > 0); 
    }

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('Erro na Serverless Function (OAuth 1.0):', error);
    response.status(500).json({ error: error.message });
  }
}
