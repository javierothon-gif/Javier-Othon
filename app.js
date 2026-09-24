import WaveSurfer from './vendor/wavesurfer.esm.js';

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
};

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

let objectUrl = null;

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function loadFile(file) {
  if (!file || !(file.type.startsWith('audio/') || /\.(mp3|wav)$/i.test(file.name))) {
    alert('Ese archivo no parece audio. Sube un mp3 o wav.');
    return;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);

  ui.trackName.textContent = file.name;
  ui.dropzone.hidden = true;
  ui.player.hidden = false;
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
});
ws.on('timeupdate', (t) => (ui.currentTime.textContent = formatTime(t)));
ws.on('play', () => (ui.play.textContent = '❚❚'));
ws.on('pause', () => (ui.play.textContent = '▶'));
ws.on('error', (err) => alert(`No pude leer el audio: ${err.message || err}`));

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
  }
});
