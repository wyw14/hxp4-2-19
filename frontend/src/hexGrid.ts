import { GameState, HexCell, HexCoord, HexType } from './types';
import {
  coordKey,
  generateHexGrid,
  hexToPixel,
  hexCornersPath,
  getNeighbors,
  PixelCoord,
} from './hexUtils';

interface HexGridOptions {
  container: HTMLElement;
  size?: number;
  onCellClick?: (coord: HexCoord) => void;
  onCellHover?: (coord: HexCoord | null, pixel: PixelCoord | null) => void;
}

const COLORS = {
  [HexType.EMPTY]: { fill: '#2a2a4a', stroke: '#3a3a5a' },
  [HexType.NUTRIENT]: { fill: '#c68642', stroke: '#8b5a2b' },
  [HexType.POLLUTED]: { fill: '#8b0000', stroke: '#5c0000' },
  [HexType.MYCELIUM]: { fill: '#6ab04c', stroke: '#7ed957' },
  [HexType.START]: { fill: '#5fa8d3', stroke: '#7ec8e3' },
};

export class HexGridRenderer {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private size: number;
  private gameState: GameState | null = null;
  private onCellClick?: (coord: HexCoord) => void;
  private onCellHover?: (coord: HexCoord | null, pixel: PixelCoord | null) => void;
  private cellGroups = new Map<string, SVGGElement>();
  private pathPreviewGroup: SVGGElement | null = null;
  private reachableKeys = new Set<string>();
  private offsetX = 0;
  private offsetY = 0;

