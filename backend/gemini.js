import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// Candidate models to try when a requested model isn't available for this API/version.
// Updated to use models confirmed available from ModelService.ListModels
const MODEL_CANDIDATES = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-omni-flash-preview'
];

async function generateWithFallback(makeContents, generationConfig = { responseMimeType: 'application/json' }, candidates = MODEL_CANDIDATES) {
  let lastErr = null;
  for (const name of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      const result = await model.generateContent({ contents: makeContents(), generationConfig });
      return result;
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${name} failed:`, err && err.message ? err.message : err);
      // try next candidate
    }
  }
  // If none succeeded, throw the last error for visibility
  throw lastErr || new Error('No generative model available');
}

// Generate new questions for a topic when they are running low
const DEFAULT_FGV_EXAMPLES = `
Exemplo 1 (Língua Portuguesa):
Questão: "Texto: 'A história é escrita pelos vencedores.' (George Orwell). Assinale a opção que apresenta a reescrita correta da frase, preservando o sentido original e a coerência gramatical."
Opções: ["A) Os vencedores escrevem a história.", "B) A história deve ser escrita pelos vencedores.", "C) Escreve-se a história por quem vence.", "D) Pelos vencedores a história é de ser escrita.", "E) A escrita da história se faz por vencedores."]
Gabarito: "A) Os vencedores escrevem a história."
Explicação: A transposição da voz passiva analítica para a voz ativa mantém intacto o sentido do enunciado original de Orwell, preservando a correção gramatical da norma-padrão.

Exemplo 2 (Raciocínio Lógico):
Questão: "Três analistas da DATAPREV, André, Bruno e Carlos, trabalham em diferentes projetos: Nuvem, Segurança e Banco de Dados. Sabe-se que: André não trabalha com Nuvem; Bruno trabalha com Segurança; Carlos não trabalha com Banco de Dados. A alternativa que apresenta a associação correta é:"
Opções: ["A) André trabalha com Banco de Dados e Carlos trabalha com Nuvem.", "B) André trabalha com Nuvem e Carlos trabalha com Banco de Dados.", "C) Bruno trabalha com Banco de Dados e André trabalha com Segurança.", "D) Carlos trabalha com Segurança e Bruno trabalha com Nuvem.", "E) André trabalha com Segurança e Carlos trabalha com Banco de Dados."]
Gabarito: "A) André trabalha com Banco de Dados e Carlos trabalha com Nuvem."
Explicação: Sabendo que Bruno trabalha com Segurança, restam Nuvem e Banco de Dados para André e Carlos. Como André não trabalha com Nuvem, conclui-se que André trabalha com Banco de Dados, restando para Carlos o projeto de Nuvem.

Exemplo 3 (Arquitetura Tecnológica / ATI Específico):
Questão: "Na arquitetura de microsserviços da DATAPREV, um engenheiro precisa implementar uma estratégia de resiliência que impeça falhas em cascata quando um serviço remoto de banco de dados ficar instável. A abordagem padrão de design que monitora as falhas subsequentes e abre o circuito temporariamente é o padrão:"
Opções: ["A) Circuit Breaker", "B) Bulkhead", "C) Retry with Exponential Backoff", "D) Load Balancer", "E) Saga Pattern"]
Gabarito: "A) Circuit Breaker"
Explicação: O Circuit Breaker monitora falhas de chamadas a serviços externos. Ao atingir um limite, abre o circuito, retornando erro imediato sem sobrecarregar o recurso instável, garantindo a resiliência global do ecossistema.
`;

export async function generateNewQuestions(
  subjectName,
  topicName,
  summary,
  existingQuestionsCount,
  mastery = null,
  confidence = null,
  daysUntilExam = null,
  examples = null,
  recentErrors = null,
  topicWeight = null
) {
  try {
    const finalExamples = examples ? `${DEFAULT_FGV_EXAMPLES}\nOutros Exemplos Reais:\n${examples}` : DEFAULT_FGV_EXAMPLES;
    
    let statsContext = '';
    if (mastery !== null) statsContext += `- Domínio atual do aluno: ${mastery}%\n`;
    if (confidence !== null) statsContext += `- Nível de confiança do aluno: ${confidence}%\n`;
    if (daysUntilExam !== null) statsContext += `- Dias restantes até a prova: ${daysUntilExam} dias\n`;
    if (topicWeight !== null) statsContext += `- Peso do assunto no edital: ${topicWeight}\n`;
    if (recentErrors) statsContext += `- Histórico de erros recentes (Evite repetir, mas cobre os mesmos conceitos para recuperação):\n${recentErrors}\n`;

    const prompt = `
      Você é um Engenheiro Pedagógico e especialista em banca examinadora FGV.
      Sua tarefa é gerar exatamente 5 questões inéditas de múltipla escolha de alto nível para o concurso da DATAPREV 2026, cargo ATI - Arquitetura, Engenharia e Sustentação Tecnológica.
      
      CONCURSO: DATAPREV 2026
      CARGO: ATI - Arquitetura, Engenharia e Sustentação Tecnológica
      BANCA: FGV (Foco estrito em enunciados elaborados, situações-problema e pegadinhas técnicas sutis).
      
      MATÉRIA: "${subjectName}"
      TÓPICO DE ESTUDO: "${topicName}"
      RESUMO DO CONTEÚDO (Grounding):
      "${summary}"
      
      DADOS ADAPTATIVOS DO ALUNO:
      ${statsContext || 'Nenhum dado histórico registrado.'}
      
      INSTRUÇÕES DE FORMATO & ESTILO (Imitar rigorosamente a banca FGV):
      - As opções devem ser exatamente 5 alternativas (A, B, C, D, E).
      - Mimetize o tamanho dos enunciados da FGV e a complexidade conceitual.
      - Para cada questão, indique a dificuldade real (Easy/Medium/Hard).
      - Adicione uma explicação pedagógica detalhada justificando o gabarito e detalhando por que cada alternativa incorreta está errada.
      
      EXEMPLOS DE PROVAS DA FGV PARA REFERÊNCIA (Few-Shot):
      ${finalExamples}
      
      Retorne APENAS um objeto JSON válido contendo uma chave "questions" que é um array com as 5 questões geradas.
      Não adicione markdown como \`\`\`json no início ou no fim. Retorne o texto JSON puro.
      Esquema de saída esperado:
      {
        "questions": [
          {
            "question": "Enunciado completo da questão no estilo FGV...",
            "options": ["A) Opção A", "B) Opção B", "C) Opção C", "D) Opção D", "E) Opção E"],
            "correct_answer": "Alternativa correspondente ao gabarito (ex: C) Opção C)",
            "difficulty": "Easy/Medium/Hard",
            "explanation": "Explicação pedagógica detalhada..."
          }
        ]
      }
    `;

    const result = await generateWithFallback(
      () => ([{ role: 'user', parts: [{ text: prompt }] }]),
      { responseMimeType: 'application/json' }
    );
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    
    if (parsed && Array.isArray(parsed.questions)) {
      return parsed.questions;
    }
    
    return [];
  } catch (error) {
    console.error('Erro ao gerar questões via Gemini:', error);
    return [];
  }
}

