// Importa o 'fetch' e as novas bibliotecas de autenticação
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto'; // Biblioteca interna do Node.js

// ####################################################################
// ##           FUNÇÃO 1: Lê o TEXTO (para Marcas)                 ##
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
    const servingMatch = description.match(/^Per (.*?) -/);
    let servingText = "1 porção";
    if (servingMatch && servingMatch[1]) {
      servingText = servingMatch[1]; 
      macros.serving_desc = servingText;
    }

    const calMatch = description.match(/Calories: ([0-9.]+)k?/i); 
    let cals = 0;
    if (calMatch && calMatch[1]) {
      cals = parseFloat(calMatch[1]);
      macros.cals = cals;
    }

    const protMatch = description.match(/Protein: ([0-9.]+)g/i);
    let protein = 0;
    if (protMatch && protMatch[1]) {
      protein = parseFloat(protMatch[1]);
      macros.protein = protein;
    }

    const carbMatch = description.match(/Carbs: ([0-9.]+)g/i);
    let carbs = 0;
    if (carbMatch && carbMatch[1]) {
      carbs = parseFloat(carbMatch[1]);
      macros.carbs = carbs;
    }
    
    const fatMatch = description.match(/Fat: ([0-9.]+)g/i);
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
        macros.cals = macros.cals * factor;
        macros.protein = macros.protein * factor;
        macros.carbs = macros.carbs * factor;
        macros.fat = macros.fat * factor;
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
// (Lê os dados de 'servings' diretamente)
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
        
        // ###############################################################
        // ##                      A CORREÇÃO ESTÁ AQUI               ##
        // ###############################################################
        // Força a busca a retornar APENAS alimentos genéricos (Ovo, Arroz)
        food_type: 'generic', 
        // ###############################################################

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
    
    if (foodData.error || (foodData.foods && foodData.foods.total_results === "0")) {
       console.log("Nenhum resultado genérico encontrado para:", searchQuery);
       return response.status(200).json([]); // Retorna lista vazia
    }
    
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];

      formattedResults = foods.map(food => {
        
        let macros;
        
        // SE o alimento tem 'food_description' (é uma Marca),
        // nós lemos o texto.
        if (food.food_description) {
            macros = parseFoodDescription(food.food_description);
        } 
        // SENÃO (é um Genérico, como "Ovo"), nós lemos
        // os dados de 'servings' diretamente.
        else if (food.servings && food.servings.serving) { 
            macros = parseGenericServings(food.servings.serving);
        } 
        // Se não tiver nenhum, é um resultado inválido
        else {
            macros = { cals: 0 }; // Será filtrado
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

    // 6. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    // Adiciona um log detalhado do erro
    console.error('ERRO CRÍTICO NA API (search.js):', error.message);
    response.status(500).json({ error: error.message });
  }
}
