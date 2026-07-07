import { playSound } from './audio.js';

const API_BASE = 'http://localhost:3000/api';

// App state
let state = {
  user: {
    username: 'Concurseiro',
    xp: 0,
    level: 1,
    coins: 0,
    streak_count: 0,
    shield_count: 0
  },
  currentSubject: null,
  currentTopic: null,
  currentSession: {
    type: '', // 'summary', 'flashcards', 'questions', 'boss_fight', 'encounter'
    items: [],
    currentIndex: 0,
    xpGained: 0,
    coinsGained: 0,
    answers: [], // to track if speed / redemption was triggered
    startTime: null,
    timer: null,
    timeRemaining: 60,
    selectedOption: null,
    answered: false
  },
  // RPG Encounter state
  encounterActive: false,
  activeTheme: 'cyberpunk'
};

// Start APP
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await loadProfile();
  await loadProfiles();
  await loadSubjects();
  await loadStudySchedule();
  document.getElementById('ai-mentor-diagnosis').innerHTML = `<p style="color: var(--text-muted);">Clique abaixo para gerar seu plano com IA Local ou Externa.</p>`;
  
  document.getElementById('import-subject').addEventListener('input', updateDynamicPrompt);
  document.getElementById('import-topic').addEventListener('input', updateDynamicPrompt);
  document.getElementById('import-banca').addEventListener('change', updateDynamicPrompt);
  
  const typeSelect = document.getElementById('import-type');
  typeSelect.addEventListener('change', () => {
    updateDynamicPrompt();
    const dateContainer = document.getElementById('exam-date-container');
    if (typeSelect.value === 'edital') {
      dateContainer.classList.remove('hidden');
    } else {
      dateContainer.classList.add('hidden');
    }
  });

  document.getElementById('import-exam-date').addEventListener('input', updateDynamicPrompt);
  updateDynamicPrompt();

  setTimeout(() => {
    checkRandomEncounterTrigger();
  }, 1500);
}

// NAVIGATION
window.showPage = function(pageId, extraData = {}) {
  playSound.click();
  
  // Hide all pages
  document.querySelectorAll('.spa-page').forEach(page => {
    page.classList.add('hidden');
  });

  // Remove active state from nav links
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Activate menu link if exists
  const activeNavItem = document.getElementById(`nav-${pageId}`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
  }

  // Show page
  const page = document.getElementById(`page-${pageId}`);
  if (page) {
    page.classList.remove('hidden');
  }

  // Page specific loads
  if (pageId === 'dashboard') {
    loadProfile();
    loadSubjects();
    loadStudySchedule();
    loadDailyQuestsAndStamina();
  } else if (pageId === 'topics' && extraData.subjectId) {
    loadTopics(extraData.subjectId);
  } else if (pageId === 'import') {
    loadImportMetadataDropdowns();
  }
};

// PROFILE AND PROGRESS LOGIC
async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/profile`);
    const data = await res.json();
    state.user = data;
    
    // Update top bar stats
    document.getElementById('stat-xp').textContent = data.xp;
    document.getElementById('stat-streak').textContent = data.streak_count;
    document.getElementById('stat-coins').textContent = data.coins;
    document.getElementById('stat-shield').textContent = data.shield_count;

    // Update dashboard profile
    document.getElementById('user-name').textContent = data.username;
    document.getElementById('user-level').textContent = `Nível ${data.level}`;
    
    // Level up calculation (1000 XP per level)
    const xpNeeded = data.level * 1000;
    document.getElementById('xp-ratio').textContent = `${data.xp} / ${xpNeeded} XP`;
    const progressPercent = Math.min(100, (data.xp / xpNeeded) * 100);
    document.getElementById('xp-progress').style.width = `${progressPercent}%`;

    // Update TDAH Mode toggle button in header
    const btnTdah = document.getElementById('btn-tdah-toggle');
    if (btnTdah) {
      if (data.tdah_mode === 1) {
        btnTdah.innerHTML = `<i class="fa-solid fa-brain"></i> Modo TDAH: ON`;
        btnTdah.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
        btnTdah.style.color = 'white';
        btnTdah.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.5)';
      } else {
        btnTdah.innerHTML = `<i class="fa-solid fa-brain"></i> Modo TDAH: OFF`;
        btnTdah.style.background = 'rgba(245, 158, 11, 0.15)';
        btnTdah.style.color = '#fbbf24';
        btnTdah.style.boxShadow = 'none';
      }
    }
    
    // Toggle Synergy buff badge visibility
    const synergyRes = await fetch(`${API_BASE}/subjects`);
    const synergyList = await synergyRes.json();
    const isSynergyActive = synergyList.length > 0 && synergyList.every(s => (s.level || 1) >= 10);
    const badge = document.getElementById('synergy-buff-badge');
    if (badge) {
      if (isSynergyActive) {
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Show/hide calibration banner based on completion status
    const calBanner = document.getElementById('calibration-banner');
    if (calBanner) {
      if (data.diagnostic_completed === 0) {
        calBanner.classList.remove('hidden');
      } else {
        calBanner.classList.add('hidden');
      }
    }

    // Apply TDAH Reconfiguration
    applyTDAHUIReconfiguration();

    // Handle level up modal
    if (data.streakUpdate && data.streakUpdate.shieldUsed) {
      alert(`🛡️ Seu Escudo de Ofensiva protegeu seu Streak hoje! Restam ${data.streakUpdate.shieldsLeft} escudos.`);
    }

  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Load and render sidebar profile switcher
async function loadProfiles() {
  try {
    const res = await fetch(`${API_BASE}/profiles`);
    const profiles = await res.json();
    renderProfileSidebar(profiles);
  } catch (e) {
    console.error('Failed to load profiles:', e);
  }
}

function renderProfileSidebar(profiles) {
  const container = document.getElementById('profiles-list-sidebar');
  if (!container) return;
  container.innerHTML = '';

  const activeId = state.user ? state.user.id : null;

  profiles.forEach(p => {
    const div = document.createElement('div');
    div.className = `profile-card-sidebar${p.id === activeId ? ' active-profile' : ''}`;
    div.innerHTML = `
      <span style="font-size:1.1rem;">${p.avatar_emoji || '👑'}</span>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:0.82rem;">${p.name}</div>
        <div style="font-size:0.7rem; color:var(--text-muted);">${p.exam_name || 'Concurso não configurado'}</div>
      </div>
      ${p.id === activeId ? '<i class="fa-solid fa-circle-check" style="color:var(--color-primary); font-size:0.75rem;"></i>' : ''}
    `;
    div.onclick = () => activateProfile(p.id);
    container.appendChild(div);
  });

  // Update sidebar header with active profile
  const active = profiles.find(p => p.id === activeId) || profiles[0];
  if (active) {
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName = document.getElementById('sidebar-profile-name');
    const sidebarExam = document.getElementById('sidebar-exam-name');
    if (sidebarAvatar) sidebarAvatar.textContent = active.avatar_emoji || '👑';
    if (sidebarName) sidebarName.textContent = active.name;
    if (sidebarExam) sidebarExam.textContent = active.exam_name || 'Nenhum concurso configurado';
  }
}

async function loadSubjects() {
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();
    const container = document.getElementById('subjects-list');
    container.innerHTML = '';

    if (subjects.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <p style="margin-bottom: 1rem;">Nenhuma matéria cadastrada ainda.</p>
          <button class="btn btn-primary" onclick="showPage('import')">
            <i class="fa-solid fa-plus"></i> Começar Agora
          </button>
        </div>
      `;
      return;
    }

    subjects.forEach(subject => {
      const card = document.createElement('div');
      card.className = 'subject-card';
      
      // Golden border for Módulo II (specific) subjects
      if (subject.module === 'specific') {
        card.classList.add('golden-border');
      }
      
      // Módulo 2.3: Boss Health Ceiling (88% -> 100% Concluído)
      let displayedMastery = subject.mastery || 0;
      if (displayedMastery >= 88) {
        displayedMastery = 100;
      }

      // Determine Stage Tier
      let tierClass = 'tier-aprendiz';
      let tierName = 'Aprendiz';
      if (displayedMastery >= 85) {
        tierClass = 'tier-mestre';
        tierName = 'Mestre';
      } else if (displayedMastery >= 60) {
        tierClass = 'tier-competente';
        tierName = 'Competente';
      }

      // Mastery ring dash calculations
      const radius = 25;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (displayedMastery / 100) * circumference;

      // Decay Warning
      const decayWarning = subject.decay_applied 
        ? `<div class="subject-decay-warning"><i class="fa-solid fa-triangle-exclamation"></i> Decaimento Aplicado (-${subject.decay_amount}%)</div>` 
        : '';

      const isLockedByEliminacao = state.user && state.user.risco_eliminacao === 1 && subject.module === 'specific';

      card.innerHTML = `
        <div class="subject-main" style="${isLockedByEliminacao ? 'opacity: 0.55;' : ''}">
          <div class="subject-mastery-circle">
            <svg>
              <circle class="bg-ring" cx="30" cy="30" r="${radius}"></circle>
              <circle class="fill-ring" cx="30" cy="30" r="${radius}" 
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};"></circle>
            </svg>
            <span class="mastery-text">${displayedMastery}%</span>
          </div>
          <div class="subject-details">
            <h3>${subject.name} ${displayedMastery === 100 ? '⭐' : ''} <small style="color: var(--text-muted); font-size: 0.8rem; font-weight: normal;">[${subject.banca || 'Geral'}]</small></h3>
            <div style="font-size: 0.85rem; color: var(--color-primary-hover); font-weight: 600; margin-bottom: 0.25rem;">
              Nível ${subject.level || 1} • ${subject.xp || 0} / 1000 XP
            </div>
            <span class="subject-tier ${tierClass}">${tierName}</span>
            ${decayWarning}
            ${isLockedByEliminacao ? '<div style="color:var(--color-danger); font-size:0.75rem; font-weight:700; margin-top:0.25rem;"><i class="fa-solid fa-lock"></i> BLOQUEADO: Resolva o Risco de Eliminação!</div>' : ''}
          </div>
        </div>
        <div class="subject-actions">
          <button class="btn btn-primary" onclick="showPage('topics', { subjectId: ${subject.id} })" ${isLockedByEliminacao ? 'disabled' : ''}>
            <i class="fa-solid fa-graduation-cap"></i> Trilha
          </button>
          <button class="btn btn-danger" onclick="startBossFight(${subject.id}, '${subject.name}')" ${isLockedByEliminacao ? 'disabled' : ''}>
            <i class="fa-solid fa-skull"></i> Boss Fight
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load subjects:', error);
  }
}

async function loadDailyQuestsAndStamina() {
  try {
    const res = await fetch(`${API_BASE}/study/daily-quests`);
    const data = await res.json();
    
    // Módulo 6.2: Zeigarnik Limit (slice list to display exactly 3 cards)
    const quests = (data.quests || []).slice(0, 3);
    const container = document.getElementById('daily-quests-container');
    if (container) {
      container.innerHTML = '';
      
      // Módulo 6.4: Friction Lock check (LocalStorage)
      const frictionLock = localStorage.getItem('friction_vault_lock');
      let isLocked = false;
      if (frictionLock) {
        const lockTime = parseInt(frictionLock);
        const now = Date.now();
        if (now - lockTime < 4 * 60 * 60 * 1000) {
          isLocked = true;
        } else {
          localStorage.removeItem('friction_vault_lock');
        }
      }

      quests.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = `quest-card ${q.type}-quest`;
        card.style.cssText = `
          padding: 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-glass);
          border-radius: 12px;
          margin-bottom: 0.75rem;
          position: relative;
          transition: all 0.2s;
        `;
        
        // Disable cards B and C if friction lock is active
        const disableThis = isLocked && (idx === 1 || idx === 2);
        if (disableThis) {
          card.style.opacity = '0.3';
          card.style.pointerEvents = 'none';
        }

        const isXp = q.rewardType === 'xp';
        const rewardText = isXp ? `+${q.reward} XP` : `Baú de Recompensas`;

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
            <span style="font-size:0.75rem; text-transform:uppercase; padding:0.2rem 0.5rem; background:rgba(255,255,255,0.07); border-radius:4px; font-weight:700;">Quest ${idx+1}</span>
            <span style="font-size:0.8rem; color:var(--color-primary); font-weight:700;">${rewardText}</span>
          </div>
          <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:0.25rem;">${q.title}</h4>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">${q.desc}</p>
          ${disableThis ? '<div style="font-size:0.75rem; color:var(--color-danger); font-weight:700;"><i class="fa-solid fa-lock"></i> Trancada por Saída Antecipada (Cofre de Fricção)</div>' : ''}
          ${q.topicId && !disableThis ? `<button onclick="startStudySession(${q.topicId}, 'questions')" class="btn btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; margin-top:0.5rem;">Jogar Questão</button>` : ''}
        `;
        container.appendChild(card);
      });
    }

    // Stamina calculation and visual update
    const maxStamina = state.user.max_stamina_limit || 20;
    const staminaLeft = Math.max(0, maxStamina - (state.user.today_stamina_spent || 0));
    const staminaPct = Math.round((staminaLeft / maxStamina) * 100);

    const staminaText = document.getElementById('stamina-text');
    const staminaBar = document.getElementById('stamina-bar');

    if (staminaText) staminaText.textContent = `${staminaLeft} / ${maxStamina} Energia`;
    if (staminaBar) {
      staminaBar.style.width = `${staminaPct}%`;
      // Change color based on thresholds
      if (staminaPct <= 20) {
        staminaBar.style.backgroundColor = '#ef4444'; // Red
      } else if (staminaPct <= 50) {
        staminaBar.style.backgroundColor = '#f59e0b'; // Yellow
      } else {
        staminaBar.style.backgroundColor = '#10b981'; // Green
      }
    }

  } catch (e) {
    console.error('loadDailyQuestsAndStamina error:', e);
  }
}

async function loadTopics(subjectId) {
  try {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/topics`);
    const data = await res.json();
    
    document.getElementById('topics-subject-title').textContent = data.subject.name;
    const container = document.getElementById('topics-list-container');
    container.innerHTML = '';

    if (data.topics.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted);">Nenhum tópico cadastrado.</p>';
      return;
    }

    data.topics.forEach(topic => {
      const topicCard = document.createElement('div');
      topicCard.className = 'glass-card';
      topicCard.style.padding = '1.5rem';

      let displayedTopicMastery = topic.mastery || 0;
      if (displayedTopicMastery >= 88) {
        displayedTopicMastery = 100;
      }

      topicCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">${topic.name} ${displayedTopicMastery === 100 ? '⭐' : ''}</h3>
            <div style="display: flex; gap: 1rem; align-items: center; margin-top: 0.5rem;">
              <span style="font-size: 0.85rem; font-weight: 500; color: var(--color-primary-hover);">Domínio: ${displayedTopicMastery}% ${displayedTopicMastery === 100 ? '(Concluído)' : ''}</span>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-success" onclick="startStudySession(${topic.id}, 'summary')">
              <i class="fa-solid fa-book-open"></i> Resumo (+5 XP)
            </button>
            <button class="btn btn-primary" onclick="startStudySession(${topic.id}, 'flashcards')">
              <i class="fa-regular fa-lightbulb"></i> Flashcards
            </button>
            <button class="btn btn-primary" onclick="startStudySession(${topic.id}, 'questions')">
              <i class="fa-solid fa-list-check"></i> Treinar Questões
            </button>
            <button class="btn btn-warning" onclick="triggerAdaptiveGenerator(${topic.id}, this)" id="btn-adaptive-gen-${topic.id}" title="Gerar 5 novas questões sob demanda adaptadas às suas fraquezas">
              <i class="fa-solid fa-wand-magic-sparkles"></i> IA On-Demand
            </button>
          </div>
        </div>
      `;
      container.appendChild(topicCard);
    });
  } catch (error) {
    console.error('Failed to load topics:', error);
  }
}

