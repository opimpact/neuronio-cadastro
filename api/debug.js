// api/debug.js - Endpoint para debug
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const debug = {
      method: req.method,
      headers: req.headers,
      body: req.body,
      env: {
        nodeVersion: process.version,
        platform: process.platform,
        hasApiKey: !!process.env.NITRONEWS_API_KEY,
        apiKeyLength: process.env.NITRONEWS_API_KEY ? process.env.NITRONEWS_API_KEY.length : 0
      },
      fetchAvailable: typeof fetch !== 'undefined'
    };

    if (req.method === 'POST') {
      // Teste simples de fetch
      try {
        const testUrl = 'https://api.criaenvio.com/v1/contatos?chave=' + encodeURIComponent(process.env.NITRONEWS_API_KEY);
        console.log('Testando URL:', testUrl.substring(0, 50) + '...');
        
        const response = await fetch(testUrl);
        console.log('Response status:', response.status);
        
        const text = await response.text();
        console.log('Response text (first 100 chars):', text.substring(0, 100));
        
        debug.fetchTest = {
          status: response.status,
          textLength: text.length,
          isJson: text.startsWith('{') || text.startsWith('[')
        };
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        debug.fetchError = fetchError.message;
      }
    }

    return res.status(200).json(debug);
  } catch (error) {
    console.error('Debug error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
};
