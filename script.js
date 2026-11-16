const POKEAPI_BASE = 'https://pokeapi.co/api/v2';
const SCORE_STORAGE_KEY = 'cores-como-dicas-score';
const ROUND_TIME = 25;
const ALERT_THRESHOLD = 5;

const DIFFICULTY = {
  easy: { attemptsPerPokemon: 2, maxPokemonPerRound: 5, points: 120, colorSpread: 26 },
  normal: { attemptsPerPokemon: 2, maxPokemonPerRound: 5, points: 100, colorSpread: 42 },
  hard: { attemptsPerPokemon: 2, maxPokemonPerRound: 5, points: 150, colorSpread: 16 }
};

const state = {
  mode: 'normal',
  score: 0,
  streak: 0,
  attemptsUsed: 0,
  attemptsPerPokemon: 3,
  roundPokemonCount: 0,
  maxPokemonPerRound: 5,
  current: null,
  availableKits: [],
  correctKitIndex: 0,
  locked: false,
  roundResolved: false,
  timeLeft: ROUND_TIME,
  timerId: null,
  autoAdvanceId: null,
};

const scoreNode = document.getElementById('score');
const streakNode = document.getElementById('streak');
const livesNode = document.getElementById('lives');
const timerNode = document.getElementById('timer');
const statusTimerNode = document.getElementById('status-timer');
const roundTimerNode = document.getElementById('round-timer');
const roundProgressNode = document.getElementById('round-progress');
const timerBarNode = document.getElementById('time-progress-bar');
const nameNode = document.getElementById('pokemon-name');
const spriteNode = document.getElementById('pokemon-sprite');
const colorGrid = document.getElementById('color-grid');
const feedbackNode = document.getElementById('feedback');
const nextButton = document.getElementById('next-round');
const modeButtons = document.querySelectorAll('.mode-button');
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const resultOverlay = document.getElementById('result-overlay');
const resultTitle = document.getElementById('result-title');
const resultSubtitle = document.getElementById('result-subtitle');
const resultPoints = document.getElementById('result-points');
const resultStreak = document.getElementById('result-streak');
const resultParticles = document.getElementById('result-particles');
const resultClock = document.getElementById('result-clock');

function setFeedback(message, type = '') {
  feedbackNode.textContent = message;
  feedbackNode.className = 'feedback';
  if (type) {
    feedbackNode.classList.add(type);
  }
}

function setScreen(mode) {
  if (mode === 'game') {
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
  } else {
    gameScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  }
}

function getStoredScore() {
  try {
    const saved = Number.parseInt(localStorage.getItem(SCORE_STORAGE_KEY) || '0', 10);
    return Number.isFinite(saved) ? saved : 0;
  } catch (error) {
    return 0;
  }
}

function saveScore() {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, String(state.score));
  } catch (error) {
    // Ignora falhas de armazenamento do navegador.
  }
}

function updateHud() {
  scoreNode.textContent = String(state.score);
  streakNode.textContent = String(state.streak);
  livesNode.textContent = String(Math.max(0, state.attemptsPerPokemon - state.attemptsUsed));
  timerNode.textContent = `${state.timeLeft}s`;
  if (statusTimerNode) {
    statusTimerNode.textContent = `${state.timeLeft}s`;
  }
  if (roundTimerNode) {
    roundTimerNode.textContent = `${state.timeLeft}s`;
  }
  if (timerBarNode) {
    const percentage = Math.max(0, (state.timeLeft / ROUND_TIME) * 100);
    timerBarNode.style.width = `${percentage}%`;
    timerBarNode.classList.toggle('warning', state.timeLeft <= ALERT_THRESHOLD);
  }
  roundProgressNode.textContent = `${Math.min(state.roundPokemonCount, state.maxPokemonPerRound)}/${state.maxPokemonPerRound}`;
  saveScore();
}

function clearRoundTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function clearAutoAdvance() {
  if (state.autoAdvanceId) {
    clearTimeout(state.autoAdvanceId);
    state.autoAdvanceId = null;
  }
}

function createParticles(count = 26) {
  if (!resultParticles) return;

  resultParticles.innerHTML = '';

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'particle';

    const angle = (index / count) * Math.PI * 2;
    const distance = 90 + (index % 5) * 24;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const driftX = (Math.random() - 0.5) * 180;
    const driftY = (Math.random() - 0.5) * 180;
    const size = 6 + (index % 7) * 4;
    const colorPalette = ['#22c55e', '#facc15', '#fb7185', '#f97316', '#38bdf8', '#f472b6', '#fbbf24', '#a3e635', '#f9a8d4'];

    particle.style.setProperty('--x', `${x}px`);
    particle.style.setProperty('--y', `${y}px`);
    particle.style.setProperty('--dx', `${driftX}px`);
    particle.style.setProperty('--dy', `${driftY}px`);
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--delay', `${(index * 0.04).toFixed(2)}s`);
    particle.style.setProperty('--duration', `${(1.1 + (index % 8) * 0.18).toFixed(2)}s`);
    particle.style.setProperty('--rotation', `${(Math.random() * 360).toFixed(0)}deg`);
    particle.style.background = colorPalette[index % colorPalette.length];

    resultParticles.appendChild(particle);
  }
}

function showResultOverlay(type, { title, subtitle, points = null, streak = null } = {}) {
  if (!resultOverlay || !resultTitle || !resultSubtitle || !resultPoints || !resultStreak) return;

  resultOverlay.classList.remove('hidden');
  resultOverlay.classList.remove('success', 'error', 'timeout');
  resultOverlay.classList.add(type);
  resultOverlay.style.pointerEvents = type === 'error' ? 'auto' : 'none';
  resultTitle.textContent = title || 'ACERTOU!';
  resultSubtitle.textContent = subtitle || 'Você mandou muito bem!';

  resultPoints.textContent = points !== null ? `+${points} pts` : '+0 pts';
  resultStreak.textContent = streak !== null ? `Streak ${streak}` : 'Streak 0';

  const isSuccess = type === 'success';
  const isTimeout = type === 'timeout';

  if (isTimeout) {
    resultClock.classList.add('visible');
  } else {
    resultClock.classList.remove('visible');
  }

  if (isSuccess) {
    createParticles(48);
  } else if (isTimeout) {
    createParticles(38);
  } else {
    resultParticles.innerHTML = '';
  }

  void resultOverlay.offsetWidth;
  resultOverlay.classList.add('active');

  if (type === 'error') {
    resultOverlay.onclick = () => {
      hideResultOverlay();
    };

    setTimeout(() => {
      if (resultOverlay.classList.contains('error')) {
        hideResultOverlay();
      }
    }, 420);
  } else {
    resultOverlay.onclick = null;
  }
}

function hideResultOverlay() {
  if (!resultOverlay) return;

  resultOverlay.onclick = null;
  resultOverlay.style.pointerEvents = 'none';
  resultOverlay.classList.remove('active');
  resultClock.classList.remove('visible');
  resultParticles.innerHTML = '';
  setTimeout(() => {
    resultOverlay.classList.add('hidden');
    resultOverlay.classList.remove('success', 'error', 'timeout');
  }, 260);
}

