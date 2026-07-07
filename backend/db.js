import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateAdaptiveQuestions } from './gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data.db');

let db;

export async function initDB() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // ============================
  // MULTI-PROFILE: app_settings
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      active_profile_id INTEGER DEFAULT 1
    )
  `);

  // MULTI-PROFILE: profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Concurseiro',
      avatar_emoji TEXT DEFAULT '👑',
      exam_name TEXT DEFAULT '',
      exam_date TEXT DEFAULT '',
      created_at TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      coins INTEGER DEFAULT 100,
      streak_count INTEGER DEFAULT 0,
      last_active_date TEXT,
      shield_count INTEGER DEFAULT 0,
      mental_fog INTEGER DEFAULT 0,
      tdah_mode INTEGER DEFAULT 0,
      locked_subjects TEXT DEFAULT '[]',
      max_stamina_limit INTEGER DEFAULT 20,
      today_stamina_spent INTEGER DEFAULT 0,
      burned_out INTEGER DEFAULT 0,
      risco_eliminacao INTEGER DEFAULT 0,
      diagnostic_completed INTEGER DEFAULT 0
    )
  `);

  // Create legacy user_profile table (kept for backward compat, proxied to active profile)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT DEFAULT 'Concurseiro',
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      coins INTEGER DEFAULT 100,
      streak_count INTEGER DEFAULT 0,
      last_active_date TEXT,
      shield_count INTEGER DEFAULT 0
    )
  `);

  // ============================
  // PRD TABLE: Disciplinas
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Disciplinas (
      id_disciplina INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      peso_edital REAL DEFAULT 1.0,
      xp_acumulado INTEGER DEFAULT 0,
      nivel_atual INTEGER DEFAULT 1,
      profile_id INTEGER DEFAULT 1,
      module TEXT DEFAULT 'general',
      consecutive_answers INTEGER DEFAULT 0,
      last_studied_at TEXT,
      created_at TEXT,
      banca TEXT DEFAULT 'Geral'
    )
  `);

  // ============================
  // PRD TABLE: Topicos
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Topicos (
      id_topico INTEGER PRIMARY KEY AUTOINCREMENT,
      id_disciplina INTEGER,
      nome TEXT NOT NULL,
      percentual_dominio REAL DEFAULT 0.0,
      data_ultima_revisao TEXT,
      status_plantacao TEXT DEFAULT 'semente',
      summary TEXT,
      id_topico_pai INTEGER DEFAULT NULL,
      requisito_id INTEGER DEFAULT NULL,
      keywords_feynman TEXT DEFAULT NULL,
      FOREIGN KEY(id_disciplina) REFERENCES Disciplinas(id_disciplina) ON DELETE CASCADE,
      FOREIGN KEY(id_topico_pai) REFERENCES Topicos(id_topico) ON DELETE SET NULL,
      FOREIGN KEY(requisito_id) REFERENCES Topicos(id_topico) ON DELETE SET NULL
    )
  `);

  // ============================
  // PRD TABLE: Log_Questoes
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Log_Questoes (
      id_log INTEGER PRIMARY KEY AUTOINCREMENT,
      id_topico INTEGER,
      acertou INTEGER,
      tempo_resposta_segundos INTEGER,
      nivel_certeza INTEGER,
      answered_at TEXT,
      profile_id INTEGER DEFAULT 1,
      question_id INTEGER,
      confidence TEXT DEFAULT 'Certeza Absoluta',
      weight_applied REAL DEFAULT 1.0,
      FOREIGN KEY(id_topico) REFERENCES Topicos(id_topico) ON DELETE CASCADE
    )
  `);

  // ============================
  // PRD TABLE: TopicMastery
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS TopicMastery (
      profile_id INTEGER,
      topic_id INTEGER,
      mastery REAL DEFAULT 0.0,
      confidence REAL DEFAULT 100.0,
      forgetting_score REAL DEFAULT 0.0,
      last_review TEXT,
      next_review TEXT,
      avg_response_time REAL DEFAULT 0.0,
      PRIMARY KEY (profile_id, topic_id),
      FOREIGN KEY(topic_id) REFERENCES Topicos(id_topico) ON DELETE CASCADE
    )
  `);

  // ============================
  // PRD TABLE: Pensamentos_Intrusivos
  // ============================
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Pensamentos_Intrusivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pensamento TEXT,
      created_at TEXT
    )
  `);

  // Create legacy subjects table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER DEFAULT 1,
      name TEXT,
      mastery INTEGER DEFAULT 0,
      last_studied_at TEXT,
      created_at TEXT
    )
  `);

  // Create legacy topics table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      name TEXT,
      summary TEXT,
      mastery INTEGER DEFAULT 0,
      last_studied_at TEXT,
      FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
  `);

  // Create flashcards table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      front TEXT,
      back TEXT,
      box INTEGER DEFAULT 1,
      next_review_date TEXT,
      FOREIGN KEY(topic_id) REFERENCES Topicos(id_topico) ON DELETE CASCADE
    )
  `);

  // Create questions table with module/code fields
  await db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER,
      question_text TEXT,
      options TEXT,
      correct_answer TEXT,
      explanation TEXT,
      difficulty TEXT DEFAULT 'Medium',
      source TEXT DEFAULT 'imported',
      module TEXT DEFAULT 'general',
      type TEXT DEFAULT 'text',
      code_lines TEXT DEFAULT NULL,
      key_line_index INTEGER DEFAULT NULL,
      correct_count INTEGER DEFAULT 0,
      incorrect_count INTEGER DEFAULT 0,
      last_answered_at TEXT,
      FOREIGN KEY(topic_id) REFERENCES Topicos(id_topico) ON DELETE CASCADE
    )
  `);

  // Create legacy answers history table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS answers_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      profile_id INTEGER DEFAULT 1,
      is_correct INTEGER,
      answered_at TEXT,
      response_time_seconds INTEGER,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
    )
  `);

  // Create study schedule table with profile_id
  await db.exec(`
    CREATE TABLE IF NOT EXISTS study_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER DEFAULT 1,
      subject_name TEXT,
      topic_name TEXT,
      study_date TEXT,
      days_left_indicator INTEGER,
      status TEXT DEFAULT 'Pendente'
    )
  `);

  // Marathon results table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS marathon_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER DEFAULT 1,
      started_at TEXT,
      finished_at TEXT,
      total_questions INTEGER,
      correct_count INTEGER,
      score_general REAL,
      score_specific REAL,
      total_score REAL
    )
  `);

  // ============================
  // DATA MIGRATION LOGIC (LEGACY -> PRD)
  // ============================
  try {
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='subjects'");
    if (tableExists) {
      await db.exec(`
        INSERT OR IGNORE INTO Disciplinas (id_disciplina, nome, peso_edital, xp_acumulado, nivel_atual, profile_id, module, consecutive_answers, last_studied_at, created_at, banca)
        SELECT id, name, weight, xp, level, profile_id, module, consecutive_answers, last_studied_at, created_at, banca FROM subjects
      `);
    }
  } catch (e) {
    console.warn("Migration to Disciplinas skipped or already done:", e.message);
  }

  try {
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='topics'");
    if (tableExists) {
      await db.exec(`
        INSERT OR IGNORE INTO Topicos (id_topico, id_disciplina, nome, percentual_dominio, data_ultima_revisao, status_plantacao, summary)
        SELECT id, subject_id, name, mastery, last_studied_at, 'semente', summary FROM topics
      `);
    }
  } catch (e) {
    console.warn("Migration to Topicos skipped or already done:", e.message);
  }

  try {
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='answers_history'");
    if (tableExists) {
      await db.exec(`
        INSERT OR IGNORE INTO Log_Questoes (id_log, id_topico, acertou, tempo_resposta_segundos, nivel_certeza, answered_at, profile_id, question_id, confidence, weight_applied)
        SELECT id, (SELECT topic_id FROM questions WHERE id = question_id), is_correct, response_time_seconds, 
               (CASE WHEN confidence='Chute' THEN 1 WHEN confidence='Dúvida' THEN 2 ELSE 3 END), answered_at, profile_id, question_id, confidence, weight_applied 
        FROM answers_history
      `);
    }
  } catch (e) {
    console.warn("Migration to Log_Questoes skipped or already done:", e.message);
  }

  // ============================
  // MIGRATIONS for existing DBs
  // ============================
  const migrations = [
    "ALTER TABLE subjects ADD COLUMN xp INTEGER DEFAULT 0",
    "ALTER TABLE subjects ADD COLUMN level INTEGER DEFAULT 1",
    "ALTER TABLE subjects ADD COLUMN banca TEXT DEFAULT 'Geral'",
    "ALTER TABLE subjects ADD COLUMN weight REAL DEFAULT 1.0",
    "ALTER TABLE subjects ADD COLUMN consecutive_answers INTEGER DEFAULT 0",
    "ALTER TABLE subjects ADD COLUMN profile_id INTEGER DEFAULT 1",
    "ALTER TABLE subjects ADD COLUMN module TEXT DEFAULT 'general'",
    "ALTER TABLE questions ADD COLUMN module TEXT DEFAULT 'general'",
    "ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'text'",
    "ALTER TABLE questions ADD COLUMN code_lines TEXT DEFAULT NULL",
    "ALTER TABLE questions ADD COLUMN key_line_index INTEGER DEFAULT NULL",
    "ALTER TABLE answers_history ADD COLUMN confidence TEXT DEFAULT 'Certeza Absoluta'",
    "ALTER TABLE answers_history ADD COLUMN weight_applied REAL DEFAULT 1.0",
    "ALTER TABLE answers_history ADD COLUMN profile_id INTEGER DEFAULT 1",
    "ALTER TABLE study_schedule ADD COLUMN profile_id INTEGER DEFAULT 1",
    "ALTER TABLE user_profile ADD COLUMN mental_fog INTEGER DEFAULT 0",
    "ALTER TABLE user_profile ADD COLUMN tdah_mode INTEGER DEFAULT 0",
    "ALTER TABLE user_profile ADD COLUMN locked_subjects TEXT DEFAULT '[]'",
    "ALTER TABLE user_profile ADD COLUMN max_stamina_limit INTEGER DEFAULT 20",
    "ALTER TABLE user_profile ADD COLUMN today_stamina_spent INTEGER DEFAULT 0",
    "ALTER TABLE user_profile ADD COLUMN burned_out INTEGER DEFAULT 0",
    "ALTER TABLE user_profile ADD COLUMN risco_eliminacao INTEGER DEFAULT 0",
    "ALTER TABLE user_profile ADD COLUMN diagnostic_completed INTEGER DEFAULT 0",
    "ALTER TABLE profiles ADD COLUMN risco_eliminacao INTEGER DEFAULT 0",
    "ALTER TABLE profiles ADD COLUMN diagnostic_completed INTEGER DEFAULT 0"
  ];
  for (const sql of migrations) {
    try { await db.run(sql); } catch (e) { /* already exists */ }
  }

  // Ensure app_settings row exists
  const settingsRow = await db.get('SELECT id FROM app_settings WHERE id = 1');
  if (!settingsRow) {
    await db.run('INSERT INTO app_settings (id, active_profile_id) VALUES (1, 1)');
  }

  // Migrate: ensure at least one profile exists in new profiles table
  const profCount = await db.get('SELECT COUNT(*) as count FROM profiles');
  if (profCount.count === 0) {
    // Pull existing data from user_profile if any
    const legacy = await db.get('SELECT * FROM user_profile LIMIT 1');
    const today = new Date().toISOString().split('T')[0];
    if (legacy) {
      await db.run(
        `INSERT INTO profiles (id, name, avatar_emoji, exam_name, exam_date, created_at, xp, level, coins, streak_count, last_active_date, shield_count, mental_fog, tdah_mode, locked_subjects)
         VALUES (1, ?, '👑', '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [legacy.username || 'Concurseiro', today, legacy.xp || 0, legacy.level || 1,
         legacy.coins || 100, legacy.streak_count || 0, legacy.last_active_date || today,
         legacy.shield_count || 0, legacy.mental_fog || 0, legacy.tdah_mode || 0,
         legacy.locked_subjects || '[]']
      );
    } else {
      await db.run(
        `INSERT INTO profiles (id, name, avatar_emoji, exam_name, exam_date, created_at, xp, level, coins, streak_count, last_active_date)
         VALUES (1, 'Concurseiro', '👑', '', '', ?, 0, 1, 100, 0, ?)`,
        [today, today]
      );
    }
  }

  // Populate mock data if database has no Disciplinas at all
  const subjectCount = await db.get('SELECT COUNT(*) as count FROM Disciplinas');
  if (subjectCount.count === 0) {
    await populateMockData();
  }

  console.log('Database initialized successfully.');
  return db;
}

export async function resetDatabase() {
  await db.run('DROP TABLE IF EXISTS TopicMastery');
  await db.run('DROP TABLE IF EXISTS answers_history');
  await db.run('DROP TABLE IF EXISTS Log_Questoes');
  await db.run('DROP TABLE IF EXISTS flashcards');
  await db.run('DROP TABLE IF EXISTS questions');
  await db.run('DROP TABLE IF EXISTS study_schedule');
  await db.run('DROP TABLE IF EXISTS marathon_results');
  await db.run('DROP TABLE IF EXISTS Topicos');
  await db.run('DROP TABLE IF EXISTS Disciplinas');
  await db.run('DROP TABLE IF EXISTS profiles');
  await db.run('DROP TABLE IF EXISTS user_profile');
  await db.run('DROP TABLE IF EXISTS app_settings');
  await db.run('DROP TABLE IF EXISTS Pensamentos_Intrusivos');
  await db.run('DROP TABLE IF EXISTS subjects');
  await db.run('DROP TABLE IF EXISTS topics');
  await initDB();
}

// ============================
// ACTIVE PROFILE HELPERS
// ============================
async function getActiveProfileId() {
  const row = await db.get('SELECT active_profile_id FROM app_settings WHERE id = 1');
  return row ? row.active_profile_id : 1;
}

export async function listProfiles() {
  return await db.all('SELECT * FROM profiles ORDER BY created_at ASC');
}

export async function createProfile(name, avatarEmoji = '🎯', examName = '', examDate = '') {
  const today = new Date().toISOString().split('T')[0];
  const result = await db.run(
    `INSERT INTO profiles (name, avatar_emoji, exam_name, exam_date, created_at, xp, level, coins, streak_count, last_active_date)
     VALUES (?, ?, ?, ?, ?, 0, 1, 100, 0, ?)`,
    [name, avatarEmoji, examName, examDate, today, today]
  );
  return result.lastID;
}

export async function switchProfile(profileId) {
  const profile = await db.get('SELECT id FROM profiles WHERE id = ?', [profileId]);
  if (!profile) throw new Error('Perfil não encontrado');
  await db.run('UPDATE app_settings SET active_profile_id = ? WHERE id = 1', [profileId]);
  return await db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
}

export async function deleteProfile(profileId) {
  const count = await db.get('SELECT COUNT(*) as count FROM profiles');
  if (count.count <= 1) throw new Error('Não é possível excluir o único perfil.');
  // Cascade delete subjects for this profile
  const subjects = await db.all('SELECT id FROM subjects WHERE profile_id = ?', [profileId]);
  for (const s of subjects) {
    const topics = await db.all('SELECT id FROM topics WHERE subject_id = ?', [s.id]);
    for (const t of topics) {
      await db.run('DELETE FROM flashcards WHERE topic_id = ?', [t.id]);
      await db.run('DELETE FROM questions WHERE topic_id = ?', [t.id]);
    }
    await db.run('DELETE FROM topics WHERE subject_id = ?', [s.id]);
  }
  await db.run('DELETE FROM subjects WHERE profile_id = ?', [profileId]);
  await db.run('DELETE FROM study_schedule WHERE profile_id = ?', [profileId]);
  await db.run('DELETE FROM marathon_results WHERE profile_id = ?', [profileId]);
  await db.run('DELETE FROM profiles WHERE id = ?', [profileId]);

  // If deleted profile was active, switch to profile 1
  const settings = await db.get('SELECT active_profile_id FROM app_settings WHERE id = 1');
  if (settings && settings.active_profile_id === profileId) {
    const first = await db.get('SELECT id FROM profiles LIMIT 1');
    if (first) await db.run('UPDATE app_settings SET active_profile_id = ? WHERE id = 1', [first.id]);
  }
}

export async function updateProfileMeta(profileId, { name, avatarEmoji, examName, examDate }) {
  await db.run(
    'UPDATE profiles SET name = ?, avatar_emoji = ?, exam_name = ?, exam_date = ? WHERE id = ?',
    [name, avatarEmoji, examName, examDate, profileId]
  );
  return await db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
}

async function populateMockData() {
  const now = new Date().toISOString();
  
  // Insert Subject into Disciplinas (PRD Table)
  const subjectResult = await db.run(
    'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (1, ?, 1.0, 0, 1, ?, "general", ?, ?)',
    ['Direito Constitucional', 'FCC', now, now]
  );
  const subjectId = subjectResult.lastID;

  // Insert Topic into Topicos (PRD Table)
  const topicResult = await db.run(
    'INSERT INTO Topicos (id_disciplina, nome, summary, percentual_dominio, data_ultima_revisao, status_plantacao) VALUES (?, ?, ?, 0.0, ?, ?)',
    [
      subjectId,
      'Direitos Individuais e Coletivos',
      'O Artigo 5º da CF/88 trata dos direitos individuais e coletivos. Princípios essenciais: igualdade de gênero, proibição de tortura, liberdade de expressão (vedado o anonimato), inviolabilidade do domicílio (salvo flagrante delito, desastre, prestar socorro, ou determinação judicial durante o dia), sigilo de correspondência e remédios constitucionais.',
      now,
      'semente'
    ]
  );
  const topicId = topicResult.lastID;

  // Also populate legacy subjects and topics tables for full compatibility
  try {
    await db.run(
      'INSERT INTO subjects (id, name, mastery, last_studied_at, created_at, xp, level, banca, profile_id, weight, module, consecutive_answers) VALUES (?, ?, 0, ?, ?, 0, 1, ?, 1, 1.0, "general", 0)',
      [subjectId, 'Direito Constitucional', now, now, 'FCC']
    );
    await db.run(
      'INSERT INTO topics (id, subject_id, name, summary, mastery, last_studied_at) VALUES (?, ?, ?, ?, 0, ?)',
      [topicId, subjectId, 'Direitos Individuais e Coletivos', 'O Artigo 5º da CF/88 trata dos direitos individuais e coletivos.', now]
    );
  } catch(err) {
    // ignore
  }

  // Insert Flashcards
  const flashcards = [
    {
      front: 'Qual o remédio constitucional cabível para garantir o conhecimento de informações relativas à pessoa do impetrante?',
      back: 'Habeas Data (Art. 5º, LXXII, a).'
    },
    {
      front: 'O domicílio é inviolável. Quais as exceções à regra que permitem a entrada sem consentimento?',
      back: 'Flagrante delito, desastre, prestação de socorro (a qualquer hora) ou por determinação judicial (apenas durante o dia).'
    },
    {
      front: 'A criação de associações independe de autorização estatal?',
      back: 'Sim, e é vedada a interferência estatal em seu funcionamento (Art. 5º, XVIII).'
    }
  ];

  for (const fc of flashcards) {
    await db.run(
      'INSERT INTO flashcards (topic_id, front, back, box, next_review_date) VALUES (?, ?, ?, ?, ?)',
      [topicId, fc.front, fc.back, 1, new Date().toISOString().split('T')[0]]
    );
  }

  // Insert Questions
  const qOptions = [
    'A) Livre, sendo garantido o anonimato.',
    'B) Livre, sendo vedado o anonimato.',
    'C) Dependente de prévia autorização censória.',
    'D) Permitida apenas a maiores de 18 anos.'
  ];

  await db.run(
    'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      topicId,
      'Segundo o Art. 5º da CF/88, a manifestação do pensamento é:',
      JSON.stringify(qOptions),
      'B) Livre, sendo vedado o anonimato.',
      'Conforme o Art. 5º, IV da CF/88: "é livre a manifestação do pensamento, sendo vedado o anonimato".',
      'Easy',
      'imported'
    ]
  );

  const q2Options = [
    'A) Por determinação judicial, a qualquer hora do dia ou da noite.',
    'B) Em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial.',
    'C) Apenas com ordem de autoridade policial competente durante a noite.',
    'D) Em qualquer circunstância, desde que haja suspeita fundada.'
  ];

  await db.run(
    'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      topicId,
      'A casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo:',
      JSON.stringify(q2Options),
      'B) Em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial.',
      'Conforme o Art. 5º, XI da CF/88: "a casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo, em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial".',
      'Medium',
      'imported'
    ]
  );
}

// PROFILE LOGIC — reads from active profiles entry
export async function getProfile() {
  const profileId = await getActiveProfileId();
  const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
  if (!profile) {
    // Fallback: return first profile
    const fallback = await db.get('SELECT * FROM profiles LIMIT 1');
    if (!fallback) return null;
    return {
      ...fallback,
      id: fallback.id,
      username: fallback.name,
      tdah_mode: fallback.tdah_mode || 0,
      mental_fog: fallback.mental_fog || 0,
      locked_subjects: fallback.locked_subjects || '[]',
      max_stamina_limit: fallback.max_stamina_limit || 20,
      today_stamina_spent: fallback.today_stamina_spent || 0,
      burned_out: fallback.burned_out || 0,
      streak_count: fallback.streak_count || 0,
      shield_count: fallback.shield_count || 0,
      exam_name: fallback.exam_name || '',
      exam_date: fallback.exam_date || '',
      avatar_emoji: fallback.avatar_emoji || '👑',
      risco_eliminacao: fallback.risco_eliminacao || 0,
      diagnostic_completed: fallback.diagnostic_completed || 0
    };
  }
  // Map fields to legacy shape expected by frontend
  return {
    ...profile,
    id: profile.id,
    username: profile.name,
    tdah_mode: profile.tdah_mode || 0,
    mental_fog: profile.mental_fog || 0,
    locked_subjects: profile.locked_subjects || '[]',
    max_stamina_limit: profile.max_stamina_limit || 20,
    today_stamina_spent: profile.today_stamina_spent || 0,
    burned_out: profile.burned_out || 0,
    streak_count: profile.streak_count || 0,
    shield_count: profile.shield_count || 0,
    exam_name: profile.exam_name || '',
    exam_date: profile.exam_date || '',
    avatar_emoji: profile.avatar_emoji || '👑',
    risco_eliminacao: profile.risco_eliminacao || 0,
    diagnostic_completed: profile.diagnostic_completed || 0
  };
}

export async function updateXP(xpGained, coinsGained, subjectId = null) {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  
  // Calculate Synergy Buff
  const subjectsList = await db.all('SELECT nivel_atual as level FROM Disciplinas WHERE profile_id = ?', [profileId]);
  const synergyActive = subjectsList.length > 0 && subjectsList.every(s => (s.level || 1) >= 10);
  const synergyMultiplier = synergyActive ? 1.2 : 1.0;

  let finalXpGained = xpGained;
  let fatigueActive = false;
  let consecutiveAnswers = 0;
  let subjectName = '';
  let newSubjectLevel = 1;
  let newSubjectXp = 0;
  let subjectLeveledUp = false;

  if (subjectId) {
    const subject = await db.get('SELECT xp_acumulado as xp, nivel_atual as level, nome as name, peso_edital as weight, consecutive_answers FROM Disciplinas WHERE id_disciplina = ?', [subjectId]);
    if (subject) {
      subjectName = subject.name;
      consecutiveAnswers = (subject.consecutive_answers || 0);
      
      // Edital Weight modifier
      let tempXp = xpGained * (subject.weight || 1.0);
      
      // Fatigue debuff if consecutive answers >= 20
      if (consecutiveAnswers >= 20) {
        tempXp *= 0.8;
        fatigueActive = true;
      }
      
      finalXpGained = Math.round(tempXp * synergyMultiplier * (profile.mental_fog === 1 ? 0.5 : 1.0));
      
      // Increment fatigue counter
      consecutiveAnswers += 1;
      await db.run('UPDATE Disciplinas SET consecutive_answers = ? WHERE id_disciplina = ?', [consecutiveAnswers, subjectId]);

      // Subject Level up logic
      newSubjectXp = (subject.xp || 0) + finalXpGained;
      newSubjectLevel = subject.level || 1;
      const subXpNeeded = newSubjectLevel * 1000;
      
      if (newSubjectXp >= subXpNeeded) {
        newSubjectXp -= subXpNeeded;
        newSubjectLevel += 1;
        
        // Cap level at 50
        if (newSubjectLevel > 50) {
          newSubjectLevel = 50;
          newSubjectXp = subXpNeeded; 
        } else {
          subjectLeveledUp = true;
          await db.run('UPDATE profiles SET coins = coins + 50 WHERE id = ?', [profile.id]);
          profile.coins += 50;
        }
      }

      await db.run(
        'UPDATE Disciplinas SET xp_acumulado = ?, nivel_atual = ? WHERE id_disciplina = ?',
        [newSubjectXp, newSubjectLevel, subjectId]
      );
    }
  } else {
    // If global XP (no subject context), just apply synergy multiplier and mental fog
    finalXpGained = Math.round(xpGained * synergyMultiplier * (profile.mental_fog === 1 ? 0.5 : 1.0));
  }

  let newXp = profile.xp + finalXpGained;
  let newCoins = profile.coins + coinsGained;
  let currentLevel = profile.level;
  
  const xpNeeded = currentLevel * 1000;
  let leveledUp = false;
  
  if (newXp >= xpNeeded) {
    newXp -= xpNeeded;
    currentLevel += 1;
    leveledUp = true;
    newCoins += 100; // Bonus coins on level up
  }

  await db.run(
    'UPDATE profiles SET xp = ?, level = ?, coins = ?, last_active_date = ? WHERE id = ?',
    [newXp, currentLevel, newCoins, new Date().toISOString().split('T')[0], profileId]
  );

  return {
    xp: newXp,
    level: currentLevel,
    coins: newCoins,
    leveledUp,
    subjectLeveledUp,
    newSubjectLevel,
    subjectId,
    subjectName,
    xpGainedApplied: finalXpGained,
    synergyActive,
    fatigueActive,
    consecutiveAnswers
  };
}

export async function checkAndProcessStreak() {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  const todayStr = new Date().toISOString().split('T')[0];
  
  if (!profile.last_active_date) {
    await db.run('UPDATE profiles SET last_active_date = ?, streak_count = 1 WHERE id = ?', [todayStr, profileId]);
    return { streak: 1, reset: false, shieldUsed: false };
  }

  const lastActive = new Date(profile.last_active_date);
  const today = new Date(todayStr);
  const diffTime = Math.abs(today - lastActive);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { streak: profile.streak_count, reset: false, shieldUsed: false };
  } else if (diffDays === 1) {
    const newStreak = profile.streak_count + 1;
    await db.run('UPDATE profiles SET streak_count = ?, last_active_date = ? WHERE id = ?', [newStreak, todayStr, profileId]);
    return { streak: newStreak, reset: false, shieldUsed: false };
  } else {
    if (profile.shield_count > 0) {
      const newShieldCount = profile.shield_count - 1;
      await db.run(
        'UPDATE profiles SET shield_count = ?, last_active_date = ? WHERE id = ?',
        [newShieldCount, todayStr, profileId]
      );
      return { streak: profile.streak_count, reset: false, shieldUsed: true, shieldsLeft: newShieldCount };
    } else {
      if (profile.tdah_mode === 1) {
        await db.run('UPDATE profiles SET last_active_date = ? WHERE id = ?', [todayStr, profileId]);
        return { streak: profile.streak_count, reset: false, shieldUsed: false, streakFrozen: true };
      }
      await db.run(
        'UPDATE profiles SET streak_count = 0, last_active_date = ?, mental_fog = 1 WHERE id = ?',
        [todayStr, profileId]
      );
      return { streak: 0, reset: true, shieldUsed: false, mentalFogTriggered: true };
    }
  }
}

export async function buyShield() {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  const shieldCost = 50;

  if (profile.coins < shieldCost) {
    throw new Error('Moedas insuficientes!');
  }

  const newCoins = profile.coins - shieldCost;
  const newShieldCount = profile.shield_count + 1;

  await db.run(
    'UPDATE profiles SET coins = ?, shield_count = ? WHERE id = ?',
    [newCoins, newShieldCount, profileId]
  );

  return { coins: newCoins, shields: newShieldCount };
}

// MASTERY CALCULATION USING EBBINGHAUS DECAY
export async function getSubjects() {
  const profileId = await getActiveProfileId();
  const subjects = await db.all('SELECT * FROM Disciplinas WHERE profile_id = ?', [profileId]);

  let anyCriticalMod1 = false;

  for (const subject of subjects) {
    const topics = await db.all('SELECT * FROM Topicos WHERE id_disciplina = ?', [subject.id_disciplina]);
    let totalTopicMastery = 0;

    for (const topic of topics) {
      const topicMastery = await calculateTopicMastery(topic.id_topico);
      totalTopicMastery += topicMastery;
      
      // Calculate dias_inativos for status_plantacao
      let daysInactive = 999;
      if (topic.data_ultima_revisao) {
        const lastDate = new Date(topic.data_ultima_revisao);
        const now = new Date();
        const diffTime = Math.abs(now - lastDate);
        daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      let statusPlantacao = 'semente';
      if (topic.data_ultima_revisao) {
        if (daysInactive < 3) {
          statusPlantacao = 'saudavel';
        } else if (daysInactive < 7) {
          statusPlantacao = 'murcha';
        } else {
          statusPlantacao = 'morta';
        }
      }

      await db.run('UPDATE Topicos SET percentual_dominio = ?, status_plantacao = ? WHERE id_topico = ?', [topicMastery, statusPlantacao, topic.id_topico]);
    }

    const calculatedMastery = topics.length > 0 ? Math.round(totalTopicMastery / topics.length) : 0;
    const finalMastery = Math.max(0, calculatedMastery);

    await db.run('UPDATE Disciplinas SET last_studied_at = (SELECT MAX(data_ultima_revisao) FROM Topicos WHERE id_disciplina = ?) WHERE id_disciplina = ?', [subject.id_disciplina, subject.id_disciplina]);
    
    // Map fields to legacy names for frontend
    subject.id = subject.id_disciplina;
    subject.name = subject.nome;
    subject.weight = subject.peso_edital;
    subject.xp = subject.xp_acumulado;
    subject.level = subject.nivel_atual;
    subject.mastery = finalMastery;

    // Módulo 2.2: Hard Reset Blocker Rule
    // "Se o percentual_dominio de qualquer disciplina do Módulo I cair abaixo de 15%, acionar a FLAG risco_eliminacao = TRUE."
    // Módulo I subjects are 'general'
    if (subject.module === 'general' && finalMastery < 15 && subject.last_studied_at !== null) {
      anyCriticalMod1 = true;
    }
  }

  if (anyCriticalMod1) {
    await db.run('UPDATE profiles SET risco_eliminacao = 1 WHERE id = ?', [profileId]);
  } else {
    await db.run('UPDATE profiles SET risco_eliminacao = 0 WHERE id = ?', [profileId]);
  }

  return subjects;
}

export async function getTopics(subjectId) {
  const subjects = await getSubjects();
  const subject = subjects.find(s => s.id === parseInt(subjectId));
  const topics = await db.all('SELECT * FROM Topicos WHERE id_disciplina = ?', [subjectId]);
  
  // Map fields to legacy names for frontend
  topics.forEach(t => {
    t.id = t.id_topico;
    t.mastery = t.percentual_dominio;
  });

  return { subject, topics };
}

async function calculateTopicMastery(topicId) {
  const questions = await db.all('SELECT id FROM questions WHERE topic_id = ?', [topicId]);
  if (questions.length === 0) return 0;

  const questionIds = questions.map(q => q.id);
  const placeHolders = questionIds.map(() => '?').join(',');

  // Get correct rate Ta in the last 30 days
  const last30Days = await db.get(
    `SELECT COUNT(*) as total, SUM(acertou) as correct 
     FROM Log_Questoes 
     WHERE id_topico = ? AND answered_at >= datetime('now', '-30 days')`,
    [topicId]
  );
  
  let Ta = 0;
  if (last30Days && last30Days.total > 0) {
    Ta = (last30Days.correct / last30Days.total) * 100;
  } else {
    // Fallback to historical all-time rate
    const historical = await db.get(
      `SELECT COUNT(*) as total, SUM(acertou) as correct 
       FROM Log_Questoes 
       WHERE id_topico = ?`,
      [topicId]
    );
    if (historical && historical.total > 0) {
      Ta = (historical.correct / historical.total) * 100;
    } else {
      Ta = 0;
    }
  }

  // Calculate days since last studied (data_ultima_revisao)
  const topic = await db.get('SELECT data_ultima_revisao FROM Topicos WHERE id_topico = ?', [topicId]);
  let daysSince = 0;
  if (topic && topic.data_ultima_revisao) {
    const lastDate = new Date(topic.data_ultima_revisao);
    const now = new Date();
    const diffTime = Math.abs(now - lastDate);
    daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const decayFactor = Math.pow(0.97, daysSince);
  const realMastery = Math.round(Ta * decayFactor);

  return Math.max(0, Math.min(100, realMastery));
}

// SYNC TOPIC MASTERY TABLE FOR PROFILE AND TOPIC
export async function syncTopicMastery(profileId, topicId) {
  try {
    const logs = await db.all(
      `SELECT acertou, tempo_resposta_segundos, confidence, answered_at 
       FROM Log_Questoes 
       WHERE id_topico = ? AND profile_id = ? 
       ORDER BY answered_at DESC`,
      [topicId, profileId]
    );

    if (logs.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      await db.run(
        `INSERT INTO TopicMastery (profile_id, topic_id, mastery, confidence, forgetting_score, last_review, next_review, avg_response_time)
         VALUES (?, ?, 0, 100, 100, NULL, ?, 0)
         ON CONFLICT(profile_id, topic_id) DO UPDATE SET
           mastery=0, confidence=100, forgetting_score=100, last_review=NULL, next_review=excluded.next_review, avg_response_time=0`,
        [profileId, topicId, today]
      );
      return;
    }

    const mastery = await calculateTopicMastery(topicId);

    let totalConfidence = 0;
    logs.forEach(l => {
      if (l.confidence === 'Certeza Absoluta' || !l.confidence) totalConfidence += 100;
      else if (l.confidence === 'Dúvida') totalConfidence += 50;
      else if (l.confidence === 'Chute') totalConfidence += 10;
    });
    const avgConfidence = Math.round(totalConfidence / logs.length);

    const lastReviewDateStr = logs[0].answered_at;
    const lastReview = lastReviewDateStr ? lastReviewDateStr.split('T')[0] : new Date().toISOString().split('T')[0];

    // Ebbinghaus decay calculation for forgetting score
    let daysSince = 0;
    if (lastReviewDateStr) {
      const lastDate = new Date(lastReviewDateStr);
      const now = new Date();
      const diffTime = Math.abs(now - lastDate);
      daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
    const forgetting_score = Math.max(0, Math.min(100, Math.round(100 - (mastery * Math.pow(0.97, daysSince)))));

    // Spaced repetition interval (days until next review)
    let interval = 1;
    if (mastery >= 80 && avgConfidence >= 80) {
      interval = 14;
    } else if (mastery >= 60 && avgConfidence >= 60) {
      interval = 7;
    } else if (mastery >= 40) {
      interval = 3;
    }
    
    const nextReviewDate = new Date(lastReviewDateStr || new Date());
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);
    const next_review = nextReviewDate.toISOString().split('T')[0];

    const totalResponseTime = logs.reduce((acc, l) => acc + (l.tempo_resposta_segundos || 0), 0);
    const avg_response_time = Math.round((totalResponseTime / logs.length) * 10) / 10;

    await db.run(
      `INSERT INTO TopicMastery (profile_id, topic_id, mastery, confidence, forgetting_score, last_review, next_review, avg_response_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, topic_id) DO UPDATE SET
         mastery = excluded.mastery,
         confidence = excluded.confidence,
         forgetting_score = excluded.forgetting_score,
         last_review = excluded.last_review,
         next_review = excluded.next_review,
         avg_response_time = excluded.avg_response_time`,
      [profileId, topicId, mastery, avgConfidence, forgetting_score, lastReview, next_review, avg_response_time]
    );
  } catch (error) {
    console.error('Error syncing TopicMastery:', error);
  }
}

// Sync all topic masteries for a profile
export async function syncAllTopicMasteries(profileId) {
  const topics = await db.all('SELECT id_topico FROM Topicos');
  for (const t of topics) {
    await syncTopicMastery(profileId, t.id_topico);
  }
}

// helper for FGV specific prioritization rules
function getFgvIncidenceMultiplier(subjectName, topicName) {
  const sName = subjectName.toLowerCase();
  const tName = topicName.toLowerCase();

  // Português: sintaxe, análise sintática, orações, regência, interpretação
  if (sName.includes('portuguesa')) {
    if (tName.includes('sintaxe') || tName.includes('sintática') || tName.includes('oração') || tName.includes('orações') || tName.includes('regência') || tName.includes('interpretação')) {
      return 2.5; 
    }
  }

  // Inglês: interpretação de texto, gramática contextual
  if (sName.includes('inglesa')) {
    if (tName.includes('interpretação') || tName.includes('gramática') || tName.includes('contextual')) {
      return 2.0;
    }
  }

  // Raciocínio Lógico: classic problems
  if (sName.includes('raciocínio') || sName.includes('logico') || sName.includes('lógico')) {
    return 1.8;
  }

  return 1.0;
}

// helper for mission titles
function getMissionTitle(mission) {
  const difficultyLabel = mission.difficulty === 'Hard' ? 'HARD 🔥' : (mission.difficulty === 'Easy' ? 'FÁCIL 🟢' : 'MÉDIO 🟡');
  switch (mission.missionType) {
    case 'LEARN':
      return `Aprender (${difficultyLabel}): ${mission.topicName}`;
    case 'REVIEW':
      return `Revisar (${difficultyLabel}): ${mission.topicName}`;
    case 'BOSS':
      return `Desafio do Chefe 👑 (HARD): ${mission.topicName}`;
    case 'MOCK_EXAM':
      return `Simulado FGV DATAPREV 📝`;
    case 'RECOVERY':
      return `Recuperação de Erros 🩹: ${mission.topicName}`;
    default:
      return `Estudar: ${mission.topicName}`;
  }
}

// PLANNER AGENT SERVICE
export const plannerAgent = {
  async generateDailyMission(profileId) {
    const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [profileId]);
    if (!profile) throw new Error('Perfil não encontrado');

    let daysUntilExam = 90;
    if (profile.exam_date) {
      const diffTime = new Date(profile.exam_date) - new Date();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) daysUntilExam = diffDays;
    }

    // sync current topic masteries to ensure data is fresh
    const topicsList = await db.all('SELECT id_topico FROM Topicos');
    for (const t of topicsList) {
      await syncTopicMastery(profileId, t.id_topico);
    }

    const topics = await db.all(
      `SELECT t.id_topico as id, t.nome as name, s.nome as subject_name, s.peso_edital as weight, s.module as subject_module,
              tm.mastery, tm.confidence, tm.forgetting_score, tm.last_review, tm.next_review, tm.avg_response_time
       FROM Topicos t
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
       LEFT JOIN TopicMastery tm ON t.id_topico = tm.topic_id AND tm.profile_id = ?
       WHERE s.profile_id = ?`,
      [profileId, profileId]
    );

    if (topics.length === 0) {
      return {
        missionType: 'LEARN',
        topicId: 1,
        topicName: 'Geral',
        difficulty: 'Easy',
        questions: [],
        reason: 'Nenhum tópico cadastrado no edital ainda.'
      };
    }

    // Determine mission type probabilities based on daysRemaining
    let missionType = 'LEARN';
    const rand = Math.random();

    if (daysUntilExam <= 7) {
      missionType = 'MOCK_EXAM';
    } else if (daysUntilExam <= 15) {
      // 30% learn, 70% review/recovery
      missionType = rand < 0.3 ? 'LEARN' : (rand < 0.85 ? 'REVIEW' : 'RECOVERY');
    } else if (daysUntilExam <= 30) {
      // 50% learn, 50% review/recovery
      missionType = rand < 0.5 ? 'LEARN' : (rand < 0.9 ? 'REVIEW' : 'RECOVERY');
    } else {
      // > 30 days: 70% learn, 30% review/recovery
      missionType = rand < 0.7 ? 'LEARN' : (rand < 0.95 ? 'REVIEW' : 'RECOVERY');
    }

    // Check if we should trigger a BOSS mission (mastery >= 80%)
    const highMasteryTopics = topics.filter(t => (t.mastery || 0) >= 80);
    if (highMasteryTopics.length > 0 && Math.random() < 0.15 && missionType !== 'MOCK_EXAM') {
      missionType = 'BOSS';
    }

    // MOCK_EXAM logic
    if (missionType === 'MOCK_EXAM') {
      // Get 15 questions from multiple topics
      const questions = await db.all(
        `SELECT q.*, t.nome as topic_name, s.nome as subject_name 
         FROM questions q 
         JOIN Topicos t ON q.topic_id = t.id_topico
         JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
         WHERE s.profile_id = ?
         ORDER BY RANDOM() LIMIT 15`,
        [profileId]
      );
      return {
        missionType: 'MOCK_EXAM',
        topicId: null,
        topicName: 'Simulado Geral',
        difficulty: 'Medium',
        questions,
        reason: `Simulado Geral FGV: Faltam apenas ${daysUntilExam} dias para a prova! Teste de resistência mental.`
      };
    }

    // RECOVERY logic
    if (missionType === 'RECOVERY') {
      const recentErrors = await db.all(
        `SELECT DISTINCT q.topic_id 
         FROM Log_Questoes l
         JOIN questions q ON l.question_id = q.id
         WHERE l.profile_id = ? AND l.acertou = 0
         ORDER BY l.answered_at DESC LIMIT 5`,
        [profileId]
      );

      if (recentErrors.length > 0) {
        const errorTopicId = recentErrors[0].topic_id;
        const topic = topics.find(t => t.id === errorTopicId);
        if (topic) {
          const questions = await db.all(
            `SELECT q.* FROM questions q
             WHERE q.topic_id = ? AND q.id IN (
               SELECT question_id FROM Log_Questoes WHERE profile_id = ? AND acertou = 0
             ) LIMIT 5`,
            [errorTopicId, profileId]
          );
          return {
            missionType: 'RECOVERY',
            topicId: errorTopicId,
            topicName: topic.name,
            difficulty: 'Easy',
            questions,
            reason: `Recuperação: Vamos revisar os conceitos e as questões que você errou recentemente em '${topic.name}'.`
          };
        }
      }
      missionType = 'REVIEW'; // Fallback to REVIEW if no errors
    }

    // BOSS logic
    if (missionType === 'BOSS' && highMasteryTopics.length > 0) {
      const selected = highMasteryTopics[Math.floor(Math.random() * highMasteryTopics.length)];
      const questions = await db.all(
        `SELECT * FROM questions WHERE topic_id = ? AND difficulty = 'Hard' LIMIT 5`,
        [selected.id]
      );
      return {
        missionType: 'BOSS',
        topicId: selected.id,
        topicName: selected.name,
        difficulty: 'Hard',
        questions,
        reason: `Desafio do Chefe (BOSS): Teste seus conhecimentos avançados no tópico '${selected.name}' onde seu domínio é de ${selected.mastery || 80}%.`
      };
    }

    // LEARN / REVIEW ranking logic
    const ranked = [];
    for (const t of topics) {
      let fgv_multiplier = getFgvIncidenceMultiplier(t.subject_name, t.name);
      
      // If topic is mentioned in imported questions, it has higher incidence
      const importedCount = await db.get(
        `SELECT COUNT(*) as count FROM questions WHERE topic_id = ? AND source = 'imported'`,
        [t.id]
      );
      if (importedCount && importedCount.count > 0) {
        fgv_multiplier *= 2.0;
      }

      const weight = t.weight || 1.0;
      const mastery = t.mastery || 0;
      const forgetting = t.forgetting_score || 0;

      let score = 0;
      if (missionType === 'LEARN') {
        score = weight * fgv_multiplier * (100 - mastery);
      } else {
        score = weight * fgv_multiplier * (forgetting + 10);
      }

      ranked.push({ topic: t, score });
    }

    ranked.sort((a, b) => b.score - a.score);
    const selectedTopic = ranked[0].topic;

    // Difficulty scaler based on mastery and average response time
    let difficulty = 'Medium';
    if (selectedTopic.mastery < 45) {
      difficulty = 'Easy';
    } else if (selectedTopic.mastery > 75 || (selectedTopic.avg_response_time && selectedTopic.avg_response_time < 30)) {
      difficulty = 'Hard';
    }

    // If Logical Reasoning, prioritize Medium per FGV guidelines
    if (selectedTopic.subject_name.toLowerCase().includes('raciocínio') || selectedTopic.subject_name.toLowerCase().includes('lógico')) {
      difficulty = 'Medium';
    }

    // Get questions from DB
    let questions = await db.all('SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT 5', [selectedTopic.id]);

    // If not enough questions, return whatever we have or let the generator replenish it
    const reason = missionType === 'LEARN'
      ? `Aprendizado: Tópico '${selectedTopic.name}' da matéria '${selectedTopic.subject_name}', priorizado conforme peso no edital e relevância na FGV.`
      : `Revisão Espaçada: Tópico '${selectedTopic.name}' está com score de esquecimento de ${selectedTopic.forgetting_score || 0}%. Hora de reforçar!`;

    return {
      missionType,
      topicId: selectedTopic.id,
      topicName: selectedTopic.name,
      difficulty,
      questions,
      reason
    };
  },

  async generateComplementaryMission(profileId, excludeTopicId) {
    try {
      const topics = await db.all(
        `SELECT t.id_topico as id, t.nome as name, s.nome as subject_name, s.peso_edital as weight,
                tm.mastery, tm.forgetting_score
         FROM Topicos t
         JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
         LEFT JOIN TopicMastery tm ON t.id_topico = tm.topic_id AND tm.profile_id = ?
         WHERE s.profile_id = ? AND t.id_topico != ?`,
        [profileId, profileId, excludeTopicId]
      );

      if (topics.length === 0) return null;

      // Select a review topic that has mastery > 0
      const reviewTopics = topics.filter(t => (t.mastery || 0) > 0);
      if (reviewTopics.length > 0) {
        reviewTopics.sort((a, b) => (b.forgetting_score || 0) - (a.forgetting_score || 0));
        const selected = reviewTopics[0];
        const questions = await db.all('SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT 5', [selected.id]);
        return {
          missionType: 'REVIEW',
          topicId: selected.id,
          topicName: selected.name,
          difficulty: 'Medium',
          questions,
          reason: `Revisão Recomendada: Evite o esquecimento de '${selected.name}'.`
        };
      }

      // If no studied topics to review, pick any learn topic
      const selected = topics[Math.floor(Math.random() * topics.length)];
      const questions = await db.all('SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT 5', [selected.id]);
      return {
        missionType: 'LEARN',
        topicId: selected.id,
        topicName: selected.name,
        difficulty: 'Easy',
        questions,
        reason: `Estudo Adaptativo: Explore um novo assunto: '${selected.name}'.`
      };
    } catch (e) {
      return null;
    }
  }
};

// IMPORT LOGIC (supports banca + profile_id + module)
export async function importSubjectJSON(data) {
  const now = new Date().toISOString();
  const bancaName = data.banca || 'Geral';
  const profileId = await getActiveProfileId();
  const moduleType = data.module || 'general'; // 'general' or 'specific'
  
  // 1. Insert or get subject for this profile
  let subject = await db.get('SELECT id_disciplina FROM Disciplinas WHERE nome = ? AND profile_id = ?', [data.subject, profileId]);
  let subjectId;
  if (!subject) {
    const result = await db.run(
      'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)',
      [profileId, data.subject, moduleType === 'specific' ? 2.5 : 1.0, bancaName, moduleType, now, now]
    );
    subjectId = result.lastID;
  } else {
    subjectId = subject.id_disciplina;
    await db.run('UPDATE Disciplinas SET last_studied_at = ?, banca = ?, module = ? WHERE id_disciplina = ?', [now, bancaName, moduleType, subjectId]);
  }

  // 2. Insert topic
  const topicResult = await db.run(
    'INSERT INTO Topicos (id_disciplina, nome, summary, percentual_dominio, data_ultima_revisao, status_plantacao) VALUES (?, ?, ?, 0, ?, ?)',
    [subjectId, data.topic, data.summary, now, 'semente']
  );
  const topicId = topicResult.lastID;

  // 3. Insert flashcards
  if (data.flashcards && Array.isArray(data.flashcards)) {
    const today = new Date().toISOString().split('T')[0];
    for (const fc of data.flashcards) {
      await db.run(
        'INSERT INTO flashcards (topic_id, front, back, box, next_review_date) VALUES (?, ?, ?, 1, ?)',
        [topicId, fc.front, fc.back, today]
      );
    }
  }

  // 4. Insert questions (with module, type, code_lines, key_line_index)
  if (data.questions && Array.isArray(data.questions)) {
    for (const q of data.questions) {
      const qModule = q.module || moduleType;
      const qType = q.type || 'text';
      const codeLines = q.code_lines ? JSON.stringify(q.code_lines) : null;
      const keyLineIndex = q.key_line_index !== undefined ? q.key_line_index : null;
      await db.run(
        'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source, module, type, code_lines, key_line_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          topicId,
          q.question,
          JSON.stringify(q.options),
          q.correct_answer,
          q.explanation,
          q.difficulty || 'Medium',
          'imported',
          qModule,
          qType,
          codeLines,
          keyLineIndex
        ]
      );
    }
  }

  return { subjectId, topicId };
}

// IMPORT EDITAL: suporta múltiplos tópicos e múltiplas matérias em um único payload
export async function importEditalJSON(data) {
  const now = new Date().toISOString();
  const profileId = await getActiveProfileId();
  const bancaName = data.banca || 'Geral';

  // Caso o payload já venha com várias matérias
  if (Array.isArray(data.subjects) && data.subjects.length > 0) {
    const created = [];
    for (const subj of data.subjects) {
      const subjName = subj.subject || subj.name || 'Matéria';
      let subjectRow = await db.get('SELECT id_disciplina FROM Disciplinas WHERE nome = ? AND profile_id = ?', [subjName, profileId]);
      let subjectId;
      if (!subjectRow) {
        const r = await db.run(
          'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)',
          [profileId, subjName, subj.module === 'specific' ? 2.5 : 1.0, bancaName, subj.module || 'general', now, now]
        );
        subjectId = r.lastID;
      } else {
        subjectId = subjectRow.id_disciplina;
        await db.run('UPDATE Disciplinas SET last_studied_at = ?, banca = ? WHERE id_disciplina = ?', [now, bancaName, subjectId]);
      }

      // Inserir tópicos se existirem
      if (Array.isArray(subj.topics)) {
        for (const t of subj.topics) {
          const topicName = t.topic || t.name || 'Tópico';
          const summary = t.summary || t.summary_text || '';
          const topicRes = await db.run(
            'INSERT INTO Topicos (id_disciplina, nome, summary, percentual_dominio, data_ultima_revisao, status_plantacao) VALUES (?, ?, ?, 0, ?, ?)',
            [subjectId, topicName, summary, now, 'semente']
          );
          const topicId = topicRes.lastID;

          if (Array.isArray(t.flashcards)) {
            const today = new Date().toISOString().split('T')[0];
            for (const fc of t.flashcards) {
              await db.run('INSERT INTO flashcards (topic_id, front, back, box, next_review_date) VALUES (?, ?, ?, 1, ?)', [topicId, fc.front, fc.back, today]);
            }
          }

          if (Array.isArray(t.questions)) {
            for (const q of t.questions) {
              await db.run(
                'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source, module, type, code_lines, key_line_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  topicId,
                  q.question,
                  JSON.stringify(q.options || []),
                  q.correct_answer || '',
                  q.explanation || '',
                  q.difficulty || 'Medium',
                  'imported',
                  q.module || (subj.module || 'general'),
                  q.type || 'text',
                  q.code_lines ? JSON.stringify(q.code_lines) : null,
                  q.key_line_index !== undefined ? q.key_line_index : null
                ]
              );
            }
          }
        }
      }

      created.push({ subject: subjName });
    }

    return { createdCount: created.length };
  }

  // Caso venha um único objeto com topics[] ou schedule[]
  const subjectName = data.subject || 'Edital';
  let subjectRow = await db.get('SELECT id_disciplina FROM Disciplinas WHERE nome = ? AND profile_id = ?', [subjectName, profileId]);
  let subjectId;
  if (!subjectRow) {
    const r = await db.run(
      'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)',
      [profileId, subjectName, data.module === 'specific' ? 2.5 : 1.0, bancaName, data.module || 'general', now, now]
    );
    subjectId = r.lastID;
  } else {
    subjectId = subjectRow.id_disciplina;
    await db.run('UPDATE Disciplinas SET last_studied_at = ?, banca = ? WHERE id_disciplina = ?', [now, bancaName, subjectId]);
  }

  const createdTopics = [];

  if (Array.isArray(data.topics) && data.topics.length > 0) {
    for (const t of data.topics) {
      const topicName = t.topic || t.name || 'Tópico';
      const summary = t.summary || '';
      const topicRes = await db.run('INSERT INTO Topicos (id_disciplina, nome, summary, percentual_dominio, data_ultima_revisao, status_plantacao) VALUES (?, ?, ?, 0, ?, ?)', [subjectId, topicName, summary, now, 'semente']);
      const topicId = topicRes.lastID;

      if (Array.isArray(t.flashcards)) {
        const today = new Date().toISOString().split('T')[0];
        for (const fc of t.flashcards) {
          await db.run('INSERT INTO flashcards (topic_id, front, back, box, next_review_date) VALUES (?, ?, ?, 1, ?)', [topicId, fc.front, fc.back, today]);
        }
      }

      if (Array.isArray(t.questions)) {
        for (const q of t.questions) {
          await db.run(
            'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source, module, type, code_lines, key_line_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              topicId,
              q.question,
              JSON.stringify(q.options || []),
              q.correct_answer || '',
              q.explanation || '',
              q.difficulty || 'Medium',
              'imported',
              q.module || data.module || 'general',
              q.type || 'text',
              q.code_lines ? JSON.stringify(q.code_lines) : null,
              q.key_line_index !== undefined ? q.key_line_index : null
            ]
          );
        }
      }

      createdTopics.push(topicName);
    }
  } else if (Array.isArray(data.schedule) && data.schedule.length > 0) {
    for (const s of data.schedule) {
      const topicName = s.topic_name || s.topic || 'Tópico do Edital';
      const topicRes = await db.run('INSERT INTO Topicos (id_disciplina, nome, summary, percentual_dominio, data_ultima_revisao, status_plantacao) VALUES (?, ?, ?, 0, ?, ?)', [subjectId, topicName, s.summary || '', now, 'semente']);
      createdTopics.push(topicName);
    }
  } else {
    // Fallback: use importSubjectJSON for single-topic payloads
    return await importSubjectJSON(data);
  }

  return { subjectId, topicsCreated: createdTopics.length, topics: createdTopics };
}

// STUDY INTERACTIONS
export async function getQuestions(topicId, count = 5) {
  // Módulo 5.5: Intercalação Forçada
  const topic = await db.get('SELECT id_disciplina FROM Topicos WHERE id_topico = ?', [topicId]);
  let isRedes = false;
  let subjectId = null;
  if (topic) {
    subjectId = topic.id_disciplina;
    const subject = await db.get('SELECT nome FROM Disciplinas WHERE id_disciplina = ?', [subjectId]);
    if (subject && subject.nome.toLowerCase().includes('redes')) {
      isRedes = true;
    }
  }

  let finalCount = count;
  let questions = await db.all(
    'SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT ?',
    [topicId, finalCount]
  );

  if (isRedes && questions.length > 0) {
    const profileId = await getActiveProfileId();
    const otherQuestions = await db.all(
      `SELECT q.* 
       FROM questions q
       JOIN Topicos t ON q.topic_id = t.id_topico
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
       WHERE s.id_disciplina != ? AND s.profile_id = ? AND t.percentual_dominio < 60
       ORDER BY RANDOM() LIMIT 2`,
      [subjectId, profileId]
    );

    if (otherQuestions.length > 0) {
      if (questions.length >= 5 && otherQuestions[0]) {
        questions.splice(4, 0, otherQuestions[0]);
      }
      if (questions.length >= 10 && otherQuestions[1]) {
        questions.splice(9, 0, otherQuestions[1]);
      }
    }
  }

  return questions;
}

export async function getFlashcards(topicId) {
  const today = new Date().toISOString().split('T')[0];
  return await db.all(
    'SELECT * FROM flashcards WHERE topic_id = ? AND next_review_date <= ?',
    [topicId, today]
  );
}

export async function getAllQuestionsCount(subjectId) {
  const countObj = await db.get(
    `SELECT COUNT(*) as count 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     WHERE t.id_disciplina = ?`,
    [subjectId]
  );
  return countObj.count;
}

export async function getRandomEncounter() {
  const questions = await db.all(
    `SELECT q.*, t.nome as topic_name, s.nome as subject_name 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
     ORDER BY RANDOM() LIMIT 3`
  );
  return questions;
}

export async function getBossFight(subjectId) {
  const questions = await db.all(
    `SELECT q.*, t.nome as topic_name 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     WHERE t.id_disciplina = ? 
     ORDER BY RANDOM() LIMIT 10`,
    [subjectId]
  );
  return questions;
}

// INTERLEAVED STUDY SESSION ALGORITHM
// 30% New Questions, 50% Spaced Repetition, 20% Bosses/Redemption
export async function getInterleavedSession(count = 10) {
  const newCount = Math.round(count * 0.3); // 3
  const srCount = Math.round(count * 0.5);  // 5
  const bossCount = count - newCount - srCount; // 2

  let selectedQuestions = [];
  const addedIds = new Set();

  // 1. Get Bosses/Redemption (previously incorrect)
  const bossQuestions = await db.all(
    `SELECT q.*, t.nome as topic_name, s.nome as subject_name
     FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
     WHERE q.id IN (
       SELECT question_id FROM Log_Questoes WHERE acertou = 0
     )
     ORDER BY RANDOM() LIMIT ?`,
    [bossCount]
  );
  
  bossQuestions.forEach(q => {
    selectedQuestions.push({ ...q, category: 'Boss/Redenção' });
    addedIds.add(q.id);
  });

  // 2. Get Spaced Repetition (topics with mastery < 70%)
  const lowMasteryTopics = await db.all('SELECT id_topico as id FROM Topicos WHERE percentual_dominio < 70 AND percentual_dominio > 0');
  if (lowMasteryTopics.length > 0) {
    const topicIds = lowMasteryTopics.map(t => t.id);
    const placeholders = topicIds.map(() => '?').join(',');
    const srQuestions = await db.all(
      `SELECT q.*, t.nome as topic_name, s.nome as subject_name
       FROM questions q
       JOIN Topicos t ON q.topic_id = t.id_topico
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
       WHERE q.topic_id IN (${placeholders}) AND q.id NOT IN (${Array.from(addedIds).map(() => '?').join(',') || 'NULL'})
       ORDER BY RANDOM() LIMIT ?`,
      [...topicIds, ...Array.from(addedIds), srCount]
    );
    srQuestions.forEach(q => {
      selectedQuestions.push({ ...q, category: 'Repetição Espaçada' });
      addedIds.add(q.id);
    });
  }

  // 3. Get New questions (correct_count + incorrect_count = 0)
  const newQuestions = await db.all(
    `SELECT q.*, t.nome as topic_name, s.nome as subject_name
     FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
     WHERE (q.correct_count + q.incorrect_count = 0) AND q.id NOT IN (${Array.from(addedIds).map(() => '?').join(',') || 'NULL'})
     ORDER BY RANDOM() LIMIT ?`,
    [...Array.from(addedIds), newCount]
  );
  newQuestions.forEach(q => {
    selectedQuestions.push({ ...q, category: 'Nova' });
    addedIds.add(q.id);
  });

  // 4. Fallback if selected count < count
  if (selectedQuestions.length < count) {
    const fillCount = count - selectedQuestions.length;
    const fallbackQuestions = await db.all(
      `SELECT q.*, t.nome as topic_name, s.name as subject_name
       FROM questions q
       JOIN Topicos t ON q.topic_id = t.id_topico
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
       WHERE q.id NOT IN (${Array.from(addedIds).map(() => '?').join(',') || 'NULL'})
       ORDER BY RANDOM() LIMIT ?`,
      [...Array.from(addedIds), fillCount]
    );
    fallbackQuestions.forEach(q => {
      selectedQuestions.push({ ...q, category: 'Geral' });
    });
  }

  return selectedQuestions;
}

export async function submitQuestionAnswer(questionId, selectedAnswer, responseTimeSeconds) {
  const profileId = await getActiveProfileId();
  const question = await db.get('SELECT * FROM questions WHERE id = ?', [questionId]);
  if (!question) throw new Error('Questão não encontrada');

  const isCorrect = question.correct_answer === selectedAnswer ? 1 : 0;
  const now = new Date().toISOString();

  // Determine if this is a Módulo II (specific) question → 2.5x multiplier
  const isSpecific = question.module === 'specific';
  const xpMultiplier = isSpecific ? 2.5 : 1.0;

  // Insert into history with profile_id
  await db.run(
    'INSERT INTO Log_Questoes (question_id, profile_id, acertou, answered_at, tempo_resposta_segundos) VALUES (?, ?, ?, ?, ?)',
    [questionId, profileId, isCorrect, now, responseTimeSeconds]
  );

  // Update counters
  if (isCorrect) {
    await db.run(
      'UPDATE questions SET correct_count = correct_count + 1, last_answered_at = ? WHERE id = ?',
      [now, questionId]
    );
  } else {
    await db.run(
      'UPDATE questions SET incorrect_count = incorrect_count + 1, last_answered_at = ? WHERE id = ?',
      [now, questionId]
    );
  }

  // Update topic and subject last studied date
  const topic = await db.get('SELECT * FROM Topicos WHERE id_topico = ?', [question.topic_id]);
  await db.run('UPDATE Topicos SET data_ultima_revisao = ? WHERE id_topico = ?', [now, topic.id_topico]);
  await db.run('UPDATE Disciplinas SET last_studied_at = ? WHERE id_disciplina = ?', [now, topic.id_disciplina]);

  // Gamification calculations
  let xpGained = 0;
  let coinsGained = 0;
  let speedBonus = false;
  let redemptionBonus = false;
  let criticalHit = false;

  if (isCorrect) {
    const baseXp = Math.round(10 * xpMultiplier);
    xpGained += baseXp;
    coinsGained += isSpecific ? 5 : 2;

    // Critical Hit: specific module + hard difficulty
    if (isSpecific && question.difficulty === 'Hard') {
      xpGained = 250;
      coinsGained = 15;
      criticalHit = true;
    }

    if (responseTimeSeconds < 60) {
      xpGained += Math.round(5 * xpMultiplier);
      coinsGained += isSpecific ? 3 : 1;
      speedBonus = true;
    }

    const previousAttempts = await db.get(
      'SELECT COUNT(*) as count FROM Log_Questoes WHERE question_id = ? AND acertou = 0',
      [questionId]
    );
    const correctAttempts = await db.get(
      'SELECT COUNT(*) as count FROM Log_Questoes WHERE question_id = ? AND acertou = 1',
      [questionId]
    );

    if (previousAttempts.count > 0 && correctAttempts.count === 1) {
      xpGained += Math.round(15 * xpMultiplier);
      coinsGained += 5;
      redemptionBonus = true;
    }
  } else {
    xpGained = 1;
    coinsGained = 0;
  }

  const currentMastery = await calculateTopicMastery(topic.id_topico);
  await db.run('UPDATE Topicos SET percentual_dominio = ? WHERE id_topico = ?', [currentMastery, topic.id_topico]);
  await syncTopicMastery(profileId, topic.id_topico);

  let bossFightTriggered = false;
  if (currentMastery >= 80) {
    const existingBossQs = await db.get(
      "SELECT COUNT(*) as count FROM questions WHERE topic_id = ? AND difficulty = 'Hard' AND source = 'AI_ON_DEMAND'",
      [topic.id_topico]
    );
    if (existingBossQs.count === 0) {
      runGeneratorEngineInBackground(topic.id_topico, 'boss_fight');
      bossFightTriggered = true;
    }
  }

  const profileUpdate = await updateXP(xpGained, coinsGained, topic.id_disciplina);

  return {
    isCorrect,
    correctAnswer: question.correct_answer,
    explanation: question.explanation,
    xpGained,
    coinsGained,
    speedBonus,
    redemptionBonus,
    criticalHit,
    isSpecific,
    xpMultiplier,
    questionModule: question.module,
    userProfile: profileUpdate
  };
}

export async function submitFlashcardScore(flashcardId, score) {
  const fc = await db.get('SELECT * FROM flashcards WHERE id = ?', [flashcardId]);
  if (!fc) throw new Error('Flashcard não encontrado');

  let newBox = fc.box;
  if (score === 3) {
    newBox = Math.min(5, fc.box + 1);
  } else if (score === 1) {
    newBox = 1;
  } else {
    if (fc.box === 1) newBox = 2;
  }

  const intervals = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };
  const days = intervals[newBox] || 1;

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  await db.run(
    'UPDATE flashcards SET box = ?, next_review_date = ? WHERE id = ?',
    [newBox, nextDateStr, flashcardId]
  );

  let xpGained = 5;
  let coinsGained = 1;
  if (score === 3) {
    xpGained = 8;
  } else if (score === 1) {
    xpGained = 3;
  }

  const topic = await db.get('SELECT * FROM Topicos WHERE id_topico = ?', [fc.topic_id]);
  const now = new Date().toISOString();
  await db.run('UPDATE Topicos SET data_ultima_revisao = ? WHERE id_topico = ?', [now, topic.id_topico]);
  await db.run('UPDATE Disciplinas SET last_studied_at = ? WHERE id_disciplina = ?', [now, topic.id_disciplina]);

  const profileUpdate = await updateXP(xpGained, coinsGained, topic.id_disciplina);
  const profileId = await getActiveProfileId();
  await syncTopicMastery(profileId, fc.topic_id);

  return {
    newBox,
    nextReviewDate: nextDateStr,
    xpGained,
    coinsGained,
    userProfile: profileUpdate
  };
}

export async function getStudyLogs() {
  return await db.all(
    `SELECT 
      ah.answered_at as data_hora,
      s.nome as materia,
      t.nome as topico,
      q.question_text as questao,
      CASE WHEN ah.acertou = 1 THEN 'ACERTO' ELSE 'ERRO' END as resultado,
      ah.tempo_resposta_segundos as tempo_resposta
     FROM Log_Questoes ah
     JOIN questions q ON ah.question_id = q.id
     JOIN Topicos t ON q.topic_id = t.id_topico
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
     ORDER BY ah.answered_at DESC`
  );
}

export async function saveStudySchedule(scheduleItems) {
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return;
  const profileId = await getActiveProfileId();

  // Ensure the active profile only keeps the latest generated edital schedule
  await db.run('DELETE FROM study_schedule WHERE profile_id = ?', [profileId]);

  for (const item of scheduleItems) {
    await db.run(
      'INSERT INTO study_schedule (profile_id, subject_name, topic_name, study_date, days_left_indicator, status) VALUES (?, ?, ?, ?, ?, ?)',
      [profileId, item.subject_name, item.topic_name, item.study_date, item.days_left_indicator, 'Pendente']
    );
  }
}

export async function getStudySchedule() {
  const profileId = await getActiveProfileId();
  return await db.all('SELECT * FROM study_schedule WHERE profile_id = ? ORDER BY study_date ASC, id ASC', [profileId]);
}

export async function completeScheduleItem(itemId) {
  const item = await db.get('SELECT * FROM study_schedule WHERE id = ?', [itemId]);
  if (!item) throw new Error('Tarefa não encontrada');

  if (item.status === 'Concluído') return { status: 'Concluído' };

  await db.run('UPDATE study_schedule SET status = ? WHERE id = ?', ['Concluído', itemId]);

  const subject = await db.get('SELECT id_disciplina as id FROM Disciplinas WHERE nome = ?', [item.subject_name]);
  const subjectId = subject ? subject.id : null;

  const profileUpdate = await updateXP(15, 5, subjectId);

  return {
    status: 'Concluído',
    xpGained: 15,
    coinsGained: 5,
    userProfile: profileUpdate
  };
}

export async function resetFatigueCounter(subjectId = null) {
  if (subjectId) {
    await db.run('UPDATE Disciplinas SET consecutive_answers = 0 WHERE id_disciplina = ?', [subjectId]);
  } else {
    await db.run('UPDATE Disciplinas SET consecutive_answers = 0');
  }
}

export async function getDiagnosticQuestions() {
  const profileId = await getActiveProfileId();
  
  // We want exactly 10 Easy, 10 Medium, 10 Hard questions (total 30) from the user's subjects
  const easy = await db.all(
    `SELECT q.*, s.nome as subject_name, s.id_disciplina as subject_id, t.nome as topic_name 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
     WHERE s.profile_id = ? AND q.difficulty = 'Easy'
     ORDER BY RANDOM() LIMIT 10`,
    [profileId]
  );
  
  const medium = await db.all(
    `SELECT q.*, s.nome as subject_name, s.id_disciplina as subject_id, t.nome as topic_name 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
     WHERE s.profile_id = ? AND q.difficulty = 'Medium'
     ORDER BY RANDOM() LIMIT 10`,
    [profileId]
  );
  
  const hard = await db.all(
    `SELECT q.*, s.nome as subject_name, s.id_disciplina as subject_id, t.nome as topic_name 
     FROM questions q 
     JOIN Topicos t ON q.topic_id = t.id_topico 
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
     WHERE s.profile_id = ? AND q.difficulty = 'Hard'
     ORDER BY RANDOM() LIMIT 10`,
    [profileId]
  );

  let merged = [...easy, ...medium, ...hard];
  
  // Fallback if there aren't enough questions of each difficulty
  if (merged.length < 30) {
    const ids = merged.map(x => x.id);
    const placeholders = ids.map(() => '?').join(',') || 'NULL';
    const fallback = await db.all(
      `SELECT q.*, s.nome as subject_name, s.id_disciplina as subject_id, t.nome as topic_name 
       FROM questions q 
       JOIN Topicos t ON q.topic_id = t.id_topico 
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
       WHERE s.profile_id = ? AND q.id NOT IN (${placeholders})
       ORDER BY RANDOM() LIMIT ?`,
      [profileId, ...ids, 30 - merged.length]
    );
    merged = [...merged, ...fallback];
  }

  merged.sort(() => Math.random() - 0.5);
  return merged;
}

export async function updateSubjectLevel(subjectId, level) {
  await db.run('UPDATE Disciplinas SET nivel_atual = ? WHERE id_disciplina = ?', [level, subjectId]);
}

export async function setSubjectWeight(subjectId, weight) {
  await db.run('UPDATE Disciplinas SET peso_edital = ? WHERE id_disciplina = ?', [weight, subjectId]);
}

export async function cureMentalFog() {
  const profileId = await getActiveProfileId();
  await db.run('UPDATE profiles SET mental_fog = 0 WHERE id = ?', [profileId]);
  return await getProfile();
}

// ============================
// HARD RESET MECHANIC
// ============================
export async function checkAndLockCriticalSubjects() {
  const profileId = await getActiveProfileId();
  const subjects = await db.all('SELECT id_disciplina as id, percentual_dominio as mastery, * FROM Disciplinas s JOIN Topicos t ON s.id_disciplina = t.id_disciplina WHERE s.profile_id = ?', [profileId]);
  
  // Group topics by subject and calculate average mastery
  const grouped = {};
  subjects.forEach(s => {
    if (!grouped[s.id_disciplina]) {
      grouped[s.id_disciplina] = { name: s.nome, masterySum: 0, count: 0, last_studied_at: s.last_studied_at };
    }
    grouped[s.id_disciplina].masterySum += s.percentual_dominio || 0;
    grouped[s.id_disciplina].count += 1;
  });

  const criticalSubjects = [];
  for (const id in grouped) {
    const avgMastery = grouped[id].masterySum / grouped[id].count;
    if (avgMastery < 15 && grouped[id].last_studied_at !== null) {
      criticalSubjects.push({ id: parseInt(id), name: grouped[id].name, mastery: Math.round(avgMastery) });
    }
  }

  if (criticalSubjects.length === 0) return { hasCritical: false, criticalSubjects: [] };
  
  const profile = await getProfile();
  const lockedList = JSON.parse(profile.locked_subjects || '[]');
  
  for (const sub of criticalSubjects) {
    if (!lockedList.includes(sub.id)) {
      lockedList.push(sub.id);
    }
  }
  
  await db.run('UPDATE profiles SET locked_subjects = ? WHERE id = ?', [JSON.stringify(lockedList), profileId]);
  
  return { hasCritical: true, criticalSubjects };
}

export async function getSampleQuestion(subjectId) {
  const q = await db.get(
    `SELECT q.* FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     WHERE t.id_disciplina = ? AND q.difficulty = 'Easy'
     ORDER BY RANDOM() LIMIT 1`,
    [subjectId]
  );
  if (!q) {
    return await db.get(
      `SELECT q.* FROM questions q
       JOIN Topicos t ON q.topic_id = t.id_topico
       WHERE t.id_disciplina = ? ORDER BY RANDOM() LIMIT 1`,
      [subjectId]
    );
  }
  return q;
}

export async function generateDailyQuests() {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();

  let daysLeft = 90;
  if (profile && profile.exam_date) {
    const diff = new Date(profile.exam_date) - new Date();
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (diffDays > 0) daysLeft = diffDays;
  }

  let phase = 'Cultivation';
  if (daysLeft < 30) {
    phase = 'Harvest';
  } else if (daysLeft <= 60) {
    phase = 'Lapidation';
  }

  const dayOfWeek = new Date().getDay();

  // Call plannerAgent to get a personalized daily mission
  const mission = await plannerAgent.generateDailyMission(profileId);

  let quests = [];

  // Quest 1: Primary Mission (LEARN, REVIEW, BOSS, MOCK_EXAM, RECOVERY)
  quests.push({
    id: `daily-mission-primary`,
    type: mission.missionType.toLowerCase(),
    title: getMissionTitle(mission),
    desc: mission.reason,
    target: mission.questions && mission.questions.length > 0 ? mission.questions.length : 5,
    reward: mission.missionType === 'BOSS' ? 120 : (mission.missionType === 'MOCK_EXAM' ? 200 : 80),
    rewardType: 'xp',
    progress: 0,
    completed: false,
    topicId: mission.topicId,
    missionType: mission.missionType,
    difficulty: mission.difficulty
  });

  // Quest 2: Secondary / Complementary study mission
  const complementary = await plannerAgent.generateComplementaryMission(profileId, mission.topicId || 0);
  if (complementary) {
    quests.push({
      id: `daily-mission-secondary`,
      type: complementary.missionType.toLowerCase(),
      title: getMissionTitle(complementary),
      desc: complementary.reason,
      target: complementary.questions && complementary.questions.length > 0 ? complementary.questions.length : 5,
      reward: 60,
      rewardType: 'xp',
      progress: 0,
      completed: false,
      topicId: complementary.topicId,
      missionType: complementary.missionType,
      difficulty: complementary.difficulty
    });
  } else {
    quests.push({
      id: 'offensive-quest',
      type: 'learn',
      title: 'Neuroplasticidade: Pratique evocações ativas em tópicos de peso alto.',
      desc: 'Fixação de conteúdos para reter memória de longo prazo.',
      target: 5,
      reward: 50,
      rewardType: 'xp',
      progress: 0,
      completed: false,
      topicId: mission.topicId
    });
  }

  // Quest 3: Dopamine Roulette (Keep high precision)
  quests.push({
    id: 'dopamine-roulette',
    type: 'roulette',
    title: 'Caçador de Recompensas: Obtenha precisão acima de 80% nas baterias.',
    desc: 'Mantenha o foco absoluto estilo FGV.',
    target: 5,
    reward: 100,
    rewardType: 'chest',
    progress: 0,
    completed: false
  });

  return {
    quests,
    phase,
    daysLeft,
    dayOfWeek
  };
}

export async function toggleTDAHMode() {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  const nextVal = profile.tdah_mode === 1 ? 0 : 1;
  await db.run('UPDATE profiles SET tdah_mode = ? WHERE id = ?', [nextVal, profileId]);
  return await getProfile();
}

export async function lockSubject(subjectId) {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  const list = JSON.parse(profile.locked_subjects || '[]');
  if (!list.includes(subjectId)) {
    list.push(subjectId);
    await db.run('UPDATE profiles SET locked_subjects = ? WHERE id = ?', [JSON.stringify(list), profileId]);
  }
}

export async function unlockSubject(subjectId) {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  const list = JSON.parse(profile.locked_subjects || '[]');
  const idx = list.indexOf(subjectId);
  if (idx !== -1) {
    list.splice(idx, 1);
    await db.run('UPDATE profiles SET locked_subjects = ? WHERE id = ?', [JSON.stringify(list), profileId]);
  }
}

// ============================
// MARATHON (SIMULADOR DE FADIGA)
// ============================
export async function generateMarathon() {
  const profileId = await getActiveProfileId();
  
  // 40 general questions (1pt each) + 30 specific (2.5pts each) = 70 total
  const generalQuestions = await db.all(
    `SELECT q.*, t.nome as topic_name, s.nome as subject_name, s.module as subject_module
     FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
     WHERE s.profile_id = ? AND (q.module = 'general' OR s.module = 'general')
     ORDER BY RANDOM() LIMIT 40`,
    [profileId]
  );
  
  const specificQuestions = await db.all(
    `SELECT q.*, t.nome as topic_name, s.nome as subject_name, s.module as subject_module
     FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
     WHERE s.profile_id = ? AND (q.module = 'specific' OR s.module = 'specific')
     ORDER BY RANDOM() LIMIT 30`,
    [profileId]
  );

  // Fallback: if not enough module-specific questions, fill from all
  let allQuestions = [...generalQuestions, ...specificQuestions];
  if (allQuestions.length < 10) {
    allQuestions = await db.all(
      `SELECT q.*, t.nome as topic_name, s.nome as subject_name
       FROM questions q
       JOIN Topicos t ON q.topic_id = t.id_topico
       JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina
       WHERE s.profile_id = ?
       ORDER BY RANDOM() LIMIT 70`,
      [profileId]
    );
  }

  // Shuffle
  allQuestions.sort(() => Math.random() - 0.5);

  return {
    questions: allQuestions,
    totalGeneral: generalQuestions.length,
    totalSpecific: specificQuestions.length,
    durationMinutes: 240
  };
}

export async function submitMarathonResult(answers, startedAt, finishedAt) {
  const profileId = await getActiveProfileId();
  
  let correctGeneral = 0, totalGeneral = 0;
  let correctSpecific = 0, totalSpecific = 0;
  let totalXp = 0;

  for (const ans of answers) {
    const q = await db.get('SELECT * FROM questions WHERE id = ?', [ans.questionId]);
    if (!q) continue;
    const isCorrect = q.correct_answer === ans.selectedAnswer ? 1 : 0;
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO Log_Questoes (question_id, profile_id, acertou, answered_at, tempo_resposta_segundos) VALUES (?, ?, ?, ?, ?)',
      [ans.questionId, profileId, isCorrect, now, ans.responseTime || 0]
    );
    if (isCorrect) {
      await db.run('UPDATE questions SET correct_count = correct_count + 1 WHERE id = ?', [ans.questionId]);
    } else {
      await db.run('UPDATE questions SET incorrect_count = incorrect_count + 1 WHERE id = ?', [ans.questionId]);
    }

    const isSpec = q.module === 'specific';
    if (isSpec) {
      totalSpecific++;
      if (isCorrect) { correctSpecific++; totalXp += 25; }
    } else {
      totalGeneral++;
      if (isCorrect) { correctGeneral++; totalXp += 10; }
    }
  }

  const scoreGeneral = totalGeneral > 0 ? (correctGeneral / totalGeneral) * 40 : 0;
  const scoreSpecific = totalSpecific > 0 ? (correctSpecific / totalSpecific) * 75 : 0;
  const totalScore = scoreGeneral + scoreSpecific;

  await db.run(
    `INSERT INTO marathon_results (profile_id, started_at, finished_at, total_questions, correct_count, score_general, score_specific, total_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [profileId, startedAt, finishedAt, answers.length, correctGeneral + correctSpecific, scoreGeneral, scoreSpecific, totalScore]
  );

  // Award XP for completing marathon
  await updateXP(totalXp + 500, 100);

  return {
    scoreGeneral: Math.round(scoreGeneral * 10) / 10,
    scoreSpecific: Math.round(scoreSpecific * 10) / 10,
    totalScore: Math.round(totalScore * 10) / 10,
    correctGeneral,
    correctSpecific,
    totalGeneral,
    totalSpecific,
    approved: totalScore >= 57.5 && correctGeneral > 0 && correctSpecific > 0
  };
}

export async function setDiagnosticCompleted() {
  const profileId = await getActiveProfileId();
  await db.run('UPDATE profiles SET diagnostic_completed = 1 WHERE id = ?', [profileId]);
}

export async function saveBrainDump(texto) {
  await db.run('INSERT INTO Pensamentos_Intrusivos (pensamento, criado_em) VALUES (?, ?)', [texto, new Date().toISOString()]);
}

export async function importHierarchicalEdital(data) {
  const profileId = await getActiveProfileId();
  const now = new Date().toISOString();
  const bancaName = data.banca || 'Geral';
  
  const createdSubjects = [];
  
  if (Array.isArray(data.subjects)) {
    for (const s of data.subjects) {
      let subjectRow = await db.get('SELECT id_disciplina FROM Disciplinas WHERE nome = ? AND profile_id = ?', [s.name, profileId]);
      let subjectId;
      if (!subjectRow) {
        const r = await db.run(
          'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)',
          [profileId, s.name, s.module === 'specific' ? 2.5 : 1.0, bancaName, s.module || 'general', now, now]
        );
        subjectId = r.lastID;
      } else {
        subjectId = subjectRow.id_disciplina;
      }
      
      const topicNameToId = {};
      
      if (Array.isArray(s.topics)) {
        for (const t of s.topics) {
          let topicRow = await db.get('SELECT id_topico FROM Topicos WHERE nome = ? AND id_disciplina = ?', [t.name, subjectId]);
          let topicId;
          if (!topicRow) {
            const r = await db.run(
              'INSERT INTO Topicos (id_disciplina, nome, percentual_dominio, data_ultima_revisao, status_plantacao, summary) VALUES (?, ?, 0.0, ?, ?, ?)',
              [subjectId, t.name, now, 'semente', '']
            );
            topicId = r.lastID;
          } else {
            topicId = topicRow.id_topico;
          }
          topicNameToId[t.name] = topicId;
        }
        
        for (const t of s.topics) {
          const currentId = topicNameToId[t.name];
          let parentId = null;
          let prereqId = null;
          
          if (t.parent_topic && topicNameToId[t.parent_topic]) {
            parentId = topicNameToId[t.parent_topic];
          }
          if (t.prerequisite_topic && topicNameToId[t.prerequisite_topic]) {
            prereqId = topicNameToId[t.prerequisite_topic];
          }
          
          if (parentId !== null || prereqId !== null) {
            await db.run(
              'UPDATE Topicos SET id_topico_pai = ?, requisito_id = ? WHERE id_topico = ?',
              [parentId, prereqId, currentId]
            );
          }
        }
      }
      
      createdSubjects.push(s.name);
    }
  }
  
  const allCreatedTopics = await db.all(
    `SELECT t.id_topico, t.nome as topic_name, s.nome as subject_name 
     FROM Topicos t 
     JOIN Disciplinas s ON t.id_disciplina = s.id_disciplina 
     WHERE s.profile_id = ?`,
    [profileId]
  );
  
  const profile = await db.get('SELECT exam_date FROM profiles WHERE id = ?', [profileId]);
  let daysToExam = 30;
  if (profile && profile.exam_date) {
    const diff = new Date(profile.exam_date) - new Date();
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (diffDays > 0) daysToExam = diffDays;
  }
  
  await db.run('DELETE FROM study_schedule WHERE profile_id = ?', [profileId]);
  
  const totalTopics = allCreatedTopics.length;
  const nodesPerDay = Math.max(1, Math.ceil(totalTopics / Math.min(daysToExam, 30)));
  
  let currentDay = 1;
  let currentCount = 0;
  
  for (const t of allCreatedTopics) {
    const studyDate = new Date();
    studyDate.setDate(studyDate.getDate() + (currentDay - 1));
    const studyDateStr = studyDate.toISOString().split('T')[0];
    
    await db.run(
      'INSERT INTO study_schedule (profile_id, subject_name, topic_name, study_date, days_left_indicator, status) VALUES (?, ?, ?, ?, ?, ?)',
      [profileId, t.subject_name, t.topic_name, studyDateStr, currentDay, 'Pendente']
    );
    
    currentCount++;
    if (currentCount >= nodesPerDay) {
      currentDay++;
      currentCount = 0;
    }
  }
  
  return {
    success: true,
    subjects: createdSubjects,
    totalTopics,
    paceNodesPerDay: nodesPerDay
  };
}

export async function saveShreddedPDF(subjectName, topicName, data) {
  const profileId = await getActiveProfileId();
  const now = new Date().toISOString();
  
  let subjectRow = await db.get('SELECT id_disciplina FROM Disciplinas WHERE nome = ? AND profile_id = ?', [subjectName, profileId]);
  let subjectId;
  if (!subjectRow) {
    const r = await db.run(
      'INSERT INTO Disciplinas (profile_id, nome, peso_edital, xp_acumulado, nivel_atual, banca, module, created_at, last_studied_at) VALUES (?, ?, 1.0, 0, 1, "Geral", "general", ?, ?)',
      [profileId, subjectName, now, now]
    );
    subjectId = r.lastID;
  } else {
    subjectId = subjectRow.id_disciplina;
  }
  
  let topicRow = await db.get('SELECT id_topico FROM Topicos WHERE nome = ? AND id_disciplina = ?', [topicName, subjectId]);
  let topicId;
  const summaryStr = JSON.stringify(data.summary_chunks || []);
  if (!topicRow) {
    const r = await db.run(
      'INSERT INTO Topicos (id_disciplina, nome, percentual_dominio, data_ultima_revisao, status_plantacao, summary, keywords_feynman) VALUES (?, ?, 0.0, ?, ?, ?, ?)',
      [subjectId, topicName, now, 'semente', summaryStr, data.keywords_feynman || '']
    );
    topicId = r.lastID;
  } else {
    topicId = topicRow.id_topico;
    await db.run(
      'UPDATE Topicos SET summary = ?, keywords_feynman = ?, data_ultima_revisao = ? WHERE id_topico = ?',
      [summaryStr, data.keywords_feynman || '', now, topicId]
    );
  }
  
  await db.run('DELETE FROM questions WHERE topic_id = ?', [topicId]);
  if (Array.isArray(data.questions)) {
    for (const q of data.questions) {
      await db.run(
        'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          topicId,
          q.question,
          JSON.stringify(q.options || []),
          q.correct_answer || '',
          q.explanation || '',
          q.difficulty || 'Medium',
          'imported'
        ]
      );
    }
  }
  
  await db.run('DELETE FROM flashcards WHERE topic_id = ?', [topicId]);
  if (Array.isArray(data.flashcards)) {
    const today = new Date().toISOString().split('T')[0];
    for (const fc of data.flashcards) {
      await db.run(
        'INSERT INTO flashcards (topic_id, front, back, box, next_review_date) VALUES (?, ?, ?, 1, ?)',
        [topicId, fc.front, fc.back, today]
      );
    }
  }
  
  return {
    success: true,
    subjectId,
    topicId,
    chunks: data.summary_chunks ? data.summary_chunks.length : 0,
    questions: data.questions ? data.questions.length : 0,
    flashcards: data.flashcards ? data.flashcards.length : 0
  };
}

export async function runGeneratorEngine(topicId, missionType) {
  const topic = await db.get('SELECT * FROM Topicos WHERE id_topico = ?', [topicId]);
  if (!topic) throw new Error('Tópico não encontrado');
  
  const subject = await db.get('SELECT * FROM Disciplinas WHERE id_disciplina = ?', [topic.id_disciplina]);
  const banca = 'FGV'; // Strict FGV
  const mastery = topic.percentual_dominio || 0;
  
  const profileId = await getActiveProfileId();
  const profile = await getProfile();

  let daysUntilExam = 90;
  if (profile && profile.exam_date) {
    const diff = new Date(profile.exam_date) - new Date();
    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (diffDays > 0) daysUntilExam = diffDays;
  }

  const masteryRow = await db.get('SELECT * FROM TopicMastery WHERE profile_id = ? AND topic_id = ?', [profileId, topicId]);
  const confidence = masteryRow ? (masteryRow.confidence || 50) : 50;

  // 1. Error history: last 3 errors
  const failedLogs = await db.all(
    `SELECT q.question_text, q.correct_answer 
     FROM Log_Questoes l
     JOIN questions q ON l.question_id = q.id
     WHERE l.id_topico = ? AND l.acertou = 0 AND l.profile_id = ?
     ORDER BY l.answered_at DESC LIMIT 3`,
    [topicId, profileId]
  );
  const errorsContext = failedLogs.map(f => `Questão: "${f.question_text}" | Resposta Correta: "${f.correct_answer}"`).join('\n');
  
  // 2. Fetch imported few-shot examples from database
  const examExamples = await db.all(
    `SELECT q.question_text, q.options, q.correct_answer, q.explanation
     FROM questions q
     JOIN Topicos t ON q.topic_id = t.id_topico
     WHERE q.source = 'imported' AND t.id_disciplina = ?
     LIMIT 3`,
    [topic.id_disciplina]
  );
  
  let examplesText = '';
  if (examExamples.length > 0) {
    examplesText = examExamples.map(ex => {
      let opts = [];
      try { opts = JSON.parse(ex.options); } catch(e) { opts = ex.options; }
      return `Questão: "${ex.question_text}"\nOpções: ${JSON.stringify(opts)}\nGabarito: "${ex.correct_answer}"\nExplicação: "${ex.explanation}"`;
    }).join('\n\n');
  }

  // 3. AI call using modified generateNewQuestions with all adaptive parameters
  const questionsList = await generateNewQuestions(
    subject.nome,
    topic.nome,
    topic.summary || 'Conteúdo geral do edital.',
    0, // existingCount
    mastery,
    confidence,
    daysUntilExam,
    examplesText || null,
    errorsContext || null,
    subject.peso_edital || 1.0
  );
  
  // 4. Just-in-Time db insertion with source 'AI_ON_DEMAND'
  for (const q of questionsList) {
    await db.run(
      `INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source)
       VALUES (?, ?, ?, ?, ?, ?, 'AI_ON_DEMAND')`,
      [
        topicId,
        q.question || q.question_text,
        JSON.stringify(q.options),
        q.correct_answer,
        q.explanation,
        q.difficulty || 'Medium'
      ]
    );
  }
  
  console.log(`GeneratorEngine: Generated and inserted ${questionsList.length} FGV-style questions for topic ID ${topicId}`);
  return { success: true, count: questionsList.length, difficulty: 'Adaptive' };
}

export function runGeneratorEngineInBackground(topicId, missionType) {
  runGeneratorEngine(topicId, missionType).catch(err => {
    console.error('Error running GeneratorEngine in background:', err.message);
  });
}