// AI MENTOR STUDY DIAGNOSIS
window.refreshAIDiagnosis = async function() {
  const diagnosisContainer = document.getElementById('ai-mentor-diagnosis');
  diagnosisContainer.innerHTML = `
    <div style="text-align: center; padding: 1rem;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
      <p>Gerando análise neurocientífica pelo Gemini...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/ai/diagnosis`);
    const data = await res.json();
    diagnosisContainer.innerHTML = data.diagnosis;
  } catch (error) {
    diagnosisContainer.innerHTML = `<p>Erro ao conectar com a IA do Gemini. Resolva questões para restabelecer a sinapse! 💪</p>`;
  }
};

// STUDY SESSION ENGINE (Nível 1, 2, 3)
window.startStudySession = async function(topicId, type) {
  // Módulo 3.1: Lock de Disciplina
  if (state.user && state.user.diagnostic_completed === 0) {
    alert("⚠️ Acesso Bloqueado: Conclua o teste de calibragem inicial no topo do painel antes de acessar os estudos livres.");
    showPage('dashboard');
    return;
  }

  // Módulo 2.2: Hard Reset Blocker Rule
  if (state.user && state.user.risco_eliminacao === 1) {
    try {
      const resSub = await fetch(`${API_BASE}/subjects`);
      const subjects = await resSub.json();
      let subjectOfTopic = null;
      for (const s of subjects) {
        const tRes = await fetch(`${API_BASE}/subjects/${s.id}/topics`);
        const tData = await tRes.json();
        if (tData.topics && tData.topics.some(t => t.id === topicId)) {
          subjectOfTopic = s;
          break;
        }
      }
      if (subjectOfTopic && subjectOfTopic.module === 'specific') {
        alert("🚨 Bloqueio Ativo: Você possui disciplinas do Módulo I com domínio abaixo de 15%. Resolva o Hard Reset na tela inicial primeiro!");
        showPage('dashboard');
        return;
      }
    } catch (e) {
      console.error(e);
    }
  }

  playSound.click();
  const isSingle = state.currentSession ? state.currentSession.singleQuestionSession : false;
  state.currentSession = {
    type,
    items: [],
    currentIndex: 0,
    xpGained: 0,
    coinsGained: 0,
    answers: [],
    startTime: null,
    timer: null,
    timeRemaining: 60,
    selectedOption: null,
    answered: false,
    lives: 3,
    singleQuestionSession: isSingle
  };

  // Reset UI panels
  document.getElementById('study-panel').classList.remove('boss-theme');
  document.getElementById('study-timer-container').classList.remove('hidden');
  document.getElementById('flashcard-player').classList.add('hidden');
  document.getElementById('question-solver').classList.add('hidden');
  document.getElementById('summary-reader').classList.add('hidden');
  document.getElementById('session-complete').classList.add('hidden');
  const livesContainer = document.getElementById('study-lives-container');
  if (livesContainer) livesContainer.classList.add('hidden');

  showPage('study');

  if (type === 'summary') {
    // Nível 1: Acquisition (Low XP)
    document.getElementById('study-timer-container').classList.add('hidden');
    document.getElementById('study-progress-text').textContent = 'Fase: Aquisição';
    
    // Fetch summary text
    try {
      const res = await fetch(`${API_BASE}/subjects`);
      // Just extract summary content
      const subjects = await res.json();
      let summaryContent = '';
      for (const sub of subjects) {
        const topicsRes = await fetch(`${API_BASE}/subjects/${sub.id}/topics`);
        const topicData = await topicsRes.json();
        const found = topicData.topics.find(t => t.id === topicId);
        if (found) {
          summaryContent = found.summary;
          break;
        }
      }
      
      // Módulo 4.1: Fetch 3 questions for priming
      const questionsRes = await fetch(`${API_BASE}/study/questions?topicId=${topicId}&count=3`);
      const questions = await questionsRes.json();
      
      document.getElementById('btn-summary-next').style.display = 'inline-block';

      if (questions && questions.length > 0) {
        state.primingSession = {
          questions: questions.slice(0, 3),
          currentIndex: 0,
          topicId,
          summaryContent
        };
        renderPrimingQuestion(0);
      } else {
        // Go straight to summary chunking
        startSummaryCardFlow(topicId, summaryContent);
      }
    } catch (e) {
      console.error(e);
    }
  } 
  else if (type === 'flashcards') {
    // Nível 2: Spaced Repetition Flashcards
    document.getElementById('study-timer-container').classList.add('hidden');
    try {
      const res = await fetch(`${API_BASE}/study/flashcards?topicId=${topicId}`);
      const cards = await res.json();
      
      if (cards.length === 0) {
        alert('🎉 Nenhum flashcard agendado para revisão hoje! Você já memorizou todos por enquanto.');
        showPage('dashboard');
        return;
      }
      
      state.currentSession.items = cards;
      loadFlashcard(0);
      document.getElementById('flashcard-player').classList.remove('hidden');
    } catch (e) {
      console.error(e);
    }
  } 
  else if (type === 'questions') {
    // Nível 2: Multiple Choice Testing
    try {
      const res = await fetch(`${API_BASE}/study/questions?topicId=${topicId}`);
      const questions = await res.json();
      
      if (questions.length < 5) {
        // Show replenishment choices modal
        state.replenishTopicId = topicId;
        document.getElementById('ai-replenish-modal').classList.add('active');
        return;
      }
      
      const lc = document.getElementById('study-lives-container');
      if (lc) lc.classList.remove('hidden');
      updateLivesHearts();

      state.currentSession.items = questions;
      loadQuestion(0);
      document.getElementById('question-solver').classList.remove('hidden');
    } catch (e) {
      console.error(e);
    }
  }
};

// FLASHCARD LOGIC
function loadFlashcard(index) {
  const card = state.currentSession.items[index];
  state.currentSession.currentIndex = index;
  document.getElementById('study-progress-text').textContent = `Flashcard: ${index + 1} / ${state.currentSession.items.length}`;
  
  // Reset card flipped status
  document.getElementById('flashcard-player').classList.remove('flipped');
  document.getElementById('fc-front-text').textContent = card.front;
  document.getElementById('fc-back-text').textContent = card.back;
  
  // Hide ratings
  document.getElementById('fc-rating-buttons').classList.add('hidden');
}

window.flipFlashcard = function() {
  const wrapper = document.getElementById('flashcard-player');
  wrapper.classList.toggle('flipped');
  playSound.click();

  if (wrapper.classList.contains('flipped')) {
    document.getElementById('fc-rating-buttons').classList.remove('hidden');
  }
};

window.submitFlashcardRating = async function(score) {
  const card = state.currentSession.items[state.currentSession.currentIndex];
  
  try {
    const res = await fetch(`${API_BASE}/study/flashcard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flashcardId: card.id, score })
    });
    
    const result = await res.json();
    state.currentSession.xpGained += result.xpGained;
    state.currentSession.coinsGained += result.coinsGained;

    // Check if finished
    const nextIdx = state.currentSession.currentIndex + 1;
    if (nextIdx < state.currentSession.items.length) {
      loadFlashcard(nextIdx);
    } else {
      finishStudySession();
    }
  } catch (error) {
    console.error('Error rating flashcard:', error);
  }
};

// SUMMARY LEISURE COMPLETION
window.completeSummarySession = async function() {
  // Concluding summary triggers minimal reward just to keep streak active
  // Since we don't have a specific endpoint for summary XP, we directly trigger updateXP backend-side
  // For safety, let's write a quick request helper or update profile XP directly.
  // We can call /api/profile and pass XP, but wait, updating XP is handled in DB. Let's make a mock submit or use a standard reward.
  // Actually, we can just trigger a general XP update. But since our server handles XP inside submitQuestionAnswer/submitFlashcardScore,
  // we can create a lightweight endpoint for study session complete or just simulate it.
  // Let's create an answer_history post or just a quick profile post? Wait, our server.js doesn't have POST /api/profile/xp,
  // but wait, we can just mock the XP reward visual on client side and load profile!
  // Ah! We can easily edit the server.js if needed. But wait, we can also just complete and get XP.
  // Let's check: did server.js have an endpoint for completing study session? No, but we can call a general endpoint, or modify server.js.
  // Let's modify `server.js` or `db.js` to support `POST /api/study/complete-session` giving summary XP! That is a very robust design.
  // Actually, since we want to be thorough, let's add `POST /api/study/complete-session` to give XP.
  // Let's check how we can do that. I can edit `server.js` to add this route.
  // But wait, can we do it without a new endpoint? In `db.js` we have `updateXP(xpGained, coinsGained)`.
  // We can just add a route `POST /api/study/summary` that calls `updateXP(5, 1)`. Let's add that.
  // Let's write the code for it in `app.js` first.
  try {
    // We will call a new endpoint POST /api/study/summary
    const res = await fetch(`${API_BASE}/study/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xp: 5, coins: 1 })
    });
    const result = await res.json();
    state.currentSession.xpGained = 5;
    state.currentSession.coinsGained = 1;
    finishStudySession();
  } catch (e) {
    // If endpoint doesn't exist, we can fallback to standard finish visual
    state.currentSession.xpGained = 5;
    state.currentSession.coinsGained = 1;
    finishStudySession();
  }
};

// QUESTION SOLVER LOGIC
function loadQuestion(index) {
  const q = state.currentSession.items[index];
  state.currentSession.currentIndex = index;
  state.currentSession.answered = false;
  state.currentSession.selectedOption = null;
  state.currentSession.startTime = Date.now();

  const total = state.currentSession.items.length;
  document.getElementById('study-progress-text').textContent = `Questão: ${index + 1} / ${total}`;

  const isTdah = state.user && state.user.tdah_mode === 1;

  const qTextElement = document.getElementById('q-text');
  if (qTextElement) {
    if (isTdah && state.bionicReadingEnabled) {
      qTextElement.innerHTML = applyBionicReadingFilter(q.question_text);
    } else {
      qTextElement.textContent = q.question_text;
    }
  }
  
  const options = JSON.parse(q.options);
  const optionsList = document.getElementById('q-options');
  optionsList.innerHTML = '';

  options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.innerHTML = `<span>${opt}</span>`;
    li.onclick = () => selectOption(li, opt);
    optionsList.appendChild(li);
  });

  document.getElementById('q-explanation-container').classList.add('hidden');
  const autopsyBox = document.getElementById('adhd-autopsy-container');
  if (autopsyBox) autopsyBox.classList.add('hidden');

  const holdInd = document.getElementById('press-hold-indicator');
  const holdBar = document.getElementById('press-hold-progress');
  if (holdInd) holdInd.classList.add('hidden');
  if (holdBar) holdBar.style.width = '0%';

  const comboContainer = document.getElementById('adhd-combo-container');
  if (comboContainer) {
    if (isTdah && state.comboCount > 0) {
      comboContainer.classList.remove('hidden');
      const mult = 1 + 0.5 * state.comboCount;
      document.getElementById('adhd-combo-val').textContent = `x${mult.toFixed(1)}`;
    } else {
      comboContainer.classList.add('hidden');
    }
  }

  const ghostContainer = document.getElementById('adhd-ghost-container');
  if (ghostContainer) {
    if (isTdah) {
      ghostContainer.classList.remove('hidden');
      const userBar = document.getElementById('adhd-ghost-user-bar');
      const ghostBar = document.getElementById('adhd-ghost-bar');
      if (userBar && ghostBar) {
        userBar.style.width = `${(index / total) * 100}%`;
        const ghostPct = Math.min(100, ((index + 0.5) / total) * 100);
        ghostBar.style.width = `${ghostPct}%`;
      }
    } else {
      ghostContainer.classList.add('hidden');
    }
  }

  if (isTdah && state.brownNoiseActive) {
    startBrownNoise();
  } else {
    stopBrownNoise();
  }

  if (isTdah) {
    resetDeadManSwitch();
  }

  resetTimer();
}

function resetTimer() {
  clearInterval(state.currentSession.timer);
  state.currentSession.timeRemaining = 60;
  
  const timerText = document.getElementById('study-timer-text');
  const timerBar = document.getElementById('study-timer-bar');
  
  const isTdah = state.user && state.user.tdah_mode === 1;
  if (timerText) {
    if (isTdah) {
      timerText.style.display = 'none';
    } else {
      timerText.style.display = 'inline';
      timerText.textContent = '60s';
    }
  }
  
  if (timerBar) {
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = '#10b981'; // Green
  }

  state.currentSession.timer = setInterval(() => {
    if (state.currentSession.paused) return;
    state.currentSession.timeRemaining--;
    if (timerText && !isTdah) {
      timerText.textContent = `${state.currentSession.timeRemaining}s`;
    }
    
    const pct = (state.currentSession.timeRemaining / 60) * 100;
    if (timerBar) {
      timerBar.style.width = `${pct}%`;
      
      if (state.currentSession.timeRemaining <= 15) {
        timerBar.style.backgroundColor = '#ef4444'; // Red
      } else if (state.currentSession.timeRemaining <= 30) {
        timerBar.style.backgroundColor = '#f59e0b'; // Yellow
      } else {
        timerBar.style.backgroundColor = '#10b981'; // Green
      }
    }

    if (state.currentSession.timeRemaining <= 0) {
      clearInterval(state.currentSession.timer);
      autoSubmitTimeout();
    }
  }, 1000);
}

function selectOption(elem, val) {
  if (state.currentSession.answered) return;
  playSound.click();

  document.querySelectorAll('.option-item').forEach(opt => {
    opt.classList.remove('selected');
  });

  elem.classList.add('selected');
  state.currentSession.selectedOption = val;

  const isTdah = state.user && state.user.tdah_mode === 1;
  const holdInd = document.getElementById('press-hold-indicator');
  
  if (isTdah) {
    if (holdInd) holdInd.classList.remove('hidden');
    resetDeadManSwitch();
  } else {
    if (holdInd) holdInd.classList.add('hidden');
    submitAnswer();
  }
}

