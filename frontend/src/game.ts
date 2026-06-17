import './styles.css';
import { GameState, HexCoord, HexType, GameConfig } from './types';
import { HexGridRenderer } from './hexGrid';
import { createGame, getGame, extendMycelium, undoMove, resetGame, findPath } from './api';
import { coordKey, findPathAStar, PixelCoord } from './hexUtils';

type MessageType = 'info' | 'success' | 'error';

interface GameUI {
  hexContainer: HTMLElement;
  panelContainer: HTMLElement;
}

interface AdvancedConfig {
  gridRadius: number;
  nutrientCount: number;
  pollutedDensity: number;
  useStepBudget: boolean;
  stepBudget: number;
}

export class FungiGame {
  private ui: GameUI;
  private gameState: GameState | null = null;
  private hexGrid: HexGridRenderer;
  private selectedLevel = 1;
  private showAdvancedConfig = false;
  private advancedConfig: AdvancedConfig = {
    gridRadius: 4,
    nutrientCount: 3,
    pollutedDensity: 0.2,
    useStepBudget: false,
    stepBudget: 20,
  };
  private lastCustomConfig: GameConfig | null = null;
  private message: { text: string; type: MessageType } | null = null;
  private tooltipEl: HTMLElement | null = null;
  private messageTimeout: any = null;
  private isProcessing = false;
  private previewPathCoord: HexCoord | null = null;

  constructor() {
    const hexContainer = document.getElementById('hex-container')!;
    const panelContainer = document.getElementById('panel-container')!;

    this.ui = { hexContainer, panelContainer };

    this.hexGrid = new HexGridRenderer({
      container: hexContainer,
      size: 38,
      onCellClick: (coord) => this.handleCellClick(coord),
      onCellHover: (coord, pixel) => this.handleCellHover(coord, pixel),
    });

    this.initUI();
  }

  private initUI(): void {
    this.renderPanel();
    this.startNewGame(this.selectedLevel);
  }

  private renderPanel(): void {
    this.ui.panelContainer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'app-header';
    header.innerHTML = `
      <h1>🍄 真菌网络扩增</h1>
      <div class="subtitle">用最少步数连接所有腐木营养源</div>
    `;
    document.getElementById('app-header')!.innerHTML = '';
    document.getElementById('app-header')!.appendChild(header);

    const levelSection = this.createLevelSection();
    this.ui.panelContainer.appendChild(levelSection);

    if (this.message) {
      const msgBox = document.createElement('div');
      msgBox.className = `message-box message-${this.message.type}`;
      msgBox.textContent = this.message.text;
      this.ui.panelContainer.appendChild(msgBox);
    }

    if (this.gameState) {
      const statsSection = this.createStatsSection();
      this.ui.panelContainer.appendChild(statsSection);

      const controlsSection = this.createControlsSection();
      this.ui.panelContainer.appendChild(controlsSection);

      const legendSection = this.createLegendSection();
      this.ui.panelContainer.appendChild(legendSection);
    }

    if (this.gameState?.status === 'won') {
      this.showWinModal();
    } else if (this.gameState?.status === 'lost') {
      this.showLoseModal();
    }
  }

  private createLevelSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">选择关卡</div>`;

