/** Zmenšení nahrané fotografie před uložením do DB. Žádná externí služba. */
export async function photoData(file, { limitBytes = 150_000, maxEdge = 640 } = {}) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Použijte obrázek JPG, PNG nebo WebP.');
  }
  const asData = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst.'));
    reader.readAsDataURL(blob);
  });
  if (file.size <= limitBytes) return asData(file);
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Fotografii se nepodařilo otevřít. Zkuste JPG nebo PNG.'); }
  try {
    for (const maxSize of [maxEdge, 480, 360, 260, 200]) {
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Prohlížeč nedokáže zpracovat obrázek.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.55, 0.38]) {
        const value = canvas.toDataURL('image/webp', quality);
        if (value.startsWith('data:image/webp;') && value.length <= (limitBytes * 4 / 3) + 24) return value;
      }
    }
    throw new Error('Obrázek se nepodařilo zmenšit. Zkuste menší soubor.');
  } finally { bitmap.close(); }
}

import { h, icon, openModal } from './ui.js';

/**
 * Editace výřezu fotografie před odesláním do databáze.
 * Výsledek vždy pochází z canvasu, i když je vstupní fotografie velmi malá.
 * Vrací data URL nebo null po zrušení. Bez externích knihoven a bez uploadu na cizí server.
 */
export async function cropPhoto(file, { shape = 'square', maxEdge = 640, limitBytes = 150_000 } = {}) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Vyberte obrázek JPG, PNG nebo WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Fotografie je příliš velká (maximum 20 MB).');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Fotografii se nepodařilo otevřít. Použijte JPG, PNG nebo WebP.'); }
  const landscape = shape === 'landscape';
  const width = landscape ? 800 : 560;
  const height = landscape ? 450 : 560;
  const canvas = h('canvas', { class: 'crop-canvas', width: String(width), height: String(height), 'aria-label': 'Náhled výřezu fotografie' });
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('Prohlížeč nedokáže upravit obrázek.'); }
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let drag = null;
  const baseScale = Math.max(width / bitmap.width, height / bitmap.height);
  const bounds = () => ({
    x: Math.max(0, (bitmap.width * baseScale * zoom - width) / 2),
    y: Math.max(0, (bitmap.height * baseScale * zoom - height) / 2),
  });
  function render() {
    const b = bounds();
    offsetX = Math.max(-b.x, Math.min(b.x, offsetX));
    offsetY = Math.max(-b.y, Math.min(b.y, offsetY));
    const w = bitmap.width * baseScale * zoom;
    const hh = bitmap.height * baseScale * zoom;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, (width - w) / 2 + offsetX, (height - hh) / 2 + offsetY, w, hh);
  }
  render();
  const range = h('input', { class: 'crop-range', type: 'range', min: '1', max: '3', step: '0.05', value: '1', 'aria-label': 'Přiblížení fotografie' });
  range.addEventListener('input', () => { zoom = Number(range.value); render(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    offsetX = drag.ox + (e.clientX - drag.x) * (width / bounds.width);
    offsetY = drag.oy + (e.clientY - drag.y) * (height / bounds.height);
    render();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  const encode = () => {
    for (const targetEdge of [maxEdge, 540, 420, 330, 240, 180]) {
      const ratio = Math.min(1, targetEdge / Math.max(width, height));
      const out = document.createElement('canvas');
      out.width = Math.round(width * ratio);
      out.height = Math.round(height * ratio);
      out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
      for (const quality of [0.86, 0.72, 0.55, 0.4, 0.27]) {
        const value = out.toDataURL('image/webp', quality);
        if (value.startsWith('data:image/webp;') && value.length <= Math.floor(limitBytes * 4 / 3) + 24) return value;
      }
    }
    throw new Error('Výřez se nepodařilo dostatečně zmenšit. Zkuste jinou fotografii.');
  };
  return new Promise((resolve) => {
    let answer = null;
    const modal = openModal({ title: landscape ? 'Upravit fotografii pozadí' : 'Upravit výřez fotografie', size: 'modal-photo', onClose: () => {
      bitmap.close();
      resolve(answer);
    } });
    const hint = h('p', { class: 'hint' }, 'Fotografii posuňte tažením a pomocí posuvníku nastavte přiblížení. Uloží se přesně tento výřez.');
    modal.body.append(h('div', { class: `crop-stage ${landscape ? 'crop-wide' : 'crop-square'}` }, canvas),
      h('div', { class: 'crop-controls' }, icon('search', 17), range), hint);
    const error = h('div', { class: 'hint', role: 'alert' });
    modal.foot.append(error,
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: modal.close }, 'Zrušit'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => {
        try { answer = encode(); modal.close(); }
        catch (err) { error.textContent = err.message; }
      } }, icon('check', 16), 'Použít výřez'));
  });
}

/** Vzhledově jednotné ovládání výběru fotky; data se odešlou až v onChange. */
export function imagePicker({ label, value = '', shape = 'square', maxEdge = 640, limitBytes = 150_000, onChange, onRemove }) {
  const file = h('input', { type: 'file', class: 'image-upload-native', accept: 'image/jpeg,image/png,image/webp', 'aria-label': label });
  const thumbnail = h('div', { class: `image-upload-preview ${shape === 'landscape' ? 'is-wide' : ''}` });
  const subtitle = h('span', { class: 'image-upload-subtitle' }, 'JPG, PNG nebo WebP · upravíte výřez před uložením');
  function show(src) {
    thumbnail.replaceChildren(src ? h('img', { src, alt: label }) : icon('user', 25));
  }
  show(value);
  let currentValue = value;
  const removeButton = onRemove ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
    removeButton.disabled = true;
    try { await onRemove(); currentValue = ''; show(''); removeButton.hidden = true; }
    catch (err) { subtitle.textContent = err.message; subtitle.classList.add('danger-text'); }
    finally { removeButton.disabled = false; }
  } }, 'Odebrat') : null;
  if (removeButton) removeButton.hidden = !value;
  const button = h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => file.click() }, icon('plus', 15), value ? 'Změnit fotografii' : 'Vybrat fotografii');
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    button.disabled = true;
    try {
      const result = await cropPhoto(chosen, { shape, maxEdge, limitBytes });
      if (result) {
        await onChange(result);
        show(result);
        currentValue = result;
        if (removeButton) removeButton.hidden = false;
        button.lastChild.textContent = ' Změnit fotografii';
      }
    } catch (err) {
      subtitle.textContent = err.message;
      subtitle.classList.add('danger-text');
    } finally {
      file.value = '';
      button.disabled = false;
    }
  });
  return h('div', { class: 'image-upload', role: 'group', 'aria-label': label },
    thumbnail,
    h('div', { class: 'image-upload-actions' }, h('div', { class: 'image-upload-label' }, label),
      h('div', { class: 'image-upload-buttons' }, button, removeButton), subtitle, file));
}
