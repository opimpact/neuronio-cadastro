// api/cadastro.js - Versão Final Otimizada
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
    // 1. Processar contato (rápido - ~2s)
    console.log('Processando contato...');
    const contatoId = await processarContato(dados, API_KEY, API_BASE_URL);
    console.log('Contato processado, ID:', contatoId);

    // 2. Preparar lista de segmentações
    const todasSegmentacoes = prepararListaSegmentacoes(dados);
    console.log('Total de segmentações:', todasSegmentacoes.length);

    // 3. ESTRATÉGIA HÍBRIDA: Processar mais imediatamente
    const limite = todasSegmentacoes.length <= 6 ? todasSegmentacoes.length : 6;
    const segmentacoesImediatas = todasSegmentacoes.slice(0, limite);
    const segmentacoesBackground = todasSegmentacoes.slice(limite);
    
    console.log(`Processando ${segmentacoesImediatas.length} segmentações imediatamente...`);
    
    // 4. Processar segmentações prioritárias (até 10s)
    const segmentacoesIds = await criarSegmentacoesRapido(segmentacoesImediatas, API_KEY, API_BASE_URL);
    
    // 5. Inscrever nas segmentações prioritárias (até 5s)
    if (segmentacoesIds.length > 0) {
      console.log('Inscrevendo em segmentações prioritárias...');
      await inscreverRapido(contatoId, segmentacoesIds, API_KEY, API_BASE_URL);
    }

    // 6. Processar resto em background (não bloquear resposta)
    if (segmentacoesBackground.length > 0) {
      console.log(`Iniciando processamento background de ${segmentacoesBackground.length} segmentações...`);
      // Não usar await aqui - deixa rodar em background
      processarSegmentacoesBackground(contatoId, segmentacoesBackground, API_KEY, API_BASE_URL)
        .catch(error => console.error('Erro no background:', error));
    }

    // 7. Responder imediatamente ao usuário
    const mensagem = segmentacoesBackground.length > 0 
      ? `Cadastro realizado! ${segmentacoesIds.length} segmentações aplicadas imediatamente. ${segmentacoesBackground.length} sendo processadas em background.`
      : 'Cadastro realizado com sucesso em todas as segmentações!';

    return { 
      success: true, 
      contatoId, 
      segmentacoesImediatas: segmentacoesIds.length,
      segmentacoesTotal: todasSegmentacoes.length,
      temProcessamentoBackground: segmentacoesBackground.length > 0,
      message: mensagem
    };

  } catch (error) {
    console.error('Erro no cadastro:', error);
    throw error;
  }
}

