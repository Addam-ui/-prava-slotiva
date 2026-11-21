import { h, icon, withBusy } from './ui.js';

/**
 * Živý náhled skutečné veřejné rezervační stránky.
 * Upravené nastavení se do iframe posílá pouze v paměti; veřejné API a databáze
 * se změní až po explicitním uložení. Rezervace v iframe je zakázaná.
 */
export function createLiveBookingPreview({ slug, getDraft, onSave }) {
  let mode = 'phone';
  let dirty = false;
  let destroyed = false;
  let isExpanded = false;
  const status = h('span', { class: 'live-preview-status', role: 'status' }, 'Zveřejněná verze');
  const frame = h('iframe', {
    class: 'live-preview-iframe',
    title: 'Živý náhled veřejné rezervační stránky',
    src: `/${encodeURIComponent(slug)}?slotivaPreview=1`,
    loading: 'eager',
    referrerpolicy: 'same-origin',
  });
  const stage = h('div', { class: 'live-preview-stage' }, frame);

  const phone = h('button', { type: 'button', class: 'btn btn-sm btn-secondary is-active',
    'aria-pressed': 'true', onClick: () => setMode('phone') }, icon('mobile', 16), 'Mobil');
  const desktop = h('button', { type: 'button', class: 'btn btn-sm btn-secondary',
    'aria-pressed': 'false', onClick: () => setMode('desktop') }, icon('globe', 16), 'Počítač');
  const submit = h('button', { type: 'button', class: 'btn btn-primary live-preview-publish', disabled: true,
    onClick: (event) => withBusy(event.currentTarget, onSave) }, icon('check', 15), 'Uložit a zveřejnit');
  const toggle = h('button', { type: 'button', class: 'btn btn-secondary live-preview-toggle',
    'aria-expanded': 'false', onClick: () => {
      isExpanded = !isExpanded;
      container.classList.toggle('is-expanded', isExpanded);
      toggle.setAttribute('aria-expanded', String(isExpanded));
      toggle.textContent = isExpanded ? 'Skrýt náhled' : 'Zobrazit živý náhled';
      resize();
    } }, 'Zobrazit živý náhled');
  const container = h('aside', { class: 'card live-preview-panel', 'aria-label': 'Živý náhled rezervací' },
    h('div', { class: 'live-preview-header' },
      h('div', {},
        h('strong', {}, 'Živý náhled stránky'),
        h('p', { class: 'hint' }, 'Přesně takhle zákazník uvidí vaši rezervaci.')),
      status),
    toggle,
    h('div', { class: 'live-preview-body' },
      h('div', { class: 'live-preview-device-switch', role: 'group', 'aria-label': 'Zobrazení náhledu' }, phone, desktop),
      stage,
      h('p', { class: 'hint live-preview-note' }, 'Změny se ukazují okamžitě. V náhledu nelze odeslat rezervaci.'),
      submit));

  function resize() {
    if (destroyed) return;
    const width = mode === 'phone' ? 390 : 1100;
    const height = mode === 'phone' ? 750 : 800;
    const available = stage.clientWidth || 380;
    const scale = Math.min(1, available / width);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `translateX(${Math.max(0, (available - width * scale) / 2)}px) scale(${scale})`;
    stage.style.height = `${Math.ceil(height * scale)}px`;
    stage.classList.toggle('is-desktop', mode === 'desktop');
  }
  function setMode(next) {
    mode = next;
    for (const [button, key] of [[phone, 'phone'], [desktop, 'desktop']]) {
      button.classList.toggle('is-active', key === mode);
      button.setAttribute('aria-pressed', String(key === mode));
    }
    resize();
  }
  function update() {
    if (destroyed || !frame.contentWindow) return;
    const current = getDraft();
    frame.contentWindow.postMessage({
      type: 'slotiva:preview-settings',
      business: current.business,
      appearance: current.appearance,
      brandColor: current.brandColor,
    }, window.location.origin);
  }
  function setDirty(next) {
    dirty = Boolean(next);
    status.textContent = dirty ? 'Neuložené změny' : 'Zveřejněná verze';
    status.classList.toggle('is-dirty', dirty);
    submit.disabled = !dirty;
  }
  function onMessage(event) {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'slotiva:preview-ready') update();
  }
  frame.addEventListener('load', update);
  window.addEventListener('message', onMessage);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(stage);
  resize();
  return {
    element: container,
    update,
    setDirty,
    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', update);
      observer?.disconnect();
    },
  };
}
