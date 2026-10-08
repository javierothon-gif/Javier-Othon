// Módulo Entonación: canta lo que escuchas. Controla el flujo
// aviso de audífonos → calibración de rango → nota objetivo / modo libre.
import { openMic } from './mic.js';
import { PitchTracker } from './pitch.js';
import { noteName, solfeo, midiToFreq, centsFolded } from './notes.js';
import { playReference } from './reference.js';
import { createMeter } from './meter.js';
import * as store from './storage.js';

const HOLD_MS = 2000; // nota sostenida que se promedia en cada intento
const CALIB_MS = 1500; // nota sostenida para calibrar cada extremo
const ATTACK_MS = 250; // se ignora el ataque de la nota (la voz entra y se acomoda)
const MIN_SPAN = 5; // semitonos mínimos de rango
const LISTEN_TIMEOUT_MS = 12000;

const $ = (id) => document.getElementById(id);
const ui = {
  view: $('view-entonacion'),
  error: $('ent-error'),
  intro: $('ent-intro'),
  start: $('ent-start'),
  calib: $('ent-calib'),
  calibStep: $('ent-calib-step'),
  calibText: $('ent-calib-text'),
  calibNote: $('ent-calib-note'),
  calibBar: $('ent-calib-bar'),
  calibResult: $('ent-calib-result'),
  calibRetry: $('ent-calib-retry'),
  calibDone: $('ent-calib-done'),
  train: $('ent-train'),
  modeTarget: $('ent-mode-target'),
  modeFree: $('ent-mode-free'),
  targetBox: $('ent-target'),
  targetNote: $('ent-target-note'),
  targetSolfeo: $('ent-target-solfeo'),
  note: $('ent-note'),
  noteSolfeo: $('ent-note-solfeo'),
  cents: $('ent-cents'),
  hint: $('ent-hint'),
  meter: $('ent-meter'),
  level: $('ent-level'),
  holdBar: $('ent-hold-bar'),
  status: $('ent-status'),
  feedback: $('ent-feedback'),
  feedbackTitle: $('ent-feedback-title'),
  feedbackSub: $('ent-feedback-sub'),
  targetControls: $('ent-target-controls'),
  play: $('ent-play'),
  next: $('ent-next'),
  range: $('ent-range'),
  recalib: $('ent-recalib'),
};

const meter = createMeter(ui.meter);

let ctx = null;
let mic = null;
let tracker = null;
let raf = 0;
let lastT = 0;
let ref = null; // nota de referencia sonando
let listenStart = 0;

// phase: 'intro' | 'calib-low' | 'calib-high' | 'calib-review' | 'reference' | 'listen' | 'result' | 'free'
let phase = 'intro';
let target = null; // MIDI de la nota objetivo
let calib = { low: null, high: null };

/** Acumula una nota sostenida: ignora el ataque y se reinicia si sueltas o cambias de nota. */
class Hold {
  constructor(ms) {
    this.ms = ms;
    this.reset();
  }
  reset() {
    this.voicedMs = 0;
    this.heldMs = 0;
    this.samples = [];
  }
  push(r, dt) {
    if (!r.voiced) return this.reset();
    if (r.held) return;
    if (this.samples.length > 5 && Math.abs(r.midi - median(this.samples)) > 1) this.reset();
    this.voicedMs += dt;
    if (this.voicedMs < ATTACK_MS) return;
    this.samples.push(r.midi);
    this.heldMs += dt;
  }
  get progress() {
    return Math.min(1, this.heldMs / this.ms);
  }
  get done() {
    return this.heldMs >= this.ms;
  }
}
const hold = new Hold(HOLD_MS);
const calibHold = new Hold(CALIB_MS);

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const show = (el, on = true) => (el.hidden = !on);

function showError(msg) {
  ui.error.textContent = msg;
  show(ui.error, !!msg);
}

// --- Audio ---

