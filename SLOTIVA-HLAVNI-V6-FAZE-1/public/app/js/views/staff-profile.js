import { put, post } from '../api.js';
import { h, field, toast, alertBox, withBusy } from '../ui.js';
import { imagePicker } from '../photo.js';

export async function mount({ view, app, setSubtitle }) {
  setSubtitle('Osobní údaje a fotografie viditelná při výběru barbera');
  const me = app.meta.user;
  const name = h('input',{class:'input',value:me.name,maxlength:'80'});
  const email = h('input',{class:'input',type:'email',value:me.email});
  let chosenAvatar = null;
  const picture = imagePicker({ label: 'Moje fotografie na rezervační stránce', value: me.avatar, onChange: async (avatar) => { chosenAvatar = avatar; } });
  const oldPass=h('input',{class:'input',type:'password',autocomplete:'current-password'});
  const newPass=h('input',{class:'input',type:'password',autocomplete:'new-password'});
  const result=h('div');
  const section = (title,...content) => h('section',{class:'card card-pad stack',style:{gap:'14px'}},h('h2',{class:'card-title'},title),...content);
  view.append(h('div',{class:'stack',style:{maxWidth:'680px',gap:'18px'}},
    section('Můj zaměstnanecký profil',h('p',{class:'secondary'},'Vaši fotografii uvidí zákazníci při výběru barbera. Firemní nastavení spravuje majitel.'),
      picture,field('Jméno',name),field('Přihlašovací e-mail',email),result,
      h('button',{class:'btn btn-primary',onClick:e=>withBusy(e.currentTarget,async()=>{
        try {
          if (chosenAvatar) await put('/avatar',{avatar:chosenAvatar});
          await put('/profile',{name:name.value,email:email.value,slug:me.slug});
          toast('Profil a fotografie uloženy'); await app.refreshMeta();
          location.reload();
        }catch(err){result.replaceChildren(alertBox('critical','Profil se nepodařilo uložit',err.message));}
      })},'Uložit svůj profil')),
    section('Změna hesla',field('Současné heslo',oldPass),field('Nové heslo (alespoň 8 znaků)',newPass),
      h('button',{class:'btn btn-secondary',onClick:e=>withBusy(e.currentTarget,async()=>{
        try{ await post('/password',{currentPassword:oldPass.value,newPassword:newPass.value});toast('Heslo změněno');oldPass.value='';newPass.value=''; }
        catch(err){result.replaceChildren(alertBox('critical','Heslo se nepodařilo změnit',err.message));}
      })},'Změnit heslo'))));
}
