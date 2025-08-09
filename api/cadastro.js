// api/cadastro.js - Backend corrigido para Vercel
async function cadastrarContato(dados) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const API_KEY = process.env.NITRONEWS_API_KEY;
  
  console.log('=== INICIO CADASTRO ===');
  console.log('Email:', dados.email);
  console.log('API_KEY existe:', !!API_KEY);
  
  if (!API_KEY) {
    throw new Error('Chave da API não configurada');
  }

  try {
    // 1. Criar contato
    const contatoData = {
      nome: dados.nome,
      email: dados.email
    };

    console.log('Dados para criar:', contatoData);
    const createUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}`;
    console.log('URL da requisição:', createUrl.substring(0, 50) + '...');

    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Neuronio-Form/1.0'
      },
      body: JSON.stringify(contatoData)
    });

    console.log('Status da resposta:', createResponse.status);
    console.log('Headers da resposta:', Object.fromEntries(createResponse.headers.entries()));

    let responseText;
    try {
      responseText = await createResponse.text();
      console.log('Texto da resposta:', responseText.substring(0, 200));
    } catch (e) {
      console.error('Erro ao ler resposta:', e);
      throw new Error('Erro ao ler resposta da API');
    }

    let contactResult;
    try {
      contactResult = JSON.parse(responseText);
    } catch (e) {
      console.error('Erro ao fazer parse JSON:', e);
      console.error('Resposta recebida:', responseText);
      throw new Error('API retornou resposta inválida: ' + responseText.substring(0, 100));
    }

    let contatoId;

    if (!createResponse.ok) {
      if (contactResult.error?.message?.includes('Já existe um contato com este email')) {
        console.log('Contato já existe, buscando...');
        const searchUrl = `${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`;
        
        const searchResponse = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Neuronio-Form/1.0'
          }
        });
        
        const searchText = await searchResponse.text();
        const searchResult = JSON.parse(searchText);
        
        if (searchResult.data && searchResult.data.length > 0) {
          contatoId = searchResult.data[0].id;
          console.log('Contato encontrado, ID:', contatoId);
        } else {
          throw new Error('Contato não encontrado após busca');
        }
      } else {
        console.error('Erro da API:', contactResult);
        throw new Error(contactResult.error?.message || 'Erro ao criar contato: ' + createResponse.status);
      }
    } else {
      contatoId = contactResult.data.id;
      console.log('Novo contato criado, ID:', contatoId);
    }

    // 2. Criar segmentações
    console.log('Criando segmentações...');
    const segmentacoes = await criarSegmentacoes(dados, API_KEY);
    console.log('Segmentações criadas:', segmentacoes.length);
    
    // 3. Inscrever nas segmentações
    if (segmentacoes.length > 0) {
      console.log('Inscrevendo nas segmentações...');
      const inscricaoUrl = `${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`;
      
      const inscricaoResponse = await fetch(inscricaoUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Neuronio-Form/1.0'
        },
        body: JSON.stringify({
          idGrupos: segmentacoes.join(',')
        })
      });

      if (!inscricaoResponse.ok) {
        const inscricaoText = await inscricaoResponse.text();
        console.warn('Aviso segmentações:', inscricaoText);
      } else {
        console.log('Inscrito com sucesso nas segmentações');
      }
    }

    console.log('=== CADASTRO CONCLUÍDO ===');
    return { 
      success: true, 
      contatoId, 
      segmentacoes: segmentacoes.length,
      message: 'Cadastro realizado com sucesso!'
    };

  } catch (error) {
    console.error('=== ERRO NO CADASTRO ===');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

async function criarSegmentacoes(dados, API_KEY) {
  const segmentacoesIds = [];
  
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

  // Perfis
  for (const perfil of dados.perfis || []) {
    if (mapeamento[perfil]) {
      const id = await obterOuCriarSegmentacao(mapeamento[perfil], API_KEY);
      if (id) segmentacoesIds.push(id);
    }
  }

  // Interesses
  for (const interesse of dados.interesses || []) {
    if (mapeamento[interesse]) {
      const id = await obterOuCriarSegmentacao(mapeamento[interesse], API_KEY);
      if (id) segmentacoesIds.push(id);
    }
  }

  // Institucional
  if (dados.infoInstitucional) {
    const id = await obterOuCriarSegmentacao('Informações Institucionais Neurônio', API_KEY);
    if (id) segmentacoesIds.push(id);
  }

  return segmentacoesIds;
}

async function obterOuCriarSegmentacao(nome, API_KEY) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';

  try {
    // Buscar existente
    const searchUrl = `${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}&nome=${encodeURIComponent(nome)}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Neuronio-Form/1.0'
      }
    });
    
    const searchText = await searchResponse.text();
    const searchResult = JSON.parse(searchText);

    if (searchResult.data && searchResult.data.length > 0) {
      console.log(`Segmentação "${nome}" já existe`);
      return searchResult.data[0].id;
    }

    // Criar nova
    console.log(`Criando segmentação: "${nome}"`);
    const createUrl = `${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}`;
    
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Neuronio-Form/1.0'
      },
      body: JSON.stringify({ nome })
    });

    if (createResponse.ok) {
      const createText = await createResponse.text();
      const createResult = JSON.parse(createText);
      console.log(`Segmentação "${nome}" criada com ID:`, createResult.data.id);
      return createResult.data.id;
    } else {
      const errorText = await createResponse.text();
      console.error(`Erro ao criar segmentação "${nome}":`, errorText);
    }

  } catch (error) {
    console.error(`Erro ao processar segmentação "${nome}":`, error);
  }
  return null;
}

module.exports = async (req, res) => {
  // Configurar CORS
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
    console.log('=== NOVA REQUISIÇÃO ===');
    console.log('Headers:', req.headers);
    console.log('Body recebido:', JSON.stringify(req.body, null, 2));
    
    const resultado = await cadastrarContato(req.body);
    console.log('Resultado final:', resultado);
    
    res.status(200).json(resultado);
  } catch (error) {
    console.error('=== ERRO NA API ===');
    console.error('Erro:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'Verifique os logs para mais informações'
    });
  }
};
