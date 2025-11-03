// Importa o 'fetch'
import fetch from 'node-fetch';

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

    // Tentativa de conversão para 100g se a porção for diferente de 100g
    const gramMatch = servingText.match(/([0-9.]+)\s*g/);
    if (gramMatch && gramMatch[1]) {
      const gramAmount = parseFloat(gramMatch[1]);
      if (gramAmount > 0 && gramAmount !== 100) {
        const factor = 100 / gramAmount; 
        macros.cals *= factor;
        macros.protein *= factor;
        macros.carbs *= factor;
        macros.fat *= factor;
        macros.serving_desc = "100g"; // Padroniza para 100g após o cálculo
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
        // Tenta encontrar a porção de 100g
        servingToParse = serving.find(s => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) === 100);
        // Se não encontrar, pega a primeira porção com calorias
        if (!servingToParse) servingToParse = serving.find(s => s.calories); 
        // Se ainda não encontrar, pega a primeira
        if (!servingToParse) servingToParse = serving[0]; 
    } else {
        servingToParse = serving; // Se for um único objeto
    }
    
    if (servingToParse) {
        servingData.cals = parseFloat(servingToParse.calories) || 0;
        servingData.carbs = parseFloat(servingToParse.carbohydrate) || 0;
        servingData.protein = parseFloat(servingToParse.protein) || 0;
        servingData.fat = parseFloat(servingToParse.fat) || 0;
        
        // Se a porção for 100g, definimos serving_desc como 100g
        if (servingToParse.metric_serving_unit === 'g' && parseFloat(servingToParse.metric_serving_amount) === 100) {
            servingData.serving_desc = "100g";
        } else {
            servingData.serving_desc = servingToParse.serving_description || "Porção";
            // Opcional: Aqui poderíamos adicionar uma lógica para converter tudo para 100g se a porção não for
            // Mas, para simplicidade do FatSecret, vamos manter a porção padrão e confiar no index.html
        }
    }
    return servingData;
}

// [HANDLER PRINCIPAL DA API (OAuth 2.0)]
export default async function handler(request, response) {
  const searchQuery = request.query.food;
  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  // Lê as chaves (Client ID / Client Secret)
  const CLIENT_ID = process.env.FATSECRET_CLIENT_ID; 
  const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return response.status(500).json({ error: 'Chaves de API (Client ID/Secret) não configuradas no Vercel.' });
  }

  try {
    // 3. Etapa de Autenticação (OAuth 2.0)
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
      console.error('Falha ao obter token de acesso. Resposta do FatSecret:', tokenData);
      return response.status(500).json({ error: `Falha ao obter token. Verifique o IP Whitelist no FatSecret. Detalhe: ${tokenData.error_description || 'Erro desconhecido'}` });
    }

    // 4. Etapa de Busca (COM O TOKEN)
    const searchParams = new URLSearchParams({
        method: 'foods.search',
        search_expression: searchQuery,
        format: 'json',
        // FORÇANDO PORTUGUÊS
        region: 'BR',      
        language: 'pt',    
    });
    
    const finalUrl = `https://platform.fatsecret.com/rest/server.api?${searchParams.toString()}`;

    const foodResponse = await fetch(finalUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const foodData = await foodResponse.json();

    // 5. Etapa de Formatação (Código "Inteligente")
    let formattedResults = [];
    
    if (foodData.error || (foodData.foods && foodData.foods.total_results === "0")) {
       return response.status(200).json([]); // Retorna lista vazia
    }
    
    if (foodData.foods && foodData.foods.food) {
      const foods = Array.isArray(foodData.foods.food) ? foodData.foods.food : [foodData.foods.food];
      formattedResults = foods.map(food => {
        let macros;
        
        // Se for Marca (food_description), ou Genérico (servings)
        if (food.food_description) {
            macros = parseFoodDescription(food.food_description);
        } else if (food.servings && food.servings.serving) { 
            macros = parseGenericServings(food.servings.serving);
        } else {
            macros = { cals: 0, protein: 0, carbs: 0, fat: 0, serving_desc: "100g" }; 
        }
        
        // Padroniza tudo para 100g para o index.html (evita bugs no front-end)
        const is100g = macros.serving_desc === "100g";
        const factor = is100g ? 1 : 100 / (parseFloat(macros.serving_desc.match(/(\d+)g/)?.[1] || 100));

        return {
          id: food.food_id,
          name: food.food_name, 
          serving_desc: is100g ? "100g" : macros.serving_desc, 
          cals: is100g ? macros.cals : (macros.cals * factor),         
          carbs: is100g ? macros.carbs : (macros.carbs * factor),       
          protein: is100g ? macros.protein : (macros.protein * factor),   
          fat: is100g ? macros.fat : (macros.fat * factor)            
        };
      }).filter(f => f.cals > 0); 
    }
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('ERRO CRÍTICO NA API (search.js):', error.message);
    response.status(500).json({ error: error.message });
  }
}
