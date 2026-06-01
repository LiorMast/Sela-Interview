import { CameraManager } from './camera.js';
import { AvatarGenerator } from './avatarGenerator.js';
import { GameEngine } from './game.js';

// Application State
const appState = {
  playerName: '',
  capturedPhoto: null, // Base64 JPEG data URL
  avatarUrl: null,     // Generated avatar PNG/JPEG URL
  useApi: false,
  apiKey: '',
  stats: {
    maxMass: 0,
    botsEaten: 0
  }
};

// UI Elements
const DOM = {
  welcomeScreen: document.getElementById('welcome-screen'),
  cameraScreen: document.getElementById('camera-screen'),
  scannerScreen: document.getElementById('scanner-screen'),
  gameHud: document.getElementById('game-hud'),
  gameoverScreen: document.getElementById('gameover-screen'),
  settingsModal: document.getElementById('settings-modal'),
  
  // Buttons
  settingsBtn: document.getElementById('settings-btn'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  settingsSaveBtn: document.getElementById('settings-save-btn'),
  startCaptureBtn: document.getElementById('start-capture-btn'),
  cameraCaptureBtn: document.getElementById('camera-capture-btn'),
  cameraCancelBtn: document.getElementById('camera-cancel-btn'),
  cameraSkipBtn: document.getElementById('camera-skip-btn'),
  scannerNextBtn: document.getElementById('scanner-next-btn'),
  gameoverRetryBtn: document.getElementById('gameover-retry-btn'),
  
  // Input fields
  playerNameInput: document.getElementById('player-name'),
  apiToggleCheckbox: document.getElementById('api-toggle-checkbox'),
  apiKeyInput: document.getElementById('gemini-api-key'),
  apiKeyContainer: document.getElementById('api-key-container'),
  
  // Dynamic Views
  capturedPhotoPreview: document.getElementById('captured-photo-preview'),
  scannerProgress: document.getElementById('scanner-progress'),
  scannerConsole: document.getElementById('scanner-console'),
  aiPipelineName: document.getElementById('ai-pipeline-name'),
  notification: document.getElementById('notification'),
  
  // Stats HUD
  statMass: document.getElementById('stat-mass'),
  statEaten: document.getElementById('stat-eaten'),
  
  // Game over stats
  gameoverStatMass: document.getElementById('gameover-stat-mass'),
  gameoverStatEaten: document.getElementById('gameover-stat-eaten'),
  gameoverAvatarCanvas: document.getElementById('gameover-avatar-canvas')
};

// Initialize Camera Manager
const camera = new CameraManager('camera-stream');

// Initialize Game Engine
let game = null;

// Helpers: Screen Transition routing
function showScreen(screenEl) {
  const screens = [
    DOM.welcomeScreen, DOM.cameraScreen, DOM.scannerScreen, 
    DOM.gameHud, DOM.gameoverScreen
  ];
  screens.forEach(screen => {
    if (screen === screenEl) {
      screen.classList.remove('hidden');
      if (screen === DOM.gameoverScreen) {
        screen.classList.add('active');
      }
    } else {
      screen.classList.add('hidden');
      if (screen === DOM.gameoverScreen) {
        screen.classList.remove('active');
      }
    }
  });
}

// Custom Premium Toast Notification
let toastTimeout = null;
function showToast(message, isWarning = false) {
  clearTimeout(toastTimeout);
  DOM.notification.textContent = message;
  DOM.notification.style.borderColor = isWarning ? 'var(--neon-magenta)' : 'var(--neon-cyan)';
  DOM.notification.style.boxShadow = isWarning 
    ? '0 0 15px rgba(255, 0, 127, 0.35)' 
    : '0 0 15px rgba(0, 242, 254, 0.35)';
  
  DOM.notification.classList.add('active');
  
  toastTimeout = setTimeout(() => {
    DOM.notification.classList.remove('active');
  }, 3500);
}

// Load configurations from Local Storage
function loadSettings() {
  const savedName = localStorage.getItem('facemoji_playerName');
  const savedUseApi = localStorage.getItem('facemoji_useApi') === 'true';
  const savedApiKey = localStorage.getItem('facemoji_apiKey') || '';

  if (savedName) DOM.playerNameInput.value = savedName;
  DOM.apiToggleCheckbox.checked = savedUseApi;
  DOM.apiKeyInput.value = savedApiKey;

  appState.useApi = savedUseApi;
  appState.apiKey = savedApiKey;

  updateApiKeyVisibility();
}

function saveSettings() {
  const name = DOM.playerNameInput.value.trim();
  const useApi = DOM.apiToggleCheckbox.checked;
  const apiKey = DOM.apiKeyInput.value.trim();

  localStorage.setItem('facemoji_playerName', name);
  localStorage.setItem('facemoji_useApi', useApi);
  localStorage.setItem('facemoji_apiKey', apiKey);

  appState.useApi = useApi;
  appState.apiKey = apiKey;

  showToast('Settings Saved Successfully!');
}

function updateApiKeyVisibility() {
  const active = DOM.apiToggleCheckbox.checked;
  if (active) {
    DOM.apiKeyContainer.style.opacity = '1';
    DOM.apiKeyContainer.style.pointerEvents = 'all';
  } else {
    DOM.apiKeyContainer.style.opacity = '0.4';
    DOM.apiKeyContainer.style.pointerEvents = 'none';
  }
}

// Scanner Console Visual Logs
function clearConsole() {
  DOM.scannerConsole.innerHTML = '';
}

function writeConsole(text, isError = false) {
  const line = document.createElement('div');
  line.className = `console-line ${isError ? 'error' : ''}`;
  line.textContent = `> ${text}`;
  DOM.scannerConsole.appendChild(line);
  
  // Auto scroll console
  DOM.scannerConsole.scrollTop = DOM.scannerConsole.scrollHeight;
}

// Binds Setup
function initApp() {
  loadSettings();
  
  // Instantiate core engine
  game = new GameEngine(
    'game-canvas', 
    handleGameOver, 
    handleStatsUpdate
  );

  // Settings triggers
  DOM.settingsBtn.addEventListener('click', () => {
    DOM.settingsModal.classList.add('active');
  });

  DOM.settingsCloseBtn.addEventListener('click', () => {
    DOM.settingsModal.classList.remove('active');
  });

  DOM.apiToggleCheckbox.addEventListener('change', updateApiKeyVisibility);

  DOM.settingsSaveBtn.addEventListener('click', () => {
    saveSettings();
    DOM.settingsModal.classList.remove('active');
  });

  // Welcome Screen -> Create Avatar trigger
  DOM.startCaptureBtn.addEventListener('click', async () => {
    appState.playerName = DOM.playerNameInput.value.trim() || 'Blobby';
    localStorage.setItem('facemoji_playerName', appState.playerName);
    
    DOM.settingsBtn.classList.add('hidden'); // Hide settings gear in-game
    
    // Jump to Camera Capture screen
    showScreen(DOM.cameraScreen);
    
    writeConsole('Initializing Camera Access hardware...');
    const cameraStarted = await camera.start();
    if (!cameraStarted) {
      showToast('Camera blocked or not found. Falling back to default blob.', true);
      handleCameraFailure();
    }
  });

  // Camera Actions
  DOM.cameraCancelBtn.addEventListener('click', () => {
    camera.stop();
    DOM.settingsBtn.classList.remove('hidden');
    showScreen(DOM.welcomeScreen);
  });

  DOM.cameraSkipBtn.addEventListener('click', () => {
    camera.stop();
    appState.capturedPhoto = null;
    startAvatarAIPipeline();
  });

  DOM.cameraCaptureBtn.addEventListener('click', () => {
    const photo = camera.capture(512); // Capture a 512x512 selfie
    camera.stop();
    
    if (photo) {
      appState.capturedPhoto = photo;
      DOM.capturedPhotoPreview.src = photo;
      startAvatarAIPipeline();
    } else {
      showToast('Capture failed. Using default template.', true);
      handleCameraFailure();
    }
  });

  // Scanner Stage: Enter Arena
  DOM.scannerNextBtn.addEventListener('click', () => {
    showScreen(DOM.gameHud);
    game.start(appState.playerName, appState.avatarUrl);
  });

  // Game over retry
  DOM.gameoverRetryBtn.addEventListener('click', () => {
    DOM.settingsBtn.classList.remove('hidden');
    showScreen(DOM.welcomeScreen);
  });
}

function handleCameraFailure() {
  appState.capturedPhoto = null;
  startAvatarAIPipeline();
}

// AI Emoji Pipeline Simulation
async function startAvatarAIPipeline() {
  showScreen(DOM.scannerScreen);
  clearConsole();
  DOM.scannerNextBtn.classList.add('hidden');
  DOM.scannerProgress.style.width = '0%';
  
  DOM.aiPipelineName.textContent = appState.useApi ? 'Google Imagen 3 AI Creator' : 'Procedural Vector Stylizer';
  
  writeConsole('COLLECTING STREAM FRAME SNAPSHOT...');
  await sleep(400);

  if (appState.capturedPhoto) {
    writeConsole('SNAPSHOT RESOLVED: 512x512 JPEG mirr-cropped.');
  } else {
    writeConsole('WARNING: Snapshot empty. Using default vector model.', true);
  }
  await sleep(300);

  let progress = 0;
  const progressInterval = setInterval(() => {
    // Fill up to 75% rapidly, then let the image generator promise finish the final 25%
    if (progress < 75) {
      progress += Math.floor(Math.random() * 8) + 2;
      DOM.scannerProgress.style.width = `${Math.min(75, progress)}%`;
    }
  }, 120);

  try {
    if (appState.useApi) {
      // Gemini Flash / Imagen 3 active API workflow
      const avatarDataUrl = await AvatarGenerator.generateWithGemini(
        appState.capturedPhoto || AvatarGenerator.generateProcedural(null), // Fallback image if skip camera
        appState.apiKey,
        (msg) => writeConsole(msg)
      );
      appState.avatarUrl = avatarDataUrl;
    } else {
      // Procedural Vector Generation
      writeConsole('COMPILING LOCAL STYLIZER ENGINE...');
      await sleep(500);
      writeConsole('RUNNING PIXEL MATRIX HISTOGRAM ANALYSIS...');
      await sleep(600);
      writeConsole('SAMPLING SKIN TONE FIELD COEFFICIENTS...');
      await sleep(500);
      writeConsole('INTERPOLATING HAIR & BACKGROUND LIGHT INDEX...');
      await sleep(400);
      
      const avatarDataUrl = AvatarGenerator.generateProcedural(appState.capturedPhoto);
      appState.avatarUrl = avatarDataUrl;
      
      writeConsole('SUCCESS: Vector Avatar compiled correctly.');
      await sleep(300);
    }
    
    // Complete visual progress bar
    clearInterval(progressInterval);
    DOM.scannerProgress.style.width = '100%';
    await sleep(200);

    // Render generated avatar inside the scanner preview!
    DOM.capturedPhotoPreview.src = appState.avatarUrl;
    writeConsole('AVATAR TEXTURED CORRECTLY. READY TO ENTER GRID.');
    
    // Show Next Button
    DOM.scannerNextBtn.classList.remove('hidden');
    
  } catch (err) {
    clearInterval(progressInterval);
    writeConsole(`CRITICAL PIPELINE ERROR: ${err.message}`, true);
    writeConsole('COMPILING GENERAL PROCEDURAL FALLBACK...', true);
    await sleep(1500);
    
    appState.avatarUrl = AvatarGenerator.generateProcedural(null);
    DOM.scannerProgress.style.width = '100%';
    DOM.capturedPhotoPreview.src = appState.avatarUrl;
    DOM.scannerNextBtn.classList.remove('hidden');
  }
}

// Game Core Callbacks
function handleStatsUpdate(mass, eatenCount) {
  DOM.statMass.textContent = mass;
  DOM.statEaten.textContent = eatenCount;
  
  appState.stats.maxMass = Math.max(appState.stats.maxMass, mass);
  appState.stats.botsEaten = eatenCount;
}

function handleGameOver(finalMass) {
  // Update Game Over text
  DOM.gameoverStatMass.textContent = finalMass;
  DOM.gameoverStatEaten.textContent = appState.stats.botsEaten;

  // Render final avatar into Game Over display circle canvas
  const gCanvas = DOM.gameoverAvatarCanvas;
  const gctx = gCanvas.getContext('2d');
  gctx.clearRect(0, 0, 90, 90);
  
  const img = new Image();
  img.src = appState.avatarUrl;
  img.onload = () => {
    gctx.save();
    gctx.beginPath();
    gctx.arc(45, 45, 43, 0, Math.PI*2);
    gctx.clip();
    gctx.drawImage(img, 0, 0, 90, 90);
    gctx.strokeStyle = '#ff007f'; // Glow border red for defeat
    gctx.lineWidth = 4;
    gctx.stroke();
    gctx.restore();
  };

  showScreen(DOM.gameoverScreen);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load app on document DOM ready
document.addEventListener('DOMContentLoaded', initApp);
