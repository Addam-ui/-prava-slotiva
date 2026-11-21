import { get } from '../api.js';
import { h, icon, fmt, addDays, localParts, readableInk, alertBox, switchControl } from '../ui.js';
import { openBookingDrawer } from './booking-drawer.js';
import { openNewBookingModal } from './new-booking.js';

const HOUR_PX = 52;
const pad = (n) => String(n).padStart(2, '0');
const toMinutes = (time) => {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
};
const weekdayOf = (date) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = pondělí
const mondayOf = (date) => addDays(date, 1 - weekdayOf(date));

function weekLabel(start, end) {
  const f = (opts, date) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T12:00:00Z`));
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}.–${f({ day: 'numeric', month: 'long', year: 'numeric' }, end)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${f({ day: 'numeric', month: 'long' }, start)} – ${f({ day: 'numeric', month: 'long', year: 'numeric' }, end)}`;
  return `${f({ day: 'numeric', month: 'long', year: 'numeric' }, start)} – ${f({ day: 'numeric', month: 'long', year: 'numeric' }, end)}`;
}

/** Rozdělí překrývající se položky do sloupců („drah“). */
function layoutLanes(items) {
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      item.lane = lane;
    }
    for (const item of cluster) item.lanes = laneEnds.length;
    cluster = [];
  };
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
}

