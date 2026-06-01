/**
 * Web Audio Sound Effects Synthesizer
 */
class SoundEffects {
  static ctx = null;

  static init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume context if suspended (browser security autoplay policies)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  static playEatFood() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      const now = this.ctx.currentTime;
      // High sweet pop bubble sound
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  static playEatCell() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      const now = this.ctx.currentTime;
      // Deep swallow/gulp bubble sound
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  static playPowerup() {
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sawtooth';
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }
}

/**
 * Main Agar.io Game Engine (Multiplayer client)
 */
export class GameEngine {
  constructor(canvasId, onGameOver, onStatsUpdate) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.mctx = this.minimapCanvas.getContext('2d');

    this.onGameOver = onGameOver;
    this.onStatsUpdate = onStatsUpdate;

    // Game configurations
    this.MAP_SIZE = 4000;
    this.INITIAL_MASS = 15;

    // Synchronized remote list structures
    this.playersMap = new Map(); // socketId -> client player object
    this.botsMap = new Map();    // botId -> client bot object
    this.food = [];
    this.powerups = [];
    this.particles = [];
    this.keys = {};
    this.standings = [];

    this.playerId = null;
    this.player = null;
    this.socket = null;

    // Camera settings
    this.camera = { x: 2000, y: 2000, zoom: 1 };
    
    // Engine control
    this.isRunning = false;
    this.animationFrameId = null;

