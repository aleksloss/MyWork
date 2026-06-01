// Retro Platformer game logic
// Controls: Arrow Left / A, Arrow Right / D, Space / W / Up Arrow to jump.

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreValue = document.getElementById('scoreValue');
const livesValue = document.getElementById('livesValue');
const timerValue = document.getElementById('timerValue');
const levelValue = document.getElementById('levelValue');
const pauseButton = document.getElementById('pauseButton');
const menuScreen = document.getElementById('menuScreen');
const gameScreen = document.getElementById('gameScreen');
const messageOverlay = document.getElementById('messageOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const restartButton = document.getElementById('restartButton');
const menuButton = document.getElementById('menuButton');
const startButton = document.getElementById('startButton');
const continueButton = document.getElementById('continueButton');
const storedHighScore = document.getElementById('storedHighScore');
const soundToggleButton = document.getElementById('soundToggleButton');
const menuTip = document.getElementById('menuTip');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;

const state = {
  score: 0,
  lives: 3,
  timer: 0,
  level: 0,
  isPaused: false,
  isPlaying: false,
  isGameOver: false,
  isWon: false,
  highScore: 0,
  intervalId: null,
  keys: {},
  lastFrameTime: 0,
  hiddenBonusUsed: false,
};

const playerSprite = new Image();
playerSprite.src = 'Mario.png';
playerSprite.onload = () => {
  const targetHeight = 48;
  const ratio = playerSprite.naturalWidth / playerSprite.naturalHeight;
  player.width = Math.round(targetHeight * ratio);
  player.height = targetHeight;
  player.spriteCrop = {
    sx: 0,
    sy: 0,
    sw: playerSprite.naturalWidth,
    sh: playerSprite.naturalHeight,
  };
};

const gravity = 0.75;
const friction = 0.93;
const levels = [
  {
    layout: {
      platforms: [
        { x: 0, y: 440, width: 860, height: 60 },
        { x: 120, y: 360, width: 200, height: 20 },
        { x: 420, y: 300, width: 180, height: 20 },
        { x: 680, y: 230, width: 140, height: 20 },
      ],
      coins: [
        { x: 160, y: 320 },
        { x: 470, y: 260 },
        { x: 710, y: 190 },
      ],
      enemies: [
        { x: 300, y: 410, width: 40, height: 30, speed: 1.5, minX: 180, maxX: 380 },
      ],
      bonusBlocks: [
        { x: 500, y: 250, width: 40, height: 40, revealed: false, collected: false },
      ],
      powerUps: [
        { x: 610, y: 190, type: 'star', collected: false },
      ],
      finish: { x: 770, y: 180, width: 60, height: 40 },
    },
    text: 'Start of your hero journey. Collect coins and avoid the patrolling enemy.',
  },
  {
    layout: {
      platforms: [
        { x: 0, y: 440, width: 860, height: 60 },
        { x: 80, y: 340, width: 140, height: 20 },
        { x: 260, y: 280, width: 160, height: 20 },
        { x: 480, y: 220, width: 180, height: 20 },
        { x: 740, y: 160, width: 100, height: 20 },
      ],
      coins: [
        { x: 100, y: 300 },
        { x: 310, y: 240 },
        { x: 540, y: 180 },
        { x: 760, y: 120 },
      ],
      enemies: [
        { x: 220, y: 250, width: 40, height: 30, speed: 1.8, minX: 220, maxX: 420 },
        { x: 600, y: 410, width: 40, height: 30, speed: 1.2, minX: 520, maxX: 760 },
      ],
      bonusBlocks: [
        { x: 340, y: 240, width: 40, height: 40, revealed: false, collected: false },
      ],
      powerUps: [
        { x: 180, y: 300, type: 'life', collected: false },
      ],
      finish: { x: 780, y: 120, width: 60, height: 40 },
    },
    text: 'More platforms, more enemies, and a bonus life hidden in the air.',
  },
  {
    layout: {
      platforms: [
        { x: 0, y: 440, width: 860, height: 60 },
        { x: 140, y: 360, width: 120, height: 20 },
        { x: 320, y: 310, width: 120, height: 20 },
        { x: 520, y: 260, width: 130, height: 20 },
        { x: 700, y: 210, width: 120, height: 20 },
      ],
      coins: [
        { x: 160, y: 320 },
        { x: 340, y: 270 },
        { x: 560, y: 220 },
        { x: 720, y: 170 },
      ],
      enemies: [
        { x: 200, y: 410, width: 40, height: 30, speed: 2, minX: 120, maxX: 260 },
        { x: 410, y: 260, width: 40, height: 30, speed: 1.5, minX: 320, maxX: 440 },
        { x: 660, y: 180, width: 40, height: 30, speed: 1.6, minX: 660, maxX: 820 },
      ],
      bonusBlocks: [
        { x: 230, y: 320, width: 40, height: 40, revealed: false, collected: false },
      ],
      powerUps: [
        { x: 420, y: 270, type: 'star', collected: false },
      ],
      finish: { x: 780, y: 160, width: 60, height: 40 },
      boss: { x: 560, y: 120, width: 80, height: 80, health: 3, direction: 1, speed: 1.4 },
    },
    text: 'Final challenge! Defeat the boss by jumping on it three times.',
  },
];

const player = {
  x: 80,
  y: 380,
  width: 32,
  height: 48,
  vx: 0,
  vy: 0,
  speed: 4.3,
  jumpStrength: -15,
  canJump: false,
  onGround: false,
  invincible: false,
  powerTimer: 0,
  direction: 1,
};

let currentLevel;
let platforms = [];
let coins = [];
let enemies = [];
let bonusBlocks = [];
let powerUps = [];
let finish = null;
let boss = null;

function playSound(type) {
  if (!soundEnabled) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0.12, audioContext.currentTime);

  switch (type) {
    case 'jump':
      oscillator.frequency.value = 320;
      break;
    case 'coin':
      oscillator.frequency.value = 580;
      break;
    case 'hit':
      oscillator.frequency.value = 210;
      break;
    case 'power':
      oscillator.frequency.value = 720;
      break;
    case 'gameover':
      oscillator.frequency.value = 120;
      break;
    default:
      oscillator.frequency.value = 400;
  }
  oscillator.type = 'square';
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.08);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundToggleButton.textContent = `Sound: ${soundEnabled ? 'On' : 'Off'}`;
}

