import { get, post, patch } from '../api.js';
import { h, icon, field, alertBox, toast, withBusy } from '../ui.js';

const format = (value, timezone) => new Intl.DateTimeFormat('cs-CZ', {
  timeZone: timezone, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
const formatDay = (value, timezone) => new Intl.DateTimeFormat('cs-CZ', { timeZone: timezone, day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(value));
const formatTimeOff = (item, timezone) => {
  if (!item.allDay) return `${format(item.start, timezone)} – ${format(item.end, timezone)}`;
  const start = formatDay(item.start, timezone);
  const end = formatDay(new Date(Date.parse(item.end) - 60_000), timezone);
  return start === end ? start + ' · celý den' : `${start} – ${end} · celé dny`;
};
const STATUSES = { pending: 'Čeká na schválení', approved: 'Schváleno', rejected: 'Zamítnuto', cancelled: 'Zrušeno' };
const TYPES = { vacation: 'Dovolená', break: 'Přestávka', other: 'Volno' };

export async function mount({ view, app, setSubtitle }) {
  const owner = Boolean(app.meta.team.owner);
  setSubtitle(owner ? 'Schvalujte dovolené a nastavujte nedostupnost týmu' : 'Vaše přestávky a žádosti o dovolenou');
  const host = h('div', { class: 'stack' });
  view.append(host);
  let result = await get('/time-off');
  const today = app.meta.today;

  async function reload() {
    result = await get('/time-off');
    paint();
  }

  function paint() {
    const staff = owner ? result.staff : result.staff.filter(p => Number(p.id) === Number(app.meta.user.id));
    const selectedStaff = h('select', { class: 'select', 'aria-label': 'Zaměstnanec' },
      staff.map(person => h('option', { value: String(person.id) }, person.name)));
    if (owner && staff.length > 1) {
      const firstEmployee = staff.find(person => Number(person.id) !== Number(app.meta.user.id));
      if (firstEmployee) selectedStaff.value = String(firstEmployee.id);
    }
    const kind = h('select', { class: 'select' },
      h('option', { value: 'vacation' }, 'Dovolená'),
      h('option', { value: 'break' }, 'Přestávka'),
      h('option', { value: 'other' }, 'Jiné volno'));
    const from = h('input', { type: 'date', class: 'input', value: today, required: true });
    const to = h('input', { type: 'date', class: 'input', value: today, required: true });
    const allDay = h('input', { type: 'checkbox', checked: true });
    const fromTime = h('input', { type: 'time', class: 'input', value: '09:00', required: true });
    const toTime = h('input', { type: 'time', class: 'input', value: '12:00', required: true });
    const times = h('div', { class: 'time-off-time-pair', hidden: true },
      field('Od', fromTime), field('Do', toTime));
    allDay.addEventListener('change', () => { times.hidden = allDay.checked; });
    const note = h('textarea', { class: 'input', rows: 2, maxlength: '500', placeholder: 'Nepovinná poznámka' });
    const error = h('div');
    const form = h('form', { class: 'card card-pad stack', onSubmit: async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      await withBusy(button, async () => {
        try {
          await post('/time-off', {
            staffId: Number(selectedStaff.value), kind: kind.value,
            fromDate: from.value, toDate: to.value,
            allDay: allDay.checked, fromTime: fromTime.value, toTime: toTime.value,
            note: note.value,
          });
          toast(owner ? 'Volno bylo vytvořeno' : 'Žádost byla odeslána');
          await reload();
        } catch (err) { error.replaceChildren(alertBox('critical', 'Nepodařilo se uložit volno', err.message)); }
      });
    } },
    h('div', { class: 'stack', style: { gap: '4px' } },
      h('h2', { class: 'card-title' }, owner ? 'Naplánovat volno zaměstnance' : 'Požádat o volno'),
      h('p', { class: 'secondary' }, owner
        ? 'Schválené volno okamžitě zablokuje dostupné termíny na rezervační stránce.'
        : 'Vaši žádost musí schválit majitel. Do té doby termíny zůstávají dostupné.')),
    owner ? field('Zaměstnanec', selectedStaff) : null,
    field('Druh volna', kind),
    h('div', { class: 'time-off-time-pair' }, field('Začátek', from), field('Konec', to)),
    h('label', { class: 'check-line' }, allDay, 'Celý den / celé dny'),
    times,
    field('Poznámka', note), error,
    h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus', 16), owner ? 'Zablokovat termín' : 'Odeslat žádost'));

    const sorted = [...result.items].sort((a, b) =>
      Number(['approved','pending'].includes(b.status)) - Number(['approved','pending'].includes(a.status))
      || b.start.localeCompare(a.start));
    const rows = sorted.map(item => {
      const actions = [];
      const button = (action, caption, cls = 'btn-secondary') => h('button', {
        type: 'button', class: `btn btn-sm ${cls}`, onClick: async (event) => {
          await withBusy(event.currentTarget, async () => {
            try { await patch(`/time-off/${item.id}`, { action }); await reload(); toast('Stav volna byl změněn'); }
            catch (err) { toast(err.message, { error: true }); }
          });
        },
      }, caption);
      if (owner && item.status === 'pending') {
        actions.push(button('approve', 'Schválit', 'btn-primary'), button('reject', 'Zamítnout'));
      }
      if ((owner && ['pending','approved'].includes(item.status)) || (!owner && item.status === 'pending' && Number(item.staffId) === Number(app.meta.user.id))) {
        actions.push(button('cancel', 'Zrušit'));
      }
      return h('article', { class: 'time-off-item' },
        h('div', { class: 'time-off-item-main' },
          h('strong', {}, `${TYPES[item.kind] || 'Volno'} · ${item.staffName}`),
          h('span', { class: 'time-off-dates' }, formatTimeOff(item, app.meta.timezone)),
          item.note ? h('span', { class: 'secondary' }, item.note) : null),
        h('div', { class: 'time-off-item-actions' }, h('span', { class: `time-off-status is-${item.status}` }, STATUSES[item.status] || item.status), ...actions));
    });
    host.replaceChildren(form, h('section', { class: 'card card-pad stack' },
      h('h2', { class: 'card-title' }, 'Naplánované volno a žádosti'),
      rows.length ? rows : h('p', { class: 'secondary' }, 'Zatím nejsou vytvořené žádné záznamy.')));
  }
  paint();
}
