const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const directionText = document.getElementById('direction');
const overlay = document.getElementById('overlay');
const diagnosticsToggle = document.getElementById('diagnosticsToggle');
const diagPanel = document.getElementById('diagPanel');
const diagLog = document.getElementById('diagLog');
const diagClear = document.getElementById('diagClear');
const diagExport = document.getElementById('diagExport');
const diagClose = document.getElementById('diagClose');
const settingsToggle = document.getElementById('settingsToggle');
const settings = document.getElementById('settings');
const closeSettings = document.getElementById('closeSettings');
const resetSounds = document.getElementById('resetSounds');
const voiceToggle = document.getElementById('voiceEnable');
const voiceVolume = document.getElementById('voiceVolume');
const voiceVolumeLabel = document.getElementById('voiceVolumeLabel');
const securityToggle = document.getElementById('securityToggle');
const securityStatus = document.getElementById('securityStatus');
const historyLog = document.getElementById('historyLog');
const clearHistory = document.getElementById('clearHistory');
const exportHistory = document.getElementById('exportHistory');
const historyFilter = document.getElementById('historyFilter');
const cameraBox = document.getElementById('cameraBox');
const resetStats = document.getElementById('resetStats');

let previousFrame = null;
let previousCenter = null;
let previousArea = null;
let lastSoundTime = 0;
let cameraStream = null;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let speechEnabled = true;
let speechVolume = 0.9;
let lastAnnouncedDirection = null;
let securityModeActive = false;
let idleTimer = null;
let lastMotionTime = Date.now();
let movementHistory = [];
let movementStats = { total: 0, left: 0, right: 0, up: 0, down: 0, back: 0 };
let directionColors = {
  left: '#0066ff',
  right: '#ff9900',
  up: '#00cc00',
  down: '#ff0000'
};
let lastDirection = null;
 
const customSounds = { left: null, right: null, up: null, down: null };
const soundInputs = {
  left: document.getElementById('soundLeft'),
  right: document.getElementById('soundRight'),
  up: document.getElementById('soundUp'),
  down: document.getElementById('soundDown'),
};

// Save the selected sound file in memory.
Object.keys(soundInputs).forEach((direction) => {
  soundInputs[direction].addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    // store as Audio element so user can hear preview
    customSounds[direction] = new Audio(URL.createObjectURL(file));
  });
});

settingsToggle.addEventListener('click', () => {
  const open = settings.getAttribute('aria-hidden') === 'false';
  settings.setAttribute('aria-hidden', String(!open));
});
closeSettings.addEventListener('click', () => settings.setAttribute('aria-hidden', 'true'));
resetSounds.addEventListener('click', () => {
  Object.keys(customSounds).forEach(k => customSounds[k] = null);
  Object.values(soundInputs).forEach(i => i.value = '');
});
// Voice controls
voiceToggle.addEventListener('change', (e)=>{
  speechEnabled = !!e.target.checked;
  if (!speechEnabled) { window.speechSynthesis.cancel(); lastAnnouncedDirection = null }
});
voiceVolume.addEventListener('input', (e)=>{
  speechVolume = parseFloat(e.target.value);
  voiceVolumeLabel.textContent = Math.round(speechVolume*100) + '%';
});
securityToggle.addEventListener('click', () => {
  securityModeActive = !securityModeActive;
  updateSecurityUI();
  if (securityModeActive) {
    lastMotionTime = Date.now();
    startIdleTimer();
  } else {
    clearIdleTimer();
    deactivateSecurityMode();
  }
});
clearHistory.addEventListener('click', () => {
  movementHistory = [];
  historyLog.innerHTML = '';
  historyFilter.value = 'all';
});
exportHistory.addEventListener('click', () => {
  exportHistoryAsText();
});
resetStats.addEventListener('click', () => {
  movementStats = { total: 0, left: 0, right: 0, up: 0, down: 0, back: 0 };
  updateStatsDisplay();
});

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopAlarm);

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    video.srcObject = cameraStream;
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Resume audio context on user gesture to satisfy browser policies
      if (audioCtx.state === 'suspended') audioCtx.resume();
      analyzeMovement();
    });
  } catch (error) {
    alert('Camera access is blocked or unavailable. Allow camera access in the browser.');
    console.error(error);
  }
}

