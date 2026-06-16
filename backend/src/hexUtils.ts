import { HexCoord, HexCell, HexType } from './types';

export const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function coordKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseCoordKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function getNeighbors(coord: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((d) => ({
    q: coord.q + d.q,
    r: coord.r + d.r,
  }));
}

export function isInRadius(coord: HexCoord, radius: number): boolean {
  const s = -coord.q - coord.r;
  return Math.abs(coord.q) <= radius && Math.abs(coord.r) <= radius && Math.abs(s) <= radius;
}

export function generateHexGrid(radius: number): HexCoord[] {
  const cells: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      cells.push({ q, r });
    }
  }
  return cells;
}

export function findPathAStar(
  start: HexCoord,
  goal: HexCoord,
  cells: Record<string, HexCell>,
  gridRadius: number,
  blockedTypes: HexType[] = [HexType.POLLUTED]
): HexCoord[] | null {
  const startKey = coordKey(start);
  const goalKey = coordKey(goal);

  if (startKey === goalKey) return [start];

  const openSet = new Map<string, { coord: HexCoord; f: number; g: number }>();
  const cameFrom = new Map<string, HexCoord>();
  const gScore = new Map<string, number>();

  openSet.set(startKey, { coord: start, f: hexDistance(start, goal), g: 0 });
  gScore.set(startKey, 0);

  while (openSet.size > 0) {
    let currentKey: string | null = null;
    let currentF = Infinity;

    for (const [key, val] of openSet) {
      if (val.f < currentF) {
        currentF = val.f;
        currentKey = key;
      }
    }

    if (!currentKey) break;

    const current = openSet.get(currentKey)!;

    if (currentKey === goalKey) {
      const path: HexCoord[] = [];
      let curr = goalKey;
      while (cameFrom.has(curr) || curr === startKey) {
        path.unshift(parseCoordKey(curr));
        if (curr === startKey) break;
        const prev = cameFrom.get(curr);
        if (!prev) break;
        curr = coordKey(prev);
      }
      return path;
    }

    openSet.delete(currentKey);

    const neighbors = getNeighbors(current.coord);

    for (const neighbor of neighbors) {
      if (!isInRadius(neighbor, gridRadius)) continue;

      const neighborKey = coordKey(neighbor);
      const cell = cells[neighborKey];

      if (cell && blockedTypes.includes(cell.type)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current.coord);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + hexDistance(neighbor, goal);
        openSet.set(neighborKey, { coord: neighbor, f, g: tentativeG });
      }
    }
  }

  return null;
}

export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * coord.q;
  const y = size * (Math.sqrt(3) / 2 * coord.q + Math.sqrt(3) * coord.r);
  return { x, y };
}
