import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slotiva-team-test-'));
process.env.SKIP_ENV_FILE = '1';
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'integration-test-secret-keep-it-local-only-123456789';
process.env.PULZ_BOOTSTRAP_EMAIL = 'test-pulz@example.test';
process.env.PULZ_BOOTSTRAP_PASSWORD = 'TestSecretDoNotUseInRealLife123';

const { bootstrapPulz } = await import('../src/bootstrap.js');
const { db } = await import('../src/db.js');
const { getUserByEmail, authenticate } = await import('../src/users.js');
const team = await import('../src/team.js');
const { getSettings, updateSettings } = await import('../src/settings.js');

test('založení majitele, správa barbera, rezervace a změna oprávnění', async () => {
  await bootstrapPulz();
  const owner = getUserByEmail('test-pulz@example.test');
  assert.ok(owner);
  assert.equal(owner.slug,'pulz');
  assert.equal(db.prepare('SELECT count(*) as n FROM services WHERE user_id=?').get(owner.id).n,3);
  await bootstrapPulz();
  assert.equal(db.prepare('SELECT count(*) as n FROM users').get().n,1);
  const barber = await team.addMember(owner,{name:'Kikin',email:'kikin@example.test',password:'KikinStrongPass123'});
  assert.equal(team.bookingStaff(owner.id,barber.id),barber.id);
  assert.equal(team.calendarUser(owner,barber.id),barber.id);
  assert.equal(team.calendarUser(barber,owner.id),barber.id);
  assert.equal(db.prepare('SELECT count(*) as n FROM services WHERE user_id=?').get(barber.id).n,3);
  const updated=await team.updateMember(owner,barber.id,{email:'kikin-new@example.test',password:'DifferentStrongPass123'});
  assert.equal(updated.email,'kikin-new@example.test');
  assert.equal((await authenticate(updated.email,'DifferentStrongPass123')).id,barber.id);
  await team.updateMember(owner,barber.id,{active:false});
  await assert.rejects(authenticate(updated.email,'DifferentStrongPass123'),{status:403});
  const settings=structuredClone(getSettings(owner.id));
  settings.appearance.backgroundColor='#123abc';
  assert.equal(updateSettings(owner.id,settings).appearance.backgroundColor,'#123abc');
});

test.after(() => {
  db.close();
  fs.rmSync(dataDir,{recursive:true,force:true});
});
