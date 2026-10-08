// Micrófono crudo: sin cancelación de eco, supresión de ruido ni ganancia automática,
// porque esos filtros deforman el tono y la dinámica de la voz.

export async function openMic(ctx, fftSize = 2048) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Tu navegador no da acceso al micrófono aquí. Abre la app con https (o localhost) en Chrome o Safari.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  // Safari solo procesa nodos conectados a la salida: lo mandamos a un gain en 0 (sin eco).
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(analyser);
  analyser.connect(sink);
  sink.connect(ctx.destination);

  const buf = new Float32Array(analyser.fftSize);
  return {
    size: analyser.fftSize,
    read() {
      analyser.getFloatTimeDomainData(buf);
      return buf;
    },
    close() {
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      analyser.disconnect();
      sink.disconnect();
    },
  };
}
