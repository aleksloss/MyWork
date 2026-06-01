const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function getFieldWidth() {
  return canvas.width;
}

function getFieldHeight() {
  return canvas.height;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const newWidth = Math.max(1, Math.floor(rect.width));
  const newHeight = Math.max(1, Math.floor(rect.height));
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;

  if (newWidth === oldWidth && newHeight === oldHeight) {
    return;
  }

  const ratioX = oldWidth > 0 ? newWidth / oldWidth : 1;
  const ratioY = oldHeight > 0 ? newHeight / oldHeight : 1;

  canvas.width = newWidth;
  canvas.height = newHeight;

  state.player.x *= ratioX;
  state.player.y *= ratioY;

  state.enemies.forEach(enemy => {
    enemy.x *= ratioX;
    enemy.y *= ratioY;
  });

  state.particles.forEach(particle => {
    particle.x *= ratioX;
    particle.y *= ratioY;
    particle.vx *= ratioX;
    particle.vy *= ratioY;
  });
}

const CONSTANTS = {
  canvasWidth: canvas.width,
  canvasHeight: canvas.height,
  playerSize: 20,
  playerColor: '#4caf50',
  backgroundColor: '#1e1e1e',
  enemyRadius: 10,
  enemyColor: '#e53935',
  scorePerSecond: 1,
  shakeDuration: 0.2,
  shakeMagnitude: 8,
  particleCount: 30,
  particleLife: 0.6,
  particleSpeed: 220,
  particleColors: ['#ffb74d', '#ff8a65', '#ffffff'],
  gridSpacing: 40,
  backgroundSpeed: 20,
  backgroundDotSpacing: 80
};

const HIGH_SCORE_KEY = 'canvas_apocalypse_highscore';

const DIFFICULTY_PRESETS = {
  easy: {
    playerSpeed: 240,
    enemyBaseSpeed: 100,
    enemyMaxSpeed: 180,
    enemySpawnInterval: 3.5,
    minEnemySpawnInterval: 1.4,
    difficultyRampTime: 60
  },
  medium: {
    playerSpeed: 240,
    enemyBaseSpeed: 120,
    enemyMaxSpeed: 200,
    enemySpawnInterval: 3,
    minEnemySpawnInterval: 1.1,
    difficultyRampTime: 45
  },
  hard: {
    playerSpeed: 240,
    enemyBaseSpeed: 140,
    enemyMaxSpeed: 220,
    enemySpawnInterval: 2.5,
    minEnemySpawnInterval: 0.9,
    difficultyRampTime: 30
  }
};

const keysPressed = new Set();
let lastFrameTime = performance.now();
const playerIcon = document.getElementById('playerIcon');
const canvasWrapper = document.querySelector('.canvas-wrapper');

const state = {
  player: {
    x: (getFieldWidth() - CONSTANTS.playerSize) / 2,
    y: (getFieldHeight() - CONSTANTS.playerSize) / 2
  },
  enemies: [],
  particles: [],
  spawnTimer: 0,
  shakeTimer: 0,
  shakeX: 0,
  shakeY: 0,
  backgroundOffsetX: 0,
  backgroundOffsetY: 0,
  gameOver: false,
  time: 0,
  score: 0,
  highScore: 0,
  gameState: 'MENU',
  difficulty: 'medium',
  playerSpeed: DIFFICULTY_PRESETS.medium.playerSpeed,
  enemyBaseSpeed: DIFFICULTY_PRESETS.medium.enemyBaseSpeed,
  enemyMaxSpeed: DIFFICULTY_PRESETS.medium.enemyMaxSpeed,
  enemySpawnInterval: DIFFICULTY_PRESETS.medium.enemySpawnInterval,
  minEnemySpawnInterval: DIFFICULTY_PRESETS.medium.minEnemySpawnInterval,
  difficultyRampTime: DIFFICULTY_PRESETS.medium.difficultyRampTime
};

state.highScore = loadHighScore();

function clearCanvas() {
  ctx.fillStyle = CONSTANTS.backgroundColor;
  ctx.fillRect(0, 0, getFieldWidth(), getFieldHeight());
}

function drawPlayer() {
  ctx.fillStyle = CONSTANTS.playerColor;
  ctx.fillRect(state.player.x, state.player.y, CONSTANTS.playerSize, CONSTANTS.playerSize);
}