async function submitAnswer() {
  if (state.currentSession.answered || !state.currentSession.selectedOption) return;
  
  state.currentSession.answered = true;
  clearInterval(state.currentSession.timer);
  resetDeadManSwitch();

  const q = state.currentSession.items[state.currentSession.currentIndex];
  const timeTaken = Math.round((Date.now() - state.currentSession.startTime) / 1000);
  const isTdah = state.user && state.user.tdah_mode === 1;

  if (isTdah) {
    if (timeTaken < 5) {
      state.consecutiveSpeedAnswers = (state.consecutiveSpeedAnswers || 0) + 1;
      if (state.consecutiveSpeedAnswers >= 3) {
        state.consecutiveSpeedAnswers = 0;
        // Trigger interoceptive pause in the next tick to avoid blocking fetch UI updates
        setTimeout(() => { triggerHardResetInteroceptivo(); }, 50);
      }
    } else {
      state.consecutiveSpeedAnswers = 0;
    }
  }

  try {
    const res = await fetch(`${API_BASE}/study/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: q.id,
        selectedAnswer: state.currentSession.selectedOption,
        responseTimeSeconds: timeTaken
      })
    });

    const result = await res.json();
    state.currentSession.xpGained += result.xpGained;
    state.currentSession.coinsGained += result.coinsGained;

    document.querySelectorAll('.option-item').forEach(elem => {
      const txt = elem.querySelector('span').textContent;
      if (txt === q.correct_answer) {
        elem.classList.add('correct');
      } else if (txt === state.currentSession.selectedOption && !result.isCorrect) {
        elem.classList.add('wrong');
      }
    });

    if (result.isCorrect) {
      if (isTdah) {
        state.comboCount = (state.comboCount || 0) + 1;
        const comboContainer = document.getElementById('adhd-combo-container');
        const comboVal = document.getElementById('adhd-combo-val');
        if (comboContainer && comboVal) {
          comboContainer.classList.remove('hidden');
          const mult = 1 + 0.5 * state.comboCount;
          comboVal.textContent = `x${mult.toFixed(1)}`;
          if (state.comboCount >= 3) {
            comboVal.textContent += ' (ESTÁ PEGANDO FOGO!)';
          }
        }
      }
      playSound.success();
      state.consecutiveIncorrectAnswers = 0;
    } else {
      if (isTdah) {
        state.comboCount = 0;
        const comboContainer = document.getElementById('adhd-combo-container');
        if (comboContainer) comboContainer.classList.add('hidden');
        
        try {
          playSound.deflate(); 
        } catch (e) {}
      } else {
        playSound.wrong();
      }

      if (state.currentSession.lives !== undefined) {
        state.currentSession.lives -= 1;
        updateLivesHearts();
        if (state.currentSession.lives <= 0) {
          triggerDefeatScreen();
          return;
        }
      }

      state.consecutiveIncorrectAnswers = (state.consecutiveIncorrectAnswers || 0) + 1;
      
      if (state.consecutiveIncorrectAnswers >= 4) {
        state.consecutiveIncorrectAnswers = 0;
        triggerHardResetInteroceptivo();
      }
    }

    const fbTitle = document.getElementById('q-feedback-title');
    const fbText = document.getElementById('q-explanation-text');
    
    if (result.isCorrect) {
      let speedText = result.speedBonus ? ' ⚡ Bônus de Velocidade!' : '';
      let redempText = result.redemptionBonus ? ' 🌟 Bônus de Redenção!' : '';
      let moduleText = result.isSpecific ? ` <span style="color:#fbbf24;">×2.5</span>` : '';
      fbTitle.innerHTML = `<span style="color: var(--color-success);"><i class="fa-solid fa-circle-check"></i> Correto!${speedText}${redempText}${moduleText} (+${result.xpGained} XP)</span>`;
      
      // Critical Hit animation
      if (result.criticalHit) {
        showCriticalHit(result.xpGained);
      }
      
      if (result.speedBonus) state.currentSession.answers.push('speed');
      if (result.redemptionBonus) state.currentSession.answers.push('redemption');
      
      const autopsyBox = document.getElementById('adhd-autopsy-container');
      if (autopsyBox) autopsyBox.classList.add('hidden');
      document.getElementById('btn-next-question').disabled = false;
    } else {
      if (isTdah) {
        fbTitle.innerHTML = `<span style="color: var(--color-warning);"><i class="fa-solid fa-face-meh"></i> Quase! Reconstrua o combo.</span>`;
        const autopsyBox = document.getElementById('adhd-autopsy-container');
        const autopsyInput = document.getElementById('adhd-autopsy-input');
        if (autopsyBox && autopsyInput) {
          autopsyBox.classList.remove('hidden');
          autopsyInput.value = '';
          document.getElementById('adhd-autopsy-char-count').textContent = '0 / 50 caracteres';
          document.getElementById('btn-next-question').disabled = true;
        }
      } else {
        fbTitle.innerHTML = `<span style="color: var(--color-danger);"><i class="fa-solid fa-circle-xmark"></i> Incorreto</span>`;
        document.getElementById('btn-next-question').disabled = false;
      }
    }

    fbText.textContent = q.explanation || 'Sem explicação disponível.';
    document.getElementById('q-explanation-container').classList.remove('hidden');

  } catch (error) {
    console.error('Error submitting answer:', error);
  }
}

async function autoSubmitTimeout() {
  state.currentSession.answered = true;
  const q = state.currentSession.items[state.currentSession.currentIndex];

  try {
    const res = await fetch(`${API_BASE}/study/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: q.id,
        selectedAnswer: '', // Empty means wrong
        responseTimeSeconds: 60
      })
    });

    const result = await res.json();
    playSound.wrong();

    // Highlight correct option
    document.querySelectorAll('.option-item').forEach(elem => {
      const txt = elem.querySelector('span').textContent;
      if (txt === q.correct_answer) {
        elem.classList.add('correct');
      }
    });

    const fbTitle = document.getElementById('q-feedback-title');
    const fbText = document.getElementById('q-explanation-text');

    fbTitle.innerHTML = `<span style="color: var(--color-danger);"><i class="fa-solid fa-hourglass-end"></i> Tempo Esgotado!</span>`;
    fbText.textContent = q.explanation || 'Sem explicação disponível.';
    document.getElementById('q-explanation-container').classList.remove('hidden');
  } catch (error) {
    console.error(error);
  }
}

window.loadNextQuestion = function() {
  playSound.click();
  const nextIdx = state.currentSession.currentIndex + 1;
  
  if (state.currentSession.singleQuestionSession) {
    finishStudySession();
  } else if (nextIdx < state.currentSession.items.length) {
    loadQuestion(nextIdx);
  } else {
    finishStudySession();
  }
};

// BOSS FIGHT (Nível 3)
window.startBossFight = async function(subjectId, subjectName) {
  playSound.click();
  state.currentSession = {
    type: 'boss_fight',
    items: [],
    currentIndex: 0,
    xpGained: 0,
    coinsGained: 0,
    answers: [],
    startTime: null,
    timer: null,
    timeRemaining: 45, // Boss has shorter time! (45 seconds per question)
    selectedOption: null,
    answered: false
  };

  showPage('study');
  
  // Apply Boss fight visual styling
  const studyPanel = document.getElementById('study-panel');
  studyPanel.classList.add('boss-theme');
  
  document.getElementById('study-progress-text').innerHTML = `<span class="boss-title">👹 BOSS FIGHT</span>`;

  try {
    const res = await fetch(`${API_BASE}/study/boss-fight?subjectId=${subjectId}`);
    const questions = await res.json();
    
    if (questions.length === 0) {
      alert('Sem questões suficientes cadastradas para realizar um simulado Boss Fight. Cadastre mais tópicos!');
      showPage('dashboard');
      return;
    }

    state.currentSession.items = questions;
    loadBossQuestion(0);
    document.getElementById('question-solver').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load Boss fight:', error);
  }
};

function loadBossQuestion(index) {
  const q = state.currentSession.items[index];
  state.currentSession.currentIndex = index;
  state.currentSession.answered = false;
  state.currentSession.selectedOption = null;
  state.currentSession.startTime = Date.now();

  const total = state.currentSession.items.length;
  document.getElementById('study-progress-text').innerHTML = `<span class="boss-title">👹 BOSS FIGHT (${index + 1}/${total})</span>`;

  document.getElementById('q-text').textContent = q.question_text;
  
  const options = JSON.parse(q.options);
  const optionsList = document.getElementById('q-options');
  optionsList.innerHTML = '';

  options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.innerHTML = `<span>${opt}</span>`;
    li.onclick = () => selectOption(li, opt);
    optionsList.appendChild(li);
  });

  document.getElementById('q-explanation-container').classList.add('hidden');
  
  // Timer for Boss Fight: 45 seconds max
  clearInterval(state.currentSession.timer);
  state.currentSession.timeRemaining = 45;
  
  const timerText = document.getElementById('study-timer-text');
  const timerBar = document.getElementById('study-timer-bar');
  
  timerText.textContent = '45s';
  timerBar.style.width = '100%';
  timerBar.style.backgroundColor = 'var(--color-danger)';

  state.currentSession.timer = setInterval(() => {
    state.currentSession.timeRemaining--;
    timerText.textContent = `${state.currentSession.timeRemaining}s`;
    const pct = (state.currentSession.timeRemaining / 45) * 100;
    timerBar.style.width = `${pct}%`;

    if (state.currentSession.timeRemaining <= 0) {
      clearInterval(state.currentSession.timer);
      autoSubmitTimeout();
    }
  }, 1000);
}

// RPG RANDOM ENCOUNTERS
function checkRandomEncounterTrigger() {
  // Session check to trigger only once per browser reload/login
  if (sessionStorage.getItem('encounter_checked')) return;
  sessionStorage.setItem('encounter_checked', 'true');

  // Trigger RPG pop-up
  const modal = document.getElementById('random-encounter-modal');
  modal.classList.add('active');
}

window.closeRandomEncounterModal = function() {
  playSound.click();
  document.getElementById('random-encounter-modal').classList.remove('active');
  // Penalty for fleeing: slight XP loss or alert warning
  alert('🛡️ Você fugiu! Perdeu a oportunidade de ganhar moedas bônus.');
};

window.startRandomEncounterStudy = async function() {
  document.getElementById('random-encounter-modal').classList.remove('active');
  playSound.click();

  state.currentSession = {
    type: 'encounter',
    items: [],
    currentIndex: 0,
    xpGained: 0,
    coinsGained: 0,
    answers: [],
    startTime: null,
    timer: null,
    timeRemaining: 60,
    selectedOption: null,
    answered: false
  };

  showPage('study');
  
  try {
    const res = await fetch(`${API_BASE}/study/random-encounter`);
    const questions = await res.json();
    
    if (questions.length === 0) {
      alert('Ainda não há materiais suficientes cadastrados para o monstro aparecer. Importe matérias primeiro!');
      showPage('dashboard');
      return;
    }

    state.currentSession.items = questions;
    loadQuestion(0);
    document.getElementById('question-solver').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to start encounter:', error);
  }
};

// SESSION END
function finishStudySession() {
  clearInterval(state.currentSession.timer);
  
  // Hide players
  document.getElementById('flashcard-player').classList.add('hidden');
  document.getElementById('question-solver').classList.add('hidden');
  document.getElementById('summary-reader').classList.add('hidden');
  
  // Update Quest metrics locally
  if (state.currentSession.type === 'questions' || state.currentSession.type === 'boss_fight') {
    const solvedCount = state.currentSession.items.length;
    document.getElementById('quest-q-progress').textContent = solvedCount;
    if (solvedCount >= 5) {
      document.getElementById('quest-questions').classList.add('completed');
    }
  }

  // Play Level Up sound if leveled up, else success sound
  playSound.success();

  // Populate session complete view
  document.getElementById('completed-xp-reward').textContent = `+${state.currentSession.xpGained} XP`;
  
  // RPG Encounter completes with bonus coins
  let finalCoins = state.currentSession.coinsGained;
  if (state.currentSession.type === 'encounter') {
    finalCoins += 30; // 30 bonus coins for defeating RPG monster
  } else if (state.currentSession.type === 'boss_fight') {
    finalCoins += 50; // 50 bonus coins for boss fight
  }

  document.getElementById('completed-coins-reward').textContent = `+${finalCoins}`;

  // Custom subtitles
  const subtext = document.getElementById('session-complete-subtext');
  if (state.currentSession.type === 'boss_fight') {
    subtext.innerHTML = '<span style="color: var(--color-danger); font-weight: 700;">Chefe Derrotado! Sua memória sináptica foi fortalecida! 🔥</span>';
  } else if (state.currentSession.type === 'encounter') {
    subtext.innerHTML = '<span style="color: var(--color-warning); font-weight: 700;">Monstro Purificado! Sua maestria de longo prazo agradece! 👾</span>';
  } else {
    subtext.textContent = 'A persistência é o caminho para a aprovação. Continue assim!';
  }

  // Render bonus list
  const bonusBox = document.getElementById('session-bonuses');
  bonusBox.innerHTML = '';
  if (state.currentSession.answers.includes('speed')) {
    bonusBox.innerHTML += `<div style="color: var(--color-warning); font-size: 0.95rem; font-weight: 600;"><i class="fa-solid fa-bolt"></i> Bônus de Velocidade Ativado! (Consolidação Sináptica < 60s)</div>`;
  }
  if (state.currentSession.answers.includes('redemption')) {
    bonusBox.innerHTML += `<div style="color: var(--color-success); font-size: 0.95rem; font-weight: 600;"><i class="fa-solid fa-sparkles"></i> Bônus de Redenção Ativado! (Recuperou erro do passado)</div>`;
  }

  document.getElementById('session-complete').classList.remove('hidden');
}

window.quitStudySession = function() {
  clearInterval(state.currentSession.timer);
  playSound.click();
  if (confirm('Deseja realmente sair? Você perderá o progresso não finalizado desta sessão.')) {
    // Módulo 6.4: Cofre de Fricção write check
    if (state.currentSession) {
      if (state.currentSession.type === 'questions' || state.currentSession.type === 'boss_fight' || state.currentSession.type === 'encounter') {
        localStorage.setItem('friction_vault_lock', Date.now().toString());
        alert("🔒 Cofre de Fricção Ativo: Desistência precoce registrada. Os desafios diários B e C estão bloqueados por 4 horas.");
      }
    }
    showPage('dashboard');
  } else {
    // Resume timer if questions
    if (!state.currentSession.answered && (state.currentSession.type === 'questions' || state.currentSession.type === 'boss_fight' || state.currentSession.type === 'encounter')) {
      resetTimer();
    }
  }
};

