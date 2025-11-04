/**
 * ARQUIVO: api/buscar-alimento.js
 * * Esta é uma Função Serverless (Node.js) que rodará no Vercel.
 * Ela age como um "intermediário" seguro entre seu app (index.html) 
 * e a API do Gemini (Google).
 */

// O prompt do sistema que define a tarefa da IA
// (Este prompt é o mesmo que estava no seu index.html)
const geminiSystemPrompt = `Você é um assistente de nutrição. Sua tarefa é encontrar informações nutricionais para o alimento solicitado. Responda *apenas* com um objeto JSON no seguinte formato: {"name": "Nome do Alimento (ex: 100g de Arroz)", "protein": NÚMERO, "carbs": NÚMERO, "fats": NÚMERO, "cals": NÚMERO, "unit": "porção", "visceralFat": false}. 'visceralFat' deve ser true apenas para alimentos processados, fritos ou com muito açúcar (ex: refrigerante, batata frita, biscoito recheado). Se não encontrar, retorne {"erro": "Alimento não encontrado"}. Os números devem ser apenas NÚMEROS.`;

// A URL da API do Google.
const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`;

/**
 * Esta é a função principal que o Vercel irá executar.
 * 'req' (request) é o que vem do seu app (index.html).
 * 'res' (response) é o que mandamos de volta para ele.
 */
export default async function handler(req, res) {
  // 1. Apenas permite requisições do tipo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // 2. Pega a chave da API que você salvou nas "Environment Variables" do Vercel
  const apiKey = process.env.GEMINI_API_KEY;

  // Se a chave não estiver configurada no Vercel, retorna um erro
  if (!apiKey) {
    console.error('ERRO: Chave GEMINI_API_KEY não encontrada nas Variáveis de Ambiente do Vercel.');
    return res.status(500).json({ erro: 'Chave da API não configurada no servidor' });
  }

  // 3. Pega o termo de busca (ex: "Tilápia") que o index.html enviou
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ erro: 'Query (termo de busca) não fornecida' });
  }

  // 4. Monta o payload para a API do Google
  const payload = {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ "google_search": {} }],
    systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
  };

  try {
    // 5. Faz a chamada segura do SERVIDOR (Vercel) para o GOOGLE
    const response = await fetch(geminiApiUrl + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Se o Google der um erro, repassa o erro
      const errorBody = await response.text();
      console.error('Erro na API do Google:', response.status, errorBody);
      throw new Error(`Erro na API do Google: ${response.statusText}`);
    }

    const result = await response.json();
    
    // 6. Verifica se a resposta do Google é válida
    if (!result.candidates || !result.candidates[0].content || !result.candidates[0].content.parts[0].text) {
      throw new Error("Resposta da API do Google inválida ou vazia.");
    }

    // 7. Extrai o JSON da resposta do Google
    const textResponse = result.candidates[0].content.parts[0].text;
    const jsonMatch = textResponse.match(/\{.*\}/s); // Encontra o JSON na resposta
    
    if (!jsonMatch) {
      throw new Error("Nenhum JSON válido encontrado na resposta do Google.");
    }

    const foodData = JSON.parse(jsonMatch[0]);

    // 8. Envia o JSON final (os dados do alimento) de volta para o seu app (index.html)
    res.status(200).json(foodData);

  } catch (error) {
    // 9. Se algo der errado, envia uma mensagem de erro
    console.error('Erro na Função Serverless (api/buscar-alimento.js):', error.message);
    res.status(500).json({ erro: 'Falha ao buscar dados na API externa.' });
  }
}