function loadHighScore() {
  const saved = Number(localStorage.getItem('retroPlatformerHighScore') || 0);
  state.highScore = saved;
  storedHighScore.textContent = `High Score: ${state.highScore}`;
}

function saveHighScore() {
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('retroPlatformerHighScore', String(state.highScore));
    storedHighScore.textContent = `High Score: ${state.highScore}`;
  }
}

function resetLevel() {
  player.x = 80;
  player.y = 360;
  player.vx = 0;
  player.vy = 0;
  player.canJump = false;
  player.onGround = false;
  player.invincible = false;
  player.powerTimer = 0;

  const levelDef = levels[state.level];
  platforms = levelDef.layout.platforms.map(platform => ({ ...platform }));
  coins = levelDef.layout.coins.map(coin => ({ ...coin, collected: false }));
  enemies = levelDef.layout.enemies.map(enemy => ({ ...enemy, alive: true, direction: 1 }));
  bonusBlocks = levelDef.layout.bonusBlocks?.map(block => ({ ...block, activated: false })) || [];
  powerUps = levelDef.layout.powerUps?.map(item => ({ ...item, collected: false })) || [];
  finish = { ...levelDef.layout.finish };
  boss = levelDef.layout.boss ? { ...levelDef.layout.boss } : null;
  levelValue.textContent = String(state.level + 1);
}