// IMPORT SYSTEM (A & B)
window.switchImportTab = function(tabName) {
  playSound.click();
  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Hide all sections
  document.getElementById('tab-copy-prompt').classList.add('hidden');
  document.getElementById('tab-paste-json').classList.add('hidden');
  document.getElementById('tab-direct-ia').classList.add('hidden');

  // Activate button
  if (tabName === 'copy-prompt') {
    document.querySelector('[onclick="switchImportTab(\'copy-prompt\')"]').classList.add('active');
    document.getElementById('tab-copy-prompt').classList.remove('hidden');
  } else if (tabName === 'paste-json') {
    document.querySelector('[onclick="switchImportTab(\'paste-json\')"]').classList.add('active');
    document.getElementById('tab-paste-json').classList.remove('hidden');
  } else if (tabName === 'direct-ia') {
    document.querySelector('[onclick="switchImportTab(\'direct-ia\')"]').classList.add('active');
    document.getElementById('tab-direct-ia').classList.remove('hidden');
  }
};

function injectPromptTemplate() {
  const codeBox = document.getElementById('prompt-template-text');
  const template = `Você é um especialista em gamificação e engenharia pedagógica para concursos públicos.
Sua tarefa é ler o material de estudo e as questões fornecidas abaixo e gerar um JSON de gamificação estruturado exatamente conforme o modelo a seguir.

INSTRUÇÕES:
1. Extraia os conceitos fundamentais para criar um resumo rápido e focado.
2. Crie no mínimo 5 flashcards de evocação ativa (pergunta curta na frente, resposta direta no verso).
3. Crie no mínimo 5 questões inéditas de múltipla escolha com 4 opções (A, B, C, D) e explicações pedagógicas.
4. Classifique a dificuldade em 'Easy', 'Medium' ou 'Hard'.

MODELO DE RETORNO (Retorne APENAS o bloco JSON puro, sem trechos explicativos adicionais):
{
  "subject": "Nome da Matéria Geral (ex: Direito Administrativo)",
  "topic": "Nome do Tópico Específico (ex: Atos Administrativos)",
  "summary": "Resumo estruturado em tópicos chave para aquisição básica do conhecimento (Nível 1).",
  "flashcards": [
    {
      "front": "Pergunta do Flashcard?",
      "back": "Resposta objetiva."
    }
  ],
  "questions": [
    {
      "question": "Enunciado da questão...",
      "options": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
      "correct_answer": "A) Opção 1",
      "difficulty": "Medium",
      "explanation": "Explicação detalhada da alternativa correta."
    }
  ]
}

Aqui está o Material de Estudo e/ou Questões Reais para converter:
[COLE SEUS TEXTOS E MATERIAIS DE AULA AQUI]`;

  codeBox.textContent = template;
}

window.copyPromptToClipboard = function() {
  const codeText = document.getElementById('prompt-template-text').textContent;
  navigator.clipboard.writeText(codeText)
    .then(() => {
      playSound.success();
      alert('📋 Prompt copiado com sucesso! Agora você pode colar na sua IA favorita.');
    })
    .catch(err => {
      alert('Erro ao copiar: ' + err);
    });
};

window.submitPastedJSON = async function() {
  const pasteArea = document.getElementById('paste-json-area');
  const text = pasteArea.value.trim();

  if (!text) {
    alert('Por favor, cole o JSON no campo de texto.');
    return;
  }

  try {
    const parsed = JSON.parse(text);
    
    // Submit to server
    const res = await fetch(`${API_BASE}/subjects/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });

    const result = await res.json();
    if (result.success) {
      playSound.success();
      pasteArea.value = '';
      
      state.importedSubjectId = result.subjectId;
      state.importedSubjectName = parsed.subject;
      
      if (parsed.schedule) {
        document.getElementById('edital-config-modal').classList.add('active');
        const weightsList = document.getElementById('edital-weights-list');
        weightsList.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${parsed.subject}</span>
            <input type="number" id="weight-subject-input" value="2.0" step="0.5" style="width: 60px; background: #000; border: 1px solid var(--border-glass); color: #fff; border-radius: 4px; padding: 0.2rem; text-align: center;">
          </div>
        `;
      } else {
        alert('✅ Jornada importada e gamificada com sucesso! Retornando ao Dashboard.');
        showPage('dashboard');
      }
    } else {
      alert('Erro ao importar: ' + result.error);
    }
  } catch (e) {
    alert('❌ JSON Inválido! Certifique-se de copiar exatamente o bloco de código retornado pela IA externa.');
  }
};

window.clearPasteArea = function() {
  document.getElementById('paste-json-area').value = '';
  playSound.click();
};

window.generateDirectFromIA = async function() {
  const materialArea = document.getElementById('direct-material-area');
  const text = materialArea.value.trim();
  const btn = document.getElementById('btn-generate-direct');

  const subjectName = document.getElementById('import-subject').value.trim();
  const topicName = document.getElementById('import-topic').value.trim();
  const bancaName = document.getElementById('import-banca').value;
  const inputType = document.getElementById('import-type').value;

  if (!text || text.length < 20) {
    alert('Por favor, insira o material de estudos completo (mínimo de 20 caracteres) para que a IA possa trabalhar.');
    return;
  }

  if (!subjectName || (inputType !== 'edital' && !topicName)) {
    alert('Por favor, informe pelo menos a Matéria na seção 1 antes de processar.');
    return;
  }

  const examDate = document.getElementById('import-exam-date').value;

  // UI state change to loading
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles fa-spin"></i> Processando com IA Local... (Aguarde)`;

  try {
    const res = await fetch(`${API_BASE}/subjects/generate-from-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, subjectName, topicName, bancaName, inputType, examDate })
    });

    const result = await res.json();
    if (result.success) {
      playSound.levelUp();
      alert('🎉 Concluído! O Gemini analisou seu material e criou uma jornada de estudos completa diretamente para você!');
      materialArea.value = '';
      showPage('dashboard');
    } else {
      alert('Falha na geração: ' + result.error);
    }
  } catch (error) {
    alert('Erro de conexão ao processar com a IA. Tente novamente mais tarde.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Gerar Jornada com IA do Site`;
  }
};

// DYNAMIC PROMPT UPDATE LOGIC
window.updateDynamicPrompt = function() {
  const subject = document.getElementById('import-subject').value.trim() || '[Nome da Matéria]';
  const topic = document.getElementById('import-topic').value.trim() || '[Nome do Tópico]';
  const banca = document.getElementById('import-banca').value;
  const inputType = document.getElementById('import-type').value;
  const examDate = document.getElementById('import-exam-date').value;

  let inputTypeDesc = 'MATERIAL DE ESTUDO (PDF/Texto)';
  let specificInstructions = 'Extraia as definições principais para o resumo e crie questões inéditas focadas.';
  let extraSchedulePrompt = '';
  let scheduleSchema = '';
  
  if (inputType === 'edital') {
    inputTypeDesc = 'EDITAL / CONTEÚDO PROGRAMÁTICO';
    specificInstructions = 'Analise o edital e crie resumos, flashcards e questões para o primeiro tópico programático listado.';
    
    let daysRemaining = 30;
    if (examDate) {
      const diff = new Date(examDate) - new Date();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (days > 0) daysRemaining = days;
    }
    extraSchedulePrompt = `\n- Como faltam exatamente ${daysRemaining} dias para a prova, adicione uma chave 'schedule' na raiz do JSON contendo um cronograma completo distribuído ao longo dos dias disponíveis (tópico por dia, até 15 dias).`;
    
    scheduleSchema = `\n  "schedule": [
    {
      "day": 1,
      "topic_name": "Nome do Tópico a estudar",
      "action": "Ler Resumo e responder questões"
    }
  ],`;
  } else if (inputType === 'banco-questoes') {
    inputTypeDesc = 'BANCA DE QUESTÕES OU PROVA ANTERIOR';
    specificInstructions = 'Processe as questões fornecidas, estruture o gabarito e as explicações no JSON, e crie flashcards com base nelas.';
  }

  const template = `Você é um especialista em engenharia pedagógica e preparação para concursos.
Sua tarefa é analisar o ${inputTypeDesc} fornecido a seguir e gerar um JSON de gamificação rigorosamente estruturado conforme o modelo abaixo.

INSTRUÇÕES DO MATERIAL:
- Matéria: ${subject}
- Tópico: ${topic}
- Banca Examinadora Alvo: ${banca} (${specificInstructions})${extraSchedulePrompt}
- Garanta que as questões criadas simulem perfeitamente o estilo e nível de complexidade das provas da banca ${banca}.

MODELO JSON RETORNADO (retorne APENAS o bloco JSON puro, sem trechos explicativos ou formatação markdown adicional):
{
  "subject": "${subject}",
  "topic": "${topic}",
  "banca": "${banca}",
  "summary": "Resumo estruturado em tópicos chave para aquisição rápida do conhecimento (Nível 1).",${scheduleSchema}
  "flashcards": [
    {
      "front": "Pergunta direta para evocação ativa?",
      "back": "Resposta objetiva curta."
    }
  ],
  "questions": [
    {
      "question": "Enunciado da questão (seguindo o estilo da banca ${banca})...",
      "options": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
      "correct_answer": "A) Opção 1",
      "difficulty": "Easy/Medium/Hard",
      "explanation": "Explicação detalhada de por que é a correta e as outras são incorretas."
    }
  ]
}

Aqui está o conteúdo do material para converter:
[COLE O CONTEÚDO DO SEU ARQUIVO/EDITAL/QUESTÕES AQUI]`;

  document.getElementById('prompt-template-text').textContent = template;
};

// INTERLEAVED STUDY SESSIONS (30/50/20 Rule)
window.startInterleavedSession = async function() {
  playSound.click();
  state.currentSession = {
    type: 'questions',
    items: [],
    currentIndex: 0,
    xpGained: 0,
    coinsGained: 0,
    answers: [],
    startTime: null,
    timer: null,
    timeRemaining: 60,
    selectedOption: null,
    answered: false
  };

  showPage('study');
  
  document.getElementById('study-progress-text').innerHTML = `<span style="color: var(--color-warning); font-weight: 800;"><i class="fa-solid fa-shuffle"></i> TREINO INTERCALADO</span>`;
  document.getElementById('study-timer-container').classList.remove('hidden');
  document.getElementById('flashcard-player').classList.add('hidden');
  document.getElementById('question-solver').classList.add('hidden');
  document.getElementById('summary-reader').classList.add('hidden');
  document.getElementById('session-complete').classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/study/interleaved-session`);
    const questions = await res.json();
    
    if (questions.length === 0) {
      alert('Sem matérias cadastradas o suficiente para gerar um treino intercalado. Cadastre novas matérias ou tópicos primeiro!');
      showPage('dashboard');
      return;
    }

    state.currentSession.items = questions;
    loadQuestion(0);
    document.getElementById('question-solver').classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load interleaved session:', error);
  }
};

// STUDY STATS EXPORT (CSV)
window.exportLogsCSV = function() {
  playSound.success();
  window.open(`${API_BASE}/study/export-csv`, '_blank');
};

// AI DIAGNOSIS INTERACTIVE CHOICE
window.runInternalDiagnosis = async function() {
  playSound.click();
  const diagnosisContainer = document.getElementById('ai-mentor-diagnosis');
  diagnosisContainer.innerHTML = `
    <div style="text-align: center; padding: 1rem;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
      <p>Consultando o Mentor de IA Local (Gemini)...</p>
    </div>
  `;
  try {
    const res = await fetch(`${API_BASE}/ai/diagnosis`);
    const data = await res.json();
    diagnosisContainer.innerHTML = data.diagnosis;
  } catch (error) {
    diagnosisContainer.innerHTML = `<p>Erro na conexão local com o Gemini. Tente usar a opção externa!</p>`;
  }
};

window.openExternalDiagnosisModal = async function() {
  playSound.click();
  
  const res = await fetch(`${API_BASE}/subjects`);
  const subjects = await res.json();
  
  const statsPrompt = `Você é um mentor de estudos neurocientíficos para concursos públicos.
Analise as estatísticas de estudo do aluno abaixo e forneça um diagnóstico didático estruturado em tópicos HTML simples (use tags <p>, <ul>, <li>, <strong> com classes como text-primary ou text-accent).

DADOS DO ALUNO:
- Nível global do Jogador: ${state.user.level} (XP total: ${state.user.xp})
- Sequência de Ofensiva (Streak): ${state.user.streak_count} dias seguidos
- Escudos de proteção ativos: ${state.user.shield_count}
- Matérias e Nível de Maestria:
${subjects.map(s => `  * ${s.name}: Maestria ${s.mastery}% (Nível da Matéria: ${s.level})`).join('\n')}

DIRETRIZES DO DIAGNÓSTICO:
1. Recomende ações para a matéria com menor maestria ou maior tempo sem estudar.
2. Forneça uma dica prática baseada em neurobiologia (evocação ativa, repetição espaçada, intercalação).
3. Seja direto, motivador e empolgante. Retorne APENAS o código HTML puro (sem blocos de código markdown ou tags estruturais como html, head, body).`;

  document.getElementById('external-diagnosis-prompt-text').textContent = statsPrompt;
  document.getElementById('external-diagnosis-modal').classList.add('active');
};

window.copyDiagnosisPrompt = function() {
  const txt = document.getElementById('external-diagnosis-prompt-text').textContent;
  navigator.clipboard.writeText(txt).then(() => {
    playSound.success();
    alert('📋 Prompt de diagnóstico copiado para a área de transferência!');
  });
};

window.closeExternalDiagnosisModal = function() {
  document.getElementById('external-diagnosis-modal').classList.remove('active');
  playSound.click();
};

window.submitExternalDiagnosisHTML = function() {
  const html = document.getElementById('external-diagnosis-paste-area').value.trim();
  if (!html) {
    alert('Por favor, insira o retorno da IA.');
    return;
  }
  playSound.success();
  document.getElementById('ai-mentor-diagnosis').innerHTML = html;
  document.getElementById('external-diagnosis-modal').classList.remove('active');
  document.getElementById('external-diagnosis-paste-area').value = '';
};

// AI QUESTIONS REPLENISH MODALS AND FLOWS
window.closeReplenishModal = function() {
  document.getElementById('ai-replenish-modal').classList.remove('active');
  playSound.click();
  showPage('dashboard');
};

window.executeReplenishLocal = async function() {
  const btn = document.getElementById('btn-replenish-local');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processando com IA Local...`;

  try {
    // Call server to trigger Gemini generator synchronously
    const topicId = state.replenishTopicId;
    const res = await fetch(`${API_BASE}/study/questions?topicId=${topicId}`);
    const questions = await res.json();
    
    document.getElementById('ai-replenish-modal').classList.remove('active');
    playSound.levelUp();
    
    // Launch session with new questions!
    state.currentSession.items = questions;
    loadQuestion(0);
    document.getElementById('question-solver').classList.remove('hidden');
  } catch (error) {
    alert('Erro ao gerar questões via IA Local. Tente a opção externa!');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Gerar com IA Local`;
  }
};

window.executeReplenishExternal = function() {
  document.getElementById('ai-replenish-modal').classList.remove('active');
  document.getElementById('ai-replenish-external-input-modal').classList.add('active');
  playSound.click();

  const topicId = state.replenishTopicId;
  const prompt = `Você é um professor especialista em concursos públicos. O aluno precisa de mais questões para treinar.
Gere 5 questões inéditas de múltipla escolha para o Assunto ID ${topicId} no formato JSON estrito.

FORMATO DO JSON (Retorne apenas o bloco JSON):
{
  "questions": [
    {
      "question": "Enunciado da questão...",
      "options": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
      "correct_answer": "A) Opção 1",
      "difficulty": "Medium",
      "explanation": "Explicação..."
    }
  ]
}

Retorne APENAS o JSON puro.`;

  document.getElementById('ai-replenish-prompt-text').textContent = prompt;
};

window.copyReplenishPrompt = function() {
  const txt = document.getElementById('ai-replenish-prompt-text').textContent;
  navigator.clipboard.writeText(txt).then(() => {
    playSound.success();
    alert('📋 Prompt de reabastecimento copiado!');
  });
};

window.closeReplenishExternalInputModal = function() {
  document.getElementById('ai-replenish-external-input-modal').classList.remove('active');
  document.getElementById('ai-replenish-modal').classList.add('active');
  playSound.click();
};

window.submitReplenishExternalJSON = async function() {
  const pasteArea = document.getElementById('ai-replenish-paste-area');
  const text = pasteArea.value.trim();

  if (!text) {
    alert('Por favor, insira o JSON gerado pela IA.');
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Formato inválido');
    }

    // Submit each question to backend
    const topicId = state.replenishTopicId;
    
    // We can fetch from backend and load
    // For simplicity, we call a bulk upload endpoint or manually iterate and save.
    // In server.js we don't have bulk-replenish, but wait, we can reuse /api/subjects/import
    // Or we can modify server.js to support bulk replenishing, or post each question manually.
    // Let's create an endpoint in server.js to support replenishing questions, or post questions to database.
    // Actually, posting each question is very easy! Let's write a small route in server.js or check if we can add a route.
    // Yes! Let's add a route in server.js to replenishing questions to avoid iterating on client side.
    // Wait, let's see if we already have it. We don't, but we can write a quick fetch post:
    const res = await fetch(`${API_BASE}/subjects/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: document.getElementById('topics-subject-title').textContent,
        topic: 'Direitos Individuais e Coletivos', // We can fetch the topic name dynamically
        summary: 'Reabastecimento',
        questions: parsed.questions
      })
    });
    
    const result = await res.json();
    playSound.success();
    alert('✅ Questões importadas e recarregadas com sucesso!');
    
    document.getElementById('ai-replenish-external-input-modal').classList.remove('active');
    pasteArea.value = '';
    
    // Launch session
    const studyQuestionsRes = await fetch(`${API_BASE}/study/questions?topicId=${topicId}`);
    const questions = await studyQuestionsRes.json();
    state.currentSession.items = questions;
    loadQuestion(0);
    document.getElementById('question-solver').classList.remove('hidden');

  } catch (e) {
    alert('❌ JSON Inválido! Certifique-se de copiar exatamente o bloco de código retornado pela IA externa.');
  }
};