  constructor(options: HexGridOptions) {
    this.container = options.container;
    this.size = options.size ?? 36;
    this.onCellClick = options.onCellClick;
    this.onCellHover = options.onCellHover;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'hex-svg-wrapper');
    this.container.appendChild(this.svg);
  }

  setGameState(game: GameState): void {
    this.gameState = game;
    this.updateReachable();
    this.render();
  }

  private updateReachable(): void {
    this.reachableKeys.clear();
    if (!this.gameState) return;

    const myceliumKeys = new Set(this.gameState.myceliumCells.map(coordKey));

    for (const mycCoord of this.gameState.myceliumCells) {
      const neighbors = getNeighbors(mycCoord);
      for (const neighbor of neighbors) {
        const nKey = coordKey(neighbor);
        if (!this.gameState.cells[nKey]) continue;
        if (myceliumKeys.has(nKey)) continue;
        const cell = this.gameState.cells[nKey];
        if (cell.type === HexType.POLLUTED) continue;
        this.reachableKeys.add(nKey);
      }
    }
  }

  render(): void {
    if (!this.gameState) return;

    const radius = this.gameState.gridRadius;
    const coords = generateHexGrid(radius);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of coords) {
      const p = hexToPixel(c, this.size);
      if (p.x - this.size < minX) minX = p.x - this.size;
      if (p.x + this.size > maxX) maxX = p.x + this.size;
      if (p.y - this.size < minY) minY = p.y - this.size;
      if (p.y + this.size > maxY) maxY = p.y + this.size;
    }

    const padding = 20;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    this.offsetX = -minX + padding;
    this.offsetY = -minY + padding;

    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.maxWidth = '100%';
    this.svg.style.height = 'auto';

    while (this.svg.firstChild) {
      this.svg.removeChild(this.svg.firstChild);
    }
    this.cellGroups.clear();

    for (const coord of coords) {
      const key = coordKey(coord);
      const cell = this.gameState.cells[key];
      if (!cell) continue;

      const g = this.createCellElement(cell);
      this.svg.appendChild(g);
      this.cellGroups.set(key, g);
    }

    this.renderMyceliumConnections();

    if (this.pathPreviewGroup) {
      this.svg.appendChild(this.pathPreviewGroup);
    }
  }

  private createCellElement(cell: HexCell): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const key = coordKey(cell.coord);
    const pixel = hexToPixel(cell.coord, this.size);
    const cx = pixel.x + this.offsetX;
    const cy = pixel.y + this.offsetY;
    const color = COLORS[cell.type];

    g.setAttribute('class', `hex-cell${this.reachableKeys.has(key) ? ' reachable' : ''}`);
    g.setAttribute('data-q', String(cell.coord.q));
    g.setAttribute('data-r', String(cell.coord.r));

    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', hexCornersPath({ x: cx, y: cy }, this.size - 2));
    shape.setAttribute('fill', color.fill);
    shape.setAttribute('stroke', color.stroke);
    shape.setAttribute('stroke-width', this.reachableKeys.has(key) ? '2' : '1.5');
    shape.setAttribute('class', 'hex-shape');

    if (this.reachableKeys.has(key)) {
      shape.setAttribute('stroke', '#7ed957');
      shape.setAttribute('stroke-dasharray', '4 2');
    }

    g.appendChild(shape);

    this.addCellContent(cell, cx, cy, g);

    g.addEventListener('click', () => {
      if (this.onCellClick) {
        this.onCellClick(cell.coord);
      }
    });

    g.addEventListener('mouseenter', (e) => {
      if (this.onCellHover) {
        const rect = this.svg.getBoundingClientRect();
        const scaleX = rect.width / parseFloat(this.svg.getAttribute('width') || '1');
        const scaleY = rect.height / parseFloat(this.svg.getAttribute('height') || '1');
        this.onCellHover(cell.coord, {
          x: cx * scaleX + rect.left,
          y: cy * scaleY + rect.top,
        });
      }
    });

    g.addEventListener('mouseleave', () => {
      if (this.onCellHover) {
        this.onCellHover(null, null);
      }
    });

    return g;
  }

  private addCellContent(cell: HexCell, cx: number, cy: number, g: SVGGElement): void {
    switch (cell.type) {
      case HexType.START: {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', String(this.size * 0.6));
        text.setAttribute('fill', '#fff');
        text.textContent = '🏠';
        g.appendChild(text);
        break;
      }
      case HexType.NUTRIENT: {
        const connected = this.gameState?.connectedNutrients.includes(cell.nutrientId || '');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', String(this.size * 0.55));
        text.textContent = connected ? '✅' : '🪵';
        g.appendChild(text);
        break;
      }
      case HexType.POLLUTED: {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', String(this.size * 0.5));
        text.textContent = '☢️';
        g.appendChild(text);
        break;
      }
      case HexType.MYCELIUM: {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(this.size * 0.3));
        circle.setAttribute('fill', '#a8e063');
        g.appendChild(circle);
        break;
      }
    }
  }

  private renderMyceliumConnections(): void {
    if (!this.gameState || this.gameState.myceliumCells.length < 2) return;

    const connections: SVGGElement = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    connections.setAttribute('pointer-events', 'none');

    const myceliumSet = new Set(this.gameState.myceliumCells.map(coordKey));

    for (const coord of this.gameState.myceliumCells) {
      const neighbors = getNeighbors(coord);
      for (const neighbor of neighbors) {
        if (!myceliumSet.has(coordKey(neighbor))) continue;

        const p1 = hexToPixel(coord, this.size);
        const p2 = hexToPixel(neighbor, this.size);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(p1.x + this.offsetX));
        line.setAttribute('y1', String(p1.y + this.offsetY));
        line.setAttribute('x2', String(p2.x + this.offsetX));
        line.setAttribute('y2', String(p2.y + this.offsetY));
        line.setAttribute('stroke', '#7ed957');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.8');
        connections.appendChild(line);
      }
    }

    this.svg.insertBefore(connections, this.svg.firstChild);
  }

  showPathPreview(path: HexCoord[] | null): void {
    if (this.pathPreviewGroup) {
      if (this.svg.contains(this.pathPreviewGroup)) {
        this.svg.removeChild(this.pathPreviewGroup);
      }
      this.pathPreviewGroup = null;
    }

    if (!path || path.length < 2) return;

    this.pathPreviewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.pathPreviewGroup.setAttribute('pointer-events', 'none');

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = hexToPixel(path[i], this.size);
      const p2 = hexToPixel(path[i + 1], this.size);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(p1.x + this.offsetX));
      line.setAttribute('y1', String(p1.y + this.offsetY));
      line.setAttribute('x2', String(p2.x + this.offsetX));
      line.setAttribute('y2', String(p2.y + this.offsetY));
      line.setAttribute('stroke', '#ffeb3b');
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-dasharray', '8 4');
      line.setAttribute('opacity', '0.9');
      this.pathPreviewGroup.appendChild(line);
    }

    for (let i = 1; i < path.length; i++) {
      const p = hexToPixel(path[i], this.size);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(p.x + this.offsetX));
      circle.setAttribute('cy', String(p.y + this.offsetY));
      circle.setAttribute('r', String(6));
      circle.setAttribute('fill', '#ffeb3b');
      circle.setAttribute('opacity', '0.8');
      this.pathPreviewGroup.appendChild(circle);
    }

    this.svg.appendChild(this.pathPreviewGroup);
  }

  destroy(): void {
    if (this.svg.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
    }
  }
}