function analyzeMovement() {
  if (!video.videoWidth || !video.videoHeight) {
    requestAnimationFrame(analyzeMovement);
    return;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (previousFrame) {
    const motion = findMotion(previousFrame.data, currentFrame.data, canvas.width, canvas.height);

    if (motion.area > 250) {
      const currentCenter = { x: motion.x, y: motion.y };

      if (previousCenter && previousArea) {
        const dx = currentCenter.x - previousCenter.x;
        const dy = currentCenter.y - previousCenter.y;
        const areaChange = motion.area - previousArea;

        let direction = null;

        // When the moving object becomes smaller, it probably moved backwards.
        if (areaChange < -900) direction = 'back';
        // When the moving object becomes bigger, it probably moved closer.
        else if (areaChange > 900) direction = 'closer';
        else if (dx < -12) direction = 'left';
        else if (dx > 12) direction = 'right';
        else if (dy < -12) direction = 'up';
        else if (dy > 12) direction = 'down';

        if (direction) {
          lastMotionTime = Date.now();
          updateMovementStats(direction);
          if (securityModeActive) {
            deactivateSecurityMode();
            playAlarmSound();
            triggerRedFlash();
          }
          showDirection(direction);
          playSound(direction);
          triggerVisual(direction);
          if (direction !== lastAnnouncedDirection) {
            announceDirection(direction);
            lastAnnouncedDirection = direction;
          }
          addToHistory(direction);
        }
      }

      previousCenter = currentCenter;
      previousArea = motion.area;
    }
  }

  previousFrame = currentFrame;
  requestAnimationFrame(analyzeMovement);
}

function findMotion(oldData, newData, width, height) {
  let totalX = 0;
  let totalY = 0;
  let changedPixels = 0;

  // Check every 4th pixel to keep the app fast.
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4;

      const rDiff = Math.abs(newData[index] - oldData[index]);
      const gDiff = Math.abs(newData[index + 1] - oldData[index + 1]);
      const bDiff = Math.abs(newData[index + 2] - oldData[index + 2]);
      const difference = rDiff + gDiff + bDiff;

      // If the color changed enough, this pixel is treated as movement.
      if (difference > 70) {
        totalX += x;
        totalY += y;
        changedPixels++;
      }
    }
  }

  return {
    x: changedPixels ? totalX / changedPixels : 0,
    y: changedPixels ? totalY / changedPixels : 0,
    area: changedPixels,
  };
}

function showDirection(direction) {
  const names = { left: 'Left', right: 'Right', up: 'Up', down: 'Down', back: 'Backwards', closer: 'Closer' };
  directionText.textContent = names[direction] || 'Movement';
}

function playSound(direction) {
  const now = Date.now();

  // Do not play sounds too often.
  if (now - lastSoundTime < 700) return;
  lastSoundTime = now;

  if (customSounds[direction]) {
    customSounds[direction].currentTime = 0;
    customSounds[direction].play();
    return;
  }

  // Play a synthesized default sound for each direction
  playDefaultSound(direction);
}

function playDefaultSound(direction){
  try{
    if (direction === 'left') return synthLaser();
    if (direction === 'right') return synthEngine();
    if (direction === 'up') return synthRocket();
    if (direction === 'down') return synthSiren();
  }catch(e){ console.warn('audio error', e) }
}

function synthLaser(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 1200;
  o.connect(g);
  g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
  o.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.15);
  g.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.25);
  o.start(); o.stop(audioCtx.currentTime + 0.26);
}

function synthEngine(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.value = 120;
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 6;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 40;
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
  lfo.start(); o.start();
  setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6); o.stop(); lfo.stop(); }, 700);
}

function synthRocket(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, audioCtx.currentTime);
  o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0, audioCtx.currentTime);
  g.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 0.03);
  o.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
  o.start(); o.stop(audioCtx.currentTime + 1.3);
}

function synthSiren(){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  const now = audioCtx.currentTime;
  o.frequency.setValueAtTime(500, now);
  o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.02);
  // alternate pitch up/down
  o.frequency.setValueAtTime(500, now);
  o.frequency.linearRampToValueAtTime(700, now + 0.25);
  o.frequency.linearRampToValueAtTime(500, now + 0.5);
  o.frequency.linearRampToValueAtTime(700, now + 0.75);
  g.gain.linearRampToValueAtTime(0.0001, now + 1.0);
  o.start(); o.stop(now + 1.05);
}

function triggerVisual(direction){
  overlay.className = 'overlay';
  overlay.classList.add('effect-' + direction);
  // briefly show effect
  setTimeout(()=> overlay.classList.remove('effect-' + direction), 420);
}