function startGame() {
  state.score = 0;
  state.lives = 3;
  state.timer = 0;
  state.level = 0;
  state.isPaused = false;
  state.isPlaying = true;
  state.isGameOver = false;
  state.isWon = false;
  resetLevel();
  updateHUD();
  menuScreen.classList.remove('active');
  gameScreen.classList.add('active');
  messageOverlay.classList.add('hidden');
  continueButton.disabled = false;
  if (menuTip) {
    menuTip.textContent = levels[state.level].text;
  }
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = setInterval(() => {
    if (!state.isPaused && state.isPlaying) {
      state.timer += 1;
      timerValue.textContent = String(state.timer);
    }
  }, 1000);
  requestAnimationFrame(gameLoop);
}

function endGame(win) {
  state.isPlaying = false;
  state.isGameOver = !win;
  state.isWon = win;
  saveHighScore();
  overlayTitle.textContent = win ? 'You Win!' : 'Game Over';
  overlayText.textContent = win
    ? `You finished the adventure with ${state.score} points.`
    : `You lost all your lives. Score: ${state.score}`;
  messageOverlay.classList.remove('hidden');
  playSound(win ? 'power' : 'gameover');
}

function updateHUD() {
  scoreValue.textContent = String(state.score);
  livesValue.textContent = String(state.lives);
  timerValue.textContent = String(state.timer);
}

function handleInput() {
  const left = state.keys.ArrowLeft || state.keys.KeyA;
  const right = state.keys.ArrowRight || state.keys.KeyD;
  const up = state.keys.ArrowUp || state.keys.KeyW || state.keys.Space;

  if (left) {
    player.vx -= player.speed * 0.42;
    player.direction = -1;
  }
  if (right) {
    player.vx += player.speed * 0.42;
    player.direction = 1;
  }
  if (!left && !right) {
    player.vx *= 0.92;
  }
  if (up && player.canJump) {
    player.vy = player.jumpStrength;
    player.canJump = false;
    player.onGround = false;
    playSound('jump');
  }
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function resolvePlatformCollision(platform) {
  const playerBottom = player.y + player.height;
  const playerTop = player.y;
  const playerRight = player.x + player.width;
  const playerLeft = player.x;

  if (!rectsIntersect(player, platform)) return;

  const overlapX = Math.min(playerRight - platform.x, platform.x + platform.width - playerLeft);
  const overlapY = Math.min(playerBottom - platform.y, platform.y + platform.height - playerTop);

  if (overlapY < overlapX) {
    if (player.vy > 0 && playerBottom - player.vy <= platform.y) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
      player.canJump = true;
    } else if (player.vy < 0 && playerTop - player.vy >= platform.y + platform.height) {
      player.y = platform.y + platform.height;
      player.vy = 0;
    }
  } else {
    if (playerRight > platform.x && playerLeft < platform.x) {
      if (player.vx > 0) player.x = platform.x - player.width;
    } else if (playerLeft < platform.x + platform.width && playerRight > platform.x + platform.width) {
      if (player.vx < 0) player.x = platform.x + platform.width;
    }
  }
}

function updatePlayer() {
  handleInput();

  player.vx *= friction;
  player.vy += gravity;
  if (player.vy > 18) player.vy = 18;

  player.x += player.vx;
  player.y += player.vy;

  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
  if (player.y + player.height > canvas.height) {
    player.y = canvas.height - player.height;
    player.vy = 0;
    player.onGround = true;
    player.canJump = true;
  }

  player.onGround = false;
  platforms.forEach(resolvePlatformCollision);
  if (player.y + player.height >= canvas.height - 1) {
    player.onGround = true;
    player.canJump = true;
  }

  if (player.powerTimer > 0) {
    player.powerTimer -= 1;
  } else {
    player.invincible = false;
  }
}

function collectCoin(coin) {
  if (coin.collected) return;
  if (rectsIntersect(player, { x: coin.x - 8, y: coin.y - 8, width: 24, height: 24 })) {
    coin.collected = true;
    state.score += 10;
    playSound('coin');
  }
}