    const levelSelector = document.createElement('div');
    levelSelector.className = 'level-selector';

    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = `level-btn${i === this.selectedLevel && !this.showAdvancedConfig ? ' active' : ''}`;
      btn.textContent = String(i);
      btn.onclick = () => {
        this.selectedLevel = i;
        this.showAdvancedConfig = false;
        this.lastCustomConfig = null;
        this.startNewGame(i);
      };
      levelSelector.appendChild(btn);
    }

    section.appendChild(levelSelector);

    const advancedToggle = document.createElement('button');
    advancedToggle.className = `btn btn-advanced-toggle${this.showAdvancedConfig ? ' active' : ''}`;
    advancedToggle.innerHTML = '⚙️ 高级配置';
    advancedToggle.style.marginTop = '12px';
    advancedToggle.style.width = '100%';
    advancedToggle.onclick = () => {
      this.showAdvancedConfig = !this.showAdvancedConfig;
      this.renderPanel();
    };
    section.appendChild(advancedToggle);

    if (this.showAdvancedConfig) {
      const advancedPanel = this.createAdvancedConfigPanel();
      section.appendChild(advancedPanel);
    }

    return section;
  }

  private estimatePollutedCount(radius: number, nutrientCount: number, density: number): number {
    const totalCells = 3 * radius * (radius + 1) + 1;
    const availableForPlacement = Math.max(0, totalCells - 1 - Math.min(7, totalCells / 4));
    const afterNutrients = Math.max(0, availableForPlacement - nutrientCount);
    return Math.floor(afterNutrients * Math.max(0, Math.min(0.7, density)));
  }

  private createAdvancedConfigPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'advanced-config-panel';
    panel.style.marginTop = '16px';
    panel.style.padding = '16px';
    panel.style.background = '#1a1a2e';
    panel.style.borderRadius = '12px';
    panel.style.border = '1px solid #2a2a4a';

    const addSlider = (
      label: string,
      value: number,
      min: number,
      max: number,
      key: keyof AdvancedConfig
    ) => {
      const row = document.createElement('div');
      row.style.marginBottom = '16px';

      const labelRow = document.createElement('div');
      labelRow.style.display = 'flex';
      labelRow.style.justifyContent = 'space-between';
      labelRow.style.marginBottom = '8px';
      labelRow.innerHTML = `
        <span style="font-size: 13px; color: #d0d0e0;">${label}</span>
        <span style="font-size: 13px; color: #7ed957; font-weight: 600;">${value}</span>
      `;
      row.appendChild(labelRow);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(min);
      slider.max = String(max);
      slider.value = String(value);
      slider.style.width = '100%';
      slider.style.accentColor = '#7ed957';
      slider.oninput = (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        (this.advancedConfig as any)[key] = val;
        (labelRow.querySelector('span:last-child') as HTMLElement).textContent = String(val);
        updateDensityDisplay();
      };
      row.appendChild(slider);

      return row;
    };

    const updateDensityDisplay = () => {
      const estCount = this.estimatePollutedCount(
        this.advancedConfig.gridRadius,
        this.advancedConfig.nutrientCount,
        this.advancedConfig.pollutedDensity / 100
      );
      const densityPercent = this.advancedConfig.pollutedDensity;
      if (densityValueEl) densityValueEl.textContent = `${densityPercent}% (约${estCount}格)`;
    };

    panel.appendChild(addSlider('地图半径', this.advancedConfig.gridRadius, 2, 8, 'gridRadius'));
    panel.appendChild(addSlider('营养源数量', this.advancedConfig.nutrientCount, 1, 12, 'nutrientCount'));

    const densityRow = document.createElement('div');
    densityRow.style.marginBottom = '16px';

    const densityLabelRow = document.createElement('div');
    densityLabelRow.style.display = 'flex';
    densityLabelRow.style.justifyContent = 'space-between';
    densityLabelRow.style.marginBottom = '8px';
    const estCount = this.estimatePollutedCount(
      this.advancedConfig.gridRadius,
      this.advancedConfig.nutrientCount,
      this.advancedConfig.pollutedDensity / 100
    );
    const densityLabel = document.createElement('span');
    densityLabel.style.fontSize = '13px';
    densityLabel.style.color = '#d0d0e0';
    densityLabel.textContent = '污染区密度';
    const densityValueEl = document.createElement('span');
    densityValueEl.style.fontSize = '13px';
    densityValueEl.style.color = '#7ed957';
    densityValueEl.style.fontWeight = '600';
    densityValueEl.textContent = `${this.advancedConfig.pollutedDensity}% (约${estCount}格)`;
    densityLabelRow.appendChild(densityLabel);
    densityLabelRow.appendChild(densityValueEl);
    densityRow.appendChild(densityLabelRow);

    const densitySlider = document.createElement('input');
    densitySlider.type = 'range';
    densitySlider.min = '0';
    densitySlider.max = '70';
    densitySlider.value = String(this.advancedConfig.pollutedDensity);
    densitySlider.style.width = '100%';
    densitySlider.style.accentColor = '#7ed957';
    densitySlider.oninput = (e) => {
      const val = parseInt((e.target as HTMLInputElement).value);
      this.advancedConfig.pollutedDensity = val;
      updateDensityDisplay();
    };
    densityRow.appendChild(densitySlider);
    panel.appendChild(densityRow);

    const stepBudgetRow = document.createElement('div');
    stepBudgetRow.style.marginTop = '16px';
    stepBudgetRow.style.paddingTop = '16px';
    stepBudgetRow.style.borderTop = '1px solid #2a2a4a';

    const budgetToggle = document.createElement('label');
    budgetToggle.style.display = 'flex';
    budgetToggle.style.alignItems = 'center';
    budgetToggle.style.gap = '10px';
    budgetToggle.style.cursor = 'pointer';
    budgetToggle.innerHTML = `
      <input type="checkbox" ${this.advancedConfig.useStepBudget ? 'checked' : ''} 
             style="width: 18px; height: 18px; accent-color: #7ed957;">
      <span style="font-size: 14px; color: #d0d0e0;">启用步数预算</span>
    `;
    const checkbox = budgetToggle.querySelector('input')!;
    checkbox.onchange = (e) => {
      this.advancedConfig.useStepBudget = (e.target as HTMLInputElement).checked;
      this.renderPanel();
    };
    stepBudgetRow.appendChild(budgetToggle);

    if (this.advancedConfig.useStepBudget) {
      const budgetSlider = addSlider('步数预算', this.advancedConfig.stepBudget, 5, 100, 'stepBudget');
      budgetSlider.style.marginTop = '12px';
      stepBudgetRow.appendChild(budgetSlider);
    }

    panel.appendChild(stepBudgetRow);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary';
    startBtn.innerHTML = '🎮 生成自定义地图';
    startBtn.style.width = '100%';
    startBtn.style.marginTop = '16px';
    startBtn.onclick = () => {
      const config: GameConfig = {
        gridRadius: this.advancedConfig.gridRadius,
        nutrientCount: this.advancedConfig.nutrientCount,
        pollutedDensity: this.advancedConfig.pollutedDensity / 100,
        useStepBudget: this.advancedConfig.useStepBudget,
        stepBudget: this.advancedConfig.stepBudget,
      };
      this.lastCustomConfig = config;
      this.startNewGame(this.selectedLevel, config);
    };
    panel.appendChild(startBtn);

    return panel;
  }

  private createStatsSection(): HTMLElement {
    const section = document.createElement('div');

    section.innerHTML = `<div class="section-title">游戏进度</div>`;

    const grid = document.createElement('div');
    grid.className = 'stats-grid';

    const progress = this.gameState!.nutrients.length > 0
      ? (this.gameState!.connectedNutrients.length / this.gameState!.nutrients.length) * 100
      : 0;

    const stepsRatio = this.gameState!.steps / Math.max(1, this.gameState!.optimalSteps);
    let stepsClass = '';
    if (stepsRatio <= 1.2) stepsClass = '';
    else if (stepsRatio <= 1.5) stepsClass = 'warning';
    else stepsClass = 'danger';

    let statsHtml = `
      <div class="stat-card">
        <div class="stat-label">当前步数</div>
        <div class="stat-value ${stepsClass}">${this.gameState!.steps}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最优步数</div>
        <div class="stat-value info">${this.gameState!.optimalSteps}</div>
      </div>
    `;

    if (this.gameState!.useStepBudget) {
      const budgetRemaining = Math.max(0, this.gameState!.stepBudget - this.gameState!.steps);
      const budgetRatio = this.gameState!.steps / this.gameState!.stepBudget;
      let budgetClass = '';
      if (budgetRatio <= 0.6) budgetClass = '';
      else if (budgetRatio <= 0.85) budgetClass = 'warning';
      else budgetClass = 'danger';

      statsHtml += `
        <div class="stat-card">
          <div class="stat-label">剩余步数</div>
          <div class="stat-value ${budgetClass}">${budgetRemaining}</div>
        </div>
      `;
    }

    statsHtml += `
      <div class="stat-card">
        <div class="stat-label">营养源</div>
        <div class="stat-value">${this.gameState!.connectedNutrients.length}/${this.gameState!.nutrients.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">关卡</div>
        <div class="stat-value info">${this.gameState!.level}</div>
      </div>
    `;

    grid.innerHTML = statsHtml;

    section.appendChild(grid);

    const progressWrap = document.createElement('div');
    progressWrap.style.marginBottom = '24px';
    progressWrap.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8a8a9a; margin-bottom: 4px;">
      <span>连接进度</span>
      <span>${Math.round(progress)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress}%"></div>
    </div>
    `;
    section.appendChild(progressWrap);

    return section;
  }

  private createControlsSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">操作</div>`;

    const controls = document.createElement('div');
    controls.className = 'controls';

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary';
    undoBtn.innerHTML = '↩️ 撤销上一步';
    undoBtn.disabled = this.gameState!.myceliumCells.length <= 1 || this.isProcessing;
    undoBtn.onclick = () => this.handleUndo();
    controls.appendChild(undoBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.innerHTML = '🔄 重置关卡';
    resetBtn.disabled = this.isProcessing;
    resetBtn.onclick = () => this.handleReset();
    controls.appendChild(resetBtn);

    const newGameBtn = document.createElement('button');
    newGameBtn.className = 'btn btn-primary';
    newGameBtn.innerHTML = '🎮 新游戏';
    newGameBtn.onclick = () => {
      if (this.lastCustomConfig) {
        this.startNewGame(this.selectedLevel, this.lastCustomConfig);
      } else {
        this.startNewGame(this.selectedLevel);
      }
    };
    controls.appendChild(newGameBtn);

    section.appendChild(controls);
    return section;
  }

  private createLegendSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">图例说明</div>`;

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: #5fa8d3;"></div>
        <div class="legend-text">🏠 菌丝起点（菌落）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #6ab04c;"></div>
        <div class="legend-text">🍄 菌丝区域</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #c68642;"></div>
        <div class="legend-text">🪵 腐木营养源（需连接）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #8b0000;"></div>
        <div class="legend-text">☢️ 重金属污染区（禁止）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #2a2a4a; border: 1px dashed #7ed957;"></div>
        <div class="legend-text">⬜ 可蔓延区域（虚线框）</div>
      </div>
    `;

    section.appendChild(legend);
    return section;
  }

  private showWinModal(): void {
    if (document.querySelector('.win-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'win-modal';

    const steps = this.gameState!.steps;
    const optimal = this.gameState!.optimalSteps;
    const ratio = steps / optimal;

    let stars = 3;
    let starText = '⭐⭐⭐';
    if (ratio > 1.5) {
      stars = 1;
      starText = '⭐☆☆';
    } else if (ratio > 1.2) {
      stars = 2;
      starText = '⭐⭐☆';
    }

    modal.innerHTML = `
      <div class="win-modal-content">
        <div class="win-title">🎉 连接成功！</div>
        <div style="margin: 16px 0;">${starText.split('').map((s, i) => `<span class="star ${s === '⭐' ? 'filled' : ''}" style="animation-delay: ${i * 0.15}s">${s}</span>`).join('')}</div>
        <div class="win-stats">
          <div class="win-stat">
            <div class="win-stat-label">你的步数</div>
            <div class="win-stat-value">${steps}</div>
          </div>
          <div class="win-stat">
            <div class="win-stat-label">最优步数</div>
            <div class="win-stat-value">${optimal}</div>
          </div>
        </div>
        <div style="color: #8a8a9a; font-size: 13px; margin-bottom: 24px;">
          ${stars === 3 ? '完美！你找到了最优解！' : stars === 2 ? '表现不错，还能更优！' : '再接再厉，寻找更短的路径！'}
        </div>
        <div style="display: flex; gap: 10px; flex-direction: column;">
          ${this.selectedLevel < 5 ? `<button class="btn btn-primary" id="next-level-btn">🚀 下一关</button>` : ''}
          <button class="btn btn-secondary" id="replay-btn">🔄 再玩一次</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const nextBtn = modal.querySelector('#next-level-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.selectedLevel = Math.min(5, this.selectedLevel + 1);
      this.lastCustomConfig = null;
      this.startNewGame(this.selectedLevel);
    });
    }

    const replayBtn = modal.querySelector('#replay-btn')!;
    replayBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      if (this.lastCustomConfig) {
        this.startNewGame(this.selectedLevel, this.lastCustomConfig);
      } else {
        this.startNewGame(this.selectedLevel);
      }
    });
  }

  private showLoseModal(): void {
    if (document.querySelector('.lose-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'win-modal lose-modal';

    const steps = this.gameState!.steps;
    const total = this.gameState!.nutrients.length;
    const connected = this.gameState!.connectedNutrients.length;

    modal.innerHTML = `
      <div class="win-modal-content">
        <div class="win-title" style="color: #ff6b6b;">💀 挑战失败</div>
        <div style="font-size: 48px; margin: 16px 0;">😔</div>
        <div class="win-stats">
          <div class="win-stat">
            <div class="win-stat-label">已用步数</div>
            <div class="win-stat-value" style="color: #ff6b6b;">${steps}</div>
          </div>
          <div class="win-stat">
            <div class="win-stat-label">连接营养源</div>
            <div class="win-stat-value">${connected}/${total}</div>
          </div>
        </div>
        <div style="color: #8a8a9a; font-size: 13px; margin-bottom: 24px;">
          步数预算已用尽，再试一次吧！
        </div>
        <div style="display: flex; gap: 10px; flex-direction: column;">
          <button class="btn btn-primary" id="retry-btn">🔄 重新挑战</button>
          <button class="btn btn-secondary" id="close-lose-btn">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const retryBtn = modal.querySelector('#retry-btn')!;
    retryBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.handleReset();
    });

    const closeBtn = modal.querySelector('#close-lose-btn')!;
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  private async startNewGame(level: number, config?: GameConfig): Promise<void> {
    this.setProcessing(true);
    this.showMessage('正在生成新地图...', 'info');

    try {
      this.gameState = await createGame(level, config);
      this.hexGrid.setGameState(this.gameState);
      if (config) {
        this.showMessage('自定义地图生成成功！连接所有腐木营养源', 'success');
      } else {
        this.showMessage(`第 ${level} 关开始！连接所有腐木营养源`, 'success');
      }
      this.renderPanel();
    } catch (e) {
      this.showMessage('创建游戏失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleCellClick(coord: HexCoord): Promise<void> {
    if (this.isProcessing || !this.gameState || this.gameState.status !== 'playing') return;

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    if (cell.type === HexType.POLLUTED) {
      this.showMessage('⚠️ 不能蔓延到重金属污染区！', 'error');
      return;
    }

    this.setProcessing(true);

    try {
      this.gameState = await extendMycelium(this.gameState.id, coord);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;

      if (this.gameState.status === 'won') {
        this.showMessage('🎊 恭喜！成功连接所有营养源！', 'success');
      } else if (cell.type === HexType.NUTRIENT && cell.nutrientId && this.gameState.connectedNutrients.includes(cell.nutrientId)) {
        this.showMessage('✅ 成功连接一个营养源！', 'success');
      }

      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private handleCellHover(coord: HexCoord | null, pixel: PixelCoord | null): void {
    if (!this.gameState) return;

    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }

    if (!coord || !pixel) {
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;
      return;
    }

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    const myceliumSet = new Set(this.gameState.myceliumCells.map(coordKey));
    if (!myceliumSet.has(key)) {
      if (cell.type !== HexType.POLLUTED) {
        const fromCoord = this.gameState.myceliumCells[this.gameState.myceliumCells.length - 1];
        const path = findPathAStar(fromCoord, coord, this.gameState.cells, this.gameState.gridRadius, [HexType.POLLUTED]);
        if (path) {
          this.hexGrid.showPathPreview(path);
          this.previewPathCoord = coord;

          this.tooltipEl = document.createElement('div');
          this.tooltipEl.className = 'hex-tooltip';
          this.tooltipEl.style.left = `${pixel.x}px`;
          this.tooltipEl.style.top = `${pixel.y}px`;
          const cellName = this.getCellDisplayName(cell);
          const reachable = this.hexGrid['reachableKeys']?.has(key) ? '（可直接蔓延）' : '';
          this.tooltipEl.textContent = `${cellName} ${reachable} • 路径长度: ${path.length - 1} 步`;
          document.body.appendChild(this.tooltipEl);
        }
      }
    }
  }

  private getCellDisplayName(cell: any): string {
    switch (cell.type) {
      case HexType.EMPTY: return '空白区域';
      case HexType.NUTRIENT: return '🪵 腐木营养源';
      case HexType.POLLUTED: return '☢️ 污染区';
      case HexType.MYCELIUM: return '🍄 菌丝区';
      case HexType.START: return '🏠 起点菌落';
      default: return '未知';
    }
  }

  private async handleUndo(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);

    try {
      this.gameState = await undoMove(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('↩️ 已撤销上一步', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '撤销失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleReset(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);
    this.showMessage('正在重置...', 'info');

    try {
      this.gameState = await resetGame(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('🔄 关卡已重置', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '重置失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private showMessage(text: string, type: MessageType = 'info'): void {
    this.message = { text, type };
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.renderPanel();

    if (!(type === 'success' && this.gameState?.status === 'won')) {
      this.messageTimeout = setTimeout(() => {
        this.message = null;
        this.renderPanel();
      }, 3000);
    }
  }

  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;
    if (processing || this.gameState) {
      this.renderPanel();
    }
  }
}
