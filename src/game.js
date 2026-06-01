import { ENABLE_MULTIPLAYER } from './config.js';
import { GameEngine as LocalEngine } from './game.local.js';
import { GameEngine as MultiplayerEngine } from './game.multiplayer.js';

export const GameEngine = ENABLE_MULTIPLAYER ? MultiplayerEngine : LocalEngine;