// Generate gamification data directly from study material text pasted in the app
export async function generateGamifiedDataFromText(materialText, subjectName = '', topicName = '', bancaName = 'Geral', inputType = 'material-pdf', examDate = '') {
  try {
    let daysRemaining = 30; // default fallback
    if (examDate) {
      const diffTime = new Date(examDate) - new Date();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) daysRemaining = diffDays;
    }

    let contextInstruction = '';
    let scheduleSchema = '';
    
    if (inputType === 'edital') {
      contextInstruction = `
        O texto fornecido é um EDITAL ou CONTEÚDO PROGRAMÁTICO para concursos públicos.
        Seu objetivo é analisar os tópicos do edital e criar a primeira jornada gamificada:
        - Nome da Matéria: use "${subjectName || 'Matéria Geral'}" ou identifique no edital.
        - Nome do Tópico: identifique o primeiro assunto relevante no edital.
        - Crie um resumo (summary) didático desse primeiro tópico.
        - Crie flashcards focados na memorização desse primeiro tópico.
        - Crie questões de múltipla escolha baseadas nesse primeiro tópico, seguindo estritamente o estilo da banca "${bancaName}".
        
        Além disso, como faltam exatamente ${daysRemaining} dias para a prova, crie um CRONOGRAMA completo distribuindo todos os tópicos encontrados no edital de forma balanceada ao longo de no máximo 15 dias (ou no máximo os dias restantes se for menos que 15).
      `;
      
      scheduleSchema = `
        "schedule": [
          {
            "day": 1,
            "topic_name": "Nome do Tópico do Edital (ex: Direitos Fundamentais)",
            "action": "Ler Resumo e Flashcards"
          },
          {
            "day": 2,
            "topic_name": "Nome do Tópico do Edital",
            "action": "Fazer 15 Questões no site"
          }
        ],
      `;
    } else if (inputType === 'banco-questoes') {
      contextInstruction = `
        O texto fornecido é um BANCO DE QUESTÕES ou PROVA ANTERIOR.
        Seu objetivo é processar e gamificar estas questões:
        - Matéria: use "${subjectName || 'Geral'}".
        - Tópico: use "${topicName || 'Geral'}".
        - Resumo (summary): crie um resumo das regras gramaticais ou leis abordadas nessas questões.
        - Flashcards: crie perguntas de evocação ativa baseadas no conteúdo das questões.
        - Questões (questions): processe e formate as questões fornecidas na estrutura JSON, adicionando alternativas de A a D se necessário, gabarito correto e explicações pedagógicas ricas. Siga estritamente o estilo de cobrança da banca "${bancaName}".
      `;
    } else {
      contextInstruction = `
        O texto fornecido é um MATERIAL DE ESTUDO (PDF, Apostila ou Resumo).
        Seu objetivo é extrair o conhecimento para gamificação:
        - Matéria: use "${subjectName || 'Geral'}".
        - Tópico: use "${topicName || 'Geral'}".
        - Resumo (summary): crie um resumo dinâmico do material com definições e mnemônicos.
        - Flashcards: crie perguntas e respostas para treinar a evocação ativa do material.
        - Questões (questions): crie questões inéditas simulando a cobrança da banca "${bancaName}" sobre o conteúdo do material.
      `;
    }

    const prompt = `
      Você é um especialista em engenharia pedagógica e preparação para concursos.
      Analise o material fornecido e crie uma estrutura gamificada completa.
      
      CONTEXTO DE ENTRADA:
      ${contextInstruction}

      BANCA EXAMINADORA ALVO:
      - Estilo de questão: "${bancaName}" (se for Cebraspe, crie alternativas simulando múltipla escolha padrão de 4 opções ou adapte assertivas clássicas).
      
      Retorne APENAS um objeto JSON contendo exatamente esta estrutura de chaves:
      {
        "subject": "${subjectName || 'Nome da Matéria'}",
        "topic": "${inputType === 'edital' ? 'Edital Geral' : (topicName || 'Nome do Tópico')}",
        "banca": "${bancaName}",
        "summary": "Resumo analítico focado em tópicos chave...",
        ${scheduleSchema}
        "flashcards": [
          { "front": "pergunta de evocação ativa?", "back": "resposta curta objetiva" }
        ],
        "questions": [
          {
            "question": "enunciado da questão no estilo da banca ${bancaName}...",
            "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
            "correct_answer": "Alternativa correspondente à resposta correta",
            "difficulty": "Easy/Medium/Hard",
            "explanation": "explicação detalhada de por que é a correta e por que as outras estão erradas."
          }
        ]
      }

      TEXTO DO MATERIAL:
      ${materialText}
    `;

    const result = await generateWithFallback(() => ([{ role: 'user', parts: [{ text: prompt }] }]), { responseMimeType: 'application/json' });
    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Erro ao processar texto com Gemini:', error);
    throw error;
  }
}

