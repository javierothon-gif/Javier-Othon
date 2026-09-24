import WaveSurfer from './vendor/wavesurfer.esm.js';
import RegionsPlugin from './vendor/regions.esm.js';

const $ = (id) => document.getElementById(id);

const ui = {
  fileInput: $('file-input'),
  dropzone: $('dropzone'),
  player: $('player'),
  trackName: $('track-name'),
  currentTime: $('current-time'),
  duration: $('duration'),
  play: $('btn-play'),
  back: $('btn-back'),
  fwd: $('btn-fwd'),
  loop: $('btn-loop'),
  clearLoop: $('btn-clear-loop'),
  loopStart: $('loop-start'),
  loopEnd: $('loop-end'),
  loopHint: $('loop-hint'),
  nudges: document.querySelectorAll('[data-nudge]'),
  speed: $('speed'),
  speedValue: $('speed-value'),
  speedDown: $('speed-down'),
  speedUp: $('speed-up'),
  presets: document.querySelectorAll('[data-speed]'),
  zoom: $('zoom'),
  zoomValue: $('zoom-value'),
  error: $('error'),
};

const REGION_COLOR = 'rgba(63, 193, 255, 0.2)';
const MIN_LOOP = 0.2; // segundos

// Waveform grande: 220 px de alto (Moises usa ~100 px).
const ws = WaveSurfer.create({
  container: '#waveform',
  height: 220,
  waveColor: '#4a5163',
  progressColor: '#ff8a1f',
  cursorColor: '#ffffff',
  cursorWidth: 2,
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
  normalize: true,
  dragToSeek: false,
});

const regions = ws.registerPlugin(RegionsPlugin.create());

// Arrastrar sobre la waveform crea la sección de loop.
regions.enableDragSelection({ color: REGION_COLOR });

// --- Estado del loop ---
let loopRegion = null;
let loopOn = false;

let objectUrl = null;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function showError(msg) {
  ui.error.textContent = msg;
  ui.error.hidden = !msg;
}

function loadFile(file) {
  if (!file || !(file.type.startsWith('audio/') || /\.(mp3|wav)$/i.test(file.name))) {
    showError('Ese archivo no parece audio. Sube un mp3 o wav.');
    return;
  }
  showError('');
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);

  ui.trackName.textContent = file.name;
  ui.dropzone.hidden = true;
  ui.player.hidden = false;
  clearLoop();
  ui.zoom.value = 0;
  ws.load(objectUrl);
}

// --- Carga de archivo: botón + drag & drop sobre toda la página ---
ui.fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

['dragenter', 'dragover'].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    document.body.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    document.body.classList.remove('dragover');
  })
);
window.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

// --- Transporte ---
ui.play.addEventListener('click', () => ws.playPause());
ui.back.addEventListener('click', () => ws.setTime(Math.max(0, ws.getCurrentTime() - 5)));
ui.fwd.addEventListener('click', () => ws.setTime(Math.min(ws.getDuration(), ws.getCurrentTime() + 5)));

ws.on('ready', (dur) => {
  ui.duration.textContent = formatTime(dur);
  ui.currentTime.textContent = formatTime(0);
  // El elemento de audio reinicia su velocidad al cargar otra canción: la reaplicamos.
  setSpeed(Number(ui.speed.value));
});
ws.on('timeupdate', (t) => {
  ui.currentTime.textContent = formatTime(t);
  enforceLoop(t);
});
ws.on('play', () => (ui.play.textContent = '❚❚'));
ws.on('pause', () => (ui.play.textContent = '▶'));
ws.on('error', (err) => showError(`No pude leer el audio (${err.message || err}). Prueba con otro mp3 o wav.`));

// --- Loop ---
function setLoopOn(on) {
  loopOn = on && !!loopRegion;
  ui.loop.setAttribute('aria-pressed', String(loopOn));
  ui.loop.textContent = loopOn ? 'Loop ON' : 'Loop OFF';
}

function renderLoopInfo() {
  const has = !!loopRegion;
  ui.loopStart.textContent = has ? formatTime(loopRegion.start) : '–';
  ui.loopEnd.textContent = has ? formatTime(loopRegion.end) : '–';
  ui.loop.disabled = !has;
  ui.clearLoop.disabled = !has;
  ui.nudges.forEach((b) => (b.disabled = !has));
  ui.loopHint.textContent = has
    ? 'Arrastra la sección para moverla o sus bordes para ajustarla. Arrastra en otra zona para marcar una nueva.'
    : 'Arrastra sobre la waveform para marcar la sección que quieres sacar de oído.';
}

