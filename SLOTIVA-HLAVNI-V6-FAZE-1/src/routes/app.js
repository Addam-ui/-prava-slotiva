import express from 'express';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { db } from '../db.js';
import { durabilityStatus } from '../durable.js';
import { badRequest, AppError } from '../errors.js';
import { requireUser, startSession, endSession } from '../auth.js';
import { getSettings, updateSettings, patchSettings, GOOGLE_COLORS, SLOT_STEPS } from '../settings.js';
import { listServices, createService, updateService, deleteService, reorderServices } from '../services.js';
import * as users from '../users.js';
import * as team from '../team.js';
import { calendarRoster } from '../calendar-roster.js';
import * as bookings from '../bookings.js';
import * as google from '../google.js';
import { mailEnabled, verifyMail, sendMail } from '../mailer.js';
import { getDashboardStats } from '../stats.js';

export const appRouter = express.Router();

appRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
appRouter.use(requireUser);
appRouter.use((req, res, next) => {
  // Volbu kalendáře přijímáme jen u uživatelů patřících ke stejnému týmu.
  req.viewUserId = team.calendarUser(req.user, req.get('x-slotiva-staff'));
  req.scopeIds = team.calendarScope(req.user, req.get('x-slotiva-staff'));
  next();
});

/** Oprávnění ověřujeme na serveru; skrytí tlačítek ve frontendu nestačí. */
appRouter.use((req, res, next) => {
  if (team.isOwner(req.user)) return next();
  const path = req.path;
  const readOnly = req.method === 'GET' && (
    ['/meta', '/overview', '/calendar', '/bookings', '/settings'].includes(path)
    || /^\/bookings\/\d+$/.test(path)
  );
  const ownProfile = req.method === 'PUT' && ['/profile', '/avatar'].includes(path);
  const ownPassword = req.method === 'POST' && path === '/password';
  const ownBookingStatus = req.method === 'PATCH' && /^\/bookings\/\d+$/.test(path)
    && req.body?.action === 'status' && ['confirmed', 'cancelled', 'no_show'].includes(req.body?.status);
  if (readOnly || ownProfile || ownPassword || ownBookingStatus) return next();
  next(new AppError(403, 'Tato akce je dostupná pouze majiteli firmy.'));
});

const uid = (req) => req.viewUserId;
const scope = (req) => req.scopeIds;
/** Akce s rezervací směrujeme výhradně na autorizovaného barbera. */
const bookingUser = (req, id) => {
  const allowed = scope(req);
  const row = db.prepare(`SELECT user_id FROM bookings WHERE id=? AND user_id IN (${allowed.map(() => '?').join(',')})`).get(Number(id), ...allowed);
  if (!row) throw new AppError(404, 'Rezervace nebyla nalezena.');
  return row.user_id;
};
const baseFor = (req) => config.baseUrl.startsWith('http://localhost') && !['localhost','127.0.0.1'].includes(req.hostname) ? `${req.protocol}://${req.get('host')}` : config.baseUrl;
const bookingUrl = (user, req) => `${baseFor(req)}/${user.slug}`;

function onboarding(userId) {
  const s = getSettings(userId);
  const total = db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ?').get(userId).n;
  const state = google.googleState(userId);
  return {
    dismissed: s.onboardingDismissed,
    steps: {
      calendar: state === 'connected',
      calendarAvailable: state !== 'unavailable',
      profile: s.settingsSaved,
      services: s.servicesEdited,
      share: s.linkShared || total > 0,
    },
  };
}

/* ── účet a přehled ── */

appRouter.get('/meta', (req, res) => {
  const s = getSettings(team.ownerId(req.user));
  const shared = team.isOwner(req.user) && scope(req).length > 1;
  res.json({
    user: users.publicUser(req.user),
    selectedUserId: shared ? null : uid(req),
    selectedName: shared ? 'Společný kalendář' : (users.getUserRow(uid(req))?.name || 'Kalendář'),
    team: { owner: team.isOwner(req.user), ownerId: team.ownerId(req.user), shared, members: team.isOwner(req.user) ? team.members(req.user.id).filter(m => m.team_active).map(m => ({id:m.id,name:m.name,avatar:m.avatar_data})) : [] },
    bookingUrl: bookingUrl(users.getUserRow(team.ownerId(req.user)), req),
    businessName: s.business.name,
    brandColor: s.brandColor,
    timezone: s.timezone,
    today: DateTime.now().setZone(s.timezone).toISODate(),
    baseUrl: baseFor(req),
    google: bookings.getGoogleStatus(uid(req)),
    mailEnabled: mailEnabled(),
    persistence: durabilityStatus(),
    colors: GOOGLE_COLORS,
    onboarding: onboarding(uid(req)),
  });
});