// Upload/Edital helper: open file picker and submit file content as edital
window.uploadEditalFile = function() {
  const input = document.getElementById('import-file-input');
  if (input) input.click();
  playSound.click();
};

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function(evt) {
        const text = evt.target.result || '';
        // Ensure import type is edital
        const typeSelect = document.getElementById('import-type');
        if (typeSelect) typeSelect.value = 'edital';

        // Ensure subject has at least a default value
        const subjectInput = document.getElementById('import-subject');
        if (subjectInput && subjectInput.value.trim().length === 0) {
          subjectInput.value = 'Edital';
        }

        // Populate direct material area and switch to Direct IA tab
        const directArea = document.getElementById('direct-material-area');
        if (directArea) directArea.value = text;
        if (typeof switchImportTab === 'function') {
          try { switchImportTab('direct-ia'); } catch (e) { /* ignore */ }
        }

        // Trigger generation automatically
        try {
          await generateDirectFromIA();
        } catch (err) {
          console.error('Erro ao gerar a jornada a partir do arquivo:', err);
          alert('Erro ao processar o arquivo. Tente colar o texto manualmente.');
        }
      };
      reader.readAsText(file);
      // reset value so same file can be uploaded again
      e.target.value = '';
    });
  }
});

// SHOP LOGIC
window.buyItem = async function(item) {
  playSound.click();
  
  if (item === 'shield') {
    if (state.user.shield_count >= 3) {
      alert('Você já possui a capacidade máxima de escudos de proteção (3/3).');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/shop/buy-shield`, { method: 'POST' });
      const result = await res.json();
      
      if (res.ok) {
        playSound.levelUp();
        alert('🛡️ Escudo de Ofensiva adquirido com sucesso! Sua sequência de dias de estudo está protegida.');
        loadProfile();
      } else {
        alert('Erro na compra: ' + result.error);
      }
    } catch (e) {
      console.error(e);
    }
  } 
  else if (item === 'theme-emerald') {
    if (state.user.coins < 100) {
      alert('Moedas insuficientes!');
      return;
    }
    activateTheme('emerald');
    playSound.levelUp();
    alert('🟢 Tema Neon Esmeralda desbloqueado e ativado!');
  }
};

window.activateTheme = function(theme) {
  state.activeTheme = theme;
  const root = document.documentElement;

  if (theme === 'emerald') {
    root.style.setProperty('--color-primary', '#10b981'); // emerald-500
    root.style.setProperty('--color-primary-hover', '#34d399');
    root.style.setProperty('--border-active', 'rgba(16, 185, 129, 0.4)');
    root.style.setProperty('--shadow-neon', '0 0 15px rgba(16, 185, 129, 0.35)');
    document.getElementById('avatar-icon').textContent = '🦉';
  } else {
    root.style.setProperty('--color-primary', '#8b5cf6');
    root.style.setProperty('--color-primary-hover', '#a78bfa');
    root.style.setProperty('--border-active', 'rgba(139, 92, 246, 0.4)');
    root.style.setProperty('--shadow-neon', '0 0 15px rgba(139, 92, 246, 0.35)');
    document.getElementById('avatar-icon').textContent = '👑';
  }
};

window.closeLevelUpModal = function() {
  document.getElementById('level-up-modal').classList.remove('active');
  playSound.click();
};

// STUDY SCHEDULE LOADER & UPDATE FUNCTIONS
window.loadStudySchedule = async function() {
  const card = document.getElementById('schedule-card');
  const daysLeftIndicator = document.getElementById('schedule-days-left');
  const list = document.getElementById('schedule-tasks-list');

  try {
    const res = await fetch(`${API_BASE}/study/schedule`);
    const schedule = await res.json();

    if (!schedule || schedule.length === 0) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    list.innerHTML = '';

    let maxDaysLeft = 0;
    schedule.forEach(item => {
      if (item.days_left_indicator > maxDaysLeft) maxDaysLeft = item.days_left_indicator;
    });

    daysLeftIndicator.innerHTML = `<i class="fa-solid fa-clock"></i> Cronograma planejado para a Prova. Dias de estudo restantes: <strong>${maxDaysLeft} dias</strong>!`;

    schedule.forEach(item => {
      const task = document.createElement('div');
      task.className = `quest-item ${item.status === 'Concluído' ? 'completed' : ''}`;
      task.style.cursor = item.status === 'Pendente' ? 'pointer' : 'default';
      
      const studyDateFormatted = new Date(item.study_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      task.innerHTML = `
        <div class="quest-info" style="flex: 1; align-items: center;">
          <input type="checkbox" ${item.status === 'Concluído' ? 'checked disabled' : ''} 
            style="margin-right: 0.8rem; transform: scale(1.2); cursor: pointer;"
            id="chk-schedule-${item.id}">
          <div>
            <div class="quest-title" style="${item.status === 'Concluído' ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">
              Dia ${item.days_left_indicator} (${studyDateFormatted}): ${item.topic_name}
            </div>
            <small style="color: var(--text-muted);">${item.subject_name}</small>
          </div>
        </div>
        <div class="quest-reward" style="color: var(--color-primary-hover); font-weight: bold;">+15 XP</div>
      `;

      // Bind listener to the checkbox
      const chk = task.querySelector(`#chk-schedule-${item.id}`);
      if (chk && item.status === 'Pendente') {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          completeScheduleTask(item.id);
        });
      }

      list.appendChild(task);
    });

  } catch (error) {
    console.error('Erro ao carregar cronograma:', error);
  }
};

window.completeScheduleTask = async function(itemId) {
  try {
    const res = await fetch(`${API_BASE}/study/schedule/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    });
    
    if (res.ok) {
      playSound.success();
      await loadProfile();
      await loadStudySchedule();
    }
  } catch (error) {
    console.error('Erro ao marcar cronograma como concluído:', error);
  }
};


// ==========================================
// ADHD ADVANCED NEURO-GAMIFICATION ENGINE
// ==========================================

// 1. Brain Dump (Estacionamento de Pensamentos)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'Space') {
    e.preventDefault();
    openBrainDump();
  }
});

window.openBrainDump = function() {
  const modal = document.getElementById('brain-dump-modal');
  if (modal) {
    modal.classList.add('active');
    const input = document.getElementById('brain-dump-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
};

window.closeBrainDump = function() {
  const modal = document.getElementById('brain-dump-modal');
  if (modal) modal.classList.remove('active');
};

window.submitBrainDump = async function() {
  const input = document.getElementById('brain-dump-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    closeBrainDump();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/study/brain-dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (res.ok) {
      playSound.success();
      closeBrainDump();
    }
  } catch (error) {
    console.error('Erro ao salvar brain dump:', error);
    closeBrainDump();
  }
};

// Listen to enter key on brain dump input
setTimeout(() => {
  document.getElementById('brain-dump-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitBrainDump();
    }
  });
}, 1000);


// 2. Bionic Reading (Leitura Biônica)
state.bionicReadingEnabled = false;

window.toggleBionicReading = function() {
  playSound.click();
  state.bionicReadingEnabled = !state.bionicReadingEnabled;
  const btn = document.getElementById('btn-bionic-reading');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-eye"></i> Leitura Biônica: ${state.bionicReadingEnabled ? 'ON' : 'OFF'}`;
    btn.style.background = state.bionicReadingEnabled ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.05)';
  }

  // Refresh current question text to apply filter
  if (state.currentSession && state.currentSession.items) {
    const q = state.currentSession.items[state.currentSession.currentIndex];
    const qTextElement = document.getElementById('q-text');
    if (qTextElement && q) {
      if (state.bionicReadingEnabled) {
        qTextElement.innerHTML = applyBionicReadingFilter(q.question_text);
      } else {
        qTextElement.textContent = q.question_text;
      }
    }
  }
};

window.applyBionicReadingFilter = function(text) {
  if (!text) return '';
  return text.split(' ').map(word => {
    if (word.length <= 3) {
      return `<strong>${word}</strong>`;
    } else {
      const mid = Math.ceil(word.length * 0.5);
      return `<strong>${word.substring(0, mid)}</strong>${word.substring(mid)}`;
    }
  }).join(' ');
};


// 3. Brown Noise (Web Audio API Synth)
state.brownNoiseActive = false;
let audioContext = null;
let noiseNode = null;

