// Persistencia local del módulo. Cada intento queda guardado para graficar progreso después.

const KEY = 'sonicear.entonacion.v1';
const MAX_ATTEMPTS = 5000;

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && typeof data === 'object') return { range: data.range ?? null, attempts: data.attempts ?? [] };
  } catch { /* sin storage o JSON roto: empezamos limpio */ }
  return { range: null, attempts: [] };
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* modo privado / cuota llena: la app sigue funcionando sin guardar */ }
}

/** Rango cómodo de voz: { low, high } en MIDI. */
export const getRange = () => load().range;

export function setRange(range) {
  const data = load();
  data.range = range;
  save(data);
}

/** attempt: { date (ISO), target ("A4"), targetMidi, cents (con signo), absCents, octaveOff } */
export function addAttempt(attempt) {
  const data = load();
  data.attempts.push(attempt);
  if (data.attempts.length > MAX_ATTEMPTS) data.attempts.splice(0, data.attempts.length - MAX_ATTEMPTS);
  save(data);
}

export const getAttempts = () => load().attempts;
