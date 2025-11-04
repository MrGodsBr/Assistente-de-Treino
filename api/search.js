const express = require('express');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const app = express();
const port = 3000;

// Suas credenciais FatSecret
const API_KEY = '6fb81e1259ba496b88c7305a951fccd2';
const API_SECRET = 'b705e7d3c5b84c60baa02b7d1146d8e3';

const oauth = OAuth({
  consumer: { key: API_KEY, secret: API_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

app.get('/api/food-search', async (req, res) => {
  const searchTerm = req.query.query;
  if (!searchTerm) {
    return res.status(400).json({ error: 'Parâmetro query é obrigatório' });
  }

  const request_data = {
    url: 'https://platform.fatsecret.com/rest/server.api',
    method: 'GET',
     {
      method: 'foods.search',
      format: 'json',
      search_expression: searchTerm,
    }
  };

  const oauth_data = oauth.authorize(request_data);

  const params = {
    ...request_data.data,
    ...oauth_data
  };

  const queryString = new URLSearchParams(params).toString();
  const requestUrl = `${request_data.url}?${queryString}`;

  try {
    const response = await axios.get(requestUrl);
    res.json(response.data);
  } catch (error) {
    console.error('Erro na chamada API FatSecret:', error.message);
    res.status(500).json({ error: 'Erro ao consultar API FatSecret' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
