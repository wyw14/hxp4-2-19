import * as fs from 'fs';
import * as path from 'path';
import { GameState } from './types';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'games.json');

interface Database {
  games: Record<string, GameState>;
}

function ensureDbExists(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ games: {} }, null, 2));
  }
}

function readDb(): Database {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { games: {} };
  }
}

function writeDb(db: Database): void {
  ensureDbExists();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function saveGame(game: GameState): void {
  const db = readDb();
  db.games[game.id] = { ...game, updatedAt: Date.now() };
  writeDb(db);
}

export function loadGame(id: string): GameState | null {
  const db = readDb();
  return db.games[id] || null;
}

export function deleteGame(id: string): boolean {
  const db = readDb();
  if (db.games[id]) {
    delete db.games[id];
    writeDb(db);
    return true;
  }
  return false;
}

export function listGames(): GameState[] {
  const db = readDb();
  return Object.values(db.games).sort((a, b) => b.updatedAt - a.updatedAt);
}
