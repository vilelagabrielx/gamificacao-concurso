import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

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
      burned_out INTEGER DEFAULT 0
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

  // Create subjects table with profile_id
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

  // Create topics table
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
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
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
      FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
    )
  `);

  // Create answers history table
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
    "ALTER TABLE user_profile ADD COLUMN burned_out INTEGER DEFAULT 0"
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

  // Populate mock data if database has no subjects at all
  const subjectCount = await db.get('SELECT COUNT(*) as count FROM subjects');
  if (subjectCount.count === 0) {
    await populateMockData();
  }

  console.log('Database initialized successfully.');
  return db;
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
  
  // Insert Subject with default banca
  const subjectResult = await db.run(
    'INSERT INTO subjects (name, mastery, last_studied_at, created_at, xp, level, banca) VALUES (?, ?, ?, ?, 0, 1, ?)',
    ['Direito Constitucional', 0, now, now, 'FCC']
  );
  const subjectId = subjectResult.lastID;

  // Insert Topic
  const topicResult = await db.run(
    'INSERT INTO topics (subject_id, name, summary, mastery, last_studied_at) VALUES (?, ?, ?, ?, ?)',
    [
      subjectId,
      'Direitos Individuais e Coletivos',
      'O Artigo 5º da CF/88 trata dos direitos individuais e coletivos. Princípios essenciais: igualdade de gênero, proibição de tortura, liberdade de expressão (vedado o anonimato), inviolabilidade do domicílio (salvo flagrante delito, desastre, prestar socorro, ou determinação judicial durante o dia), sigilo de correspondência e remédios constitucionais.',
      0,
      now
    ]
  );
  const topicId = topicResult.lastID;

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
    return await db.get('SELECT * FROM profiles LIMIT 1');
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
    avatar_emoji: profile.avatar_emoji || '👑'
  };
}

export async function updateXP(xpGained, coinsGained, subjectId = null) {
  const profileId = await getActiveProfileId();
  const profile = await getProfile();
  
  // Calculate Synergy Buff
  const subjectsList = await db.all('SELECT level FROM subjects');
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
    const subject = await db.get('SELECT xp, level, name, weight, consecutive_answers FROM subjects WHERE id = ?', [subjectId]);
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
      await db.run('UPDATE subjects SET consecutive_answers = ? WHERE id = ?', [consecutiveAnswers, subjectId]);

      // Subject Level up logic
      newSubjectXp = (subject.xp || 0) + finalXpGained;
      newSubjectLevel = subject.level || 1;
      const subXpNeeded = newSubjectLevel * 1000;
      
      if (newSubjectXp >= subXpNeeded) {
        newSubjectXp -= subXpNeeded;
        newSubjectLevel += 1;
        subjectLeveledUp = true;
        await db.run('UPDATE user_profile SET coins = coins + 50 WHERE id = ?', [profile.id]);
        profile.coins += 50;
      }

      await db.run(
        'UPDATE subjects SET xp = ?, level = ? WHERE id = ?',
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
  const subjects = await db.all('SELECT * FROM subjects WHERE profile_id = ?', [profileId]);

  for (const subject of subjects) {
    const topics = await db.all('SELECT * FROM topics WHERE subject_id = ?', [subject.id]);
    let totalTopicMastery = 0;

    for (const topic of topics) {
      const topicMastery = await calculateTopicMastery(topic.id);
      totalTopicMastery += topicMastery;
      
      await db.run('UPDATE topics SET mastery = ? WHERE id = ?', [topicMastery, topic.id]);
    }

    const calculatedMastery = topics.length > 0 ? Math.round(totalTopicMastery / topics.length) : 0;
    const finalMastery = Math.max(0, calculatedMastery);

    await db.run('UPDATE subjects SET mastery = ? WHERE id = ?', [finalMastery, subject.id]);
    subject.mastery = finalMastery;
  }

  return subjects;
}

export async function getTopics(subjectId) {
  const subjects = await getSubjects();
  const subject = subjects.find(s => s.id === parseInt(subjectId));
  const topics = await db.all('SELECT * FROM topics WHERE subject_id = ?', [subjectId]);
  return { subject, topics };
}

async function calculateTopicMastery(topicId) {
  const questions = await db.all('SELECT id FROM questions WHERE topic_id = ?', [topicId]);
  if (questions.length === 0) return 0;

  const questionIds = questions.map(q => q.id);
  const placeHolders = questionIds.map(() => '?').join(',');

  // Get the last 20 answers
  const lastAnswers = await db.all(
    `SELECT is_correct 
     FROM answers_history 
     WHERE question_id IN (${placeHolders}) 
     ORDER BY answered_at DESC LIMIT 20`,
    [...questionIds]
  );

  if (lastAnswers.length === 0) return 0;

  const correctAnswers = lastAnswers.filter(a => a.is_correct === 1).length;
  const baseRate = (correctAnswers / lastAnswers.length) * 100;

  // Calculate days since last studied
  const topic = await db.get('SELECT last_studied_at FROM topics WHERE id = ?', [topicId]);
  let daysSince = 0;
  if (topic && topic.last_studied_at) {
    const lastDate = new Date(topic.last_studied_at);
    const now = new Date();
    const diffTime = Math.abs(now - lastDate);
    daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const decayFactor = Math.pow(0.97, daysSince);
  const realMastery = Math.round(baseRate * decayFactor);

  return Math.max(0, Math.min(100, realMastery));
}

// IMPORT LOGIC (supports banca + profile_id + module)
export async function importSubjectJSON(data) {
  const now = new Date().toISOString();
  const bancaName = data.banca || 'Geral';
  const profileId = await getActiveProfileId();
  const moduleType = data.module || 'general'; // 'general' or 'specific'
  
  // 1. Insert or get subject for this profile
  let subject = await db.get('SELECT id FROM subjects WHERE name = ? AND profile_id = ?', [data.subject, profileId]);
  let subjectId;
  if (!subject) {
    const result = await db.run(
      'INSERT INTO subjects (profile_id, name, mastery, last_studied_at, created_at, xp, level, banca, module) VALUES (?, ?, 0, ?, ?, 0, 1, ?, ?)',
      [profileId, data.subject, now, now, bancaName, moduleType]
    );
    subjectId = result.lastID;
  } else {
    subjectId = subject.id;
    await db.run('UPDATE subjects SET last_studied_at = ?, banca = ?, module = ? WHERE id = ?', [now, bancaName, moduleType, subjectId]);
  }

  // 2. Insert topic
  const topicResult = await db.run(
    'INSERT INTO topics (subject_id, name, summary, mastery, last_studied_at) VALUES (?, ?, ?, 0, ?)',
    [subjectId, data.topic, data.summary, now]
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

// STUDY INTERACTIONS
export async function getQuestions(topicId, count = 5) {
  return await db.all(
    'SELECT * FROM questions WHERE topic_id = ? ORDER BY RANDOM() LIMIT ?',
    [topicId, count]
  );
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
     JOIN topics t ON q.topic_id = t.id 
     WHERE t.subject_id = ?`,
    [subjectId]
  );
  return countObj.count;
}