export async function mount({ view, actions, app }) {
  const teamMode = Boolean(app.meta.team.owner && app.meta.team.members?.length);
  const rememberedMode = sessionStorage.getItem('slotiva-calendar-mode');
  const state = {
    week: mondayOf(app.meta.today), date: app.meta.today,
    mode: ['day', 'week'].includes(rememberedMode) ? rememberedMode : (teamMode ? 'day' : 'week'),
    focusStaff: 'all', showGoogle: true, settings: null, data: null,
  };

  if (app.meta.team.owner && !app.meta.team.shared) actions.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: () => openNewBookingModal({ app, onCreated: load }) }, icon('plus'), h('span', { class: 'btn-label' }, 'Nová rezervace')));

  const range = h('div', { class: 'week-range', 'aria-live': 'polite' });
  const focusBar = h('div', { class: 'team-day-filters', 'aria-label': 'Zaměstnanci' });
  const dayMode = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => changeMode('day') }, 'Den');
  const weekMode = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => changeMode('week') }, 'Týden');
  const viewModes = h('div', { class: 'calendar-mode-switch', role: 'group', 'aria-label': 'Zobrazení kalendáře' }, dayMode, weekMode);
  const notice = h('div');
  const card = h('div', { class: 'card week' });
  const legend = h('div', { class: 'legend', style: { marginTop: '12px' } });

  if (app.meta.team.shared) view.append(h('p',{class:'hint'},'Společný kalendář celého týmu. Rezervace a události jsou rozdělené podle zaměstnance. Pro novou rezervaci vyberte barbera v horní liště.'));
  if (!app.meta.team.owner) view.append(h('p',{class:'hint'},'Váš kalendář a rezervace. Nové žádosti můžete potvrdit otevřením rezervace.'));
  view.append(
    h('div', { class: 'week-toolbar' },
      h('div', { class: 'input-group' },
        h('button', { type: 'button', class: 'btn btn-secondary btn-icon', 'aria-label': 'Předchozí den nebo týden', onClick: () => shift(-1) }, icon('chevronLeft')),
        h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => { state.date = app.meta.today; state.week = mondayOf(app.meta.today); load(); } }, 'Dnes'),
        h('button', { type: 'button', class: 'btn btn-secondary btn-icon', 'aria-label': 'Další den nebo týden', onClick: () => shift(1) }, icon('chevronRight'))),
      range,
      h('div', { style: { flex: '1' } }),
      viewModes,
      app.meta.team.owner && app.meta.google.state === 'connected'
        ? switchControl({ checked: true, label: 'Události z Google Kalendáře', onChange: (value) => { state.showGoogle = value; render(); } })
        : null),
    notice,
    focusBar,
    card,
    legend,
  );

  ({ settings: state.settings } = await get('/settings'));

  function changeMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    sessionStorage.setItem('slotiva-calendar-mode', mode);
    if (mode === 'week') state.week = mondayOf(state.date);
    load();
  }

  function shift(direction) {
    if (state.mode === 'day') {
      state.date = addDays(state.date, direction);
      state.week = mondayOf(state.date);
    } else {
      state.date = addDays(state.date, direction * 7);
      state.week = mondayOf(state.date);
    }
    load();
  }

  async function load() {
    const from = state.mode === 'day' ? state.date : state.week;
    const end = state.mode === 'day' ? state.date : addDays(state.week, 6);
    range.textContent = state.mode === 'day' ? fmt.dateLong(state.date) : weekLabel(state.week, end);
    dayMode.classList.toggle('is-active', state.mode === 'day');
    weekMode.classList.toggle('is-active', state.mode === 'week');
    dayMode.setAttribute('aria-pressed', String(state.mode === 'day'));
    weekMode.setAttribute('aria-pressed', String(state.mode === 'week'));
    if (state.data) card.style.opacity = '0.55';
    try {
      state.data = await get(`/calendar?from=${from}&to=${end}`);
      render();
    } catch (err) {
      notice.replaceChildren(alertBox('critical', 'Kalendář se nepodařilo načíst', err.message));
    } finally {
      card.style.opacity = '';
    }
  }

  function render() {
    if (!state.data) return;
    const { bookings, events, googleError } = state.data;
    if (state.mode === 'day') {
      renderDay();
      return;
    }
    focusBar.replaceChildren();
    focusBar.hidden = true;
    card.className = 'card week';
    const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
    const today = app.meta.today;
    const workingHours = state.settings.workingHours;

    notice.replaceChildren(...(googleError ? [alertBox('warning', 'Události z Google Kalendáře se nepodařilo načíst', googleError)] : []));

    const timed = Object.fromEntries(days.map((d) => [d, []]));
    const allDay = Object.fromEntries(days.map((d) => [d, []]));

    for (const b of bookings) {
      if (b.status === 'cancelled' || !timed[b.date]) continue;
      const start = toMinutes(b.time);
      const end = b.endTime > b.time ? toMinutes(b.endTime) : 1440;
      timed[b.date].push({ kind: 'booking', start, end: Math.max(end, start + 15), booking: b });
    }

    if (state.showGoogle) {
      for (const e of events) {
        const s = localParts(e.start);
        const en = localParts(e.end);
        for (const d of days) {
          if (e.allDay) {
            if (d >= s.date && d < en.date) allDay[d].push(e);
            continue;
          }
          if (d < s.date || d > en.date) continue;
          const start = d === s.date ? s.minutes : 0;
          const end = d === en.date ? en.minutes : 1440;
          if (end > start) timed[d].push({ kind: 'event', start, end, event: e });
        }
      }
    }

    // Rozsah hodin: otevírací doba + vše, co v týdnu je.
    let minHour = 24;
    let maxHour = 0;
    for (const d of days) {
      for (const it of workingHours[weekdayOf(d)] || []) {
        minHour = Math.min(minHour, Math.floor(toMinutes(it.from) / 60));
        maxHour = Math.max(maxHour, Math.ceil(toMinutes(it.to) / 60));
      }
      for (const it of timed[d]) {
        minHour = Math.min(minHour, Math.floor(it.start / 60));
        maxHour = Math.max(maxHour, Math.ceil(it.end / 60));
      }
    }
    if (minHour >= maxHour) [minHour, maxHour] = [8, 18];
    const height = (maxHour - minHour) * HOUR_PX;
    const y = (minutes) => ((minutes - minHour * 60) / 60) * HOUR_PX;

    const head = h('div', { class: 'week-head' },
      h('div'),
      days.map((d) => h('div', { class: `week-day${d === today ? ' is-today' : ''}` },
        h('div', { class: 'dow' }, fmt.weekdayShort(d)),
        h('div', { class: 'dom' }, h('span', {}, String(Number(d.slice(8))))))));

    const allDayRow = days.some((d) => allDay[d].length)
      ? h('div', { class: 'week-allday' },
        h('div', { class: 'label' }, 'Celý den'),
        days.map((d) => h('div', {}, allDay[d].map((e) => h('div', { class: 'allday-event', title: e.title }, e.title)))))
      : null;

    const hoursColumn = h('div', { class: 'week-hours', style: { height: `${height}px` } },
      Array.from({ length: maxHour - minHour + 1 }, (_, i) => h('div', { class: 'week-hour-label', style: { top: `${i * HOUR_PX}px` } }, `${pad(minHour + i)}:00`)));

    const nowMinutes = localParts(new Date().toISOString()).minutes;

    const columns = days.map((d) => {
      const col = h('div', { class: `week-col${d === today ? ' is-today' : ''}`, style: { height: `${height}px` } });

      // Mimo otevírací dobu
      let cursor = minHour * 60;
      const open = (workingHours[weekdayOf(d)] || []).map((it) => [toMinutes(it.from), toMinutes(it.to)]);
      for (const [from, to] of open) {
        if (from > cursor) col.append(h('div', { class: 'closed', style: { top: `${y(cursor)}px`, height: `${y(from) - y(cursor)}px` } }));
        cursor = Math.max(cursor, to);
      }
      if (cursor < maxHour * 60) col.append(h('div', { class: 'closed', style: { top: `${y(cursor)}px`, height: `${y(maxHour * 60) - y(cursor)}px` } }));

      for (let m = minHour * 60 + 30; m < maxHour * 60; m += 30) {
        col.append(h('div', { class: `hour-line${m % 60 ? ' half' : ''}`, style: { top: `${y(m)}px` } }));
      }

      // Jen majitel ve vybraném kalendáři smí vytvářet ruční rezervace.
      if (app.meta.team.owner && !app.meta.team.shared) for (let m = minHour * 60; m < maxHour * 60; m += 30) {
        const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
        col.append(h('div', {
          class: 'week-click',
          style: { top: `${y(m)}px`, height: `${HOUR_PX / 2}px` },
          title: `Nová rezervace – ${fmt.dateMedium(d)} ${time}`,
          onClick: () => openNewBookingModal({ app, date: d, time, onCreated: load }),
        }));
      }

      const items = timed[d].sort((a, b) => a.start - b.start || b.end - a.end);
      layoutLanes(items);
      for (const it of items) {
        const top = y(it.start);
        const blockHeight = Math.max(20, y(it.end) - top - 2);
        const width = 100 / it.lanes;
        const style = {
          top: `${top + 1}px`,
          height: `${blockHeight}px`,
          left: `calc(${it.lane * width}% + 2px)`,
          width: `calc(${width}% - 4px)`,
        };
        if (it.kind === 'booking') {
          const b = it.booking;
          col.append(h('button', {
            type: 'button',
            class: `ev${b.status === 'no_show' ? ' is-noshow' : ''}`,
            style: { ...style, background: b.color, color: readableInk(b.color) },
            title: `${b.staffName ? b.staffName + ' · ' : ''}${b.time}–${b.endTime} · ${b.customer.name} · ${b.serviceName}`,
            onClick: () => openBookingDrawer(b.id, { app, onChange: load }),
          },
          h('b', {}, `${app.meta.team.shared ? b.staffName+' · ' : ''}${b.customer.name}`),
          blockHeight > 34 ? h('span', {}, `${b.time}–${b.endTime}`) : null,
          blockHeight > 52 ? h('span', {}, b.serviceName) : null));
        } else {
          const e = it.event;
          col.append(h('div', {
            class: `ev ev-busy${e.blocking ? '' : ' is-free'}`,
            style,
            title: `${e.title} · ${e.blocking ? 'blokuje rezervace' : 'označeno jako volno – neblokuje'}`,
          },
          h('b', {}, e.title),
          blockHeight > 34 ? h('span', {}, `${localParts(e.start).time}–${localParts(e.end).time}`) : null));
        }
      }

      if (d === today && nowMinutes >= minHour * 60 && nowMinutes <= maxHour * 60) {
        col.append(h('div', { class: 'now-line', style: { top: `${y(nowMinutes)}px` }, 'aria-hidden': 'true' }));
      }
      return col;
    });

    card.replaceChildren(h('div', { class: 'week-inner' }, head, allDayRow, h('div', { class: 'week-body' }, hoursColumn, columns)));

    const servicesInWeek = new Map();
    for (const b of bookings) if (b.status !== 'cancelled') servicesInWeek.set(b.serviceName, b.color);
    legend.replaceChildren(...[
      ...[...servicesInWeek].map(([name, color]) => h('span', {}, h('span', { class: 'swatch', style: { background: color } }), name)),
      state.showGoogle && app.meta.google.configured
        ? h('span', {}, h('span', { class: 'swatch', style: { background: 'var(--busy-fill)', boxShadow: 'inset 0 0 0 1px var(--axis)' } }), 'Obsazeno v Google Kalendáři')
        : null,
      h('span', {}, h('span', { class: 'swatch', style: { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)' } }), 'Mimo otevírací dobu'),
      app.meta.team.owner && !app.meta.team.shared ? h('span', { class: 'muted' }, 'Kliknutím do volného místa vytvoříte rezervaci') : null,
    ].filter(Boolean));
  }


  /** Denní pohled: jeden sloupec na člověka, jeho vlastní pracovní doba a rezervace. */
  function renderDay() {
    const { staff = [], bookings = [], events = [], googleError } = state.data;
    const day = state.date;
    const people = staff.length ? staff : [{ id: app.meta.user.id, name: app.meta.user.name, workingHours: state.settings.workingHours }];
    if (state.focusStaff !== 'all' && !people.some(person => String(person.id) === state.focusStaff)) state.focusStaff = 'all';
    const isShared = Boolean(app.meta.team.shared && people.length > 1);
    focusBar.hidden = !isShared;
    focusBar.replaceChildren(...(isShared ? [
      { id: 'all', name: 'Všichni' },
      ...people.map(person => ({ id: String(person.id), name: person.name })),
    ].map(item => h('button', {
      type: 'button', class: `btn btn-sm ${state.focusStaff === item.id ? 'btn-primary' : 'btn-secondary'}`,
      'aria-pressed': String(state.focusStaff === item.id),
      onClick: () => { state.focusStaff = item.id; renderDay(); },
    }, item.name)) : []));

    const displayed = isShared && state.focusStaff !== 'all'
      ? people.filter(person => String(person.id) === state.focusStaff)
      : people;
    const dayBookings = bookings.filter(b => b.date === day && b.status !== 'cancelled');
    const dayEvents = state.showGoogle ? events.filter(e => {
      const start = localParts(e.start);
      const end = localParts(e.end);
      return e.allDay ? day >= start.date && day < end.date : day >= start.date && day <= end.date;
    }) : [];

    notice.replaceChildren(...(googleError ? [alertBox('warning', 'Kalendář Google není úplný', googleError)] : []));
    let minHour = 24;
    let maxHour = 0;
    for (const person of displayed) {
      for (const slot of person.workingHours?.[weekdayOf(day)] || []) {
        minHour = Math.min(minHour, Math.floor(toMinutes(slot.from) / 60));
        maxHour = Math.max(maxHour, Math.ceil(toMinutes(slot.to) / 60));
      }
      for (const booking of dayBookings.filter(b => Number(b.staffId) === Number(person.id))) {
        minHour = Math.min(minHour, Math.floor(toMinutes(booking.time) / 60));
        maxHour = Math.max(maxHour, Math.ceil(toMinutes(booking.endTime > booking.time ? booking.endTime : '23:59') / 60));
      }
      for (const event of dayEvents.filter(e => Number(e.staffId) === Number(person.id) && !e.allDay)) {
        const start = localParts(event.start), end = localParts(event.end);
        minHour = Math.min(minHour, start.date === day ? Math.floor(start.minutes / 60) : 0);
        maxHour = Math.max(maxHour, end.date === day ? Math.ceil(end.minutes / 60) : 24);
      }
    }
    if (minHour >= maxHour) [minHour, maxHour] = [8, 18];
    minHour = Math.max(0, minHour);
    maxHour = Math.min(24, maxHour);
    const height = (maxHour - minHour) * HOUR_PX;
    const y = minutes => (minutes - minHour * 60) * HOUR_PX / 60;

    const hours = h('div', { class: 'team-day-hours', style: { height: `${height}px` } },
      Array.from({ length: maxHour - minHour + 1 }, (_, i) =>
        h('div', { class: 'week-hour-label', style: { top: `${i * HOUR_PX}px` } }, `${pad(minHour + i)}:00`)));
    const columns = displayed.map(person => {
      const col = h('div', { class: 'team-day-col', style: { height: `${height}px` } });
      const open = (person.workingHours?.[weekdayOf(day)] || []).map(slot => [toMinutes(slot.from), toMinutes(slot.to)]);
      let cursor = minHour * 60;
      for (const [from, to] of open) {
        if (from > cursor) col.append(h('div', { class: 'closed', style: { top: `${y(cursor)}px`, height: `${y(from)-y(cursor)}px` } }));
        cursor = Math.max(cursor, to);
      }
      if (cursor < maxHour * 60) col.append(h('div', { class: 'closed', style: { top: `${y(cursor)}px`, height: `${y(maxHour*60)-y(cursor)}px` } }));
      for (let m = minHour * 60 + 30; m < maxHour * 60; m += 30) {
        col.append(h('div', { class: `hour-line${m % 60 ? ' half' : ''}`, style: { top: `${y(m)}px` } }));
      }
      const items = [
        ...dayBookings.filter(b => Number(b.staffId) === Number(person.id)).map(b => ({
          kind: 'booking', booking: b, start: toMinutes(b.time),
          end: b.endTime > b.time ? toMinutes(b.endTime) : 1440,
        })),
        ...dayEvents.filter(e => Number(e.staffId) === Number(person.id) && !e.allDay).map(e => {
          const start = localParts(e.start), end = localParts(e.end);
          return { kind: 'event', event: e, start: start.date === day ? start.minutes : 0, end: end.date === day ? end.minutes : 1440 };
        }),
      ].filter(item => item.end > item.start).sort((a, b) => a.start - b.start || b.end - a.end);
      layoutLanes(items);
      for (const item of items) {
        const left = 100 * item.lane / item.lanes;
        const width = 100 / item.lanes;
        const top = y(item.start);
        const blockHeight = Math.max(21, y(item.end) - top - 2);
        const style = { top: `${top+1}px`, height: `${blockHeight}px`, left: `calc(${left}% + 3px)`, width: `calc(${width}% - 6px)` };
        if (item.kind === 'booking') {
          const b = item.booking;
          col.append(h('button', { type: 'button', class: `ev team-booking ${b.status === 'pending' ? 'is-pending' : ''}`,
            style: { ...style, background: b.color, color: readableInk(b.color) },
            title: `${b.time}–${b.endTime} · ${b.customer.name} · ${b.serviceName}`,
            onClick: () => openBookingDrawer(b.id, { app, onChange: load }),
          }, h('b', {}, b.customer.name), h('span', {}, `${b.time}–${b.endTime}`),
          blockHeight > 54 ? h('span', {}, b.serviceName) : null));
        } else {
          col.append(h('div', { class: 'ev ev-busy', style,
            title: item.event.title }, h('b', {}, item.event.title)));
        }
      }
      const allDay = dayEvents.filter(e => Number(e.staffId) === Number(person.id) && e.allDay);
      const bookedCount = dayBookings.filter(b => Number(b.staffId) === Number(person.id)).length;
      return { person, col, bookedCount, allDay };
    });

    card.className = 'card team-day';
    if (!displayed.length) {
      card.replaceChildren(h('div', { class:'team-day-empty' }, 'Zatím nejsou přidaní žádní zaměstnanci.'));
      return;
    }
    const gridStyle = { gridTemplateColumns: `56px repeat(${displayed.length}, minmax(205px, 1fr))` };
    const headerCells = columns.map(({ person, bookedCount, allDay }) => {
      const avatar = person.avatar
        ? h('img', { class: 'team-day-avatar', src: person.avatar, alt: '' })
        : h('span', { class: 'team-day-avatar-placeholder' }, icon('user', 18));
      const subtitle = h('span', {}, `${bookedCount} ${bookedCount === 1 ? 'rezervace' : bookedCount < 5 && bookedCount > 1 ? 'rezervace' : 'rezervací'}`);
      const labels = allDay.map(event => h('small', { class: 'team-day-allday' }, event.title));
      return h('div', { class: 'team-day-person' }, avatar,
        h('div', { class: 'team-day-person-copy' }, h('strong', {}, person.name), subtitle, labels));
    });
    const header = h('div', { class: 'team-day-head', style: gridStyle },
      h('div', { class: 'team-day-head-spacer' }), headerCells);
    const body = h('div', { class: 'team-day-body', style: gridStyle }, hours, columns.map(item => item.col));
    card.replaceChildren(h('div', { class: 'team-day-inner' }, header, body));
    legend.replaceChildren(
      h('span', {}, h('span', { class:'swatch', style:{background:'var(--accent)'} }), 'Rezervace'),
      h('span', {}, h('span', { class:'swatch', style:{background:'var(--surface-2)',boxShadow:'inset 0 0 0 1px var(--line)'} }), 'Mimo pracovní dobu'),
      h('span', {}, 'Klikněte na rezervaci pro její detail'));
  }

  await load();
  const timer = setInterval(() => state.data && render(), 60_000);
  return { cleanup: () => clearInterval(timer) };
}
