// Medidor de aguja: centro = nota objetivo, extremos = ±50 cents.

const RANGE = 50; // cents a cada lado
const MAX_ANGLE = 60; // grados

const SVG = `
<svg viewBox="0 0 200 118" class="meter-svg" aria-hidden="true">
  <path d="M 20 100 A 80 80 0 0 1 180 100" class="meter-arc" />
  <path d="M ${100 - 80 * Math.sin(Math.PI / 30)} ${100 - 80 * Math.cos(Math.PI / 30)} A 80 80 0 0 1 ${100 + 80 * Math.sin(Math.PI / 30)} ${100 - 80 * Math.cos(Math.PI / 30)}" class="meter-zone" />
  ${[-50, -25, 0, 25, 50].map((c) => {
    const a = ((c / RANGE) * MAX_ANGLE * Math.PI) / 180;
    const r1 = c === 0 ? 66 : 72;
    return `<line x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + 88 * Math.sin(a)}" y2="${100 - 88 * Math.cos(a)}" class="meter-tick" />`;
  }).join('')}
  <text x="22" y="116" class="meter-label">−50</text>
  <text x="178" y="116" class="meter-label" text-anchor="end">+50</text>
  <g class="meter-needle"><line x1="100" y1="100" x2="100" y2="26" /><circle cx="100" cy="100" r="6" /></g>
</svg>`;

export function createMeter(container) {
  container.innerHTML = SVG;
  const needle = container.querySelector('.meter-needle');
  return {
    /** cents: desviación con signo, o null para silencio. */
    set(cents) {
      if (cents === null) {
        container.dataset.state = 'idle';
        needle.style.transform = 'rotate(0deg)';
        return;
      }
      const clamped = Math.max(-RANGE, Math.min(RANGE, cents));
      container.dataset.state = Math.abs(cents) <= 10 ? 'good' : Math.abs(cents) <= 25 ? 'near' : 'far';
      needle.style.transform = `rotate(${(clamped / RANGE) * MAX_ANGLE}deg)`;
    },
  };
}
