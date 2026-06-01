import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // Allow up to 10MB payloads for Base64 face avatars
});

const PORT = process.env.PORT || 3001;

// Server game constants
const MAP_SIZE = 4000;
const INITIAL_MASS = 15;
const FOOD_COUNT = 300; // Efficient multiplayer food density
const MAX_PLAYERS_PER_ROOM = 8;
const BASE_BOT_COUNT = 12; // Base bots per room, auto scales down as human players join

// Store all active rooms (Room Code -> Room Object)
const rooms = new Map();

// Helper: Generate unique 4-letter Room Code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

// Bot nicknames list
const botNames = [
  'GigaBlob', 'AgarioMaster', 'Speedy', 'Pancake', 'Wobble', 
  'NeonRider', 'Ghost', 'Pacman', 'ApexCell', 'Jellyfish', 
  'MiniMe', 'Tornado', 'StarBoy', 'Vortex', 'BigChungus', 
  'Slayer', 'Glitch', 'Chaser', 'Pixel', 'Squeezy'
];

class GameRoom {
  constructor(code, isPublic = true) {
    this.code = code;
    this.isPublic = isPublic;
    this.players = new Map(); // socket.id -> player cell object
    this.food = [];
    this.powerups = [];
    this.bots = [];
    this.particles = [];
    
    this.initFood();
    this.initPowerups();
    this.initBots();
    
    // Start Authoritative Loop (30 Ticks per second)
    this.loopInterval = setInterval(() => this.update(), 33);
  }

