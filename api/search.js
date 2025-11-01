// Importa o 'fetch' que o Vercel precisa para rodar no servidor
import fetch from 'node-fetch';

// Esta é a função principal que o Vercel vai executar
export default async function handler(request, response) {
  // 1. Pega o que o usuário digitou (ex: ?food=banana)
  const searchQuery = request.query.food;

  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // 2. Pega as chaves secretas que você salvou no Vercel
  const CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
  const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return response.status(500).json({ error: 'Chaves de API não configuradas no Vercel.' });
  }

  try {
    // 3. Etapa de Autenticação: Pedir um Token de Acesso para o FatSecret
    const tokenResponse = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=basic'
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('Falha ao obter token de acesso do FatSecret.');
    }

    // 4. Etapa de Busca: (Correto, com &language=pt)
    const searchUrl = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(searchQuery)}&food_type=generic&format=json&language=pt`;

    const foodResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const foodData = await foodResponse.json();

    // 5. Etapa de Formatação: (Esta é a parte CORRIGIDA)
    let formattedResults = [];
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        let servingData = { cals: 0, carbs: 0, protein: 0, fat: 0, serving_desc: "Porção" };

        if (food.servings && food.servings.serving) {
            let servingToParse = null;
            const serving = food.servings.serving;

            // Pega a porção (se for um array, tenta achar 100g, senão pega a primeira)
            if (Array.isArray(serving)) {
                servingToParse = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
                if (!servingToParse) servingToParse = serving.find(s => s.calories || s.calorias); // Pega a primeira que tiver macros
                if (!servingToParse) servingToParse = serving[0]; // Pega a primeira de todas
            } else {
                servingToParse = serving; // É um objeto único
            }

            // Agora, extrai os dados com segurança
            if (servingToParse) {
                // **A MÁGICA ESTÁ AQUI:** Procura "calorias" (PT) OU "calories" (EN)
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
      }).filter(f => f.cals > 0); // Filtra resultados que não têm calorias (agora deve funcionar)
    }

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('Erro na Serverless Function:', error);
    response.status(500).json({ error: error.message });
  }
}