function drawEnemies() {
  const enemies = state.enemies;
  for (let i = 0, len = enemies.length; i < len; i += 1) {
    const enemy = enemies[i];
    if (enemy.el) {
      enemy.el.style.left = `${enemy.x}px`;
      enemy.el.style.top = `${enemy.y}px`;
    }
  }
}

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  const margin = CONSTANTS.enemyRadius;
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = Math.random() * (getFieldWidth() - margin * 2) + margin;
    y = margin;
  } else if (edge === 1) {
    x = Math.random() * (getFieldWidth() - margin * 2) + margin;
    y = getFieldHeight() - margin;
  } else if (edge === 2) {
    x = margin;
    y = Math.random() * (getFieldHeight() - margin * 2) + margin;
  } else {
    x = getFieldWidth() - margin;
    y = Math.random() * (getFieldHeight() - margin * 2) + margin;
  }

  const enemyEl = document.createElement('i');
  enemyEl.className = 'fi fi-sc-snake enemyIcon';
  enemyEl.style.left = `${x}px`;
  enemyEl.style.top = `${y}px`;
  if (canvasWrapper) {
    canvasWrapper.appendChild(enemyEl);
  }

  state.enemies.push({ x, y, el: enemyEl });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadHighScore() {
  try {
    const saved = localStorage.getItem(HIGH_SCORE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch (error) {
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(Math.max(0, Math.floor(value))));
  } catch (error) {
    // Ignore storage errors.
  }
}

function createParticle(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = Math.random() * CONSTANTS.particleSpeed * 0.5 + CONSTANTS.particleSpeed * 0.5;
  const life = Math.random() * CONSTANTS.particleLife * 0.6 + CONSTANTS.particleLife * 0.4;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    alpha: 1,
    color: CONSTANTS.particleColors[Math.floor(Math.random() * CONSTANTS.particleColors.length)]
  };
}

function spawnExplosion(x, y) {
  for (let i = 0; i < CONSTANTS.particleCount; i += 1) {
    state.particles.push(createParticle(x, y));
  }
}

function updateParticles(deltaTime) {
  const particles = state.particles;
  let writeIndex = 0;
  for (let readIndex = 0, len = particles.length; readIndex < len; readIndex += 1) {
    const particle = particles[readIndex];
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.life -= deltaTime;
    particle.alpha = Math.max(0, particle.life / CONSTANTS.particleLife);

    if (particle.life > 0) {
      particles[writeIndex] = particle;
      writeIndex += 1;
    }
  }
  particles.length = writeIndex;
}

