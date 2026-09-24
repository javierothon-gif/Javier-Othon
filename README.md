# Ear Trainer · MVP

App web para sacar canciones de oído en guitarra: sube un audio, marca una sección sobre la waveform, repítela en loop y bájale la velocidad sin cambiar el tono.

Todo corre local en el navegador. No hay cuentas ni servidor: el audio nunca sale de tu computadora.

## Cómo correrla

Es una página estática (HTML + CSS + JS, sin build). Los módulos ES necesitan servirse por HTTP, así que no funciona con doble clic en `index.html`:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Qué hace

| Función | Cómo |
|---|---|
| Cargar audio | Botón “Subir audio” o arrastra un mp3/wav a la página |
| Waveform grande | 220 px de alto, zoom hasta ~200 px por segundo |
| Marcar loop | Arrastra sobre la waveform. Mueve la sección o sus bordes para ajustarla; ±0.1 s con los botones |
| Loop | Se activa solo al marcar una sección. Toggle con el botón o `L`; `Esc` la borra |
| Velocidad | 25%–150% en pasos de 5%, presets 50–100%. Mantiene la afinación (`preservesPitch`) |

### Atajos

- `Espacio`: play / pausa
- `←` / `→`: ±5 s
- `L`: loop on/off
- `[` / `]`: velocidad −5% / +5%
- `Esc`: borrar sección

## Estructura

- `index.html`: layout
- `styles.css`: estilos
- `app.js`: lógica (carga, transporte, loop, velocidad, zoom)
- `vendor/`: [wavesurfer.js](https://wavesurfer.xyz) v7.12.12 y su plugin de regiones (BSD-3-Clause), incluidos en el repo para no depender de un CDN

## Notas técnicas

- **Velocidad sin cambio de tono:** se usa el time-stretching nativo del navegador (`HTMLMediaElement.preservesPitch`). Suena limpio hasta ~50%; más abajo aparecen artefactos. Si hace falta más calidad en velocidades muy bajas, el siguiente paso es cambiar a SoundTouch/Rubber Band en un AudioWorklet.
- **Loop:** en cada `timeupdate` (~60 veces por segundo) se revisa si el cursor pasó el final de la sección y se regresa al inicio. El salto puede tener unos milisegundos de desfase; para un loop sample-accurate habría que pasar a `AudioBufferSourceNode` con `loopStart`/`loopEnd`.
- **Fuera de alcance en esta versión:** separación de pistas, cuentas de usuario y links de YouTube (esto último requiere backend).