async function startAudio() {
  // iOS: sesión de audio de grabación + reproducción (la referencia suena con el micro abierto).
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  } catch { /* no soportado */ }
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') await ctx.resume();
  if (!mic) {
    mic = await openMic(ctx);
    tracker = new PitchTracker({ sampleRate: ctx.sampleRate, bufferSize: mic.size });
  }
  if (!raf) {
    lastT = 0;
    raf = requestAnimationFrame(tick);
  }
}

function stopAudio() {
  cancelAnimationFrame(raf);
  raf = 0;
  ref?.stop();
  ref = null;
  mic?.close();
  mic = null;
  tracker = null;
  ctx?.suspend();
}

function tick(now) {
  raf = requestAnimationFrame(tick);
  const dt = lastT ? Math.min(now - lastT, 100) : 16;
  lastT = now;
  const r = tracker.process(mic.read());
  renderLevel(r.rms);

  switch (phase) {
    case 'calib-low':
    case 'calib-high':
      return tickCalib(r, dt);
    case 'listen':
      return tickListen(r, dt, now);
    case 'free':
    case 'result':
      return renderTuner(r);
    // 'reference': no medimos mientras suena la referencia
  }
}

// --- Pantalla del afinador ---

function renderLevel(rms) {
  const db = 20 * Math.log10(rms + 1e-9); // −60…0 dBFS
  ui.level.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
}

function renderTuner(r) {
  if (!r.voiced) {
    ui.note.textContent = '–';
    ui.noteSolfeo.textContent = '';
    ui.cents.textContent = '';
    ui.hint.textContent = phase === 'free' ? 'Canta una nota' : '';
    meter.set(null);
    return;
  }
  const center = phase === 'free' || target === null ? Math.round(r.midi) : target;
  const c = centsFolded(r.midi, center);
  ui.note.textContent = noteName(r.midi);
  ui.noteSolfeo.textContent = solfeo(r.midi);
  const rc = Math.round(c);
  ui.cents.textContent = `${rc > 0 ? '+' : rc < 0 ? '−' : ''}${Math.abs(rc)} cents`;
  meter.set(c);
  if (Math.abs(c) <= 10) ui.hint.textContent = 'En el centro. Sostenla.';
  else if (Math.abs(c) > 50) ui.hint.textContent = c > 0 ? 'Baja ↓' : 'Sube ↑';
  else ui.hint.textContent = c > 0 ? 'Un poco abajo ↓' : 'Un poco arriba ↑';
}

// --- Calibración ---

function startCalibration() {
  calib = { low: null, high: null };
  show(ui.intro, false);
  show(ui.train, false);
  show(ui.calib);
  show(ui.calibResult, false);
  show(ui.calibRetry, false);
  show(ui.calibDone, false);
  setCalibPhase('calib-low');
}

function setCalibPhase(p) {
  phase = p;
  calibHold.reset();
  tracker?.reset();
  ui.calibBar.style.width = '0%';
  ui.calibNote.textContent = '–';
  if (p === 'calib-low') {
    ui.calibStep.textContent = 'Paso 1 de 2 · Tu nota grave';
    ui.calibText.textContent = 'Canta la nota más grave que te salga cómoda, sin forzar. Un "aaa" sostenido.';
  } else {
    ui.calibStep.textContent = 'Paso 2 de 2 · Tu nota aguda';
    ui.calibText.textContent = 'Ahora la más aguda que te salga cómoda. Sin gritar: cómoda es la que podrías cantar diez veces seguidas.';
  }
}

