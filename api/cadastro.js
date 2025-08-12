// api/cadastro.js - Versão Otimizada Final
const fetch = require('node-fetch');

async function cadastrarContato(dados) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const API_KEY = process.env.NITRONEWS_API_KEY;
  
  console.log('=== NOVA REQUISIÇÃO ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Email:', dados.email);
  
  if (!API_KEY) {
    throw new Error('Chave da API não configurada');
  }

  try {
    const startTime = Date.now();

    // 1. Processar contato (rápido - ~2s)
    console.log('Processando contato...');
    const contatoId = await processarContato(dados, API_KEY, API_BASE_URL);
    console.log('Contato processado, ID:', contatoId);

    // 2. Preparar TODAS as segmentações
    const todasSegmentacoes = prepararListaSegmentacoes(dados);
    console.log('Total de segmentações para processar:', todasSegmentacoes.length);

    // 3. Processar TODAS as segmentações seguindo recomendações oficiais
    console.log('Processando todas as segmentações com delays de 2s...');
    const segmentacoesIds = await criarTodasSegmentacoes(todasSegmentacoes, API_KEY, API_BASE_URL);
    
    // 4. Inscrever em TODAS as segmentações
    if (segmentacoesIds.length > 0) {
      console.log('Inscrevendo em todas as segmentações...');
      await inscreverEmTodasSegmentacoes(contatoId, segmentacoesIds, API_KEY, API_BASE_URL);
    }

    const endTime = Date.now();
    const totalTime = Math.round((endTime - startTime) / 1000);
    
    console.log(`=== PROCESSAMENTO CONCLUÍDO ===`);
    console.log(`Tempo total: ${totalTime}s`);
    console.log(`Segmentações processadas: ${segmentacoesIds.length}/${todasSegmentacoes.length}`);

    return { 
      success: true, 
      contatoId, 
      segmentacoesProcessadas: segmentacoesIds.length,
      segmentacoesTotal: todasSegmentacoes.length,
      tempoProcessamento: `${totalTime}s`,
      message: `Cadastro realizado com sucesso! Inscrito em ${segmentacoesIds.length} segmentações.`
    };

  } catch (error) {
    console.error('Erro no cadastro:', error);
    throw error;
  }
}

function prepararListaSegmentacoes(dados) {
  const mapeamento = {
    'setor-publico': 'Setor Público',
    'setor-privado': 'Setor Privado', 
    'setor-social': 'Setor Social',
    'empreendedor': 'Empreendedores',
    'consultor': 'Consultores',
    'estudante': 'Estudantes',
    'jornalista': 'Jornalistas',
    'pesquisador': 'Pesquisadores Acadêmicos',
    'investimento-social': 'Interesse: Investimento Social',
    'empreendedorismo': 'Interesse: Empreendedorismo',
    'inovacao': 'Interesse: Inovação',
    'saude': 'Interesse: Saúde',
    'sustentabilidade': 'Interesse: Sustentabilidade',
    'oportunidades-impacto': 'Interesse: Oportunidades de Impacto'
  };

  const segmentacoes = [];
  
  // Perfis profissionais
  for (const perfil of dados.perfis || []) {
    if (mapeamento[perfil]) {
      segmentacoes.push(mapeamento[perfil]);
    }
  }

  // Interesses
  for (const interesse of dados.interesses || []) {
    if (mapeamento[interesse]) {
      segmentacoes.push(mapeamento[interesse]);
    }
  }

  // Institucional
  if (dados.infoInstitucional) {
    segmentacoes.push('Informações Institucionais Neurônio');
  }

  return segmentacoes;
}

