import { get, post, put } from '../api.js';
import { h, icon, field, toast, withBusy, alertBox } from '../ui.js';
import { photoData } from '../photo.js';

export async function mount({ view, app, setSubtitle }) {
  setSubtitle('Vlastní účty zaměstnanců, fotky a přepínání kalendářů');
  if (!app.meta.team?.owner) { view.append(h('p', {}, 'Správu týmu může používat pouze majitel.')); return; }
  let data = await get('/team');
  const host = h('div', {class:'stack',style:{gap:'18px'}}); view.append(host);
  const photoControl = (label) => field(label, h('input', { class:'input', type:'file', accept:'image/png,image/jpeg,image/webp' }));
  function paint() {
    const select = h('select', { class:'select' }, [h('option', {value:String(data.owner.id), selected:app.meta.selectedUserId===data.owner.id}, 'Můj kalendář (majitel)'),
      ...data.members.filter(m=>m.active).map(m=>h('option',{value:String(m.id), selected:app.meta.selectedUserId===m.id},m.name))]);
    const selectCard = h('section', {class:'card card-pad stack'},
      h('h2', {class:'card-title'}, 'Přepnout kalendář'),
      h('p',{class:'secondary'},'Majitel může spravovat rezervace a pracovní dobu každého člena týmu. Zaměstnanci vidí pouze svůj účet.'),
      select,
      h('button',{class:'btn btn-primary',onClick:()=>{ sessionStorage.setItem('slotiva-staff-id',select.value); location.replace('/app/#/prehled'); location.reload(); }},'Zobrazit vybraný kalendář'));
    const memberCards = data.members.map((m)=>{
      const name=h('input',{class:'input',value:m.name,maxlength:'80'});
      const email=h('input',{class:'input',type:'email',value:m.email});
      const password=h('input',{class:'input',type:'password',autocomplete:'new-password',placeholder:'Nové heslo (nepovinné)',minlength:'8'});
      const picture=photoControl('Fotografie barbera (automatické zmenšení, JPG/PNG/WebP)');
      const active=h('input',{type:'checkbox',checked:m.active});
      const result=h('div');
      return h('section',{class:'card card-pad stack'},
        h('h3',{},m.name),m.avatar?h('img',{src:m.avatar,alt:m.name,style:{width:'76px',height:'76px',borderRadius:'50%',objectFit:'cover'}}):null,
        field('Jméno',name),field('Přihlašovací e-mail',email),field('Změnit heslo',password),picture,
        h('label',{class:'check-line'},active,'Aktivní účet'),result,
        h('button',{class:'btn btn-secondary',onClick:(e)=>withBusy(e.currentTarget,async()=>{
          try { const avatar=picture.querySelector('input').files[0] ? await photoData(picture.querySelector('input').files[0]) : undefined;
            await put(`/team/${m.id}`,{name:name.value,email:email.value,password:password.value,avatar,active:active.checked});
            data=await get('/team');toast('Zaměstnanec uložen');paint();
          } catch(err) {result.replaceChildren(alertBox('critical','Nepodařilo se uložit',err.message));}
        })},icon('check',16),'Uložit zaměstnance'));
    });
    const addName=h('input',{class:'input',placeholder:'Např. Kikin',maxlength:'80',required:true});
    const addEmail=h('input',{class:'input',type:'email',placeholder:'kikin@firma.cz',required:true});
    const addPassword=h('input',{class:'input',type:'password',minlength:'8',autocomplete:'new-password',placeholder:'Alespoň 8 znaků',required:true});
    const addPicture=photoControl('Fotografie (nepovinné, automaticky zmenšíme)'); const result=h('div');
    const add=h('section',{class:'card card-pad stack'},h('h2',{class:'card-title'},'Přidat barbera'),
      h('p',{class:'secondary'},'Vytvoříte skutečný účet s vlastním heslem a kalendářem. Služby se zpočátku zkopírují od majitele.'),
      field('Jméno',addName),field('E-mail',addEmail),field('Heslo',addPassword),addPicture,result,
      h('button',{class:'btn btn-primary',onClick:(e)=>withBusy(e.currentTarget,async()=>{
        try { const avatar=await photoData(addPicture.querySelector('input').files[0]);
          await post('/team',{name:addName.value,email:addEmail.value,password:addPassword.value,avatar});
          data=await get('/team');toast('Barber přidán');paint();
        }catch(err){result.replaceChildren(alertBox('critical','Nepodařilo se přidat',err.message));}
      })},icon('plus',16),'Přidat barbera'));
    host.replaceChildren(selectCard,...memberCards,add);
  }
  paint();
}