function collectPowerUp(item) {
  if (item.collected) return;
  if (rectsIntersect(player, { x: item.x, y: item.y, width: 28, height: 28 })) {
    item.collected = true;
    if (item.type === 'life') {
      state.lives += 1;
      state.score += 20;
      playSound('power');
    } else if (item.type === 'star') {
      player.invincible = true;
      player.powerTimer = 360;
      state.score += 25;
      playSound('power');
    }
  }
}

function hitBonusBlock(block) {
  if (block.activated) return;
  const playerBottom = player.y + player.height;
  const playerRight = player.x + player.width;
  const playerLeft = player.x;
  const blockBottom = block.y + block.height;

  if (
    player.vy < 0 &&
    playerBottom > blockBottom - 8 &&
    playerBottom < blockBottom + 12 &&
    playerRight > block.x &&
    playerLeft < block.x + block.width
  ) {
    block.activated = true;
    state.score += 15;
    playSound('coin');
    player.vy = 2;
    const reward = Math.random() > 0.3 ? 'coin' : 'star';
    if (reward === 'coin') {
      coins.push({ x: block.x + 4, y: block.y - 24, collected: false });
    } else {
      powerUps.push({ x: block.x + 4, y: block.y - 24, type: 'star', collected: false });
    }
    block.type = reward;
  }
}

function updateEnemies() {
  enemies.forEach(enemy => {
    if (!enemy.alive) return;
    enemy.x += enemy.speed * enemy.direction;
    if (enemy.x < enemy.minX || enemy.x + enemy.width > enemy.maxX) {
      enemy.direction *= -1;
      enemy.x += enemy.speed * enemy.direction;
    }

    const playerAbove = player.y + player.height < enemy.y + 8;
    if (rectsIntersect(player, enemy) && enemy.alive) {
      if (playerAbove && player.vy > 0) {
        enemy.alive = false;
        player.vy = player.jumpStrength * 0.5;
        state.score += 30;
        playSound('hit');
      } else if (!player.invincible) {
        state.lives -= 1;
        player.vx = enemy.direction * 5;
        player.vy = -7;
        playSound('hit');
        if (state.lives <= 0) {
          endGame(false);
        }
      }
    }
  });
}

function updateBoss() {
  if (!boss) return;
  boss.x += boss.speed * boss.direction;
  if (boss.x < 520 || boss.x + boss.width > 820) {
    boss.direction *= -1;
  }
  if (rectsIntersect(player, boss)) {
    const playerAbove = player.y + player.height < boss.y + 16;
    if (playerAbove && player.vy > 0) {
      boss.health -= 1;
      player.vy = player.jumpStrength * 0.5;
      state.score += 60;
      playSound('hit');
      if (boss.health <= 0) {
        boss = null;
        state.score += 100;
      }
    } else if (!player.invincible) {
      state.lives -= 1;
      player.vy = -7;
      playSound('hit');
      if (state.lives <= 0) {
        endGame(false);
      }
    }
  }
}

function updateGame() {
  if (!state.isPlaying || state.isPaused) return;
  updatePlayer();
  coins.forEach(collectCoin);
  bonusBlocks.forEach(hitBonusBlock);
  powerUps.forEach(collectPowerUp);
  updateEnemies();
  updateBoss();

  const remainingCoins = coins.filter(c => !c.collected).length;
  const bonusRemaining = bonusBlocks.filter(b => b.revealed && !b.collected).length;

  if (rectsIntersect(player, finish)) {
    if (state.level < levels.length - 1) {
      state.level += 1;
      state.score += 50;
      resetLevel();
      playSound('power');
    } else {
      endGame(true);
    }
  }

  if (remainingCoins === 0 && boss === null && levelValue.textContent === '3') {
    // final reward if all coins were collected in level 3
    state.score += 0;
  }

  updateHUD();
}

