// ... (aproximadamente na linha 1256 do seu código original) ...

async function addFoodToLog(){
    if (!userId) { showLoginModal(); return; } 
       
    if(currentDateString !== todayDateString) {
        alert("Você só pode adicionar alimentos no dia de hoje.");
        return;
    }
    
    const addFoodButton = document.getElementById('addFoodButton');
    addFoodButton.disabled = true; 
    
    // ATENÇÃO: Mudança aqui para usar selectedFoodItem
    if(!selectedFoodItem){ alert("Por favor, selecione um alimento da lista."); addFoodButton.disabled = false; return; }
    
    const quantity=parseFloat(document.getElementById('foodQuantity').value);
    const meal=document.getElementById('mealTimeSelect').value;
    if(isNaN(quantity)||quantity<=0){ alert("Por favor, insira uma quantidade válida."); addFoodButton.disabled = false; return; }

    const f = selectedFoodItem; // <-- Usa o item selecionado
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; 
    
    const payload = {
        type: 'food', 
        // Garante que a key existe, seja a original (FS) ou uma gerada
        key: f.key || f.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), 
        name: f.name,
        quantity,
        unit: f.unit,
        protein: parseFloat((f.protein * quantity).toFixed(1)),
        carbs: parseFloat((f.carbs * quantity).toFixed(1)),
        cals: parseFloat((f.cals * quantity).toFixed(0)),
        visceralFat: f.visceralFat || false, // Adiciona fallback
        meal,
        ts: firebase.firestore.FieldValue.serverTimestamp(), 
        clientTs: Date.now(),
        timeStr: timeStr 
    };

    const itemsRef = getItemsRef(userId, currentDateString);
    
    try {
        await itemsRef.add(payload);
    } catch (e) {
        alert("Erro ao adicionar alimento. Verifique sua conexão e as regras do Firebase.");
        console.error("Erro ao adicionar alimento:", e);
    }
    
    // LIMPA A BUSCA APÓS ADICIONAR
    clearFoodSearch();
    addFoodButton.disabled = false;
}