export async function getRandomEncounter() {
  const questions = await db.all(
    `SELECT q.*, t.name as topic_name, s.name as subject_name 
     FROM questions q 
     JOIN topics t ON q.topic_id = t.id 
     JOIN subjects s ON t.subject_id = s.id 
     ORDER BY RANDOM() LIMIT 3`
  );
  return questions;
}

export async function getBossFight(subjectId) {
  const questions = await db.all(
    `SELECT q.*, t.name as topic_name 
     FROM questions q 
     JOIN topics t ON q.topic_id = t.id 
     WHERE t.subject_id = ? 
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
    `SELECT q.*, t.name as topic_name, s.name as subject_name
     FROM questions q
     JOIN topics t ON q.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE q.id IN (
       SELECT question_id FROM answers_history WHERE is_correct = 0
     )
     ORDER BY RANDOM() LIMIT ?`,
    [bossCount]
  );
  
  bossQuestions.forEach(q => {
    selectedQuestions.push({ ...q, category: 'Boss/Redenção' });
    addedIds.add(q.id);
  });

  // 2. Get Spaced Repetition (topics with mastery < 70%)
  const lowMasteryTopics = await db.all('SELECT id FROM topics WHERE mastery < 70 AND mastery > 0');
  if (lowMasteryTopics.length > 0) {
    const topicIds = lowMasteryTopics.map(t => t.id);
    const placeholders = topicIds.map(() => '?').join(',');
    const srQuestions = await db.all(
      `SELECT q.*, t.name as topic_name, s.name as subject_name
       FROM questions q
       JOIN topics t ON q.topic_id = t.id
       JOIN subjects s ON t.subject_id = s.id
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
    `SELECT q.*, t.name as topic_name, s.name as subject_name
     FROM questions q
     JOIN topics t ON q.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
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
      `SELECT q.*, t.name as topic_name, s.name as subject_name
       FROM questions q
       JOIN topics t ON q.topic_id = t.id
       JOIN subjects s ON t.subject_id = s.id
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
    'INSERT INTO answers_history (question_id, profile_id, is_correct, answered_at, response_time_seconds) VALUES (?, ?, ?, ?, ?)',
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
  const topic = await db.get('SELECT * FROM topics WHERE id = ?', [question.topic_id]);
  await db.run('UPDATE topics SET last_studied_at = ? WHERE id = ?', [now, topic.id]);
  await db.run('UPDATE subjects SET last_studied_at = ? WHERE id = ?', [now, topic.subject_id]);

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
      'SELECT COUNT(*) as count FROM answers_history WHERE question_id = ? AND is_correct = 0',
      [questionId]
    );
    const correctAttempts = await db.get(
      'SELECT COUNT(*) as count FROM answers_history WHERE question_id = ? AND is_correct = 1',
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

  const profileUpdate = await updateXP(xpGained, coinsGained, topic.subject_id);

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

  const topic = await db.get('SELECT * FROM topics WHERE id = ?', [fc.topic_id]);
  const now = new Date().toISOString();
  await db.run('UPDATE topics SET last_studied_at = ? WHERE id = ?', [now, topic.id]);
  await db.run('UPDATE subjects SET last_studied_at = ? WHERE id = ?', [now, topic.subject_id]);

  const profileUpdate = await updateXP(xpGained, coinsGained, topic.subject_id);

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
      s.name as materia,
      t.name as topico,
      q.question_text as questao,
      CASE WHEN ah.is_correct = 1 THEN 'ACERTO' ELSE 'ERRO' END as resultado,
      ah.response_time_seconds as tempo_resposta
     FROM answers_history ah
     JOIN questions q ON ah.question_id = q.id
     JOIN topics t ON q.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     ORDER BY ah.answered_at DESC`
  );
}

export async function saveStudySchedule(scheduleItems) {
  if (!Array.isArray(scheduleItems) || scheduleItems.length === 0) return;
  const profileId = await getActiveProfileId();
  
  const firstItem = scheduleItems[0];
  if (firstItem.subject_name) {
    await db.run('DELETE FROM study_schedule WHERE subject_name = ? AND profile_id = ?', [firstItem.subject_name, profileId]);
  }

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

  const subject = await db.get('SELECT id FROM subjects WHERE name = ?', [item.subject_name]);
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
    await db.run('UPDATE subjects SET consecutive_answers = 0 WHERE id = ?', [subjectId]);
  } else {
    await db.run('UPDATE subjects SET consecutive_answers = 0');
  }
}

export async function getDiagnosticQuestions() {
  return await db.all(
    `SELECT q.*, s.name as subject_name, s.id as subject_id, t.name as topic_name 
     FROM questions q 
     JOIN topics t ON q.topic_id = t.id 
     JOIN subjects s ON t.subject_id = s.id 
     ORDER BY RANDOM() LIMIT 10`
  );
}

export async function updateSubjectLevel(subjectId, level) {
  await db.run('UPDATE subjects SET level = ? WHERE id = ?', [level, subjectId]);
}

export async function setSubjectWeight(subjectId, weight) {
  await db.run('UPDATE subjects SET weight = ? WHERE id = ?', [weight, subjectId]);
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
  const subjects = await db.all('SELECT * FROM subjects WHERE profile_id = ?', [profileId]);
  const criticalSubjects = subjects.filter(s => (s.mastery || 0) < 15 && (s.mastery || 0) > 0);
  
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
     JOIN topics t ON q.topic_id = t.id
     WHERE t.subject_id = ? AND q.difficulty = 'Easy'
     ORDER BY RANDOM() LIMIT 1`,
    [subjectId]
  );
  if (!q) {
    return await db.get(
      `SELECT q.* FROM questions q
       JOIN topics t ON q.topic_id = t.id
       WHERE t.subject_id = ? ORDER BY RANDOM() LIMIT 1`,
      [subjectId]
    );
  }
  return q;
}