function drawPlayer() {
  const drawWidth = player.width;
  const drawHeight = player.height;
  if (playerSprite.complete && playerSprite.naturalWidth && playerSprite.naturalHeight) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (player.direction === -1) {
      ctx.translate(player.x + drawWidth, player.y);
      ctx.scale(-1, 1);
      ctx.drawImage(playerSprite, 0, 0, playerSprite.naturalWidth, playerSprite.naturalHeight, 0, 0, drawWidth, drawHeight);
    } else {
      ctx.drawImage(playerSprite, 0, 0, playerSprite.naturalWidth, playerSprite.naturalHeight, player.x, player.y, drawWidth, drawHeight);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = player.invincible ? '#ffd700' : '#f0532d';
    ctx.fillRect(player.x, player.y, drawWidth, drawHeight);
  }
}

function drawPlatform(platform) {
  ctx.fillStyle = '#5a5f85';
  ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
  ctx.fillStyle = '#7b84b0';
  ctx.fillRect(platform.x + 4, platform.y + 4, platform.width - 8, platform.height - 8);
}

function drawCoin(coin) {
  if (coin.collected) return;
  ctx.fillStyle = '#ffe55d';
  ctx.beginPath();
  ctx.arc(coin.x + 8, coin.y + 8, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8d033';
  ctx.fillRect(coin.x + 6, coin.y + 6, 4, 12);
}

function drawEnemy(enemy) {
  if (!enemy.alive) return;
  ctx.save();
  ctx.fillStyle = '#8b3f10';
  ctx.fillRect(enemy.x, enemy.y + 10, enemy.width, enemy.height - 10);
  ctx.fillStyle = '#d99c68';
  ctx.fillRect(enemy.x, enemy.y + 2, enemy.width, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(enemy.x + 8, enemy.y + 14, 8, 8);
  ctx.fillRect(enemy.x + 24, enemy.y + 14, 8, 8);
  ctx.fillStyle = '#000000';
  ctx.fillRect(enemy.x + 10, enemy.y + 16, 4, 4);
  ctx.fillRect(enemy.x + 26, enemy.y + 16, 4, 4);
  ctx.fillStyle = '#5a2d12';
  ctx.fillRect(enemy.x + 10, enemy.y + 26, 20, 4);
  ctx.fillStyle = '#3d1e0f';
  ctx.fillRect(enemy.x + 4, enemy.y + enemy.height - 2, 10, 4);
  ctx.fillRect(enemy.x + enemy.width - 14, enemy.y + enemy.height - 2, 10, 4);
  ctx.restore();
}

function drawBonusBlock(block) {
  ctx.fillStyle = block.activated ? '#c6a450' : '#f5bb33';
  ctx.fillRect(block.x, block.y, block.width, block.height);
  ctx.fillStyle = '#d18c20';
  ctx.fillRect(block.x + 4, block.y + 4, block.width - 8, block.height - 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px Arial';
  ctx.fillText('?', block.x + 12, block.y + 26);
  if (block.activated && block.type) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(block.type === 'coin' ? '+' : '*', block.x + 12, block.y + 18);
  }
}

function drawPowerUp(item) {
  if (item.collected) return;
  ctx.fillStyle = item.type === 'life' ? '#62dc8c' : '#6bd4ff';
  ctx.beginPath();
  ctx.arc(item.x + 14, item.y + 14, 14, 0, Math.PI * 2);
  ctx.fill();
  if (item.type === 'life') {
    ctx.strokeStyle = '#f7f2d4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(item.x + 14, item.y + 6);
    ctx.lineTo(item.x + 14, item.y + 22);
    ctx.moveTo(item.x + 6, item.y + 14);
    ctx.lineTo(item.x + 22, item.y + 14);
    ctx.stroke();
  }
}

function drawFinish() {
  ctx.fillStyle = '#5a9e3f';
  ctx.fillRect(finish.x, finish.y, finish.width, finish.height);
  ctx.fillStyle = '#2e472a';
  ctx.fillRect(finish.x + 10, finish.y + 8, 14, 24);
  ctx.fillStyle = '#8fd17f';
  ctx.fillRect(finish.x + 8, finish.y + 6, 8, 8);
  ctx.fillRect(finish.x + 36, finish.y + 6, 8, 8);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(finish.x + finish.width / 2 - 6, finish.y + 6);
  ctx.lineTo(finish.x + finish.width / 2, finish.y + 18);
  ctx.lineTo(finish.x + finish.width / 2 + 6, finish.y + 6);
  ctx.fill();
}

function drawBoss() {
  if (!boss) return;
  ctx.save();
  ctx.fillStyle = '#8a3f97';
  ctx.fillRect(boss.x + 4, boss.y + 12, boss.width - 8, boss.height - 12);
  ctx.fillStyle = '#5e2058';
  ctx.fillRect(boss.x, boss.y + 28, boss.width, boss.height - 28);
  ctx.fillStyle = '#f4df75';
  ctx.fillRect(boss.x + 14, boss.y + 22, 12, 12);
  ctx.fillRect(boss.x + 48, boss.y + 22, 12, 12);
  ctx.fillStyle = '#000';
  ctx.fillRect(boss.x + 18, boss.y + 26, 6, 6);
  ctx.fillRect(boss.x + 52, boss.y + 26, 6, 6);
  ctx.fillStyle = '#f25a5a';
  ctx.fillRect(boss.x + 22, boss.y + 40, 36, 10);
  ctx.fillStyle = '#6a1b4f';
  ctx.fillRect(boss.x + 8, boss.y + 6, boss.width - 16, 8);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < boss.health; i += 1) {
    ctx.fillRect(boss.x + 10 + i * 24, boss.y - 12, 16, 6);
  }
  ctx.restore();
}

function drawBackground() {
  ctx.fillStyle = '#10163c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 8; i += 1) {
    ctx.fillRect(40 + i * 120, 48, 40, 4);
  }
}

