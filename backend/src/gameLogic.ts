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

export function createNewGame(level: number = 1, customRadius?: number): GameState {
  const config = LEVEL_CONFIGS[level] || LEVEL_CONFIGS[5];
  const radius = customRadius ?? config.radius;

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
  for (const coord of availableForPlacement) {
    if (nutrientIdx >= config.nutrients) break;
    const key = coordKey(coord);
    if (cells[key].type === HexType.EMPTY) {
      cells[key].type = HexType.NUTRIENT;
      cells[key].nutrientId = `nutrient_${nutrientIdx}`;
      nutrients.push(cells[key].nutrientId!);
      nutrientIdx++;
    }
  }

  let pollutedCount = 0;
  for (const coord of availableForPlacement) {
    if (pollutedCount >= config.polluted) break;
    const key = coordKey(coord);
    if (cells[key].type === HexType.EMPTY) {
      cells[key].type = HexType.POLLUTED;
      pollutedCount++;
    }
  }

  const myceliumCells: HexCoord[] = [startCoord];

  const optimalSteps = calculateOptimalSteps(cells, startCoord, radius, nutrients);

  return {
    id: uuidv4(),
    level,
    gridRadius: radius,
    cells,
    nutrients,
    connectedNutrients: [],
    startCoord,
    myceliumCells,
    steps: 0,
    optimalSteps,
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

  const allPoints = [{ coord: startCoord, id: 'start' }, ...nutrientCoords];
  const distances = new Map<string, Map<string, number>>();

  for (const a of allPoints) {
    distances.set(a.id, new Map());
    for (const b of allPoints) {
      if (a.id === b.id) {
        distances.get(a.id)!.set(b.id, 0);
      } else {
        const path = findPathAStar(a.coord, b.coord, cells, radius, [HexType.POLLUTED]);
        distances.get(a.id)!.set(b.id, path ? path.length - 1 : Infinity);
      }
    }
  }

  const permute = (arr: { coord: HexCoord; id: string }[]): number => {
    if (arr.length <= 1) return 0;
    let min = Infinity;
    const permuteHelper = (prefix: { coord: HexCoord; id: string }[], remaining: { coord: HexCoord; id: string }[]) => {
      if (remaining.length === 0) {
        let dist = 0;
        let current = 'start';
        for (const p of prefix) {
          dist += distances.get(current)!.get(p.id) ?? 0;
          current = p.id;
        }
        if (dist < min) min = dist;
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        permuteHelper(
          [...prefix, remaining[i]],
          [...remaining.slice(0, i), ...remaining.slice(i + 1)]
        );
      }
    };
    permuteHelper([], arr);
    return min === Infinity ? 10 : min;
  };

  const result = permute(nutrientCoords);
  return result === Infinity || result === 0 ? nutrientCoords.length * 3 : result;
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

  const newGame: GameState = {
    ...game,
    cells: { ...game.cells },
    myceliumCells: [...game.myceliumCells, coord],
    connectedNutrients: [...game.connectedNutrients],
    steps: game.steps + 1,
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
