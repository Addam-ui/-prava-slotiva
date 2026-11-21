import { get, authPost } from './api.js';
import { $, h, icon, toast, setTimezone, copyText, openModal, GOOGLE_CONNECT_URL } from './ui.js';
import { registerServiceWorker } from './pwa.js';
import * as overview from './views/overview.js';
import * as bookings from './views/bookings.js';
import * as calendar from './views/calendar.js';
import * as timeOff from './views/time-off.js';
import * as notificationView from './views/notifications.js';
import * as services from './views/services.js';
import * as settings from './views/settings.js';
import * as integration from './views/integration.js';
import * as admin from './views/admin.js';
import * as team from './views/team.js';
import * as staffProfile from './views/staff-profile.js';

const ROUTES = [
  { path: 'prehled', title: 'Přehled', icon: 'overview', view: overview, ownerOnly: true },
  { path: 'rezervace', title: 'Rezervace', icon: 'list', view: bookings },
  { path: 'kalendar', title: 'Kalendář', icon: 'calendar', view: calendar },
  { path: 'volno', title: 'Volno a dovolené', icon: 'calendar', view: timeOff },
  { path: 'oznameni', title: 'Oznámení', icon: 'bell', view: notificationView },
  { path: 'tym', title: 'Správa týmu', icon: 'user', view: team, ownerOnly: true },
  { path: 'muj-profil', title: 'Můj profil', icon: 'user', view: staffProfile, staffOnly: true },
  { path: 'sluzby', title: 'Služby', icon: 'layers', view: services, group: 'Nastavení', ownerOnly: true },
  { path: 'nastaveni', title: 'Nastavení firmy', icon: 'sliders', view: settings, ownerOnly: true },
  { path: 'napojeni', title: 'Integrace a web', icon: 'plug', view: integration, group: 'Nastavení', ownerOnly: true },
  { path: 'sprava', title: 'Správa platformy', icon: 'shield', view: admin, group: 'Správce', adminOnly: true },
];

/** Trasy dostupné přihlášenému uživateli – správcovská sekce jen pro správce. */
const routes = () => ROUTES.filter((r) => (!r.adminOnly || (app.meta?.team?.owner && app.meta?.user?.isAdmin)) && (!r.ownerOnly || app.meta?.team?.owner) && (!r.staffOnly || !app.meta?.team?.owner));

export const LOGO = '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><defs><linearGradient id="lg-app" x1="6" y1="4" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="#1ec8bf"/><stop offset="1" stop-color="#0a7c80"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#lg-app)"/><rect x="11" y="11.5" width="18" height="7" rx="3.5" fill="#fff" fill-opacity=".38"/><rect x="11" y="20.5" width="26" height="7" rx="3.5" fill="#fff"/><rect x="19" y="29.5" width="18" height="7" rx="3.5" fill="#fff" fill-opacity=".38"/></svg>';

const GOOGLE_RESULTS = {
  pripojeno: ['Google Kalendář je připojený. Rezervace se do něj budou zapisovat automaticky.', false],
  'bez-kalendare': ['Přihlášení proběhlo, ale nepovolili jste přístup ke kalendáři. Připojte ho prosím znovu a zaškrtněte oprávnění.', true],
  zamitnuto: ['Připojení Google Kalendáře bylo zrušeno.', true],
  'google-chyba': ['Připojení Google Kalendáře se nepovedlo. Zkuste to prosím znovu.', true],
  'neplatny-pozadavek': ['Platnost připojení vypršela. Zkuste to prosím znovu.', true],
  'ucet-pouzity': ['Tento účet Google už používá jiný uživatel Slotivy.', true],
  'bez-tokenu': ['Google nevrátil potřebná oprávnění. Zkuste to prosím znovu.', true],
};

/** Sdílený stav aplikace pro jednotlivé pohledy. */
export const app = {
  meta: null,
  counts: null,
  async refreshMeta() {
    try {
      const [meta, list] = await Promise.all([get('/meta'), get('/bookings?limit=1')]);
      app.meta = meta;
      app.counts = list.counts;
      setTimezone(meta.timezone);
      renderSidebar();
      renderTeamSwitcher();
      refreshNotificationBadge();
    } catch {
      /* obnoví se při další akci */
    }
  },
};

const root = $('#root');
let current = null;

const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';