function animateRoundResult(type) {
  const gamePanel = document.getElementById('game-screen');
  const resultMap = {
    success: {
      title: 'ACERTOU!',
      subtitle: 'Você mandou muito bem!',
    },
    error: {
      title: 'ERROU!',
      subtitle: 'Essa não era a combinação correta!',
    },
    timeout: {
      title: 'TEMPO ESGOTADO!',
      subtitle: 'Não foi dessa vez! Vamos para o próximo?',
    },
  };

  const custom = resultMap[type] || resultMap.success;

  gamePanel.classList.remove('success', 'error', 'timeout');
  void gamePanel.offsetWidth;
  gamePanel.classList.add(type);

  if (type === 'success') {
    showResultOverlay(type, {
      title: custom.title,
      subtitle: custom.subtitle,
      points: Math.max(50, Math.round(DIFFICULTY[state.mode].points + (state.timeLeft * 5))),
      streak: state.streak,
    });
  } else if (type === 'error') {
    showResultOverlay(type, {
      title: custom.title,
      subtitle: custom.subtitle,
      points: 0,
      streak: state.streak,
    });
  } else {
    showResultOverlay(type, {
      title: custom.title,
      subtitle: custom.subtitle,
      points: 0,
      streak: 0,
    });
  }

  setTimeout(() => {
    gamePanel.classList.remove(type);
  }, 520);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const normalized = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const number = Number.parseInt(normalized, 16);

  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function shiftHex(hex, deltaH = 0, deltaS = 0, deltaL = 0) {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = 0;
    s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  const hue = ((h * 360 + deltaH + 360) % 360) / 360;
  const saturation = Math.max(0, Math.min(1, s + deltaS));
  const lightness = Math.max(0, Math.min(1, l + deltaL));

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((hue * 6 % 2) - 1));
  const m = lightness - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  const segment = Math.floor(hue * 6);
  switch (segment) {
    case 0: r1 = c; g1 = x; b1 = 0; break;
    case 1: r1 = x; g1 = c; b1 = 0; break;
    case 2: r1 = 0; g1 = c; b1 = x; break;
    case 3: r1 = 0; g1 = x; b1 = c; break;
    case 4: r1 = x; g1 = 0; b1 = c; break;
    default: r1 = c; g1 = 0; b1 = x; break;
  }

  return rgbToHex(Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255));
}

function shuffleArray(items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[randomIndex]] = [cloned[randomIndex], cloned[index]];
  }
  return cloned;
}

function padKit(colors, targetLength = 5) {
  const unique = [];
  const seen = new Set();

  colors.forEach((color) => {
    if (!seen.has(color)) {
      seen.add(color);
      unique.push(color);
    }
  });

  while (unique.length < targetLength) {
    const base = unique[unique.length % unique.length] || colors[0];
    const next = shiftHex(base, (unique.length + 1) * 8, 0.03, 0.04);
    if (!seen.has(next)) {
      seen.add(next);
      unique.push(next);
    }
  }

  return unique.slice(0, targetLength);
}

function createKit(hex, hueOffset, saturationOffset, lightnessOffset) {
  const kit = [];
  for (let index = 0; index < 5; index += 1) {
    const hueShift = hueOffset + (index - 2) * 14;
    const saturationShift = saturationOffset + (index % 2 === 0 ? 0.08 : -0.06);
    const lightnessShift = lightnessOffset + (index - 2) * 0.04;
    kit.push(shiftHex(hex, hueShift, saturationShift, lightnessShift));
  }
  return padKit(kit, 5);
}

function samePalette(a, b) {
  if (a.length !== b.length) return false;
  return a.every((color, index) => color.toLowerCase() === b[index].toLowerCase());
}

function buildPokemonKits(correctHex) {
  const rightKit = createKit(correctHex, 0, 0, 0);
  const wrongKits = [
    createKit(shiftHex(correctHex, 18, 0.05, 0.10), 12, 0.04, 0.05),
    createKit(shiftHex(correctHex, -24, -0.07, 0.08), -18, -0.03, 0.06),
    createKit(shiftHex(correctHex, 42, -0.08, -0.04), 36, -0.05, -0.05),
  ];

  const kits = shuffleArray([rightKit, ...wrongKits]);
  const correctIndex = kits.findIndex((kit) => samePalette(kit, rightKit));

  return { kits, correctIndex, rightKit };
}

function pickPokemonId() {
  return Math.floor(Math.random() * 898) + 1;
}