// AI study mentor analysis
export async function generateAIStudyDiagnosis(userProfile, subjectsData) {
  try {
    const prompt = `
      Você é um mentor especialista em neurociência da aprendizagem e preparação para concursos.
      Analise os dados de progresso do aluno a seguir e crie um diagnóstico personalizado curto e dinâmico (com emoticons, tom motivador de RPG, estilo Duolingo).
      
      DADOS DO ALUNO:
      - Nível do Jogador: ${userProfile.level}
      - XP Acumulado: ${userProfile.xp}
      - Ofensiva (Streak): ${userProfile.streak_count} dias
      - Escudos de Proteção: ${userProfile.shield_count}
      - Moedas do Jogo: ${userProfile.coins}
      
      DESEMPENHO POR MATÉRIA (Maestria de 0 a 100%):
      ${JSON.stringify(subjectsData)}

      REQUISITOS DO DIAGNÓSTICO:
      1. Parabenize-o se o streak estiver ativo.
      2. Chame a atenção para a matéria com MAIOR decaimento de maestria ou MENOR nível de maestria.
      3. Dê uma dica baseada em neurociência (ex: fazer evocação ativa, revisar flashcards antes de dormir, focar em questões rápidas).
      4. Proponha um desafio/jornada imediata (ex: "Faça um Boss Fight de [Materia] hoje para provar seu valor!").
      5. Retorne o diagnóstico em formato HTML limpo (apenas tags <p>, <ul>, <li>, <strong>, <span> com classes estilizadas sutis como 'text-primary' ou 'text-accent'). Não use markdown no retorno.
    `;

    const result = await generateWithFallback(() => ([{ role: 'user', parts: [{ text: prompt }] }]));
    return result.response.text();
  } catch (error) {
    console.error('Erro ao gerar diagnóstico do Gemini:', error);
    return `<p>Não foi possível conectar com seu mentor de IA neste momento. Continue resolvendo questões para restabelecer a sinapse! 💪</p>`;
  }
}

