// Detección de tono con YIN (de Cheveigné & Kawahara, 2002) + suavizado para voz.
import { freqToMidi, midiToFreq } from './notes.js';

/** YIN con buffers preasignados (corre ~60 veces por segundo, sin basura para el GC). */
export class Yin {
  constructor(sampleRate, size, { minFreq = 75, maxFreq = 1050, threshold = 0.15 } = {}) {
    this.sampleRate = sampleRate;
    this.maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(size / 2));
    this.minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.threshold = threshold;
    this.d = new Float32Array(this.maxTau + 1);
  }

  /** Devuelve { freq, aperiodicity } o null. aperiodicity ~0 = tono limpio, ~1 = ruido. */
  detect(buf) {
    const { maxTau, minTau, d, threshold } = this;
    const W = buf.length - maxTau;

    // Función de diferencia + normalización por media acumulada (pasos 2 y 3 de YIN).
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const x = buf[i] - buf[i + tau];
        sum += x * x;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
    }

    // Umbral absoluto (paso 4): el PRIMER valle bajo el umbral. Tomar el primero y no el
    // mínimo global es lo que evita caer una octava abajo (periodo 2T).
    let tau = -1;
    for (let t = minTau; t < maxTau; t++) {
      if (d[t] < threshold) {
        while (t + 1 < maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      tau = minTau;
      for (let t = minTau + 1; t < maxTau; t++) if (d[t] < d[tau]) tau = t;
    }
    if (tau >= maxTau - 1) return null; // periodo fuera del rango buscado

    // Interpolación parabólica (paso 5) para precisión sub-muestra.
    const a = d[tau - 1], b = d[tau], c = d[tau + 1];
    const den = a + c - 2 * b;
    const shift = den > 0 ? Math.max(-1, Math.min(1, (0.5 * (a - c)) / den)) : 0;
    return { freq: this.sampleRate / (tau + shift), aperiodicity: b };
  }
}

function median(arr) {
  const s = [...arr].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Convierte frames crudos en una lectura estable de voz:
 * - compuerta de volumen (silencio = nada en pantalla)
 * - exige `onsetFrames` seguidos con tono antes de mostrar algo (cero notas fantasma)
 * - mediana de los últimos `smoothFrames` en escala de semitonos
 * - un salto de ~octava debe repetirse `octaveConfirmFrames` antes de aceptarse
 * - huecos cortos (respiración, consonante) mantienen la última nota `releaseFrames`
 *
 * process() devuelve { voiced, held, midi, freq, rms }.
 *   voiced: hay nota en pantalla.   held: es la nota anterior sostenida (no sumar a mediciones).
 */
export class PitchTracker {
  constructor({
    sampleRate,
    bufferSize = 2048,
    minFreq = 75,
    maxFreq = 1050,
    rmsGate = 0.008,
    maxAperiodicity = 0.3,
    smoothFrames = 7,
    onsetFrames = 3,
    releaseFrames = 8,
    octaveConfirmFrames = 6,
  }) {
    this.yin = new Yin(sampleRate, bufferSize, { minFreq, maxFreq });
    Object.assign(this, { minFreq, maxFreq, rmsGate, maxAperiodicity, smoothFrames, onsetFrames, releaseFrames, octaveConfirmFrames });
    this.reset();
  }

  reset() {
    this.history = [];
    this.current = null; // MIDI suavizado que está en pantalla
    this.onsetRun = 0;
    this.misses = 0;
    this.octaveRun = 0;
  }

  process(buf) {
    let sq = 0;
    for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
    const rms = Math.sqrt(sq / buf.length);

    let raw = null;
    if (rms >= this.rmsGate) {
      const y = this.yin.detect(buf);
      if (y && y.aperiodicity <= this.maxAperiodicity && y.freq >= this.minFreq && y.freq <= this.maxFreq) {
        raw = freqToMidi(y.freq);
      }
    }

    if (raw === null) return this.#miss(rms);
    this.misses = 0;

    if (this.current === null) {
      this.history.push(raw);
      if (this.history.length > this.smoothFrames) this.history.shift();
      if (++this.onsetRun < this.onsetFrames) return { voiced: false, rms };
      this.current = median(this.history);
      return this.#out(rms, false);
    }

    const jump = raw - this.current;
    const oct = Math.round(jump / 12);
    if (oct !== 0 && Math.abs(jump - 12 * oct) < 0.7) {
      // Parece salto de octava: típico error de detección en un armónico. Lo ignoramos
      // hasta que se repita varios frames seguidos (entonces sí cambiaste de octava).
      if (++this.octaveRun < this.octaveConfirmFrames) return this.#out(rms, true);
      this.history.length = 0;
    }
    this.octaveRun = 0;

    this.history.push(raw);
    if (this.history.length > this.smoothFrames) this.history.shift();
    this.current = median(this.history);
    return this.#out(rms, false);
  }

  #miss(rms) {
    this.misses++;
    this.octaveRun = 0;
    if (this.current !== null && this.misses < this.releaseFrames) return this.#out(rms, true);
    this.reset();
    return { voiced: false, rms };
  }

  #out(rms, held) {
    return { voiced: true, held, midi: this.current, freq: midiToFreq(this.current), rms };
  }
}
