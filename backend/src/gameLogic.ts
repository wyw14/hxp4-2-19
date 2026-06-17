import { v4 as uuidv4 } from 'uuid';
import { GameState, HexCell, HexCoord, HexType } from './types';
import { coordKey, generateHexGrid, hexDistance, getNeighbors, isInRadius, findPathAStar } from './hexUtils';

const LEVEL_CONFIGS: Record<number, { radius: number; nutrients: number; polluted: number }> = {
  1: { radius: 3, nutrients: 2, polluted: 3 },
  2: { radius: 4, nutrients: 3, polluted: 6 },
  3: { radius: 5, nutrients: 4, polluted: 10 },
  4: { radius: 5, nutrients: 5, polluted: 14 },
  5: { radius: 6, nutrients: 6, polluted: 20 },
};

export interface GameConfig {
  gridRadius?: number;
  nutrientCount?: number;
  pollutedDensity?: number;
  useStepBudget?: boolean;
  stepBudget?: number;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createNewGame(level: number = 1, config: GameConfig = {}): GameState {
  const levelConfig = LEVEL_CONFIGS[level] || LEVEL_CONFIGS[5];
  const radius = config.gridRadius ?? levelConfig.radius;
  const nutrientCount = config.nutrientCount ?? levelConfig.nutrients;
  const pollutedDensity = config.pollutedDensity ?? (levelConfig.polluted / generateHexGrid(levelConfig.radius).length);
  const clampedDensity = Math.max(0, Math.min(0.7, pollutedDensity));
  const useStepBudget = config.useStepBudget ?? false;
  const stepBudget = config.stepBudget ?? 0;

  const allCoords = generateHexGrid(radius);
  const cells: Record<string, HexCell> = {};
  for (const coord of allCoords) {
    cells[coordKey(coord)] = { coord, type: HexType.EMPTY };
  }

  const startCoord: HexCoord = { q: 0, r: 0 };
  cells[coordKey(startCoord)].type = HexType.START;

  const availableForPlacement = shuffle(
    allCoords.filter((c) => hexDistance(c, startCoord) >= 2)
  );

  const nutrients: string[] = [];
  let nutrientIdx = 0;
  const maxNutrients = Math.min(nutrientCount, availableForPlacement.length - 1);
  for (const coord of availableForPlacement) {
    if (nutrientIdx >= maxNutrients) break;
    const key = coordKey(coord);
    if (cells[key].type === HexType.EMPTY) {
      cells[key].type = HexType.NUTRIENT;
      cells[key].nutrientId = `nutrient_${nutrientIdx}`;
      nutrients.push(cells[key].nutrientId!);
      nutrientIdx++;
    }
  }

  const emptyAfterNutrients = availableForPlacement.filter(
    (c) => cells[coordKey(c)].type === HexType.EMPTY
  ).length;
  const pollutedCount = Math.floor(emptyAfterNutrients * clampedDensity);
  const minPolluted = 0;
  const maxPolluted = Math.max(minPolluted, emptyAfterNutrients - 1);
  const clampedPolluted = Math.max(minPolluted, Math.min(maxPolluted, pollutedCount));

  let pollutedPlaced = 0;
  for (const coord of availableForPlacement) {
    if (pollutedPlaced >= clampedPolluted) break;
    const key = coordKey(coord);
    if (cells[key].type === HexType.EMPTY) {
      cells[key].type = HexType.POLLUTED;
      pollutedPlaced++;
    }
  }

  const myceliumCells: HexCoord[] = [startCoord];

  const optimalSteps = calculateOptimalSteps(cells, startCoord, radius, nutrients);
  const finalStepBudget = useStepBudget ? (stepBudget > 0 ? stepBudget : Math.ceil(optimalSteps * 1.5)) : 0;

  return {
    id: uuidv4(),
    level,
    gridRadius: radius,
    pollutedDensity: clampedDensity,
    cells,
    nutrients,
    connectedNutrients: [],
    startCoord,
    myceliumCells,
    steps: 0,
    optimalSteps,
    stepBudget: finalStepBudget,
    useStepBudget,
    status: 'playing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function calculateOptimalSteps(
  cells: Record<string, HexCell>,
  startCoord: HexCoord,
  radius: number,
  nutrientIds: string[]
): number {
  const nutrientCoords = Object.values(cells)
    .filter((c) => c.nutrientId && nutrientIds.includes(c.nutrientId))
    .map((c) => ({ coord: c.coord, id: c.nutrientId! }));

  if (nutrientCoords.length === 0) return 0;

  const cache = new Map<string, number>();
  const getDist = (a: HexCoord, b: HexCoord): number => {
    const keyA = `${a.q},${a.r}`;
    const keyB = `${b.q},${b.r}`;
    const ck = keyA < keyB ? `${keyA}->${keyB}` : `${keyB}->${keyA}`;
    if (cache.has(ck)) return cache.get(ck)!;
    const path = findPathAStar(a, b, cells, radius, [HexType.POLLUTED]);
    const d = path ? path.length - 1 : Infinity;
    cache.set(ck, d);
    return d;
  };

  let totalSteps = 0;
  const visited = new Set<string>();
  let current = startCoord;

  for (let i = 0; i < nutrientCoords.length; i++) {
    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let j = 0; j < nutrientCoords.length; j++) {
      if (visited.has(nutrientCoords[j].id)) continue;
      const d = getDist(current, nutrientCoords[j].coord);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = j;
      }
    }
    if (nearestIdx === -1 || nearestDist === Infinity) {
      return nutrientCoords.length * 3;
    }
    visited.add(nutrientCoords[nearestIdx].id);
    totalSteps += nearestDist;
    current = nutrientCoords[nearestIdx].coord;
  }