function prepararListaSegmentacoes(dados) {
  const mapeamento = {
    // PRIORIDADE ALTA (processar primeiro)
    'setor-publico': 'Setor Público',
    'setor-privado': 'Setor Privado', 
    'setor-social': 'Setor Social',
    'empreendedor': 'Empreendedores',
    'consultor': 'Consultores',
    'estudante': 'Estudantes',
    'jornalista': 'Jornalistas',
    'pesquisador': 'Pesquisadores Acadêmicos',
    // PRIORIDADE BAIXA (processar depois)
    'investimento-social': 'Interesse: Investimento Social',
    'empreendedorismo': 'Interesse: Empreendedorismo',
    'inovacao': 'Interesse: Inovação',
    'saude': 'Interesse: Saúde',
    'sustentabilidade': 'Interesse: Sustentabilidade',
    'oportunidades-impacto': 'Interesse: Oportunidades de Impacto'
  };

  const segmentacoes = [];
  
  // Perfis profissionais primeiro (mais importantes)
  for (const perfil of dados.perfis || []) {
    if (mapeamento[perfil]) {
      segmentacoes.push(mapeamento[perfil]);
    }
  }

  // Interesses depois
  for (const interesse of dados.interesses || []) {
    if (mapeamento[interesse]) {
      segmentacoes.push(mapeamento[interesse]);
    }
  }

  // Institucional por último
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

async function criarSegmentacoesRapido(segmentacoes, API_KEY, API_BASE_URL) {
  const segmentacoesIds = [];

  for (let i = 0; i < segmentacoes.length; i++) {
    const nome = segmentacoes[i];
    console.log(`[PRIORITÁRIO ${i + 1}/${segmentacoes.length}] Processando: "${nome}"`);
    
    const id = await obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL);
    if (id) {
      segmentacoesIds.push(id);
      console.log(`✅ Segmentação prioritária "${nome}" processada: ${id}`);
    }
    
    // Delay menor para segmentações prioritárias (1s ao invés de 1.5s)
    if (i < segmentacoes.length - 1) {
      console.log('Aguardando 1s (modo prioritário)...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return segmentacoesIds;
}

async function inscreverRapido(contatoId, segmentacoes, API_KEY, API_BASE_URL) {
  console.log(`Inscrevendo rapidamente em ${segmentacoes.length} segmentações...`);
  
  for (let i = 0; i < segmentacoes.length; i++) {
    const segmentacaoId = segmentacoes[i];
    
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idGrupos: segmentacaoId
        })
      });

      if (response.ok) {
        console.log(`✅ Inscrito rapidamente: ${segmentacaoId}`);
      } else {
        const result = await response.json();
        console.warn(`⚠️ Erro rápido em ${segmentacaoId}:`, result.error?.message);
      }
    } catch (error) {
      console.error(`Erro inscrição rápida ${segmentacaoId}:`, error);
    }

    // Delay pequeno entre inscrições
    if (i < segmentacoes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function processarSegmentacoesBackground(contatoId, segmentacoes, API_KEY, API_BASE_URL) {
  console.log('=== PROCESSAMENTO BACKGROUND INICIADO ===');
  console.log('Contato:', contatoId);
  console.log('Segmentações restantes:', segmentacoes.length);
  
  try {
    // Processar segmentações restantes com delay completo (2s)
    const segmentacoesIds = [];

    for (let i = 0; i < segmentacoes.length; i++) {
      const nome = segmentacoes[i];
      console.log(`[BACKGROUND ${i + 1}/${segmentacoes.length}] Processando: "${nome}"`);
      
      const id = await obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL);
      if (id) {
        segmentacoesIds.push(id);
        console.log(`✅ Segmentação background "${nome}" processada: ${id}`);
      }
      
      // Delay completo de 2s conforme recomendação
      if (i < segmentacoes.length - 1) {
        console.log('Aguardando 2s (background)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Inscrever nas segmentações criadas em background
    if (segmentacoesIds.length > 0) {
      console.log(`Inscrevendo em ${segmentacoesIds.length} segmentações background...`);
      
      for (let i = 0; i < segmentacoesIds.length; i++) {
        const segmentacaoId = segmentacoesIds[i];
        
        try {
          const response = await fetchWithRetry(`${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idGrupos: segmentacaoId
            })
          });

          if (response.ok) {
            console.log(`✅ Inscrito background: ${segmentacaoId}`);
          } else {
            const result = await response.json();
            console.warn(`⚠️ Erro background ${segmentacaoId}:`, result.error?.message);
          }
        } catch (error) {
          console.error(`Erro inscrição background ${segmentacaoId}:`, error);
        }

        // Delay entre inscrições background
        if (i < segmentacoesIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    console.log('=== PROCESSAMENTO BACKGROUND CONCLUÍDO ===');
    console.log('Segmentações processadas em background:', segmentacoesIds.length);
    
  } catch (error) {
    console.error('Erro no processamento background:', error);
  }
}

async function obterOuCriarSegmentacao(nome, API_KEY, API_BASE_URL) {
  try {
    // Buscar existente
    const searchResponse = await fetchWithRetry(`${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}&nome=${encodeURIComponent(nome)}`);
    const searchResult = await searchResponse.json();

    if (searchResult.data && searchResult.data.length > 0) {
      console.log(`Segmentação "${nome}" já existe: ${searchResult.data[0].id}`);
      return searchResult.data[0].id;
    }

    // Criar nova
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
      
      if (response.status === 429) {
        console.log(`Rate limit atingido (tentativa ${attempt}), aguardando 3s...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempt++;
          continue;
        }
      }
      
      return response;
      
    } catch (error) {
      console.error(`Erro na tentativa ${attempt}:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        attempt++;
      } else {
        throw error;
      }
    }
  }
}

module.exports = async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
};