function drawParticles() {
  const particles = state.particles;
  for (let i = 0, len = particles.length; i < len; i += 1) {
    const particle = particles[i];
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateBackground(deltaTime) {
  state.backgroundOffsetX = (state.backgroundOffsetX + deltaTime * CONSTANTS.backgroundSpeed) % CONSTANTS.gridSpacing;
  state.backgroundOffsetY = (state.backgroundOffsetY + deltaTime * CONSTANTS.backgroundSpeed * 0.6) % CONSTANTS.gridSpacing;
}

function updatePlayerIcon() {
  if (!playerIcon) {
    return;
  }
  const isActive = state.gameState !== 'MENU';
  playerIcon.style.display = isActive ? 'block' : 'none';
  if (isActive) {
    playerIcon.style.left = `${state.player.x}px`;
    playerIcon.style.top = `${state.player.y}px`;
  }
}

function drawBackground() {
  const spacing = CONSTANTS.gridSpacing;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const offsetX = state.backgroundOffsetX - spacing;
  const offsetY = state.backgroundOffsetY - spacing;

  for (let x = offsetX; x <= getFieldWidth(); x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, getFieldHeight());
    ctx.stroke();
  }
  for (let y = offsetY; y <= getFieldHeight(); y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(getFieldWidth(), y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  const dotSpacing = CONSTANTS.backgroundDotSpacing;
  for (let x = offsetX * 2; x <= getFieldWidth(); x += dotSpacing) {
    for (let y = offsetY * 2; y <= getFieldHeight(); y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function isCircleRectColliding(circle, rect) {
  // Standard circle-rect collision: find the closest point on the rect to the circle center.
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function update(deltaTime) {
  updateBackground(deltaTime);
  updateParticles(deltaTime);

  if (state.shakeTimer > 0) {
    state.shakeTimer -= deltaTime;
    if (state.shakeTimer <= 0) {
      state.shakeX = 0;
      state.shakeY = 0;
    }
  }

  if (state.gameState !== 'PLAY') {
    return;
  }

  if (state.gameOver) {
    return;
  }

  state.time += deltaTime;
  state.score += CONSTANTS.scorePerSecond * deltaTime;

  const difficultyFactor = Math.min(state.time / state.difficultyRampTime, 1);
  const currentEnemySpeed = state.enemyBaseSpeed + difficultyFactor * (state.enemyMaxSpeed - state.enemyBaseSpeed);
  const currentSpawnInterval = Math.max(
    state.enemySpawnInterval - difficultyFactor * (state.enemySpawnInterval - state.minEnemySpawnInterval),
    state.minEnemySpawnInterval
  );

  const velocity = { x: 0, y: 0 };

  if (keysPressed.has('ArrowUp') || keysPressed.has('w')) velocity.y -= 1;
  if (keysPressed.has('ArrowDown') || keysPressed.has('s')) velocity.y += 1;
  if (keysPressed.has('ArrowLeft') || keysPressed.has('a')) velocity.x -= 1;
  if (keysPressed.has('ArrowRight') || keysPressed.has('d')) velocity.x += 1;

  if (velocity.x !== 0 || velocity.y !== 0) {
    const length = Math.hypot(velocity.x, velocity.y);
    velocity.x /= length;
    velocity.y /= length;
  }

  state.player.x += velocity.x * state.playerSpeed * deltaTime;
  state.player.y += velocity.y * state.playerSpeed * deltaTime;

  state.player.x = clamp(state.player.x, 0, getFieldWidth() - CONSTANTS.playerSize);
  state.player.y = clamp(state.player.y, 0, getFieldHeight() - CONSTANTS.playerSize);

  const playerCenter = {
    x: state.player.x + CONSTANTS.playerSize / 2,
    y: state.player.y + CONSTANTS.playerSize / 2
  };

  const enemies = state.enemies;
  for (let i = 0, len = enemies.length; i < len; i += 1) {
    const enemy = enemies[i];
    let dx = playerCenter.x - enemy.x;
    let dy = playerCenter.y - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
      dx /= distance;
      dy /= distance;
      enemy.x += dx * currentEnemySpeed * deltaTime;
      enemy.y += dy * currentEnemySpeed * deltaTime;
    }

    enemy.x = clamp(enemy.x, CONSTANTS.enemyRadius, getFieldWidth() - CONSTANTS.enemyRadius);
    enemy.y = clamp(enemy.y, CONSTANTS.enemyRadius, getFieldHeight() - CONSTANTS.enemyRadius);

    if (
      isCircleRectColliding(
        { x: enemy.x, y: enemy.y, radius: CONSTANTS.enemyRadius },
        { x: state.player.x, y: state.player.y, width: CONSTANTS.playerSize, height: CONSTANTS.playerSize }
      )
    ) {
      state.gameOver = true;
      state.gameState = 'GAME_OVER';
      state.shakeTimer = CONSTANTS.shakeDuration;
      state.shakeX = 0;
      state.shakeY = 0;
      spawnExplosion(enemy.x, enemy.y);
      const finalScore = Math.floor(state.score);
      if (finalScore > state.highScore) {
        state.highScore = finalScore;
        saveHighScore(finalScore);
      }
      break;
    }
  }

  state.spawnTimer += deltaTime;
  if (state.spawnTimer >= currentSpawnInterval) {
    state.spawnTimer -= currentSpawnInterval;
    spawnEnemy();
  }
}

function drawHud() {
  const padding = 12;
  const lineHeight = 22;
  const panelWidth = 160;
  const panelHeight = padding * 2 + lineHeight * 3;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(12, 12, panelWidth, panelHeight);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Survived', 20, 12 + padding + 14);

  ctx.font = '14px Arial';
  ctx.fillText(`${state.time.toFixed(1)}s`, 20, 12 + padding + lineHeight + 4);

  ctx.fillText('Score', 20, 12 + padding + lineHeight * 2 + 2);
  ctx.fillText(`${Math.floor(state.score)}`, 84, 12 + padding + lineHeight * 2 + 2);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, getFieldWidth(), getFieldHeight());
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px Arial';
  ctx.fillText('GAME OVER', getFieldWidth() / 2, getFieldHeight() / 2 - 20);
  ctx.font = '20px Arial';
  ctx.fillText('Press R to restart', getFieldWidth() / 2, getFieldHeight() / 2 + 24);
  ctx.font = '16px Arial';
  ctx.fillText(`High Score: ${state.highScore}`, getFieldWidth() / 2, getFieldHeight() / 2 + 52);
}

function drawMenu() {
  clearCanvas();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';

  ctx.font = 'bold 42px Arial';
  ctx.fillText('ENEMY SURVIVAL', getFieldWidth() / 2, 140);

  ctx.font = '18px Arial';
  ctx.fillText('Choose difficulty to begin', getFieldWidth() / 2, 190);
  ctx.fillText('1 - Easy   2 - Medium   3 - Hard', getFieldWidth() / 2, 230);

  ctx.font = '16px Arial';
  ctx.fillText('Press 1, 2, or 3 to start.', getFieldWidth() / 2, 270);
  ctx.fillText(`High Score: ${state.highScore}`, getFieldWidth() / 2, 300);
}

function drawGameScene() {
  ctx.save();
  const shakeAmount = state.shakeTimer > 0 ? CONSTANTS.shakeMagnitude : 0;
  if (shakeAmount > 0) {
    state.shakeX = (Math.random() - 0.5) * shakeAmount;
    state.shakeY = (Math.random() - 0.5) * shakeAmount;
  }
  ctx.translate(state.shakeX, state.shakeY);
  drawBackground();
  drawEnemies();
  drawParticles();
  ctx.restore();

  updatePlayerIcon();
  drawHud();
  if (state.gameOver) {
    drawGameOver();
  }
}

function draw() {
  if (state.gameState === 'MENU') {
    clearCanvas();
    drawBackground();
    drawMenu();
    return;
  }

  clearCanvas();
  drawGameScene();
}

function gameLoop(timestamp) {
  const deltaTime = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}

function startGame(difficultyKey) {
  const preset = DIFFICULTY_PRESETS[difficultyKey];
  if (!preset) {
    return;
  }

  state.gameState = 'PLAY';
  state.difficulty = difficultyKey;
  state.player.x = (getFieldWidth() - CONSTANTS.playerSize) / 2;
  state.player.y = (getFieldHeight() - CONSTANTS.playerSize) / 2;
  state.enemies.forEach(enemy => {
    if (enemy.el && enemy.el.parentNode) {
      enemy.el.parentNode.removeChild(enemy.el);
    }
  });
  state.enemies.length = 0;
  state.spawnTimer = 0;
  state.gameOver = false;
  state.time = 0;
  state.score = 0;
  state.playerSpeed = preset.playerSpeed;
  state.enemyBaseSpeed = preset.enemyBaseSpeed;
  state.enemyMaxSpeed = preset.enemyMaxSpeed;
  state.enemySpawnInterval = preset.enemySpawnInterval;
  state.minEnemySpawnInterval = preset.minEnemySpawnInterval;
  state.difficultyRampTime = preset.difficultyRampTime;
  keysPressed.clear();
  spawnEnemy();
  lastFrameTime = performance.now();
}

function resetGame() {
  startGame(state.difficulty);
}

function handleKeyDown(event) {
  const key = event.key;
  if (state.gameState === 'MENU') {
    if (key === '1') {
      startGame('easy');
      event.preventDefault();
      return;
    }
    if (key === '2') {
      startGame('medium');
      event.preventDefault();
      return;
    }
    if (key === '3') {
      startGame('hard');
      event.preventDefault();
      return;
    }
  }

  if (key === 'r' || key === 'R') {
    if (state.gameState === 'GAME_OVER') {
      resetGame();
      event.preventDefault();
      return;
    }
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) {
    keysPressed.add(key);
    event.preventDefault();
  }
}

function handleKeyUp(event) {
  keysPressed.delete(event.key);
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

requestAnimationFrame(gameLoop);
