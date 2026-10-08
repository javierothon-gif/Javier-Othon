// Navegación entre módulos por #hash. Avisa a cada módulo con el evento `viewchange`.

const VIEWS = ['oido', 'entonacion'];

function route() {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'oido';
  document.body.dataset.view = view;
  for (const v of VIEWS) document.getElementById(`view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.view === view ? 'page' : 'false'));
  window.dispatchEvent(new CustomEvent('viewchange', { detail: view }));
}

window.addEventListener('hashchange', route);
route();