  return totalSteps === 0 ? nutrientCoords.length * 3 : totalSteps;
}

export function extendMycelium(game: GameState, coord: HexCoord): { game: GameState; success: boolean; message: string } {
  if (game.status !== 'playing') {
    return { game, success: false, message: '游戏已结束' };
  }

  const key = coordKey(coord);
  const cell = game.cells[key];

  if (!cell) {
    return { game, success: false, message: '坐标无效' };
  }

  if (!isInRadius(coord, game.gridRadius)) {
    return { game, success: false, message: '超出地图范围' };
  }

  if (cell.type === HexType.POLLUTED) {
    return { game, success: false, message: '不能蔓延到重金属污染区！' };
  }

  const myceliumKeys = new Set(game.myceliumCells.map(coordKey));
  if (myceliumKeys.has(key)) {
    return { game, success: false, message: '该位置已被菌丝覆盖' };
  }

  const neighbors = getNeighbors(coord);
  const hasAdjacentMycelium = neighbors.some((n) => myceliumKeys.has(coordKey(n)));

  if (!hasAdjacentMycelium) {
    return { game, success: false, message: '菌丝只能从相邻格子蔓延！' };
  }

  const newSteps = game.steps + 1;
  if (game.useStepBudget && newSteps > game.stepBudget) {
    return { game, success: false, message: '已超出步数预算！' };
  }

  const newGame: GameState = {
    ...game,
    cells: { ...game.cells },
    myceliumCells: [...game.myceliumCells, coord],
    connectedNutrients: [...game.connectedNutrients],
    steps: newSteps,
    updatedAt: Date.now(),
  };

  if (cell.type !== HexType.START) {
    newGame.cells[key] = { ...cell, type: HexType.MYCELIUM };
  }

  if (cell.nutrientId && !newGame.connectedNutrients.includes(cell.nutrientId)) {
    newGame.connectedNutrients.push(cell.nutrientId);
  }

  if (newGame.connectedNutrients.length === newGame.nutrients.length) {
    newGame.status = 'won';
    return { game: newGame, success: true, message: '恭喜！你成功连接了所有营养源！' };
  }

  if (newGame.useStepBudget && newGame.steps >= newGame.stepBudget && newGame.connectedNutrients.length < newGame.nutrients.length) {
    newGame.status = 'lost';
    return { game: newGame, success: true, message: '步数用尽，挑战失败！' };
  }

  return { game: newGame, success: true, message: '菌丝成功蔓延' };
}

export function undoLastMove(game: GameState): { game: GameState; success: boolean; message: string } {
  if (game.myceliumCells.length <= 1) {
    return { game, success: false, message: '无法撤销到初始状态之前' };
  }

  const lastCoord = game.myceliumCells[game.myceliumCells.length - 1];
  const lastKey = coordKey(lastCoord);
  const lastCell = game.cells[lastKey];

  const newGame: GameState = {
    ...game,
    cells: { ...game.cells },
    myceliumCells: game.myceliumCells.slice(0, -1),
    connectedNutrients: game.connectedNutrients.filter((n) => n !== lastCell?.nutrientId),
    steps: Math.max(0, game.steps - 1),
    status: 'playing',
    updatedAt: Date.now(),
  };

  const originalCell = game.cells[lastKey];
  if (originalCell?.nutrientId) {
    newGame.cells[lastKey] = { ...originalCell, type: HexType.NUTRIENT };
  } else if (originalCell?.type === HexType.MYCELIUM) {
    newGame.cells[lastKey] = { ...originalCell, type: HexType.EMPTY };
  }

  return { game: newGame, success: true, message: '已撤销上一步' };
}

export function findAutoPath(
  game: GameState,
  from: HexCoord,
  to: HexCoord
): HexCoord[] | null {
  const blockedTypes: HexType[] = [HexType.POLLUTED];
  return findPathAStar(from, to, game.cells, game.gridRadius, blockedTypes);
}
