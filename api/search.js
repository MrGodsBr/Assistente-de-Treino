// Importa o 'fetch' e as novas bibliotecas de autenticação
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto'; // Biblioteca interna do Node.js

// ####################################################################
// ##           FUNÇÃO HELPER PARA LER O TEXTO DA API              ##
// ####################################################################
// "Per 100g - Calories: 89kcal | Protein: 1.10g | Carbs: 22.84g"
function parseFoodDescription(description) {
  const macros = {
    serving_desc: "1 porção",
    cals: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  try {
    // 1. Pega a porção (Ex: "100g" ou "1 fatia")
    const servingMatch = description.match(/^Per (.*?) -/);
    if (servingMatch && servingMatch[1]) {
      macros.serving_desc = servingMatch[1];
    }

    // 2. Pega as Calorias (Ex: "Calories: 89kcal" ou "Calories: 2651k")
    const calMatch = description.match(/Calories: ([0-9.]+)k?/i); // 'i' ignora maiúscula/minúscula, k? é opcional
    if (calMatch && calMatch[1]) {
      macros.cals = parseFloat(calMatch[1]);
    }

    // 3. Pega as Proteínas (Ex: "Protein: 1.10g")
    const protMatch = description.match(/Protein: ([0-9.]+)g/i);
    if (protMatch && protMatch[1]) {
      macros.protein = parseFloat(protMatch[1]);
    }

    // 4. Pega os Carboidratos (Ex: "Carbs: 22.84g")
    const carbMatch = description.match(/Carbs: ([0-9.]+)g/i);
    if (carbMatch && carbMatch[1]) {
      macros.carbs = parseFloat(carbMatch[1]);
    }
    
    // 5. Pega as Gorduras (Ex: "Fat: 0.33g")
    const fatMatch = description.match(/Fat: ([0-9.]+)g/i);
    if (fatMatch && fatMatch[1]) {
      macros.fat = parseFloat(fatMatch[1]);
    }

  } catch (e) {
    console.error("Erro ao 'ler' a descrição do alimento:", e);
  }

  return macros;
}
// ####################################################################


// Esta é a função principal que o Vercel vai executar
export default async function handler(request, response) {
  // 1. Pega o que o usuário digitou
  const searchQuery = request.query.food;

  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // 2. Pega as chaves secretas (Consumer Key/Secret) que você salvou no Vercel
  const CONSUMER_KEY = process.env.FATSECRET_CLIENT_ID; 
  const CONSUMER_SECRET = process.env.FATSECRET_CLIENT_SECRET;

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Consumer Key/Secret) não configuradas no Vercel.' });
  }

  try {
    // 3. Etapa de Autenticação (OAuth 1.0)
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
        search_expression: searchQuery,
        // food_type: 'generic', // REMOVIDO! Este era o Erro 1. Agora busca TUDO.
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

    // 5. Etapa de Formatação (Esta é a parte CORRIGIDA)
    let formattedResults = [];
    
    // Se a API retornar "erro" (ex: total_results: "0"), ela não trava
    if (foodData.error || (foodData.foods && foodData.foods.total_results === "0")) {
       console.log("Nenhum resultado encontrado no FatSecret para:", searchQuery);
       return response.status(200).json([]); // Retorna lista vazia
    }
    
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        // **A MÁGICA ESTÁ AQUI (Erro 2):**
        // Em vez de procurar "calories", "protein", etc.,
        // nós lemos o texto "food_description" e extraímos os macros.
        const macros = parseFoodDescription(food.food_description);

        return {
          id: food.food_id,
          name: food.food_name,
          serving_desc: macros.serving_desc, // "100g"
          cals: macros.cals,         // 89
          carbs: macros.carbs,       // 22.84
          protein: macros.protein,   // 1.10
          fat: macros.fat            // 0.33
        };
      }).filter(f => f.cals > 0); // Filtra resultados que não têm calorias
    }

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('Erro na Serverless Function (OAuth 1.0):', error);
    response.status(500).json({ error: error.message });
  }
}
