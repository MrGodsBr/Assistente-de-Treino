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

    // ####################################################################
    // ##                        A CORREÇÃO ESTÁ AQUI                   ##
    // ####################################################################
    // Adicionamos "&language=pt" para buscar em Português
    const searchUrl = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(searchQuery)}&food_type=generic&format=json&language=pt`;
    // ####################################################################


    const foodResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const foodData = await foodResponse.json();

    // 5. Etapa de Formatação: Limpar os dados antes de enviar de volta para o app
    let formattedResults = [];
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        const serving = food.servings.serving;
        let standardServing = null;
        
        if (Array.isArray(serving)) {
            // Tenta achar a porção de 100g, que é a melhor para cálculo
            standardServing = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
            // Se não achar 100g, pega a primeira porção que tiver macros
            if (!standardServing) standardServing = serving.find(s => s.calories);
            // Se ainda não achar, pega a primeira
            if (!standardServing) standardServing = serving[0];
        } else {
            standardServing = serving;
        }

        const cals = parseFloat(standardServing.calories) || 0;
        const carbs = parseFloat(standardServing.carbohydrate) || 0;
        const protein = parseFloat(standardServing.protein) || 0;
        const fat = parseFloat(standardServing.fat) || 0;
        const servingDesc = standardServing.serving_description || "Porção"; // ex: "100g" ou "1 xícara"

        return {
          id: food.food_id,
          name: food.food_name,
          serving_desc: servingDesc,
          cals: cals,
          carbs: carbs,
          protein: protein,
          fat: fat
        };
      }).filter(f => f.cals > 0); // Filtra resultados que não têm calorias (ex: "Peixe (Alimento)")
    }

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('Erro na Serverless Function:', error);
    response.status(500).json({ error: error.message });
  }
}