appRouter.get('/overview', (req, res) => {
  res.json({ stats: getDashboardStats(scope(req)), google: bookings.getGoogleStatus(uid(req)), onboarding: onboarding(uid(req)) });
});

appRouter.post('/onboarding', (req, res) => {
  const patch = {};
  if (req.body?.dismissed !== undefined) patch.onboardingDismissed = Boolean(req.body.dismissed);
  if (req.body?.linkShared) patch.linkShared = true;
  patchSettings(uid(req), patch);
  res.json({ onboarding: onboarding(uid(req)) });
});

appRouter.put('/profile', (req, res) => {
  const changes = req.body || {};
  const user = users.updateProfile(req.user.id, team.isOwner(req.user) ? changes : { ...changes, slug: req.user.slug });
  res.json({ user: users.publicUser(user), bookingUrl: bookingUrl(user, req) });
});

appRouter.put('/avatar', (req,res) => {
  const avatar = team.validateAvatar(req.body?.avatar || '');
  db.prepare('UPDATE users SET avatar_data=?,updated_at=? WHERE id=?').run(avatar,new Date().toISOString(),req.user.id);
  res.json({ user:users.publicUser(users.getUserRow(req.user.id)) });
});

appRouter.post('/password', async (req, res) => {
  const user = await users.changePassword(req.user.id, req.body || {});
  startSession(res, user); // verze relace se změnila → vydat novou cookie
  res.json({ ok: true });
});

appRouter.delete('/account', async (req, res) => {
  const user = users.getUserRow(req.user.id);
  if (user.password_hash) await users.deleteAccount(user.id, req.body?.password); // ověří heslo před čímkoliv dalším
  await google.disconnect(user.id);
  if (!user.password_hash) await users.deleteAccount(user.id);
  endSession(res);
  console.log(`✖  Smazaný účet: ${user.email}`);
  res.json({ ok: true });
});

/* ── tým a vlastní přihlašovací účty ── */
appRouter.get('/team', (req, res) => {
  if (!team.isOwner(req.user)) throw badRequest('Správa týmu je dostupná pouze majiteli.');
  res.json({ owner: users.publicUser(req.user), members: team.members(req.user.id).map((u) => ({ id:u.id, name:u.name, email:u.email, avatar:u.avatar_data, active:Boolean(u.team_active) })) });
});
appRouter.post('/team', async (req, res) => {
  const user = await team.addMember(req.user, req.body || {});
  res.status(201).json({ member: { id:user.id, name:user.name, email:user.email, avatar:user.avatar_data, active:true } });
});
appRouter.put('/team/:id', async (req, res) => {
  const user = await team.updateMember(req.user, req.params.id, req.body || {});
  res.json({ member: { id:user.id, name:user.name, email:user.email, avatar:user.avatar_data, active:Boolean(user.team_active) } });
});

/* ── rezervace ── */

appRouter.get('/bookings', (req, res) => {
  res.json(bookings.listBookings(scope(req), req.query));
});

const STATUS_LABELS = { pending: 'Čeká na potvrzení', confirmed: 'Potvrzeno', cancelled: 'Zrušeno', no_show: 'Nedostavil(a) se' };
const SOURCE_LABELS = { web: 'Web', admin: 'Dashboard', demo: 'Ukázka' };

