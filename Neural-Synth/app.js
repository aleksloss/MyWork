(()=>{
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const cleanBtn = document.getElementById('cleanBtn');
  const colorPicker = document.getElementById('colorPicker');
  const modeBtn = document.getElementById('modeBtn');
  const symmetryBtn = document.getElementById('symmetryBtn');
  const recordBtn = document.getElementById('recordBtn');
  const magicBtn = document.getElementById('magicBtn');
  const soundBtn = document.getElementById('soundBtn');

  let drawing = false;
  let last = null;

  // Audio state for PitchOnY
  let audioCtx = null;
  let osc = null;
  let voices = [];
  let gainNode = null;
  let currentVoiceGroup = null;
  let tonePlaying = false;
  let currentInstrument = null;
  let audioEnabled = true;
  let lastPointerTime = 0;

  // brush state
  let brushColor = colorPicker ? colorPicker.value : '#ff0044';
  let brushMode = 'solid'; // 'solid' or 'gradient'
  let symmetryMode = false;
  let wavePhase = 0;
  let isRecording = false;
  let scatterParticles = [];
  let scatterAnim = null;
  let ambientOsc = null;
  let ambientGain = null;
  let ambientFilter = null;
  let ambientActive = false;
  let isLooping = false;
  let recordStartTime = 0;
  let recordingEvents = [];
  let recordBrushMode = brushMode;
  let recordBrushColor = brushColor;
  let recordSymmetryMode = symmetryMode;
  let recordTimer = null;
  let loopTimeouts = [];
  let replayDrawing = false;
  let lastReplay = null;
  let lastReplayTime = 0;

  function resizeCanvas() {
    // preserve current drawing
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d');
    if (canvas.width && canvas.height) tctx.drawImage(canvas, 0, 0);

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    // redraw preserved image scaled to new size
    if (tmp.width && tmp.height) {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, w, h);
    }
  }

  function makeGradient(color = brushColor) {
    const rgb = hexToRgb(color);
    const bright = [
      Math.min(255, rgb[0] + 120),
      Math.min(255, rgb[1] + 120),
      Math.min(255, rgb[2] + 120)
    ];
    const highlight = `rgb(${bright[0]}, ${bright[1]}, ${bright[2]})`;
    const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
    g.addColorStop(0, color);
    g.addColorStop(1, highlight);
    return g;
  }

  function getCanvasCenter(){
    const rect = canvas.getBoundingClientRect();
    return {cx: rect.width * 0.5, cy: rect.height * 0.5};
  }

  function createScatterParticles(){
    const rect = canvas.getBoundingClientRect();
    const buffer = document.createElement('canvas');
    buffer.width = rect.width;
    buffer.height = rect.height;
    const bufferCtx = buffer.getContext('2d');
    bufferCtx.drawImage(canvas, 0, 0, rect.width, rect.height);
    const particles = [];
    const step = 24;
    for (let y = 0; y < rect.height; y += step){
      for (let x = 0; x < rect.width; x += step){
        const data = bufferCtx.getImageData(x, y, 1, 1).data;
        if (data[3] < 48) continue;
        const speed = 3 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: `rgba(${data[0]},${data[1]},${data[2]},`
        });
      }
    }
    return particles;
  }

  function startAmbient(){
    if (!audioEnabled) return;
    ensureAudio();
    if (ambientActive) return;
    const now = audioCtx.currentTime;
    ambientOsc = audioCtx.createOscillator();
    ambientFilter = audioCtx.createBiquadFilter();
    ambientGain = audioCtx.createGain();
    ambientOsc.type = 'triangle';
    ambientOsc.frequency.value = 50;
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 180;
    ambientFilter.Q.value = 1.1;
    ambientGain.gain.value = 0.0001;
    ambientOsc.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);
    ambientOsc.start(now);
    ambientActive = true;
  }

  function stopAmbient(){
    if (!ambientActive || !ambientGain) return;
    const now = audioCtx.currentTime;
    try{
      ambientGain.gain.cancelScheduledValues(now);
      ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
      ambientGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    }catch(e){}
    setTimeout(()=>{
      try{ ambientOsc.stop(); }catch(_){ }
      ambientOsc = null;
      ambientFilter = null;
      ambientGain = null;
      ambientActive = false;
    }, 340);
  }

  function getColorCoverage(){
    const width = canvas.width;
    const height = canvas.height;
    const step = Math.max(16, Math.floor(Math.min(width, height) / 40));
    let count = 0;
    let total = 0;
    for (let y = 0; y < height; y += step){
      for (let x = 0; x < width; x += step){
        total += 1;
        const data = ctx.getImageData(x, y, 1, 1).data;
        if (data[3] > 64) count += 1;
      }
    }
    return total ? count / total : 0;
  }

  function updateBackgroundVibe(){
    if (!audioEnabled) return;
    const coverage = getColorCoverage();
    startAmbient();
    const density = Math.min(1, coverage * 1.8);
    const now = audioCtx.currentTime;
    if (ambientGain){
      ambientGain.gain.cancelScheduledValues(now);
      ambientGain.gain.setValueAtTime(Math.max(0.001, ambientGain.gain.value || 0.001), now);
      ambientGain.gain.exponentialRampToValueAtTime(0.02 + density * 0.18, now + 0.12);
    }
    if (ambientFilter){
      ambientFilter.frequency.cancelScheduledValues(now);
      ambientFilter.frequency.setValueAtTime(180, now);
      ambientFilter.frequency.exponentialRampToValueAtTime(220 + density * 720, now + 0.18);
    }
  }

  function animateScatter(){
    if (!scatterParticles.length){
      scatterAnim = null;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = 'rgba(6,7,11,0.14)';
    ctx.fillRect(0, 0, rect.width, rect.height);
    for (const p of scatterParticles){
      p.x += p.vx;
      p.y += p.vy + 0.4;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= 0.025;
      const alpha = Math.max(0, p.life);
      if (alpha <= 0) continue;
      ctx.strokeStyle = p.color + alpha + ')';
      ctx.lineWidth = 1 + alpha * 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
      ctx.stroke();
    }
    scatterParticles = scatterParticles.filter(p => p.life > 0);
    scatterAnim = requestAnimationFrame(animateScatter);
  }

  function scatterAndClear(){
    if (scatterAnim){
      cancelAnimationFrame(scatterAnim);
      scatterAnim = null;
    }
    stopTone();
    stopLooping();
    scatterParticles = createScatterParticles();
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    updateBackgroundVibe();
    animateScatter();
  }

  function addRecordingEvent(type, x, y){
    if (!isRecording) return;
    const t = Math.round(performance.now() - recordStartTime);
    recordingEvents.push({type, x, y, t});
  }

  function strokeWaveformPath(x1, y1, x2, y2, mode, color){
    const mainStyle = (mode === 'solid') ? color : makeGradient(color);
    const glowStyle = 'rgba(255,255,255,0.22)';
    drawWaveformLine(x1, y1, x2, y2, 22, mainStyle);
    drawWaveformLine(x1, y1, x2, y2, 8, glowStyle);
  }

  function drawPathWithSymmetry(x1, y1, x2, y2, mode, color, symmetry){
    const {cx, cy} = getCanvasCenter();
    if (!symmetry){
      strokeWaveformPath(x1, y1, x2, y2, mode, color);
      return;
    }
    const x1m = 2 * cx - x1;
    const y1m = 2 * cy - y1;
    const x2m = 2 * cx - x2;
    const y2m = 2 * cy - y2;
    strokeWaveformPath(x1, y1, x2, y2, mode, color);
    strokeWaveformPath(x1m, y1, x2m, y2, mode, color);
    strokeWaveformPath(x1, y1m, x2, y2m, mode, color);
    strokeWaveformPath(x1m, y1m, x2m, y2m, mode, color);
  }

  function getRecordedInstrument(){
    const rgb = hexToRgb(recordBrushColor);
    return colorToInstrument(rgb[0], rgb[1], rgb[2]);
  }

  function startRecording(){
    if (isLooping) stopLooping();
    isRecording = true;
    recordingEvents = [];
    recordStartTime = performance.now();
    recordBrushMode = brushMode;
    recordBrushColor = brushColor;
    recordSymmetryMode = symmetryMode;
    recordBtn.textContent = 'Recording...';
    recordBtn.classList.add('active');
    recordTimer = setTimeout(() => {
      if (isRecording){
        stopRecording();
        if (recordingEvents.length > 0) startLooping();
      }
    }, 5000);
  }

  function stopRecording(){
    if (!isRecording) return;
    isRecording = false;
    recordBtn.classList.remove('active');
    if (recordTimer){
      clearTimeout(recordTimer);
      recordTimer = null;
    }
    recordBtn.textContent = 'Record';
  }

  function stopLooping(){
    isLooping = false;
    recordBtn.textContent = 'Record';
    recordBtn.classList.remove('active');
    loopTimeouts.forEach(clearTimeout);
    loopTimeouts = [];
    replayDrawing = false;
    lastReplay = null;
    lastReplayTime = 0;
    stopTone();
  }

  function replayEvent(ev){
    if (!isLooping) return;
    const x = ev.x;
    const y = ev.y;
    if (ev.type === 'down'){
      replayDrawing = true;
      lastReplay = {x, y};
      lastReplayTime = ev.t;
      const freqList = recordSymmetryMode ? getSymmetryFrequencies(x, y) : [PitchOnY(y)];
      startTone(freqList, getRecordedInstrument());
      return;
    }
    if (ev.type === 'move' && replayDrawing && lastReplay){
      const dt = (ev.t - lastReplayTime) / 1000;
      const dx = x - lastReplay.x;
      const dy = y - lastReplay.y;
      const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0.1;
      drawPathWithSymmetry(lastReplay.x, lastReplay.y, x, y, recordBrushMode, recordBrushColor, recordSymmetryMode);
      const freqList = recordSymmetryMode ? getSymmetryFrequencies(x, y) : [PitchOnY(y)];
      updateTone(freqList, speed);
      lastReplay = {x, y};
      lastReplayTime = ev.t;
      return;
    }
    if (ev.type === 'up'){
      replayDrawing = false;
      lastReplay = null;
      lastReplayTime = ev.t;
      stopTone();
    }
  }

  function scheduleLoopEvents(){
    if (!recordingEvents.length) return;
    loopTimeouts.forEach(clearTimeout);
    loopTimeouts = [];
    isLooping = true;
    recordBtn.textContent = 'Stop Loop';
    recordBtn.classList.add('active');
    recordingEvents.forEach(ev => {
      const id = setTimeout(() => replayEvent(ev), ev.t);
      loopTimeouts.push(id);
    });
    const totalDuration = recordingEvents[recordingEvents.length - 1].t;
    const loopId = setTimeout(() => {
      if (isLooping) scheduleLoopEvents();
    }, totalDuration + 20);
    loopTimeouts.push(loopId);
  }

  function startLooping(){
    if (!recordingEvents.length) return;
    stopRecording();
    scheduleLoopEvents();
  }

  function getWaveformParams(speed){
    const phaseSpeed = 0.06 + Math.min(0.24, speed * 0.5);
    const amplitude = 4 + Math.min(18, speed * 36);
    const toneFactor = (currentInstrument === 'bass') ? 2.6 : (currentInstrument === 'piano') ? 3.6 : 4.5;
    const cycles = 1.4 + (toneFactor * 0.18);
    return {phaseSpeed, amplitude, cycles};
  }

  function drawWaveformLine(x1, y1, x2, y2, thickness, strokeStyle){
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;

    const segments = Math.max(12, Math.floor(len * 0.18));
    const {phaseSpeed, amplitude, cycles} = getWaveformParams(Math.hypot(dx, dy) / Math.max(1, len));
    wavePhase += phaseSpeed;

    const points = [];
    for (let i = 0; i <= segments; i++){
      const t = i / segments;
      const bx = x1 + nx * len * t;
      const by = y1 + ny * len * t;
      const wave = Math.sin(wavePhase + t * cycles * Math.PI * 2) * amplitude * (1 - Math.abs(t - 0.5) * 2);
      points.push({x: bx + px * wave, y: by + py * wave});
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = thickness;
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++){
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function getSymmetryFrequencies(x,y){
    const {cx, cy} = getCanvasCenter();
    const points = [
      {x, y},
      {x: 2 * cx - x, y},
      {x, y: 2 * cy - y},
      {x: 2 * cx - x, y: 2 * cy - y}
    ];
    return points.map(({x, y}) => {
      const base = PitchOnY(y);
      const xShift = 1 + ((x - cx) / Math.max(cx, 1)) * 0.03;
      return base * xShift;
    });
  }

  function hexToRgb(hex){
    const h = hex.replace('#','');
    const bigint = parseInt(h, 16);
    if (h.length === 3){
      return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    }
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  // Map Y coordinate (CSS pixels) to frequency (Hz) — higher on screen -> higher pitch
  function PitchOnY(y){
    const rect = canvas.getBoundingClientRect();
    const h = rect.height || 1;
    const norm = Math.max(0, Math.min(1, 1 - (y / h)));
    const minF = 120; // low note
    const maxF = 1500; // high note
    return minF * Math.pow(maxF / minF, norm);
  }

  // sample canvas pixel color at CSS coords x,y
  function sampleColorAt(x,y){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const sx = Math.floor(x * dpr);
    const sy = Math.floor(y * dpr);
    try{
      const data = ctx.getImageData(sx, sy, 1, 1).data;
      return data; // [r,g,b,a]
    }catch(e){
      return [0,0,0,0];
    }
  }

  // map sampled color to instrument name
  function colorToInstrument(r,g,b){
    if (r > 150 && r > g && r > b) return 'bass';
    if (b > 150 && b > r && b > g) return 'piano';
    if (r > 140 && g > 140 && b < 140) return 'synth';
    if (b >= r && b >= g) return 'piano';
    if (r >= b && r >= g) return 'bass';
    return 'synth';
  }

  function makeDistortion(amount){
    const n = 4096;
    const curve = new Float32Array(n);
    const k = typeof amount === 'number' ? amount : 50;
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
    }
    const sh = audioCtx.createWaveShaper();
    sh.curve = curve;
    sh.oversample = '4x';
    return sh;
  }

  function ensureAudio(){
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // create and start a voice group for an instrument; returns {voices, gain}
  function createVoiceGroup(instrument, freqList){
    const now = audioCtx.currentTime;
    const group = {
      voices: [],
      outGain: audioCtx.createGain(),
      velocityGain: audioCtx.createGain(),
      delayNode: audioCtx.createDelay(1.2),
      feedbackGain: audioCtx.createGain(),
      toneFilter: null,
      frequencies: freqList.slice(),
      instrument
    };
    group.outGain.gain.value = 1;
    group.velocityGain.gain.value = 0.08;
    const delayTime = (instrument === 'bass') ? 0.24 : (instrument === 'piano') ? 0.18 : 0.14;
    const feedbackLevel = (instrument === 'bass') ? 0.45 : (instrument === 'piano') ? 0.35 : 0.4;
    group.delayNode.delayTime.value = delayTime;
    group.feedbackGain.gain.value = feedbackLevel;

    if (instrument === 'bass'){
      const sh = makeDistortion(400);
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 1.2;
      group.toneFilter = filter;
      for (let i = 0; i < freqList.length; i++){
        const o = audioCtx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freqList[i] * 0.5;
        o.connect(sh);
        group.voices.push({osc:o, freqIndex:i, freqFactor:0.5});
      }
      sh.connect(filter);
      filter.connect(group.velocityGain);
    } else if (instrument === 'piano'){
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3000;
      filter.Q.value = 1;
      group.toneFilter = filter;
      for (let i = 0; i < freqList.length; i++){
        const baseFreq = freqList[i];
        const o1 = audioCtx.createOscillator();
        o1.type = 'sine';
        o1.frequency.value = baseFreq;
        const o2 = audioCtx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = baseFreq * 1.005;
        const g = audioCtx.createGain();
        g.gain.value = 0.6;
        o1.connect(g);
        o2.connect(g);
        g.connect(filter);
        group.voices.push({osc:o1, freqIndex:i, freqFactor:1});
        group.voices.push({osc:o2, freqIndex:i, freqFactor:1.005});
      }
      filter.connect(group.velocityGain);
    } else {
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      hp.Q.value = 1;
      group.toneFilter = hp;
      for (let i = 0; i < freqList.length; i++){
        const baseFreq = freqList[i];
        const o = audioCtx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = baseFreq * 1.2;
        const sub = audioCtx.createOscillator();
        sub.type = 'square';
        sub.frequency.value = baseFreq * 0.5;
        o.connect(hp);
        sub.connect(hp);
        group.voices.push({osc:o, freqIndex:i, freqFactor:1.2});
        group.voices.push({osc:sub, freqIndex:i, freqFactor:0.5});
      }
      hp.connect(group.velocityGain);
    }

    group.velocityGain.connect(group.outGain);
    group.outGain.connect(audioCtx.destination);
    group.outGain.connect(group.delayNode);
    group.delayNode.connect(audioCtx.destination);
    group.delayNode.connect(group.feedbackGain);
    group.feedbackGain.connect(group.delayNode);

    for (const v of group.voices) v.osc.start(now);
    return group;
  }

  function startTone(freqList, instrument){
    if (!audioEnabled) return;
    ensureAudio(); if (audioCtx.state === 'suspended') audioCtx.resume();
    const newGroup = createVoiceGroup(instrument, freqList);
    const now = audioCtx.currentTime;
    newGroup.outGain.gain.setValueAtTime(0.0001, now);
    newGroup.outGain.gain.exponentialRampToValueAtTime(1.0, now + 0.05);
    newGroup.feedbackGain.gain.setValueAtTime(newGroup.feedbackGain.gain.value, now);
    newGroup.velocityGain.gain.setValueAtTime(0.08, now);
    if (currentVoiceGroup){
      try{
        currentVoiceGroup.outGain.gain.cancelScheduledValues(now);
        currentVoiceGroup.outGain.gain.setValueAtTime(currentVoiceGroup.outGain.gain.value, now);
        currentVoiceGroup.outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        currentVoiceGroup.feedbackGain.gain.cancelScheduledValues(now);
        currentVoiceGroup.feedbackGain.gain.setValueAtTime(currentVoiceGroup.feedbackGain.gain.value, now);
        currentVoiceGroup.feedbackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        currentVoiceGroup.velocityGain.gain.cancelScheduledValues(now);
        currentVoiceGroup.velocityGain.gain.setValueAtTime(currentVoiceGroup.velocityGain.gain.value, now);
        currentVoiceGroup.velocityGain.gain.exponentialRampToValueAtTime(0.02, now + 0.15);
      }catch(e){}
      setTimeout(()=>{
        if (currentVoiceGroup){
          try{ for (const v of currentVoiceGroup.voices) v.osc.stop(); }catch(e){}
        }
      }, 220);
    }
    currentVoiceGroup = newGroup;
    voices = newGroup.voices;
    gainNode = newGroup.outGain;
    tonePlaying = true;
    currentInstrument = instrument;
  }

  function updateTone(freqs, speed){
    if (!tonePlaying || !currentVoiceGroup || !voices.length) return;
    const timeList = Array.isArray(freqs) ? freqs : [freqs];
    const now = audioCtx.currentTime;
    const speedNorm = Math.min(1, speed / 0.8);
    const volume = 0.08 + (0.22 - 0.08) * speedNorm;
    if (currentVoiceGroup.velocityGain){
      currentVoiceGroup.velocityGain.gain.setTargetAtTime(volume, now, 0.03);
    }
    if (currentVoiceGroup.toneFilter){
      if (currentInstrument === 'bass'){
        currentVoiceGroup.toneFilter.frequency.setTargetAtTime(900 + 1100 * speedNorm, now, 0.05);
        currentVoiceGroup.toneFilter.Q.setTargetAtTime(1.2 + 4.5 * speedNorm, now, 0.05);
      } else if (currentInstrument === 'piano'){
        currentVoiceGroup.toneFilter.frequency.setTargetAtTime(2600 + 2600 * speedNorm, now, 0.05);
        currentVoiceGroup.toneFilter.Q.setTargetAtTime(1 + 2.8 * speedNorm, now, 0.05);
      } else {
        currentVoiceGroup.toneFilter.frequency.setTargetAtTime(180 + 760 * speedNorm, now, 0.05);
        currentVoiceGroup.toneFilter.Q.setTargetAtTime(1 + 5 * speedNorm, now, 0.05);
      }
    }
    for (const v of voices){
      try{
        const baseFreq = timeList[v.freqIndex % timeList.length];
        const target = baseFreq * (v.freqFactor || 1);
        v.osc.frequency.setTargetAtTime(target, now, 0.02);
      }catch(e){}
    }
  }

  function stopTone(){
    if (!tonePlaying || !currentVoiceGroup) return;
    const now = audioCtx.currentTime;
    try{
      currentVoiceGroup.outGain.gain.cancelScheduledValues(now);
      currentVoiceGroup.outGain.gain.setValueAtTime(currentVoiceGroup.outGain.gain.value, now);
      currentVoiceGroup.outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      currentVoiceGroup.feedbackGain.gain.cancelScheduledValues(now);
      currentVoiceGroup.feedbackGain.gain.setValueAtTime(currentVoiceGroup.feedbackGain.gain.value, now);
      currentVoiceGroup.feedbackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    }catch(e){}
    setTimeout(()=>{
      try{ for (const v of currentVoiceGroup.voices) v.stop(); }catch(e){}
    }, 240);
    voices = [];
    gainNode = null;
    currentVoiceGroup = null;
    tonePlaying = false;
    currentInstrument = null;
  }

  function beginStroke(x,y){
    if (isLooping) stopLooping();
    drawing = true;
    last = {x,y};
    lastPointerTime = performance.now();
  }

  function endStroke(){
    drawing = false;
    last = null;
    ctx.beginPath();
  }

  function drawTo(x,y){
    if (!drawing || !last) return;
    drawPathWithSymmetry(last.x, last.y, x, y, brushMode, brushColor, symmetryMode);
    last = {x,y};
  }


  // pointer events (works for mouse and touch)
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    canvas.setPointerCapture(e.pointerId);
    beginStroke(x, y);
    addRecordingEvent('down', x, y);
    let instr;
    if (brushMode === 'solid'){
      const rgb = hexToRgb(brushColor);
      instr = colorToInstrument(rgb[0], rgb[1], rgb[2]);
    } else {
      const c = sampleColorAt(x,y);
      instr = colorToInstrument(c[0], c[1], c[2]);
    }
    const freqList = symmetryMode ? getSymmetryFrequencies(x, y) : [PitchOnY(y)];
    startTone(freqList, instr);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addRecordingEvent('move', x, y);
    const now = performance.now();
    const dt = Math.max(8, now - lastPointerTime);
    const dx = x - last.x;
    const dy = y - last.y;
    const speed = Math.hypot(dx, dy) / dt;
    lastPointerTime = now;
    drawTo(x, y);
    updateBackgroundVibe();
    const freqList = symmetryMode ? getSymmetryFrequencies(x, y) : [PitchOnY(y)];
    if (brushMode === 'solid'){
      const rgb = hexToRgb(brushColor);
      const instr = colorToInstrument(rgb[0], rgb[1], rgb[2]);
      if (instr !== currentInstrument){ stopTone(); startTone(freqList, instr); }
      else updateTone(freqList, speed);
    } else {
      const c = sampleColorAt(x,y);
      const instr = colorToInstrument(c[0], c[1], c[2]);
      if (instr !== currentInstrument){ stopTone(); startTone(freqList, instr); }
      else updateTone(freqList, speed);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    try { canvas.releasePointerCapture(e.pointerId); } catch(_){ }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addRecordingEvent('up', x, y);
    endStroke();
    stopTone();
  });
  canvas.addEventListener('pointercancel', endStroke);

  // prevent accidental drags/select
  canvas.addEventListener('dragstart', (e)=>e.preventDefault());

  // clean button
  cleanBtn.addEventListener('click', ()=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    updateBackgroundVibe();
  });

  // initialize
  window.addEventListener('resize', () => resizeCanvas());
  window.addEventListener('load', () => setTimeout(resizeCanvas, 0));
  // also run once now
  resizeCanvas();

  // UI controls
  if (colorPicker){
    colorPicker.addEventListener('input', (e)=>{ brushColor = e.target.value; });
  }
  if (modeBtn){
    modeBtn.addEventListener('click', ()=>{
      brushMode = (brushMode === 'solid') ? 'gradient' : 'solid';
      modeBtn.textContent = (brushMode === 'solid') ? 'Solid' : 'Gradient';
    });
  }
  if (symmetryBtn){
    symmetryBtn.addEventListener('click', ()=>{
      symmetryMode = !symmetryMode;
      symmetryBtn.classList.toggle('active', symmetryMode);
      symmetryBtn.textContent = symmetryMode ? 'Symmetry: On' : 'Symmetry';
    });
  }
  if (recordBtn){
    recordBtn.addEventListener('click', ()=>{
      if (isLooping){
        stopLooping();
      } else if (isRecording){
        stopRecording();
        if (recordingEvents.length > 0) startLooping();
      } else {
        startRecording();
      }
    });
  }
  if (magicBtn){
    magicBtn.addEventListener('click', ()=>{
      scatterAndClear();
    });
  }
  if (soundBtn){
    soundBtn.addEventListener('click', ()=>{
      audioEnabled = !audioEnabled;
      soundBtn.textContent = 'Sound: ' + (audioEnabled ? 'On' : 'Off');
      if (!audioEnabled){
        stopTone();
        stopAmbient();
      } else {
        updateBackgroundVibe();
      }
    });
  }


})();
