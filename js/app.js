/* =========================================================
   تحدي الأذكياء — منطق اللعبة
   الجزء الأول: الأساس، الأدوات، الصوت، الخلفية، التنقل
   ========================================================= */

(function () {
  "use strict";

  const DATA = window.AZKIYA_DATA;
  if (!DATA || !Array.isArray(DATA.stages) || !Array.isArray(DATA.questions)) {
    console.error("لم يتم تحميل بيانات تحدي الأذكياء.");
    return;
  }

  /* =========================================================
     ١ — الثوابت
     ========================================================= */
  const STAGES = DATA.stages;
  const STAGE_BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));
  const DEFAULTS = DATA.questions;

  const TYPE_LABELS = {
    mcq: "اختيار من متعدد",
    truefalse: "صح أو خطأ",
    spot: "اكتشف الخطأ",
    picture: "خمّن الصورة",
    words: "رتّب الكلمات",
    riddle: "لغز ذكي",
    speed: "سؤال سرعة"
  };
  const VALID_TYPES = Object.keys(TYPE_LABELS);
  const OPTION_KEYS = ["أ", "ب", "ج", "د", "هـ", "و"];
  const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  const KEYS = {
    questions: "azkiya_questions_v1",
    leaderboard: "azkiya_leaderboard_v1",
    best: "azkiya_best_v1",
    name: "azkiya_player_v1",
    sound: "azkiya_sound_v1"
  };

  const CORRECT_MESSAGES = [
    "إجابة ذهبية! ✨",
    "عقلية نجم! 🌟",
    "أحسنت… أنت تشعل المسرح! 🔥",
    "دقيقة كالسهم! 🎯",
    "هذا هو مستوى الأبطال! 👏",
    "برافو! الجواب في الصميم 💥"
  ];

  const WRONG_MESSAGES = [
    "لا بأس… المحترفون يتعلمون من كل محاولة 💪",
    "قريبة! السؤال التالي فرصتك 🚀",
    "الخطأ أول طريق المعرفة 🧠",
    "شدّ حزامك… الجاي أفضل ⚡",
    "لا تستسلم، الأبطال يسقطون ويقومون 🏆"
  ];

  const TIMEOUT_MESSAGES = [
    "انتهى الوقت! لكن المباراة لم تنتهِ ⏳",
    "الوقت أسرع منك هذه المرة… خذ نفسًا وحاول ⚡",
    "انتهت الثواني! فرصتك القادمة على الأبواب ⏳"
  ];

  /* =========================================================
     ٢ — أدوات مساعدة
     ========================================================= */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function el(id) {
    return document.getElementById(id);
  }

  function grab(ids) {
    const out = {};
    ids.forEach((id) => {
      out[id] = document.getElementById(id);
    });
    return out;
  }

  function toAr(value) {
    return String(value).replace(/\d/g, (digit) => AR_DIGITS[Number(digit)]);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/\u0640/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function uid(prefix) {
    return (
      (prefix || "id") +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function formatShortDate(iso) {
    try {
      return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" }).format(
        new Date(iso)
      );
    } catch (error) {
      return "";
    }
  }

  /* =========================================================
     ٣ — التخزين المحلي
     ========================================================= */
  const store = {
    get(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        return false;
      }
    }
  };

  function loadJSON(key, fallback) {
    const raw = store.get(key, null);
    if (raw === null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (error) {
      return fallback;
    }
  }

  function sanitizeQuestion(raw, index) {
    if (!raw || typeof raw !== "object") return null;

    const stage = STAGE_BY_ID.has(raw.stage) ? raw.stage : STAGES[0].id;
    const type = VALID_TYPES.includes(raw.type) ? raw.type : "mcq";
    const prompt = String(raw.prompt || "").trim();
    if (!prompt) return null;

    const question = {
      id: raw.id ? String(raw.id) : "custom-" + Date.now() + "-" + index,
      stage: stage,
      type: type,
      prompt: prompt,
      hint: raw.hint ? String(raw.hint) : "",
      explanation: raw.explanation ? String(raw.explanation) : ""
    };

    const time = Number(raw.time);
    if (Number.isFinite(time) && time >= 5) question.time = clamp(Math.round(time), 5, 120);

    const points = Number(raw.points);
    if (Number.isFinite(points) && points >= 10) {
      question.points = clamp(Math.round(points), 10, 1000);
    }

    if (type === "words") {
      const answer = String(raw.answer || "").trim();
      if (!answer) return null;
      const words = Array.isArray(raw.words)
        ? raw.words.map((word) => String(word).trim()).filter(Boolean)
        : answer.split(/\s+/).filter(Boolean);
      if (words.length < 2) return null;
      question.answer = answer;
      question.words = words;
    } else {
      let options = Array.isArray(raw.options)
        ? raw.options.map((option) => String(option).trim()).filter(Boolean)
        : [];

      if (type === "truefalse") options = ["صح", "خطأ"];
      if (options.length < 2) return null;

      let answer = Number(raw.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) answer = 0;

      question.options = options;
      question.answer = answer;

      if (type === "picture") {
        question.visual = String(raw.visual || "🖼️").trim() || "🖼️";
      }
    }

    return question;
  }

  function loadQuestions() {
    const stored = loadJSON(KEYS.questions, null);
    if (!Array.isArray(stored)) return deepClone(DEFAULTS);
    return stored.map(sanitizeQuestion).filter(Boolean);
  }

  function saveQuestions() {
    const ok = store.set(KEYS.questions, JSON.stringify(state.questions));
    if (!ok) toast("تعذّر حفظ الأسئلة في هذا المتصفح.", "error");
    return ok;
  }

  function loadBoard() {
    const stored = loadJSON(KEYS.leaderboard, []);
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((entry) => entry && typeof entry === "object" && entry.name)
      .map((entry) => ({
        id: String(entry.id || uid("run")),
        name: String(entry.name).slice(0, 30),
        score: clamp(Number(entry.score) || 0, 0, 999999),
        correct: clamp(Number(entry.correct) || 0, 0, 99),
        wrong: clamp(Number(entry.wrong) || 0, 0, 99),
        total: clamp(Number(entry.total) || 0, 0, 99),
        accuracy: clamp(Number(entry.accuracy) || 0, 0, 100),
        bestStreak: clamp(Number(entry.bestStreak) || 0, 0, 99),
        stageId: String(entry.stageId || ""),
        stageName: String(entry.stageName || ""),
        date: String(entry.date || new Date().toISOString())
      }))
      .sort(compareEntries)
      .slice(0, 40);
  }

  function compareEntries(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return String(a.date).localeCompare(String(b.date));
  }

  function saveBoard(list) {
    const clean = list.slice().sort(compareEntries).slice(0, 40);
    store.set(KEYS.leaderboard, JSON.stringify(clean));
    return clean;
  }

  function loadBests() {
    const value = loadJSON(KEYS.best, {});
    return value && typeof value === "object" ? value : {};
  }

  function saveBests(value) {
    store.set(KEYS.best, JSON.stringify(value));
  }

  /* =========================================================
     ٤ — عناصر الواجهة
     ========================================================= */
  const screens = {
    start: el("screen-start"),
    stages: el("screen-stages"),
    quiz: el("screen-quiz"),
    results: el("screen-results"),
    editor: el("screen-editor")
  };

  const ui = grab([
    "brandHome",
    "leaderboardBtn",
    "editorBtn",
    "soundBtn",
    "fullscreenBtn",
    "startForm",
    "playerName",
    "nameError",
    "howBtn",
    "startEditorBtn",
    "miniBoardBtn",
    "miniLeaderboard",
    "stageGrid",
    "stagesBack",
    "stagePlayer",
    "completedCount",
    "completionDots",
    "randomStageBtn",
    "quitBtn",
    "hudStageIcon",
    "hudStageName",
    "scorePill",
    "liveScore",
    "streakPill",
    "liveStreak",
    "qIndex",
    "qTotal",
    "quizProgress",
    "quizProgressFill",
    "timerRing",
    "timerCircle",
    "timerNum",
    "typeBadge",
    "pointsBadge",
    "questionCard",
    "questionKicker",
    "stakes",
    "questionPrompt",
    "visualBox",
    "optionsWrap",
    "wordsWrap",
    "answerBoard",
    "wordBank",
    "clearWords",
    "checkWords",
    "hintBtn",
    "hintText",
    "feedback",
    "feedbackIcon",
    "feedbackTitle",
    "feedbackText",
    "feedbackPoints",
    "keyboardHint",
    "nextBtn",
    "nextBtnText",
    "resultMedal",
    "resultName",
    "resultTitle",
    "resultMessage",
    "resultStars",
    "finalScore",
    "statCorrect",
    "statWrong",
    "statAccuracy",
    "statStreak",
    "resultLeaderboard",
    "reviewList",
    "replayBtn",
    "otherStagesBtn",
    "shareBtn",
    "homeBtn",
    "editorBack",
    "addQuestionBtn",
    "questionSearch",
    "stageFilter",
    "exportBtn",
    "importBtn",
    "resetQuestionsBtn",
    "importFile",
    "editorCount",
    "editorSaved",
    "questionList",
    "leaderboardModal",
    "leaderboardList",
    "clearBoardBtn",
    "howModal",
    "questionModal",
    "questionModalTitle",
    "questionForm",
    "fId",
    "fStage",
    "fType",
    "fPrompt",
    "fVisualField",
    "fVisual",
    "fOptionsField",
    "optionInputs",
    "fOpt0",
    "fOpt1",
    "fOpt2",
    "fOpt3",
    "fAnswer",
    "fWordsField",
    "fWordsAnswer",
    "fWords",
    "fHint",
    "fExplanation",
    "fTime",
    "fPoints",
    "confirmModal",
    "confirmIcon",
    "confirmTitle",
    "confirmText",
    "confirmCancel",
    "confirmOk",
    "roundIntro",
    "introIndex",
    "introIcon",
    "introName",
    "introDesc",
    "toastWrap",
    "announcer",
    "confetti",
    "bgStars"
  ]);

  const body = document.body;

  /* =========================================================
     ٥ — الحالة
     ========================================================= */
  const state = {
    activeScreen: "start",
    player: String(store.get(KEYS.name, "") || "").slice(0, 24),
    questions: [],
    stage: null,
    run: [],
    index: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: 0,
    answered: false,
    selected: null,
    timeLeft: 0,
    deadline: 0,
    timerId: null,
    hintUsed: false,
    records: [],
    lastEntryId: null,
    lastResult: null,
    editingId: null,
    wordsSelected: [],
    wordsLocked: false,
    introToken: 0,
    introTimer: null,
    numberAnimation: null,
    confirmResolver: null,
    isFinishing: false
  };

  state.questions = loadQuestions();

  /* =========================================================
     ٦ — الصوت (مركّب داخل المتصفح بدون ملفات خارجية)
     ========================================================= */
  const Sound = {
    enabled: store.get(KEYS.sound, "on") !== "off",
    ctx: null,

    init() {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        try {
          this.ctx = new AudioContextClass();
        } catch (error) {
          return null;
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },

    tone(freq, endFreq, duration, type, gain, delay) {
      if (!this.enabled) return;
      const ctx = this.init();
      if (!ctx) return;
      const start = ctx.currentTime + (delay || 0);
      const oscillator = ctx.createOscillator();
      const volume = ctx.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(Math.max(20, freq), start);
      if (endFreq) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
      }
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain || 0.05, start + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(volume);
      volume.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    },

    click() {
      this.tone(620, 520, 0.05, "triangle", 0.028);
    },

    hover() {
      this.tone(880, 880, 0.03, "sine", 0.014);
    },

    correct() {
      if (!this.enabled) return;
      this.tone(523.25, 523.25, 0.16, "triangle", 0.055, 0);
      this.tone(659.25, 659.25, 0.16, "triangle", 0.055, 0.1);
      this.tone(783.99, 783.99, 0.18, "triangle", 0.055, 0.2);
      this.tone(1046.5, 1046.5, 0.32, "triangle", 0.06, 0.3);
      this.tone(1318.5, 1318.5, 0.22, "sine", 0.03, 0.34);
    },

    wrong() {
      if (!this.enabled) return;
      this.tone(240, 150, 0.24, "sawtooth", 0.04, 0);
      this.tone(170, 105, 0.34, "triangle", 0.05, 0.12);
      this.tone(320, 220, 0.18, "sine", 0.025, 0.24);
    },

    tick() {
      this.tone(1100, 900, 0.035, "square", 0.018);
    },

    streak() {
      if (!this.enabled) return;
      this.tone(659.25, 659.25, 0.1, "triangle", 0.05, 0);
      this.tone(880, 880, 0.1, "triangle", 0.05, 0.08);
      this.tone(1174.66, 1174.66, 0.2, "triangle", 0.055, 0.16);
    },

    applause() {
      if (!this.enabled) return;
      const ctx = this.init();
      if (!ctx) return;
      const now = ctx.currentTime;
      const length = Math.floor(ctx.sampleRate * 2.1);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const progress = i / length;
        const envelope = Math.sin(Math.PI * Math.min(1, progress * 1.4)) * (1 - progress * 0.5);
        data[i] = (Math.random() * 2 - 1) * envelope * 0.9;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1500;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);

      for (let i = 0; i < 20; i += 1) {
        const delay = Math.random() * 1.7;
        const freq = 700 + Math.random() * 1500;
        this.tone(freq, freq * 0.55, 0.045, "triangle", 0.018, delay);
      }
    },

    win() {
      if (!this.enabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
      notes.forEach((freq, i) => {
        this.tone(freq, freq, 0.25, "triangle", 0.055, i * 0.13);
      });
      this.tone(1046.5, 1046.5, 0.7, "sine", 0.045, 0.85);
      this.tone(1318.51, 1318.51, 0.7, "sine", 0.035, 0.85);
      this.applause();
    }
  };

  function updateSoundButton() {
    const on = Sound.enabled;
    ui.soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    ui.soundBtn.setAttribute("aria-label", on ? "كتم الصوت" : "تشغيل الصوت");
    ui.soundBtn.title = on ? "كتم الصوت" : "تشغيل الصوت";
    ui.soundBtn.classList.toggle("is-off", !on);
    const iconOn = $(".icon-sound-on", ui.soundBtn);
    const iconOff = $(".icon-sound-off", ui.soundBtn);
    if (iconOn) iconOn.hidden = !on;
    if (iconOff) iconOff.hidden = on;
  }

  function toggleSound() {
    Sound.enabled = !Sound.enabled;
    store.set(KEYS.sound, Sound.enabled ? "on" : "off");
    updateSoundButton();
    if (Sound.enabled) {
      Sound.init();
      Sound.click();
      toast("تم تشغيل المؤثرات الصوتية 🔊", "success");
    } else {
      toast("تم كتم الصوت 🔇", "info");
    }
  }

  /* =========================================================
     ٧ — التنبيهات والنوافذ
     ========================================================= */
  function toast(message, type) {
    const icons = { success: "✅", error: "⚠️", info: "💡", trophy: "🏆" };
    const node = document.createElement("div");
    node.className = "toast toast--" + (type || "info");
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = icons[type] || icons.info;
    const text = document.createElement("span");
    text.textContent = message;
    node.append(icon, text);
    ui.toastWrap.append(node);
    while (ui.toastWrap.children.length > 3) {
      ui.toastWrap.firstElementChild.remove();
    }
    window.setTimeout(() => {
      node.classList.add("is-out");
      window.setTimeout(() => node.remove(), 280);
    }, 3300);
  }

  function announce(message) {
    ui.announcer.textContent = "";
    window.setTimeout(() => {
      ui.announcer.textContent = message;
    }, 30);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    void modal.offsetWidth;
    modal.classList.add("is-open");
    body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!modal.classList.contains("is-open")) modal.hidden = true;
      if (!$(".modal.is-open")) body.classList.remove("modal-open");
    }, 230);
  }

  function askConfirm(options) {
    const settings = options || {};
    if (state.confirmResolver) {
      const previous = state.confirmResolver;
      state.confirmResolver = null;
      previous(false);
    }
    ui.confirmIcon.textContent = settings.icon || "⚠️";
    ui.confirmTitle.textContent = settings.title || "هل أنت متأكد؟";
    ui.confirmText.textContent = settings.text || "";
    ui.confirmOk.textContent = settings.ok || "تأكيد";
    ui.confirmCancel.textContent = settings.cancel || "إلغاء";
    openModal(ui.confirmModal);
    window.setTimeout(() => ui.confirmCancel.focus(), 250);
    return new Promise((resolve) => {
      state.confirmResolver = resolve;
    });
  }

  function settleConfirm(value) {
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    closeModal(ui.confirmModal);
    if (resolver) resolver(value);
  }

  /* =========================================================
     ٨ — القصاصات الاحتفالية
     ========================================================= */
  const Confetti = (function createConfetti() {
    const canvas = ui.confetti;
    const ctx = canvas.getContext("2d");
    const colors = ["#ffd400", "#ff9f1c", "#8b5cf6", "#3b82f6", "#34d399", "#f472b6", "#ffffff"];
    let particles = [];
    let animationId = 0;
    let lastTime = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function addParticle(x, y, options) {
      const settings = options || {};
      const angle = settings.angle !== undefined ? settings.angle : Math.random() * Math.PI * 2;
      const speed = settings.speed !== undefined ? settings.speed : 3 + Math.random() * 7;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (settings.lift || 2),
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.28,
        gravity: settings.gravity !== undefined ? settings.gravity : 0.16,
        drag: 0.992,
        life: 1,
        decay: 0.008 + Math.random() * 0.008,
        shape: Math.random() > 0.4 ? "rect" : "circle"
      });
    }

    function burst(x, y, count) {
      if (prefersReducedMotion()) return;
      const amount = count || 46;
      for (let i = 0; i < amount; i += 1) {
        addParticle(x, y, { speed: 3 + Math.random() * 9, lift: 3 });
      }
      start();
    }

    function rain() {
      if (prefersReducedMotion()) return;
      const width = window.innerWidth;
      for (let i = 0; i < 160; i += 1) {
        const x = Math.random() * width;
        const y = -20 - Math.random() * window.innerHeight * 0.35;
        addParticle(x, y, {
          angle: Math.PI / 2 + (Math.random() - 0.5) * 0.5,
          speed: 2 + Math.random() * 4,
          lift: 0,
          gravity: 0.09
        });
      }
      start();
    }

    function start() {
      if (animationId) return;
      lastTime = performance.now();
      animationId = window.requestAnimationFrame(loop);
    }

    function loop(now) {
      const delta = Math.min(2, (now - lastTime) / 16.67) || 1;
      lastTime = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      particles = particles.filter((particle) => {
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.rotation += particle.rotationSpeed * delta;
        particle.life -= particle.decay * delta;
        if (particle.life <= 0 || particle.y > window.innerHeight + 40) return false;

        ctx.save();
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.color;
        if (particle.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        }
        ctx.restore();
        return true;
      });

      if (particles.length) {
        animationId = window.requestAnimationFrame(loop);
      } else {
        animationId = 0;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    window.addEventListener("resize", resize);
    resize();

    return { burst: burst, rain: rain };
  })();

  function spawnBackgroundStars() {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 34; i += 1) {
      const star = document.createElement("span");
      const size = 1 + Math.random() * 2.2;
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 86 + "%";
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.animationDelay = (Math.random() * 6).toFixed(2) + "s";
      star.style.animationDuration = (3 + Math.random() * 4).toFixed(2) + "s";
      fragment.append(star);
    }
    ui.bgStars.append(fragment);
  }

  /* =========================================================
     ٩ — التنقل والشاشات
     ========================================================= */
  function setScreen(name) {
    if (name !== "quiz" && !ui.roundIntro.hidden) {
      state.introToken += 1;
      window.clearTimeout(state.introTimer);
      ui.roundIntro.classList.remove("is-open");
      ui.roundIntro.hidden = true;
      state.run = [];
      stopTimer();
    }
    state.activeScreen = name;
    Object.keys(screens).forEach((key) => {
      screens[key].classList.toggle("is-active", key === name);
    });
    body.dataset.screen = name;
    window.scrollTo(0, 0);

    if (name === "start") {
      renderMiniBoard();
      fillPlayerInput();
    }
    if (name === "stages") renderStages();
    if (name === "editor") renderEditor();
  }

  function leaveQuiz(after) {
    if (state.activeScreen !== "quiz") {
      after();
      return;
    }
    askConfirm({
      icon: "🚪",
      title: "مغادرة التحدي؟",
      text: "إذا خرجت الآن ستخسر تقدمك في هذه المرحلة، ولن تُحتسب نتيجتها.",
      ok: "نعم، اخرج"
    }).then((confirmed) => {
      if (!confirmed) return;
      stopTimer();
      state.run = [];
      after();
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const request = document.documentElement.requestFullscreen;
      if (!request) {
        toast("هذا المتصفح لا يدعم ملء الشاشة.", "error");
        return;
      }
      request.call(document.documentElement).catch(() => {
        toast("تعذّر تفعيل ملء الشاشة.", "error");
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    ui.fullscreenBtn.title = active ? "الخروج من ملء الشاشة (F)" : "ملء الشاشة (F)";
    ui.fullscreenBtn.setAttribute("aria-label", active ? "الخروج من ملء الشاشة" : "ملء الشاشة");
  }

  /* =========================================================
     ١٠ — البداية
     ========================================================= */
  function fillPlayerInput() {
    if (state.player && !ui.playerName.value) ui.playerName.value = state.player;
  }

  function handleStart(event) {
    event.preventDefault();
    const name = ui.playerName.value.trim().replace(/\s+/g, " ").slice(0, 24);
    if (name.length < 2) {
      ui.nameError.hidden = false;
      setNameInvalid(true);
      ui.playerName.focus();
      Sound.wrong();
      return;
    }
    state.player = name;
    store.set(KEYS.name, name);
    ui.nameError.hidden = true;
    setNameInvalid(false);
    Sound.init();
    Sound.correct();
    setScreen("stages");
    toast("أهلًا " + name + "! اختر تحديك الأول ⚡", "success");
  }

  function setNameInvalid(invalid) {
    const row = ui.playerName.closest(".input-row");
    if (!row) return;
    row.classList.toggle("is-invalid", invalid);
  }

  function renderMiniBoard() {
    const list = loadBoard().slice(0, 3);
    ui.miniLeaderboard.replaceChildren();
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "mini-empty";
      li.textContent = "لا يوجد أبطال بعد… كن الأول! ⚡";
      ui.miniLeaderboard.append(li);
      return;
    }
    list.forEach((entry, index) => {
      const li = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "mini-rank";
      rank.textContent = toAr(index + 1);
      const name = document.createElement("span");
      name.className = "mini-name";
      name.textContent = entry.name;
      const score = document.createElement("span");
      score.className = "mini-score";
      score.textContent = toAr(entry.score);
      li.append(rank, name, score);
      ui.miniLeaderboard.append(li);
    });
  }

  function renderBoardRows(container, list, highlightId, emptyMessage) {
    container.replaceChildren();
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "board-empty";
      const icon = document.createElement("span");
      icon.textContent = "🏆";
      empty.append(icon, document.createTextNode(emptyMessage || "لا توجد نتائج بعد. العب أول تحدي وكن أول الأبطال!"));
      container.append(empty);
      return;
    }
    list.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "board-row" + (entry.id === highlightId ? " is-current" : "");

      const rank = document.createElement("span");
      rank.className = "board-rank";
      rank.textContent = toAr(index + 1);

      const player = document.createElement("div");
      player.className = "board-player";
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const meta = document.createElement("small");
      const stage = entry.stageName || "تحدٍّ";
      meta.textContent = stage + " · دقة " + toAr(entry.accuracy) + "٪ · " + formatShortDate(entry.date);
      player.append(name, meta);

      const score = document.createElement("div");
      score.className = "board-score";
      const points = document.createElement("b");
      points.textContent = toAr(entry.score) + " نقطة";
      const detail = document.createElement("small");
      detail.textContent = toAr(entry.correct) + "/" + toAr(entry.total) + " صحيحة";
      score.append(points, detail);

      row.append(rank, player, score);
      container.append(row);
    });
  }

  function openLeaderboard() {
    renderBoardRows(ui.leaderboardList, loadBoard().slice(0, 15), state.lastEntryId, "لا يوجد أبطال بعد… ابدأ التحدي واصنع اسمك!");
    openModal(ui.leaderboardModal);
  }

  /* =========================================================
     ١١ — بطاقات المراحل
     ========================================================= */
  function buildStageCard(stage, index, bests) {
    const qCount = state.questions.filter((question) => question.stage === stage.id).length;
    const best = bests[stage.id];
    const card = document.createElement("article");
    card.className = "stage-card";
    card.dataset.stage = stage.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute(
      "aria-label",
      stage.name + " — " + stage.subtitle + " — " + qCount + " أسئلة"
    );
    card.style.setProperty("--accent", stage.accent);
    card.style.setProperty("--accent-2", stage.accent2);
    card.style.setProperty("--i", index);

    card.innerHTML =
      '<div class="stage-topline">' +
      '<span class="stage-icon" aria-hidden="true">' + stage.icon + "</span>" +
      '<span class="stage-number">' + toAr(index + 1).padStart(2, "٠") + "</span>" +
      "</div>" +
      (best ? '<span class="stage-done" title="أكملت هذه المرحلة">✓</span>' : "") +
      '<span class="stage-type">' + stage.typeLabel + "</span>" +
      "<h3>" + stage.name + "</h3>" +
      "<p>" + stage.desc + "</p>" +
      '<div class="stage-meta"><span>⏱ ' + toAr(stage.time) + " ث</span><i></i><span>" +
      toAr(qCount) + " أسئلة</span></div>" +
      '<div class="stage-foot"><span class="stage-best">' +
      (best ? "أفضل: <b>" + toAr(best.score) + "</b>" : "لم تُلعب بعد") +
      '</span><span class="stage-go">' +
      (qCount ? "ابدأ" : "فارغة") +
      ' <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5"></path><path d="M11 6l-6 6 6 6"></path></svg></span></div>';

    return card;
  }

  function renderStages() {
    ui.stagePlayer.textContent = state.player || "متسابق";
    const bests = loadBests();
    const done = STAGES.filter((stage) => bests[stage.id]).length;
    ui.completedCount.textContent = toAr(done) + " من " + toAr(STAGES.length);

    ui.completionDots.replaceChildren();
    STAGES.forEach((stage) => {
      const dot = document.createElement("i");
      if (bests[stage.id]) dot.className = "is-done";
      ui.completionDots.append(dot);
    });

    const grid = ui.stageGrid;
    grid.replaceChildren();
    STAGES.forEach((stage, index) => {
      grid.append(buildStageCard(stage, index, bests));
    });
  }

  function startStage(stageId) {
    const stage = STAGE_BY_ID.get(stageId);
    if (!stage) return;
    const stageQuestions = state.questions.filter((question) => question.stage === stageId);
    if (!stageQuestions.length) {
      toast("لا توجد أسئلة في هذه المرحلة. أضف أسئلة من لوحة التحكم.", "error");
      return;
    }

    state.stage = stage;
    state.run = stageQuestions.map((question) => prepareQuestion(question, stage));
    state.index = 0;
    state.score = 0;
    state.correct = 0;
    state.wrong = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.answered = false;
    state.selected = null;
    state.records = [];
    state.hintUsed = false;
    state.wordsSelected = [];
    state.wordsLocked = false;
    state.lastResult = null;

    Sound.click();
    showRoundIntro(stage, () => {
      setScreen("quiz");
      renderQuestion();
    });
  }

  function showRoundIntro(stage, callback) {
    const token = ++state.introToken;
    ui.introIndex.textContent = "التحدي " + toAr(STAGES.indexOf(stage) + 1);
    ui.introIcon.textContent = stage.icon;
    ui.introName.textContent = stage.name;
    ui.introDesc.textContent = stage.desc;
    ui.roundIntro.style.setProperty("--intro-accent", stage.accent);
    ui.roundIntro.hidden = false;
    void ui.roundIntro.offsetWidth;
    ui.roundIntro.classList.add("is-open");

    window.clearTimeout(state.introTimer);
    state.introTimer = window.setTimeout(
      () => {
        if (token !== state.introToken) return;
        ui.roundIntro.classList.remove("is-open");
        window.setTimeout(() => {
          if (token !== state.introToken) return;
          ui.roundIntro.hidden = true;
          callback();
        }, 240);
      },
      prefersReducedMotion() ? 350 : 1750
    );
  }

  function randomStage() {
    const available = STAGES.filter((stage) =>
      state.questions.some((question) => question.stage === stage.id)
    );
    if (!available.length) {
      toast("لا توجد أسئلة متاحة. أضف أسئلة أولًا.", "error");
      return;
    }
    startStage(randomFrom(available).id);
  }

  /* =========================================================
     ١٢ — تجهيز السؤال
     ========================================================= */
  function prepareQuestion(raw, stage) {
    const question = deepClone(raw);
    question.basePoints = question.points || stage.points || 100;
    question.time = question.time || stage.time || 25;

    if (question.type === "words") {
      question.chips = shuffle(
        question.words.map((word, index) => ({ id: "chip-" + index + "-" + uid("w"), text: word }))
      );
    } else if (question.type !== "truefalse") {
      const options = question.options.slice();
      const correctText = options[question.answer];
      const shuffled = shuffle(options.map((text) => ({ text: text })));
      question.options = shuffled.map((item) => item.text);
      question.answer = question.options.indexOf(correctText);
    }

    return question;
  }


  /* =========================================================
     ١٣ — محرك الأسئلة والمؤقت
     ========================================================= */
  function currentQuestion() {
    return state.run[state.index] || null;
  }

  function setQuestionVisual(question) {
    if (question.visual) {
      ui.visualBox.hidden = false;
      ui.visualBox.replaceChildren();
      const emoji = document.createElement("span");
      emoji.className = "visual-emoji";
      emoji.textContent = question.visual;
      ui.visualBox.append(emoji);
    } else {
      ui.visualBox.hidden = true;
      ui.visualBox.replaceChildren();
    }
  }

  function renderOptions(question) {
    ui.optionsWrap.hidden = false;
    ui.wordsWrap.hidden = true;
    ui.optionsWrap.replaceChildren();

    question.options.forEach((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", OPTION_KEYS[index] + ": " + text);

      const key = document.createElement("span");
      key.className = "option-key";
      key.textContent = OPTION_KEYS[index] || String(index + 1);

      const label = document.createElement("span");
      label.className = "option-text";
      label.textContent = text;

      const mark = document.createElement("span");
      mark.className = "option-mark";
      mark.setAttribute("aria-hidden", "true");

      button.append(key, label, mark);
      ui.optionsWrap.append(button);
    });
  }

  function makeWordChip(chip, placed) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "word-chip" + (placed ? " is-placed" : "");
    button.dataset.wordId = chip.id;
    button.textContent = chip.text;
    if (placed) {
      button.dataset.remove = "1";
      button.title = "إعادة الكلمة إلى البنك";
    } else {
      button.dataset.add = "1";
      button.title = "أضف الكلمة إلى الجملة";
    }
    if (state.wordsLocked || state.answered) button.disabled = true;
    return button;
  }

  function renderWordsState() {
    const question = currentQuestion();
    if (!question || !question.chips) return;

    ui.answerBoard.replaceChildren();
    ui.wordBank.replaceChildren();

    state.wordsSelected.forEach((id) => {
      const chip = question.chips.find((item) => item.id === id);
      if (chip) ui.answerBoard.append(makeWordChip(chip, true));
    });

    question.chips.forEach((chip) => {
      if (!state.wordsSelected.includes(chip.id)) {
        ui.wordBank.append(makeWordChip(chip, false));
      }
    });
  }

  function renderWords(question) {
    ui.optionsWrap.hidden = true;
    ui.wordsWrap.hidden = false;
    state.wordsSelected = [];
    state.wordsLocked = false;
    ui.answerBoard.classList.remove("is-correct", "is-wrong");
    ui.answerBoard.classList.toggle("is-locked", false);
    renderWordsState();
  }

  function renderQuestion() {
    const question = currentQuestion();
    if (!question) {
      finishStage();
      return;
    }

    stopTimer();
    state.isFinishing = false;
    state.answered = false;
    state.selected = null;
    state.hintUsed = false;
    state.wordsSelected = [];
    state.wordsLocked = false;
    state.timeLeft = question.time;

    const stage = state.stage;
    screens.quiz.style.setProperty("--quiz-accent", stage.accent);
    screens.quiz.style.setProperty("--stage-accent", stage.accent);

    ui.hudStageIcon.textContent = stage.icon;
    ui.hudStageName.textContent = stage.name;
    ui.liveScore.textContent = toAr(state.score);
    ui.liveStreak.textContent = toAr(state.streak);
    ui.streakPill.classList.toggle("is-hot", state.streak >= 3);
    ui.qIndex.textContent = toAr(state.index + 1);
    ui.qTotal.textContent = toAr(state.run.length);

    ui.quizProgressFill.style.width = ((state.index / state.run.length) * 100).toFixed(1) + "%";
    ui.quizProgress.setAttribute(
      "aria-valuenow",
      String(Math.round((state.index / state.run.length) * 100))
    );

    const isFirst = state.index === 0;
    ui.questionKicker.textContent = isFirst
      ? "السؤال الأول"
      : "السؤال " + toAr(state.index + 1) + " من " + toAr(state.run.length);

    ui.typeBadge.textContent =
      question.type === "truefalse" ? "صح أم خطأ" : TYPE_LABELS[question.type] || stage.typeLabel;
    ui.pointsBadge.textContent = toAr(question.basePoints) + " نقطة";
    ui.pointsBadge.title = "النقاط الأساسية قبل مكافأة الوقت والسلسلة";

    if (stage.id === "surprise") {
      ui.stakes.textContent = "نقاط مضاعفة ×٢";
      ui.stakes.classList.add("is-double");
    } else if (stage.id === "speed") {
      ui.stakes.textContent = "سرعة قصوى ⚡";
      ui.stakes.classList.add("is-double");
    } else {
      ui.stakes.textContent = "نقاط ×١";
      ui.stakes.classList.remove("is-double");
    }

    ui.questionPrompt.textContent = question.prompt;
    setQuestionVisual(question);

    if (question.type === "words") {
      renderWords(question);
    } else {
      renderOptions(question);
    }

    ui.hintBtn.disabled = false;
    ui.hintText.textContent = "";
    ui.feedback.hidden = true;
    ui.feedback.className = "feedback";
    ui.nextBtn.hidden = true;
    ui.nextBtnText.textContent =
      state.index === state.run.length - 1 ? "شاهد النتائج" : "السؤال التالي";

    ui.questionCard.classList.remove("is-entering", "is-shaking");
    void ui.questionCard.offsetWidth;
    ui.questionCard.classList.add("is-entering");

    startTimer(question.time);
    announce(
      "السؤال " +
        toAr(state.index + 1) +
        " من " +
        toAr(state.run.length) +
        ": " +
        question.prompt
    );
  }

  function startTimer(seconds) {
    stopTimer();
    const total = Math.max(1, seconds);
    state.timeLeft = total;
    state.deadline = performance.now() + total * 1000;

    const circumference = 2 * Math.PI * 58;
    ui.timerCircle.style.strokeDasharray = circumference.toFixed(2);
    ui.timerCircle.style.strokeDashoffset = "0";
    ui.timerRing.classList.remove("is-urgent");
    ui.timerNum.textContent = toAr(Math.ceil(total));
    let lastWhole = Math.ceil(total);

    function tick() {
      if (state.answered) return;
      const remaining = Math.max(0, state.deadline - performance.now());
      state.timeLeft = remaining / 1000;
      const whole = Math.ceil(remaining / 1000);
      const fraction = clamp(remaining / (total * 1000), 0, 1);

      ui.timerCircle.style.strokeDashoffset = (circumference * (1 - fraction)).toFixed(2);

      if (whole !== lastWhole) {
        lastWhole = whole;
        ui.timerNum.textContent = toAr(whole);
        if (whole <= 5 && whole > 0) Sound.tick();
      }

      const urgent = whole <= 5;
      ui.timerRing.classList.toggle("is-urgent", urgent);

      if (remaining <= 0) {
        stopTimer();
        ui.timerNum.textContent = toAr(0);
        handleTimeout();
      }
    }

    tick();
    state.timerId = window.setInterval(tick, 100);
  }

  function stopTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function handleAnswer(choice) {
    if (state.answered) return;
    const question = currentQuestion();
    if (!question || question.type === "words") return;

    const chosenText = question.options[choice];
    stopTimer();
    state.answered = true;
    state.selected = choice;

    $$(".option", ui.optionsWrap).forEach((button, index) => {
      button.disabled = true;
      if (index === question.answer) button.classList.add("is-correct");
      else if (index === choice) button.classList.add("is-wrong");
      else button.classList.add("is-muted");
    });

    finishAnswerFlow({
      correct: choice === question.answer,
      chosenText: chosenText,
      timedOut: false
    });
  }

  function evaluateWords() {
    if (state.answered) return;
    const question = currentQuestion();
    if (!question || question.type !== "words") return;

    if (state.wordsSelected.length !== question.chips.length) {
      toast("استخدم كل الكلمات قبل التحقق من الجملة.", "info");
      return;
    }

    const chosenText = state.wordsSelected
      .map((id) => {
        const chip = question.chips.find((item) => item.id === id);
        return chip ? chip.text : "";
      })
      .join(" ");

    const correct = normalizeText(chosenText) === normalizeText(question.answer);
    stopTimer();
    state.answered = true;
    state.wordsLocked = true;
    ui.answerBoard.classList.add(correct ? "is-correct" : "is-wrong");
    renderWordsState();

    finishAnswerFlow({
      correct: correct,
      chosenText: chosenText,
      timedOut: false
    });
  }

  function applyScoreDelta(delta) {
    const before = state.score;
    state.score = Math.max(0, state.score + delta);
    const applied = state.score - before;
    ui.liveScore.textContent = toAr(state.score);
    ui.scorePill.classList.remove("pop");
    void ui.scorePill.offsetWidth;
    ui.scorePill.classList.add("pop");
    showScoreFloat(applied);
    return applied;
  }

  function showScoreFloat(applied) {
    if (!applied) return;
    const float = document.createElement("span");
    float.className = "score-float" + (applied < 0 ? " is-negative" : "");
    float.textContent = (applied > 0 ? "+" : "−") + toAr(Math.abs(applied));
    ui.scorePill.append(float);
    window.setTimeout(() => float.remove(), 1000);
  }

  function finishAnswerFlow(result) {
    const question = currentQuestion();
    if (!question) return;

    const remaining = result.timedOut ? 0 : state.timeLeft;
    let applied = 0;
    let bonus = 0;

    if (result.correct) {
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);

      const base = question.basePoints;
      const timeBonus = Math.round(50 * clamp(remaining / question.time, 0, 1));
      let delta = base + timeBonus;
      if (state.streak >= 3) {
        bonus = 25;
        delta += bonus;
      }
      applied = applyScoreDelta(delta);
    } else {
      state.wrong += 1;
      state.streak = 0;
      const penalty = result.timedOut ? 25 : 40;
      applied = applyScoreDelta(-penalty);
    }

    ui.liveStreak.textContent = toAr(state.streak);
    ui.streakPill.classList.toggle("is-hot", state.streak >= 3);

    const record = {
      question: question,
      chosenText: result.chosenText || "",
      correct: result.correct,
      timedOut: Boolean(result.timedOut),
      applied: applied,
      bonus: bonus
    };
    state.records.push(record);

    showFeedback(record);
    ui.nextBtnText.textContent =
      state.index === state.run.length - 1 ? "شاهد النتائج" : "السؤال التالي";
    ui.nextBtn.hidden = false;

    const completed = ((state.index + 1) / state.run.length) * 100;
    ui.quizProgressFill.style.width = completed.toFixed(1) + "%";
    ui.quizProgress.setAttribute("aria-valuenow", String(Math.round(completed)));

    if (result.correct) {
      Sound.correct();
      Confetti.burst(window.innerWidth / 2, window.innerHeight * 0.42, 44);
      if (bonus > 0) {
        Sound.streak();
        toast("سلسلة " + toAr(state.streak) + " إجابات! مكافأة +٢٥ 🔥", "success");
      }
    } else {
      Sound.wrong();
      ui.questionCard.classList.add("is-shaking");
      window.setTimeout(() => ui.questionCard.classList.remove("is-shaking"), 450);
    }

    announce(
      result.correct
        ? "إجابة صحيحة. نقاطك الآن " + toAr(state.score)
        : "إجابة خاطئة. نقاطك الآن " + toAr(state.score)
    );
  }

  function correctAnswerText(question) {
    if (question.type === "words") return question.answer;
    return question.options[question.answer];
  }

  function showFeedback(record) {
    const question = record.question;
    const answerText = correctAnswerText(question);

    ui.feedback.hidden = false;
    ui.feedback.className = "feedback" + (record.correct ? "" : " feedback--wrong");
    ui.feedbackIcon.textContent = record.correct ? "✓" : "✕";
    ui.feedbackTitle.textContent = record.correct
      ? randomFrom(CORRECT_MESSAGES)
      : record.timedOut
        ? randomFrom(TIMEOUT_MESSAGES)
        : randomFrom(WRONG_MESSAGES);

    let text = "";
    if (!record.correct) {
      text = "الإجابة الصحيحة: " + answerText + ".";
      if (question.explanation) text += " " + question.explanation;
    } else if (question.explanation) {
      text = question.explanation;
    } else {
      text = "أحسنت! استمر بهذا المستوى.";
    }
    ui.feedbackText.textContent = text;

    ui.feedbackPoints.replaceChildren();
    const delta = document.createElement("span");
    delta.className = "num";
    delta.textContent =
      (record.applied > 0 ? "+" : "−") + toAr(Math.abs(record.applied));
    ui.feedbackPoints.append(delta, document.createTextNode(" نقطة"));
    if (record.bonus > 0) {
      const extra = document.createElement("span");
      extra.className = "num";
      extra.textContent = "+" + toAr(record.bonus);
      ui.feedbackPoints.append(document.createTextNode(" · مكافأة سلسلة "), extra);
    }
    if (record.timedOut) ui.feedbackPoints.append(document.createTextNode(" · انتهى الوقت"));
  }

  function handleTimeout() {
    if (state.answered) return;
    const question = currentQuestion();
    if (!question) return;

    state.answered = true;
    state.timeLeft = 0;

    if (question.type === "words") {
      state.wordsLocked = true;
      ui.answerBoard.classList.add("is-wrong");
      renderWordsState();
    } else {
      $$(".option", ui.optionsWrap).forEach((button, index) => {
        button.disabled = true;
        if (index === question.answer) button.classList.add("is-correct");
        else button.classList.add("is-muted");
      });
    }

    finishAnswerFlow({
      correct: false,
      chosenText: "",
      timedOut: true
    });
  }

  function goNext() {
    if (!state.answered) {
      toast("اختر إجابة أولًا… أو اطلب تلميحًا 💡", "info");
      return;
    }
    if (state.index < state.run.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      finishStage();
    }
  }

  function useHint() {
    if (state.answered || state.hintUsed) return;
    const question = currentQuestion();
    if (!question) return;

    state.hintUsed = true;
    ui.hintBtn.disabled = true;
    let hint = question.hint || "";

    if (question.type === "words") {
      const firstToken = question.answer.split(/\s+/)[0];
      if (!hint) hint = "تبدأ الجملة بكلمة «" + firstToken + "».";
      const chips = $$(".word-chip", ui.answerBoard).concat($$(".word-chip", ui.wordBank));
      const target = chips.find(
        (chip) => normalizeText(chip.textContent) === normalizeText(firstToken)
      );
      if (target) target.classList.add("is-hinted");
    } else if (question.type === "truefalse") {
      if (!hint) hint = "إحدى الإجابتين فقط صحيحة؛ لا توجد إجابة ثالثة.";
    } else {
      const wrongOptions = $$(".option", ui.optionsWrap).filter(
        (button, index) =>
          index !== question.answer && !button.classList.contains("is-eliminated")
      );
      if (wrongOptions.length) {
        const target = randomFrom(wrongOptions);
        target.classList.add("is-eliminated");
        target.disabled = true;
        if (!hint) hint = "حذفنا لك خيارًا خاطئًا من القائمة.";
      } else if (!hint) {
        hint = "اقرأ السؤال بهدوء… الإجابة تختبئ في التفاصيل.";
      }
    }

    ui.hintText.textContent = hint;
    applyScoreDelta(-20);
    Sound.click();
    toast("تم خصم ٢٠ نقطة مقابل التلميح.", "info");
  }

  /* =========================================================
     ١٤ — النتائج والمتصدرون
     ========================================================= */
  function ratingFor(accuracy) {
    if (accuracy >= 90) {
      return {
        title: "أسطورة التحدي",
        emoji: "🏆",
        stars: 5,
        message: "أداء أسطوري! أنت من النوع الذي يترك الجمهور واقفًا يصفق."
      };
    }
    if (accuracy >= 75) {
      return {
        title: "عبقري صاعد",
        emoji: "🥇",
        stars: 4,
        message: "عقلية ممتازة وسرعة بديهة عالية. القمة باتت قريبة جدًا!"
      };
    }
    if (accuracy >= 60) {
      return {
        title: "ذكي وواعد",
        emoji: "🥈",
        stars: 3,
        message: "مستوى قوي وواضح! القليل من التركيز وسيصبح اسمك في الصدارة."
      };
    }
    if (accuracy >= 40) {
      return {
        title: "مغامر شجاع",
        emoji: "🥉",
        stars: 2,
        message: "بدأت الرحلة بجرأة، وكل محاولة تجعلك أقرب إلى لقب البطل."
      };
    }
    return {
      title: "بداية مشجعة",
      emoji: "🌱",
      stars: 1,
      message: "كل الأبطال بدؤوا من هنا. جرّب مرة أخرى… المفاجأة تنتظرك!"
    };
  }

  function finishStage() {
    if (state.isFinishing) return;
    state.isFinishing = true;
    stopTimer();

    const total = state.run.length;
    const accuracy = total ? Math.round((state.correct / total) * 100) : 0;
    const rating = ratingFor(accuracy);

    const entry = {
      id: uid("run"),
      name: state.player || "متسابق",
      score: state.score,
      correct: state.correct,
      wrong: state.wrong,
      total: total,
      accuracy: accuracy,
      bestStreak: state.bestStreak,
      stageId: state.stage ? state.stage.id : "",
      stageName: state.stage ? state.stage.name : "تحدٍّ",
      date: new Date().toISOString()
    };

    const board = loadBoard();
    board.push(entry);
    saveBoard(board);
    state.lastEntryId = entry.id;

    if (state.stage) {
      const bests = loadBests();
      const previous = bests[state.stage.id];
      if (!previous || entry.score > previous.score) {
        bests[state.stage.id] = {
          score: entry.score,
          accuracy: accuracy,
          date: entry.date
        };
        saveBests(bests);
      }
    }

    state.lastResult = Object.assign({}, entry, { rating: rating });
    renderResults();
    setScreen("results");

    window.setTimeout(() => {
      Sound.win();
      Confetti.rain();
    }, 280);

    toast("أكملت " + (state.stage ? state.stage.name : "التحدي") + "! " + rating.title, "trophy");
  }

  function animateNumber(element, target) {
    if (state.numberAnimation) {
      window.cancelAnimationFrame(state.numberAnimation);
      state.numberAnimation = null;
    }
    if (prefersReducedMotion()) {
      element.textContent = toAr(target);
      return;
    }
    const duration = 1000;
    const start = performance.now();
    function step(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = toAr(Math.round(target * eased));
      if (progress < 1) {
        state.numberAnimation = window.requestAnimationFrame(step);
      } else {
        state.numberAnimation = null;
      }
    }
    state.numberAnimation = window.requestAnimationFrame(step);
  }

  function renderResults() {
    const result = state.lastResult;
    if (!result) return;
    const rating = result.rating;

    ui.resultName.textContent = result.name;
    ui.resultTitle.textContent = rating.title;
    ui.resultMessage.textContent = rating.message;
    ui.resultMedal.textContent = rating.emoji;
    ui.resultMedal.style.animation = "none";
    void ui.resultMedal.offsetWidth;
    ui.resultMedal.style.animation = "";

    ui.resultStars.replaceChildren();
    for (let i = 0; i < 5; i += 1) {
      const star = document.createElement("span");
      star.textContent = "★";
      star.style.setProperty("--i", i);
      if (i < rating.stars) star.classList.add("is-filled");
      ui.resultStars.append(star);
    }
    ui.resultStars.setAttribute("aria-label", "تقييم " + rating.stars + " من 5 نجوم");

    animateNumber(ui.finalScore, result.score);
    ui.statCorrect.textContent = toAr(result.correct);
    ui.statWrong.textContent = toAr(result.wrong);
    ui.statAccuracy.textContent = toAr(result.accuracy) + "٪";
    ui.statStreak.textContent = toAr(result.bestStreak);

    renderBoardRows(
      ui.resultLeaderboard,
      loadBoard().slice(0, 8),
      result.id,
      "لا توجد نتائج بعد… العب أول تحدي!"
    );

    ui.reviewList.replaceChildren();
    state.records.forEach((record) => {
      const details = document.createElement("details");
      details.className = "review-item " + (record.correct ? "is-correct" : "is-wrong");

      const summary = document.createElement("summary");
      const stateIcon = document.createElement("span");
      stateIcon.className = "review-state";
      stateIcon.textContent = record.correct ? "✓" : "✕";
      const text = document.createElement("span");
      text.className = "review-q";
      text.textContent = record.question.prompt;
      const points = document.createElement("span");
      points.className = "review-points num";
      points.textContent = (record.applied >= 0 ? "+" : "−") + toAr(Math.abs(record.applied));
      summary.append(stateIcon, text, points);

      const body = document.createElement("div");
      body.className = "review-body";
      if (record.timedOut) {
        const timeout = document.createElement("div");
        timeout.textContent = "⏳ لم تُجب قبل انتهاء الوقت.";
        body.append(timeout);
      } else if (!record.correct && record.chosenText) {
        const chosen = document.createElement("div");
        chosen.textContent = "إجابتك: " + record.chosenText;
        body.append(chosen);
      }
      const answer = document.createElement("div");
      answer.className = "review-answer";
      answer.textContent = "الإجابة الصحيحة: " + correctAnswerText(record.question);
      body.append(answer);
      if (record.question.explanation) {
        const explanation = document.createElement("div");
        explanation.textContent = record.question.explanation;
        body.append(explanation);
      }

      details.append(summary, body);
      ui.reviewList.append(details);
    });

    announce("انتهى التحدي. مجموع نقاطك " + toAr(result.score) + ". تقييمك: " + rating.title);
  }

  function shareResult() {
    const result = state.lastResult;
    if (!result) return;
    const text =
      "🏆 " +
      result.name +
      " حقق " +
      result.score +
      " نقطة في «تحدي الأذكياء» — " +
      result.rating.title +
      "! هل تستطيع التغلب عليه؟";
    const url = window.location.href;
    if (navigator.share) {
      navigator
        .share({ title: "تحدي الأذكياء", text: text, url: url })
        .then(() => toast("تمت مشاركة نتيجتك! 🔗", "success"))
        .catch(() => copyShareText(text + " " + url));
      return;
    }
    copyShareText(text + " " + url);
  }

  function copyShareText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast("تم نسخ نتيجتك… شاركها مع أصدقائك! 🔗", "success"))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("تم نسخ نتيجتك… شاركها مع أصدقائك! 🔗", "success");
    } catch (error) {
      toast("تعذّر النسخ التلقائي. يمكنك تصوير النتيجة!", "info");
    }
    area.remove();
  }

  /* =========================================================
     ١٥ — محرر بنك الأسئلة
     ========================================================= */
  function populateSelects() {
    ui.fStage.replaceChildren();
    STAGES.forEach((stage) => {
      const option = document.createElement("option");
      option.value = stage.id;
      option.textContent = stage.icon + " " + stage.name;
      ui.fStage.append(option);
    });

    const currentFilter = ui.stageFilter.value || "all";
    ui.stageFilter.replaceChildren();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "كل المراحل";
    ui.stageFilter.append(all);
    STAGES.forEach((stage) => {
      const option = document.createElement("option");
      option.value = stage.id;
      option.textContent = stage.icon + " " + stage.name;
      ui.stageFilter.append(option);
    });
    ui.stageFilter.value = currentFilter;
  }

  function flashSaved() {
    if (!ui.editorSaved) return;
    ui.editorSaved.textContent = "✓ تم الحفظ";
    window.clearTimeout(flashSaved.timer);
    flashSaved.timer = window.setTimeout(() => {
      ui.editorSaved.textContent = "💾 الحفظ تلقائي";
    }, 1800);
  }

  function questionRow(question, index) {
    const stage = STAGE_BY_ID.get(question.stage) || STAGES[0];
    const row = document.createElement("article");
    row.className = "q-row";
    row.dataset.id = question.id;
    row.style.setProperty("--i", index);

    const stageTag = document.createElement("span");
    stageTag.className = "q-stage";
    stageTag.textContent = stage.icon + " " + stage.name;

    const main = document.createElement("div");
    main.className = "q-main";
    const title = document.createElement("h3");
    title.textContent = question.prompt;
    title.title = question.prompt;
    const tags = document.createElement("div");
    tags.className = "q-tags";
    const type = document.createElement("span");
    type.textContent = TYPE_LABELS[question.type] || "سؤال";
    const answer = document.createElement("span");
    answer.className = "q-answer";
    answer.textContent = "✓ " + String(correctAnswerText(question)).slice(0, 60);
    tags.append(type, answer);
    main.append(title, tags);

    const points = document.createElement("div");
    points.className = "q-points";
    points.textContent = toAr(question.points || stage.points);
    const pointsLabel = document.createElement("small");
    pointsLabel.textContent = "نقطة";
    points.append(pointsLabel);

    const actions = document.createElement("div");
    actions.className = "q-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-action";
    edit.dataset.edit = question.id;
    edit.setAttribute("aria-label", "تعديل السؤال");
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path></svg>';
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-action icon-action--danger";
    remove.dataset.delete = question.id;
    remove.setAttribute("aria-label", "حذف السؤال");
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
    actions.append(edit, remove);

    row.append(stageTag, main, points, actions);
    return row;
  }

  function renderEditor() {
    if (!ui.stageFilter.options.length) populateSelects();
    const filter = ui.stageFilter.value || "all";
    const search = normalizeText(ui.questionSearch.value || "").toLowerCase();

    const visible = state.questions.filter((question) => {
      if (filter !== "all" && question.stage !== filter) return false;
      if (search) {
        const haystack = normalizeText(
          question.prompt + " " + (question.explanation || "") + " " + (question.answer || "")
        ).toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    ui.editorCount.textContent = toAr(state.questions.length);
    ui.questionList.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const icon = document.createElement("span");
      icon.textContent = state.questions.length ? "🔎" : "🗂️";
      const strong = document.createElement("strong");
      strong.textContent = state.questions.length
        ? "لا توجد أسئلة مطابقة"
        : "بنك الأسئلة فارغ";
      const text = document.createElement("p");
      text.textContent = state.questions.length
        ? "جرّب كلمة بحث أخرى أو اختر مرحلة مختلفة."
        : "أضف سؤالًا جديدًا أو استعد الأسئلة الافتراضية.";
      empty.append(icon, strong, text);
      ui.questionList.append(empty);
      return;
    }

    visible.forEach((question, index) => {
      ui.questionList.append(questionRow(question, index));
    });
  }

  function fillAnswerSelect(values, selected) {
    ui.fAnswer.replaceChildren();
    values.forEach((value, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent =
        values.length === 2 && (value === "صح" || value === "خطأ")
          ? value
          : (OPTION_KEYS[index] || String(index + 1)) + " — " + (value || "خيار " + toAr(index + 1));
      ui.fAnswer.append(option);
    });
    const safe = clamp(Number(selected) || 0, 0, Math.max(0, values.length - 1));
    ui.fAnswer.value = String(safe);
  }

  function optionValues() {
    return [ui.fOpt0, ui.fOpt1, ui.fOpt2, ui.fOpt3].map((input) => input.value.trim());
  }

  function syncFormFields() {
    const type = ui.fType.value;
    const isWords = type === "words";
    const isTrueFalse = type === "truefalse";
    const isPicture = type === "picture";

    ui.fWordsField.hidden = !isWords;
    ui.fOptionsField.hidden = isWords;
    ui.fVisualField.hidden = !isPicture;
    ui.optionInputs.hidden = isTrueFalse;

    if (isTrueFalse) {
      ui.fOpt0.value = "صح";
      ui.fOpt1.value = "خطأ";
      ui.fOpt2.value = "";
      ui.fOpt3.value = "";
      fillAnswerSelect(["صح", "خطأ"], Number(ui.fAnswer.value) || 0);
    } else if (!isWords) {
      if (!ui.fOpt0.value && !ui.fOpt1.value) {
        ui.fOpt0.value = "الخيار الأول";
        ui.fOpt1.value = "الخيار الثاني";
      }
      fillAnswerSelect(optionValues(), Number(ui.fAnswer.value) || 0);
    }
  }

  function openQuestionModal(id) {
    state.editingId = id || null;
    ui.questionForm.reset();
    ui.fId.value = id || "";
    ui.questionModalTitle.textContent = id ? "تعديل السؤال" : "سؤال جديد";

    const question = id ? state.questions.find((item) => item.id === id) : null;
    const filterStage =
      ui.stageFilter.value && ui.stageFilter.value !== "all"
        ? STAGE_BY_ID.get(ui.stageFilter.value)
        : STAGES[0];
    const stage = question ? STAGE_BY_ID.get(question.stage) || STAGES[0] : filterStage || STAGES[0];

    ui.fStage.value = stage.id;
    ui.fType.value = question ? question.type : "mcq";
    ui.fPrompt.value = question ? question.prompt : "";
    ui.fHint.value = question ? question.hint || "" : "";
    ui.fExplanation.value = question ? question.explanation || "" : "";
    ui.fTime.value = question && question.time ? question.time : stage.time;
    ui.fPoints.value = question && question.points ? question.points : stage.points;
    ui.fVisual.value = question && question.visual ? question.visual : "";

    if (question && question.type === "words") {
      ui.fWordsAnswer.value = question.answer;
      ui.fWords.value = question.words.join(" | ");
      [ui.fOpt0, ui.fOpt1, ui.fOpt2, ui.fOpt3].forEach((input) => {
        input.value = "";
      });
    } else {
      ui.fWordsAnswer.value = "";
      ui.fWords.value = "";
      const options = question && question.options ? question.options.slice(0, 4) : [];
      [ui.fOpt0, ui.fOpt1, ui.fOpt2, ui.fOpt3].forEach((input, index) => {
        input.value = options[index] || "";
      });
      if (question && question.type === "truefalse") {
        ui.fOpt0.value = "صح";
        ui.fOpt1.value = "خطأ";
      }
    }

    syncFormFields();
    if (question && question.type !== "words") {
      ui.fAnswer.value = String(question.answer);
    }

    openModal(ui.questionModal);
    window.setTimeout(() => ui.fPrompt.focus(), 260);
  }

  function saveQuestion(event) {
    event.preventDefault();

    const stageId = ui.fStage.value;
    const stage = STAGE_BY_ID.get(stageId);
    if (!stage) return;

    const type = ui.fType.value;
    const prompt = ui.fPrompt.value.trim();
    if (!prompt) {
      toast("اكتب نص السؤال أولًا.", "error");
      ui.fPrompt.focus();
      return;
    }

    const question = {
      id: ui.fId.value || uid("custom"),
      stage: stageId,
      type: type,
      prompt: prompt,
      hint: ui.fHint.value.trim(),
      explanation: ui.fExplanation.value.trim()
    };

    const time = Number(ui.fTime.value);
    const points = Number(ui.fPoints.value);
    question.time = Number.isFinite(time) ? clamp(Math.round(time), 5, 120) : stage.time;
    question.points = Number.isFinite(points) ? clamp(Math.round(points), 10, 1000) : stage.points;

    if (type === "words") {
      const answer = ui.fWordsAnswer.value.trim();
      if (!answer) {
        toast("اكتب الجملة الصحيحة لسؤال الترتيب.", "error");
        ui.fWordsAnswer.focus();
        return;
      }
      const wordsText = ui.fWords.value.trim();
      const words = wordsText
        ? wordsText
            .split("|")
            .map((word) => word.trim())
            .filter(Boolean)
        : answer.split(/\s+/).filter(Boolean);
      if (words.length < 2) {
        toast("أضف كلمتين على الأقل لسؤال الترتيب.", "error");
        return;
      }
      question.answer = answer;
      question.words = words;
    } else {
      let options;
      let correctIndex;
      if (type === "truefalse") {
        options = ["صح", "خطأ"];
        correctIndex = Number(ui.fAnswer.value) === 1 ? 1 : 0;
      } else {
        const raw = optionValues();
        const selected = Number(ui.fAnswer.value);
        const correctText = raw[selected];
        options = raw.filter(Boolean);
        if (options.length < 2 || !correctText) {
          toast("أضف خيارين على الأقل وحدد الإجابة الصحيحة.", "error");
          return;
        }
        correctIndex = options.indexOf(correctText);
        if (correctIndex < 0) {
          toast("الإجابة الصحيحة يجب أن تكون أحد الخيارات المكتوبة.", "error");
          return;
        }
      }
      question.options = options;
      question.answer = correctIndex;

      if (type === "picture") {
        const visual = ui.fVisual.value.trim();
        if (!visual) {
          toast("أضف رموز الصورة لسؤال التخمين.", "error");
          ui.fVisual.focus();
          return;
        }
        question.visual = visual;
      }
    }

    const existingIndex = state.questions.findIndex((item) => item.id === question.id);
    if (existingIndex >= 0) {
      state.questions[existingIndex] = question;
    } else {
      state.questions.push(question);
      ui.stageFilter.value = stageId;
    }

    saveQuestions();
    renderEditor();
    flashSaved();
    closeModal(ui.questionModal);
    Sound.correct();
    toast(existingIndex >= 0 ? "تم تحديث السؤال بنجاح ✏️" : "تمت إضافة سؤال جديد ＋", "success");
  }

  function deleteQuestion(id) {
    const question = state.questions.find((item) => item.id === id);
    if (!question) return;
    askConfirm({
      icon: "🗑️",
      title: "حذف السؤال؟",
      text: 'سيتم حذف: «' + question.prompt.slice(0, 80) + "». لا يمكن التراجع.",
      ok: "نعم، احذف"
    }).then((confirmed) => {
      if (!confirmed) return;
      state.questions = state.questions.filter((item) => item.id !== id);
      saveQuestions();
      renderEditor();
      flashSaved();
      toast("تم حذف السؤال.", "info");
    });
  }

  function resetQuestions() {
    askConfirm({
      icon: "↺",
      title: "استعادة الأسئلة الافتراضية؟",
      text: "سيتم استبدال كل التعديلات والأسئلة المضافة بالبنك الأصلي (٤٨ سؤالًا).",
      ok: "نعم، استعد"
    }).then((confirmed) => {
      if (!confirmed) return;
      state.questions = deepClone(DEFAULTS).map(sanitizeQuestion).filter(Boolean);
      saveQuestions();
      renderEditor();
      flashSaved();
      toast("تمت استعادة بنك الأسئلة الافتراضي.", "success");
    });
  }

  function exportQuestions() {
    const payload = {
      app: "تحدي الأذكياء",
      version: 1,
      exportedAt: new Date().toISOString(),
      questions: state.questions
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "azkiya-questions.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast("تم تصدير بنك الأسئلة ⬇", "success");
  }

  function importQuestions(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawList = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.questions) ? parsed.questions : null;
        if (!rawList) throw new Error("bad-format");
        const clean = rawList.map(sanitizeQuestion).filter(Boolean);
        if (!clean.length) throw new Error("empty");
        askConfirm({
          icon: "⬆",
          title: "استيراد " + toAr(clean.length) + " سؤالًا؟",
          text: "سيتم استبدال بنك الأسئلة الحالي بالأسئلة المستوردة. تابع؟",
          ok: "نعم، استورد"
        }).then((confirmed) => {
          if (!confirmed) return;
          state.questions = clean;
          saveQuestions();
          renderEditor();
          flashSaved();
          toast("تم استيراد " + toAr(clean.length) + " سؤالًا بنجاح.", "success");
        });
      } catch (error) {
        toast("ملف غير صالح. تأكد من أنه ملف JSON مُصدَّر من اللعبة.", "error");
      }
    };
    reader.readAsText(file, "utf-8");
    ui.importFile.value = "";
  }

  function clearLeaderboard() {
    askConfirm({
      icon: "🧹",
      title: "مسح سجل المتصدرين؟",
      text: "سيتم حذف كل النتائج وأفضل الدرجات من هذا المتصفح. لا يمكن التراجع.",
      ok: "نعم، امسح"
    }).then((confirmed) => {
      if (!confirmed) return;
      store.remove(KEYS.leaderboard);
      store.remove(KEYS.best);
      state.lastEntryId = null;
      renderBoardRows(ui.leaderboardList, [], null, "تم مسح السجل. ابدأ من جديد!");
      renderMiniBoard();
      toast("تم مسح سجل المتصدرين.", "info");
    });
  }

  /* =========================================================
     ١٦ — ربط الأحداث
     ========================================================= */
  function bindEvents() {
    ui.startForm.addEventListener("submit", handleStart);

    ui.playerName.addEventListener("input", () => {
      ui.nameError.hidden = true;
      setNameInvalid(false);
    });

    ui.brandHome.addEventListener("click", () => {
      leaveQuiz(() => setScreen("start"));
    });

    ui.editorBtn.addEventListener("click", () => {
      leaveQuiz(() => setScreen("editor"));
    });

    ui.startEditorBtn.addEventListener("click", () => setScreen("editor"));
    ui.stagesBack.addEventListener("click", () => setScreen("start"));
    ui.editorBack.addEventListener("click", () => setScreen("start"));

    ui.leaderboardBtn.addEventListener("click", openLeaderboard);
    ui.miniBoardBtn.addEventListener("click", openLeaderboard);

    ui.howBtn.addEventListener("click", () => openModal(ui.howModal));

    ui.soundBtn.addEventListener("click", toggleSound);
    ui.fullscreenBtn.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", updateFullscreenButton);

    ui.stageGrid.addEventListener("click", (event) => {
      const card = event.target.closest(".stage-card");
      if (card && card.dataset.stage) startStage(card.dataset.stage);
    });

    ui.stageGrid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".stage-card");
      if (!card || !card.dataset.stage) return;
      event.preventDefault();
      startStage(card.dataset.stage);
    });

    ui.randomStageBtn.addEventListener("click", randomStage);

    ui.quitBtn.addEventListener("click", () => {
      leaveQuiz(() => {
        setScreen("stages");
      });
    });

    ui.optionsWrap.addEventListener("click", (event) => {
      const button = event.target.closest(".option");
      if (!button || button.disabled || button.classList.contains("is-eliminated")) return;
      const index = Number(button.dataset.index);
      if (Number.isInteger(index)) handleAnswer(index);
      else Sound.click();
    });

    ui.nextBtn.addEventListener("click", goNext);
    ui.hintBtn.addEventListener("click", useHint);

    ui.wordsWrap.addEventListener("click", (event) => {
      if (state.answered || state.wordsLocked) return;
      const chip = event.target.closest(".word-chip");
      if (!chip) return;
      const id = chip.dataset.wordId;
      if (!id) return;

      if (chip.dataset.add === "1") {
        if (!state.wordsSelected.includes(id)) state.wordsSelected.push(id);
        Sound.click();
      } else if (chip.dataset.remove === "1") {
        state.wordsSelected = state.wordsSelected.filter((item) => item !== id);
        Sound.click();
      }
      renderWordsState();
    });

    ui.clearWords.addEventListener("click", () => {
      if (state.answered) return;
      state.wordsSelected = [];
      renderWordsState();
      Sound.click();
    });

    ui.checkWords.addEventListener("click", evaluateWords);

    ui.replayBtn.addEventListener("click", () => {
      if (state.stage) startStage(state.stage.id);
    });

    ui.otherStagesBtn.addEventListener("click", () => setScreen("stages"));
    ui.homeBtn.addEventListener("click", () => setScreen("start"));
    ui.shareBtn.addEventListener("click", shareResult);

    ui.addQuestionBtn.addEventListener("click", () => openQuestionModal(null));
    ui.stageFilter.addEventListener("change", renderEditor);
    ui.questionSearch.addEventListener("input", renderEditor);
    ui.questionList.addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit]");
      const remove = event.target.closest("[data-delete]");
      if (edit) openQuestionModal(edit.dataset.edit);
      else if (remove) deleteQuestion(remove.dataset.delete);
    });

    ui.fType.addEventListener("change", syncFormFields);
    [ui.fOpt0, ui.fOpt1, ui.fOpt2, ui.fOpt3].forEach((input) => {
      input.addEventListener("input", () => {
        if (ui.fType.value === "truefalse") return;
        const selected = Number(ui.fAnswer.value) || 0;
        fillAnswerSelect(optionValues(), selected);
      });
    });

    ui.fStage.addEventListener("change", () => {
      if (ui.fId.value) return;
      const stage = STAGE_BY_ID.get(ui.fStage.value);
      if (!stage) return;
      ui.fTime.value = stage.time;
      ui.fPoints.value = stage.points;
    });

    ui.questionForm.addEventListener("submit", saveQuestion);

    ui.resetQuestionsBtn.addEventListener("click", resetQuestions);
    ui.exportBtn.addEventListener("click", exportQuestions);
    ui.importBtn.addEventListener("click", () => ui.importFile.click());
    ui.importFile.addEventListener("change", () => {
      importQuestions(ui.importFile.files && ui.importFile.files[0]);
    });
    ui.clearBoardBtn.addEventListener("click", clearLeaderboard);

    $$("[data-close-modal]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const modal = trigger.closest(".modal");
        if (modal) closeModal(modal);
      });
    });

    $$("[data-confirm-cancel]").forEach((trigger) => {
      trigger.addEventListener("click", () => settleConfirm(false));
    });
    ui.confirmCancel.addEventListener("click", () => settleConfirm(false));
    ui.confirmOk.addEventListener("click", () => settleConfirm(true));

    document.addEventListener("keydown", handleKeyboard);
    document.addEventListener("pointerdown", () => Sound.init(), { once: true });

    if (window.matchMedia) {
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (motion.addEventListener) {
        motion.addEventListener("change", () => {
          // إعادة تهيئة بسيطة عند تغيير تفضيل الحركة.
        });
      }
    }
  }

  function handleKeyboard(event) {
    const target = event.target;
    const typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    if (event.key === "Escape") {
      const openModals = $$(".modal.is-open");
      if (openModals.length) {
        const top = openModals[openModals.length - 1];
        if (top === ui.confirmModal) settleConfirm(false);
        else closeModal(top);
        event.preventDefault();
      }
      return;
    }

    if (typing) return;

    if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    if (state.activeScreen !== "quiz") return;

    if (event.key === "Enter") {
      if (!ui.nextBtn.hidden) {
        event.preventDefault();
        goNext();
      } else {
        const question = currentQuestion();
        if (question && question.type === "words" && !state.answered) {
          event.preventDefault();
          evaluateWords();
        }
      }
      return;
    }

    const keyMap = { "1": 0, "2": 1, "3": 2, "4": 3, "١": 0, "٢": 1, "٣": 2, "٤": 3 };
    if (Object.prototype.hasOwnProperty.call(keyMap, event.key) && !state.answered) {
      const question = currentQuestion();
      if (!question || question.type === "words") return;
      const index = keyMap[event.key];
      if (index >= question.options.length) return;
      event.preventDefault();
      handleAnswer(index);
    }
  }

  /* =========================================================
     ١٧ — التشغيل
     ========================================================= */
  function init() {
    spawnBackgroundStars();
    populateSelects();
    updateSoundButton();
    updateFullscreenButton();
    fillPlayerInput();

    if (ui.stageFilter.value === "") ui.stageFilter.value = "all";
    if (ui.playerName && !ui.playerName.value) ui.playerName.value = state.player;

    renderMiniBoard();
    renderStages();

    bindEvents();
  }

  init();
})();
