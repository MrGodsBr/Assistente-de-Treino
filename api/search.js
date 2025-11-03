// api/search.js
// Esta Vercel Function é responsável por fazer a busca segura no FatSecret
// usando as chaves de ambiente do Vercel.

// Importações necessárias para Node.js no ambiente Serverless do Vercel.
// Certifique-se de que 'node-fetch' e 'oauth-1.0a' estão instalados no seu package.json.
import fetch from 'node-fetch';
import OAuth from 'oauth-1.0a';
import { createHmac } from 'crypto';

// URL base da API do FatSecret
const FATSECRET_URL = 'http://platform.fatsecret.com/rest/server.api';

// Função auxiliar para calcular o SHA1, exigida pelo pacote oauth-1.0a
const calculateSignature = (signatureBaseString, signingKey) => {
  // Use createHmac do módulo 'crypto' nativo do Node.js
  return createHmac('sha1', signingKey).update(signatureBaseString).digest('base64');
};

// A principal função Serverless (Vercel Function)
export default async function (req, res) {
  // Configuração CORS (Crucial para permitir que seu frontend chame esta API)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Trata requisições OPTIONS (pré-voo CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Pega as chaves seguras das Vercel Environment Variables
  const CLIENT_KEY = process.env.FATSECRET_CLIENT_ID;
  const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;
  
  // A requisição GET do seu frontend deve ter a query
  const { query } = req.query;

  // Verifica se a chave e o termo de busca existem
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Chaves da API FatSecret não configuradas no servidor.' });
  }
  if (!query) {
    return res.status(400).json({ error: 'Termo de busca (query) é obrigatório.' });
  }

  try {
    // 1. Configurações OAuth 1.0a
    const oauth = new OAuth({
        consumer: {
            key: CLIENT_KEY,
            secret: CLIENT_SECRET
        },
        signature_method: 'HMAC-SHA1',
        hash_function: calculateSignature
    });
    
    // 2. Parâmetros da Requisição FatSecret (foods.search)
    const requestData = {
        url: FATSECRET_URL,
        method: 'POST', // O FatSecret exige POST para foods.search
        data: {
            method: 'foods.search',
            search_expression: query,
            format: 'json',
            max_results: 10,
            region: 'BR'
        }
    };
    
    // 3. Formata o corpo da requisição POST (incluindo parâmetros OAuth no corpo)
    const formData = new URLSearchParams();
    
    // Adiciona os parâmetros obrigatórios da API (method, query, format, etc.)
    for (const key in requestData.data) {
        formData.append(key, requestData.data[key]);
    }
    
    // Adiciona parâmetros OAuth (nonce, timestamp, signature, etc.)
    const oauthParams = oauth.authorize(requestData);
    for (const key in oauthParams) {
        formData.append(key, oauthParams[key]);
    }

    // 4. Faz a Chamada de API Real (e segura)
    const response = await fetch(FATSECRET_URL, {
        method: 'POST',
        headers: {
            // O tipo de conteúdo deve ser application/x-www-form-urlencoded para o FatSecret
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
    });

    const data = await response.json();
    
    // 5. TRATAMENTO DE ERROS e Mapeamento
    if (data.error) {
         console.error('FatSecret API Error:', data.error);
         return res.status(500).json({ error: `Erro da API FatSecret: ${data.error.message}` });
    }
    
    const foods = data.foods?.food;
    if (!foods) {
        return res.status(200).json({ results: [] });
    }

    // O FatSecret retorna um array, mas se for 1 resultado, pode ser um objeto. Garante que é um array.
    const foodsArray = Array.isArray(foods) ? foods : [foods];

    // Mapeamos o resultado do FatSecret para o formato do seu app.
    const mappedResults = foodsArray.map(food => {
        const description = food.food_description || ''; 
        
        // Tentativa de extrair valores da string de descrição. 
        // Esta extração é frágil, mas evita uma segunda chamada 'food.get'.
        const calsMatch = description.match(/(\d+) kcal/);
        const protMatch = description.match(/(\d+\.?\d*)g de proteína/);
        const carbMatch = description.match(/(\d+\.?\d*)g de carboidratos/);
        
        return {
            type: 'fatsecret',
            key: food.food_id,
            name: food.food_name,
            unit: 'serv. padrão (FS)', // Unidade Padrão do FatSecret
            
            // Tenta extrair valores, senão usa 0
            cals: calsMatch ? parseInt(calsMatch[1]) : 0,
            protein: protMatch ? parseFloat(protMatch[1]) : 0,
            carbs: carbMatch ? parseFloat(carbMatch[1]) : 0,
            
            visceralFat: false // Informação indisponível no FatSecret
        };
    });

    // 6. Retorna o array de resultados mapeados
    res.status(200).json({ results: mappedResults });

  } catch (error) {
    console.error('Erro na Vercel Function:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar alimentos.' });
  }
}