function clearLoop() {
  regions.clearRegions();
  loopRegion = null;
  setLoopOn(false);
  renderLoopInfo();
}

// Mientras el loop esté activo, el cursor no sale de la sección:
// al llegar al final (o si queda fuera) regresa al inicio.
function enforceLoop(t) {
  if (!loopOn || !loopRegion || !ws.isPlaying()) return;
  if (t >= loopRegion.end || t < loopRegion.start - 0.05) {
    ws.setTime(loopRegion.start);
  }
}

regions.on('region-created', (region) => {
  // Solo una sección a la vez: la nueva reemplaza a la anterior.
  regions.getRegions().forEach((r) => r !== region && r.remove());
  if (region.end - region.start < MIN_LOOP) {
    region.remove();
    return;
  }
  loopRegion = region;
  setLoopOn(true);
  renderLoopInfo();
  ws.setTime(region.start);
});

regions.on('region-updated', (region) => {
  if (region !== loopRegion) return;
  renderLoopInfo();
  const t = ws.getCurrentTime();
  if (t < region.start || t >= region.end) ws.setTime(region.start);
});

regions.on('region-removed', (region) => {
  if (region === loopRegion) {
    loopRegion = null;
    setLoopOn(false);
    renderLoopInfo();
  }
});

// Clic dentro de la sección: brinca a su inicio.
regions.on('region-clicked', (region, e) => {
  e.stopPropagation();
  ws.setTime(region.start);
});

ui.loop.addEventListener('click', () => {
  setLoopOn(!loopOn);
  if (loopOn) ws.setTime(loopRegion.start);
});
ui.clearLoop.addEventListener('click', clearLoop);

// Ajuste fino de bordes en pasos de 0.1 s.
ui.nudges.forEach((btn) =>
  btn.addEventListener('click', () => {
    if (!loopRegion) return;
    const delta = parseFloat(btn.dataset.delta);
    let { start, end } = loopRegion;
    if (btn.dataset.nudge === 'start') start = Math.min(Math.max(0, start + delta), end - MIN_LOOP);
    else end = Math.max(Math.min(ws.getDuration(), end + delta), start + MIN_LOOP);
    loopRegion.setOptions({ start, end });
    renderLoopInfo();
  })
);

// Al darle play con loop activo y el cursor fuera de la sección, arranca desde su inicio.
ws.on('play', () => {
  if (!loopOn || !loopRegion) return;
  const t = ws.getCurrentTime();
  if (t < loopRegion.start || t >= loopRegion.end) ws.setTime(loopRegion.start);
});

// --- Velocidad (pitch-preserving) ---
// preservePitch = true usa el time-stretching nativo del navegador:
// cambia el tempo sin cambiar el tono. Rango 25%–150% (Firefox silencia < 25%).
function setSpeed(percent) {
  const p = Math.min(150, Math.max(25, Math.round(percent / 5) * 5));
  ui.speed.value = p;
  ui.speedValue.textContent = `${p}%`;
  ui.presets.forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === p));
  ws.setPlaybackRate(p / 100, true);
}

ui.speed.addEventListener('input', () => setSpeed(Number(ui.speed.value)));
ui.speedDown.addEventListener('click', () => setSpeed(Number(ui.speed.value) - 5));
ui.speedUp.addEventListener('click', () => setSpeed(Number(ui.speed.value) + 5));
ui.presets.forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
setSpeed(100);

// --- Zoom ---
ui.zoom.addEventListener('input', () => {
  const pxPerSec = Number(ui.zoom.value);
  ws.zoom(pxPerSec);
  const fit = document.getElementById('waveform').clientWidth / (ws.getDuration() || 1);
  ui.zoomValue.textContent = pxPerSec <= fit ? '1×' : `${(pxPerSec / fit).toFixed(1)}×`;
});

// --- Atajos de teclado ---
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || ui.player.hidden) return;
  if (e.code === 'Space') {
    e.preventDefault();
    ws.playPause();
  } else if (e.code === 'ArrowLeft') {
    ws.setTime(Math.max(0, ws.getCurrentTime() - 5));
  } else if (e.code === 'ArrowRight') {
    ws.setTime(Math.min(ws.getDuration(), ws.getCurrentTime() + 5));
  } else if (e.code === 'KeyL' && loopRegion) {
    ui.loop.click();
  } else if (e.code === 'BracketLeft') {
    setSpeed(Number(ui.speed.value) - 5);
  } else if (e.code === 'BracketRight') {
    setSpeed(Number(ui.speed.value) + 5);
  } else if (e.code === 'Escape') {
    clearLoop();
  }
});