export async function generateDailyQuests() {
  const maxItem = await db.get('SELECT MAX(days_left_indicator) as maxDays FROM study_schedule WHERE status = "Pendente"');
  let daysLeft = 90; 
  if (maxItem && maxItem.maxDays !== null) {
    daysLeft = maxItem.maxDays;
  }

  let phase = 'Cultivation';
  if (daysLeft < 30) {
    phase = 'Harvest';
  } else if (daysLeft <= 60) {
    phase = 'Lapidation';
  }

  const dayOfWeek = new Date().getDay(); 
  const isSaturday = (dayOfWeek === 6);
  const isSunday = (dayOfWeek === 0);

  const lowestMasteryTopic = await db.get(
    `SELECT t.*, s.name as subject_name, s.weight 
     FROM topics t 
     JOIN subjects s ON t.subject_id = s.id 
     ORDER BY t.mastery ASC LIMIT 1`
  ) || { name: 'Geral', subject_name: 'Geral', mastery: 75, id: 1 };

  const unstudiedTopic = await db.get(
    `SELECT t.*, s.name as subject_name 
     FROM topics t 
     JOIN subjects s ON t.subject_id = s.id 
     WHERE t.mastery = 0 OR s.level = 1 
     ORDER BY RANDOM() LIMIT 1`
  ) || { name: 'Geral', subject_name: 'Geral', mastery: 0, id: 1 };

  let quests = [];

  if (isSunday) {
    quests.push({
      id: 'sunday-rescue',
      type: 'rescue',
      title: 'Cura de Feridas: Revise as 10 questões mais erradas da semana.',
      desc: 'Analise os erros para reestruturar as sinapses.',
      target: 10,
      reward: 40,
      rewardType: 'xp',
      progress: 0,
      completed: false
    });
  } 
  else if (isSaturday) {
    quests.push({
      id: 'saturday-simulated',
      type: 'epic',
      title: 'Simulado do Cérebro: Faça o simulado cronometrado de alta relevância (15 questões).',
      desc: 'Bateria contendo disciplinas de alto peso do edital.',
      target: 15,
      reward: 150,
      rewardType: 'xp',
      progress: 0,
      completed: false
    });
  } 
  else {
    let q1Target = (phase === 'Harvest') ? 15 : 10;
    quests.push({
      id: 'urgency-quest',
      type: 'urgency',
      title: `Alerta de Ruptura! Domínio em '${lowestMasteryTopic.name}' está baixo (${lowestMasteryTopic.mastery}%). Faça ${q1Target} questões para restaurar.`,
      desc: 'Evite a curva do esquecimento de Ebbinghaus.',
      target: q1Target,
      reward: 60,
      rewardType: 'xp',
      progress: 0,
      completed: false,
      topicId: lowestMasteryTopic.id
    });

    quests.push({
      id: 'offensive-quest',
      type: 'offensive',
      title: `Expanda o Território: Acerte questões em '${unstudiedTopic.name}' para evoluir na trilha.`,
      desc: 'Estimule a neuroplasticidade com conteúdo novo.',
      target: 5,
      reward: 80,
      rewardType: 'xp',
      progress: 0,
      completed: false,
      topicId: unstudiedTopic.id
    });

    quests.push({
      id: 'dopamine-roulette',
      type: 'roulette',
      title: 'Caçador de Recompensas: Obtenha precisão acima de 85% em uma bateria intercalada de 10 questões.',
      desc: 'Mantenha o flow de acertos.',
      target: 10,
      reward: 100,
      rewardType: 'chest',
      progress: 0,
      completed: false
    });
  }

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
    `SELECT q.*, t.name as topic_name, s.name as subject_name, s.module as subject_module
     FROM questions q
     JOIN topics t ON q.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE s.profile_id = ? AND (q.module = 'general' OR s.module = 'general')
     ORDER BY RANDOM() LIMIT 40`,
    [profileId]
  );
  
  const specificQuestions = await db.all(
    `SELECT q.*, t.name as topic_name, s.name as subject_name, s.module as subject_module
     FROM questions q
     JOIN topics t ON q.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE s.profile_id = ? AND (q.module = 'specific' OR s.module = 'specific')
     ORDER BY RANDOM() LIMIT 30`,
    [profileId]
  );

  // Fallback: if not enough module-specific questions, fill from all
  let allQuestions = [...generalQuestions, ...specificQuestions];
  if (allQuestions.length < 10) {
    allQuestions = await db.all(
      `SELECT q.*, t.name as topic_name, s.name as subject_name
       FROM questions q
       JOIN topics t ON q.topic_id = t.id
       JOIN subjects s ON t.subject_id = s.id
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
      'INSERT INTO answers_history (question_id, profile_id, is_correct, answered_at, response_time_seconds) VALUES (?, ?, ?, ?, ?)',
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
