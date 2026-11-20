import { badRequest, unavailable } from './errors.js';

const sid = process.env.TWILIO_ACCOUNT_SID || '';
const token = process.env.TWILIO_AUTH_TOKEN || '';
const service = process.env.TWILIO_VERIFY_SERVICE_SID || '';
export const smsEnabled = () => Boolean(sid && token && service);
export function normalizedPhone(raw) {
  const phone = String(raw || '').replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw badRequest('Zadejte telefon s předvolbou, například +420123456789.', { field:'phone' });
  return phone;
}
async function twilio(endpoint, data) {
  if (!smsEnabled()) throw badRequest('Ověřování telefonu není na serveru nakonfigurované.');
  let res;
  try {
    res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${endpoint}`, {
      method:'POST', headers:{ 'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(data), signal:AbortSignal.timeout(12000),
    });
  } catch { throw unavailable('Služba pro SMS ověřování je dočasně nedostupná.'); }
  const result=await res.json().catch(()=>({}));
  if (!res.ok) throw badRequest('Ověření telefonu se nezdařilo. Zkontrolujte číslo nebo zkuste později.');
  return result;
}
export async function sendCode(phone) { await twilio('Verifications',{To:phone,Channel:'sms'}); }
export async function checkCode(phone,code) {
  if (!/^\d{4,10}$/.test(String(code || ''))) throw badRequest('Neplatný ověřovací kód.',{field:'code'});
  const result=await twilio('VerificationCheck',{To:phone,Code:String(code)});
  if (result.status!=='approved') throw badRequest('Ověřovací kód nesouhlasí nebo vypršel.',{field:'code'});
}