function stopAlarm() {
  directionText.textContent = 'Stopped';
  Object.values(customSounds).forEach((sound) => { if (sound){ sound.pause(); sound.currentTime = 0 } });
  lastAnnouncedDirection = null;
  if (!securityModeActive) {
    startIdleTimer();
  }
}

function startIdleTimer(){
  clearIdleTimer();
  idleTimer = setTimeout(()=>{
    if (!securityModeActive) activateSecurityMode();
  }, 30000);
}

function clearIdleTimer(){
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function activateSecurityMode(){
  securityModeActive = true;
  updateSecurityUI();
  addToHistory('SECURITY MODE ACTIVATED');
}

function deactivateSecurityMode(){
  securityModeActive = false;
  updateSecurityUI();
  addToHistory('SECURITY MODE DEACTIVATED');
  lastMotionTime = Date.now();
  startIdleTimer();
}

function updateSecurityUI(){
  if (securityModeActive) {
    securityToggle.textContent = 'Security Mode ON';
    securityStatus.textContent = '⚠️ Security Mode ON';
    securityStatus.classList.add('active');
    document.body.classList.add('security-mode');
  } else {
    securityToggle.textContent = 'Security Mode OFF';
    securityStatus.textContent = 'Ready';
    securityStatus.classList.remove('active');
    document.body.classList.remove('security-mode');
  }
}

function triggerRedFlash(){
  cameraBox.classList.remove('flash-alarm');
  void cameraBox.offsetWidth;
  cameraBox.classList.add('flash-alarm');
}

function playAlarmSound(){
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 1000;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.6);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch(e) {
    console.warn('alarm sound error', e);
  }
}

function addToHistory(event){
  const time = new Date().toLocaleTimeString();
  let type = 'other';
  if (event === 'left') type = 'left';
  else if (event === 'right') type = 'right';
  else if (event === 'up') type = 'up';
  else if (event === 'down') type = 'down';
  else if (event === 'back') type = 'back';
  else if (event.includes('SECURITY')) type = 'alarm';
  
  const entry = { time, event, type };
  movementHistory.unshift(entry);
  if (movementHistory.length > 100) movementHistory.pop();
  displayFilteredHistory();
}

function updateMovementStats(direction){
  if (direction === 'left') movementStats.left++;
  else if (direction === 'right') movementStats.right++;
  else if (direction === 'up') movementStats.up++;
  else if (direction === 'down') movementStats.down++;
  else if (direction === 'back') movementStats.back++;
  
  movementStats.total++;
  updateStatsDisplay();
}

function updateStatsDisplay(){
  const total = movementStats.total;
  const max = Math.max(total, movementStats.left, movementStats.right, movementStats.up, movementStats.down, movementStats.back, 1);
  
  document.getElementById('totalCount').textContent = total;
  document.getElementById('leftCount').textContent = movementStats.left;
  document.getElementById('rightCount').textContent = movementStats.right;
  document.getElementById('upCount').textContent = movementStats.up;
  document.getElementById('downCount').textContent = movementStats.down;
  document.getElementById('backCount').textContent = movementStats.back;
  
  const totalPercent = total > 0 ? (total / max) * 100 : 0;
  const leftPercent = total > 0 ? (movementStats.left / max) * 100 : 0;
  const rightPercent = total > 0 ? (movementStats.right / max) * 100 : 0;
  const upPercent = total > 0 ? (movementStats.up / max) * 100 : 0;
  const downPercent = total > 0 ? (movementStats.down / max) * 100 : 0;
  const backPercent = total > 0 ? (movementStats.back / max) * 100 : 0;
  
  document.getElementById('totalBar').style.width = totalPercent + '%';
  document.getElementById('leftBar').style.width = leftPercent + '%';
  document.getElementById('rightBar').style.width = rightPercent + '%';
  document.getElementById('upBar').style.width = upPercent + '%';
  document.getElementById('downBar').style.width = downPercent + '%';
  document.getElementById('backBar').style.width = backPercent + '%';
}

function displayFilteredHistory(){
  const filter = historyFilter.value;
  const filtered = filter === 'all' ? movementHistory : movementHistory.filter(e => e.type === filter);
  historyLog.innerHTML = filtered.map(entry => {
    const displayText = entry.event === 'left' ? 'Moved Left' :
                       entry.event === 'right' ? 'Moved Right' :
                       entry.event === 'up' ? 'Moved Up' :
                       entry.event === 'down' ? 'Moved Down' :
                       entry.event === 'back' ? 'Moved Backwards' :
                       entry.event === 'closer' ? 'Moved Closer' :
                       entry.event.includes('SECURITY MODE ACTIVATED') ? 'Security Mode Activated' :
                       entry.event.includes('SECURITY MODE DEACTIVATED') ? 'Security Mode Deactivated' : entry.event;
    return `<div class="history-item history-${entry.type}">[${entry.time}] ${displayText}</div>`;
  }).join('');
  historyLog.scrollTop = 0;
}