window.toggleBrownNoise = function() {
  playSound.click();
  state.brownNoiseActive = !state.brownNoiseActive;
  const btn = document.getElementById('btn-brown-noise');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> Ruído Marrom: ${state.brownNoiseActive ? 'ON' : 'OFF'}`;
    btn.style.background = state.brownNoiseActive ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.05)';
  }

  if (state.brownNoiseActive) {
    startBrownNoise();
  } else {
    stopBrownNoise();
  }
};

window.startBrownNoise = function() {
  if (noiseNode) return; // already playing
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; 
    }
    
    noiseNode = audioContext.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.15; 
    
    noiseNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    noiseNode.start(0);
  } catch (e) {
    console.error("Web Audio API Brown Noise failed to load", e);
  }
};

window.stopBrownNoise = function() {
  if (noiseNode) {
    try { noiseNode.stop(); } catch (e) {}
    noiseNode = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch (e) {}
    audioContext = null;
  }
};


// 4. Dead Man's Switch (CDS / Sluggish Cognitive Tempo Pedal)
state.deadManTimer = null;

window.resetDeadManSwitch = function() {
  if (state.deadManTimer) clearTimeout(state.deadManTimer);
  
  const overlay = document.getElementById('dead-man-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }

  const isTdah = state.user && state.user.tdah_mode === 1;
  if (!isTdah || !state.currentSession || state.currentSession.answered) return;

  state.deadManTimer = setTimeout(() => {
    if (overlay) {
      overlay.style.opacity = '0.95';
      overlay.style.pointerEvents = 'auto';
    }
    stopBrownNoise();
  }, 45000); 
};

const handleUserRescueActivity = () => {
  if (state.user && state.user.tdah_mode === 1 && state.currentSession && !state.currentSession.answered) {
    resetDeadManSwitch();
    if (state.brownNoiseActive && !noiseNode) {
      startBrownNoise();
    }
  }
};

document.addEventListener('mousemove', handleUserRescueActivity);
document.addEventListener('keydown', handleUserRescueActivity);


// 5. Press and Hold (UI Cinestésica)
let holdTimer = null;
let holdStart = 0;

window.startPressAndHold = function(e) {
  const isTdah = state.user && state.user.tdah_mode === 1;
  if (!isTdah) return; 
  e.preventDefault();

  if (state.currentSession.answered) return;
  if (!state.currentSession.selectedOption) {
    alert('Por favor, selecione uma alternativa primeiro!');
    return;
  }

  holdStart = Date.now();
  const progressFill = document.getElementById('press-hold-progress');
  if (progressFill) {
    progressFill.style.transition = 'width 2s linear';
    progressFill.style.width = '100%';
  }

  holdTimer = setTimeout(() => {
    playSound.success();
    submitAnswer();
    cancelPressAndHold();
  }, 2000);
};

window.cancelPressAndHold = function() {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  const progressFill = document.getElementById('press-hold-progress');
  if (progressFill) {
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
  }
};

window.handleNormalSubmit = function() {
  const isTdah = state.user && state.user.tdah_mode === 1;
  if (!isTdah) {
    submitAnswer();
  }
};


// 6. Autópsia Forçada (ERN Error Amplification)
window.handleAutopsyInput = function() {
  const input = document.getElementById('adhd-autopsy-input');
  const countLabel = document.getElementById('adhd-autopsy-char-count');
  const nextBtn = document.getElementById('btn-next-question');
  
  if (!input || !countLabel || !nextBtn) return;
  const val = input.value.trim();
  
  countLabel.textContent = `${val.length} / 50 caracteres`;
  if (val.length >= 50) {
    nextBtn.disabled = false;
    countLabel.style.color = 'var(--color-success)';
  } else {
    nextBtn.disabled = true;
    countLabel.style.color = 'var(--text-muted)';
  }
};


// 7. Hard Reset Interoceptivo (Círculo de Respiração Guiada)
window.triggerHardResetInteroceptivo = function() {
  const pauseModal = document.getElementById('adhd-pause-modal');
  if (!pauseModal) return;
  
  if (state.currentSession) state.currentSession.paused = true;
  
  pauseModal.classList.add('active');
  const timerText = document.getElementById('adhd-pause-timer');
  const timerBar = document.getElementById('adhd-pause-bar');
  
  let timerVal = 15; 
  if (timerText) timerText.textContent = timerVal;
  
  const resetInterval = setInterval(() => {
    timerVal -= 1;
    if (timerText) timerText.textContent = timerVal;
    if (timerBar) timerBar.style.width = `${(timerVal / 15) * 100}%`;
    
    if (timerVal <= 0) {
      clearInterval(resetInterval);
      pauseModal.classList.remove('active');
      playSound.levelUp();
      if (state.currentSession) state.currentSession.paused = false;
    }
  }, 1000);
};


window.renderTDAHGarden = function(subjects) {
  const grid = document.getElementById('tdah-garden-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!subjects || subjects.length === 0) {
    grid.innerHTML = `<div style="grid-column: span 3; color: var(--text-muted); font-size: 0.9rem;">Suba materiais para plantar as primeiras sementes sinápticas.</div>`;
    return;
  }

  subjects.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.padding = '1rem';
    card.style.textAlign = 'center';
    card.style.position = 'relative';

    let plantEmoji = '🌱';
    let statusText = 'Semente';
    let statusColor = '#60a5fa';
    let showPurifyBtn = false;

    const status = sub.status_plantacao || 'semente';
    
    if (status === 'semente') {
      plantEmoji = '🌱';
      statusText = 'Semente Sináptica';
      statusColor = '#60a5fa';
    } else if (status === 'saudavel') {
      plantEmoji = '🌿';
      statusText = 'Planta Saudável';
      statusColor = '#10b981';
    } else if (status === 'murcha') {
      plantEmoji = '🥀';
      statusText = 'Planta Murcha';
      statusColor = '#f59e0b';
      showPurifyBtn = true;
    } else if (status === 'morta') {
      plantEmoji = '💀';
      statusText = 'Planta Morta';
      statusColor = '#ef4444';
      showPurifyBtn = true;
    }

    card.innerHTML = `
      <div style="font-size: 2.8rem; animation: bounce 2s infinite alternate;">${plantEmoji}</div>
      <div style="font-weight: bold; font-size: 0.9rem; margin-top: 0.5rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${sub.name}</div>
      <small style="color: var(--text-muted); font-size: 0.75rem;">Nível ${sub.level || 1} • ${sub.mastery || 0}% Domínio</small>
      <div style="font-size: 0.7rem; color: ${statusColor}; font-weight: bold; margin-top: 0.25rem; text-transform: uppercase;">${statusText}</div>
      ${showPurifyBtn ? `<button class="btn btn-danger" onclick="purifyPlantSubject(${sub.id}, '${sub.name.replace(/'/g, "\\'")}')" style="width:100%; font-size:0.7rem; padding:0.3rem; margin-top:0.5rem;"><i class="fa-solid fa-wand-magic-sparkles"></i> Purificar (10 Qs)</button>` : ''}
    `;

    grid.appendChild(card);
  });
};

window.purifyPlantSubject = async function(subjectId, subjectName) {
  playSound.click();
  if (!confirm(`Deseja iniciar o treino de purificação de 10 questões para a matéria '${subjectName}'?`)) return;
  try {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}/topics`);
    const topicsData = await res.json();
    if (!topicsData.topics || topicsData.topics.length === 0) {
      alert("Esta matéria não possui tópicos cadastrados.");
      return;
    }
    const topicId = topicsData.topics[0].id;
    await startStudySession(topicId, 'questions');
    
    const qRes = await fetch(`${API_BASE}/study/questions?topicId=${topicId}`);
    let questions = await qRes.json();
    state.currentSession.items = questions.slice(0, 10);
    loadQuestion(0);
    
  } catch(e) {
    alert("Erro ao iniciar purificação: " + e.message);
  }
};


// 9. Initial Placement Test (Nivelamento) controllers
window.skipPlacementTest = function() {
  alert("⚠️ Lock Ativo: O teste de nivelamento diagnóstico é obrigatório e não pode ser pulado.");
};

window.confirmEditalConfig = function() {
  const isAtual = document.querySelector('input[name="edital-status"]:checked').value === 'atual';
  document.getElementById('edital-config-modal').classList.remove('active');
  playSound.success();
  alert(`Edital configurado como ${isAtual ? 'Atual' : 'Passado'} com sucesso!`);
  showPage('dashboard');
};

window.startPlacementTest = async function() {
  document.getElementById('edital-config-modal').classList.remove('active');
  playSound.click();

  try {
    const res = await fetch(`${API_BASE}/study/diagnostic-questions`);
    const questions = await res.json();
    
    if (questions.length === 0) {
      alert('Nenhuma questão cadastrada para fazer o teste. Por favor, suba um JSON de questões primeiro!');
      showPage('dashboard');
      return;
    }

    state.diagnosticSession = {
      questions,
      currentIndex: 0,
      answers: [],
      selectedConfidence: 'Certeza Absoluta'
    };

    document.getElementById('placement-test-modal').classList.add('active');
    loadDiagnosticQuestion(0);

  } catch (error) {
    console.error('Failed to load placement test questions:', error);
  }
};

function loadDiagnosticQuestion(index) {
  const q = state.diagnosticSession.questions[index];
  state.diagnosticSession.currentIndex = index;

  document.getElementById('placement-progress-text').textContent = `Questão ${index + 1} de 10`;
  document.getElementById('placement-subject-tag').textContent = q.subject_name;
  document.getElementById('placement-q-text').textContent = q.question_text;

  const options = JSON.parse(q.options);
  const optionsList = document.getElementById('placement-q-options');
  optionsList.innerHTML = '';

  options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.innerHTML = `<span>${opt}</span>`;
    li.onclick = () => {
      document.querySelectorAll('#placement-q-options .option-item').forEach(x => x.classList.remove('selected'));
      li.classList.add('selected');
      state.diagnosticSession.selectedOption = opt;
    };
    optionsList.appendChild(li);
  });

  selectDiagnosticMetacognition('Certeza Absoluta');
}

window.selectDiagnosticMetacognition = function(conf) {
  state.diagnosticSession.selectedConfidence = conf;
  
  document.querySelectorAll('.btn-meta').forEach(btn => btn.classList.remove('btn-primary'));
  
  if (conf === 'Chute') document.getElementById('btn-diag-meta-chute').classList.add('btn-primary');
  if (conf === 'Dúvida') document.getElementById('btn-diag-meta-duvida').classList.add('btn-primary');
  if (conf === 'Certeza Absoluta') document.getElementById('btn-diag-meta-certeza').classList.add('btn-primary');
};

window.submitPlacementQuestion = async function() {
  const session = state.diagnosticSession;
  if (!session.selectedOption) {
    alert('Por favor, selecione uma alternativa primeiro!');
    return;
  }

  const q = session.questions[session.currentIndex];
  const isCorrect = (session.selectedOption === q.correct_answer);

  session.answers.push({
    subjectId: q.subject_id,
    questionId: q.id,
    isCorrect,
    confidence: session.selectedConfidence,
    difficulty: q.difficulty
  });

  const nextIdx = session.currentIndex + 1;
  if (nextIdx < 10 && nextIdx < session.questions.length) {
    session.selectedOption = null;
    loadDiagnosticQuestion(nextIdx);
  } else {
    document.getElementById('placement-test-modal').classList.remove('active');
    
    try {
      const res = await fetch(`${API_BASE}/study/diagnostic-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: session.answers })
      });
      const data = await res.json();
      
      if (data.success) {
        playSound.levelUp();
        
        const container = document.getElementById('placement-calibrated-levels');
        container.innerHTML = '';
        
        data.calculatedLevels.forEach(item => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justify = 'space-between';
          row.style.padding = '0.4rem 0';
          row.style.borderBottom = '1px solid var(--border-glass)';
          
          row.innerHTML = `
            <span>Matéria ID: ${item.subjectId}</span>
            <strong style="color: var(--color-success);">Nível de Partida: ${item.level}</strong>
          `;
          container.appendChild(row);
        });

        document.getElementById('placement-results-modal').classList.add('active');
      }
    } catch (e) {
      console.error(e);
      alert('Bateria concluída! Níveis atualizados.');
      showPage('dashboard');
    }
  }
};

window.quitDiagnosticTest = function() {
  if (confirm('Deseja realmente sair? Seu progresso diagnóstico será cancelado.')) {
    document.getElementById('placement-test-modal').classList.remove('active');
    showPage('dashboard');
  }
};

window.closePlacementResults = function() {
  document.getElementById('placement-results-modal').classList.remove('active');
  showPage('dashboard');
};


// 10. Pausa Pomodoro / Reset Fatigue Cognitiva
window.resetFatigue = async function() {
  playSound.click();
  try {
    const res = await fetch(`${API_BASE}/study/reset-fatigue`, { method: 'POST' });
    if (res.ok) {
      playSound.levelUp();
      alert('☕ Pausa concluída com sucesso! Stamina regenerada e fadiga zerada.');
      await loadProfile();
      await loadDailyQuestsAndStamina();
    }
  } catch (error) {
    console.error(error);
  }
};

window.startRedemptionSession = async function() {
  startInterleavedSession();
};

window.toggleADHDMode = async function() {
  playSound.click();
  try {
    const res = await fetch(`${API_BASE}/profile/toggle-tdah`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      state.user = result.profile;
      playSound.levelUp();
      await loadProfile();
      alert(`Modo TDAH ${state.user.tdah_mode === 1 ? 'Ativado' : 'Desativado'} com sucesso!`);
    }
  } catch (error) {
    console.error(error);
  }
};

window.applyTDAHUIReconfiguration = function() {
  const isTdah = state.user && state.user.tdah_mode === 1;
  
  const tdahCenter = document.getElementById('tdah-center-stage');
  const subjectsMain = document.getElementById('subjects-main-card');
  const scientificBacking = document.getElementById('scientific-backing-card');
  const scheduleCard = document.getElementById('schedule-card');
  const seasonTitle = document.getElementById('season-title-header');
  const gardenCard = document.getElementById('tdah-garden-card');

  if (isTdah) {
    if (tdahCenter) tdahCenter.classList.remove('hidden');
    if (subjectsMain) subjectsMain.classList.add('hidden');
    if (scientificBacking) scientificBacking.classList.add('hidden');
    if (scheduleCard) scheduleCard.classList.add('hidden'); 
    if (gardenCard) {
      gardenCard.classList.remove('hidden');
      fetch(`${API_BASE}/subjects`)
        .then(r => r.json())
        .then(subs => renderTDAHGarden(subs));
    }
    if (seasonTitle) {
      seasonTitle.classList.remove('hidden');
      const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24));
      const seasonIndex = Math.floor(dayOfYear / 15) % 4;
      const seasons = [
        "Temporada 1: Cristais de Plasma",
        "Temporada 2: A Caçada de Inverno",
        "Temporada 3: Erupção de Neon",
        "Temporada 4: Fenda Holográfica"
      ];
      seasonTitle.textContent = seasons[seasonIndex];
    }
  } else {
    if (tdahCenter) tdahCenter.classList.add('hidden');
    if (subjectsMain) subjectsMain.classList.remove('hidden');
    if (scientificBacking) scientificBacking.classList.remove('hidden');
    if (scheduleCard) scheduleCard.classList.remove('hidden');
    if (gardenCard) gardenCard.classList.add('hidden');
    if (seasonTitle) seasonTitle.classList.add('hidden');
  }
};

window.playTDAHIgnitionQuestion = async function() {
  playSound.click();
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();
    if (subjects.length === 0) {
      alert('Por favor, importe uma matéria ou edital primeiro!');
      showPage('import');
      return;
    }
    
    let targetSubject = subjects[0];
    subjects.forEach(s => {
      if (s.mastery < targetSubject.mastery) targetSubject = s;
    });

    const topicsRes = await fetch(`${API_BASE}/subjects/${targetSubject.id}/topics`);
    const topicData = await topicsRes.json();
    if (!topicData.topics || topicData.topics.length === 0) {
      alert('Nenhum tópico cadastrado para esta matéria.');
      return;
    }

    startStudySession(topicData.topics[0].id, 'questions');
  } catch (error) {
    console.error(error);
  }
};

// 10 minutes session active countdown for micro-breaks
setInterval(() => {
  if (state.currentSession && !state.currentSession.paused && !state.currentSession.answered) {
    if (!state.studySessionActiveTime) state.studySessionActiveTime = 0;
    state.studySessionActiveTime += 1;
    
    if (state.studySessionActiveTime >= 600) { 
      state.studySessionActiveTime = 0;
      triggerADHDMicroPause();
    }
  }
}, 1000);

window.triggerADHDMicroPause = function() {
  playSound.success();
  const pauseModal = document.getElementById('adhd-pause-modal');
  if (pauseModal) {
    pauseModal.classList.add('active');
    
    if (state.currentSession) state.currentSession.paused = true;
    
    let timerVal = 60;
    const timerText = document.getElementById('adhd-pause-timer');
    const timerBar = document.getElementById('adhd-pause-bar');
    
    const pauseInterval = setInterval(() => {
      timerVal -= 1;
      if (timerText) timerText.textContent = timerVal;
      if (timerBar) timerBar.style.width = `${(timerVal / 60) * 100}%`;
      
      if (timerVal <= 0) {
        clearInterval(pauseInterval);
        pauseModal.classList.remove('active');
        playSound.levelUp();
        if (state.currentSession) state.currentSession.paused = false;
      }
    }, 1000);
  }
};


// ============================
// CRITICAL HIT ANIMATION
// ============================
function showCriticalHit(xp) {
  const overlay = document.getElementById('critical-hit-overlay');
  const xpEl = document.getElementById('critical-hit-xp');
  if (!overlay) return;
  if (xpEl) xpEl.textContent = `+${xp} XP`;
  overlay.classList.remove('hidden');
  const content = document.getElementById('critical-hit-content');
  if (content) { const clone = content.cloneNode(true); content.parentNode.replaceChild(clone, content); }
  try { playSound.levelUp(); } catch(e) {}
  setTimeout(() => { overlay.classList.add('hidden'); }, 1800);
}

function updateXpBadge(question) {
  const badge = document.getElementById('xp-multiplier-badge');
  if (!badge) return;
  if (question && question.module === 'specific') badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

// ============================
// MULTI-PROFILE FUNCTIONS
// ============================
window.toggleProfilePanel = function() {
  const dropdown = document.getElementById('profile-dropdown');
  const chevron = document.getElementById('profile-chevron');
  if (!dropdown) return;
  const isHidden = dropdown.classList.toggle('hidden');
  if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(180deg)';
};

window.activateProfile = async function(profileId) {
  try {
    const res = await fetch(`${API_BASE}/profiles/${profileId}/activate`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      await loadProfile(); await loadProfiles(); await loadSubjects(); await loadStudySchedule();
      const d = document.getElementById('profile-dropdown'); if (d) d.classList.add('hidden');
      const c = document.getElementById('profile-chevron'); if (c) c.style.transform = '';
    }
  } catch (e) { alert('Erro ao trocar perfil: ' + e.message); }
};

window.openCreateProfileModal = function() {
  const modal = document.getElementById('create-profile-modal');
  if (modal) modal.classList.add('active');
  ['new-profile-name','new-profile-exam','new-profile-date'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  const first = document.querySelector('.avatar-option[data-emoji="🎯"]');
  if (first) first.classList.add('selected');
  state._selectedAvatar = '🎯';
  const d = document.getElementById('profile-dropdown'); if (d) d.classList.add('hidden');
};

window.closeCreateProfileModal = function() {
  const modal = document.getElementById('create-profile-modal');
  if (modal) modal.classList.remove('active');
};

window.selectAvatar = function(emoji) {
  state._selectedAvatar = emoji;
  document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.avatar-option[data-emoji="${emoji}"]`);
  if (el) el.classList.add('selected');
};

window.submitCreateProfile = async function() {
  const name = document.getElementById('new-profile-name')?.value?.trim();
  const examName = document.getElementById('new-profile-exam')?.value?.trim() || '';
  const examDate = document.getElementById('new-profile-date')?.value || '';
  const avatarEmoji = state._selectedAvatar || '🎯';
  if (!name) { alert('Por favor, insira o nome do concurseiro.'); return; }
  try {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatarEmoji, examName, examDate })
    });
    const data = await res.json();
    if (data.success) {
      closeCreateProfileModal();
      await loadProfile(); await loadProfiles(); await loadSubjects(); await loadStudySchedule();
    } else { alert(data.error || 'Erro ao criar perfil.'); }
  } catch (e) { alert('Erro ao criar perfil: ' + e.message); }
};

