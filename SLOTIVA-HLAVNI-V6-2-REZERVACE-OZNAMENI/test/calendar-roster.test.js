import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarRoster } from '../src/calendar-roster.js';

const accounts = {
  1: { name:'Majitel', avatar_data:'' },
  2: { name:'Kikin', avatar_data:'data:image/png;base64,AA==' },
  3: { name:'Honza', avatar_data:'' },
};
const hours = id => ({ 1: [{ from: id === 2 ? '08:00' : '10:00', to:'17:00' }] });
const roster = (periods, ids=[1,2,3], owner=true, hasTeam=true) => calendarRoster({
  ids, periods, ownerId:1, isOwner:owner, hasTeam,
  getPerson:id=>accounts[id], getWorkingHours:hours,
});

test('majitel: bez vlastních rezervací se zobrazí jen zaměstnanci s vlastní pracovní dobou', () => {
  const result = roster([{ bookings:[], events:[] },{ bookings:[], events:[] },{ bookings:[], events:[] }]);
  assert.deepEqual(result.map(x=>x.name),['Kikin','Honza']);
  assert.equal(result[0].workingHours[1][0].from,'08:00');
  assert.equal(result[1].workingHours[1][0].from,'10:00');
  assert.equal(result[0].avatar, accounts[2].avatar_data);
});

test('staré rezervace majitele se neztratí', () => {
  const result = roster([{bookings:[{status:'confirmed'}],events:[]},{bookings:[],events:[]},{bookings:[],events:[]}]);
  assert.deepEqual(result.map(x=>x.id),[1,2,3]);
});

test('deaktivovanému zaměstnanci se z rozsahu nepřidá žádný další účet', () => {
  const result = roster([{bookings:[],events:[]}],[2],false,true);
  assert.deepEqual(result.map(x=>x.id),[2]);
});

test('samostatně pracující majitel bez týmu svůj kalendář vidí', () => {
  const result = roster([{bookings:[],events:[]}],[1],true,false);
  assert.deepEqual(result.map(x=>x.id),[1]);
});
