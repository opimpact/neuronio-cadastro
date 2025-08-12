// api/cadastro.js - Versão otimizada com rate limiting correto
async function cadastrarContato(dados) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const API_KEY = process.env.NITRONEWS_API_KEY;
  
  console.log('=== INICIO CADASTRO ===');
  console.log('Email:', dados.email);
  console.log('API_KEY length:', API_KEY ? API_KEY.length : 'undefined');
  
  if (!API_KEY) {
    throw new Error('Chave da API não configurada');
  }

  try {
    // 1. Processar contato primeiro
    const contatoId = await processarContato(dados, API_KEY, API_BASE_URL);
    console.log('Contato processado, ID:', contatoId);
    
    // 2. Processar segmentações com rate limiting inteligente
    const segmentacoes = await processarSegmentacoes(dados, API_KEY, API_BASE_URL);
    console.log('Segmentações criadas:', segmentacoes.length);
    
    // 3. Inscrever nas segmentações se existirem
    let inscricaoSucesso = false;
    if (segmentacoes.length > 0) {
      inscricaoSucesso = await inscreverNasSegmentacoes(contatoId, segmentacoes, API_KEY, API_BASE_URL);
    }

    console.log('=== CADASTRO CONCLUÍDO ===');
    return { 
      success: true, 
      contatoId, 
      segmentacoes: segmentacoes.length,
      inscrito: inscricaoSucesso,
      message: `Cadastro realizado com sucesso! Contato adicionado a ${segmentacoes.length} segmentação(ões).`
    };

  } catch (error) {
    console.error('=== ERRO NO CADASTRO ===');
    console.error('Mensagem:', error.message);
    throw error;
  }
}

