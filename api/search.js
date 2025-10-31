// Importa o 'fetch' que o Vercel precisa para rodar no servidor
import fetch from 'node-fetch';

// Esta é a função principal que o Vercel vai executar
// Ela recebe o 'request' (pedido) e envia o 'response' (resposta)
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
    // O FatSecret exige que você "faça login" (obtenha um token) antes de cada busca.
    const tokenResponse = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // A autenticação 'Basic' usa o ID e o Secret codificados
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=basic'
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('Falha ao obter token de acesso do FatSecret.');
    }

    // 4. Etapa de Busca: Usar o Token para buscar o alimento
    // Nós vamos buscar apenas alimentos "genéricos" (como "Banana", "Arroz")
    const searchUrl = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(searchQuery)}&food_type=generic&format=json`;

    const foodResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const foodData = await foodResponse.json();

    // 5. Etapa de Formatação: Limpar os dados antes de enviar de volta para o app
    // O FatSecret retorna muitos dados. Vamos enviar só o que precisamos.
    
    let formattedResults = [];
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        // A descrição do FatSecret é complexa, ex: "Banana - Por 100g: Cals: 89..."
        // Vamos tentar pegar a porção padrão de 100g, se existir.
        const serving = food.servings.serving;
        let standardServing = null;
        
        if (Array.isArray(serving)) {
            // Procura a porção de 100g
            standardServing = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
            // Se não achar 100g, pega a primeira porção
            if (!standardServing) standardServing = serving[0];
        } else {
            standardServing = serving;
        }

        // Se a porção padrão ainda não tiver os dados, pegamos da primeira
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
      });
    }

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('Erro na Serverless Function:', error);
    response.status(500).json({ error: error.message });
  }
}
