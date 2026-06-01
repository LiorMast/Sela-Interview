import { io } from 'socket.io-client';
import { CameraManager } from './camera.js';
import { AvatarGenerator } from './avatarGenerator.js';
import { GameEngine } from './game.js';
import { ENABLE_MULTIPLAYER } from './config.js';

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
  },
  hasEnteredArena: false,

  // Multiplayer room states
  roomMode: 'public', // 'public' or 'custom'
  targetRoomCode: '',
  currentRoomCode: '',
  privateRoom: false,
  publicRooms: []
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
  playCachedBtn: document.getElementById('play-cached-btn'),
  scannerSkipAiBtn: document.getElementById('scanner-skip-ai-btn'),
  
  // Room Selectors
  quickPlayBtn: document.getElementById('quick-play-btn'),
  customLobbyBtn: document.getElementById('custom-lobby-btn'),
  customLobbySettings: document.getElementById('custom-lobby-settings'),
  roomCodeInput: document.getElementById('room-code-input'),
  joinCodeBtn: document.getElementById('join-code-btn'),
  privateRoomCheckbox: document.getElementById('private-room-checkbox'),
  lobbyRoomInfo: document.getElementById('lobby-room-info'),
  lobbyRoomDisplay: document.getElementById('lobby-room-display'),
  copyLinkBtn: document.getElementById('copy-link-btn'),

  // Input fields
  playerNameInput: document.getElementById('player-name'),
  apiKeyInput: document.getElementById('gemini-api-key'),
  apiKeyContainer: document.getElementById('api-key-container'),
  
  // Dynamic Views
  capturedPhotoPreview: document.getElementById('captured-photo-preview'),
  scannerProgress: document.getElementById('scanner-progress'),
  scannerConsole: document.getElementById('scanner-console'),
  aiPipelineName: document.getElementById('ai-pipeline-name'),
  notification: document.getElementById('notification'),
  cachedAvatarContainer: document.getElementById('cached-avatar-container'),
  cachedAvatarPreview: document.getElementById('cached-avatar-preview'),
  
  // Stats HUD
  statMass: document.getElementById('stat-mass'),
  statEaten: document.getElementById('stat-eaten'),
  
  // Game over stats
  gameoverStatMass: document.getElementById('gameover-stat-mass'),
  gameoverStatEaten: document.getElementById('gameover-stat-eaten'),
  gameoverAvatarCanvas: document.getElementById('gameover-avatar-canvas')
};

// Connect to game WebSocket server (detect host dynamic port mappings)
let socket = null;
if (ENABLE_MULTIPLAYER) {
  const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : window.location.origin;
  socket = io(socketUrl);

  // Socket Event Handlers
  socket.on('connect', () => {
    console.log('Connected to game WebSocket server:', socket.id);
  });

  socket.on('public_rooms_list', (list) => {
    appState.publicRooms = list;
  });

  socket.on('join_error', (data) => {
    showToast(data.message, true);
    appState.hasEnteredArena = false;
    showScreen(DOM.welcomeScreen);
    DOM.settingsBtn.classList.remove('hidden');
  });

  socket.on('join_success', (data) => {
    appState.currentRoomCode = data.code;
    appState.hasEnteredArena = true;
    
    // Display Share invite link indicators
    DOM.lobbyRoomDisplay.textContent = data.code;
    DOM.lobbyRoomInfo.classList.remove('hidden');
    
    // Swap viewport screen state
    showScreen(DOM.gameHud);
    
    // Start 2D Canvas Engine synchronously
    game.start(data.code, data.playerId, data.food, data.powerups, socket);
  });
}

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
  const savedApiKey = localStorage.getItem('facemoji_apiKey') || '';
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  if (savedName) DOM.playerNameInput.value = savedName;
  DOM.apiKeyInput.value = savedApiKey;

  appState.apiKey = savedApiKey || envKey;
  appState.useApi = !!appState.apiKey;
}