function exportHistoryAsText(){
  if (movementHistory.length === 0) {
    alert('No history to export');
    return;
  }
  
  let content = 'Motion History Export\n';
  content += '=====================\n';
  content += `Exported: ${new Date().toLocaleString()}\n\n`;
  
  movementHistory.forEach(entry => {
    const displayText = entry.event === 'left' ? 'Moved Left' :
                       entry.event === 'right' ? 'Moved Right' :
                       entry.event === 'up' ? 'Moved Up' :
                       entry.event === 'down' ? 'Moved Down' :
                       entry.event === 'back' ? 'Moved Backwards' :
                       entry.event === 'closer' ? 'Moved Closer' :
                       entry.event.includes('SECURITY MODE ACTIVATED') ? 'Security Mode Activated' :
                       entry.event.includes('SECURITY MODE DEACTIVATED') ? 'Security Mode Deactivated' : entry.event;
    content += `${entry.time} - ${displayText}\n`;
  });
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `motion_history_${new Date().getTime()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function announceDirection(direction){
  if (!speechEnabled) return;
  if (!('speechSynthesis' in window)) return;

  let message = '';
  if (direction === 'back') message = 'Warning! Object moving backward';
  else if (direction === 'left') message = 'Object moving left';
  else if (direction === 'right') message = 'Object moving right';
  else if (direction === 'up') message = 'Object moving up';
  else if (direction === 'down') message = 'Object moving down';
  else return;

  // Cancel any ongoing speech to avoid overlap
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(message);
  u.volume = typeof speechVolume === 'number' ? speechVolume : 0.9;
  u.rate = 1.0;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

// --------- Color & Visuals: override and enhance existing visuals ---------
(function(){
  const directionIndicatorEl = document.getElementById('directionIndicator');
  const colorInputs = {
    left: document.getElementById('colorLeft'),
    right: document.getElementById('colorRight'),
    up: document.getElementById('colorUp'),
    down: document.getElementById('colorDown'),
  };
  const resetColors = document.getElementById('resetColors');
  const activeSwatchEl = document.getElementById('activeSwatch');
  const activeDirectionElLocal = document.getElementById('activeDirection');

  // Load saved colors or use current inputs
  let colors = JSON.parse(localStorage.getItem('directionColors') || 'null') || {
    left: (colorInputs.left && colorInputs.left.value) || '#0066ff',
    right: (colorInputs.right && colorInputs.right.value) || '#ff9900',
    up: (colorInputs.up && colorInputs.up.value) || '#00cc00',
    down: (colorInputs.down && colorInputs.down.value) || '#ff0000'
  };

  function saveColors(){ localStorage.setItem('directionColors', JSON.stringify(colors)); }

  function hexToRgba(hex, alpha){
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace('#','');
    const bigint = parseInt(h,16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyBodyBackground(dir){
    const base = '#101827';
    if (!dir || !colors[dir]) {
      document.body.style.background = '';
      return;
    }
    const rgba = hexToRgba(colors[dir], 0.15);
    document.body.style.transition = 'background 600ms ease';
    document.body.style.background = `linear-gradient(135deg, ${base} 0%, ${rgba} 100%)`;
  }

  function setActiveDisplay(dir){
    if (!dir || !colors[dir]) {
      activeSwatchEl.style.background = 'transparent';
      activeDirectionElLocal.textContent = 'No movement';
      return;
    }
    activeSwatchEl.style.background = colors[dir];
    activeDirectionElLocal.textContent = dir.toUpperCase();
  }

  // Override showDirection to update central indicator and active display
  window.showDirection = function(direction){
    const names = { left: 'Left', right: 'Right', up: 'Up', down: 'Down', back: 'Backwards', closer: 'Closer' };
    directionText.textContent = names[direction] || 'Movement';

    if (['left','right','up','down'].includes(direction)){
      directionIndicatorEl.className = 'direction-indicator show dir-' + direction;
      directionIndicatorEl.textContent = (names[direction] || '').toUpperCase();
      // remove after visible period
      clearTimeout(directionIndicatorEl._hideTimeout);
      directionIndicatorEl._hideTimeout = setTimeout(()=>{
        directionIndicatorEl.classList.remove('show');
      }, 900);
      setActiveDisplay(direction);
      applyBodyBackground(direction);
    } else {
      directionIndicatorEl.classList.remove('show');
      setActiveDisplay(null);
      applyBodyBackground(null);
    }
  };

  // Override triggerVisual to add camera-box effects and body color
  window.triggerVisual = function(direction){
    // overlay effect
    overlay.className = 'overlay';
    if (['left','right','up','down'].includes(direction)) overlay.classList.add('effect-' + direction);
    setTimeout(()=> overlay.classList.remove('effect-' + direction), 420);

    // camera box effect
    const effects = ['effect-left','effect-right','effect-up','effect-down'];
    cameraBox.classList.remove(...effects);
    if (['left','right','up','down'].includes(direction)) cameraBox.classList.add('effect-' + direction);
    setTimeout(()=> cameraBox.classList.remove('effect-' + direction), 700);

    // add transient body active class for compatibility with existing CSS
    const activeClasses = ['active-left','active-right','active-up','active-down'];
    document.body.classList.remove(...activeClasses);
    if (['left','right','up','down'].includes(direction)) document.body.classList.add('active-' + direction);
    // remove after short period so it can transition again
    setTimeout(()=> document.body.classList.remove('active-' + direction), 1200);
  };

  // Wire color inputs
  Object.keys(colorInputs).forEach(k => {
    const input = colorInputs[k];
    if (!input) return;
    // initialize input from saved colors
    input.value = colors[k];
    input.addEventListener('input', (e)=>{
      colors[k] = e.target.value;
      saveColors();
      // update active swatch if currently showing this direction
      const cur = (activeDirectionElLocal.textContent || '').toLowerCase();
      if (cur === k) setActiveDisplay(k);
    });
  });

  resetColors && resetColors.addEventListener('click', ()=>{
    colors = { left: '#0066ff', right: '#ff9900', up: '#00cc00', down: '#ff0000' };
    Object.keys(colorInputs).forEach(k => { if (colorInputs[k]) colorInputs[k].value = colors[k]; });
    saveColors();
    setActiveDisplay(null);
    applyBodyBackground(null);
  });

  // Apply initial UI
  setActiveDisplay(null);
  applyBodyBackground(null);
})();

// Diagnostics: capture console and errors to on-screen log
;(function(){
  if (!diagLog) return;
  const logs = [];
  function add(item){
    logs.push(item);
    const el = document.createElement('div');
    el.className = 'diag-item diag-' + item.level;
    el.textContent = `[${item.time}] ${item.level.toUpperCase()}: ${item.message}`;
    diagLog.insertBefore(el, diagLog.firstChild);
    // trim
    while (diagLog.childNodes.length > 400) diagLog.removeChild(diagLog.lastChild);
  }

  // capture console
  ['log','info','warn','error'].forEach((level)=>{
    const orig = console[level].bind(console);
    console[level] = function(...args){
      try{ add({ time: new Date().toLocaleTimeString(), level: level==='log'?'info':level, message: args.map(a=>typeof a==='string'?a:JSON.stringify(a)).join(' ') }); }catch(e){}
      orig(...args);
    };
  });

  window.addEventListener('error', (ev)=>{
    add({ time: new Date().toLocaleTimeString(), level: 'error', message: ev.message + ' @ ' + (ev.filename || '') + ':' + (ev.lineno||'') });
  });
  window.addEventListener('unhandledrejection', (ev)=>{
    add({ time: new Date().toLocaleTimeString(), level: 'error', message: 'UnhandledRejection: ' + (ev.reason && ev.reason.stack? ev.reason.stack : ev.reason) });
  });

  diagnosticsToggle && diagnosticsToggle.addEventListener('click', ()=>{
    const open = diagPanel.getAttribute('aria-hidden') === 'false';
    diagPanel.setAttribute('aria-hidden', String(open));
    diagPanel.style.display = open ? 'none' : 'flex';
  });
  diagClose && diagClose.addEventListener('click', ()=>{ diagPanel.style.display = 'none'; diagPanel.setAttribute('aria-hidden','true'); });
  diagClear && diagClear.addEventListener('click', ()=>{ diagLog.innerHTML = ''; });
  diagExport && diagExport.addEventListener('click', ()=>{
    const text = Array.from(diagLog.childNodes).map(n=>n.textContent).reverse().join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `diagnostics_${Date.now()}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // provide a global logger
  window.appDiag = { add };
})();