/** Mobilní navigace je samostatná, ale používá stejné role a hash trasy jako sidebar. */
function mobileLinks() {
  const visible = routes();
  const primary = app.meta?.team?.owner
    ? ['prehled', 'kalendar', 'rezervace', 'oznameni']
    : ['kalendar', 'rezervace', 'volno', 'oznameni'];
  return primary.map(path => visible.find(route => route.path === path)).filter(Boolean);
}
function closeNavigation() {
  const shell = $('#app');
  if (!shell) return;
  shell.classList.remove('nav-open');
  shell.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false');
  shell.querySelector('.mobile-more')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-menu-open');
}
function toggleNavigation() {
  const shell = $('#app');
  if (!shell) return;
  const open = shell.classList.toggle('nav-open');
  shell.querySelector('.menu-btn')?.setAttribute('aria-expanded', String(open));
  shell.querySelector('.mobile-more')?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('mobile-menu-open', open);
  if (open) shell.querySelector('.sidebar .nav a.is-active, .sidebar .nav a')?.focus({ preventScroll: true });
}
function mobileNav() {
  const nav = h('nav', { class: 'mobile-bottom-nav', 'aria-label': 'Mobilní navigace' });
  for (const route of mobileLinks()) {
    nav.append(h('a', { class: 'mobile-bottom-link', href: `#/${route.path}`, 'data-mobile-path': route.path,
      'aria-label': route.title }, icon(route.icon, 21), h('span', {}, route.title),
      route.path === 'oznameni' ? h('span', { class: 'mobile-nav-count', hidden: true }) : null));
  }
  nav.append(h('button', { type: 'button', class: 'mobile-bottom-link mobile-more',
    'aria-label': 'Další nabídka', 'aria-controls': 'mobile-sidebar', 'aria-expanded': 'false',
    onClick: toggleNavigation }, icon('menu', 21), h('span', {}, 'Více')));
  return nav;
}
function syncMobileNavigation() {
  const path = location.hash.replace(/^#\/?/, '').split('/')[0];
  for (const link of document.querySelectorAll('[data-mobile-path]')) {
    const active = link.dataset.mobilePath === path;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('.mobile-more')?.classList.toggle('is-active',
    Boolean(path && !document.querySelector(`.mobile-bottom-link[data-mobile-path="${path}"]`)));
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#app')?.classList.contains('nav-open')) {
    closeNavigation();
    document.querySelector('.menu-btn')?.focus();
  }
});


/* ───────────── motiv ───────────── */

const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);

function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('rs-theme', next);
  } catch {
    /* nevadí */
  }
  renderSidebar();
}

async function logout() {
  await authPost('/logout').catch(() => {});
  location.href = '/prihlaseni';
}

/* ───────────── rozvržení ───────────── */

function userMenu() {
  const menu = h('div', { class: 'user-menu', role: 'menu', hidden: true },
    h('a', { href: app.meta.team.owner ? '#/nastaveni' : '#/muj-profil', role: 'menuitem' }, icon('user', 16), 'Profil a účet'),
    app.meta.team.owner ? h('a', { href: app.meta.bookingUrl, target: '_blank', rel: 'noopener', role: 'menuitem' }, icon('external', 16), 'Rezervační stránka firmy') : null,
    h('button', { type: 'button', role: 'menuitem', onClick: toggleTheme }, icon(isDark() ? 'sun' : 'moon', 16), isDark() ? 'Světlý režim' : 'Tmavý režim'),
    h('div', { class: 'user-menu-sep' }),
    h('button', { type: 'button', role: 'menuitem', class: 'danger', onClick: logout }, icon('logout', 16), 'Odhlásit se'));
  const trigger = h('button', {
    type: 'button',
    class: 'user-chip',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    onClick: (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      trigger.setAttribute('aria-expanded', String(!menu.hidden));
    },
  },
  app.meta.user.avatar ? h('img', { class:'avatar', src:app.meta.user.avatar, alt:'' }) : h('span', { class: 'avatar' }, initials(app.meta.user.name)),
  h('span', { class: 'user-chip-text' }, h('b', {}, app.meta.user.name || 'Účet'), h('span', {}, app.meta.user.email || '')),
  icon('chevronUp', 14));
  document.addEventListener('click', () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });
  return h('div', { class: 'user' }, menu, trigger);
}

