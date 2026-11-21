import { DateTime } from 'luxon';
import { db, nowIso } from './db.js';
import { getSettings } from './settings.js';
import { badRequest, conflict, notFound } from './errors.js';

const MAX_DAYS = 90;
const SELECT = `SELECT t.*, u.name AS staff_name FROM staff_time_off t JOIN users u ON u.id=t.user_id`;

export function listTimeOff(userIds, from = '', to = '') {
  const ids = [...new Set(userIds.map(Number))].filter(Number.isSafeInteger);
  if (!ids.length) return [];
  const where = [`t.user_id IN (${ids.map(() => '?').join(',')})`];
  const args = [...ids];
  if (from) { where.push('t.end_utc > ?'); args.push(`${from}T00:00:00.000Z`); }
  if (to) { where.push('t.start_utc < ?'); args.push(`${to}T23:59:59.999Z`); }
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY t.start_utc, t.id`).all(...args).map(publicTimeOff);
}

export function publicTimeOff(row) {
  return {
    id: row.id, staffId: row.user_id, staffName: row.staff_name || '',
    start: row.start_utc, end: row.end_utc,
    kind: row.kind, note: row.note, status: row.status, allDay: Boolean(row.all_day),
    createdAt: row.created_at,
  };
}

export function timeOffBusy(userId, fromMs, toMs) {
  return db.prepare(`SELECT start_utc, end_utc FROM staff_time_off
      WHERE user_id = ? AND status = 'approved' AND start_utc < ? AND end_utc > ?`)
    .all(Number(userId), new Date(toMs).toISOString(), new Date(fromMs).toISOString())
    .map(row => ({ start: Date.parse(row.start_utc), end: Date.parse(row.end_utc) }));
}

export function timeOffEvents(userId, fromMs, toMs) {
  return db.prepare(`${SELECT} WHERE t.user_id=? AND t.status='approved' AND t.start_utc < ? AND t.end_utc > ? ORDER BY t.start_utc`)
    .all(Number(userId), new Date(toMs).toISOString(), new Date(fromMs).toISOString())
    .map(row => ({ id: `time-off-${row.id}`, title: row.kind === 'vacation' ? 'Dovolená' : row.kind === 'break' ? 'Přestávka' : 'Volno',
      start: row.start_utc, end: row.end_utc, allDay: row.all_day === 1, blocking: true, source: 'time-off' }));
}

function localInterval(userId, data) {
  const tz = getSettings(userId).timezone;
  const fromDate = String(data.fromDate || '');
  const toDate = String(data.toDate || fromDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw badRequest('Vyplňte platné datum začátku a konce.');
  const allDay = Boolean(data.allDay);
  const fromTime = allDay ? '00:00' : String(data.fromTime || '');
  const toTime = allDay ? '00:00' : String(data.toTime || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fromTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(toTime)) throw badRequest('Vyplňte čas v rozsahu 00:00–23:59.');
  const start = DateTime.fromISO(`${fromDate}T${fromTime}`, { zone: tz });
  const end = DateTime.fromISO(`${toDate}T${toTime}`, { zone: tz }).plus(allDay ? { days: 1 } : {});
  if (!start.isValid || !end.isValid || end <= start) throw badRequest('Konec volna musí být po začátku.');
  if (end.diff(start, 'days').days > MAX_DAYS + 1) throw badRequest('Volno může trvat nejvýše 90 dní.');
  return { start: start.toJSDate().toISOString(), end: end.toJSDate().toISOString(), allDay: Number(allDay) };
}

function conflictsWithBookings(userId, start, end) {
  return Boolean(db.prepare(`SELECT 1 FROM bookings WHERE user_id=? AND status IN ('confirmed','pending')
    AND start_utc < ? AND end_utc > ? LIMIT 1`).get(Number(userId), end, start));
}

function checkOverlap(userId, start, end, excludeId = 0) {
  return Boolean(db.prepare(`SELECT 1 FROM staff_time_off WHERE user_id=? AND status='approved' AND id <> ?
    AND start_utc < ? AND end_utc > ? LIMIT 1`).get(Number(userId), Number(excludeId), end, start));
}

export function createTimeOff({ actorId, staffId, isOwner, data }) {
  const kind = ['vacation','break','other'].includes(data.kind) ? data.kind : 'other';
  const note = String(data.note || '').trim();
  if (note.length > 500) throw badRequest('Poznámka smí mít nejvýše 500 znaků.');
  const interval = localInterval(staffId, data);
  const status = isOwner ? 'approved' : 'pending';
  if (status === 'approved' && (conflictsWithBookings(staffId, interval.start, interval.end) || checkOverlap(staffId, interval.start, interval.end))) {
    throw conflict('Volno koliduje s existující rezervací nebo schváleným volnem. Nejdřív upravte termíny.');
  }
  const info = db.prepare(`INSERT INTO staff_time_off
    (user_id, requested_by, start_utc, end_utc, all_day, kind, note, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    staffId, actorId, interval.start, interval.end, interval.allDay, kind, note, status, nowIso(), nowIso());
  return getTimeOff(info.lastInsertRowid);
}

export function getTimeOff(id) {
  const row = db.prepare(`${SELECT} WHERE t.id=?`).get(Number(id));
  if (!row) throw notFound('Volno nebylo nalezeno.');
  return publicTimeOff(row);
}

export function changeTimeOff(id, action, actorId, isOwner) {
  const row = db.prepare('SELECT * FROM staff_time_off WHERE id=?').get(Number(id));
  if (!row) throw notFound('Volno nebylo nalezeno.');
  if (!isOwner && (row.user_id !== Number(actorId) || action !== 'cancel' || row.status !== 'pending')) {
    throw badRequest('Zaměstnanec může stáhnout pouze vlastní nevyřízenou žádost.');
  }
  if (isOwner && !['approve', 'reject', 'cancel'].includes(action)) throw badRequest('Neplatná akce.');
  if (!isOwner && action !== 'cancel') throw badRequest('Tuto akci smí provést pouze majitel.');
  if (['approve', 'reject'].includes(action) && row.status !== 'pending') throw badRequest('Žádost už byla vyřízena.');
  if (action === 'approve' && (conflictsWithBookings(row.user_id, row.start_utc, row.end_utc) || checkOverlap(row.user_id, row.start_utc, row.end_utc, row.id))) {
    throw conflict('Tento termín už obsahuje rezervaci nebo schválené volno.');
  }
  if (action === 'cancel' && !['pending','approved'].includes(row.status)) throw badRequest('Volno už není aktivní.');
  const next = { approve:'approved', reject:'rejected', cancel:'cancelled' }[action];
  db.prepare('UPDATE staff_time_off SET status=?, updated_at=? WHERE id=?').run(next, nowIso(), row.id);
  return getTimeOff(row.id);
}