appRouter.get('/bookings.csv', (req, res) => {
  const { items } = bookings.listBookings(scope(req), { ...req.query, limit: 5000, offset: 0 });
  const cell = (value) => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // ochrana proti CSV injection v Excelu
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Kód', 'Datum', 'Od', 'Do', 'Služba', 'Cena (Kč)', 'Klient', 'E-mail', 'Telefon', 'Poznámka', 'Stav', 'Zdroj', 'Vytvořeno'];
  const lines = items.map((b) => [
    b.code, b.date, b.time, b.endTime, b.serviceName, b.price, b.customer.name, b.customer.email, b.customer.phone,
    b.note, STATUS_LABELS[b.status] || b.status, SOURCE_LABELS[b.source] || b.source, b.createdAt,
  ].map(cell).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rezervace-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(String.fromCharCode(0xfeff) + [header.join(';'), ...lines].join('\r\n'));
});

appRouter.get('/bookings/:id', (req, res) => {
  res.json({ booking: bookings.adminBookingView(bookings.getBookingRow(bookingUser(req, req.params.id), req.params.id)) });
});

appRouter.post('/bookings', async (req, res) => {
  if (team.isOwner(req.user) && scope(req).length > 1) throw badRequest('Nejdřív vyberte konkrétního barbera v horním přepínači kalendářů.');
  const row = await bookings.createBooking(uid(req), req.body || {}, { source: 'admin' });
  res.status(201).json({ booking: bookings.adminBookingView(row) });
});

appRouter.patch('/bookings/:id', async (req, res) => {
  const id = Number(req.params.id);
  const bookingOwnerId = bookingUser(req, id);
  const body = req.body || {};
  const actions = {
    reschedule: () => bookings.rescheduleBooking(bookingOwnerId, id, body),
    status: () => bookings.setBookingStatus(bookingOwnerId, id, body.status, { notifyCustomer: Boolean(body.notifyCustomer) }),
    details: () => bookings.updateBookingDetails(bookingOwnerId, id, body),
    resync: () => bookings.pushToGoogle(bookingOwnerId, id),
  };
  if (!actions[body.action]) throw badRequest('Neznámá akce.');
  res.json({ booking: bookings.adminBookingView(await actions[body.action]()) });
});

appRouter.get('/availability', async (req, res) => {
  res.json(await bookings.getAvailability(uid(req), {
    serviceId: req.query.serviceId,
    from: String(req.query.from || ''),
    to: String(req.query.to || ''),
    applyRules: false,
    excludeBookingId: req.query.excludeBookingId ? Number(req.query.excludeBookingId) : null,
  }));
});

appRouter.get('/calendar', async (req, res) => {
  const ids = scope(req);
  const periods = await Promise.all(ids.map(id => bookings.getCalendarRange(id, String(req.query.from || ''), String(req.query.to || ''))));
  const people = Object.fromEntries(ids.map(id => [id, users.getUserRow(id)?.name || 'Zaměstnanec']));
  const activeTeam = team.isOwner(req.user) && team.members(req.user.id).some(member => member.team_active);
  // Staré rezervace vytvořené ještě na majitele neztrácíme. Sloupec majitele
  // ale v týmovém režimu zobrazíme jen tehdy, pokud v rozsahu něco obsahuje.
  const staff = calendarRoster({
    ids, periods, ownerId: team.ownerId(req.user), isOwner: team.isOwner(req.user), hasTeam: activeTeam,
    getPerson: users.getUserRow, getWorkingHours: id => getSettings(id).workingHours,
  });
  res.json({
    timezone: periods[0]?.timezone || getSettings(uid(req)).timezone,
    staff,
    bookings: periods.flatMap(period => period.bookings),
    events: periods.flatMap((period, i) => period.events.map(e => ({ ...e, staffId: ids[i], staffName: people[ids[i]] }))),
    googleError: periods.map((period, i) => period.googleError ? `${people[ids[i]]}: ${period.googleError}` : '').filter(Boolean).join('; ') || null,
  });
});

/* ── služby ── */

appRouter.get('/services', (req, res) => {
  const upcoming = Object.fromEntries(
    db.prepare("SELECT service_id AS id, COUNT(*) AS n FROM bookings WHERE user_id = ? AND status = 'confirmed' AND end_utc >= ? GROUP BY service_id")
      .all(uid(req), new Date().toISOString())
      .map((r) => [r.id, r.n]),
  );
  res.json({ services: listServices(uid(req)).map((s) => ({ ...s, upcomingCount: upcoming[s.id] || 0 })), colors: GOOGLE_COLORS });
});

appRouter.post('/services', (req, res) => {
  const service = createService(uid(req), req.body || {});
  patchSettings(uid(req), { servicesEdited: true });
  res.status(201).json({ service });
});

appRouter.post('/services/reorder', (req, res) => {
  reorderServices(uid(req), req.body?.ids);
  res.json({ ok: true });
});

appRouter.put('/services/:id', (req, res) => {
  const service = updateService(uid(req), req.params.id, req.body || {});
  patchSettings(uid(req), { servicesEdited: true });
  bookings.invalidateBusyCache(uid(req));
  res.json({ service });
});

appRouter.delete('/services/:id', (req, res) => {
  deleteService(uid(req), req.params.id);
  patchSettings(uid(req), { servicesEdited: true });
  res.json({ ok: true });
});

/* ── nastavení ── */

// Branding a firemni udaje patri provozovne (majiteli), ne zrovna vybranemu
// kalendari barbera. Individulani pracovni doba zustava u daneho zamestnance.
const businessSettings = (req) => {
  const selected = getSettings(uid(req));
  const brand = getSettings(team.ownerId(req.user));
  return {
    ...selected,
    business: brand.business,
    appearance: brand.appearance,
    brandColor: brand.brandColor,
  };
};

appRouter.get('/settings', (req, res) => {
  if (!team.isOwner(req.user)) return res.json({ settings: { workingHours: getSettings(req.user.id).workingHours } });
  res.json({ settings: businessSettings(req), slotSteps: SLOT_STEPS, user: users.publicUser(req.user), baseUrl: baseFor(req), persistence: durabilityStatus() });
});

appRouter.put('/settings', (req, res) => {
  const selectedId = uid(req);
  // Nejdříve se ověří a uloží nastavení vybraného kalendáře.
  const selected = updateSettings(selectedId, req.body || {});
  if (team.isOwner(req.user) && selectedId !== req.user.id) {
    // Při přepnutí na barbera se změny loga, pozadí a firmy stále zapisují
    // majiteli, odkud je čte veřejná rezervační stránka.
    patchSettings(req.user.id, {
      business: selected.business,
      appearance: selected.appearance,
      brandColor: selected.brandColor,
    });
  }
  bookings.invalidateBusyCache(selectedId);
  res.json({ settings: businessSettings(req) });
});

/* ── Google Kalendář ── */

appRouter.get('/google', async (req, res) => {
  const status = bookings.getGoogleStatus(uid(req));
  let calendars = [];
  let calendarsError = null;
  if (status.state === 'connected') {
    try {
      calendars = await google.listCalendars(uid(req));
    } catch (err) {
      calendarsError = google.describeGoogleError(err);
    }
  }
  res.json({ ...bookings.getGoogleStatus(uid(req)), redirectUri: config.google.redirectUri, calendars, calendarsError });
});

appRouter.put('/google/calendars', async (req, res) => {
  const calendars = await google.listCalendars(uid(req));
  const target = calendars.find((c) => c.id === req.body?.calendarId);
  if (!target) throw badRequest('Vybraný kalendář nebyl nalezen.', { field: 'calendarId' });
  if (!target.canWrite) throw badRequest('Do tohoto kalendáře nemáte oprávnění zapisovat. Vyberte jiný.', { field: 'calendarId' });
  const known = new Set(calendars.map((c) => c.id));
  const busyCalendarIds = (Array.isArray(req.body?.busyCalendarIds) ? req.body.busyCalendarIds : []).filter((id) => known.has(id));
  await bookings.changeCalendar(uid(req), { calendarId: target.id, calendarName: target.name, busyCalendarIds });
  res.json(bookings.getGoogleStatus(uid(req)));
});

appRouter.post('/google/check', async (req, res) => {
  res.json(await google.checkConnection(uid(req)));
});

appRouter.post('/google/test-write', async (req, res) => {
  if (!google.isGoogleActive(uid(req))) throw badRequest('Google Kalendář není připojený.');
  try {
    await google.testWrite(uid(req));
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: google.describeGoogleError(err) });
  }
});