function googlePill() {
  const g = app.meta.google;
  let dot = 'neutral';
  let title = 'Google Kalendář';
  let sub = '';
  if (g.state === 'unavailable') [dot, sub] = ['neutral', 'Na serveru není zapnutý'];
  else if (g.state === 'disconnected') [dot, title, sub] = ['warning', 'Kalendář nepřipojen', 'Připojit jedním kliknutím'];
  else if (g.state === 'revoked' || g.state === 'noscope') [dot, title, sub] = ['critical', 'Kalendář odpojen', 'Připojte ho znovu'];
  else if (g.error) [dot, title, sub] = ['critical', 'Chyba synchronizace', 'Zobrazit podrobnosti'];
  else [dot, sub] = ['good', g.calendarName || g.email || 'Připojeno'];
  return h('a', { class: 'gstatus', href: '#/napojeni' },
    h('span', { class: `dot ${dot}` }),
    h('div', { style: { minWidth: '0' } }, h('div', { class: 'gstatus-title' }, title), h('div', { class: 'gstatus-sub' }, sub)));
}

function renderShell() {
  let lastGroup = null;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Hlavní navigace' });
  for (const r of routes()) {
    if (r.group && r.group !== lastGroup) nav.append(h('div', { class: 'nav-label' }, r.group));
    lastGroup = r.group || lastGroup;
    nav.append(h('a', { href: `#/${r.path}`, 'data-path': r.path }, icon(r.icon, 18), h('span', {}, r.title), h('span', { class: 'count', hidden: true })));
  }

  root.replaceChildren(h('div', { class: 'app', id: 'app' },
    h('aside', { class: 'sidebar', id: 'mobile-sidebar' },
      h('a', { class: 'brand', href: '#/prehled', 'aria-label': 'Slotiva – přehled' },
        h('span', { class: 'brand-logo', html: LOGO }),
        h('span', { class: 'brand-word' }, 'Slotiva')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon sidebar-close', 'aria-label': 'Zavřít nabídku', onClick: closeNavigation }, icon('x', 20)),
      nav,
      h('div', { class: 'sidebar-foot', id: 'sidebar-foot' })),
    h('div', { class: 'content' },
      h('header', { class: 'topbar' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon menu-btn', 'aria-label': 'Otevřít nabídku', 'aria-controls': 'mobile-sidebar', 'aria-expanded': 'false', onClick: toggleNavigation }, icon('menu', 20)),
        h('div', { style: { minWidth: '0' } }, h('h1', { id: 'page-title' }), h('div', { class: 'subtitle', id: 'page-subtitle' })),
        h('div', { class: 'team-switch', id: 'team-switch' }),
        h('div', { class: 'topbar-actions', id: 'page-actions' })),
      h('main', { class: 'view', id: 'view' })),
    h('button', { type: 'button', class: 'mobile-nav-backdrop', 'aria-label': 'Zavřít nabídku', onClick: closeNavigation }),
    mobileNav()));

  $('#app').addEventListener('click', (e) => {
    if (e.target.closest('.nav a, .mobile-bottom-nav a')) closeNavigation();
  });
  syncMobileNavigation();
  renderSidebar();
  renderTeamSwitcher();
  refreshNotificationBadge();
}

/** Výběr je vidět na každé stránce a aktualizuje serverový scope. */
function renderTeamSwitcher() {
  const target = $('#team-switch');
  if (!target) return;
  if (!app.meta?.team?.owner || !app.meta.team.members?.length) { target.replaceChildren(); return; }
  const selected = app.meta.team.shared ? 'all' : String(app.meta.selectedUserId);
  const options = [h('option', { value:'all' }, 'Společný kalendář · celý tým'),
    ...app.meta.team.members.map(m => h('option', { value:String(m.id) }, m.name))];
  const input = h('select', { class:'select', 'aria-label':'Přepnout kalendář barbera', title:'Přepnout kalendář', onChange: () => {
    sessionStorage.setItem('slotiva-staff-id',input.value);
    location.href = '/app/#/kalendar';
    location.reload();
  }}, options);
  input.value = selected;
  target.replaceChildren(h('label', { class:'team-switch-label' }, icon('calendar', 16), 'Kalendář', input));
}

async function refreshNotificationBadge() {
  try {
    const { unread } = await get('/notifications');
    const badge = document.querySelector('.nav a[data-path="oznameni"] .count');
    if (badge) { badge.hidden = !unread; badge.textContent = unread > 99 ? '99+' : unread || ''; }
    const mobile = document.querySelector('.mobile-nav-count');
    if (mobile) { mobile.hidden = !unread; mobile.textContent = unread > 99 ? '99+' : unread || ''; }
  } catch { /* ztráta spojení nemá rozbít dashboard */ }
}
window.addEventListener('slotiva:notifications-changed', refreshNotificationBadge);

/** Čerstvé počty bez opětovného načtení aplikace; když je karta skrytá, nezahlcujeme server. */
async function refreshNavigationCounts() {
  if (document.visibilityState === 'hidden' || !app.meta) return;
  try {
    const result = await get('/bookings?limit=1');
    app.counts = result.counts;
    renderSidebar();
  } catch { /* offline: aktuální počítadla ponecháme */ }
  await refreshNotificationBadge();
}
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshNavigationCounts();
});

