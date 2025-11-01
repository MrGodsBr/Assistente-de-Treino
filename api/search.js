// Importa o 'fetch'
import fetch from 'node-fetch';

// ####################################################################
// ##           FUNÇÃO 1: Lê o TEXTO (para Marcas)                 ##
// ####################################################################
function parseFoodDescription(description) {
  const macros = {
    serving_desc: "1 porção",
    cals: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  };

  try {
    const servingMatch = description.match(/^Per (.*?) -/);
    let servingText = "1 porção";
    if (servingMatch && servingMatch[1]) {
      servingText = servingMatch[1]; 
      macros.serving_desc = servingText;
    }

    // A API 2.0 usa "Calories" em PT-BR também, mas vamos checar os dois
    const calMatch = description.match(/(?:Calories|Calorias): ([0-9.]+)k?/i); 
    let cals = 0;
    if (calMatch && calMatch[1]) {
      cals = parseFloat(calMatch[1]);
      macros.cals = cals;
    }

    const protMatch = description.match(/(?:Protein|Proteína): ([0-9.]+)g/i);
    let protein = 0;
    if (protMatch && protMatch[1]) {
      protein = parseFloat(protMatch[1]);
      macros.protein = protein;
    }

    const carbMatch = description.match(/(?:Carbs|Carboidratos): ([0-9.]+)g/i);
    let carbs = 0;
    if (carbMatch && carbMatch[1]) {
      carbs = parseFloat(carbMatch[1]);
      macros.carbs = carbs;
    }
    
    // A API 2.0 em PT-BR chama "Fat" de "Gordura"
    const fatMatch = description.match(/(?:Fat|Gordura): ([0-9.]+)g/i);
    let fat = 0;
    if (fatMatch && fatMatch[1]) {
      fat = parseFloat(fatMatch[1]);
      macros.fat = fat;
    }

    // Cálculo de 100g (se a porção for em 'g')
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
  } catch (e) {
    console.error("Erro ao 'ler' a descrição (parseFoodDescription):", e);
  }
  return macros;
}

// ####################################################################
// ##           FUNÇÃO 2: Lê o OBJETO (para Genéricos)             ##
// ####################################################################
function parseGenericServings(serving) {
    let servingData = { cals: 0, carbs: 0, protein: 0, fat: 0, serving_desc: "Porção" };
    let servingToParse = null;

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
    
    return servingData;
}
// ####################################################################


// [HANDLER PRINCIPAL DA API (OAuth 2.0)]
export default async function handler(request, response) {
  // 1. Pega o que o usuário digitou
  const searchQuery = request.query.food;

  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // 2. Pega as chaves (Client ID / Client Secret)
  const CLIENT_ID = process.env.FATSECRET_CLIENT_ID; 
  const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Client ID/Secret) não configuradas no Vercel.' });
  }

  try {
    // 3. Etapa de Autenticação (OAuth 2.0)
    // Pede o token de acesso
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

    // Se o token falhar (aqui pode ser o bloqueio de IP)
    if (!accessToken) {
      console.error('Falha ao obter token de acesso. Resposta do FatSecret:', tokenData);
      throw new Error(`Falha ao obter token de acesso: ${tokenData.error_description || 'Erro desconhecido'}`);
    }

    // 4. Etapa de Busca (COM O TOKEN)
    // Constrói a URL de busca
    const searchParams = new URLSearchParams({
        method: 'foods.search',
        search_expression: searchQuery,
        format: 'json',
        // ###############################################################
        // ##              FORÇANDO PORTUGUÊS (COM 'region')          ##
        // ###############################################################
        region: 'BR',      
        language: 'pt',    
        // ###############################################################
    });
    
    const finalUrl = `https://platform.fatsecret.com/rest/server.api?${searchParams.toString()}`;

    // Faz a busca usando o Token
    const foodResponse = await fetch(finalUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const foodData = await foodResponse.json();

    // 5. Etapa de Formatação (Código "Inteligente")
    let formattedResults = [];
    
    if (foodData.error || (foodData.foods && foodData.foods.total_results === "0")) {
       console.log("Nenhum resultado encontrado no FatSecret para:", searchQuery);
       return response.status(200).json([]); // Retorna lista vazia
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
          name: food.food_name, 
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