function draw() {
  drawBackground();
  platforms.forEach(drawPlatform);
  coins.forEach(drawCoin);
  bonusBlocks.forEach(drawBonusBlock);
  powerUps.forEach(drawPowerUp);
  drawFinish();
  enemies.forEach(drawEnemy);
  drawBoss();
  drawPlayer();
}

function gameLoop(timestamp) {
  if (!state.isPlaying) return;
  if (state.isPaused) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '40px Arial';
    ctx.fillText('Paused', canvas.width / 2 - 62, canvas.height / 2);
    ctx.restore();
    requestAnimationFrame(gameLoop);
    return;
  }

  updateGame();
  draw();
  requestAnimationFrame(gameLoop);
}

function togglePause() {
  state.isPaused = !state.isPaused;
  pauseButton.textContent = state.isPaused ? 'Resume' : 'Pause';
}

function handleMenu() {
  menuScreen.classList.add('active');
  gameScreen.classList.remove('active');
  state.isPlaying = false;
  if (state.intervalId) clearInterval(state.intervalId);
}

window.addEventListener('keydown', event => {
  state.keys[event.code] = true;
  if (event.code === 'Escape' && state.isPlaying) togglePause();
});

window.addEventListener('keyup', event => {
  state.keys[event.code] = false;
});

pauseButton.addEventListener('click', togglePause);
startButton.addEventListener('click', startGame);
continueButton.addEventListener('click', () => {
  state.isPaused = false;
  pauseButton.textContent = 'Pause';
  if (!state.isPlaying) startGame();
});
restartButton.addEventListener('click', () => {
  messageOverlay.classList.add('hidden');
  startGame();
});
soundToggleButton.addEventListener('click', toggleSound);
menuButton.addEventListener('click', () => {
  handleMenu();
});

loadHighScore();
startButton.textContent = 'Play Now';
