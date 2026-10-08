// Conversión entre frecuencia, MIDI y nombre de nota. A4 = 440 Hz = MIDI 69.

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEO = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

const mod12 = (n) => ((n % 12) + 12) % 12;

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

/** "A4", "C#3"… a partir de un MIDI (se redondea a la nota más cercana). */
export function noteName(midi) {
  const n = Math.round(midi);
  return NAMES[mod12(n)] + (Math.floor(n / 12) - 1);
}

/** "La", "Do#"… */
export function solfeo(midi) {
  return SOLFEO[mod12(Math.round(midi))];
}

/**
 * Desviación en cents de `midi` respecto a `targetMidi`, ignorando la octava
 * (resultado en −600…+600). Sirve para medir la nota aunque se cante una octava arriba/abajo.
 */
export function centsFolded(midi, targetMidi) {
  const c = (midi - targetMidi) * 100;
  return c - 1200 * Math.round(c / 1200);
}