async function processarContato(dados, API_KEY, API_BASE_URL) {
  console.log('Processando contato...');
  
  // Buscar contato existente primeiro
  try {
    const searchUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`;
    const searchResponse = await fetchComRateLimit(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Neuronio-Form/1.0'
      }
    });

    if (searchResponse.ok) {
      const searchText = await searchResponse.text();
      if (searchText.trim().startsWith('{')) {
        const searchResult = JSON.parse(searchText);
        if (searchResult.data && searchResult.data.length > 0) {
          console.log('Contato encontrado:', searchResult.data[0].id);
          return searchResult.data[0].id;
        }
      }
    }
  } catch (error) {
    console.warn('Erro na busca de contato:', error.message);
  }

  // Se não encontrou, criar novo contato
  console.log('Criando novo contato...');
  const createUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}`;
  
  const createResponse = await fetchComRateLimit(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Neuronio-Form/1.0'
    },
    body: JSON.stringify({
      nome: dados.nome,
      email: dados.email
    })
  });

  const responseText = await createResponse.text();
  
  if (responseText.trim().startsWith('{')) {
    const result = JSON.parse(responseText);
    
    if (createResponse.ok && result.data?.id) {
      console.log('Novo contato criado:', result.data.id);
      return result.data.id;
    } else if (result.error?.message?.includes('Já existe um contato com este email')) {
      // Tentar buscar novamente se já existe
      const searchUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`;
      const searchResponse = await fetchComRateLimit(searchUrl);
      const searchText = await searchResponse.text();
      
      if (searchText.trim().startsWith('{')) {
        const searchResult = JSON.parse(searchText);
        if (searchResult.data && searchResult.data.length > 0) {
          return searchResult.data[0].id;
        }
      }
    }
  }
  
  throw new Error('Não foi possível criar ou encontrar o contato');
}

async function processarSegmentacoes(dados, API_KEY, API_BASE_URL) {
  console.log('Iniciando processamento de segmentações...');
  
  // Mapear seleções para nomes de segmentações
  const segmentacoesDesejadas = [];
  
  // Perfis profissionais
  const mapaPerfis = {
    'setor-publico': 'Setor Público',
    'setor-privado': 'Setor Privado',
    'setor-social': 'Setor Social',
    'empreendedor': 'Empreendedores',
    'consultor': 'Consultores',
    'estudante': 'Estudantes',
    'jornalista': 'Jornalistas',
    'pesquisador': 'Pesquisadores Acadêmicos'
  };
  
  for (const perfil of dados.perfis || []) {
    if (mapaPerfis[perfil]) {
      segmentacoesDesejadas.push(mapaPerfis[perfil]);
    }
  }
  
  // Temas de interesse
  const mapaInteresses = {
    'investimento-social': 'Interesse: Investimento Social',
    'empreendedorismo': 'Interesse: Empreendedorismo',
    'inovacao': 'Interesse: Inovação',
    'saude': 'Interesse: Saúde',
    'sustentabilidade': 'Interesse: Sustentabilidade',
    'oportunidades-impacto': 'Interesse: Oportunidades de Impacto'
  };
  
  for (const interesse of dados.interesses || []) {
    if (mapaInteresses[interesse]) {
      segmentacoesDesejadas.push(mapaInteresses[interesse]);
    }
  }
  
  // Informações institucionais
  if (dados.infoInstitucional) {
    segmentacoesDesejadas.push('Informações Institucionais Neurônio');
  }
  
  console.log(`Total de segmentações para processar: ${segmentacoesDesejadas.length}`);
  console.log('Segmentações:', segmentacoesDesejadas);
  
  const segmentacoesCriadas = [];
  
  // Processar cada segmentação com delay adequado
  for (let i = 0; i < segmentacoesDesejadas.length; i++) {
    const nomeSegmentacao = segmentacoesDesejadas[i];
    console.log(`[${i + 1}/${segmentacoesDesejadas.length}] Processando: "${nomeSegmentacao}"`);
    
    try {
      const segmentacaoId = await obterOuCriarSegmentacao(nomeSegmentacao, API_KEY, API_BASE_URL);
      if (segmentacaoId) {
        segmentacoesCriadas.push(segmentacaoId);
        console.log(`✅ Segmentação "${nomeSegmentacao}" processada: ${segmentacaoId}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao processar "${nomeSegmentacao}":`, error.message);
    }
    
    // Delay entre segmentações (respeitando rate limit)
    if (i < segmentacoesDesejadas.length - 1) {
      console.log('Aguardando 2 segundos...');
      await sleep(2000);
    }
  }
  
  return segmentacoesCriadas;
}

async function obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL) {
  // Primeiro, buscar se já existe
  try {
    const searchUrl = `${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}&nome=${encodeURIComponent(nome)}`;
    const searchResponse = await fetchComRateLimit(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Neuronio-Form/1.0'
      }
    });

    if (searchResponse.ok) {
      const searchText = await searchResponse.text();
      if (searchText.trim().startsWith('{')) {
        const searchResult = JSON.parse(searchText);
        if (searchResult.data && searchResult.data.length > 0) {
          console.log(`Segmentação "${nome}" já existe:`, searchResult.data[0].id);
          return searchResult.data[0].id;
        }
      }
    }
  } catch (error) {
    console.warn(`Erro ao buscar segmentação "${nome}":`, error.message);
  }

  // Se não existe, criar nova
  console.log(`Criando nova segmentação: "${nome}"`);
  const createUrl = `${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}`;
  
  const createResponse = await fetchComRateLimit(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Neuronio-Form/1.0'
    },
    body: JSON.stringify({ nome })
  });

  const responseText = await createResponse.text();
  
  if (responseText.trim().startsWith('{')) {
    const result = JSON.parse(responseText);
    if (createResponse.ok && result.data?.id) {
      console.log(`Nova segmentação "${nome}" criada:`, result.data.id);
      return result.data.id;
    }
  }
  
  return null;
}

async function inscreverNasSegmentacoes(contatoId, segmentacoes, API_KEY, API_BASE_URL) {
  if (segmentacoes.length === 0) return false;
  
  console.log(`Inscrevendo contato ${contatoId} nas ${segmentacoes.length} segmentações...`);
  
  try {
    const inscricaoUrl = `${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`;
    
    const inscricaoResponse = await fetchComRateLimit(inscricaoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Neuronio-Form/1.0'
      },
      body: JSON.stringify({
        idGrupos: segmentacoes.join(', ')
      })
    });

    if (inscricaoResponse.ok) {
      console.log('✅ Inscrição realizada com sucesso');
      return true;
    } else {
      console.warn('⚠️ Problema na inscrição, status:', inscricaoResponse.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro na inscrição:', error.message);
    return false;
  }
}

async function fetchComRateLimit(url, options = {}, maxRetries = 3) {
  for (let tentativa = 1; tentativa <= maxRetries; tentativa++) {
    try {
      console.log(`Fazendo requisição (tentativa ${tentativa}): ${url.substring(0, 70)}...`);
      
      const response = await fetch(url, options);
      
      // Se recebeu 429 (rate limit), aguardar mais tempo
      if (response.status === 429) {
        const waitTime = tentativa * 3000; // 3s, 6s, 9s
        console.log(`⚠️ Rate limit detectado (429). Aguardando ${waitTime}ms antes de tentar novamente...`);
        await sleep(waitTime);
        continue;
      }
      
      // Para outros erros HTTP, retornar a resposta
      return response;
      
    } catch (error) {
      console.warn(`Tentativa ${tentativa} falhou:`, error.message);
      
      if (tentativa === maxRetries) {
        throw error;
      }
      
      // Aguardar antes da próxima tentativa
      await sleep(tentativa * 1000);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      details: 'Verifique os logs para mais detalhes.'
    });
  }
};