appRouter.post('/google/sync', async (req, res) => {
  res.json(await bookings.syncWithGoogle(uid(req)));
});

appRouter.delete('/google', async (req, res) => {
  await google.disconnect(uid(req));
  db.prepare('UPDATE bookings SET google_pending = NULL, google_error = NULL WHERE user_id = ?').run(uid(req));
  bookings.invalidateBusyCache(uid(req));
  res.json(bookings.getGoogleStatus(uid(req)));
});

/* ── napojení na web a e-maily ── */

appRouter.get('/integration', (req, res) => {
  res.json({
    baseUrl: baseFor(req),
    slug: users.getUserRow(team.ownerId(req.user)).slug,
    bookingUrl: bookingUrl(users.getUserRow(team.ownerId(req.user)), req),
    embedOrigins: config.embedOrigins,
    mail: { enabled: mailEnabled(), notifyEmail: getSettings(uid(req)).notifyEmail || req.user.email },
    services: listServices(uid(req), { activeOnly: true }).map(({ id, name }) => ({ id, name })),
  });
});

appRouter.post('/mail/test', async (req, res) => {
  const status = await verifyMail();
  if (!status.enabled) throw badRequest('E-maily nejsou na serveru nastavené.');
  if (!status.ok) return res.json({ ok: false, error: status.error });
  const to = getSettings(uid(req)).notifyEmail || req.user.email;
  const ok = await sendMail({ to, subject: 'Test e-mailu – Slotiva', text: 'Pokud čtete tuto zprávu, e-maily ze Slotivy fungují.' });
  res.json({ ok, to, error: ok ? null : 'Odeslání selhalo – podrobnosti najdete ve výpisu serveru.' });
});
