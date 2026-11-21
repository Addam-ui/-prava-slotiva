import { db, nowIso } from './db.js';
import { createUser, getUserByEmail, getUserRow, uniqueSlug } from './users.js';
import { getSettings, patchSettings } from './settings.js';
import { hashPassword } from './crypto.js';
import { badRequest, conflict, notFound } from './errors.js';
import * as v from './validate.js';

const avatarRE = /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/;
export function validateAvatar(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 210_000 || !avatarRE.test(value)) throw badRequest('Fotografie musí být JPG, PNG nebo WebP do 150 kB.');
  return value;
}
export const ownerId = (user) => Number(user.team_owner_id || user.id);
export const isOwner = (user) => !user.team_owner_id;

export function members(owner) {
  return db.prepare('SELECT id, name, email, avatar_data, team_active, created_at FROM users WHERE team_owner_id = ? ORDER BY name, id').all(owner);
}
export function publicMembers(owner) {
  return members(owner).filter((u) => u.team_active).map(({ id, name, avatar_data }) => ({ id, name, avatar: avatar_data || '' }));
}
export function teamMember(owner, id, { activeOnly = true } = {}) {
  const user = db.prepare('SELECT * FROM users WHERE team_owner_id = ? AND id = ?').get(Number(owner), Number(id));
  if (!user || (activeOnly && !user.team_active)) throw notFound('Barber není dostupný.');
  return user;
}
export function bookingStaff(owner, staffId) {
  const staff = publicMembers(owner);
  if (!staff.length) return owner;
  if (!staffId) throw badRequest('Vyberte prosím barbera.', { field: 'staffId' });
  return teamMember(owner, staffId).id;
}
export function calendarUser(user, selected) {
  if (user.team_owner_id) {
    if (!user.team_active) throw badRequest('Váš zaměstnanecký účet je deaktivovaný.');
    return user.id;
  }
  if (!selected || Number(selected) === user.id) return user.id;
  // Po deaktivaci vybraného barbera se majitel vrátí bezpečně na vlastní kalendář.
  const chosen = db.prepare('SELECT id FROM users WHERE id=? AND team_owner_id=? AND team_active=1').get(Number(selected),user.id);
  return chosen?.id || user.id;
}
/** Kalendáře zpřístupněné v aktuálním pohledu; bez výběru má majitel společný pohled. */
export function calendarScope(user, selected) {
  if (user.team_owner_id) {
    if (!user.team_active) throw badRequest('Váš zaměstnanecký účet je deaktivovaný.');
    return [Number(user.id)];
  }
  if (selected && selected !== 'all' && Number(selected) !== Number(user.id)) {
    const chosen = db.prepare('SELECT id FROM users WHERE id=? AND team_owner_id=? AND team_active=1').get(Number(selected), Number(user.id));
    if (chosen) return [chosen.id];
  }
  return [Number(user.id), ...members(user.id).filter(m => m.team_active).map(m => Number(m.id))];
}

export async function addMember(owner, input) {
  if (!isOwner(owner)) throw badRequest('Tým může spravovat pouze majitel.');
  const name = v.text(input?.name, { field: 'name', label: 'Jméno', required: true, max: 80 });
  const email = v.email(input?.email, { field: 'email', required: true });
  const password = String(input?.password || '');
  if (password.length < 8 || password.length > 200) throw badRequest('Heslo musí mít 8–200 znaků.', { field: 'password' });
  if (getUserByEmail(email)) throw conflict('Tento e-mail už používá jiný účet.', { field: 'email' });
  const avatar = validateAvatar(input.avatar || '');
  const user = createUser({ name, email, slug: uniqueSlug(name), passwordHash: await hashPassword(password), services: [] });
  db.prepare('UPDATE users SET team_owner_id = ?, avatar_data = ? WHERE id = ?').run(owner.id, avatar, user.id);
  // Každý barber má oddělený kalendář a vlastní sadu služeb; výchozí služby kopírujeme od majitele.
  db.prepare(`INSERT INTO services (user_id, name, description, duration_min, price, color_id, active, sort_order)
      SELECT ?, name, description, duration_min, price, color_id, active, sort_order FROM services WHERE user_id = ?`)
    .run(user.id, owner.id);
  const settings = getSettings(owner.id);
  patchSettings(user.id, { ...settings, onboardingDismissed: true });
  return getUserRow(user.id);
}
export async function updateMember(owner, id, input) {
  if (!isOwner(owner)) throw badRequest('Tým může spravovat pouze majitel.');
  const user = teamMember(owner.id, id, { activeOnly: false });
  const name = v.text(input.name ?? user.name, { field: 'name', label: 'Jméno', required: true, max: 80 });
  const email = v.email(input.email ?? user.email, { field: 'email', required: true });
  const other = getUserByEmail(email);
  if (other && other.id !== user.id) throw conflict('Tento e-mail už používá jiný účet.', { field: 'email' });
  const avatar = input.avatar === undefined ? user.avatar_data : validateAvatar(input.avatar);
  const active = input.active === undefined ? user.team_active : (input.active ? 1 : 0);
  db.prepare('UPDATE users SET name=?, email=?, avatar_data=?, team_active=?, session_version=session_version+1, updated_at=? WHERE id=?')
    .run(name, email, avatar, active, nowIso(), id);
  if (input.password) {
    if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 200) throw badRequest('Heslo musí mít 8–200 znaků.');
    db.prepare('UPDATE users SET password_hash=?, session_version=session_version+1, updated_at=? WHERE id=?')
      .run(await hashPassword(input.password), nowIso(), id);
  }
  return getUserRow(id);
}
