/** Opakované ruční rezervace: celá série vzniká atomicky, při kolizi nevznikne nic. */
import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { db, transaction, nowIso } from './db.js';
import { getSettings } from './settings.js';
import { getServiceRow } from './services.js';
import { getBusy, pushToGoogle, adminBookingView } from './bookings.js';
import { localDateTime, findSlot } from './availability.js';
import { badRequest, conflict, notFound } from './errors.js';
import { bookingNotice } from './notifications.js';
import * as v from './validate.js';

const MIN = 60_000;
const DAY = 86_400_000;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => [...crypto.randomBytes(6)].map(x=>alphabet[x % alphabet.length]).join('');
const token = () => crypto.randomBytes(24).toString('base64url');
const iso = ms => new Date(ms).toISOString();

export function scheduleDates(startDate, intervalWeeks, count, timezone) {
  v.date(startDate, { field:'date' });
  const weeks = v.integer(intervalWeeks, { field:'intervalWeeks', label:'Opakování v týdnech', min:1, max:2 });
  const occurrences = v.integer(count, { field:'count', label:'Počet termínů', min:2, max:12 });
  const start = DateTime.fromISO(startDate, { zone:timezone });
  if (!start.isValid || start.toISODate() !== startDate) throw badRequest('Neplatné datum první rezervace.');
  return Array.from({length:occurrences},(_,i)=>start.plus({weeks:weeks*i}).toISODate());
}

export async function createSeries(staffId,input={}) {
  const userId = Number(staffId);
  const settings = getSettings(userId);
  const service = getServiceRow(userId,input.serviceId);
  const time = v.time(input.time, { field:'time' });
  const name = v.text(input.name,{field:'name',label:'Jméno zákazníka',required:true,max:100});
  const email = v.email(input.email,{field:'email'});
  const phone = v.phone(input.phone,{field:'phone'});
  const note = v.text(input.note,{field:'note',label:'Poznámka',max:1000,multiline:true});
  const intervalWeeks = v.integer(input.intervalWeeks,{field:'intervalWeeks',label:'Opakování',min:1,max:2});
  const dates = scheduleDates(input.date,intervalWeeks,input.count,settings.timezone);
  const slots = [];
  for (const date of dates) {
    const startDt = localDateTime(date,time,settings.timezone);
    if (!startDt.isValid || startDt.toFormat('HH:mm') !== time) throw badRequest(`Neplatný čas ${date} (změna času).`);
    const start = startDt.toMillis();
    const end = start + service.duration_min * MIN;
    if (start <= Date.now()) throw badRequest('Opakovaná rezervace musí začínat v budoucnu.');
    const { busy } = await getBusy(userId,start-DAY,end+DAY,{fresh:true});
    if (!findSlot({settings,durationMin:service.duration_min,date,time,busy,applyRules:false})) {
      throw conflict(`Termín ${date} v ${time} není volný. Série nebyla vytvořena.`,{ code:'SERIES_CONFLICT', date });
    }
    slots.push({date,start,end});
  }
  let inserted = [];
  let seriesId;
  const bufferMs = settings.bufferMin * MIN;
  transaction(() => {
    // Opětovná kontrola pod zámkem transakce kvůli paralelním požadavkům.
    for (const slot of slots) {
      const clash = db.prepare(`SELECT id FROM bookings WHERE user_id=? AND status IN ('confirmed','pending')
        AND start_utc < ? AND end_utc > ? LIMIT 1`)
        .get(userId,iso(slot.end+bufferMs),iso(slot.start-bufferMs));
      const vacation = db.prepare(`SELECT id FROM staff_time_off WHERE user_id=? AND status='approved'
        AND start_utc < ? AND end_utc > ? LIMIT 1`)
        .get(userId,iso(slot.end),iso(slot.start));
      if (clash || vacation) throw conflict(`Termín ${slot.date} se mezitím obsadil. Série nebyla vytvořena.`,{code:'SERIES_CONFLICT',date:slot.date});
    }
    seriesId = Number(db.prepare('INSERT INTO booking_series(user_id,interval_weeks,occurrence_count) VALUES(?,?,?)')
      .run(userId,intervalWeeks,slots.length).lastInsertRowid);
    const insert = db.prepare(`INSERT INTO bookings
      (user_id,series_id,code,cancel_token,service_id,service_name,color_id,price,start_utc,end_utc,
       customer_name,customer_email,customer_phone,note,source,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const slot of slots) {
      let id;
      for (let attempt=0;attempt<5;attempt++) {
        try {
          id=Number(insert.run(userId,seriesId,code(),token(),service.id,service.name,service.color_id,service.price,
            iso(slot.start),iso(slot.end),name,email,phone,note,'admin','confirmed').lastInsertRowid);
          break;
        } catch(err) { if (!/UNIQUE/.test(err.message) || attempt===4) throw err; }
      }
      inserted.push(id);
    }
  });
  // Externí Google API až po COMMIT. Není-li dostupné, rezervace zůstanou lokálně vytvořené.
  const bookings=[];
  for (const id of inserted) {
    const row=await pushToGoogle(userId,id);
    bookings.push(adminBookingView(row));
  }
  // Notifikace jsou idempotentní podle ID série; nezahlcují zvoneček 12 zprávami.
  if (inserted.length) bookingNotice(db.prepare('SELECT * FROM bookings WHERE id=?').get(inserted[0]),'created');
  return { seriesId,bookings };
}

export async function cancelRemainingSeries(staffId,seriesId) {
  const userId=Number(staffId);
  const series=db.prepare('SELECT * FROM booking_series WHERE id=? AND user_id=?').get(Number(seriesId),userId);
  if (!series) throw notFound('Série nebyla nalezena.');
  const ids=db.prepare(`SELECT id FROM bookings WHERE series_id=? AND user_id=?
    AND status IN ('confirmed','pending') AND start_utc>? ORDER BY start_utc`).all(series.id,userId,nowIso()).map(r=>r.id);
  const {cancelBooking}=await import('./bookings.js');
  for (const id of ids) await cancelBooking(userId,id,{by:'admin'});
  return { cancelled:ids.length };
}