export async function parseEditalWithIA(editalText) {
  const prompt = `
    Você é um Engenheiro de Software especialista em UX para TDAH.
    Analise o texto do edital de concurso abaixo e quebre-o em uma estrutura de árvore de dependências e ordem lógica de estudos.
    Você deve dividir as matérias, os tópicos e seus sub-tópicos (Hierarquia Pai -> Filho -> Neto).
    
    Regras rigorosas:
    1. Identifique as matérias (ex: Direito Administrativo, Redes de Computadores, Arquitetura Tecnológica).
    2. Identifique os tópicos dentro de cada matéria.
    3. Mapeie dependências de pré-requisito (ex: "Docker" é pré-requisito para "Kubernetes"; "Algoritmos" é pré-requisito para "Estruturas de Dados").
    
    Retorne um JSON contendo as chaves principais:
    - "subjects": um array de objetos, onde cada objeto de matéria contém:
      - "name": Nome da matéria
      - "module": "general" para conhecimentos básicos, "specific" para conhecimentos específicos
      - "banca": "Cebraspe" ou banca identificada no edital
      - "topics": um array de objetos de tópicos contendo:
        - "name": Nome do tópico
        - "parent_topic": Nome do tópico pai (se houver, ex: "Cloud Computing" é pai de "Kubernetes") ou null
        - "prerequisite_topic": Nome do tópico que precisa ser estudado antes (ou null)
        
    TEXTO DO EDITAL:
    ${editalText}
  `;

  const result = await generateWithFallback(() => ([{ role: 'user', parts: [{ text: prompt }] }]), { responseMimeType: 'application/json' });
  const data = JSON.parse(result.response.text());
  return data;
}