async function processarContato(dados, API_KEY, API_BASE_URL) {
  const contatoData = {
    nome: dados.nome,
    email: dados.email
  };

  const createResponse = await fetchWithRetry(`${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contatoData)
  });

  const contactResult = await createResponse.json();

  if (!createResponse.ok) {
    if (contactResult.error?.message?.includes('Já existe um contato com este email')) {
      console.log('Contato já existe, buscando...');
      const searchResponse = await fetchWithRetry(`${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`);
      const searchResult = await searchResponse.json();
      
      if (searchResult.data && searchResult.data.length > 0) {
        console.log('Contato encontrado:', searchResult.data[0].id);
        return searchResult.data[0].id;
      } else {
        throw new Error('Contato não encontrado');
      }
    } else {
      throw new Error(contactResult.error?.message || 'Erro ao criar contato');
    }
  } else {
    console.log('Novo contato criado:', contactResult.data.id);
    return contactResult.data.id;
  }
}

async function criarTodasSegmentacoes(segmentacoes, API_KEY, API_BASE_URL) {
  const segmentacoesIds = [];

  for (let i = 0; i < segmentacoes.length; i++) {
    const nome = segmentacoes[i];
    console.log(`[${i + 1}/${segmentacoes.length}] Processando: "${nome}"`);
    
    const id = await obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL);
    if (id) {
      segmentacoesIds.push(id);
      console.log(`✅ Segmentação "${nome}" processada: ${id}`);
    } else {
      console.log(`❌ Falha ao processar segmentação "${nome}"`);
    }
    
    // DELAY DE 2 SEGUNDOS conforme recomendação OFICIAL do Nitronews
    if (i < segmentacoes.length - 1) {
      console.log('Aguardando 2s (recomendação oficial)...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return segmentacoesIds;
}

async function inscreverEmTodasSegmentacoes(contatoId, segmentacoes, API_KEY, API_BASE_URL) {
  console.log(`Inscrevendo contato ${contatoId} em ${segmentacoes.length} segmentações...`);
  
  const sucesso = [];
  const erros = [];

  for (let i = 0; i < segmentacoes.length; i++) {
    const segmentacaoId = segmentacoes[i];
    console.log(`Inscrevendo [${i + 1}/${segmentacoes.length}]: ${segmentacaoId}`);
    
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idGrupos: segmentacaoId
        })
      });

      if (response.ok) {
        console.log(`✅ Inscrito em: ${segmentacaoId}`);
        sucesso.push(segmentacaoId);
      } else {
        const result = await response.json();
        console.warn(`⚠️ Erro ao inscrever em ${segmentacaoId}:`, result.error?.message);
        erros.push(segmentacaoId);
      }
    } catch (error) {
      console.error(`❌ Erro ao inscrever em ${segmentacaoId}:`, error.message);
      erros.push(segmentacaoId);
    }

    // Delay de 2s entre inscrições (mesmo delay para evitar rate limiting)
    if (i < segmentacoes.length - 1) {
      console.log('Aguardando 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`Inscrições concluídas: ${sucesso.length} sucessos, ${erros.length} erros`);
  return { sucesso, erros };
}

async function obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL) {
  try {
    // Buscar existente primeiro
    const searchResponse = await fetchWithRetry(`${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}&nome=${encodeURIComponent(nome)}`);
    const searchResult = await searchResponse.json();

    if (searchResult.data && searchResult.data.length > 0) {
      console.log(`Segmentação "${nome}" já existe: ${searchResult.data[0].id}`);
      return searchResult.data[0].id;
    }

    // Criar nova se não existir
    console.log(`Criando nova segmentação: "${nome}"`);
    const createResponse = await fetchWithRetry(`${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });

    const createResult = await createResponse.json();
    
    if (createResponse.ok) {
      console.log(`Nova segmentação "${nome}" criada: ${createResult.data.id}`);
      return createResult.data.id;
    } else {
      console.error(`Erro ao criar segmentação "${nome}":`, createResult.error?.message);
      return null;
    }

  } catch (error) {
    console.error(`Erro ao processar segmentação "${nome}":`, error);
    return null;
  }
}

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let attempt = 1;
  
  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, options);
      
      // Rate limiting específico - delay maior para recuperação
      if (response.status === 429) {
        console.log(`⚠️ Rate limit atingido (tentativa ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          const backoffDelay = 5000 + (attempt * 2000); // 5s, 7s, 9s
          console.log(`Aguardando ${backoffDelay/1000}s para retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          attempt++;
          continue;
        }
      }
      
      return response;
      
    } catch (error) {
      console.error(`❌ Erro na tentativa ${attempt}/${maxRetries}:`, error.message);
      if (attempt < maxRetries) {
        const retryDelay = 1000 * attempt; // 1s, 2s, 3s
        console.log(`Aguardando ${retryDelay/1000}s para retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const resultado = await cadastrarContato(req.body);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
