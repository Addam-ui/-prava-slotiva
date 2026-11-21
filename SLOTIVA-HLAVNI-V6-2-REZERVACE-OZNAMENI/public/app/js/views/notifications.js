import { get, patch, post } from '../api.js';
import { h, icon, toast, withBusy } from '../ui.js';

export async function mount({ view, setSubtitle, app }) {
  setSubtitle('Změny rezervací a žádosti o volno v jednom přehledu');
  const host=h('div',{class:'stack'});
  view.append(host);
  const updateBadge=()=>window.dispatchEvent(new CustomEvent('slotiva:notifications-changed'));
  async function load() {
    const result=await get('/notifications');
    const allRead=h('button',{type:'button',class:'btn btn-secondary',disabled:!result.unread,onClick:async e=>{
      await withBusy(e.currentTarget,async()=>{
        try { await post('/notifications/read-all'); await load(); updateBadge(); }
        catch(err){ toast(err.message,{error:true}); }
      });
    }}, icon('check',16),'Označit vše jako přečtené');
    const items=result.items.map(n=>h('article',{class:`notification-item ${n.readAt?'':'is-unread'}`},
      h('div',{class:'notification-icon'},icon(n.type==='time-off'?'calendar':'bell',18)),
      h('div',{class:'notification-copy'},
        h('strong',{},n.title),
        h('p',{class:'secondary'},n.body),
        h('small',{class:'muted'},new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeStyle:'short',timeZone:app.meta.timezone}).format(new Date(n.createdAt)))),
      h('div',{class:'notification-actions'},
        n.bookingId ? h('a',{class:'btn btn-sm btn-secondary',href:'#/rezervace'},'Rezervace') : null,
        !n.readAt ? h('button',{type:'button',class:'btn btn-sm btn-ghost',onClick:async e=>{
          await withBusy(e.currentTarget,async()=>{ try{ await patch(`/notifications/${n.id}`); await load(); updateBadge(); }
            catch(err){toast(err.message,{error:true});} });
        }},'Přečteno') : null)));
    host.replaceChildren(
      h('div',{class:'card card-pad notification-bar'},
        h('div',{},h('h2',{class:'card-title'},'Oznámení'),h('p',{class:'secondary'},
          `${result.unread} ${result.unread === 1 ? 'nepřečtené oznámení' : result.unread >= 2 && result.unread <= 4 ? 'nepřečtená oznámení' : 'nepřečtených oznámení'} · uložená v účtu`)),allRead),
      h('div',{class:'card notification-list'},items.length?items:h('div',{class:'card-pad secondary'},'Zatím žádná oznámení. Nové rezervace a změny volna se objeví tady.')));
  }
  await load();
}