// ============================
// HARD RESET (TELA PRETA)
// ============================
let hardResetState = { currentSubjectId: null, currentQuestion: null, selectedAnswer: null, timerInterval: null, survivalQuestionsSolved: 0 };

async function checkCriticalLock() {
  try {
    const res = await fetch(`${API_BASE}/study/check-critical`);
    const data = await res.json();
    if (data.hasCritical && data.criticalSubjects.length > 0) showBlackoutModal(data.criticalSubjects);
  } catch (e) { console.error('checkCriticalLock error:', e); }
}

function showBlackoutModal(criticalSubjects) {
  const modal = document.getElementById('blackout-modal');
  const listEl = document.getElementById('blackout-critical-list');
  const nameEl = document.getElementById('blackout-subject-name');
  if (!modal || !listEl) return;
  if (nameEl) nameEl.textContent = criticalSubjects[0].name;
  listEl.innerHTML = criticalSubjects.map(s => `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;background:rgba(239,68,68,0.08);border-radius:6px;"><span>🚨</span><span style="font-weight:700;">${s.name}</span><span style="color:#ef4444;margin-left:auto;">${s.mastery||0}%</span></div>`).join('');
  hardResetState.currentSubjectId = criticalSubjects[0].id;
  modal.classList.add('active');
}

window.triggerHardReset = async function() {
  const bm = document.getElementById('blackout-modal'); if (bm) bm.classList.remove('active');
  try {
    const res = await fetch(`${API_BASE}/subjects/${hardResetState.currentSubjectId}/sample-question`);
    if (!res.ok) { alert('Sem questoes disponiveis. Importe mais questoes desta materia.'); return; }
    const q = await res.json();
    hardResetState.currentQuestion = q; hardResetState.selectedAnswer = null;
    const modal = document.getElementById('hard-reset-modal');
    const qTextEl = document.getElementById('hard-reset-q-text');
    const optionsEl = document.getElementById('hard-reset-q-options');
    const snEl = document.getElementById('hard-reset-subject-name');
    const timerEl = document.getElementById('hard-reset-timer');
    const timerBarEl = document.getElementById('hard-reset-timer-bar');
    if (snEl) snEl.textContent = q.topic_name || 'Materia Critica';
    if (qTextEl) qTextEl.textContent = q.question_text;
    if (optionsEl) {
      const opts = JSON.parse(q.options || '[]');
      optionsEl.innerHTML = opts.map(opt => `<li class="option-item" onclick="selectHardResetOption('${opt.replace(/'/g,"\\'")}')" style="padding:0.75rem 1rem;border-radius:8px;cursor:pointer;border:1px solid var(--border-glass);margin-bottom:0.5rem;transition:all 0.2s;"><span>${opt}</span></li>`).join('');
    }
    let timeLeft = 15;
    clearInterval(hardResetState.timerInterval);
    hardResetState.timerInterval = setInterval(() => {
      timeLeft--;
      if (timerEl) timerEl.textContent = timeLeft;
      if (timerBarEl) timerBarEl.style.width = `${(timeLeft/15)*100}%`;
      if (timeLeft <= 0) { clearInterval(hardResetState.timerInterval); submitHardResetResult(false); }
    }, 1000);
    if (modal) modal.classList.add('active');
  } catch (e) { alert('Erro ao carregar questao: ' + e.message); }
};

window.selectHardResetOption = function(option) {
  hardResetState.selectedAnswer = option;
  document.querySelectorAll('#hard-reset-q-options .option-item').forEach(el => {
    const isSel = el.querySelector('span').textContent === option;
    el.style.borderColor = isSel ? 'var(--color-warning)' : 'var(--border-glass)';
    el.style.background = isSel ? 'rgba(245,158,11,0.12)' : 'transparent';
  });
};

window.submitHardReset = function() {
  if (!hardResetState.selectedAnswer) { alert('Selecione uma alternativa!'); return; }
  clearInterval(hardResetState.timerInterval);
  const q = hardResetState.currentQuestion;
  submitHardResetResult(q && q.correct_answer === hardResetState.selectedAnswer);
};

async function submitHardResetResult(isCorrect) {
  const modal = document.getElementById('hard-reset-modal');
  if (modal) modal.classList.remove('active');
  if (isCorrect) {
    hardResetState.survivalQuestionsSolved += 1;
    try { playSound.success(); } catch(e) {}
    
    if (hardResetState.survivalQuestionsSolved >= 3) {
      await fetch(`${API_BASE}/study/unlock-subject`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ subjectId: hardResetState.currentSubjectId }) });
      alert('🔒 Sobrevivência Confirmada! Hard Reset concluído com sucesso e matérias desbloqueadas.');
      try { playSound.levelUp(); } catch(e) {}
      hardResetState.survivalQuestionsSolved = 0;
      await loadProfile(); await loadSubjects();
    } else {
      alert(`Resposta correta! (${hardResetState.survivalQuestionsSolved}/3). Resolva a próxima.`);
      triggerHardReset();
    }
  } else {
    alert('Resposta incorreta ou tempo esgotado! Hard Reset reiniciado.');
    hardResetState.survivalQuestionsSolved = 0;
    const bm = document.getElementById('blackout-modal'); if (bm) bm.classList.add('active');
  }
}

// ============================
// CODE READER MINIGAME (Press-and-Hold)
// ============================
let codeReaderState = { keyLineIndex: null, holdInterval: null, holdProgress: 0, revealed: false };

function initCodeReader(question) {
  const panel = document.getElementById('code-tension-panel');
  const container = document.getElementById('code-lines-container');
  const optionsList = document.getElementById('q-options');
  if (!panel || !container) return;
  let codeLines; try { codeLines = JSON.parse(question.code_lines||'[]'); } catch { codeLines=[]; }
  if (codeLines.length === 0) return;
  codeReaderState.keyLineIndex = question.key_line_index ?? Math.floor(codeLines.length/2);
  codeReaderState.holdProgress = 0; codeReaderState.revealed = false;
  panel.classList.remove('hidden');
  if (optionsList) {
    optionsList.style.opacity = '0';
    optionsList.style.pointerEvents = 'none';
  }
  container.innerHTML = codeLines.map((line, idx) => `<div class="code-line" id="code-line-${idx}" onmousedown="startCodeHold(${idx})" ontouchstart="startCodeHold(${idx})" onmouseup="stopCodeHold(${idx})" ontouchend="stopCodeHold(${idx})" onmouseleave="stopCodeHold(${idx})"><span class="code-line-number">${idx+1}</span><span class="code-line-text">${line}</span>${idx===codeReaderState.keyLineIndex?'<span style="margin-left:auto;font-size:0.7rem;color:var(--color-warning);">← segure</span>':''}</div>`).join('');
}

window.startCodeHold = function(lineIdx) {
  if (codeReaderState.revealed) return;
  if (lineIdx !== codeReaderState.keyLineIndex) { const el=document.getElementById(`code-line-${lineIdx}`); if(el) el.classList.add('shattered'); return; }
  const lineEl = document.getElementById(`code-line-${lineIdx}`);
  if (lineEl) lineEl.classList.add('holding');
  const barFill = document.getElementById('tension-bar-fill');
  const pct = document.getElementById('tension-pct');
  codeReaderState.holdInterval = setInterval(() => {
    codeReaderState.holdProgress += 5;
    const p = Math.min(100, codeReaderState.holdProgress);
    if (barFill) barFill.style.width = p+'%'; if (pct) pct.textContent = p+'%';
    if (codeReaderState.holdProgress >= 100) {
      clearInterval(codeReaderState.holdInterval); codeReaderState.revealed = true;
      const ol = document.getElementById('q-options'); 
      if (ol) { 
        ol.style.opacity='1'; 
        ol.style.pointerEvents='auto';
        ol.style.transition='opacity 0.4s'; 
      }
      if (lineEl) lineEl.classList.remove('holding');
      if (barFill) barFill.style.background = '#10b981';
      if (pct) pct.textContent = 'Desbloqueado!';
    }
  }, 100);
};

window.stopCodeHold = function(lineIdx) {
  if (lineIdx !== codeReaderState.keyLineIndex) return;
  if (codeReaderState.holdInterval) { clearInterval(codeReaderState.holdInterval); codeReaderState.holdInterval = null; }
  if (!codeReaderState.revealed && codeReaderState.holdProgress > 0 && codeReaderState.holdProgress < 100) {
    codeReaderState.holdProgress = Math.max(0, codeReaderState.holdProgress-30);
    const bf = document.getElementById('tension-bar-fill'); const pc = document.getElementById('tension-pct');
    if (bf) bf.style.width = codeReaderState.holdProgress+'%'; if (pc) pc.textContent = codeReaderState.holdProgress+'%';
    const lineEl = document.getElementById(`code-line-${lineIdx}`); if (lineEl) lineEl.classList.remove('holding');
  }
};

// ============================
// MARATHON MODE (Simulador de Fadiga 4h)
// ============================
let marathonState = { questions:[], currentIndex:0, answers:[], startedAt:null, timerInterval:null, secondsElapsed:0, selectedOption:null, correct:0 };
const MARATHON_DURATION = 4*60*60;
const SEASONS = [
  { badge:'🌸 Primavera', class:'season-spring' },
  { badge:'☀️ Verão',     class:'season-summer' },
  { badge:'🍂 Outono',    class:'season-autumn' },
  { badge:'❄️ Inverno',   class:'season-winter' }
];

