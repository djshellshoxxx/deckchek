import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installServiceDom, deferred, settle } from './fixtures/service-screen-dom.mjs';
import { createSupportIsolationStore } from '../app/support-isolation.js';
const document=installServiceDom({after});window.addEventListener=()=>{};window.removeEventListener=()=>{};
const {createSupportIsolationPanel}=await import('../app/ui/workflows/support-isolation.js');
const {createHumScreen}=await import('../app/ui/workflows/hum.js');
const {payloadToAudio}=await import('../app/ui/audio-io.js');
const {readSupportCalibration}=await import('../app/ui/state.js');
const {gatherVenueReport,venuePrintable}=await import('../app/ui/workflows/m6-reports.js');
const {esc}=await import('../app/ui/dom.js');
const contract=JSON.parse(fs.readFileSync(new URL('./contracts/support-isolation.json',import.meta.url)));
const copy=x=>structuredClone(x);let ids=0;
function memory(){const map=new Map();return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
const catalog={list:async entity=>copy({venue:[contract.observationA.context.venue],setup:[contract.observationA.context.setup],asset:[],supportConfiguration:[contract.observationA.context.support,contract.observationB.context.support]}[entity])};
function mount(t,options={}){
  const host=document.createElement('section');document.body.append(host);const storage=memory(),durable=createSupportIsolationStore({invoke:null,storage,catalog}),sessions=[];
  let time=Date.parse('2026-11-18T12:00:00.000Z');
  const capture=async config=>{
    const sampleRate=4096,left=Float32Array.from({length:30*sampleRate},(_,n)=>(sessions.length===0?.5:.25)*Math.sin(2*Math.PI*63*n/sampleRate));
    const source=copy(contract.observationA.capture),info={...source.info,leaseId:++ids};
    const result={audio:payloadToAudio({left,right:left,sampleRate,channels:2,pairs:info.pairs,deviceName:info.deviceName,streamErrors:[]}),quality:source.quality,streamErrors:[],deviceName:info.deviceName};
    const session={info,stopped:false,elapsed:()=>30,stop:async()=>{session.stopped=true;time+=30000;return result;},cancel:async()=>{session.stopped=true;},config,result};sessions.push(session);return session;
  };
  const panel=createSupportIsolationPanel(host,{catalog,store:durable,capture,available:()=>true,inputs:async()=>({devices:[{id:'Interface A',name:'Interface A',pairs:[contract.observationA.capture.pair]}]}),
    calibrationFor:()=>copy(contract.observationA.calibration),newId:()=>`ui-${++ids}`,now:()=>new Date(time).toISOString(),timers:{setInterval:()=>1,clearInterval:()=>{}},...options});
  t.after(()=>{panel.dispose();host.remove();});
  const field=id=>host.querySelector(`#support-ab-${id}`);
  const choose=(id,value)=>{field(id).value=value;field(id).dispatch('change');};
  return {host,panel,storage,store:durable,sessions,field,choose,
    async prepare(){await settle();choose('venue','venue-a');choose('setup','setup-a');choose('a','support-a');choose('b','support-b');choose('device','Interface A');choose('pair','1');
      for(const [key,value] of Object.entries(contract.observationA.context.conditions)){if(key==='stationaryConfirmed')field('stationary').checked=value;else field(key).value=value;}field('confirm').checked=true;},
    async record(){field('stationary').checked=true;field('record').dispatch('click');await settle();const session=sessions.at(-1);assert.ok(session,'capture started');session.config.onStatus({running:true,quality:session.result.quality});await settle();},
  };
}
test('production controls save A, change support, save B, derive comparison, reload and report exact historical evidence',async t=>{
  const s=mount(t);await s.prepare();await s.record();assert.equal((await s.store.list()).observationTotal,1);assert.match(s.host.textContent,/Capture B/);
  assert.equal(s.field('stationary').checked,false,'A acknowledgment requires a fresh stationary declaration for B');
  await s.record();assert.equal(s.field('confirm').checked,false,'confirm matching conditions after B');s.field('confirm').checked=true;s.field('compare').dispatch('click');await settle();
  const reloaded=await createSupportIsolationStore({invoke:null,storage:s.storage,catalog}).list();assert.equal(reloaded.observationTotal,2);assert.equal(reloaded.comparisonTotal,1);
  assert.equal(reloaded.comparisons[0].result.status,'operator_reported_comparable');assert.ok(Math.abs(reloaded.comparisons[0].result.deltaDb.pair+6.020599913279626)<1e-9);
  assert.match(s.host.textContent,/unknown/i);assert.equal(s.host.querySelectorAll('img').length,0);
  const report=await gatherVenueReport({catalog,humStore:{list:async()=>[]},isolationStore:s.store,venueId:'venue-a'}),html=venuePrintable.build(report,{esc});
  assert.match(html,/Paver &lt;img/);assert.match(html,/B − A/);assert.match(html,/raw audio is archived/i);
});
test('changed operator conditions preserve observations and produce an explicit non-comparable result',async t=>{
  const s=mount(t);await s.prepare();await s.record();s.field('paLevel').value='Master changed to 3';await s.record();s.field('confirm').checked=true;s.field('compare').dispatch('click');await settle();
  const history=await s.store.list();assert.equal(history.observationTotal,2);assert.equal(history.comparisons[0].result.deltaDb.pair,null);assert.ok(history.comparisons[0].result.reasons.includes('pa_conditions_changed'));assert.match(s.host.textContent,/pa_conditions_changed/);
});
test('lost save response retries the same original observation while form changes and duplicate presses cannot alter it',async t=>{
  const storage=memory(),durable=createSupportIsolationStore({invoke:null,storage,catalog});let lost=true;
  const s=mount(t,{store:{...durable,saveObservation:async input=>{const row=await durable.saveObservation(input);if(lost){lost=false;throw new Error('Response lost');}return row;}}});
  await s.prepare();await s.record();assert.match(s.host.textContent,/Response lost/);assert.equal((await durable.list()).observationTotal,1);
  s.field('route').value='Late form edit';s.field('retry').dispatch('click');s.field('retry').dispatch('click');await settle();
  const row=(await durable.list()).observations[0];assert.equal(row.context.conditions.route,contract.observationA.context.conditions.route);assert.equal((await durable.list()).observationTotal,1);
});
test('late capture opens are cancelled after hide without dispatching a save',async t=>{
  const gate=deferred();let cancelled=0;const s=mount(t,{capture:()=>gate.promise});await s.prepare();s.field('record').dispatch('click');await settle();s.panel.setActive(false);
  gate.resolve({info:contract.observationA.capture.info,cancel:async()=>{cancelled++;}});await settle();assert.equal(cancelled,1);assert.equal((await s.store.list()).observationTotal,0);
  s.panel.setActive(true);await settle();assert.match(s.host.textContent,/cancelled|Capture A/i);
});
test('catalog and history failures are explicit and retryable rather than an authoritative empty history',async t=>{
  let fail=true;const s=mount(t,{catalog:{list:async entity=>{if(fail)throw new Error('Catalog unreadable');return catalog.list(entity);}}});await settle();assert.match(s.host.textContent,/Catalog unreadable/);
  fail=false;s.field('catalog-retry').dispatch('click');await settle();assert.ok(s.field('venue').children.some(option=>option.value==='venue-a'));
  const other=mount(t,{store:{native:false,list:async()=>{throw new Error('History corrupt');}}});await settle();assert.match(other.host.textContent,/History corrupt/);assert.ok(!other.host.textContent.includes('No support observations saved'));
});
test('strict calibration snapshot distinguishes absent, corrupt and mismatched actual-route profiles without writes',()=>{
  const storage=memory(),key='deckchek.calibration.v1';assert.equal(readSupportCalibration('Interface A',4096,{storage}).state,'none');
  storage.map.set(key,'{bad');assert.equal(readSupportCalibration('Interface A',4096,{storage}).state,'unavailable');assert.equal(storage.getItem(key),'{bad');
  const profile={version:1,deviceName:'Other input',sampleRate:4096,valid:true,issues:[],gainDb:{left:0,right:0},uncertainty:{},mismatchDb:0,clockPpm:0,latencyMs:1};
  storage.map.set(key,JSON.stringify({'interface a|4096':JSON.stringify(profile)}));const result=readSupportCalibration('Interface A',4096,{storage});assert.equal(result.state,'rejected');assert.equal(result.profile.deviceName,'Other input');assert.equal(result.applied,false);
  assert.equal(readSupportCalibration('Interface A',4096,{storage:null}).state,'unavailable');
});

test('the actual Hum screen exposes the Support A/B panel and restores its history across tab lifecycle',async t=>{
  const host=document.createElement('section');document.body.append(host);const storage=memory(),store=createSupportIsolationStore({invoke:null,storage,catalog});
  await store.saveObservation(contract.observationA);
  const screen=createHumScreen(host,{store:{list:async()=>[]},isolationOptions:{catalog,store,available:()=>false,inputs:async()=>({devices:[]})}});
  t.after(()=>{screen.onHide();host.remove();});
  const tab=host.querySelector('#hum-tab-support');assert.ok(tab,'Support A/B entry point exists');tab.dispatch('click');await settle();
  assert.match(host.textContent,/Shelf/);assert.match(host.textContent,/desktop app/);
  host.querySelector('#hum-tab-runs').dispatch('click');await settle();tab.dispatch('click');await settle();assert.match(host.textContent,/Showing 1 of 1/);
});

test('reactivating the panel refreshes catalog snapshots while retaining completed observation A',async t=>{
  let changed=false;const source={list:async entity=>{const rows=await catalog.list(entity);if(changed&&entity==='supportConfiguration')rows.find(x=>x.id==='support-b').name='Updated support B';return rows;}};
  const s=mount(t,{catalog:source});await s.prepare();await s.record();s.panel.setActive(false);changed=true;s.panel.setActive(true);await settle();
  assert.ok(s.field('b').children.some(option=>option.textContent==='Updated support B'));assert.equal((await s.store.list()).observationTotal,1);assert.match(s.field('record').textContent,/Capture B/);
});

test('retired history successes and errors cannot replace the latest venue or reactivate a hidden load',async t=>{
  const requests=[],storage=memory(),durable=createSupportIsolationStore({invoke:null,storage,catalog});
  await durable.saveObservation(contract.observationA);const original=await durable.list();
  const empty={observations:[],comparisons:[],observationTotal:0,comparisonTotal:0,limit:50};
  const source={list:async entity=>{const rows=await catalog.list(entity);if(entity==='venue')rows.push({id:'venue-b',name:'Other venue'});return rows;}};
  const s=mount(t,{catalog:source,store:{...durable,list:filter=>{const gate=deferred();requests.push({filter,gate});return gate.promise;}}});
  await s.prepare();const first=requests[0],selected=requests.at(-1);s.choose('venue','venue-b');const latest=requests.at(-1);
  assert.equal(latest.filter.venueId,'venue-b');latest.gate.resolve(empty);await settle();
  selected.gate.resolve(original);first.gate.reject(new Error('Retired read failure'));await settle();
  assert.match(s.field('history').textContent,/0 of 0 observations/);assert.doesNotMatch(s.field('history').textContent,/Shelf|Retired read failure/);
  s.panel.setActive(false);s.panel.setActive(true);const retired=requests.at(-1);s.panel.setActive(false);s.panel.setActive(true);const current=requests.at(-1);
  current.gate.resolve(empty);retired.gate.reject(new Error('Hidden read failure'));await settle();
  assert.match(s.field('history').textContent,/0 of 0 observations/);assert.doesNotMatch(s.field('history').textContent,/Hidden read failure/);
});

test('an already dispatched save keeps its original ownership through hide and a lost response',async t=>{
  for(const lost of [false,true]){
    const storage=memory(),durable=createSupportIsolationStore({invoke:null,storage,catalog}),gate=deferred();let calls=0,submitted;
    const s=mount(t,{store:{...durable,saveObservation:async input=>{calls++;submitted??=copy(input);const saved=await durable.saveObservation(input);if(calls===1)await gate.promise;return saved;}}});
    await s.prepare();await s.record();assert.equal((await durable.list()).observationTotal,1);
    s.panel.setActive(false);s.field('route').value='Later unrelated form value';s.field('new').dispatch('click');
    if(lost)gate.reject(new Error('Lost while hidden'));else gate.resolve();await settle();s.panel.setActive(true);await settle();
    if(lost){assert.match(s.field('status').textContent,/Lost while hidden/);s.field('retry').dispatch('click');s.field('retry').dispatch('click');await settle();}
    const history=await durable.list();assert.equal(history.observationTotal,1);assert.equal(history.observations[0].id,submitted.id);
    assert.equal(history.observations[0].context.conditions.route,contract.observationA.context.conditions.route);
    assert.equal(calls,lost?2:1);assert.match(s.field('record').textContent,/Capture B/);assert.equal(s.field('stationary').checked,false);
  }
});

test('non-finite serialized calibration metadata stays rejected with its original source text',()=>{
  const storage=memory(),entry='{"version":1,"deviceName":"Interface A","sampleRate":4096,"valid":true,"issues":[],"gainDb":{"left":0,"right":0},"uncertainty":{"legacy":1e999},"mismatchDb":0,"clockPpm":0,"latencyMs":1}';
  storage.map.set('deckchek.calibration.v1',JSON.stringify({'interface a|4096':entry}));
  const before=storage.getItem('deckchek.calibration.v1'),result=readSupportCalibration('Interface A',4096,{storage});
  assert.equal(result.state,'rejected');assert.equal(result.profile,entry);assert.match(result.reasons.join(' '),/non-finite/);
  assert.equal(result.applied,false);assert.equal(storage.getItem('deckchek.calibration.v1'),before);
});