    // Handle viewport resize
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
    this.setupControls();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setupControls() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      SoundEffects.init(); // Warm up audio context on interaction
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  start(code, playerId, food, powerups, socket) {
    this.isRunning = true;
    this.socket = socket;
    this.playerId = playerId;
    
    this.food = food;
    this.powerups = powerups;
    this.particles = [];
    this.playersMap.clear();
    this.botsMap.clear();
    this.standings = [];
    this.player = null;
    
    this.camera = { x: this.MAP_SIZE / 2, y: this.MAP_SIZE / 2, zoom: 1 };
    this.keys = {};

    // Register active Socket handlers
    this.setupSocketListeners();

    // Begin Loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.socket) {
      this.socket.off('room_tick');
      this.socket.off('food_eaten');
      this.socket.off('food_spawned');
      this.socket.off('powerup_eaten');
      this.socket.off('powerup_spawned');
      this.socket.off('cell_eaten');
      this.socket.off('burst_particles');
      this.socket.off('game_over_trigger');
    }
  }

  setupSocketListeners() {
    this.socket.on('room_tick', (data) => {
      // 1. Process Human Players
      const currentIds = new Set();
      data.players.forEach(p => {
        currentIds.add(p.id);
        if (this.playersMap.has(p.id)) {
          // Update existing player coordinates targets
          const cell = this.playersMap.get(p.id);
          cell.targetX = p.x;
          cell.targetY = p.y;
          cell.targetVx = p.vx;
          cell.targetVy = p.vy;
          cell.targetMass = p.mass;
          cell.name = p.name;
          cell.effects = p.effects;
          cell.floatingText = p.floatingText;
          cell.floatingTextColor = p.floatingTextColor;
          cell.floatingTextTimer = p.floatingTextTimer;
          
          if (p.avatarUrl && p.avatarUrl !== cell.avatarUrl) {
            cell.avatarUrl = p.avatarUrl;
            cell.avatarImg.src = p.avatarUrl;
          }
        } else {
          // Create new remote human cell
          const newCell = {
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            targetX: p.x,
            targetY: p.y,
            targetVx: p.vx,
            targetVy: p.vy,
            mass: p.mass,
            targetMass: p.mass,
            color: p.color,
            avatarUrl: p.avatarUrl,
            avatarImg: new Image(),
            isPlayer: p.id === this.playerId,
            jiggle: 0,
            jiggleSpeed: 0,
            effects: p.effects,
            floatingText: p.floatingText,
            floatingTextColor: p.floatingTextColor,
            floatingTextTimer: p.floatingTextTimer
          };
          if (p.avatarUrl) newCell.avatarImg.src = p.avatarUrl;
          
          this.playersMap.set(p.id, newCell);
          
          if (newCell.isPlayer) {
            this.player = newCell;
          }
        }
      });
      
      // Delete disconnected human players
      for (let id of this.playersMap.keys()) {
        if (!currentIds.has(id)) {
          this.playersMap.delete(id);
        }
      }

      // 2. Process AI Bots
      const currentBotIds = new Set();
      data.bots.forEach(b => {
        currentBotIds.add(b.id);
        if (this.botsMap.has(b.id)) {
          const cell = this.botsMap.get(b.id);
          cell.targetX = b.x;
          cell.targetY = b.y;
          cell.targetVx = b.vx;
          cell.targetVy = b.vy;
          cell.targetMass = b.mass;
          cell.effects = b.effects;
          cell.floatingText = b.floatingText;
          cell.floatingTextColor = b.floatingTextColor;
          cell.floatingTextTimer = b.floatingTextTimer;
        } else {
          // Spawn bot cell on client
          const newBot = {
            id: b.id,
            name: b.name,
            x: b.x,
            y: b.y,
            vx: b.vx,
            vy: b.vy,
            targetX: b.x,
            targetY: b.y,
            targetVx: b.vx,
            targetVy: b.vy,
            mass: b.mass,
            targetMass: b.mass,
            color: b.color,
            avatarUrl: '',
            avatarImg: new Image(),
            isPlayer: false,
            jiggle: 0,
            jiggleSpeed: 0,
            effects: b.effects,
            floatingText: b.floatingText,
            floatingTextColor: b.floatingTextColor,
            floatingTextTimer: b.floatingTextTimer
          };
          
          // Generate procedural face avatar URL synchronously for bot cells
          newBot.avatarUrl = this.generateBotAvatar(b.mass);
          newBot.avatarImg.src = newBot.avatarUrl;
          
          this.botsMap.set(b.id, newBot);
        }
      });

      // Remove deleted bots
      for (let id of this.botsMap.keys()) {
        if (!currentBotIds.has(id)) {
          this.botsMap.delete(id);
        }
      }
      
      // 3. Update scores standings
      this.standings = data.standings;
    });

    // Food increments
    this.socket.on('food_eaten', (data) => {
      const idx = this.food.findIndex(f => f.id === data.id);
      if (idx !== -1) {
        this.food.splice(idx, 1);
      }
      SoundEffects.playEatFood();
      this.spawnEatParticles(data.x, data.y, data.color, 6);
    });

    this.socket.on('food_spawned', (data) => {
      this.food.push(data);
    });

    // Powerup increments
    this.socket.on('powerup_eaten', (data) => {
      const idx = this.powerups.findIndex(p => p.id === data.id);
      if (idx !== -1) {
        this.powerups.splice(idx, 1);
      }
      SoundEffects.playPowerup();
      this.spawnEatParticles(data.x, data.y, data.color, 18);
    });

    this.socket.on('powerup_spawned', (data) => {
      this.powerups.push(data);
    });

    // Cell consumption collisions
    this.socket.on('cell_eaten', (data) => {
      SoundEffects.playEatCell();
      this.spawnEatParticles(data.x, data.y, data.eatenColor, 25);
    });

    // Particle bursts (dash effects / wall impacts)
    this.socket.on('burst_particles', (data) => {
      this.spawnEatParticles(data.x, data.y, data.color, 20);
    });

    // Server-authoritative game over trigger
    this.socket.on('game_over_trigger', (data) => {
      this.stop();
      if (this.onGameOver) {
        this.onGameOver(data.finalMass, data.standings, data.rank);
      }
    });
  }

  generateBotAvatar(mass) {
    const colors = ['#fbc531', '#4cd137', '#487eb0', '#e84118', '#9c88ff', '#00a8ff', '#f5f6fa'];
    const randomSkin = colors[Math.floor(Math.random() * colors.length)];
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI*2);
    ctx.clip();

    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,128,128);

    ctx.strokeStyle = randomSkin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = randomSkin;
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(48, 56, 6, 0, Math.PI*2);
    ctx.arc(80, 56, 6, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(46, 54, 2, 0, Math.PI*2);
    ctx.arc(78, 54, 2, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(64, 70, 10, 0, Math.PI);
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }

  // Calculate rendering radius from mass
  getRadius(mass, enlargeMultiplier = 1) {
    return Math.sqrt(mass * enlargeMultiplier) * 10;
  }

  spawnEatParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 4,
        color: color,
        alpha: 1,
        life: 0.95 + Math.random() * 0.05
      });
    }
  }

  update() {
    if (!this.player) return;

    // 1. Capture inputs and emit to socket server
    let vx = 0;
    let vy = 0;
    if (this.keys['w'] || this.keys['arrowup']) vy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) vy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) vx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) vx += 1;
    
    if (vx !== 0 || vy !== 0) {
      const norm = Math.sqrt(vx * vx + vy * vy);
      this.socket.emit('player_input', { vx: vx / norm, vy: vy / norm });
    }

    // 2. Update local particle effects
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.life;
      p.vy *= p.life;
      p.alpha -= 0.025;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 3. Linear Interpolation (lerp) update for all cells
    const lerpCell = (cell) => {
      cell.x += (cell.targetX - cell.x) * 0.35; // lerp position
      cell.y += (cell.targetY - cell.y) * 0.35;
      cell.vx += (cell.targetVx - cell.vx) * 0.35;
      cell.vy += (cell.targetVy - cell.vy) * 0.35;
      
      // Smooth out size wiggles and transitions
      cell.mass += (cell.targetMass - cell.mass) * 0.15;
      
      // Local jiggle spring update
      cell.jiggle += cell.jiggleSpeed;
      cell.jiggleSpeed -= cell.jiggle * 0.12;
      cell.jiggleSpeed *= 0.88;
      
      if (Math.abs(cell.targetMass - cell.mass) > 1 && cell.jiggle === 0) {
        cell.jiggle = 0.25;
        cell.jiggleSpeed = 0.15;
      }
      
      // Trailing sparks locally for speed/dash effects
      if (cell.effects) {
        if (cell.effects.speedBoost > 0) {
          if (Math.random() < 0.3) {
            const angle = Math.random() * Math.PI * 2;
            const rad = this.getRadius(cell.mass, cell.effects.enlargeMultiplier);
            this.particles.push({
              x: cell.x - cell.vx * 1.5 + Math.cos(angle) * (rad * 0.4),
              y: cell.y - cell.vy * 1.5 + Math.sin(angle) * (rad * 0.4),
              vx: -cell.vx * 0.3 + (Math.random() - 0.5) * 2,
              vy: -cell.vy * 0.3 + (Math.random() - 0.5) * 2,
              radius: 3 + Math.random() * 3,
              color: '#00f2fe',
              alpha: 0.85,
              life: 0.9
            });
          }
        }
        if (cell.effects.enlarged > 0) {
          if (Math.random() < 0.15) {
            const angle = Math.random() * Math.PI * 2;
            const rad = this.getRadius(cell.mass, cell.effects.enlargeMultiplier);
            this.particles.push({
              x: cell.x + Math.cos(angle) * rad,
              y: cell.y + Math.sin(angle) * rad,
              vx: (Math.random() - 0.5) * 1.5,
              vy: (Math.random() - 0.5) * 1.5,
              radius: 2 + Math.random() * 3,
              color: '#ff007f',
              alpha: 0.7,
              life: 0.92
            });
          }
        }
        if (cell.effects.isDashing) {
          if (Math.random() < 0.7) {
            const angle = Math.random() * Math.PI * 2;
            const rad = this.getRadius(cell.mass, cell.effects.enlargeMultiplier);
            this.particles.push({
              x: cell.x - cell.vx * 0.8 + Math.cos(angle) * (rad * 0.3),
              y: cell.y - cell.vy * 0.8 + Math.sin(angle) * (rad * 0.3),
              vx: -cell.vx * 0.18 + (Math.random() - 0.5) * 3,
              vy: -cell.vy * 0.18 + (Math.random() - 0.5) * 3,
              radius: 2.5 + Math.random() * 4,
              color: '#ffd700',
              alpha: 0.95,
              life: 0.88
            });
          }
        }
      }
    };

    // Update coordinates smoothly
    for (let cell of this.playersMap.values()) {
      lerpCell(cell);
    }
    for (let bot of this.botsMap.values()) {
      lerpCell(bot);
    }

    // 4. Camera smooth follow follow player
    this.camera.x += (this.player.x - this.camera.x) * 0.1;
    this.camera.y += (this.player.y - this.camera.y) * 0.1;

    // Camera dynamic scale zoom
    const targetZoom = Math.max(0.2, Math.min(1.2, Math.pow(this.INITIAL_MASS / this.player.mass, 0.23)));
    this.camera.zoom += (targetZoom - this.camera.zoom) * 0.05;

    // 5. Update local HUD stats
    if (this.onStatsUpdate) {
      const botsEaten = Math.max(0, Math.floor((this.player.mass - this.INITIAL_MASS) / 8));
      this.onStatsUpdate(Math.round(this.player.mass), botsEaten);
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Grid Arena bounds & background grid
    ctx.strokeStyle = '#101530';
    ctx.lineWidth = 1.5;
    const gridSize = 120;
    
    const xStart = Math.max(0, Math.floor((this.camera.x - w / 2 / this.camera.zoom) / gridSize) * gridSize);
    const xEnd = Math.min(this.MAP_SIZE, Math.ceil((this.camera.x + w / 2 / this.camera.zoom) / gridSize) * gridSize);
    const yStart = Math.max(0, Math.floor((this.camera.y - h / 2 / this.camera.zoom) / gridSize) * gridSize);
    const yEnd = Math.min(this.MAP_SIZE, Math.ceil((this.camera.y + h / 2 / this.camera.zoom) / gridSize) * gridSize);

    for (let x = xStart; x <= xEnd; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, yStart); ctx.lineTo(x, yEnd); ctx.stroke();
    }
    for (let y = yStart; y <= yEnd; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(xEnd, y); ctx.stroke();
    }

    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, this.MAP_SIZE, this.MAP_SIZE);

    ctx.fillStyle = 'rgba(255, 0, 127, 0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.MAP_SIZE, 0, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, this.MAP_SIZE, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.MAP_SIZE, this.MAP_SIZE, 30, 0, Math.PI*2); ctx.fill();

    // 2. Draw Food dots
    for (let f of this.food) {
      const dx = f.x - this.camera.x;
      const dy = f.y - this.camera.y;
      if (Math.abs(dx) > w / 2 / this.camera.zoom + 20 || Math.abs(dy) > h / 2 / this.camera.zoom + 20) {
        continue;
      }
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2); ctx.fill();
    }

    // 3. Draw Power-up dots
    for (let p of this.powerups) {
      const dx = p.x - this.camera.x;
      const dy = p.y - this.camera.y;
      if (Math.abs(dx) > w / 2 / this.camera.zoom + 40 || Math.abs(dy) > h / 2 / this.camera.zoom + 40) {
        continue;
      }
      
      const scale = 1 + Math.sin(p.pulse) * 0.12;
      
      ctx.save();
      ctx.translate(p.x, p.y);
      
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, p.radius * scale, 0, Math.PI * 2); ctx.stroke();

      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.15;
      ctx.beginPath(); ctx.arc(0, 0, p.radius * scale + 8, 0, Math.PI * 2); ctx.fill();

      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.65, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type[0], 0, 0);

      ctx.restore();
    }

    // 4. Draw Particles
    for (let p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 5. Draw Cells (Player + Bots) sorted by mass
    const renderCells = [...Array.from(this.playersMap.values()), ...Array.from(this.botsMap.values())]
      .filter(c => c.mass > 0)
      .sort((a, b) => a.mass - b.mass);

    for (let cell of renderCells) {
      const radius = this.getRadius(cell.mass, cell.effects?.enlargeMultiplier);
      const dx = cell.x - this.camera.x;
      const dy = cell.y - this.camera.y;
      if (Math.abs(dx) > w / 2 / this.camera.zoom + radius + 10 || Math.abs(dy) > h / 2 / this.camera.zoom + radius + 10) {
        continue;
      }

      ctx.save();
      ctx.translate(cell.x, cell.y);

      // Jiggle scaling animations wiggles
      const wave = Math.sin(Date.now() * 0.015);
      const scaleX = 1 + cell.jiggle * wave;
      const scaleY = 1 - cell.jiggle * wave;
      ctx.scale(scaleX, scaleY);

      // Crop cute avatar circular
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (cell.avatarImg && cell.avatarImg.complete && cell.avatarImg.naturalWidth > 0) {
        ctx.drawImage(cell.avatarImg, -radius, -radius, radius * 2, radius * 2);
      } else {
        const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, radius);
        grad.addColorStop(0, cell.color);
        grad.addColorStop(1, '#070913');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI*2); ctx.fill();
      }

      ctx.strokeStyle = cell.color;
      ctx.lineWidth = Math.max(3, radius * 0.04);
      ctx.beginPath(); ctx.arc(0, 0, radius - ctx.lineWidth/2, 0, Math.PI * 2); ctx.stroke();

      ctx.restore();

      // Render name below cell
      ctx.font = `bold ${Math.max(12, Math.round(11 + radius * 0.08))}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4.5;
      ctx.strokeText(cell.name, cell.x, cell.y + radius + 22);

      ctx.fillStyle = cell.id === this.playerId ? '#39ff14' : '#ffffff';
      ctx.fillText(cell.name, cell.x, cell.y + radius + 22);

      // Render mass score above cell
      const scoreStr = Math.round(cell.mass).toString();
      ctx.font = `800 ${Math.max(13, Math.round(12 + radius * 0.07))}px 'Outfit', sans-serif`;
      ctx.strokeText(scoreStr, cell.x, cell.y - radius - 18);
      ctx.fillStyle = cell.id === this.playerId ? '#00f2fe' : '#ff007f';
      ctx.fillText(scoreStr, cell.x, cell.y - radius - 18);

      // Floating text alerts
      if (cell.floatingTextTimer > 0) {
        const textY = cell.y - radius - 42 - (1 - cell.floatingTextTimer / 1600) * 35;
        const alpha = Math.min(1.0, cell.floatingTextTimer / 300);
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.max(13, Math.round(11 + radius * 0.085))}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4.5;
        ctx.strokeText(cell.floatingText, cell.x, textY);

        ctx.fillStyle = cell.floatingTextColor;
        ctx.fillText(cell.floatingText, cell.x, textY);
        ctx.restore();
      }
    }

    ctx.restore();

    // 6. Draw Leaders standings & Minimap UI
    this.drawMinimap();
    this.drawLeaderboardUI();
  }

  drawMinimap() {
    const mw = this.minimapCanvas.width;
    const mh = this.minimapCanvas.height;
    const mctx = this.mctx;

    mctx.fillStyle = 'rgba(5, 7, 18, 0.75)';
    mctx.fillRect(0, 0, mw, mh);

    mctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(3, 3, mw - 6, mh - 6);

    const mapToMinimap = (val) => (val / this.MAP_SIZE) * (mw - 10) + 5;

    // Draw bots
    mctx.fillStyle = '#ff007f';
    for (let bot of this.botsMap.values()) {
      mctx.beginPath();
      mctx.arc(mapToMinimap(bot.x), mapToMinimap(bot.y), 2.2, 0, Math.PI * 2);
      mctx.fill();
    }

    // Draw other remote human players
    mctx.fillStyle = '#00f2fe';
    for (let p of this.playersMap.values()) {
      if (p.id !== this.playerId) {
        mctx.beginPath();
        mctx.arc(mapToMinimap(p.x), mapToMinimap(p.y), 3.0, 0, Math.PI * 2);
        mctx.fill();
      }
    }

    // Draw local player (neon green)
    if (this.player) {
      mctx.fillStyle = '#39ff14';
      mctx.beginPath();
      mctx.arc(mapToMinimap(this.player.x), mapToMinimap(this.player.y), 3.8, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  drawLeaderboardUI() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl || !this.standings) return;

    let listHtml = '';
    this.standings.forEach((cell, idx) => {
      const name = cell.name;
      const score = Math.round(cell.mass);
      const isSelfClass = cell.isPlayer ? 'self' : '';

      listHtml += `
        <li class="leaderboard-item ${isSelfClass}">
          <div class="leaderboard-name">${idx + 1}. ${name}</div>
          <div class="leaderboard-score">${score}</div>
        </li>
      `;
    });

    listEl.innerHTML = listHtml;
  }

  loop() {
    if (!this.isRunning) return;
    
    this.update();
    this.draw();

    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }
}