  initFood() {
    const colors = ['#00f2fe', '#9b51e0', '#ff007f', '#39ff14', '#ffd700', '#ff4500'];
    for (let i = 0; i < FOOD_COUNT; i++) {
      this.food.push({
        id: i,
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        radius: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  initPowerups() {
    const types = ['SPEED', 'DASH', 'ENLARGE'];
    const colors = {
      'SPEED': '#00f2fe',
      'DASH': '#ffd700',
      'ENLARGE': '#ff007f'
    };
    for (let i = 0; i < 12; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({
        id: i,
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        radius: 16,
        type: type,
        color: colors[type],
        pulse: Math.random() * Math.PI
      });
    }
  }

  initBots() {
    this.bots = [];
    const targetBotCount = Math.max(2, BASE_BOT_COUNT - this.players.size);
    for (let i = 0; i < targetBotCount; i++) {
      this.spawnBot(i, true);
    }
  }

  spawnBot(id, initial = false) {
    const name = botNames[Math.floor(Math.random() * botNames.length)] + ' (Bot)';
    const x = Math.random() * MAP_SIZE;
    const y = Math.random() * MAP_SIZE;
    const mass = Math.round(10 + Math.random() * 20);
    
    this.bots.push({
      id: `bot_${id}_${Date.now()}`,
      name: name,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      mass: mass,
      color: `hsl(${Math.random() * 360}, 90%, 55%)`,
      isPlayer: false,
      avatarUrl: '', // Client procedural placeholder
      targetX: Math.random() * MAP_SIZE,
      targetY: Math.random() * MAP_SIZE,
      aiTimer: 0,
      effects: {
        speedBoost: 0,
        enlarged: 0,
        enlargeMultiplier: 1,
        isDashing: false,
        dashVx: 0,
        dashVy: 0
      },
      floatingText: '',
      floatingTextTimer: 0,
      floatingTextColor: '#ffffff'
    });
  }

  // Adjust bots list dynamically as humans join/leave
  scaleBots() {
    const targetBotCount = Math.max(2, BASE_BOT_COUNT - this.players.size);
    if (this.bots.length < targetBotCount) {
      // Spawn missing bots
      while (this.bots.length < targetBotCount) {
        this.spawnBot(this.bots.length);
      }
    } else if (this.bots.length > targetBotCount) {
      // Remove excess bots
      this.bots = this.bots.slice(0, targetBotCount);
    }
  }

  getRadius(mass, enlargeMultiplier = 1) {
    return Math.sqrt(mass * enlargeMultiplier) * 10;
  }

  getMaxSpeed(mass, speedBoostActive) {
    let speed = 4.8 * Math.pow(INITIAL_MASS / mass, 0.22);
    if (speedBoostActive > 0) {
      speed *= 1.8;
    }
    return speed;
  }

  applyPowerupEffect(cell, powerup) {
    if (!cell.effects) {
      cell.effects = { speedBoost: 0, enlarged: 0, enlargeMultiplier: 1, isDashing: false, dashVx: 0, dashVy: 0 };
    }

    cell.floatingText = powerup.type === 'SPEED' ? 'SPEED BOOST!' : (powerup.type === 'ENLARGE' ? 'GIANT MASS!' : 'WARP DASH!');
    cell.floatingTextColor = powerup.color;
    cell.floatingTextTimer = 1600;

    if (powerup.type === 'SPEED') {
      cell.effects.speedBoost = 5000;
    } else if (powerup.type === 'ENLARGE') {
      cell.effects.enlarged = 6000;
      cell.effects.enlargeMultiplier = 2.0;
    } else if (powerup.type === 'DASH') {
      let hx = 0;
      let hy = 0;
      
      const speed = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
      if (speed > 0.15) {
        hx = cell.vx / speed;
        hy = cell.vy / speed;
      } else {
        // Fallback target heading
        const angle = Math.random() * Math.PI * 2;
        hx = Math.cos(angle);
        hy = Math.sin(angle);
      }
      
      const dashSpeed = 26;
      cell.effects.isDashing = true;
      cell.effects.dashVx = hx * dashSpeed;
      cell.effects.dashVy = hy * dashSpeed;
      cell.vx = cell.effects.dashVx;
      cell.vy = cell.effects.dashVy;
      
      io.to(this.code).emit('burst_particles', { x: cell.x, y: cell.y, color: powerup.color });
    }
  }

  update() {
    // 1. Update Human Players positions
    for (let [socketId, player] of this.players) {
      if (player.mass <= 0) continue;
      
      // Update powerup timers
      if (player.floatingTextTimer > 0) player.floatingTextTimer -= 33;
      if (player.effects.speedBoost > 0) player.effects.speedBoost -= 33;
      if (player.effects.enlarged > 0) {
        player.effects.enlarged -= 33;
        player.effects.enlargeMultiplier = 2.0;
      } else {
        player.effects.enlargeMultiplier = 1.0;
      }

      const pRadius = this.getRadius(player.mass, player.effects.enlargeMultiplier);

      if (player.effects.isDashing) {
        player.vx = player.effects.dashVx;
        player.vy = player.effects.dashVy;
        
        // Wall collision ends dash
        if (player.x - pRadius <= 8 || player.x + pRadius >= MAP_SIZE - 8 || 
            player.y - pRadius <= 8 || player.y + pRadius >= MAP_SIZE - 8) {
          player.effects.isDashing = false;
          io.to(this.code).emit('burst_particles', { x: player.x, y: player.y, color: '#ffd700' });
        }
      } else {
        // Friction drag
        player.vx *= 0.94;
        player.vy *= 0.94;

        // Velocity caps
        const maxSpeed = this.getMaxSpeed(player.mass, player.effects.speedBoost);
        const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (speed > maxSpeed) {
          player.vx = (player.vx / speed) * maxSpeed;
          player.vy = (player.vy / speed) * maxSpeed;
        }
      }

      player.x += player.vx;
      player.y += player.vy;

      // Bound clamping
      player.x = Math.max(pRadius, Math.min(MAP_SIZE - pRadius, player.x));
      player.y = Math.max(pRadius, Math.min(MAP_SIZE - pRadius, player.y));
    }

    // 2. Update Bots AI Steering positions
    for (let bot of this.bots) {
      if (bot.mass <= 0) continue;

      // Update powerup timers
      if (bot.floatingTextTimer > 0) bot.floatingTextTimer -= 33;
      if (bot.effects.speedBoost > 0) bot.effects.speedBoost -= 33;
      if (bot.effects.enlarged > 0) {
        bot.effects.enlarged -= 33;
        bot.effects.enlargeMultiplier = 2.0;
      } else {
        bot.effects.enlargeMultiplier = 1.0;
      }

      const bRadius = this.getRadius(bot.mass, bot.effects.enlargeMultiplier);
      const bMaxSpeed = this.getMaxSpeed(bot.mass, bot.effects.speedBoost);

      if (bot.effects.isDashing) {
        bot.vx = bot.effects.dashVx;
        bot.vy = bot.effects.dashVy;
        
        if (bot.x - bRadius <= 8 || bot.x + bRadius >= MAP_SIZE - 8 || 
            bot.y - bRadius <= 8 || bot.y + bRadius >= MAP_SIZE - 8) {
          bot.effects.isDashing = false;
          io.to(this.code).emit('burst_particles', { x: bot.x, y: bot.y, color: '#ffd700' });
        }
      } else {
        // AI Recalculation
        bot.aiTimer -= 33;
        if (bot.aiTimer <= 0) {
          bot.aiTimer = 500 + Math.random() * 1000;
          
          let threat = null;
          let threatDist = 600;
          let prey = null;
          let preyDist = 500;

          const checkCells = [...Array.from(this.players.values()), ...this.bots];
          for (let other of checkCells) {
            if (other === bot || other.mass <= 0) continue;
            const dx = other.x - bot.x;
            const dy = other.y - bot.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (other.mass > bot.mass * 1.15) {
              if (dist < threatDist) { threatDist = dist; threat = other; }
            } else if (bot.mass > other.mass * 1.15) {
              if (dist < preyDist) { preyDist = dist; prey = other; }
            }
          }

          if (threat) {
            const angle = Math.atan2(bot.y - threat.y, bot.x - threat.x);
            bot.targetX = bot.x + Math.cos(angle) * 800;
            bot.targetY = bot.y + Math.sin(angle) * 800;
          } else if (prey) {
            bot.targetX = prey.x;
            bot.targetY = prey.y;
          } else {
            // Find food/powerup
            let closest = null;
            let minDist = Infinity;
            const huntTargets = [...this.food, ...this.powerups];
            for (let f of huntTargets) {
              const dx = f.x - bot.x;
              const dy = f.y - bot.y;
              const dist = dx*dx + dy*dy;
              if (dist < minDist) { minDist = dist; closest = f; }
            }
            if (closest) {
              bot.targetX = closest.x;
              bot.targetY = closest.y;
            } else {
              bot.targetX = Math.random() * MAP_SIZE;
              bot.targetY = Math.random() * MAP_SIZE;
            }
          }
        }

        const dx = bot.targetX - bot.x;
        const dy = bot.targetY - bot.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > 10) {
          bot.vx += (dx / dist) * 0.45;
          bot.vy += (dy / dist) * 0.45;
        }

        bot.vx *= 0.94;
        bot.vy *= 0.94;

        const botSpeed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
        if (botSpeed > bMaxSpeed) {
          bot.vx = (bot.vx / botSpeed) * bMaxSpeed;
          bot.vy = (bot.vy / botSpeed) * bMaxSpeed;
        }
      }

      bot.x += bot.vx;
      bot.y += bot.vy;
      bot.x = Math.max(bRadius, Math.min(MAP_SIZE - bRadius, bot.x));
      bot.y = Math.max(bRadius, Math.min(MAP_SIZE - bRadius, bot.y));
    }

    // 3. Collision Checks: Eating Food
    const activeCells = [...Array.from(this.players.values()), ...this.bots].filter(c => c.mass > 0);
    
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      for (let cell of activeCells) {
        const rad = this.getRadius(cell.mass, cell.effects.enlargeMultiplier);
        const dx = f.x - cell.x;
        const dy = f.y - cell.y;
        const distSq = dx*dx + dy*dy;
        
        if (distSq < rad * rad) {
          cell.mass += 0.85;
          
          // Emit food eat packet
          io.to(this.code).emit('food_eaten', { id: f.id, cellId: cell.id, color: f.color, x: f.x, y: f.y });
          
          // Respawn food at new index
          this.food[i] = {
            id: f.id,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            radius: 4 + Math.random() * 4,
            color: f.color
          };
          io.to(this.code).emit('food_spawned', this.food[i]);
          break;
        }
      }
    }

    // 4. Collision Checks: Eating Powerup Dots
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.pulse += 0.08;

      for (let cell of activeCells) {
        const rad = this.getRadius(cell.mass, cell.effects.enlargeMultiplier);
        const dx = p.x - cell.x;
        const dy = p.y - cell.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < rad + p.radius) {
          this.applyPowerupEffect(cell, p);
          
          io.to(this.code).emit('powerup_eaten', { id: p.id, cellId: cell.id, color: p.color, x: p.x, y: p.y, type: p.type });
          
          // Respawn powerup
          const types = ['SPEED', 'DASH', 'ENLARGE'];
          const colors = { 'SPEED': '#00f2fe', 'DASH': '#ffd700', 'ENLARGE': '#ff007f' };
          const newType = types[Math.floor(Math.random() * types.length)];
          this.powerups[i] = {
            id: p.id,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            radius: 16,
            type: newType,
            color: colors[newType],
            pulse: Math.random() * Math.PI
          };
          io.to(this.code).emit('powerup_spawned', this.powerups[i]);
          break;
        }
      }
    }

    // 5. Collision Checks: Eating Other Cells
    for (let i = 0; i < activeCells.length; i++) {
      const cellA = activeCells[i];
      if (cellA.mass <= 0) continue;

      for (let j = 0; j < activeCells.length; j++) {
        if (i === j) continue;
        const cellB = activeCells[j];
        if (cellB.mass <= 0) continue;

        const sizeA = cellA.mass * cellA.effects.enlargeMultiplier;
        const sizeB = cellB.mass * cellB.effects.enlargeMultiplier;

        if (sizeA > sizeB) {
          const dx = cellB.x - cellA.x;
          const dy = cellB.y - cellA.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          const radA = this.getRadius(cellA.mass, cellA.effects.enlargeMultiplier);
          const radB = this.getRadius(cellB.mass, cellB.effects.enlargeMultiplier);

          if (dist <= radA + radB) {
            cellA.mass += cellB.mass * 0.8;
            
            // Stop active dashes
            cellA.effects.isDashing = false;
            cellB.effects.isDashing = false;
            cellB.mass = 0; // Eaten!

            io.to(this.code).emit('cell_eaten', { 
              eaterId: cellA.id, eaterColor: cellA.color,
              eatenId: cellB.id, eatenColor: cellB.color, 
              x: cellB.x, y: cellB.y 
            });

            if (cellB.isPlayer) {
              // Inform eaten client socket immediately
              const socket = io.sockets.sockets.get(cellB.id);
              if (socket) {
                // Reconstruct full rankings at this instant
                const finalStandings = [...Array.from(this.players.values()), ...this.bots]
                  .map(c => ({
                    name: c.name,
                    mass: c.id === cellB.id ? cellB.finalMassBeforeDeath || 15 : c.mass,
                    avatarUrl: c.avatarUrl,
                    isPlayer: c.isPlayer
                  }))
                  .sort((a, b) => b.mass - a.mass);
                
                const finalRank = finalStandings.findIndex(c => c.name === cellB.name) + 1;
                socket.emit('game_over_trigger', { finalMass: Math.round(cellB.finalMassBeforeDeath || 15), standings: finalStandings, rank: finalRank });
              }
            } else {
              // Delete bot and spawn another
              this.bots = this.bots.filter(b => b.id !== cellB.id);
              this.scaleBots();
            }
          }
        }
      }
    }

    // Save final mass before death in update tick loop to ensure correct readings
    for (let [socketId, player] of this.players) {
      if (player.mass > 0) {
        player.finalMassBeforeDeath = player.mass;
      }
    }

    // 6. Assemble standings Top 5 inside this room
    const standings = [...Array.from(this.players.values()), ...this.bots]
      .filter(c => c.mass > 0)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 5)
      .map(c => ({ name: c.name, mass: Math.round(c.mass), isPlayer: c.isPlayer }));

