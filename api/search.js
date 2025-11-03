// ... (após a declaração de 'foodDatabase') ...

// ESTADO GLOBAL AJUSTADO: Armazena o item completo, independente da origem (Local, FatSecret, etc.)
let selectedFoodItem = null;

// #############################################
// ##   SIMULAÇÃO DA INTEGRAÇÃO COM FATSECRET   ##
// #############################################
// Nota: Em um ambiente de produção, esta função faria uma requisição segura (fetch) 
// para um SEU servidor backend, que então faria a chamada real (e segura) para a API do FatSecret.
async function fetchFatSecretApi(query) {
    console.log(`Simulando busca no FatSecret para: ${query}`);
    
    // Simula a lentidão da rede
    await new Promise(resolve => setTimeout(resolve, 800));

    // Resultados de simulação baseados na query
    const results = [];
    const qLower = query.toLowerCase();

    if (qLower.includes('frango')) {
        results.push({
            type: 'fatsecret',
            key: 'fs_frango_grelhado',
            name: 'Peito de Frango (FS) - 100g',
            protein: 31,
            carbs: 0,
            cals: 165,
            unit: '100g',
            visceralFat: false
        });
    }
    if (qLower.includes('hambur')) {
        results.push({
            type: 'fatsecret',
            key: 'fs_hamburguer_fastfood',
            name: 'Hambúrguer de Fast Food (FS)',
            protein: 15,
            carbs: 30,
            cals: 350,
            unit: 'unidade',
            visceralFat: true // Exemplo de item não saudável
        });
    }
    if (qLower.includes('pizza')) {
        results.push({
            type: 'fatsecret',
            key: 'fs_pizza',
            name: 'Pizza Congelada (FS)',
            protein: 10,
            carbs: 40,
            cals: 300,
            unit: 'fatia',
            visceralFat: true
        });
    }

    // Se o FatSecret não encontrar nada, ele retorna o array vazio.
    return results; 
}

// #############################################
// ##      FUNÇÃO DE SELEÇÃO DO RESULTADO      ##
// #############################################
function selectFoodFromSearchResult(item) {
    selectedFoodItem = item; // Armazena o objeto completo
    document.getElementById('foodSearch').value = item.name;
    hideElement(document.getElementById('searchDropdown'));
    document.getElementById('foodQuantity').focus();
}

// Atualiza clearFoodSearch para limpar o novo estado global
function clearFoodSearch() {
    document.getElementById('foodSearch').value = '';
    document.getElementById('foodQuantity').value = '';
    selectedFoodItem = null; // <--- LIMPA O ITEM SELECIONADO
    hideElement(document.getElementById('searchDropdown'));
    document.getElementById('addFoodButton').disabled = false;
    document.getElementById('foodSearch').focus();
}