function tickCalib(r, dt) {
  ui.calibNote.textContent = r.voiced ? `${noteName(r.midi)} · ${solfeo(r.midi)}` : '–';
  calibHold.push(r, dt);
  ui.calibBar.style.width = `${calibHold.progress * 100}%`;
  if (!calibHold.done) return;

  const midi = Math.round(median(calibHold.samples));
  if (phase === 'calib-low') {
    calib.low = midi;
    setCalibPhase('calib-high');
    return;
  }
  calib.high = midi;
  if (calib.high < calib.low) [calib.low, calib.high] = [calib.high, calib.low];
  phase = 'calib-review';
  ui.calibBar.style.width = '100%';
  const span = calib.high - calib.low;
  show(ui.calibResult);
  show(ui.calibRetry);
  if (span < MIN_SPAN) {
    ui.calibStep.textContent = 'Casi listo';
    ui.calibText.textContent = `Tu zona quedó de ${span} semitonos (${noteName(calib.low)} a ${noteName(calib.high)}). Para entrenar necesitamos al menos ${MIN_SPAN}: repítelo yendo un poquito más grave y más agudo.`;
    show(ui.calibResult, false);
    show(ui.calibDone, false);
    return;
  }
  ui.calibStep.textContent = 'Rango listo';
  ui.calibText.textContent = '';
  ui.calibResult.textContent = `Tu zona cómoda: ${noteName(calib.low)} a ${noteName(calib.high)}. Ahí vamos a entrenar.`;
  show(ui.calibDone);
}

function finishCalibration() {
  store.setRange({ low: calib.low, high: calib.high });
  startTraining();
}

// --- Entrenamiento: nota objetivo ---

function pickTarget() {
  const { low, high } = store.getRange();
  // Margen de un semitono en cada orilla si el rango lo permite: entrenamos en la zona cómoda.
  const lo = high - low >= 7 ? low + 1 : low;
  const hi = high - low >= 7 ? high - 1 : high;
  let next;
  do next = lo + Math.floor(Math.random() * (hi - lo + 1));
  while (next === target && hi > lo);
  return next;
}

function startTraining() {
  const range = store.getRange();
  show(ui.intro, false);
  show(ui.calib, false);
  show(ui.train);
  ui.range.textContent = `Tu zona: ${noteName(range.low)} a ${noteName(range.high)}`;
  setMode('target');
}

function setMode(mode) {
  ui.modeTarget.setAttribute('aria-pressed', mode === 'target');
  ui.modeFree.setAttribute('aria-pressed', mode === 'free');
  show(ui.targetBox, mode === 'target');
  show(ui.targetControls, mode === 'target');
  show(ui.feedback, false);
  ui.holdBar.parentElement.hidden = mode !== 'target';
  ref?.stop();
  tracker?.reset();
  if (mode === 'free') {
    phase = 'free';
    ui.status.textContent = 'Modo libre: canta cualquier nota y mira a cuántos cents estás de la más cercana.';
  } else {
    newTarget();
  }
}

function newTarget() {
  target = pickTarget();
  ui.targetNote.textContent = noteName(target);
  ui.targetSolfeo.textContent = solfeo(target);
  playTarget();
}

async function playTarget() {
  ref?.stop();
  phase = 'reference';
  hold.reset();
  ui.holdBar.style.width = '0%';
  show(ui.feedback, false);
  renderTuner({ voiced: false });
  ui.status.textContent = 'Escucha la nota…';
  ui.play.textContent = '🔊 Repetir';
  const thisRef = playReference(ctx, midiToFreq(target));
  ref = thisRef;
  const completed = await thisRef.done;
  if (ref !== thisRef || !completed) return; // la cortó otra acción
  ref = null;
  // Pequeña pausa para que la cola de la referencia no se cuele en la medición.
  await new Promise((res) => setTimeout(res, 150));
  if (phase !== 'reference') return;
  tracker.reset();
  phase = 'listen';
  listenStart = performance.now();
  ui.status.textContent = 'Tu turno: cántala y sostenla 2 segundos.';
}

function tickListen(r, dt, now) {
  renderTuner(r);
  const before = hold.heldMs;
  hold.push(r, dt);
  ui.holdBar.style.width = `${hold.progress * 100}%`;
  if (hold.heldMs > 0) {
    ui.status.textContent = `Sostén… ${(hold.heldMs / 1000).toFixed(1)} s`;
    listenStart = now;
  } else if (before > 0) {
    ui.status.textContent = 'Se cortó. Vuelve a entrar y sostenla 2 segundos.';
  } else if (now - listenStart > LISTEN_TIMEOUT_MS) {
    ui.status.textContent = 'No te escucho todavía. Acércate al micrófono o toca Repetir para oír la nota otra vez.';
  }
  if (hold.done) finishAttempt();
}

