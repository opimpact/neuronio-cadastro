// api/cadastro.js - Backend para integração com Nitronews
const fetch = require('node-fetch');

async function cadastrarContato(dados) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';
  const API_KEY = process.env.NITRONEWS_API_KEY;
  
  console.log('Iniciando cadastro para:', dados.email);
  
  if (!API_KEY) {
    throw new Error('Chave da API não configurada no servidor');
  }

  try {
    // 1. Criar ou atualizar contato
    const contatoData = {
      nome: dados.nome,
      email: dados.email
    };

    console.log('Criando contato:', contatoData);

    const createResponse = await fetch(`${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contatoData)
    });

    const contactResult = await createResponse.json();
    let contatoId;

    if (!createResponse.ok) {
      // Se contato já existe, buscar ID
      if (contactResult.error?.message?.includes('Já existe um contato com este email')) {
        console.log('Contato já existe, buscando ID...');
        const searchResponse = await fetch(`${API_BASE_URL}/contatos?chave=${encodeURIComponent(API_KEY)}&email=${encodeURIComponent(dados.email)}`);
        const searchResult = await searchResponse.json();
        
        if (searchResult.data && searchResult.data.length > 0) {
          contatoId = searchResult.data[0].id;
          console.log('Contato encontrado, ID:', contatoId);
        } else {
          throw new Error('Não foi possível encontrar o contato existente');
        }
      } else {
        throw new Error(contactResult.error?.message || 'Erro ao criar contato');
      }
    } else {
      contatoId = contactResult.data.id;
      console.log('Novo contato criado, ID:', contatoId);
    }

    // 2. Criar segmentações baseadas nas respostas
    const segmentacoes = await criarSegmentacoes(dados, API_KEY);
    console.log('Segmentações criadas:', segmentacoes);
    
    // 3. Inscrever nas segmentações
    if (segmentacoes.length > 0) {
      console.log('Inscrevendo nas segmentações...');
      const inscricaoResponse = await fetch(`${API_BASE_URL}/contatos/${contatoId}/inscrever?chave=${encodeURIComponent(API_KEY)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idGrupos: segmentacoes.join(', ')
        })
      });

      if (!inscricaoResponse.ok) {
        const inscricaoResult = await inscricaoResponse.json();
        console.warn('Aviso ao inscrever em segmentações:', inscricaoResult.error?.message);
      } else {
        console.log('Inscrito com sucesso nas segmentações');
      }
    }

    return { 
      success: true, 
      contatoId, 
      segmentacoes,
      message: 'Cadastro realizado com sucesso!'
    };

  } catch (error) {
    console.error('Erro no cadastro:', error);
    throw error;
  }
}

async function criarSegmentacoes(dados, API_KEY) {
  const segmentacoesIds = [];
  
  // Mapeamento de perfis e interesses para nomes de segmentação
  const mapeamentoSegmentacoes = {
    // Perfis
    'setor-publico': 'Setor Público',
    'setor-privado': 'Setor Privado', 
    'setor-social': 'Setor Social',
    'empreendedor': 'Empreendedores',
    'consultor': 'Consultores',
    'estudante': 'Estudantes',
    'jornalista': 'Jornalistas',
    'pesquisador': 'Pesquisadores Acadêmicos',
    
    // Interesses
    'investimento-social': 'Interesse: Investimento Social',
    'empreendedorismo': 'Interesse: Empreendedorismo',
    'inovacao': 'Interesse: Inovação',
    'saude': 'Interesse: Saúde',
    'sustentabilidade': 'Interesse: Sustentabilidade',
    'oportunidades-impacto': 'Interesse: Oportunidades de Impacto',
    
    // Institucional
    'info-institucional': 'Informações Institucionais Neurônio'
  };

  // Criar segmentações para perfis selecionados
  for (const perfil of dados.perfis || []) {
    if (mapeamentoSegmentacoes[perfil]) {
      const segmentacaoId = await obterOuCriarSegmentacao(mapeamentoSegmentacoes[perfil], API_KEY);
      if (segmentacaoId) segmentacoesIds.push(segmentacaoId);
    }
  }

  // Criar segmentações para interesses selecionados  
  for (const interesse of dados.interesses || []) {
    if (mapeamentoSegmentacoes[interesse]) {
      const segmentacaoId = await obterOuCriarSegmentacao(mapeamentoSegmentacoes[interesse], API_KEY);
      if (segmentacaoId) segmentacoesIds.push(segmentacaoId);
    }
  }

  // Informações institucionais
  if (dados.infoInstitucional) {
    const segmentacaoId = await obterOuCriarSegmentacao(mapeamentoSegmentacoes['info-institucional'], API_KEY);
    if (segmentacaoId) segmentacoesIds.push(segmentacaoId);
  }

  return segmentacoesIds;
}

async function obterOuCriarSegmentacao(nomeSegmentacao, API_KEY) {
  const API_BASE_URL = 'https://api.criaenvio.com/v1';

  try {
    // Buscar segmentação existente
    const searchResponse = await fetch(`${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}&nome=${encodeURIComponent(nomeSegmentacao)}`);
    const searchResult = await searchResponse.json();

    if (searchResult.data && searchResult.data.length > 0) {
      console.log(`Segmentação "${nomeSegmentacao}" já existe`);
      return searchResult.data[0].id;
    }

    // Criar nova segmentação se não existir
    console.log(`Criando nova segmentação: "${nomeSegmentacao}"`);
    const createResponse = await fetch(`${API_BASE_URL}/grupos?chave=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nome: nomeSegmentacao
      })
    });

    const createResult = await createResponse.json();
    
    if (createResponse.ok) {
      console.log(`Segmentação "${nomeSegmentacao}" criada com ID:`, createResult.data.id);
      return createResult.data.id;
    } else {
      console.error('Erro ao criar segmentação:', createResult.error?.message);
      return null;
    }

  } catch (error) {
    console.error('Erro ao obter/criar segmentação:', error);
    return null;
  }
}

// Função principal do Vercel
module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    console.log('Recebendo requisição de cadastro:', req.body);
    const resultado = await cadastrarContato(req.body);
    res.status(200).json(resultado);
  } catch (error) {
    console.error('Erro na API:', error);
    res.status(500).json({ error: error.message });
  }
};