export async function shredPDFWithIA(pdfText, subjectName, topicName, bancaName = 'Geral') {
  const prompt = `
    Você é um Triturador Cognitivo projetado para o cérebro com TDAH.
    Seu objetivo é pegar o material bruto abaixo sobre a matéria "${subjectName}" e o tópico "${topicName}", limpando a gordura densa e fatiando em JSON pronto para o jogo.
    
    Tarefas:
    1. Cards Teóricos (Microdoses): Divida a explicação teórica em cards concisos de no máximo 300 caracteres cada. Limpe toda a gordura do texto.
    2. Neblina de Guerra (Pre-testing): Formule exatamente 3 questões inéditas de nível médio com alternativas de A a D e explique as resoluções, vinculadas a esse conteúdo.
    3. Conceito Crítico (Feynman): Identifique de 3 a 5 palavras-chave ou termos essenciais (separados por vírgula) que representam as regras de ouro deste tópico (para validar o resumo do usuário).
    
    Retorne exatamente o seguinte JSON:
    {
      "summary_chunks": [
        "Card 1 de no máximo 300 caracteres...",
        "Card 2 de no máximo 300 caracteres..."
      ],
      "keywords_feynman": "termo1, termo2, termo3",
      "flashcards": [
        { "front": "pergunta rápida de evocação?", "back": "resposta curta objetiva" }
      ],
      "questions": [
        {
          "question": "Enunciado da questão no estilo de cobrança da banca ${bancaName}...",
          "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
          "correct_answer": "Opção correspondente à resposta correta",
          "difficulty": "Medium",
          "explanation": "Explicação detalhada da resposta."
        }
      ]
    }

    TEXTO BRUTO DO PDF:
    ${pdfText}
  `;

  const result = await generateWithFallback(() => ([{ role: 'user', parts: [{ text: prompt }] }]), { responseMimeType: 'application/json' });
  return JSON.parse(result.response.text());
}

export async function generateAdaptiveQuestions(subjectName, topicName, summary, banca, difficulty, errorsContext) {
  const prompt = `
    Você é um Engenheiro Pedagógico e Membro de Banca Examinadora de alto nível (mimetizando rigorosamente o estilo da banca "${banca}").
    Seu objetivo é gerar exatamente 5 questões inéditas de múltipla escolha focadas no seguinte tópico de estudo.
    
    INSTRUÇÕES DE SEGURANÇA (ValidateTask):
    - Baseie-se apenas em teorias, conceitos, leis e normas reais existentes associados ao edital e resumo fornecidos.
    - NÃO INVENTE leis, normas ou fatos (proibição absoluta de alucinações).
    
    INSTRUÇÕES DE FORMATO & DIFICULDADE (DifficultyScaler):
    - Matéria: "${subjectName}"
    - Tópico: "${topicName}"
    - Resumo do Tópico (Grounding): "${summary}"
    - Dificuldade Requerida: "${difficulty}" (Se 'Easy', crie questões diretas e conceituais. Se 'Hard', formule cenários de caso realistas e complexos com pegadinhas de governança avançadas).
    
    HISTÓRICO DE ERROS RECENTES DO USUÁRIO (Evite repetir estas perguntas, mas ataque os mesmos conceitos nos quais o aluno falhou):
    ${errorsContext || 'Nenhum erro registrado recentemente.'}
    
    INSTRUÇÕES DE EXPLANATION (AdaptiveFeedback):
    - Para cada questão, gere uma explicação detalhada ("explanation") justificando por que o gabarito é o correto e por que cada uma das alternativas incorretas está incorreta.
    
    Retorne APENAS um objeto JSON válido (sem delimitadores markdown e sem texto adicional) seguindo exatamente esta estrutura:
    {
      "questions": [
        {
          "question": "Enunciado da questão...",
          "options": ["A) Opção...", "B) Opção...", "C) Opção...", "D) Opção...", "E) Opção..."],
          "correct_answer": "Gabarito correto correspondente exatamente à opção (ex: C) Opção...)",
          "difficulty": "${difficulty}",
          "explanation": "Justificativa detalhada de cada opção..."
        }
      ]
    }
  `;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const result = await generateWithFallback(
        () => ([{ role: 'user', parts: [{ text: prompt }] }]), 
        { responseMimeType: 'application/json' }
      );
      const text = result.response.text();
      const data = JSON.parse(text);
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        // Validate keys
        const valid = data.questions.every(q => 
          q.question && 
          Array.isArray(q.options) && 
          q.options.length === 5 && 
          q.correct_answer && 
          q.explanation
        );
        if (valid) {
          return data.questions;
        }
      }
    } catch (error) {
      console.warn(`Attempt ${attempts + 1} to generate adaptive questions failed:`, error.message);
    }
    attempts++;
  }
  
  throw new Error('Failed to generate valid adaptive questions after 3 attempts.');
}

