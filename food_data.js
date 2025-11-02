// food.data.js

const foodDatabaseCustom = {
    // A chave deve ser única (ex: nome_do_alimento_sem_espacos)
    'file_mignon_grelhado': { 
        name: 'Filé Mignon (Grelhado)', 
        protein: 30, 
        carbs: 0, 
        cals: 250, 
        unit: '100g', 
        visceralFat: false 
    },
    'mamao_papaia': { 
        name: 'Mamão Papaia', 
        protein: 0.5, 
        carbs: 10, 
        cals: 40, 
        unit: '100g', 
        visceralFat: false 
    },
    // Adicione quantos alimentos precisar aqui
    // Se quiser substituir um alimento da lista base, use a mesma chave (ex: 'ovo')
};