function finishAttempt() {
  phase = 'result';
  const diffs = hold.samples.map((m) => (m - target) * 100);
  const meanRaw = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const cents = meanRaw - 1200 * Math.round(meanRaw / 1200);
  const octaveOff = Math.abs(meanRaw) > 600;
  const rounded = Math.round(cents);

  store.addAttempt({
    date: new Date().toISOString(),
    target: noteName(target),
    targetMidi: target,
    cents: rounded,
    absCents: Math.abs(rounded),
    octaveOff,
  });

  const { title, sub } = feedback(cents, octaveOff);
  ui.feedbackTitle.textContent = title;
  ui.feedbackSub.textContent = sub;
  ui.feedback.dataset.level = Math.abs(cents) <= 10 ? 'good' : Math.abs(cents) <= 25 ? 'near' : 'far';
  show(ui.feedback);
  ui.status.textContent = 'Repite la misma nota o pasa a la siguiente.';
}

/** Lenguaje de progreso: nunca "fallaste" ni "desafinado". */
export function feedback(cents, octaveOff = false) {
  const a = Math.abs(Math.round(cents));
  const dir = cents > 0 ? 'arriba' : 'abajo';
  let title, sub;
  if (a <= 10) {
    title = '¡Clavaste la nota!';
    sub = a === 0 ? 'Justo en el centro. Así se entrena.' : `A ${a} cents: precisión de afinador. Así se entrena.`;
  } else if (a <= 25) {
    title = `Quedaste a ${a} cents, vas cerca.`;
    sub = `Un pelito ${dir}. Una rep más y la clavas.`;
  } else if (a <= 50) {
    title = `Quedaste a ${a} cents ${dir}.`;
    sub = 'Ya estás en la zona. Escúchala otra vez y ajusta fino.';
  } else {
    title = `Quedaste a ${a} cents ${dir}.`;
    sub = 'Primero escucha, luego canta. Repite la referencia y entra con calma: cada rep cuenta.';
  }
  if (octaveOff) sub += ' Cantaste otra octava y se vale: medimos la nota.';
  return { title, sub };
}

// --- Entrada / salida del módulo ---

async function begin() {
  showError('');
  ui.start.disabled = true;
  try {
    await startAudio();
    if (store.getRange()) startTraining();
    else startCalibration();
  } catch (err) {
    console.warn(err);
    showError(
      err?.name === 'NotAllowedError'
        ? 'Necesitamos el micrófono para escucharte. Dale permiso en el navegador (ícono junto a la dirección) y vuelve a tocar el botón.'
        : err?.name === 'NotFoundError'
          ? 'No encontramos un micrófono. Conecta uno y vuelve a intentarlo.'
          : err?.message || 'No pudimos abrir el micrófono.',
    );
  } finally {
    ui.start.disabled = false;
  }
}

function leave() {
  stopAudio();
  phase = 'intro';
  show(ui.calib, false);
  show(ui.train, false);
  show(ui.intro);
}

ui.start.addEventListener('click', begin);
ui.calibRetry.addEventListener('click', startCalibration);
ui.calibDone.addEventListener('click', finishCalibration);
ui.recalib.addEventListener('click', startCalibration);
ui.modeTarget.addEventListener('click', () => setMode('target'));
ui.modeFree.addEventListener('click', () => setMode('free'));
ui.play.addEventListener('click', playTarget);
ui.next.addEventListener('click', newTarget);

// Soltar el micrófono al cambiar de pestaña o mandar la app a segundo plano
// (en iPhone el indicador naranja se apaga y no gastamos batería).
window.addEventListener('viewchange', (e) => {
  if (e.detail !== 'entonacion' && phase !== 'intro') leave();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase !== 'intro') leave();
});
