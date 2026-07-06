import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import {
  initDB,
  getProfile,
  updateXP,
  checkAndProcessStreak,
  buyShield,
  getSubjects,
  getTopics,
  importSubjectJSON,
  getQuestions,
  getFlashcards,
  submitQuestionAnswer,
  submitFlashcardScore,
  getRandomEncounter,
  getBossFight,
  getAllQuestionsCount,
  getInterleavedSession,
  getStudyLogs,
  saveStudySchedule,
  getStudySchedule,
  completeScheduleItem,
  getDiagnosticQuestions,
  updateSubjectLevel,
  setSubjectWeight,
  cureMentalFog,
  generateDailyQuests,
  resetFatigueCounter,
  toggleTDAHMode,
  lockSubject,
  unlockSubject,
  // Multi-profile
  listProfiles,
  createProfile,
  switchProfile,
  deleteProfile,
  updateProfileMeta,
  // New mechanics
  checkAndLockCriticalSubjects,
  getSampleQuestion,
  generateMarathon,
  submitMarathonResult
} from './db.js';
import {
  generateNewQuestions,
  generateGamifiedDataFromText,
  generateAIStudyDiagnosis
} from './gemini.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files if directory exists
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '../frontend')));

// ROUTES

// 1. User Profile
app.get('/api/profile', async (req, res) => {
  try {
    // Process streak when getting profile to auto-handle daily updates
    const streakResult = await checkAndProcessStreak();
    const profile = await getProfile();
    res.json({ ...profile, streakUpdate: streakResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Buy Streak Shield
app.post('/api/shop/buy-shield', async (req, res) => {
  try {
    const result = await buyShield();
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Get Subjects (calculates decay & mastery)
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await getSubjects();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Get Topics for a Subject
app.get('/api/subjects/:id/topics', async (req, res) => {
  try {
    const data = await getTopics(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Import JSON manually
app.post('/api/subjects/import', async (req, res) => {
  try {
    const data = req.body;
    if (!data.subject || !data.topic || !data.summary) {
      return res.status(400).json({ error: 'JSON inválido! Deve conter subject, topic e summary.' });
    }
    const result = await importSubjectJSON(data);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Generate Gamified JSON from text via Gemini (Internal)
app.post('/api/subjects/generate-from-text', async (req, res) => {
  try {
    const { text, subjectName, topicName, bancaName, inputType, examDate } = req.body;
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: 'Texto de material muito curto!' });
    }

    const gamifiedData = await generateGamifiedDataFromText(text, subjectName, topicName, bancaName, inputType, examDate);
    const result = await importSubjectJSON(gamifiedData);

    // Save edital schedule if returned in gamified data
    if (gamifiedData.schedule && Array.isArray(gamifiedData.schedule)) {
      const scheduleItems = gamifiedData.schedule.map(item => {
        const date = new Date();
        date.setDate(date.getDate() + (item.day - 1));
        const dateStr = date.toISOString().split('T')[0];
        return {
          subject_name: gamifiedData.subject,
          topic_name: item.topic_name,
          study_date: dateStr,
          days_left_indicator: item.day
        };
      });
      await saveStudySchedule(scheduleItems);
    }

    res.json({ success: true, data: gamifiedData, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get Questions for Study Session
app.get('/api/study/questions', async (req, res) => {
  try {
    const { topicId, count = 5 } = req.query;
    if (!topicId) return res.status(400).json({ error: 'topicId é obrigatório' });

    let questions = await getQuestions(topicId, parseInt(count));

    // Replenish logic: if questions are running low, trigger Gemini generator in background
    const qCount = await getAllQuestionsCount(topicId);
    if (qCount < 5) {
      // Trigger background generation
      // Need topic details to generate questions
      const topic = await dbGetTopicDetails(topicId);
      if (topic) {
        // Run async without blocking response
        generateNewQuestions(topic.subject_name, topic.name, topic.summary, qCount)
          .then(async (newQList) => {
            if (newQList && newQList.length > 0) {
              const { open } = await import('sqlite'); // just query directly using importSubjectJSON helpers or custom insert
              for (const q of newQList) {
                await insertQuestionDirectly(topicId, q);
              }
              console.log(`Auto-generated and inserted ${newQList.length} new questions for topic: ${topic.name}`);
            }
          })
          .catch(err => console.error('Error in background question generation:', err));
      }
    }

    // Fallback if 0 questions: try to generate instantly (blocking) so the user doesn't get an empty list
    if (questions.length === 0) {
      const topic = await dbGetTopicDetails(topicId);
      if (topic) {
        console.log(`0 questions in DB. Generating synchronously for topic: ${topic.name}`);
        const newQList = await generateNewQuestions(topic.subject_name, topic.name, topic.summary, 0);
        if (newQList && newQList.length > 0) {
          for (const q of newQList) {
            await insertQuestionDirectly(topicId, q);
          }
          // Fetch again
          questions = await getQuestions(topicId, parseInt(count));
        }
      }
    }

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for background operations in server.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
async function dbGetTopicDetails(topicId) {
  const db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });
  return await db.get(
    `SELECT t.*, s.name as subject_name 
     FROM topics t 
     JOIN subjects s ON t.subject_id = s.id 
     WHERE t.id = ?`,
    [topicId]
  );
}

async function insertQuestionDirectly(topicId, q) {
  const db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });
  await db.run(
    'INSERT INTO questions (topic_id, question_text, options, correct_answer, explanation, difficulty, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      topicId,
      q.question,
      JSON.stringify(q.options),
      q.correct_answer,
      q.explanation,
      q.difficulty || 'Medium',
      'ai_generated'
    ]
  );
}

// 8. Get Flashcards for Study Session
app.get('/api/study/flashcards', async (req, res) => {
  try {
    const { topicId } = req.query;
    if (!topicId) return res.status(400).json({ error: 'topicId é obrigatório' });

    const flashcards = await getFlashcards(topicId);
    res.json(flashcards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Submit Question Answer (evaluates correctness, XP, coins, speed bonus)
app.post('/api/study/answer', async (req, res) => {
  try {
    const { questionId, selectedAnswer, responseTimeSeconds } = req.body;
    if (!questionId || selectedAnswer === undefined) {
      return res.status(400).json({ error: 'questionId e selectedAnswer são obrigatórios' });
    }

    const result = await submitQuestionAnswer(questionId, selectedAnswer, responseTimeSeconds);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Submit Flashcard Score (Leitner repetition)
app.post('/api/study/flashcard', async (req, res) => {
  try {
    const { flashcardId, score } = req.body;
    if (!flashcardId || score === undefined) {
      return res.status(400).json({ error: 'flashcardId e score (1, 2, 3) são obrigatórios' });
    }

    const result = await submitFlashcardScore(flashcardId, score);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Random Encounter (3 random questions from past topics)
app.get('/api/study/random-encounter', async (req, res) => {
  try {
    const questions = await getRandomEncounter();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Boss Fight (10 random questions from the subject)
app.get('/api/study/boss-fight', async (req, res) => {
  try {
    const { subjectId } = req.query;
    if (!subjectId) return res.status(400).json({ error: 'subjectId é obrigatório' });

    const questions = await getBossFight(subjectId);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.5. Submit Summary Reading (awards minor XP/coins)
app.post('/api/study/summary', async (req, res) => {
  try {
    const result = await updateXP(5, 1);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.6. Interleaved Study Session (30% New, 50% Spaced Repetition, 20% Bosses/Redemption)
app.get('/api/study/interleaved-session', async (req, res) => {
  try {
    const questions = await getInterleavedSession(10);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.7. Export Statistics to CSV
app.get('/api/study/export-csv', async (req, res) => {
  try {
    const logs = await getStudyLogs();
    
    // Generate CSV String
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'Data/Hora;Materia;Topico;Questao;Resultado;Tempo Resposta (s)\n';

    logs.forEach(log => {
      const cleanQuestao = log.questao.replace(/"/g, '""').replace(/[\n\r]+/g, ' ');
      csv += `"${log.data_hora}";"${log.materia}";"${log.topico}";"${cleanQuestao}";"${log.resultado}";${log.tempo_resposta}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estatisticas_estudo.csv"');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.8. Get Edital Study Schedule
app.get('/api/study/schedule', async (req, res) => {
  try {
    const schedule = await getStudySchedule();
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.9. Complete Edital Schedule Item
app.post('/api/study/schedule/complete', async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId é obrigatório' });
    const result = await completeScheduleItem(itemId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. AI Mentor Study Diagnosis
app.get('/api/ai/diagnosis', async (req, res) => {
  try {
    const profile = await getProfile();
    const subjects = await getSubjects();
    const diagnosis = await generateAIStudyDiagnosis(profile, subjects);
    res.json({ diagnosis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.10. Get Diagnostic Questions
app.get('/api/study/diagnostic-questions', async (req, res) => {
  try {
    const questions = await getDiagnosticQuestions();
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.11. Submit Diagnostic Placement Test
app.post('/api/study/diagnostic-submit', async (req, res) => {
  try {
    const { answers } = req.body; 
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array é obrigatório' });
    }

    const subjectGroups = {};
    answers.forEach(ans => {
      if (!subjectGroups[ans.subjectId]) {
        subjectGroups[ans.subjectId] = [];
      }
      subjectGroups[ans.subjectId].push(ans);
    });

    const calculatedLevels = [];
    const L_max = 15;
    const gamma = 1.3;

    for (const subId in subjectGroups) {
      const subAnswers = subjectGroups[subId];
      let sumNumerator = 0;
      let sumDenominator = 0;

      for (const ans of subAnswers) {
        let w_i = 1;
        if (ans.difficulty === 'Medium') w_i = 2;
        if (ans.difficulty === 'Hard') w_i = 3;

        let w_adjusted = w_i;
        let r_i = ans.isCorrect ? 1 : 0;

        if (ans.isCorrect) {
          if (ans.confidence === 'Chute') {
            w_adjusted = w_i / 3;
          }
        }

        sumNumerator += (r_i * w_adjusted);
        sumDenominator += w_adjusted;
      }

      const ratio = sumDenominator > 0 ? (sumNumerator / sumDenominator) : 0;
      const N_0 = Math.max(1, Math.floor(L_max * Math.pow(ratio, gamma)));

      await updateSubjectLevel(parseInt(subId), N_0);
      calculatedLevels.push({ subjectId: parseInt(subId), level: N_0 });
    }

    res.json({ success: true, calculatedLevels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.12. Get Daily Quests
app.get('/api/study/daily-quests', async (req, res) => {
  try {
    const questsData = await generateDailyQuests();
    res.json(questsData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.13. Reset Subject Fatigue
app.post('/api/study/reset-fatigue', async (req, res) => {
  try {
    const { subjectId } = req.body;
    await resetFatigueCounter(subjectId || null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.14. Cure Mental Fog
app.post('/api/study/cure-mental-fog', async (req, res) => {
  try {
    const result = await cureMentalFog();
    res.json({ success: true, profile: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.15. Save Subject Weights
app.post('/api/study/subject-weights', async (req, res) => {
  try {
    const { weights } = req.body; 
    if (weights && Array.isArray(weights)) {
      for (const item of weights) {
        await setSubjectWeight(item.subjectId, item.weight);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.16. Toggle ADHD Mode
app.post('/api/profile/toggle-tdah', async (req, res) => {
  try {
    const profile = await toggleTDAHMode();
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.17. Unlock Subject
app.post('/api/study/unlock-subject', async (req, res) => {
  try {
    const { subjectId } = req.body;
    if (!subjectId) return res.status(400).json({ error: 'subjectId é obrigatório' });
    await unlockSubject(subjectId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12.18. Brain Dump
app.post('/api/study/brain-dump', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texto é obrigatório' });
    }
    
    const dumpPath = 'brain_dump.txt';
    const entry = `[${new Date().toISOString()}] ${text}\n`;
    fs.appendFileSync(dumpPath, entry, 'utf8');
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// MULTI-PROFILE ENDPOINTS
// ============================

// GET /api/profiles - list all profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await listProfiles();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/profiles - create a new profile
app.post('/api/profiles', async (req, res) => {
  try {
    const { name, avatarEmoji, examName, examDate } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do perfil é obrigatório' });
    }
    const profileId = await createProfile(name.trim(), avatarEmoji || '🎯', examName || '', examDate || '');
    // Auto-switch to the new profile
    const profile = await switchProfile(profileId);
    res.json({ success: true, profileId, profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/profiles/:id/activate - switch active profile
app.put('/api/profiles/:id/activate', async (req, res) => {
  try {
    const profile = await switchProfile(parseInt(req.params.id));
    res.json({ success: true, profile });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/profiles/:id - delete a profile
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    await deleteProfile(parseInt(req.params.id));
    const profiles = await listProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PATCH /api/profiles/:id - update profile metadata
app.patch('/api/profiles/:id', async (req, res) => {
  try {
    const { name, avatarEmoji, examName, examDate } = req.body;
    const profile = await updateProfileMeta(parseInt(req.params.id), { name, avatarEmoji, examName, examDate });
    res.json({ success: true, profile });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================
// HARD RESET (TELA PRETA)
// ============================

// POST /api/subjects/:id/lock - lock a subject
app.post('/api/subjects/:id/lock', async (req, res) => {
  try {
    await lockSubject(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/study/check-critical - check for critically low mastery subjects
app.get('/api/study/check-critical', async (req, res) => {
  try {
    const result = await checkAndLockCriticalSubjects();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/subjects/:id/sample-question - get 1 easy question for hard-reset
app.get('/api/subjects/:id/sample-question', async (req, res) => {
  try {
    const q = await getSampleQuestion(parseInt(req.params.id));
    if (!q) return res.status(404).json({ error: 'Nenhuma questão disponível' });
    res.json(q);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================
// MARATHON (SIMULADOR DE FADIGA)
// ============================

// POST /api/marathon/start - generate 70 marathon questions
app.post('/api/marathon/start', async (req, res) => {
  try {
    const marathon = await generateMarathon();
    if (marathon.questions.length === 0) {
      return res.status(400).json({ error: 'Não há questões suficientes. Importe mais materiais primeiro.' });
    }
    res.json(marathon);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/marathon/submit - submit marathon answers and get score
app.post('/api/marathon/submit', async (req, res) => {
  try {
    const { answers, startedAt, finishedAt } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array é obrigatório' });
    }
    const result = await submitMarathonResult(answers, startedAt, finishedAt);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// START SERVER
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database and server:', err);
});
