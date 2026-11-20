/**
 * Volitelná šifrovaná SQLite záloha do Upstash Redis REST.
 * Jediná instance! Není to náhrada transakční sdílené PostgreSQL databáze.
 * Záměr: Render Free restart/deploy obnoví soubor slotiva.db ze šifrovaného snapshotu.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { backup } from 'node:sqlite';

const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const prefix = (process.env.UPSTASH_SNAPSHOT_KEY || 'slotiva:backup:v1').trim();
const enabled = Boolean(url && token);
const MAX_BYTES = 32 * 1024 * 1024;
const PART_SIZE = 160_000;
let lastSavedAt = null;
let lastError = null;

export function persistenceEnabled() { return enabled; }
export function durabilityStatus() {
  return { enabled, mode: enabled ? 'encrypted-upstash-snapshot' : 'local-sqlite', lastSavedAt, lastError };
}

function assertConfiguration() {
  if (!url && !token) return;
  if (!url || !token) throw new Error('Pro trvalé ukládání nastavte obě proměnné UPSTASH_REDIS_REST_URL a UPSTASH_REDIS_REST_TOKEN.');
  if (!(url.startsWith('https://') || (process.env.NODE_ENV !== 'production' && /^http:\/\/127\.0\.0\.1:\d+$/.test(url)))) {
    throw new Error('Upstash REST musí používat HTTPS.');
  }
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(prefix)) throw new Error('UPSTASH_SNAPSHOT_KEY má neplatný formát.');
  if (String(process.env.SESSION_SECRET || '').length < 32) {
    throw new Error('Pro šifrované zálohy nastavte trvalý SESSION_SECRET (min. 32 znaků). Bez něj nelze zálohu po restartu dešifrovat.');
  }
}
assertConfiguration();

const secretKey = () => crypto.createHash('sha256').update(`slotiva-snapshot:${process.env.SESSION_SECRET}`).digest();
function encrypt(bytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const value = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), value]);
}
function decrypt(bytes) {
  if (bytes[0] !== 1 || bytes.length < 30) throw new Error('Neznámý formát zálohy.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), bytes.subarray(1, 13));
  decipher.setAuthTag(bytes.subarray(13, 29));
  return Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]);
}

async function redis(...args) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(20_000),
    });
  } catch (err) { throw new Error(`Externí úložiště není dostupné: ${err.message}`); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(`Externí úložiště odmítlo požadavek (${response.status}): ${String(payload.error || '').slice(0, 120)}`);
  return payload.result;
}

async function restore(dbFile) {
  if (!enabled) return false;
  // Na placeném disku má prioritu místní DB; backup je pro bezdiskový Render Free.
  try { await fs.access(dbFile); return false; } catch { /* čekáme na snapshot */ }
  const manifestText = await redis('GET', `${prefix}:manifest`);
  if (!manifestText) return false;
  let manifest;
  try { manifest = JSON.parse(manifestText); }
  catch { throw new Error('Poškozená hlavička trvalé zálohy; nelze bezpečně spustit prázdnou DB.'); }
  if (manifest.version !== 1 || !/^[a-f0-9]{24}$/.test(manifest.id) || !Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 512) {
    throw new Error('Neplatná hlavička vzdálené zálohy.');
  }
  const blocks = [];
  for (let i = 0; i < manifest.parts; i++) {
    const part = await redis('GET', `${prefix}:${manifest.id}:${i}`);
    if (typeof part !== 'string') throw new Error(`Vzdálená záloha postrádá část ${i+1}/${manifest.parts}.`);
    blocks.push(part);
  }
  const encrypted = Buffer.from(blocks.join(''), 'base64url');
  if (encrypted.length > MAX_BYTES + 1024 || crypto.createHash('sha256').update(encrypted).digest('hex') !== manifest.hash) {
    throw new Error('Záloha se nepodařila ověřit.');
  }
  const plain = decrypt(encrypted);
  if (plain.length > MAX_BYTES || plain.subarray(0, 16).toString('ascii') !== 'SQLite format 3\0') {
    throw new Error('Rozšifrovaná záloha není platná SQLite databáze.');
  }
  const tmp = `${dbFile}.restoring-${process.pid}`;
  await fs.mkdir(path.dirname(dbFile), { recursive: true });
  await fs.writeFile(tmp, plain, { mode: 0o600 });
  await fs.rename(tmp, dbFile);
  lastSavedAt = manifest.date || null;
  console.log(`✓ Obnovena šifrovaná databáze ze vzdáleného úložiště (${plain.length} bajtů).`);
  return true;
}
export { restore as restoreDurableSnapshot };

async function store(db) {
  const backupFile = path.join(os.tmpdir(), `slotiva-backup-${process.pid}-${crypto.randomBytes(8).toString('hex')}.db`);
  let bytes;
  try {
    await backup(db, backupFile);
    bytes = await fs.readFile(backupFile);
  } finally { await fs.rm(backupFile, { force: true }).catch(() => {}); }
  if (bytes.length > MAX_BYTES) throw new Error('SQLite databáze překročila 32 MB; externí záloha byla zastavena.');
  const encrypted = encrypt(bytes);
  const data = encrypted.toString('base64url');
  const parts = Math.ceil(data.length / PART_SIZE);
  const id = crypto.randomBytes(12).toString('hex');
  const oldText = await redis('GET', `${prefix}:manifest`);
  let old;
  try { old = oldText ? JSON.parse(oldText) : null; } catch { old = null; }
  // Nejprve uložit všechny části; manifest se přepne až po úspěchu každé z nich.
  for (let i=0; i<parts; i++) {
    await redis('SET', `${prefix}:${id}:${i}`, data.slice(i*PART_SIZE,(i+1)*PART_SIZE));
  }
  const manifest = { version:1, id, parts, hash:crypto.createHash('sha256').update(encrypted).digest('hex'), date:new Date().toISOString() };
  await redis('SET', `${prefix}:manifest`, JSON.stringify(manifest));
  lastSavedAt = manifest.date;
  lastError = null;
  // Odstraníme staré bloky až PO úspěšném přepnutí manifestu; chyba cleanupu neohrozí novou zálohu.
  if (old && /^[a-f0-9]{24}$/.test(old.id) && old.parts > 0 && old.parts <= 512) {
    for (let i=0;i<old.parts;i++) {
      try { await redis('DEL', `${prefix}:${old.id}:${i}`); } catch { /* best effort */ }
    }
  }
}

export function createDurabilityManager(db) {
  let active = null;
  let needsBackup = false;
  let savedChanges = 0;
  const changes = () => Number(db.prepare('SELECT total_changes() AS n').get().n);
  function flush() {
    if (!enabled) return Promise.resolve();
    needsBackup = true;
    if (!active) {
      active = (async () => {
        do {
          needsBackup = false;
          const before = changes();
          await store(db);
          savedChanges = before;
          if (changes() !== before) needsBackup = true;
        } while (needsBackup);
      })().catch((err) => {
        lastError = String(err.message || err).slice(0, 250);
        console.error('✖ Trvalá záloha selhala:', lastError);
        throw err;
      }).finally(() => { active = null; });
    }
    return active;
  }
  function schedule() {
    if (!enabled) return;
    if (changes() === savedChanges && !needsBackup) return;
    flush().catch(() => {});
  }
  // I zápisy z plánované synchronizace s Google Kalendářem se nakonec zazálohují.
  if (enabled) setInterval(schedule, 60_000).unref();
  return { flush, schedule, changed: () => changes() !== savedChanges };
}
