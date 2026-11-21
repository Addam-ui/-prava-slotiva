/** Interní notifikace: zdarma, uloženy u konkrétního účtu, izolované mezi firmami. */
import { db, nowIso } from './db.js';

function targetIds(staffId) {
  const employee = db.prepare('SELECT id, team_owner_id FROM users WHERE id=?').get(Number(staffId));
  if (!employee) return [];
  return [...new Set([Number(employee.id), Number(employee.team_owner_id || employee.id)])];
}

export function publish({ recipients, eventKey, type, title, body = '', bookingId = null }) {
  if (!eventKey || !title) return;
  const statement = db.prepare(`INSERT OR IGNORE INTO notifications
    (user_id,booking_id,event_key,type,title,body,created_at) VALUES(?,?,?,?,?,?,?)`);
  for (const userId of [...new Set(recipients.map(Number))]) {
    statement.run(userId, bookingId, eventKey, type, title, body.slice(0, 500), nowIso());
  }
}

export function bookingNotice(row, action, { actorId = null } = {}) {
  if (!row || row.source === 'demo') return;
  const employee = db.prepare('SELECT name, team_owner_id FROM users WHERE id=?').get(row.user_id);
  const captions = {
    created: 'Nová rezervace',
    cancelled: 'Rezervace zrušena',
    confirmed: 'Rezervace potvrzena',
    no_show: 'Zákazník se nedostavil',
    rescheduled: 'Rezervace přesunuta',
  };
  const title = captions[action];
  if (!title) return;
  const recipients = targetIds(row.user_id);
  // Když zaměstnanec potvrzuje vlastní rezervaci, nedostane nadbytečné oznámení o svém kliknutí.
  const selected = actorId ? recipients.filter(id => id !== Number(actorId)) : recipients;
  const detail = `${employee?.name || 'Kalendář'} · ${row.service_name} · ${row.start_utc.slice(0,10)}`;
  publish({ recipients:selected, eventKey:`booking:${row.id}:${action}:${row.updated_at}`,
    type:'booking',title,body:detail,bookingId:row.id });
}

export function timeOffNotice(item, action, actorId) {
  const recipients = targetIds(item.staffId).filter(id => id !== Number(actorId));
  const title = {
    pending: 'Nová žádost o volno',
    approved: 'Volno bylo schváleno',
    rejected: 'Žádost o volno zamítnuta',
    cancelled: 'Volno bylo zrušeno',
  }[action];
  if (!title) return;
  publish({ recipients,eventKey:`time-off:${item.id}:${action}`, type:'time-off',title,
    body:`${item.staffName}: ${item.start.slice(0,10)} – ${item.end.slice(0,10)}` });
}

export function listNotifications(userId, { limit = 50 } = {}) {
  const size = Math.max(1, Math.min(Number(limit) || 50, 100));
  const id = Number(userId);
  return {
    unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL').get(id).n,
    items: db.prepare(`SELECT id,type,title,body,booking_id AS bookingId,created_at AS createdAt,read_at AS readAt
      FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).all(id,size),
  };
}

export function readNotification(userId, notificationId) {
  const info = db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL')
    .run(nowIso(), Number(notificationId), Number(userId));
  return info.changes > 0;
}

export function readAllNotifications(userId) {
  return db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL')
    .run(nowIso(), Number(userId)).changes;
}
