import path from 'node:path';
import express from 'express';
import { config, ROOT } from './src/config.js';
import { db, durability } from './src/db.js';
import { authApi, oauthRoutes } from './src/routes/auth.js';
import { publicRouter } from './src/routes/public.js';
import { appRouter } from './src/routes/app.js';
import { adminRouter } from './src/routes/admin.js';
import { securityHeaders, sameOriginJson, errorHandler } from './src/http.js';
import { startBackgroundSync } from './src/bookings.js';
import { readSession } from './src/auth.js';
import { getUserBySlug, RESERVED_SLUGS, syncAllAdmins } from './src/users.js';
import { mailEnabled } from './src/mailer.js';
import { bootstrapPulz } from './src/bootstrap.js';

const app = express();
const PUBLIC_DIR = path.join(ROOT, 'public');
const FONTS_DIR = path.join(ROOT, 'node_modules', '@fontsource-variable', 'plus-jakarta-sans', 'files');

app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);

app.get('/healthz', (req, res) => res.json({ ok: true, app: config.appName, time: new Date().toISOString() }));

app.use(securityHeaders);
app.use(express.json({ limit: '950kb' }));

/* ── API ── */
app.use('/api', sameOriginJson);
// Po úspěšné změně uložte SQLite do šifrovaného externího snapshotu (je-li nastaven).
app.use((req, res, next) => {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method) || (req.method === 'GET' && req.path === '/auth/google/callback')) {
    res.once('finish', () => { if (res.statusCode < 400) durability.schedule(); });
  }
  next();
});
app.use('/api/auth', authApi);
app.use('/api/public', publicRouter);
app.use('/api/app', appRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Neznámý endpoint.' }));
app.use('/auth', oauthRoutes);

/* ── statické soubory ── */
app.use('/fonts', express.static(FONTS_DIR, { maxAge: '365d', immutable: true }));
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: 0, setHeaders(res, file) { if (/\.(?:js|html)$/.test(file)) res.setHeader('Cache-Control', 'no-cache, must-revalidate'); } }));

/* ── stránky ── */
const send = (file) => (req, res) => res.sendFile(path.join(PUBLIC_DIR, file));

app.get('/', send('index.html'));

app.get(['/prihlaseni', '/registrace'], (req, res, next) => {
  if (readSession(req)) return res.redirect('/app/');
  next();
}, send('auth.html'));
app.get(['/zapomenute-heslo', '/nove-heslo'], send('auth.html'));

app.get(['/app', '/app/'], (req, res) => {
  if (!readSession(req)) return res.redirect('/prihlaseni');
  res.sendFile(path.join(PUBLIC_DIR, 'app', 'index.html'));
});
app.get(['/admin', '/admin/'], (req, res) => res.redirect(301, '/app/'));

app.get('/rezervace/:token', send('manage.html'));
app.get('/podminky', send('podminky.html'));
app.get(['/ochrana-osobnich-udaju', '/ochrana-udaju'], send('soukromi.html'));
// Ukázkový web potřebuje vědět, kterou rezervační stránku předvést (DEMO_SLUG nebo vlastní účet).
app.get('/ukazka-webu', (req, res, next) => {
  if (!config.demoSlug && !req.query.u && !readSession(req)) return res.redirect('/registrace');
  next();
}, send('ukazka-webu.html'));

// Rezervační stránka uživatele: /jana-novakova
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug.toLowerCase();
  if (RESERVED_SLUGS.has(slug) || !getUserBySlug(slug)) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'booking.html'));
});

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
app.use(errorHandler);

await bootstrapPulz();
if (durability.changed()) await durability.flush();
const promoted = syncAllAdmins();

const server = app.listen(config.port, () => {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const adminCount = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
  console.log('');
  console.log('  ✦ Slotiva běží');
  console.log(`    Web:              ${config.baseUrl}/`);
  console.log(`    Dashboard:        ${config.baseUrl}/app/`);
  console.log(`    Uživatelé:        ${userCount}`);
  console.log(`    Google OAuth:     ${config.google.enabled ? `zapnuto (redirect URI: ${config.google.redirectUri})` : 'vypnuto – chybí GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET'}`);
  console.log(`    E-maily:          ${mailEnabled() ? `zapnuto (${config.smtp.from})` : 'vypnuto (nevyplněné SMTP)'}`);
  console.log(`    Registrace:       ${config.allowRegistration ? 'otevřená' : 'vypnutá'}`);
  console.log(`    Správci:          ${config.adminEmails.length ? `${config.adminEmails.join(', ')} (${adminCount} s účtem)` : 'nenastavení – doplňte ADMIN_EMAILS do .env'}`);
  if (promoted.length) console.log(`    → práva správce se změnila u: ${promoted.join(', ')}`);
  for (const warning of config.warnings) console.log(`  ⚠ ${warning}`);
  console.log('');
  startBackgroundSync();
});

/* Hosting posílá SIGTERM při novém nasazení – dokončíme rozdělané požadavky. */
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(`… ${signal}: ukládám změny a ukončuji server`);
    const deadline = setTimeout(() => process.exit(1), 25_000); deadline.unref();
    server.close(async () => {
      try { if (durability.changed()) await durability.flush(); process.exit(0); }
      catch (err) { console.error('Poslední záloha selhala:', err.message); process.exit(1); }
    });
  });
}
