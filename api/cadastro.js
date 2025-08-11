// api/cadastro.js - Versão final com melhor compatibilidade
async function cadastrarContato(dados) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const API_KEY = process.env.NITRONEWS_API_KEY;
  
  console.log('=== INICIO CADASTRO ===');
  console.log('Email:', dados.email);
  console.log('API_KEY length:', API_KEY ? API_KEY.length : 'undefined');
  
  if (!API_KEY) {
    throw new Error('Chave da API não configurada');
  }

  // Aguardar um pouco para evitar rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 1. Criar contato com retry
    const contatoData = {
      nome: dados.nome,
      email: dados.email
    };

    console.log('Tentando criar contato:', contatoData);
    let contactResult;
    let contatoId;

    // Primeiro, vamos tentar buscar se o contato já existe
    try {
      const searchUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`;
      console.log('Buscando contato existente...');
      
      const searchResponse = await fetchWithRetry(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (searchResponse.ok) {
        const searchText = await searchResponse.text();
        console.log('Resposta busca (primeiros 200 chars):', searchText.substring(0, 200));
        
        if (searchText.trim().startsWith('{')) {
          const searchResult = JSON.parse(searchText);
          if (searchResult.data && searchResult.data.length > 0) {
            contatoId = searchResult.data[0].id;
            console.log('Contato encontrado, ID:', contatoId);
          }
        }
      }
    } catch (searchError) {
      console.warn('Erro na busca, tentando criar:', searchError.message);
    }

    // Se não encontrou, tentar criar
    if (!contatoId) {
      console.log('Criando novo contato...');
      const createUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}`;
      
      const createResponse = await fetchWithRetry(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(contatoData)
      });

      const responseText = await createResponse.text();
      console.log('Resposta criação (primeiros 200 chars):', responseText.substring(0, 200));
      console.log('Status:', createResponse.status);

      if (responseText.trim().startsWith('{')) {
        contactResult = JSON.parse(responseText);
        
        if (createResponse.ok) {
          contatoId = contactResult.data.id;
          console.log('Novo contato criado, ID:', contatoId);
        } else if (contactResult.error?.message?.includes('Já existe um contato com este email')) {
          console.log('Contato já existe (via erro), tentando buscar novamente...');
          // Tentar buscar novamente
          const searchUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`;
          const searchResponse = await fetchWithRetry(searchUrl);
          const searchText = await searchResponse.text();
          
          if (searchText.trim().startsWith('{')) {
            const searchResult = JSON.parse(searchText);
            if (searchResult.data && searchResult.data.length > 0) {
              contatoId = searchResult.data[0].id;
            }
          }
        }
      } else {
        console.error('API retornou HTML em vez de JSON');
        throw new Error('Erro na comunicação com API: resposta em formato inválido');
      }
    }

    if (!contatoId) {
      throw new Error('Não foi possível obter ou criar contato');
    }

    // 2. Criar segmentações (simplificado)
    const segmentacoes = await criarSegmentacoesSimples(dados, API_KEY);
    console.log('Segmentações processadas:', segmentacoes.length);
    
    // 3. Inscrever nas segmentações se existirem
    if (segmentacoes.length > 0) {
      try {
        console.log('Inscrevendo nas segmentações...');
        const inscricaoUrl = `${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`;
        
        const inscricaoResponse = await fetchWithRetry(inscricaoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({
            idGrupos: segmentacoes.join(', ')
          })
        });

        if (inscricaoResponse.ok) {
          console.log('Inscrito com sucesso nas segmentações');
        } else {
          console.warn('Aviso ao inscrever nas segmentações:', inscricaoResponse.status);
        }
      } catch (inscricaoError) {
        console.warn('Erro na inscrição em segmentações:', inscricaoError.message);
      }
    }

    console.log('=== CADASTRO CONCLUÍDO ===');
    return { 
      success: true, 
      contatoId, 
      segmentacoes: segmentacoes.length,
      message: 'Cadastro realizado com sucesso! Contato adicionado às segmentações selecionadas.'
    };

  } catch (error) {
    console.error('=== ERRO NO CADASTRO ===');
    console.error('Mensagem:', error.message);
    throw error;
  }
}

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i > 0) {
        console.log(`Tentativa ${i + 1} de ${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
      
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      console.warn(`Tentativa ${i + 1} falhou:`, error.message);
      if (i === maxRetries - 1) {
        throw error;
      }
    }
  }
}

async function criarSegmentacoesSimples(dados, API_KEY) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const segmentacoesIds = [];
  
  // Lista de segmentações possíveis
  const segmentacoesPossiveis = [
    // Perfis
    ...(dados.perfis || []).map(p => {
      const map = {
        'setor-publico': 'Setor Público',
        'setor-privado': 'Setor Privado', 
        'setor-social': 'Setor Social',
        'empreendedor': 'Empreendedores',
        'consultor': 'Consultores',
        'estudante': 'Estudantes',
        'jornalista': 'Jornalistas',
        'pesquisador': 'Pesquisadores Acadêmicos'
      };
      return map[p];
    }).filter(Boolean),
    
    // Interesses
    ...(dados.interesses || []).map(i => {
      const map = {
        'investimento-social': 'Interesse: Investimento Social',
        'empreendedorismo': 'Interesse: Empreendedorismo',
        'inovacao': 'Interesse: Inovação',
        'saude': 'Interesse: Saúde',
        'sustentabilidade': 'Interesse: Sustentabilidade',
        'oportunidades-impacto': 'Interesse: Oportunidades de Impacto'
      };
      return map[i];
    }).filter(Boolean),
    
    // Institucional
    ...(dados.infoInstitucional ? ['Informações Institucionais Neurônio'] : [])
  ];

  console.log('Segmentações a criar/buscar:', segmentacoesPossiveis);

  // Para cada segmentação, tentar criar ou buscar (simplificado)
  for (const nomeSegmentacao of segmentacoesPossiveis) {
    try {
      
      // Buscar primeiro se a segmentação já existe
      console.log(`Processando segmentação: "${nomeSegmentacao}"`);
      const createUrl = `${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}`;
      
      const createResponse = await fetchWithRetry(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ nome: nomeSegmentacao })
      });

      const responseText = await createResponse.text();
      
      if (responseText.trim().startsWith('{')) {
        const result = JSON.parse(responseText);
        if (createResponse.ok && result.data?.id) {
          segmentacoesIds.push(result.data.id);
          console.log(`Segmentação "${nomeSegmentacao}" criada:`, result.data.id);
        }
      }
    } catch (error) {
      console.warn(`Erro ao processar segmentação "${nomeSegmentacao}":`, error.message);
    }
    
    // Pequena pausa entre requisições
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return segmentacoesIds;
}

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    console.log('=== NOVA REQUISIÇÃO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const resultado = await cadastrarContato(req.body);
    console.log('Resultado final:', resultado);
    
    res.status(200).json(resultado);
  } catch (error) {
    console.error('=== ERRO NA API ===');
    console.error('Erro:', error.message);
    res.status(500).json({ 
      error: error.message,
      success: false,
      details: 'O cadastro pode ter sido parcialmente processado. Verifique no Nitronews.'
    });
  }
};
