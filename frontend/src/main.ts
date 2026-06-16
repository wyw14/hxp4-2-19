import { FungiGame } from './game';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div id="app-header"></div>
    <div class="game-container">
      <div class="game-main">
        <div id="hex-container"></div>
      </div>
      <div class="game-panel" id="panel-container"></div>
    </div>
  `;

  new FungiGame();
});