function saveSettings() {
  const name = DOM.playerNameInput.value.trim();
  const apiKey = DOM.apiKeyInput.value.trim();
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  localStorage.setItem('facemoji_playerName', name);
  localStorage.setItem('facemoji_apiKey', apiKey);

  appState.playerName = name;
  appState.apiKey = apiKey || envKey;
  appState.useApi = !!appState.apiKey;

  showToast('Settings Saved Successfully!');
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
  checkAndDisplayCachedAvatar();
  
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

  DOM.settingsSaveBtn.addEventListener('click', () => {
    saveSettings();
    DOM.settingsModal.classList.remove('active');
  });

  // Hide room manager UI if multiplayer is disabled
  if (!ENABLE_MULTIPLAYER) {
    const roomSetup = document.getElementById('room-setup-container');
    if (roomSetup) roomSetup.style.display = 'none';
    const customLobby = document.getElementById('custom-lobby-settings');
    if (customLobby) customLobby.style.display = 'none';
    const lobbyRoomInfo = document.getElementById('lobby-room-info');
    if (lobbyRoomInfo) lobbyRoomInfo.style.display = 'none';
  } else {
    // Multiplayer room selection toggles
    DOM.quickPlayBtn.addEventListener('click', () => {
      appState.roomMode = 'public';
      DOM.quickPlayBtn.classList.add('active');
      DOM.customLobbyBtn.classList.remove('active');
      DOM.customLobbySettings.classList.add('hidden');
    });

    DOM.customLobbyBtn.addEventListener('click', () => {
      appState.roomMode = 'custom';
      DOM.customLobbyBtn.classList.add('active');
      DOM.quickPlayBtn.classList.remove('active');
      DOM.customLobbySettings.classList.remove('hidden');
    });

    // Custom Join button click triggers immediate connection
    DOM.joinCodeBtn.addEventListener('click', () => {
      const code = DOM.roomCodeInput.value.trim().toUpperCase();
      if (code.length === 4) {
        appState.roomMode = 'custom';
        appState.targetRoomCode = code;
        showToast(`Custom room code locked: ${code}. Take your selfie!`);
      } else {
        showToast('Please enter a valid 4-letter code!', true);
      }
    });

    // Clipboard Copier shareable link triggers
    DOM.copyLinkBtn.addEventListener('click', () => {
      if (!appState.currentRoomCode) return;
      const inviteUrl = `${window.location.origin}/?room=${appState.currentRoomCode}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        DOM.copyLinkBtn.textContent = 'Copied!';
        DOM.copyLinkBtn.style.borderColor = 'var(--neon-green)';
        DOM.copyLinkBtn.style.color = 'var(--neon-green)';
        showToast('Invite link copied to clipboard!');
        
        setTimeout(() => {
          DOM.copyLinkBtn.textContent = 'Copy Link';
          DOM.copyLinkBtn.style.borderColor = 'rgba(0, 242, 254, 0.35)';
          DOM.copyLinkBtn.style.color = '';
        }, 2500);
      }).catch(err => {
        showToast('Copy failed, please highlight manually!', true);
      });
    });
  }

  // Welcome Screen -> Create Avatar trigger
  DOM.startCaptureBtn.addEventListener('click', async () => {
    appState.playerName = DOM.playerNameInput.value.trim() || 'Blobby';
    localStorage.setItem('facemoji_playerName', appState.playerName);
    appState.hasEnteredArena = false; // Reset arena entry state
    
    DOM.settingsBtn.classList.add('hidden'); // Hide settings gear in-game
    
    // Jump to Camera Capture screen
    showScreen(DOM.cameraScreen);
    
    writeConsole('Initializing Camera Access hardware...');
    const cameraStarted = await camera.start();
    if (!cameraStarted) {
      showToast('Camera blocked or not found. Entering arena with default blob.', true);
      launchWithDefaultBlob();
    }
  });

  // Camera Actions
  DOM.cameraCancelBtn.addEventListener('click', () => {
    camera.stop();
    DOM.settingsBtn.classList.remove('hidden');
    showScreen(DOM.welcomeScreen);
  });

  DOM.cameraSkipBtn.addEventListener('click', () => {
    launchWithDefaultBlob();
  });

  DOM.cameraCaptureBtn.addEventListener('click', () => {
    const photo = camera.capture(512); // Capture a 512x512 selfie
    camera.stop();
    
    if (photo) {
      appState.capturedPhoto = photo;
      DOM.capturedPhotoPreview.src = photo;
      startAvatarAIPipeline();
    } else {
      showToast('Capture failed. Entering arena with default blob.', true);
      handleCameraFailure();
    }
  });

  // Scanner Stage: Enter Arena
  DOM.scannerNextBtn.addEventListener('click', () => {
    if (ENABLE_MULTIPLAYER) {
      initiateMultiplayerConnection();
    } else {
      appState.hasEnteredArena = true;
      showScreen(DOM.gameHud);
      game.start(appState.playerName, appState.avatarUrl);
    }
  });

  // Skip AI generation during pipeline scan
  DOM.scannerSkipAiBtn.addEventListener('click', () => {
    launchWithDefaultBlob();
  });

  // Play with cached avatar
  DOM.playCachedBtn.addEventListener('click', () => {
    appState.playerName = DOM.playerNameInput.value.trim() || 'Blobby';
    localStorage.setItem('facemoji_playerName', appState.playerName);
    appState.avatarUrl = localStorage.getItem('facemoji_cachedAvatar');
    
    if (ENABLE_MULTIPLAYER) {
      initiateMultiplayerConnection();
    } else {
      appState.hasEnteredArena = true;
      DOM.settingsBtn.classList.add('hidden');
      showScreen(DOM.gameHud);
      game.start(appState.playerName, appState.avatarUrl);
    }
  });

  // Game over retry
  DOM.gameoverRetryBtn.addEventListener('click', () => {
    confetti.stop(); // Stop any active confetti showers!
    DOM.settingsBtn.classList.remove('hidden');
    appState.hasEnteredArena = false; // Reset
    showScreen(DOM.welcomeScreen);
    checkAndDisplayCachedAvatar(); // Check if newly generated cached avatar is available!
    renderLobbyLeaderboard(); // Update lobby highscores board!
  });

  // Dynamically update rank highlights when player edits their name
  DOM.playerNameInput.addEventListener('input', () => {
    renderLobbyLeaderboard();
  });

  // Initial render of all-time champions
  renderLobbyLeaderboard();

  if (ENABLE_MULTIPLAYER) {
    // Check URL parameters for active invite room code
    const urlParams = new URLSearchParams(window.location.search);
    const inviteCode = urlParams.get('room');
    if (inviteCode) {
      const cleanInvite = inviteCode.trim().toUpperCase();
      if (cleanInvite.length === 4) {
        appState.roomMode = 'custom';
        appState.targetRoomCode = cleanInvite;
        DOM.roomCodeInput.value = cleanInvite;
        
        // Select Custom Arena visual tabs
        DOM.customLobbyBtn.classList.add('active');
        DOM.quickPlayBtn.classList.remove('active');
        DOM.customLobbySettings.classList.remove('hidden');
        
        showToast(`Custom invite room code locked: ${cleanInvite}!`);
      }
    }
  }
}

function checkAndDisplayCachedAvatar() {
  const cachedAvatar = localStorage.getItem('facemoji_cachedAvatar');
  if (cachedAvatar) {
    DOM.cachedAvatarPreview.src = cachedAvatar;
    DOM.cachedAvatarContainer.classList.remove('hidden');
  } else {
    DOM.cachedAvatarContainer.classList.add('hidden');
  }
}

function launchWithDefaultBlob() {
  if (appState.hasEnteredArena) return;
  camera.stop();
  appState.avatarUrl = appState.capturedPhoto || AvatarGenerator.generateProcedural(null);
  
  if (ENABLE_MULTIPLAYER) {
    initiateMultiplayerConnection();
  } else {
    appState.hasEnteredArena = true;
    showScreen(DOM.gameHud);
    game.start(appState.playerName, appState.avatarUrl);
  }
}

function handleCameraFailure() {
  launchWithDefaultBlob();
}

function initiateMultiplayerConnection() {
  if (appState.hasEnteredArena) return; // Prevent double trigger
  camera.stop();

  appState.playerName = DOM.playerNameInput.value.trim() || 'Blobby';
  localStorage.setItem('facemoji_playerName', appState.playerName);

  if (!appState.avatarUrl) {
    appState.avatarUrl = appState.capturedPhoto || AvatarGenerator.generateProcedural(null);
  }

  DOM.settingsBtn.classList.add('hidden');

  // 1. PUBLIC MATCHMAKING MODE
  if (appState.roomMode === 'public') {
    const availableRoom = appState.publicRooms.find(r => r.playerCount < r.maxPlayers);
    if (availableRoom) {
      showToast(`Joining Active Public Arena: ${availableRoom.code}...`);
      socket.emit('join_room', { 
        code: availableRoom.code, 
        playerName: appState.playerName, 
        avatarUrl: appState.avatarUrl 
      });
    } else {
      showToast('Launching new Arena lobby...');
      socket.emit('create_room', { 
        playerName: appState.playerName, 
        avatarUrl: appState.avatarUrl, 
        isPublic: true 
      });
    }
  } 
  // 2. CUSTOM OR PRIVATE ROOM MODE
  else {
    const code = DOM.roomCodeInput.value.trim().toUpperCase();
    if (code) {
      showToast(`Connecting to Arena ${code}...`);
      socket.emit('join_room', { 
        code: code, 
        playerName: appState.playerName, 
        avatarUrl: appState.avatarUrl 
      });
    } else {
      showToast('Hosting new Custom Arena...');
      socket.emit('create_room', { 
        playerName: appState.playerName, 
        avatarUrl: appState.avatarUrl, 
        isPublic: !DOM.privateRoomCheckbox.checked 
      });
    }
  }
}

// AI Emoji Pipeline Simulation
async function startAvatarAIPipeline() {
  appState.hasEnteredArena = false;
  
  showScreen(DOM.scannerScreen);
  clearConsole();
  DOM.scannerNextBtn.classList.add('hidden');
  DOM.scannerProgress.style.width = '0%';
  
  DOM.aiPipelineName.textContent = appState.useApi ? 'Google Gemini Flash-Image' : 'Procedural Vector Stylizer';
  
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
    if (progress < 75) {
      progress += Math.floor(Math.random() * 8) + 2;
      DOM.scannerProgress.style.width = `${Math.min(75, progress)}%`;
    }
  }, 120);

  // Background promise generation
  const generateAvatarPromise = (async () => {
    if (appState.useApi) {
      return await AvatarGenerator.generateWithGemini(
        appState.capturedPhoto || AvatarGenerator.generateProcedural(null),
        appState.apiKey,
        (msg) => {
          if (!appState.hasEnteredArena) {
            writeConsole(msg);
          }
        }
      );
    } else {
      if (!appState.hasEnteredArena) writeConsole('COMPILING LOCAL STYLIZER ENGINE...');
      await sleep(300);
      if (!appState.hasEnteredArena) writeConsole('RUNNING PIXEL MATRIX HISTOGRAM ANALYSIS...');
      await sleep(400);
      if (!appState.hasEnteredArena) writeConsole('SAMPLING SKIN TONE FIELD COEFFICIENTS...');
      await sleep(300);
      if (!appState.hasEnteredArena) writeConsole('INTERPOLATING HAIR & BACKGROUND LIGHT INDEX...');
      await sleep(300);
      
      const res = AvatarGenerator.generateProcedural(appState.capturedPhoto);
      if (!appState.hasEnteredArena) writeConsole('SUCCESS: Vector Avatar compiled correctly.');
      await sleep(200);
      return res;
    }
  })();

  generateAvatarPromise.then(async (avatarDataUrl) => {
    localStorage.setItem('facemoji_cachedAvatar', avatarDataUrl);
    appState.avatarUrl = avatarDataUrl;
    
    if (!appState.hasEnteredArena) {
      clearInterval(progressInterval);
      DOM.scannerProgress.style.width = '100%';
      await sleep(200);

      DOM.capturedPhotoPreview.src = avatarDataUrl;
      writeConsole('AVATAR TEXTURED CORRECTLY.');
      writeConsole('READY: Click "Enter Grid Arena" below to play!');
      
      DOM.scannerNextBtn.classList.remove('hidden');
    } else {
      console.log('AI Avatar successfully generated and cached in background.');
    }
  }).catch(async (err) => {
    console.error('Background Avatar Generation failed:', err);
    
    if (!appState.hasEnteredArena) {
      clearInterval(progressInterval);
      writeConsole(`CRITICAL PIPELINE ERROR: ${err.message}`, true);
      writeConsole('COMPILING GENERAL FALLBACK TO ORIGINAL PICTURE...', true);
      await sleep(1000);
      
      const fallbackUrl = appState.capturedPhoto || AvatarGenerator.generateProcedural(null);
      localStorage.setItem('facemoji_cachedAvatar', fallbackUrl);
      appState.avatarUrl = fallbackUrl;
      
      DOM.scannerProgress.style.width = '100%';
      DOM.capturedPhotoPreview.src = fallbackUrl;
      
      writeConsole('FALLBACK READY.');
      writeConsole('READY: Click "Enter Grid Arena" below to play!');
      
      DOM.scannerNextBtn.classList.remove('hidden');
    }
  });
}

// Game Core Callbacks
function handleStatsUpdate(mass, eatenCount) {
  DOM.statMass.textContent = mass;
  DOM.statEaten.textContent = eatenCount;
  
  appState.stats.maxMass = Math.max(appState.stats.maxMass, mass);
  appState.stats.botsEaten = eatenCount;
}

function handleGameOver(finalMass, leaderboard, rank) {
  const globalRank = saveScoreToGlobalLeaderboard(appState.playerName, finalMass, appState.avatarUrl);

  // Trigger Victory confetti on podium finish
  const gameoverTitle = document.querySelector('.gameover-title');
  if (globalRank >= 1 && globalRank <= 3) {
    confetti.start();
    if (gameoverTitle) {
      gameoverTitle.innerHTML = `🏆 PODIUM FINISH #${globalRank} 🏆`;
      gameoverTitle.style.background = 'linear-gradient(135deg, #ffd700 0%, #ff007f 100%)';
      gameoverTitle.style.webkitBackgroundClip = 'text';
    }
  } else {
    confetti.stop();
    if (gameoverTitle) {
      gameoverTitle.innerHTML = 'DEFEATED';
      gameoverTitle.style.background = 'linear-gradient(135deg, var(--neon-magenta) 0%, var(--neon-purple) 100%)';
      gameoverTitle.style.webkitBackgroundClip = 'text';
    }
  }

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

  // Update final rank badge
  const rankBadge = document.getElementById('gameover-rank-badge');
  if (rankBadge && rank && leaderboard) {
    rankBadge.textContent = `Rank #${rank} / ${leaderboard.length}`;
  }

  // Populate standings list
  const listEl = document.getElementById('gameover-leaderboard-list');
  if (listEl && leaderboard) {
    let listHtml = '';
    
    // We display top 5, and if the player is not in top 5, we append their ranking at the bottom!
    const topLimit = 5;
    const topCells = leaderboard.slice(0, topLimit);
    const isPlayerInTop5 = topCells.some(cell => cell.isPlayer);
    
    topCells.forEach((cell, idx) => {
      const rankNum = idx + 1;
      const rankClass = rankNum <= 3 ? `gameover-rank-${rankNum}` : '';
      const selfClass = cell.isPlayer ? 'self' : '';
      
      listHtml += `
        <li class="gameover-leaderboard-item ${selfClass}">
          <div class="gameover-rank ${rankClass}">#${rankNum}</div>
          <div class="gameover-name">
            <img class="gameover-avatar-mini" src="${cell.avatarUrl || AvatarGenerator.generateProcedural(null)}" alt="${cell.name}">
            <span>${cell.name}</span>
          </div>
          <div class="gameover-score">${Math.round(cell.mass)}</div>
        </li>
      `;
    });
    
    if (!isPlayerInTop5) {
      listHtml += `<div class="gameover-leaderboard-separator">•••</div>`;
      
      const playerIndex = leaderboard.findIndex(cell => cell.isPlayer);
      if (playerIndex !== -1) {
        const pCell = leaderboard[playerIndex];
        listHtml += `
          <li class="gameover-leaderboard-item self">
            <div class="gameover-rank">#${playerIndex + 1}</div>
            <div class="gameover-name">
              <img class="gameover-avatar-mini" src="${pCell.avatarUrl || AvatarGenerator.generateProcedural(null)}" alt="${pCell.name}">
              <span>${pCell.name}</span>
            </div>
            <div class="gameover-score">${Math.round(pCell.mass)}</div>
          </li>
        `;
      }
    }
    
    listEl.innerHTML = listHtml;
  }

  showScreen(DOM.gameoverScreen);
}

function saveScoreToGlobalLeaderboard(playerName, finalMass, avatarUrl) {
  const name = (playerName || 'Blobby').trim();
  if (!name) return -1;
  
  let scores = [];
  try {
    const data = localStorage.getItem('facemoji_global_leaderboard');
    if (data) scores = JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse global leaderboard', e);
  }
  
  // Find if this player already exists in the leaderboard
  const existingIndex = scores.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  
  if (existingIndex !== -1) {
    if (finalMass > scores[existingIndex].mass) {
      scores[existingIndex].mass = finalMass;
      scores[existingIndex].avatarUrl = avatarUrl;
      scores[existingIndex].timestamp = Date.now();
    }
  } else {
    scores.push({
      name: name,
      mass: finalMass,
      avatarUrl: avatarUrl,
      timestamp: Date.now()
    });
  }
  
  // Sort descending by mass and keep top 8 champions
  scores.sort((a, b) => b.mass - a.mass);
  scores = scores.slice(0, 8);
  
  localStorage.setItem('facemoji_global_leaderboard', JSON.stringify(scores));

  const playerRank = scores.findIndex(x => x.name.toLowerCase() === name.toLowerCase()) + 1;
  return playerRank;
}

function renderLobbyLeaderboard() {
  const listEl = document.getElementById('lobby-leaderboard-list');
  if (!listEl) return;
  
  let scores = [];
  try {
    const data = localStorage.getItem('facemoji_global_leaderboard');
    if (data) scores = JSON.parse(data);
  } catch (e) {
    console.error(e);
  }
  
  if (scores.length === 0) {
    listEl.innerHTML = `<li class="lobby-leaderboard-empty">No records yet. Be the first!</li>`;
    return;
  }
  
  const currentTypedName = DOM.playerNameInput.value.trim().toLowerCase();
  
  let html = '';
  scores.forEach((score, idx) => {
    const rank = idx + 1;
    const rankClass = rank <= 3 ? `lobby-rank-${rank}` : '';
    const highlightClass = score.name.toLowerCase() === currentTypedName ? 'highlight' : '';
    
    html += `
      <li class="lobby-leaderboard-item ${highlightClass}">
        <div class="lobby-rank ${rankClass}">#${rank}</div>
        <div class="lobby-name-cell">
          <img class="lobby-avatar-mini" src="${score.avatarUrl || AvatarGenerator.generateProcedural(null)}" alt="${score.name}">
          <span>${score.name}</span>
        </div>
        <div class="lobby-score">${Math.round(score.mass)}</div>
      </li>
    `;
  });
  
  listEl.innerHTML = html;
}

/**
 * Fullscreen Confetti Particle System Manager
 */
class ConfettiManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.active = false;
    this.animationFrameId = null;
    
    window.addEventListener('resize', () => {
      if (this.active) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }
    });
  }
  
  start() {
    if (!this.canvas) return;
    this.active = true;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.particles = [];
    
    const colors = ['#ffd700', '#00f2fe', '#ff007f', '#39ff14', '#9c88ff', '#ff9f43', '#1dd1a1'];
    
    for (let i = 0; i < 150; i++) {
      const fromLeft = Math.random() < 0.5;
      
      this.particles.push({
        x: fromLeft ? -10 : this.canvas.width + 10,
        y: Math.random() * (this.canvas.height * 0.4) + this.canvas.height * 0.15,
        vx: (fromLeft ? 1 : -1) * (11 + Math.random() * 16),
        vy: - (13 + Math.random() * 11),
        size: 7 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.22,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.05 + Math.random() * 0.12,
        drag: 0.94 + Math.random() * 0.03,
        gravity: 0.35 + Math.random() * 0.25
      });
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.loop();
    
    setTimeout(() => {
      this.stop();
    }, 7000);
  }
  
  stop() {
    this.active = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  
  loop() {
    if (!this.active) return;
    
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    let particlesAlive = false;
    
    for (let p of this.particles) {
      p.vx *= p.drag;
      p.vy += p.gravity;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.wobble += p.wobbleSpeed;
      
      if (p.y < h + 20 && p.x > -30 && p.x < w + 30) {
        particlesAlive = true;
        
        ctx.save();
        ctx.translate(p.x + Math.sin(p.wobble) * 9, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    
    if (particlesAlive) {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    } else {
      this.stop();
    }
  }
}

// Instantiate Confetti overlay instance
const confetti = new ConfettiManager('confetti-canvas');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load app on document DOM ready
document.addEventListener('DOMContentLoaded', initApp);
