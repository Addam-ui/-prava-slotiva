import { get, post, put } from '../api.js';
import { h, icon, field, toast, withBusy, alertBox } from '../ui.js';
import { imagePicker } from '../photo.js';

export async function mount({ view, app, setSubtitle }) {
  setSubtitle('Účty zaměstnanců a jejich fotografie na veřejné rezervační stránce');
  if (!app.meta.team?.owner) { view.append(h('p', {}, 'Správu týmu může používat pouze majitel.')); return; }
  let data = await get('/team');
  const host = h('div', {class:'stack',style:{gap:'18px'}}); view.append(host);
  function paint() {

    const memberCards = data.members.map((m)=>{
      const name=h('input',{class:'input',value:m.name,maxlength:'80'});
      const email=h('input',{class:'input',type:'email',value:m.email});
      const password=h('input',{class:'input',type:'password',autocomplete:'new-password',placeholder:'Nové heslo (nepovinné)',minlength:'8'});
      let chosenAvatar = undefined;
      const picture = imagePicker({ label: 'Fotografie barbera', value: m.avatar, onChange: async (avatar) => { chosenAvatar = avatar; } });
      const active=h('input',{type:'checkbox',checked:m.active});
      const result=h('div');
      return h('details',{class:'card team-member-disclosure'},
        h('summary',{class:'team-member-summary'},
          m.avatar ? h('img', {class:'team-member-avatar',src:m.avatar,alt:''}) : icon('user', 22),
          h('span', {class:'team-member-summary-copy'},h('strong',{},m.name),h('small',{},m.active?'Aktivní účet':'Deaktivovaný účet')) , icon('chevronDown',18)),
        h('div',{class:'team-member-fields stack',style:{gap:'14px'}},
        field('Jméno',name),field('Přihlašovací e-mail',email),field('Změnit heslo',password),picture,
        h('label',{class:'check-line'},active,'Aktivní účet'),result,
        h('button',{class:'btn btn-secondary',onClick:(e)=>withBusy(e.currentTarget,async()=>{
          try {
            await put(`/team/${m.id}`,{name:name.value,email:email.value,password:password.value,avatar:chosenAvatar,active:active.checked});
            data=await get('/team');toast('Zaměstnanec uložen');paint();
          } catch(err) {result.replaceChildren(alertBox('critical','Nepodařilo se uložit',err.message));}
        })},icon('check',16),'Uložit zaměstnance')));
    });
    const addName=h('input',{class:'input',placeholder:'Např. Kikin',maxlength:'80',required:true});
    const addEmail=h('input',{class:'input',type:'email',placeholder:'kikin@firma.cz',required:true});
    const addPassword=h('input',{class:'input',type:'password',minlength:'8',autocomplete:'new-password',placeholder:'Alespoň 8 znaků',required:true});
    let newAvatar = '';
    const addPicture=imagePicker({label:'Fotografie (nepovinné)',onChange: async (avatar) => { newAvatar = avatar; }}); const result=h('div');
    const add=h('section',{class:'card card-pad stack'},h('h2',{class:'card-title'},'Přidat barbera'),
      h('p',{class:'secondary'},'Vytvoříte skutečný účet s vlastním heslem a kalendářem. Služby se zpočátku zkopírují od majitele.'),
      field('Jméno',addName),field('E-mail',addEmail),field('Heslo',addPassword),addPicture,result,
      h('button',{class:'btn btn-primary',onClick:(e)=>withBusy(e.currentTarget,async()=>{
        try {
          await post('/team',{name:addName.value,email:addEmail.value,password:addPassword.value,avatar:newAvatar});
          data=await get('/team');toast('Barber přidán');paint();
        }catch(err){result.replaceChildren(alertBox('critical','Nepodařilo se přidat',err.message));}
      })},icon('plus',16),'Přidat barbera'));
    host.replaceChildren(
      h('p',{class:'secondary'},'Přepínání mezi Společným kalendářem a zaměstnanci je v horní liště. Vyberte zaměstnance pro úpravu jeho profilu.'),
      ...memberCards,add);
  }
  paint();
}
