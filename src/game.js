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

      osc.type = 'triangle';
      const now = this.ctx.currentTime;
      // Low bassy crunch gulp
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }
}

/**
 * Main Agar.io Game Engine
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
    this.FOOD_COUNT = 550;
    this.BOT_COUNT = 18;
    this.SPEED_FACTOR = 4.8; // base speed multiplier

    // Game state
    this.player = null;
    this.bots = [];
    this.food = [];
    this.particles = [];
    this.keys = {};

    // Camera settings
    this.camera = { x: 0, y: 0, zoom: 1 };
    
    // Engine control
    this.isRunning = false;
    this.animationFrameId = null;

    // Handle viewport resize
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
    this.setupControls();

    // List of bot nicknames
    this.botNames = [
      'GigaBlob', 'AgarioMaster', 'Speedy', 'Pancake', 'Wobble', 
      'NeonRider', 'Ghost', 'Pacman', 'ApexCell', 'Jellyfish', 
      'MiniMe', 'Tornado', 'StarBoy', 'Vortex', 'BigChungus', 
      'Slayer', 'Glitch', 'Chaser', 'Pixel', 'Squeezy'
    ];
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

  start(playerName, playerAvatarUrl) {
    this.isRunning = true;
    
    // Create Player
    this.player = {
      name: playerName || 'Player',
      x: this.MAP_SIZE / 2,
      y: this.MAP_SIZE / 2,
      vx: 0,
      vy: 0,
      mass: this.INITIAL_MASS,
      color: '#00f2fe',
      isPlayer: true,
      avatarUrl: playerAvatarUrl,
      avatarImg: new Image(),
      jiggle: 0,
      jiggleSpeed: 0
    };
    this.player.avatarImg.src = playerAvatarUrl;

    // Initialize Food
    this.food = [];
    for (let i = 0; i < this.FOOD_COUNT; i++) {
      this.spawnFoodItem();
    }

    // Initialize Bots
    this.bots = [];
    for (let i = 0; i < this.BOT_COUNT; i++) {
      this.spawnBot(true);
    }

    this.particles = [];
    this.camera = { x: this.player.x, y: this.player.y, zoom: 1 };

    // Reset keyboard states
    this.keys = {};

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
    }
  }

  spawnFoodItem() {
    const colors = ['#00f2fe', '#9b51e0', '#ff007f', '#39ff14', '#ffd700', '#ff4500'];
    this.food.push({
      x: Math.random() * this.MAP_SIZE,
      y: Math.random() * this.MAP_SIZE,
      radius: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  spawnBot(initial = false) {
    const name = this.botNames[Math.floor(Math.random() * this.botNames.length)] + ' (Bot)';
    
    // Choose coordinates spaced out from center if initial, otherwise spawn near edge
    let x, y;
    if (initial) {
      x = Math.random() * this.MAP_SIZE;
      y = Math.random() * this.MAP_SIZE;
    } else {
      // Spawn on edges
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { x = Math.random() * this.MAP_SIZE; y = 20; }
      else if (edge === 1) { x = Math.random() * this.MAP_SIZE; y = this.MAP_SIZE - 20; }
      else if (edge === 2) { x = 20; y = Math.random() * this.MAP_SIZE; }
      else { x = this.MAP_SIZE - 20; y = Math.random() * this.MAP_SIZE; }
    }

    const mass = Math.round(10 + Math.random() * (this.player ? this.player.mass * 0.8 : 25));

    // Generate custom procedural emoji face avatar for bots (so they match the visual style!)
    const botAvatarUrl = this.generateBotAvatar(mass);
    const botImg = new Image();
    botImg.src = botAvatarUrl;

    this.bots.push({
      name: name,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      mass: mass,
      color: `hsl(${Math.random() * 360}, 90%, 55%)`,
      isPlayer: false,
      avatarUrl: botAvatarUrl,
      avatarImg: botImg,
      jiggle: 0,
      jiggleSpeed: 0,
      targetX: Math.random() * this.MAP_SIZE,
      targetY: Math.random() * this.MAP_SIZE,
      aiTimer: 0
    });
  }

  generateBotAvatar(mass) {
    const colors = ['#fbc531', '#4cd137', '#487eb0', '#e84118', '#9c88ff', '#00a8ff', '#f5f6fa'];
    const randomSkin = colors[Math.floor(Math.random() * colors.length)];
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Bot avatar drawing
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI*2);
    ctx.clip();

    // Background gradient
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,128,128);

    // Border glowing neon
    ctx.strokeStyle = randomSkin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI*2);
    ctx.stroke();

    // Draw funny face circle
    ctx.fillStyle = randomSkin;
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI*2);
    ctx.fill();

    // Draw cute eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(48, 56, 6, 0, Math.PI*2);
    ctx.arc(80, 56, 6, 0, Math.PI*2);
    ctx.fill();

    // Eye highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(46, 54, 2, 0, Math.PI*2);
    ctx.arc(78, 54, 2, 0, Math.PI*2);
    ctx.fill();

    // Smile mouth
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(64, 70, 10, 0, Math.PI);
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }

  // Calculate rendering radius from mass (standard circle area mapping)
  getRadius(mass) {
    return Math.sqrt(mass) * 10;
  }

  // Calculate speed limit from mass (larger = slower)
  getMaxSpeed(mass) {
    return this.SPEED_FACTOR * Math.pow(this.INITIAL_MASS / mass, 0.22);
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

    // 1. Move Player based on keyboard controls
    let ax = 0;
    let ay = 0;
    const accel = 0.65;

    if (this.keys['w'] || this.keys['arrowup']) ay -= accel;
    if (this.keys['s'] || this.keys['arrowdown']) ay += accel;
    if (this.keys['a'] || this.keys['arrowleft']) ax -= accel;
    if (this.keys['d'] || this.keys['arrowright']) ax += accel;

    // Apply acceleration
    this.player.vx += ax;
    this.player.vy += ay;

    // Apply drag/friction
    this.player.vx *= 0.94;
    this.player.vy *= 0.94;

    // Hard velocity cap based on mass
    const maxSpeed = this.getMaxSpeed(this.player.mass);
    const speed = Math.sqrt(this.player.vx * this.player.vx + this.player.vy * this.player.vy);
    if (speed > maxSpeed) {
      this.player.vx = (this.player.vx / speed) * maxSpeed;
      this.player.vy = (this.player.vy / speed) * maxSpeed;
    }

    // Move player
    this.player.x += this.player.vx;
    this.player.y += this.player.vy;

    // Enforce map boundary constraints
    const pRadius = this.getRadius(this.player.mass);
    this.player.x = Math.max(pRadius, Math.min(this.MAP_SIZE - pRadius, this.player.x));
    this.player.y = Math.max(pRadius, Math.min(this.MAP_SIZE - pRadius, this.player.y));

    // Update Jiggle animation springs
    this.player.jiggle += this.player.jiggleSpeed;
    this.player.jiggleSpeed -= this.player.jiggle * 0.12; // spring constant
    this.player.jiggleSpeed *= 0.88;                      // damping

    // 2. Update Bots AI & Movement
    for (let bot of this.bots) {
      bot.aiTimer -= 16; // rough milliseconds
      
      const bRadius = this.getRadius(bot.mass);
      const bMaxSpeed = this.getMaxSpeed(bot.mass);

      // Simple AI state machine
      if (bot.aiTimer <= 0) {
        bot.aiTimer = 500 + Math.random() * 1000; // Recalculate trajectory

        let threat = null;
        let threatDist = 600;
        let prey = null;
        let preyDist = 500;

        // Verify threats / targets
        const checkCells = [this.player, ...this.bots];
        for (let other of checkCells) {
          if (other === bot) continue;
          
          const dx = other.x - bot.x;
          const dy = other.y - bot.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (other.mass > bot.mass * 1.15) {
            // Larger than me = Threat
            if (dist < threatDist) {
              threatDist = dist;
              threat = other;
            }
          } else if (bot.mass > other.mass * 1.15) {
            // Smaller than me = Prey
            if (dist < preyDist) {
              preyDist = dist;
              prey = other;
            }
          }
        }

        if (threat) {
          // FLEE! Steering vector directly away
          const angle = Math.atan2(bot.y - threat.y, bot.x - threat.x);
          bot.targetX = bot.x + Math.cos(angle) * 800;
          bot.targetY = bot.y + Math.sin(angle) * 800;
        } else if (prey) {
          // CHASE! Steering vector directly towards
          bot.targetX = prey.x;
          bot.targetY = prey.y;
        } else {
          // FORAGE! Search for closest food item
          let closestFood = null;
          let minFoodDist = Infinity;
          
          for (let f of this.food) {
            const dx = f.x - bot.x;
            const dy = f.y - bot.y;
            const dist = dx*dx + dy*dy; // squared distance is faster
            if (dist < minFoodDist) {
              minFoodDist = dist;
              closestFood = f;
            }
          }

          if (closestFood) {
            bot.targetX = closestFood.x;
            bot.targetY = closestFood.y;
          } else {
            // Fallback roam
            bot.targetX = Math.random() * this.MAP_SIZE;
            bot.targetY = Math.random() * this.MAP_SIZE;
          }
        }
      }

      // Smooth steer toward target coordinate
      const dx = bot.targetX - bot.x;
      const dy = bot.targetY - bot.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist > 10) {
        // Accelerate
        bot.vx += (dx / dist) * 0.45;
        bot.vy += (dy / dist) * 0.45;
      }

      // Apply drag
      bot.vx *= 0.94;
      bot.vy *= 0.94;

      // Cap speed
      const botSpeed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
      if (botSpeed > bMaxSpeed) {
        bot.vx = (bot.vx / botSpeed) * bMaxSpeed;
        bot.vy = (bot.vy / botSpeed) * bMaxSpeed;
      }

      // Move bot
      bot.x += bot.vx;
      bot.y += bot.vy;

      // Map limits for bot
      bot.x = Math.max(bRadius, Math.min(this.MAP_SIZE - bRadius, bot.x));
      bot.y = Math.max(bRadius, Math.min(this.MAP_SIZE - bRadius, bot.y));

      // Bot jiggles
      bot.jiggle += bot.jiggleSpeed;
      bot.jiggleSpeed -= bot.jiggle * 0.12;
      bot.jiggleSpeed *= 0.88;
    }

    // 3. Collision Checks: Eating Food
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];

      // Check player collision
      let dx = f.x - this.player.x;
      let dy = f.y - this.player.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < pRadius) {
        // Eat food!
        this.player.mass += 0.85; // steady incremental growth
        this.player.jiggle = 0.25; // Trigger bounce wiggle physics
        this.player.jiggleSpeed = 0.15;
        this.spawnEatParticles(f.x, f.y, f.color, 6);
        SoundEffects.playEatFood();

        this.food.splice(i, 1);
        this.spawnFoodItem(); // Maintain food density
        continue;
      }

      // Check bot collisions
      for (let bot of this.bots) {
        const bRad = this.getRadius(bot.mass);
        dx = f.x - bot.x;
        dy = f.y - bot.y;
        dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < bRad) {
          bot.mass += 0.85;
          bot.jiggle = 0.25;
          bot.jiggleSpeed = 0.15;
          
          this.food.splice(i, 1);
          this.spawnFoodItem();
          break;
        }
      }
    }

    // 4. Collision Checks: Eating Other Cells (Players & Bots)
    // We sort cells to handle order correctly
    let allCells = [this.player, ...this.bots];
    
    for (let i = 0; i < allCells.length; i++) {
      const cellA = allCells[i];
      if (cellA.mass === 0) continue; // Already eaten

      for (let j = 0; j < allCells.length; j++) {
        if (i === j) continue;
        const cellB = allCells[j];
        if (cellB.mass === 0) continue; // Already eaten

        // Check if A is larger than B
        if (cellA.mass > cellB.mass * 1.15) {
          const dx = cellB.x - cellA.x;
          const dy = cellB.y - cellA.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          const radA = this.getRadius(cellA.mass);
          const radB = this.getRadius(cellB.mass);

          // Eat condition: overlap covers center of B
          if (dist < radA - radB * 0.4) {
            // Eat!
            cellA.mass += cellB.mass * 0.8; // absorb 80% mass
            cellA.jiggle = 0.45;
            cellA.jiggleSpeed = 0.25;

            this.spawnEatParticles(cellB.x, cellB.y, cellB.color, 25);
            SoundEffects.playEatCell();

            // Set mass of consumed cell to 0
            cellB.mass = 0;

            if (cellB.isPlayer) {
              // GAME OVER!
              this.gameOver();
            } else {
              // Delete bot and respawn
              this.bots = this.bots.filter(b => b !== cellB);
              this.spawnBot(false);
            }
          }
        }
      }
    }

    // 5. Update Particles
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

    // 6. Camera smooth interpolation (lerp)
    this.camera.x += (this.player.x - this.camera.x) * 0.1;
    this.camera.y += (this.player.y - this.camera.y) * 0.1;

    // Camera dynamic scale zoom:
    // As player grows, zoom out
    const targetZoom = Math.max(0.2, Math.min(1.2, Math.pow(this.INITIAL_MASS / this.player.mass, 0.23)));
    this.camera.zoom += (targetZoom - this.camera.zoom) * 0.05;

    // 7. Push stats updates
    if (this.onStatsUpdate) {
      const botsEaten = this.BOT_COUNT - this.bots.length; // Approximate
      this.onStatsUpdate(Math.round(this.player.mass), botsEaten);
    }
  }

  gameOver() {
    this.stop();
    if (this.onGameOver) {
      this.onGameOver(Math.round(this.player.mass));
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear Screen (Very deep grid color)
    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // Translate and zoom to center relative to camera
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Grid Arena bounds & background grid
    ctx.strokeStyle = '#101530';
    ctx.lineWidth = 1.5;
    const gridSize = 120;
    
    // We only render grid cells near viewport bounding box to save CPU cycles
    const xStart = Math.max(0, Math.floor((this.camera.x - w / 2 / this.camera.zoom) / gridSize) * gridSize);
    const xEnd = Math.min(this.MAP_SIZE, Math.ceil((this.camera.x + w / 2 / this.camera.zoom) / gridSize) * gridSize);
    const yStart = Math.max(0, Math.floor((this.camera.y - h / 2 / this.camera.zoom) / gridSize) * gridSize);
    const yEnd = Math.min(this.MAP_SIZE, Math.ceil((this.camera.y + h / 2 / this.camera.zoom) / gridSize) * gridSize);

    for (let x = xStart; x <= xEnd; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, yStart);
      ctx.lineTo(x, yEnd);
      ctx.stroke();
    }
    for (let y = yStart; y <= yEnd; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.stroke();
    }

    // Outer Map Boundaries walls
    ctx.strokeStyle = '#ff007f'; // glowing red boundary
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, this.MAP_SIZE, this.MAP_SIZE);

    // Map Corner lights
    ctx.fillStyle = 'rgba(255, 0, 127, 0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.MAP_SIZE, 0, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, this.MAP_SIZE, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(this.MAP_SIZE, this.MAP_SIZE, 30, 0, Math.PI*2); ctx.fill();

    // 2. Draw Food dots
    for (let f of this.food) {
      // Frustum culling: only draw food inside the screen frame
      const dx = f.x - this.camera.x;
      const dy = f.y - this.camera.y;
      if (Math.abs(dx) > w / 2 / this.camera.zoom + 20 || Math.abs(dy) > h / 2 / this.camera.zoom + 20) {
        continue;
      }
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Particles
    for (let p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Draw Cells (Player + Bots)
    // Gather all cells and sort by mass ascending so larger ones are drawn on top
    const renderCells = [this.player, ...this.bots].sort((a, b) => a.mass - b.mass);

    for (let cell of renderCells) {
      if (cell.mass <= 0) continue;

      const radius = this.getRadius(cell.mass);

      // Frustum culling for large cell circles
      const dx = cell.x - this.camera.x;
      const dy = cell.y - this.camera.y;
      if (Math.abs(dx) > w / 2 / this.camera.zoom + radius + 10 || Math.abs(dy) > h / 2 / this.camera.zoom + radius + 10) {
        continue;
      }

      ctx.save();
      ctx.translate(cell.x, cell.y);

      // Wiggle spring scale animation: squash/stretch
      // Wiggle oscillates between horizontal/vertical stretch
      const wave = Math.sin(Date.now() * 0.015);
      const scaleX = 1 + cell.jiggle * wave;
      const scaleY = 1 - cell.jiggle * wave;
      ctx.scale(scaleX, scaleY);

      // Draw custom Avatar Image cropped inside circle!
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (cell.avatarImg && cell.avatarImg.complete && cell.avatarImg.naturalWidth > 0) {
        ctx.drawImage(cell.avatarImg, -radius, -radius, radius * 2, radius * 2);
      } else {
        // Fallback placeholder rendering in case image is loading
        const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, radius);
        grad.addColorStop(0, cell.color);
        grad.addColorStop(1, '#070913');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI*2);
        ctx.fill();
      }

      // Add a nice thin neon outer ring lining
      ctx.strokeStyle = cell.color;
      ctx.lineWidth = Math.max(3, radius * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, radius - ctx.lineWidth/2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      // Render floating Name tag below the cell
      ctx.font = `bold ${Math.max(12, Math.round(11 + radius * 0.08))}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Black boundary text contour shadow
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4.5;
      ctx.strokeText(cell.name, cell.x, cell.y + radius + 22);

      // White overlay text
      ctx.fillStyle = cell.isPlayer ? '#39ff14' : '#ffffff';
      ctx.fillText(cell.name, cell.x, cell.y + radius + 22);
    }

    ctx.restore();

    // 5. Draw Leaderboard and Minimap HUD Layers
    this.drawMinimap();
    this.drawLeaderboardUI();
  }

  drawMinimap() {
    const mw = this.minimapCanvas.width;
    const mh = this.minimapCanvas.height;
    const mctx = this.mctx;

    // Clear Minimap canvas
    mctx.fillStyle = 'rgba(5, 7, 18, 0.75)';
    mctx.fillRect(0, 0, mw, mh);

    // Map borders inside minimap
    mctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(3, 3, mw - 6, mh - 6);

    const mapToMinimap = (val) => (val / this.MAP_SIZE) * (mw - 10) + 5;

    // Draw bots
    mctx.fillStyle = '#ff007f';
    for (let bot of this.bots) {
      if (bot.mass > 0) {
        mctx.beginPath();
        mctx.arc(mapToMinimap(bot.x), mapToMinimap(bot.y), 2.2, 0, Math.PI * 2);
        mctx.fill();
      }
    }

    // Draw player (large green dot)
    if (this.player && this.player.mass > 0) {
      mctx.fillStyle = '#39ff14';
      mctx.beginPath();
      mctx.arc(mapToMinimap(this.player.x), mapToMinimap(this.player.y), 3.8, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  drawLeaderboardUI() {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl || !this.player) return;

    // Combine player and bots
    const scoresList = [this.player, ...this.bots]
      .filter(cell => cell.mass > 0)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 5); // top 5

    let listHtml = '';
    scoresList.forEach((cell, idx) => {
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

  // Infinite rendering tick loop
  loop() {
    if (!this.isRunning) return;
    
    this.update();
    this.draw();

    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }
}
