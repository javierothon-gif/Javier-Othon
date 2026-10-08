// Nota de referencia con un oscilador. Triángulo: suave pero con armónicos suficientes
// para que las notas graves se oigan en audífonos pequeños.

export function playReference(ctx, freq, duration = 1.6, volume = 0.3) {
  const t0 = ctx.currentTime + 0.03;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.04);
  gain.gain.setValueAtTime(volume, t0 + duration - 0.2);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);

  let stopped = false;
  const done = new Promise((resolve) => {
    osc.onended = () => {
      gain.disconnect();
      resolve(!stopped);
    };
  });
  return {
    done, // resuelve true si sonó completa, false si se cortó
    stop() {
      if (stopped) return;
      stopped = true;
      try { osc.stop(); } catch { /* ya terminó */ }
    },
  };
}
