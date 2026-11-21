import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Izolovaná SQLite DB: netestuje síť ani reálné účty.
test('V6.2: oznámení mají oddělené příjemce, idempotenci a označení přečtení', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slotiva-v62-notifications-'));
  try {
    const program = `
      const assert = (await import('node:assert/strict')).default;
      const { db } = await import('./src/db.js');
      const n = await import('./src/notifications.js');
      const insert = db.prepare('INSERT INTO users(email,name,slug,team_owner_id) VALUES(?,?,?,?)');
      const owner = Number(insert.run('owner@example.test','Majitel','firma',null).lastInsertRowid);
      const staff = Number(insert.run('kikin@example.test','Kikin','kikin',owner).lastInsertRowid);
      const other = Number(insert.run('other@example.test','Jina firma','jina',null).lastInsertRowid);
      n.publish({recipients:[owner,staff,staff],eventKey:'demo-event-1',type:'booking',title:'Nová rezervace'});
      n.publish({recipients:[owner,staff],eventKey:'demo-event-1',type:'booking',title:'Nová rezervace'});
      assert.equal(n.listNotifications(owner).unread,1);
      assert.equal(n.listNotifications(staff).unread,1);
      assert.equal(n.listNotifications(other).unread,0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,2);
      const staffNotification = n.listNotifications(staff).items[0];
      assert.equal(n.readNotification(other,staffNotification.id),false);
      assert.equal(n.readNotification(staff,staffNotification.id),true);
      assert.equal(n.listNotifications(staff).unread,0);
      assert.equal(n.listNotifications(owner).unread,1);
      assert.equal(n.readAllNotifications(owner),1);
      assert.equal(n.readAllNotifications(owner),0);
      assert.equal(n.listNotifications(owner).unread,0);
      db.close();
    `;
    execFileSync(process.execPath,['--input-type=module','-e',program],{
      cwd:path.resolve(import.meta.dirname,'..'),
      env:{...process.env,SKIP_ENV_FILE:'1',DATA_DIR:tempDir,UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',REQUIRE_UPSTASH_BACKUP:'false'},
      stdio:'pipe',timeout:10_000,
    });
  } finally { fs.rmSync(tempDir,{recursive:true,force:true}); }
});

test('V6.2: migrace opakovaných rezervací zachová existující tabulku bookings', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slotiva-v62-series-'));
  try {
    const program = `
      const assert = (await import('node:assert/strict')).default;
      const { db, transaction } = await import('./src/db.js');
      const user=Number(db.prepare("INSERT INTO users(email,name,slug) VALUES('a@example.test','Firma','firma')").run().lastInsertRowid);
      const columns=db.prepare('PRAGMA table_info(bookings)').all().map(x=>x.name);
      assert.ok(columns.includes('series_id'));
      const series=Number(db.prepare('INSERT INTO booking_series(user_id,interval_weeks,occurrence_count) VALUES(?,?,?)').run(user,1,2).lastInsertRowid);
      const add=db.prepare("INSERT INTO bookings(user_id,series_id,code,cancel_token,service_name,start_utc,end_utc,customer_name) VALUES(?,?,?,?,?,?,?,?)");
      add.run(user,series,'TESTAAAA','token-one','Střih','2026-12-03T08:00:00Z','2026-12-03T08:30:00Z','Test');
      add.run(user,series,'TESTBBBB','token-two','Střih','2026-12-10T08:00:00Z','2026-12-10T08:30:00Z','Test');
      assert.equal(db.prepare('SELECT count(*) AS n FROM bookings WHERE series_id=?').get(series).n,2);
      assert.throws(()=>transaction(()=>{
        add.run(user,series,'TESTCCCC','token-three','Střih','2026-12-17T08:00:00Z','2026-12-17T08:30:00Z','Test');
        add.run(user,series,'TESTAAAA','duplicate-token','Střih','2026-12-24T08:00:00Z','2026-12-24T08:30:00Z','Test');
      }));
      assert.equal(db.prepare('SELECT count(*) AS n FROM bookings WHERE series_id=?').get(series).n,2);
      db.close();
    `;
    execFileSync(process.execPath,['--input-type=module','-e',program],{
      cwd:path.resolve(import.meta.dirname,'..'),
      env:{...process.env,SKIP_ENV_FILE:'1',DATA_DIR:tempDir,UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',REQUIRE_UPSTASH_BACKUP:'false'},
      stdio:'pipe',timeout:10_000,
    });
  } finally { fs.rmSync(tempDir,{recursive:true,force:true}); }
});