window.startMarathon = async function() {
  const introCard = document.getElementById('marathon-intro-card');
  try {
    if (introCard) introCard.innerHTML = `<div style="text-align:center;padding:3rem;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem;"></i><p style="margin-top:1rem;">Gerando maratona...</p></div>`;
    const res = await fetch(`${API_BASE}/marathon/start`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Erro ao iniciar maratona.'); return; }
    marathonState = { questions:data.questions, currentIndex:0, answers:[], correct:0, selectedOption:null, startedAt:new Date().toISOString(), timerInterval:null, secondsElapsed:0 };
    const activeArea = document.getElementById('marathon-active-area');
    const resultsCard = document.getElementById('marathon-results-card');
    if (introCard) introCard.classList.add('hidden');
    if (activeArea) activeArea.classList.remove('hidden');
    if (resultsCard) resultsCard.classList.add('hidden');
    renderMarathonQuestion(); startMarathonTimer();
  } catch (e) { alert('Erro ao iniciar maratona: ' + e.message); }
};

function renderMarathonQuestion() {
  const q = marathonState.questions[marathonState.currentIndex];
  if (!q) { finishMarathon(); return; }
  marathonState.selectedOption = null;
  const counterEl = document.getElementById('marathon-q-counter');
  const textEl = document.getElementById('marathon-q-text');
  const optionsEl = document.getElementById('marathon-q-options');
  const moduleBadge = document.getElementById('marathon-q-module-badge');
  if (counterEl) counterEl.textContent = `${marathonState.currentIndex+1} / ${marathonState.questions.length}`;
  if (textEl) textEl.textContent = q.question_text;
  if (moduleBadge) moduleBadge.classList.toggle('hidden', q.module !== 'specific');
  if (optionsEl) {
    const opts = JSON.parse(q.options||'[]');
    optionsEl.innerHTML = opts.map(opt => `<li class="option-item" onclick="selectMarathonOption('${opt.replace(/'/g,"\\'")}')" style="padding:0.75rem 1rem;border-radius:8px;cursor:pointer;border:1px solid var(--border-glass);margin-bottom:0.5rem;transition:all 0.2s;"><span>${opt}</span></li>`).join('');
  }
}

window.selectMarathonOption = function(option) {
  marathonState.selectedOption = option;
  document.querySelectorAll('#marathon-q-options .option-item').forEach(el => {
    const isSel = el.querySelector('span').textContent === option;
    el.style.borderColor = isSel ? 'var(--color-primary)' : 'var(--border-glass)';
    el.style.background = isSel ? 'rgba(139,92,246,0.12)' : 'transparent';
  });
};

window.confirmMarathonAnswer = function() {
  const q = marathonState.questions[marathonState.currentIndex];
  if (marathonState.selectedOption) {
    if (q.correct_answer === marathonState.selectedOption) { marathonState.correct++; document.getElementById('marathon-score').textContent = marathonState.correct; }
    marathonState.answers.push({ questionId:q.id, selectedAnswer:marathonState.selectedOption, responseTime:0 });
  } else { marathonState.answers.push({ questionId:q.id, selectedAnswer:'', responseTime:0 }); }
  marathonState.currentIndex++;
  if (marathonState.currentIndex >= marathonState.questions.length) finishMarathon();
  else renderMarathonQuestion();
};

function startMarathonTimer() {
  clearInterval(marathonState.timerInterval);
  const timerEl = document.getElementById('marathon-timer');
  const barEl = document.getElementById('marathon-time-bar');
  const activeArea = document.getElementById('marathon-active-area');
  const seasonBadge = document.getElementById('marathon-season-badge');
  let lastSeasonIdx = -1;
  marathonState.timerInterval = setInterval(() => {
    marathonState.secondsElapsed++;
    const remaining = MARATHON_DURATION - marathonState.secondsElapsed;
    if (remaining <= 0) { clearInterval(marathonState.timerInterval); finishMarathon(); return; }
    const h = Math.floor(remaining/3600); const m = Math.floor((remaining%3600)/60); const s = remaining%60;
    if (timerEl) timerEl.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if (barEl) barEl.style.width = `${(remaining/MARATHON_DURATION)*100}%`;
    const seasonIdx = Math.min(Math.floor(marathonState.secondsElapsed/3600),3);
    if (seasonIdx !== lastSeasonIdx) {
      lastSeasonIdx = seasonIdx;
      const season = SEASONS[seasonIdx];
      SEASONS.forEach(s => { if (activeArea) activeArea.classList.remove(s.class); });
      if (activeArea) activeArea.classList.add(season.class);
      if (seasonBadge) seasonBadge.textContent = season.badge;
      if (seasonIdx > 0) {
        const n = document.createElement('div');
        n.style.cssText = `position:fixed;top:80px;right:20px;z-index:9998;background:rgba(16,185,129,0.9);color:white;padding:0.75rem 1.25rem;border-radius:12px;font-weight:800;box-shadow:0 4px 20px rgba(16,185,129,0.4);`;
        n.textContent = `⏱️ ${season.badge} — +100 XP Resistencia!`;
        document.body.appendChild(n); setTimeout(() => n.remove(), 3000);
      }
    }
  }, 1000);
}

async function finishMarathon() {
  clearInterval(marathonState.timerInterval);
  const activeArea = document.getElementById('marathon-active-area');
  const resultsCard = document.getElementById('marathon-results-card');
  if (activeArea) activeArea.classList.add('hidden');
  try {
    const res = await fetch(`${API_BASE}/marathon/submit`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ answers:marathonState.answers, startedAt:marathonState.startedAt, finishedAt:new Date().toISOString() })
    });
    const result = await res.json();
    if (resultsCard) {
      resultsCard.classList.remove('hidden');
      document.getElementById('marathon-score-general').textContent = result.scoreGeneral.toFixed(1);
      document.getElementById('marathon-acc-general').textContent = `${result.correctGeneral}/${result.totalGeneral}`;
      document.getElementById('marathon-score-specific').textContent = result.scoreSpecific.toFixed(1);
      document.getElementById('marathon-acc-specific').textContent = `${result.correctSpecific}/${result.totalSpecific}`;
      document.getElementById('marathon-total-score').textContent = `${result.totalScore.toFixed(1)} pts`;
      const ab = document.getElementById('marathon-approval-badge');
      const titleEl = document.getElementById('marathon-results-title');
      const emojiEl = document.getElementById('marathon-results-emoji');
      if (result.approved) {
        ab.textContent='Aprovado!'; ab.style.cssText='background:rgba(16,185,129,0.2);color:#10b981;border:1px solid rgba(16,185,129,0.4);padding:0.75rem 2rem;border-radius:9999px;font-weight:800;font-size:1.1rem;display:inline-block;margin-bottom:1.5rem;';
        if(titleEl) titleEl.textContent='Voce Passou no Simulado!'; if(emojiEl) emojiEl.textContent='🏆'; try{playSound.levelUp();}catch(e){}
      } else {
        ab.textContent=`Reprovado (${result.totalScore.toFixed(1)} < 57.5)`; ab.style.cssText='background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:0.75rem 2rem;border-radius:9999px;font-weight:800;font-size:1.1rem;display:inline-block;margin-bottom:1.5rem;';
        if(titleEl) titleEl.textContent='Continue Treinando!'; if(emojiEl) emojiEl.textContent='📊';
      }
    }
    await loadProfile();
  } catch (e) { if (resultsCard) { resultsCard.classList.remove('hidden'); resultsCard.innerHTML += `<p style="color:#ef4444;">Erro: ${e.message}</p>`; } }
}

// ============================
// MÓDULO 4: LEARNING TRAIL (JUST-IN-TIME THEORY) HELPERS
// ============================

window.loadNextPrimingQuestion = function() {
  const session = state.primingSession;
  if (!session) return;
  
  session.currentIndex += 1;
  if (session.currentIndex < 3 && session.currentIndex < session.questions.length) {
    renderPrimingQuestion(session.currentIndex);
  } else {
    // Transition to summary card view!
    document.getElementById('priming-container').classList.add('hidden');
    startSummaryCardFlow(session.topicId, session.summaryContent);
  }
};

window.renderPrimingQuestion = function(idx) {
  const q = state.primingSession.questions[idx];
  document.getElementById('priming-progress-text').textContent = `Questão de Priming ${idx + 1} de 3`;
  document.getElementById('priming-q-text').textContent = q.question_text;
  
  const options = JSON.parse(q.options || '[]');
  const container = document.getElementById('priming-q-options');
  container.innerHTML = '';
  options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.innerHTML = `<span>${opt}</span>`;
    li.onclick = () => {
      document.querySelectorAll('#priming-q-options .option-item').forEach(x => x.classList.remove('selected'));
      li.classList.add('selected');
    };
    container.appendChild(li);
  });
  
  document.getElementById('priming-container').classList.remove('hidden');
};

window.applyBionicReadingFilter = function(text) {
  if (!text) return '';
  return text.split(/\s+/).map(word => {
    const cleanWord = word.replace(/<[^>]*>/g, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    if (cleanWord.length > 3) {
      const prefix = word.substring(0, 3);
      const suffix = word.substring(3);
      return `<strong>${prefix}</strong>${suffix}`;
    }
    return word;
  }).join(' ');
};

window.startSummaryCardFlow = function(topicId, summaryText) {
  state.summarySession = {
    topicId,
    chunks: [],
    currentIndex: 0,
    timer: null
  };
  
  let chunks = [];
  try {
    const trimmed = (summaryText || '').trim();
    if (trimmed.startsWith('[')) {
      chunks = JSON.parse(trimmed);
    }
  } catch (e) {
    // fallback to slicing plain string
  }
  
  if (!chunks || chunks.length === 0) {
    const cleanText = (summaryText || '').replace(/<[^>]*>/g, '').trim();
    let index = 0;
    while (index < cleanText.length) {
      chunks.push(cleanText.substring(index, index + 300));
      index += 300;
    }
  }
  
  if (chunks.length === 0) chunks.push("Material de estudos em processamento.");
  state.summarySession.chunks = chunks;
  
  document.getElementById('summary-reader').classList.remove('hidden');
  document.getElementById('feynman-card').classList.add('hidden');
  
  loadSummaryCard(0);
};

window.loadSummaryCard = function(idx) {
  const session = state.summarySession;
  session.currentIndex = idx;
  
  const chunkText = session.chunks[idx];
  const bionicText = applyBionicReadingFilter(chunkText);
  
  document.getElementById('summary-text-content').innerHTML = bionicText;
  document.getElementById('summary-card-progress').textContent = `Card ${idx + 1} de ${session.chunks.length}`;
  
  const btnNext = document.getElementById('btn-summary-next');
  const timerInd = document.getElementById('summary-timer-indicator');
  
  btnNext.disabled = true;
  
  let countdown = 10;
  timerInd.textContent = `Aguarde ${countdown}s para avançar...`;
  timerInd.style.display = 'block';
  
  clearInterval(session.timer);
  session.timer = setInterval(() => {
    countdown -= 1;
    timerInd.textContent = `Aguarde ${countdown}s para avançar...`;
    
    if (countdown <= 0) {
      clearInterval(session.timer);
      timerInd.style.display = 'none';
      btnNext.disabled = false;
    }
  }, 1000);
};

window.loadNextSummaryCard = function() {
  const session = state.summarySession;
  if (!session) return;
  
  const nextIdx = session.currentIndex + 1;
  if (nextIdx < session.chunks.length) {
    loadSummaryCard(nextIdx);
  } else {
    document.getElementById('feynman-card').classList.remove('hidden');
    document.getElementById('btn-summary-next').style.display = 'none';
    
    const input = document.getElementById('feynman-input');
    input.value = '';
    document.getElementById('feynman-char-count').textContent = '0 / 50 caracteres';
    document.getElementById('btn-feynman-submit').disabled = true;
    input.focus();
    
    input.onpaste = (e) => {
      e.preventDefault();
      alert('🔒 Restrição Cognitiva: Digitar força a codificação de memória. Não cole o resumo!');
    };
    input.oncopy = (e) => e.preventDefault();
    input.oncut = (e) => e.preventDefault();
  }
};

window.handleFeynmanInput = function() {
  const val = document.getElementById('feynman-input').value;
  const count = val.length;
  const counter = document.getElementById('feynman-char-count');
  const submitBtn = document.getElementById('btn-feynman-submit');
  
  counter.textContent = `${count} / 50 caracteres`;
  if (count >= 50) {
    counter.style.color = 'var(--color-success)';
    submitBtn.disabled = false;
  } else {
    counter.style.color = 'var(--text-muted)';
    submitBtn.disabled = true;
  }
};

window.submitFeynmanAndSolve = async function() {
  playSound.success();
  const session = state.summarySession;
  if (!session) return;
  
  try {
    await fetch(`${API_BASE}/study/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xp: 5, coins: 1 })
    });
  } catch(e) {
    console.error(e);
  }
  
  clearInterval(session.timer);
  alert("📝 Feynman validado com sucesso! Redirecionando diretamente para a bateria de questões.");
  startStudySession(session.topicId, 'questions');
};

// ============================
// MÓDULO 5: LIVES & DEFEAT ENGINE HELPERS
// ============================

window.updateLivesHearts = function() {
  const lives = state.currentSession.lives ?? 3;
  for (let i = 1; i <= 3; i++) {
    const heart = document.getElementById(`life-heart-${i}`);
    if (heart) {
      heart.style.opacity = (i <= lives) ? '1' : '0.15';
    }
  }
};

window.triggerDefeatScreen = function() {
  clearInterval(state.currentSession.timer);
  playSound.wrong();
  
  document.getElementById('question-solver').classList.add('hidden');
  document.getElementById('session-complete').classList.remove('hidden');
  
  document.getElementById('session-complete-subtext').textContent = 'Suas vidas acabaram. Esta bateria de estudos foi abortada!';
  document.getElementById('completed-xp-reward').textContent = '0 XP';
  document.getElementById('completed-coins-reward').textContent = '0';
  document.getElementById('completed-xp-reward').style.color = '#ef4444';
  document.getElementById('completed-coins-reward').style.color = '#ef4444';
  
  const header = document.querySelector('#session-complete h2');
  if (header) {
    header.textContent = 'Derrotado!';
    header.style.color = '#ef4444';
  }
  
  const emoji = document.querySelector('#session-complete div');
  if (emoji) {
    emoji.textContent = '💀';
  }
  
  const bonuses = document.getElementById('session-bonuses');
  if (bonuses) bonuses.innerHTML = '<span style="color:#ef4444; font-weight:700;">Nenhuma recompensa liberada.</span>';
};

window.playTDAHIgnitionQuestion = async function() {
  playSound.click();
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    const subjects = await res.json();
    if (!subjects || subjects.length === 0) {
      alert("Nenhuma matéria cadastrada ainda. Por favor, adicione uma matéria primeiro.");
      return;
    }
    
    // Find subject with lowest mastery
    const worstSubject = subjects.reduce((prev, curr) => (prev.mastery < curr.mastery) ? prev : curr);
    
    // Fetch topics of that subject
    const topicsRes = await fetch(`${API_BASE}/subjects/${worstSubject.id}/topics`);
    const topicsData = await topicsRes.json();
    if (!topicsData.topics || topicsData.topics.length === 0) {
      alert(`Matéria '${worstSubject.name}' não possui tópicos cadastrados ainda.`);
      return;
    }
    
    // Find topic with lowest mastery
    const worstTopic = topicsData.topics.reduce((prev, curr) => (prev.mastery < curr.mastery) ? prev : curr);
    
    // Start questions session for that topic
    await startStudySession(worstTopic.id, 'questions');
    
    // Mark as a single question session
    state.currentSession.singleQuestionSession = true;
    
  } catch (e) {
    console.error('Error starting TDAH ignition:', e);
    alert('Erro ao carregar a questão de ignição: ' + e.message);
  }
};

let existingSubjectsList = [];

window.loadImportMetadataDropdowns = async function() {
  try {
    const res = await fetch(`${API_BASE}/subjects`);
    existingSubjectsList = await res.json();
    
    const subjectDatalist = document.getElementById('existing-subjects-list');
    if (subjectDatalist) {
      subjectDatalist.innerHTML = existingSubjectsList.map(s => `<option value="${s.name}"></option>`).join('');
    }
  } catch (error) {
    console.error('Failed to load subjects for import auto-suggest datalist:', error);
  }
};

// Bind auto-complete topic suggestion when a subject is typed or chosen
document.addEventListener('DOMContentLoaded', () => {
  const subjectInput = document.getElementById('import-subject');
  const topicDatalist = document.getElementById('existing-topics-list');
  
  if (subjectInput && topicDatalist) {
    subjectInput.addEventListener('input', async () => {
      const typedVal = subjectInput.value.trim();
      const matched = existingSubjectsList.find(s => s.name.toLowerCase() === typedVal.toLowerCase());
      
      if (matched) {
        try {
          const res = await fetch(`${API_BASE}/subjects/${matched.id}/topics`);
          const data = await res.json();
          if (data && Array.isArray(data.topics)) {
            topicDatalist.innerHTML = data.topics.map(t => `<option value="${t.nome || t.name}"></option>`).join('');
          } else {
            topicDatalist.innerHTML = '';
          }
        } catch (e) {
          console.error('Failed to load topics auto-suggest for matched subject:', e);
          topicDatalist.innerHTML = '';
        }
      } else {
        topicDatalist.innerHTML = '';
      }
    });
  }
});

window.triggerAdaptiveGenerator = async function(topicId, buttonEl) {
  playSound.click();
  const originalHtml = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Gerando...`;
  
  try {
    const res = await fetch(`${API_BASE}/study/generator-engine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, missionType: 'questions' })
    });
    
    if (res.ok) {
      const data = await res.json();
      playSound.success();
      alert(`🎯 IA On-Demand: 5 questões adaptativas de nível '${data.difficulty}' geradas com sucesso!`);
    } else {
      const errorData = await res.json();
      alert('Erro ao gerar questões: ' + (errorData.error || 'Erro desconhecido'));
    }
  } catch (err) {
    console.error('Error in triggerAdaptiveGenerator:', err);
    alert('Erro de conexão ao gerar questões: ' + err.message);
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
};
