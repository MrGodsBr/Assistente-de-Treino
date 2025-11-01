// Importa o 'fetch'
import fetch from 'node-fetch';

// Esta é a função principal que o Vercel vai executar
export default async function handler(request, response) {
  const searchQuery = request.query.food;

  if (!searchQuery) {
    return response.status(400).json({ error: 'Parâmetro "food" é obrigatório.' });
  }

  try {
    
    // ###############################################################
    // ##             BUSCA NA OPEN FOOD FACTS (CORRIGIDA)          ##
    // ###############################################################
    
    // Agora usando a URL de busca mais precisa (search.json)
    const searchUrl = `https://pt.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&search_simple=1&action=process&json=1`;
    
    // 2. Faz a busca (não precisa de chaves!)
    const foodResponse = await fetch(searchUrl);
    const foodData = await foodResponse.json();

    // 3. Etapa de Formatação (Lendo os campos do Open Food Facts)
    let formattedResults = [];
    
    if (foodData && foodData.products) {
      formattedResults = foodData.products.map(food => {
        
        const nutriments = food.nutriments || {};
        
        // Tenta pegar os macros para 100g (padrão)
        const cals = nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || 0;
        const protein = nutriments.proteins_100g || nutriments.proteins || 0;
        const carbs = nutriments.carbohydrates_100g || nutriments.carbohydrates || 0;
        const fat = nutriments.fat_100g || nutriments.fat || 0;
        
        // Pega a porção. Se não tiver, usa 100g
        const serving_desc = food.serving_size || "100g";

        return {
          id: food.code || food.id, 
          name: food.product_name,    
          serving_desc: serving_desc, 
          cals: parseFloat(cals),         
          carbs: parseFloat(carbs),       
          protein: parseFloat(protein),   
          fat: parseFloat(fat)
        };
      }).filter(f => f.cals > 0 && f.name); // Filtra resultados que não têm calorias ou nome
    }

    // 4. Enviar a resposta de volta para o seu index.html
    response.status(200).json(formattedResults);

  } catch (error) {
    console.error('ERRO CRÍTICO NA API (search.js):', error.message);
    response.status(500).json({ error: error.message });
  }
}