    // 7. Emit Room Tick state packet to everyone inside room
    const playersList = Array.from(this.players.values()).filter(p => p.mass > 0);
    
    io.to(this.code).emit('room_tick', {
      players: playersList.map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        mass: p.mass, color: p.color, avatarUrl: p.avatarUrl, effects: p.effects,
        floatingText: p.floatingText, floatingTextColor: p.floatingTextColor, floatingTextTimer: p.floatingTextTimer
      })),
      bots: this.bots.filter(b => b.mass > 0).map(b => ({
        id: b.id, name: b.name, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        mass: b.mass, color: b.color, effects: b.effects,
        floatingText: b.floatingText, floatingTextColor: b.floatingTextColor, floatingTextTimer: b.floatingTextTimer
      })),
      standings: standings
    });
  }

  destroy() {
    clearInterval(this.loopInterval);
  }
}

// Socket IO Event handlers
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  // Emit public rooms roster list immediately on join
  sendPublicRoomsList(socket);

  socket.on('get_public_rooms', () => {
    sendPublicRoomsList(socket);
  });

  socket.on('create_room', ({ playerName, avatarUrl, isPublic }) => {
    const code = generateRoomCode();
    const room = new GameRoom(code, isPublic);
    rooms.set(code, room);

    console.log(`Game Room Created: ${code} (Public: ${isPublic})`);
    
    joinSocketToRoom(socket, code, playerName, avatarUrl);
    
    // Broadcast refreshed lobby listings
    broadcastPublicRoomsList();
  });

  socket.on('join_room', ({ code, playerName, avatarUrl }) => {
    const cleanCode = (code || '').trim().toUpperCase();
    
    if (!rooms.has(cleanCode)) {
      socket.emit('join_error', { message: `Arena room code "${cleanCode}" not found!` });
      return;
    }

    const room = rooms.get(cleanCode);
    
    // Count active human connections
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('join_error', { message: `Arena room "${cleanCode}" is completely full! (${MAX_PLAYERS_PER_ROOM} Players max)` });
      return;
    }

    joinSocketToRoom(socket, cleanCode, playerName, avatarUrl);
    broadcastPublicRoomsList();
  });

  socket.on('player_input', ({ vx, vy }) => {
    const socketRoom = getSocketRoomCode(socket);
    if (!socketRoom || !rooms.has(socketRoom)) return;

    const room = rooms.get(socketRoom);
    const player = room.players.get(socket.id);
    if (player && player.mass > 0) {
      player.vx += vx * 0.65;
      player.vy += vy * 0.65;
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const socketRoom = getSocketRoomCode(socket);
    if (socketRoom && rooms.has(socketRoom)) {
      const room = rooms.get(socketRoom);
      room.players.delete(socket.id);
      
      // Notify room about disconnect
      socket.to(socketRoom).emit('player_left', { id: socket.id });

      console.log(`Player left room ${socketRoom}. Room size now: ${room.players.size}`);

      if (room.players.size === 0) {
        // Collect garbage room
        room.destroy();
        rooms.delete(socketRoom);
        console.log(`Empty Game Room destroyed & collected: ${socketRoom}`);
      } else {
        room.scaleBots();
      }
      broadcastPublicRoomsList();
    }
  });
});