async function fetchPokemonData(id) {
  const [pokemonRes, speciesRes] = await Promise.all([
    fetch(`${POKEAPI_BASE}/pokemon/${id}`),
    fetch(`${POKEAPI_BASE}/pokemon-species/${id}`),
  ]);

  if (!pokemonRes.ok || !speciesRes.ok) {
    throw new Error('Falha ao carregar Pokémon.');
  }

  const [pokemon, species] = await Promise.all([
    pokemonRes.json(),
    speciesRes.json(),
  ]);

  const officialColor = species.color?.name || 'normal';
  const colorHex = getSpeciesColorHex(officialColor);
  const artwork = pokemon.sprites.other['official-artwork']?.front_default || pokemon.sprites.front_default;

  return {
    id,
    name: pokemon.name,
    artwork,
    officialColor,
    officialHex: colorHex,
  };
}

function getSpeciesColorHex(colorName) {
  const map = {
    black: '#1F2937',
    blue: '#3B82F6',
    brown: '#8B5E3C',
    gray: '#94A3B8',
    green: '#22C55E',
    pink: '#FFB7C5',
    purple: '#754283',
    red: '#EF4444',
    white: '#F8FAFC',
    yellow: '#F7D02C',
  };

  return map[colorName] || '#8B5E3C';
}

function revealPokemonAppearance() {
  spriteNode.classList.remove('silhouette');
  spriteNode.classList.add('revealed');
  spriteNode.style.filter = 'brightness(1) saturate(1.2) contrast(1.05)';
}

function hidePokemonAppearance() {
  spriteNode.classList.add('silhouette');
  spriteNode.classList.remove('revealed');
  spriteNode.style.filter = 'brightness(0)';
}

function renderKitOptions() {
  colorGrid.innerHTML = '';

  state.availableKits.forEach((kit, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kit-option';
    button.dataset.kitIndex = String(index);
    button.setAttribute('aria-label', `Kit ${index + 1}`);

    const swatches = document.createElement('div');
    swatches.className = 'kit-swatches';

    kit.forEach((color) => {
      const swatch = document.createElement('span');
      swatch.className = 'kit-swatch';
      swatch.style.background = color;
      swatch.title = color;
      swatches.appendChild(swatch);
    });

    const label = document.createElement('span');
    label.className = 'kit-label';
    label.textContent = `Kit ${String.fromCharCode(65 + index)}`;

    button.appendChild(swatches);
    button.appendChild(label);
    button.addEventListener('click', () => handleKitSelection(index, button));
    colorGrid.appendChild(button);
  });
}

function scheduleNextRound(delay = 1500) {
  clearAutoAdvance();
  state.autoAdvanceId = setTimeout(() => {
    nextRound();
  }, delay);
}

function handleCorrectAnswer(selectedButton) {
  clearRoundTimer();
  clearAutoAdvance();
  state.roundResolved = true;
  state.locked = true;
  state.streak += 1;

  const basePoints = DIFFICULTY[state.mode].points;
  const timeBonus = state.timeLeft * 5;
  const pointsEarned = Math.max(50, Math.round(basePoints + timeBonus));
  state.score += pointsEarned;

  revealPokemonAppearance();
  selectedButton.classList.add('correct-kit');
  animateRoundResult('success');
  setFeedback(`Muito bem! Você acertou! +${pointsEarned} pontos.`, 'success');
  updateHud();
  scheduleNextRound(1400);
}

function handleWrongAnswer(selectedButton) {
  if (state.roundResolved) return;

  state.attemptsUsed += 1;
  updateHud();

  selectedButton.classList.add('wrong-kit');
  setTimeout(() => selectedButton.classList.remove('wrong-kit'), 380);

  if (state.attemptsUsed >= state.attemptsPerPokemon) {
    clearRoundTimer();
    clearAutoAdvance();
    state.roundResolved = true;
    state.locked = true;
    state.streak = 0;

    revealPokemonAppearance();
    const correctButton = Array.from(colorGrid.children).find(
      (button) => Number(button.dataset.kitIndex) === state.correctKitIndex
    );

    if (correctButton) {
      correctButton.classList.add('correct-kit');
    }

    animateRoundResult('error');
    setFeedback('Você errou duas vezes! Próximo Pokémon.', 'error');
    updateHud();
    scheduleNextRound(1300);
    return;
  }

  animateRoundResult('error');
  setFeedback('Ops! Essa não é a combinação correta.', 'error');
}

