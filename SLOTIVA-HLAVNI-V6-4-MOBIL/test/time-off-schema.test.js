import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Testuje migraci stávající SQLite databáze bez nutnosti externích npm balíčků.
test('tabulka volna vznikne a vazby na zaměstnance fungují', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slotiva-v61-schema-'));
  try {
    const code = `
      const {db} = await import('./src/db.js');
      const assert = (await import('node:assert/strict')).default;
      db.prepare("INSERT INTO users(id,email,name,slug) VALUES(1,'owner@test.invalid','Firma','firma')").run();
      db.prepare("INSERT INTO users(id,email,name,slug,team_owner_id) VALUES(2,'kikin@test.invalid','Kikin','kikin',1)").run();
      db.prepare("INSERT INTO staff_time_off(user_id,requested_by,start_utc,end_utc,kind,status) VALUES(2,2,'2026-11-23T08:00:00.000Z','2026-11-24T08:00:00.000Z','vacation','pending')").run();
      assert.equal(db.prepare('SELECT count(*) AS n FROM staff_time_off').get().n,1);
      db.prepare("UPDATE staff_time_off SET status='approved' WHERE user_id=2").run();
      assert.equal(db.prepare("SELECT count(*) AS n FROM staff_time_off WHERE user_id=2 AND status='approved'").get().n,1);
      db.prepare('DELETE FROM users WHERE id=2').run();
      assert.equal(db.prepare('SELECT count(*) AS n FROM staff_time_off').get().n,0);
      db.close();
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATA_DIR: tmp, SKIP_ENV_FILE: '1', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', REQUIRE_UPSTASH_BACKUP: 'false' },
      stdio: 'pipe', timeout: 10_000,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
