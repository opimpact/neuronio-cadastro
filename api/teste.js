// api/teste.js - Endpoint simples para testar
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const API_KEY = process.env.NITRONEWS_API_KEY;
    
    console.log('=== TESTE SIMPLES ===');
    console.log('API_KEY existe?', !!API_KEY);
    console.log('API_KEY length:', API_KEY ? API_KEY.length : 'undefined');
    console.log('Método:', req.method);
    console.log('Body:', req.body);
    
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'OK',
        apiKey: !!API_KEY,
        apiKeyLength: API_KEY ? API_KEY.length : 0,
        message: 'Teste simples funcionando'
      });
    }
    
    if (req.method === 'POST') {
      // Teste simples de criação de contato
      const testData = {
        nome: 'Teste API',
        email: 'teste@teste.com'
      };
      
      const response = await fetch(`https://api.criaenvio.com/v1/contatos?chave=${encodeURIComponent(API_KEY)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });
      
      const result = await response.json();
      
      console.log('Resposta da API:', response.status, result);
      
      return res.status(200).json({
        status: 'Teste POST',
        apiResponse: {
          status: response.status,
          data: result
        },
        message: 'Teste de criação executado'
      });
    }
    
    return res.status(405).json({ error: 'Método não permitido' });
    
  } catch (error) {
    console.error('Erro no teste:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
};
