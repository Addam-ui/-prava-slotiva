import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('záloha SQLite se uloží šifrovaná a obnoví se po ztrátě lokálního souboru', async () => {
  const data = new Map();
  const server = http.createServer(async (req,res) => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    const body=[];
    for await (const part of req) body.push(part);
    const [op,key,val] = JSON.parse(Buffer.concat(body).toString());
    let result=null;
    if (op === 'GET') result=data.get(key) ?? null;
    else if (op === 'SET') { data.set(key,val);result='OK'; }
    else if (op === 'DEL') {result=data.delete(key)?1:0;}
    else throw Error('unexpected '+op);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slotiva-persist-test-'));
  try {
    process.env.UPSTASH_REDIS_REST_URL=`http://127.0.0.1:${server.address().port}`;
    process.env.UPSTASH_REDIS_REST_TOKEN='test-token';
    process.env.UPSTASH_SNAPSHOT_KEY='slotiva:test';
    process.env.SESSION_SECRET='abcdefghijklmnopqrstuvwxyz0123456789SECRET';
    const { restoreDurableSnapshot, createDurabilityManager, durabilityStatus } = await import('../src/durable.js?test='+Date.now());
    const file=path.join(dir,'slotiva.db');
    assert.equal(await restoreDurableSnapshot(file),false);
    const db=new DatabaseSync(file);
    db.exec('CREATE TABLE demo(name TEXT); INSERT INTO demo(name) VALUES (\'Kikin\')');
    const manager=createDurabilityManager(db);
    await manager.flush();
    assert.ok(durabilityStatus().lastSavedAt);
    assert.ok([...data.values()].every(value=>!String(value).includes('Kikin')),'vzdálená data jsou šifrovaná');
    db.close(); await fs.rm(file);
    assert.equal(await restoreDurableSnapshot(file),true);
    const db2=new DatabaseSync(file);
    assert.equal(db2.prepare('SELECT name FROM demo').get().name,'Kikin');
    db2.exec("INSERT INTO demo(name) VALUES ('Honza')");
    const manager2=createDurabilityManager(db2);
    await manager2.flush();
    db2.close(); await fs.rm(file);
    assert.equal(await restoreDurableSnapshot(file),true);
    const db3=new DatabaseSync(file);
    assert.equal(db3.prepare('SELECT COUNT(*) AS total FROM demo').get().total,2);
    db3.close();
  } finally {
    server.close();
    await fs.rm(dir,{recursive:true,force:true});
    for(const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','UPSTASH_SNAPSHOT_KEY','SESSION_SECRET']) delete process.env[key];
  }
});
