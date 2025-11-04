import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const API_KEY = process.env.FATSECRET_API_KEY;
const API_SECRET = process.env.FATSECRET_API_SECRET;

const oauth = OAuth({
  consumer: { key: API_KEY, secret: API_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

export default async function handler(req, res) {
  const searchTerm = req.query.query;
  if (!searchTerm) {
    res.status(400).json({ error: 'Parâmetro query é obrigatório' });
    return;
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
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Erro na chamada API FatSecret:', error.message);
    res.status(500).json({ error: 'Erro ao consultar API FatSecret' });
  }
}
