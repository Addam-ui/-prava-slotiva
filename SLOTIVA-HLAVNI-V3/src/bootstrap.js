import { config } from './config.js';
import { getUserByEmail, registerUser } from './users.js';
import { db } from './db.js';
import { patchSettings } from './settings.js';

/** Optional initial owner creation. Supply the password exclusively in deployment secrets. */
export async function bootstrapPulz() {
  const password = (process.env.PULZ_BOOTSTRAP_PASSWORD || '').trim();
  if (!password) return;
  if (password.length < 8) throw new Error('PULZ_BOOTSTRAP_PASSWORD musí mít alespoň 8 znaků.');
  const email = (process.env.PULZ_BOOTSTRAP_EMAIL || 'pulzbarbershop@gmail.com').trim().toLowerCase();
  if (getUserByEmail(email)) return;
  const u = await registerUser({ name: 'PULZ Barbershop', email, password, slug: 'pulz' });
  patchSettings(u.id, { business: { name: 'PULZ Barbershop', tagline: 'Střih, který má styl.', description: 'Zapomeň na uspěchané střihy jak z pásu. V PULZU si dáváme záležet na každém detailu. Pohodlně se usaď, dej si dobrou kávu a nech to na nás.', address: 'Na Struze 30, 541 01 Trutnov', phone: '+420 704 202 026', email, website: '' }, brandColor: '#0a7c80', settingsSaved: true });
  const sample = [{name:'Pánský střih',price:390,duration:30},{name:'Dětský střih',price:290,duration:25},{name:'Combo',price:590,duration:45}];
  db.prepare('DELETE FROM services WHERE user_id = ?').run(u.id);
  for (let i=0;i<sample.length;i++) db.prepare('INSERT INTO services (user_id,name,duration_min,price,sort_order) VALUES (?,?,?,?,?)').run(u.id,sample[i].name,sample[i].duration,sample[i].price,i);
  console.log(`Testovací účet PULZ založen: ${email} (heslo není uvedené v logu).`);
}