function joinSocketToRoom(socket, code, playerName, avatarUrl) {
  const room = rooms.get(code);
  
  // Clean up any former rooms
  const oldRoom = getSocketRoomCode(socket);
  if (oldRoom && oldRoom !== code) {
    socket.leave(oldRoom);
    if (rooms.has(oldRoom)) {
      const or = rooms.get(oldRoom);
      or.players.delete(socket.id);
      if (or.players.size === 0) { or.destroy(); rooms.delete(oldRoom); }
      else { or.scaleBots(); }
    }
  }

  socket.join(code);

  const playerObj = {
    id: socket.id,
    name: playerName || 'Player',
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    vx: 0,
    vy: 0,
    mass: INITIAL_MASS,
    color: `hsl(${Math.random() * 360}, 95%, 55%)`,
    isPlayer: true,
    avatarUrl: avatarUrl || '',
    effects: {
      speedBoost: 0,
      enlarged: 0,
      enlargeMultiplier: 1,
      isDashing: false,
      dashVx: 0,
      dashVy: 0
    },
    floatingText: '',
    floatingTextTimer: 0,
    floatingTextColor: '#ffffff'
  };

  room.players.set(socket.id, playerObj);
  room.scaleBots();

  socket.emit('join_success', {
    code: code,
    mapSize: MAP_SIZE,
    initialMass: INITIAL_MASS,
    playerId: socket.id,
    food: room.food,
    powerups: room.powerups
  });

  console.log(`Socket ${socket.id} successfully joined Arena room ${code}`);
}

function getSocketRoomCode(socket) {
  for (let roomCode of socket.rooms) {
    if (roomCode !== socket.id) return roomCode;
  }
  return null;
}

function sendPublicRoomsList(socket) {
  const list = [];
  for (let [code, r] of rooms) {
    if (r.isPublic) {
      list.push({
        code: code,
        playerCount: r.players.size,
        maxPlayers: MAX_PLAYERS_PER_ROOM
      });
    }
  }
  socket.emit('public_rooms_list', list);
}

function broadcastPublicRoomsList() {
  const list = [];
  for (let [code, r] of rooms) {
    if (r.isPublic) {
      list.push({
        code: code,
        playerCount: r.players.size,
        maxPlayers: MAX_PLAYERS_PER_ROOM
      });
    }
  }
  io.emit('public_rooms_list', list);
}

// Serve Vite build production files directly in production
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`-------------------------------------------------------------------`);
  console.log(`FACEMOJI.IO Fullstack Game Server running in Port: ${PORT}`);
  console.log(`Address: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`-------------------------------------------------------------------`);
});