function handleKitSelection(index, button) {
  if (state.locked || state.roundResolved) return;

  if (index === state.correctKitIndex) {
    handleCorrectAnswer(button);
    return;
  }

  handleWrongAnswer(button);
}

function handleTimeExpired() {
  if (state.locked || state.roundResolved) return;

  clearRoundTimer();
  state.roundResolved = true;
  state.locked = true;
  state.streak = 0;
  revealPokemonAppearance();
  animateRoundResult('timeout');

  const correctButton = Array.from(colorGrid.children).find(
    (button) => Number(button.dataset.kitIndex) === state.correctKitIndex
  );

  if (correctButton) {
    correctButton.classList.add('correct-kit');
  }

  setFeedback('Tempo esgotado! A paleta correta foi revelada.', 'error');
  updateHud();
  scheduleNextRound(1800);
}

function startRoundTimer() {
  clearRoundTimer();
  state.timeLeft = ROUND_TIME;
  updateHud();

  state.timerId = setInterval(() => {
    if (state.locked || state.roundResolved) {
      clearRoundTimer();
      return;
    }

    state.timeLeft -= 1;
    updateHud();

    if (state.timeLeft <= 0) {
      clearRoundTimer();
      handleTimeExpired();
    }
  }, 1000);
}

async function startRound() {
  try {
    hideResultOverlay();
    clearRoundTimer();
    clearAutoAdvance();

    const id = pickPokemonId();
    const pokemon = await fetchPokemonData(id);

    state.current = pokemon;
    state.locked = false;
    state.roundResolved = false;
    state.attemptsUsed = 0;

    const { kits, correctIndex } = buildPokemonKits(pokemon.officialHex);
    state.availableKits = kits;
    state.correctKitIndex = correctIndex;

    nameNode.textContent = pokemon.name;
    spriteNode.src = pokemon.artwork;
    hidePokemonAppearance();
    spriteNode.alt = pokemon.name;

    renderKitOptions();
    setFeedback(`Pokémon ${state.roundPokemonCount + 1} de ${state.maxPokemonPerRound}. Descubra a paleta correta.`, '');
    startRoundTimer();
    updateHud();
  } catch (error) {
    setFeedback('Não foi possível carregar o Pokémon. Tente outra rodada.', 'error');
  }
}

function nextRound() {
  hideResultOverlay();
  clearAutoAdvance();
  clearRoundTimer();
  state.locked = false;
  state.roundResolved = false;

  if (state.roundPokemonCount >= state.maxPokemonPerRound) {
    state.streak = 0;
    state.roundPokemonCount = 0;
    setScreen('start');
    setFeedback('Escolha o nível para começar outra rodada.', '');
    return;
  }

  state.roundPokemonCount += 1;
  startRound();
}

function startGame(mode) {
  state.mode = mode;
  state.streak = 0;
  state.roundPokemonCount = 0;
  state.attemptsPerPokemon = DIFFICULTY[mode].attemptsPerPokemon;
  state.maxPokemonPerRound = DIFFICULTY[mode].maxPokemonPerRound;
  setScreen('game');
  nextButton.textContent = 'Próximo Pokémon';
  nextButton.classList.add('hidden');
  startRound();
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => startGame(button.dataset.mode));
});

nextButton.addEventListener('click', () => {
  if (!state.locked) return;
  nextRound();
});

state.score = getStoredScore();
updateHud();
setScreen('start');
