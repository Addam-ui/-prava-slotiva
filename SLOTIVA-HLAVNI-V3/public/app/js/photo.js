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