function renderSidebar() {
  const foot = $('#sidebar-foot');
  if (!app.meta || !foot) return;
  const url = app.meta.bookingUrl;
  const sidebarItems = [
    app.meta.team.owner ? h('div', { class: 'page-card' },
      h('div', { class: 'page-card-label' }, 'Vaše rezervační stránka'),
      h('a', { class: 'page-card-url', href: url, target: '_blank', rel: 'noopener', title: url }, url.replace(/^https?:\/\//, '')),
      h('div', { class: 'page-card-actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => copyText(url, 'Odkaz zkopírován') }, icon('copy', 14), 'Kopírovat'),
        h('a', { class: 'btn btn-sm btn-ghost btn-icon', href: url, target: '_blank', rel: 'noopener', 'aria-label': 'Otevřít stránku' }, icon('external', 15)))) : null,
    app.meta.team.owner && app.meta.team.members.length ? h('div', {class:'muted',style:{fontSize:'12px',padding:'0 8px 8px'}}, `Kalendář: ${app.meta.selectedName || 'Společný kalendář'}`) : null,
    userMenu(),
  ];
  foot.replaceChildren(...sidebarItems.filter(Boolean));

  // Počty v menu mají klidný, srozumitelný vzhled. Žádné zavádějící „1 !“.
  const counts = app.counts;
  const link = document.querySelector('.nav a[data-path="rezervace"]');
  const badge = link?.querySelector('.count');
  if (counts && badge) {
    const attentionCount = Number(counts.attention) || 0;
    const upcomingCount = Number(counts.upcoming) || 0;
    const needsAttention = attentionCount > 0;
    const displayed = needsAttention ? attentionCount : upcomingCount;
    badge.hidden = displayed <= 0;
    badge.textContent = displayed > 99 ? '99+' : String(displayed);
    badge.classList.toggle('is-attention', needsAttention);
    const description = needsAttention
      ? `${attentionCount} rezervací vyžaduje pozornost (potvrzení nebo synchronizace)`
      : `${upcomingCount} nadcházejících rezervací`;
    badge.title = displayed ? description : '';
    link.setAttribute('aria-label', displayed ? `Rezervace · ${description}` : 'Rezervace');
  }
}

/* ───────────── uvítání a výsledky přihlášení Google ───────────── */

function handleQuery() {
  const params = new URLSearchParams(location.search);
  if (!params.size) return;
  const google = GOOGLE_RESULTS[params.get('google')];
  if (google) toast(google[0], { error: google[1], timeout: 6000 });
  if (params.get('vitejte')) showWelcome();
  history.replaceState(null, '', `/app/${location.hash}`);
}

function showWelcome() {
  const { user, google, bookingUrl } = app.meta;
  const m = openModal({ title: '', size: 'modal-welcome' });
  const needsCalendar = google.state === 'disconnected';
  const connected = google.state === 'connected';
  m.body.append(
    h('div', { class: 'welcome-logo', html: LOGO }),
    h('h2', { class: 'welcome-title' }, `Vítejte ve Slotivě, ${user.name.split(' ')[0]}!`),
    h('p', { class: 'welcome-text' }, connected
      ? 'Kalendář je připojený a rezervační stránka připravená. Zbývají dvě maličkosti.'
      : 'Vaše rezervační stránka je připravená. Stačí pár kroků a můžete přijímat první rezervace.'),
    h('div', { class: 'welcome-url' }, icon('link', 16), h('span', {}, bookingUrl.replace(/^https?:\/\//, ''))),
    h('ol', { class: 'welcome-steps' },
      h('li', { class: connected ? 'done' : '' },
        h('b', {}, connected ? 'Google Kalendář je připojený' : 'Připojte Google Kalendář'),
        h('span', {}, connected ? 'Rezervace se do něj budou zapisovat samy.' : 'Rezervace se do něj samy zapíšou a obsazené časy se klientům nenabídnou.')),
      h('li', {}, h('b', {}, 'Nastavte otevírací dobu a služby'), h('span', {}, 'Kdy pracujete, co nabízíte a za kolik.')),
      h('li', {}, h('b', {}, 'Sdílejte odkaz nebo vložte na web'), h('span', {}, 'Klienti si začnou rezervovat sami.'))),
  );
  m.foot.append(
    h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => m.close() }, needsCalendar ? 'Připojím později' : 'Rozhlédnout se'),
    needsCalendar
      ? h('a', { class: 'btn btn-primary', href: GOOGLE_CONNECT_URL }, icon('calendarCheck'), 'Připojit Google Kalendář')
      : h('a', { class: 'btn btn-primary', href: '#/nastaveni', onClick: () => m.close() }, 'Nastavit otevírací dobu'),
  );
}

/* ───────────── směrování ───────────── */

function parseHash() {
  const [path = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { route: routes().find((r) => r.path === path), params };
}

async function route() {
  const { route: r, params } = parseHash();
  if (!r) {
    location.replace(app.meta?.team?.owner ? '#/prehled' : '#/kalendar');
    return;
  }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.path === r.path));
  closeNavigation();
  syncMobileNavigation();

  if (current?.route === r) {
    current.instance?.update?.({ params });
    return;
  }

  current?.instance?.cleanup?.();
  const view = $('#view');
  const actions = $('#page-actions');
  view.replaceChildren();
  view.classList.remove('is-loading');
  actions.replaceChildren();
  $('#page-title').textContent = r.title;
  $('#page-subtitle').textContent = '';
  document.title = `${r.title} – Slotiva`;
  window.scrollTo(0, 0);

  const entry = { route: r, instance: null };
  current = entry;
  try {
    const instance = await r.view.mount({
      view,
      actions,
      params,
      app,
      setTitle: (t) => { $('#page-title').textContent = t; },
      setSubtitle: (t) => { $('#page-subtitle').textContent = t; },
    });
    if (current === entry) entry.instance = instance;
    else instance?.cleanup?.();
    refreshNotificationBadge();
  } catch (err) {
    if (err.status === 401) return;
    console.error(err);
    view.replaceChildren(h('div', { class: 'alert alert-critical' }, icon('alert', 18),
      h('div', { class: 'alert-body' }, h('div', { class: 'alert-title' }, 'Stránku se nepodařilo načíst'), h('div', { class: 'alert-text' }, err.message))));
  }
}

window.addEventListener('auth:required', () => {
  location.href = '/prihlaseni';
});

(async () => {
  try {
    const [meta, list] = await Promise.all([get('/meta'), get('/bookings?limit=1')]);
    app.meta = meta;
    app.counts = list.counts;
    setTimezone(meta.timezone);
  } catch (err) {
    if (err.status === 401) return;
    // Na telefonu se stane, že vypadne signál – nabídneme rovnou další pokus.
    root.replaceChildren(h('div', { class: 'boot' },
      h('div', { class: 'stack', style: { gap: '14px', maxWidth: '380px' } },
        h('div', { class: 'alert alert-critical' }, icon('alert', 18),
          h('div', { class: 'alert-body' },
            h('div', { class: 'alert-title' }, 'Dashboard se nepodařilo načíst'),
            h('div', { class: 'alert-text' }, err.message))),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => location.reload() }, icon('refresh'), 'Zkusit znovu'))));
    return;
  }
  renderShell();
  window.addEventListener('hashchange', route);
  await route();
  handleQuery();
  registerServiceWorker();
  // Rozumný polling pro interní oznámení (bez placených push/SMS služeb).
  setInterval(refreshNavigationCounts, 60_000);
})();
