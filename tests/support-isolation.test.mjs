import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeSupportAudio, methodGeometry, createSupportIsolationStore, normalizeObservation, observationIssues, compareObservations, createObservation } from '../app/support-isolation.js';
const contract = JSON.parse(fs.readFileSync(new URL('./contracts/support-isolation.json', import.meta.url)));
const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/support-isolation-welch.json', import.meta.url)));
const copy = value => structuredClone(value);
const close = (actual, expected, relative = 1e-9, absolute = 1e-14) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= absolute + relative * Math.abs(expected), `${actual} != ${expected}`);
function samples(fixture) {
  return Float32Array.from({ length: fixture.frames }, (_, i) => fixture.offset + fixture.tones.reduce((sum, [hz, amplitude]) => sum + amplitude * Math.sin(2 * Math.PI * hz * i / fixture.sampleRate), 0));
}
function memory() { const map = new Map(); return { map, get length() { return map.size; }, key: index => [...map.keys()][index] ?? null, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; }
const catalog = { list: async entity => copy({ venue: [contract.observationA.context.venue], setup: [contract.observationA.context.setup], supportConfiguration: [contract.observationA.context.support, contract.observationB.context.support] }[entity]) };
const makeStore = storage => createSupportIsolationStore({ invoke: null, storage, catalog, now: () => '2026-11-18T13:00:00.000Z' });

test('Welch band density and linear powers match independently configured SciPy, including df != 1', () => {
  for (const fixture of reference.cases) {
    const left = samples(fixture), result = analyzeSupportAudio({ left, right: left, sampleRate: fixture.sampleRate });
    for (const key of ['fftSize', 'hop', 'segments', 'analyzedFrames']) assert.equal(result[key], fixture[key], `${fixture.name}: ${key}`);
    assert.deepEqual(result.binIndices, fixture.binIndices); assert.deepEqual(result.overlapHz, fixture.overlapHz);
    result.psdL.forEach((value, i) => close(value, fixture.psd[i]));
    result.segmentPowersL.forEach((value, i) => close(value, fixture.segmentPowers[i])); close(result.pairPower, fixture.power);
    assert.equal(result.uncertainty.status, 'unknown'); assert.equal(result.uncertainty.expanded, null);
    if (fixture.name === 'absolute48k') { close(result.pairPower, .125, 2e-7); assert.equal(result.omittedFrames, 30976); }
    if (fixture.name === 'edge20') close(result.pairPower, .0625, 2e-7);
  }
});
test('anti-phase stereo retains power; scaled copies give the defined signed B-minus-A delta', () => {
  const left = samples(reference.cases[0]), right = Float32Array.from(left, value => -value);
  const a = analyzeSupportAudio({ left, right, sampleRate: 4096 }); close(a.pairPower, .125, 2e-7);
  const b = analyzeSupportAudio({ left: Float32Array.from(left, x => x / 2), right: Float32Array.from(right, x => x / 2), sampleRate: 4096 });
  close(b.levelDbfsPair - a.levelDbfsPair, contract.expectedDeltaDb, 0, 1e-9);
});
test('zero power stays zero with unavailable logarithms and no invented floor', () => {
  const left = new Float32Array(30 * 4096), value = analyzeSupportAudio({ left, right: left, sampleRate: 4096 });
  assert.equal(value.pairPower, 0); assert.equal(value.levelDbfsPair, null);
  const a = copy(contract.observationA), b = copy(contract.observationB); a.analysis = value;
  assert.ok(compareObservations(a, b, contract.comparison).reasons.includes('zero_band_power'));
});
test('coverage is exact at multiple rates, with no padding of a partial final window', () => {
  for (const [rate, size, segments, end] of [[4096,4096,59,122880],[44100,65536,39,1310720],[48000,65536,42,1409024],[96000,131072,42,2818048],[192000,262144,42,5636096]]) {
    const g = methodGeometry(rate, 30 * rate); assert.equal(g.fftSize,size); assert.equal(g.segments,segments); assert.equal(g.analyzedFrames,end);
  }
  assert.throws(() => methodGeometry(262145, 30 * 262145), /unsupported/i);
  assert.throws(() => methodGeometry(48000, 30 * 48000 - 1), /incomplete/i);
});
test('all captured samples and native integrity evidence qualify a comparison, including the omitted suffix', () => {
  const base = contract.observationA, left = samples(reference.cases[0]), extended = new Float32Array(left.length + 100); extended.set(left); extended[extended.length - 1] = 1;
  const result = { audio: { left: extended, right: extended, sampleRate: 4096, channels: 2, pairs: [{ pair: base.capture.pair }], nativeFields: copy(base.capture.nativeFields) }, deviceName: 'Interface A', quality: copy(base.capture.quality), streamErrors: [] };
  result.quality.framesCaptured = extended.length;
  for (const key of ['left', 'right']) result.audio.nativeFields[key].samples = extended.length;
  const observation = createObservation({ ...base, result, captureInfo: base.capture.info });
  assert.ok(observationIssues(observation).includes('clipped_input')); assert.equal(observation.capture.sampleIntegrity.clippedL, 1);
  assert.equal(observation.analysis.analyzedFrames, left.length); close(observation.analysis.pairPower, base.analysis.pairPower);
  for (const change of [row => { row.capture.quality.truncated = true; }, row => { row.capture.quality.overrunSamples = 1; }, row => { row.capture.nativeFields.deviceName.present = false; }, row => { row.capture.info.pairs[0].first = 3; }]) {
    const row = copy(base); change(row); assert.ok(observationIssues(row).length); assert.notEqual(compareObservations(row, contract.observationB, contract.comparison).status, 'operator_reported_comparable');
  }
});
test('comparison rejects changed route, PA, procedure, setup and calibration while preserving original observations', () => {
  const a = copy(contract.observationA), original = JSON.stringify(a);
  for (const mutate of [b => { b.context.conditions.paLevel = 'Master mark 3'; }, b => { b.capture.deviceName = 'Other'; }, b => { b.context.conditions.procedure = 'Other track'; }, b => { b.context.setup.components[0].assetId = 'other'; }, b => { b.calibration.state = 'unavailable'; b.calibration.reasons = ['Storage failed']; }]) {
    const b = copy(contract.observationB); mutate(b); const compared = compareObservations(a,b,contract.comparison); assert.equal(compared.deltaDb.pair, null); assert.ok(compared.reasons.length);
  }
  assert.equal(JSON.stringify(a), original);
  assert.equal(compareObservations(a,contract.observationB,{ ...contract.comparison, sameConditions: false }).deltaDb.pair,null);
});
test('real store saves original A and B, derives comparison, reloads all context and returns copies', async () => {
  const storage=memory(), store=makeStore(storage); const a=await store.saveObservation(contract.observationA); await store.saveObservation(contract.observationB);
  const comparison=await store.saveComparison(contract.comparison); close(comparison.result.deltaDb.pair,contract.expectedDeltaDb,0,1e-9);
  a.context.support.name='mutated'; const reloaded=await makeStore(storage).list({venueId:'venue-a'});
  assert.equal(reloaded.observationTotal,2); assert.equal(reloaded.comparisonTotal,1); assert.equal(reloaded.observations.find(x=>x.id===a.id).context.support.name,'Shelf');
  assert.equal(reloaded.comparisons[0].observationB.context.support.name,'Paver <img src=x>'); assert.equal(reloaded.observations[0].rawAudioRetained,false);
});
test('retry is immutable after context deletion; conflicting IDs, missing references and caller verdicts are rejected', async () => {
  const storage=memory(), store=makeStore(storage); const first=await store.saveObservation(contract.observationA); await store.saveObservation(contract.observationB);
  const unavailable=createSupportIsolationStore({invoke:null,storage,catalog:{list:async()=>{throw new Error('catalog deleted');}}});
  assert.deepEqual(await unavailable.saveObservation(contract.observationA), first);
  await assert.rejects(store.saveObservation({...contract.observationA,finishedAt:'2026-11-18T12:00:31.000Z'}),/conflict/i);
  await assert.rejects(store.saveComparison({...contract.comparison,observationBId:'missing'}),/missing/i);
  await assert.rejects(store.saveComparison({...contract.comparison,deltaDb:-99}),/unsupported/i);
});
test('corrupt history, unavailable storage and quota errors do not claim empty or saved and preserve bytes', async () => {
  const storage=memory(), store=makeStore(storage); await store.saveObservation(contract.observationA); const key=[...storage.map.keys()][0]; storage.map.set(key,'{broken'); const before=[...storage.map];
  await assert.rejects(store.list(),/storage|history|invalid|read/i); await assert.rejects(store.saveObservation(contract.observationB),/storage|history|invalid|read/i); assert.deepEqual([...storage.map],before);
  await assert.rejects(makeStore(null).list(),/storage/i);
  const quota=memory(); quota.setItem=()=>{throw new Error('Quota exceeded');}; await assert.rejects(makeStore(quota).saveObservation(contract.observationA),/Quota/); assert.equal(quota.length,0);
});
test('pending writes freeze submissions before catalog awaits and same-event concurrent retries remain idempotent', async () => {
  let release; const pending=new Promise(resolve=>{release=resolve;}); const storage=memory();
  const store=createSupportIsolationStore({invoke:null,storage,catalog:{list:async entity=>{await pending;return catalog.list(entity);}}});
  const input=copy(contract.observationA), write=store.saveObservation(input); input.context.support.name='late edit'; release(); const saved=await write; assert.equal(saved.context.support.name,'Shelf');
  await Promise.all([store.saveObservation(contract.observationB),store.saveObservation(contract.observationB)]); assert.equal((await store.list()).observationTotal,2);
});
test('strict versioned evidence rejects non-finite, oversized or relabelled method submissions without pruning', () => {
  for (const mutation of [x=>{x.analysis.pairPower=NaN;},x=>{x.analysis.method='broadband-total';},x=>{x.rawAudioRetained=true;},x=>{x.schemaVersion=2;},x=>{x.context.support.notes='x'.repeat(70*1024);},x=>{x.analysis.psdL[0]+=1;}]) {
    const value=copy(contract.observationA); mutation(value); assert.throws(()=>normalizeObservation(value));
  }
});

test('observed scalar types and capture bounds cannot qualify through equality and coercion', () => {
  for (const mutate of [row => { row.capture.channels='2'; row.capture.info.channels='2'; row.capture.nativeFields.channels.value='2'; }, row => { delete row.capture.info.maxSeconds; }, row => { row.capture.info.maxSeconds='35'; }]) {
    const row=copy(contract.observationA);mutate(row);assert.ok(observationIssues(row).length,'invalid observed scalars must be rejected');
  }
});
test('finite positive powers do not produce an infinite delta through ratio overflow', () => {
  const a=copy(contract.observationA),b=copy(contract.observationB);
  for(const [row,factor] of [[a,1e-290],[b,1e290]]) {
    for(const key of ['psdL','psdR','segmentPowersL','segmentPowersR'])row.analysis[key]=row.analysis[key].map(value=>value*factor);
    for(const key of ['powerL','powerR','pairPower'])row.analysis[key]*=factor;
    for(const [suffix,key] of [['L','powerL'],['R','powerR'],['Pair','pairPower']])row.analysis[`levelDbfs${suffix}`]=10*Math.log10(row.analysis[key]);
  }
  const result=compareObservations(a,b,contract.comparison);assert.ok(Number.isFinite(result.deltaDb.pair));close(result.deltaDb.pair,b.analysis.levelDbfsPair-a.analysis.levelDbfsPair);
});
test('native responses reject duplicate IDs before reporting history', async () => {
  const a={...copy(contract.observationA),recordedAt:'2026-11-18T13:00:00.000Z',contextIssues:[]};
  const duplicate=createSupportIsolationStore({invoke:async()=>({observations:[a,a],comparisons:[],observationTotal:2,comparisonTotal:0,limit:50})});
  await assert.rejects(duplicate.list(),/duplicate/i);
});
test('native responses reject a forged saved comparison before reporting success', async () => {
  const a={...copy(contract.observationA),recordedAt:'2026-11-18T13:00:00.000Z',contextIssues:[]},b={...copy(contract.observationB),recordedAt:'2026-11-18T13:00:00.000Z',contextIssues:[]};
  const forged={...contract.comparison,pairId:a.pairId,venueId:a.venueId,setupId:a.setupId,recordedAt:a.recordedAt,result:compareObservations(a,b,contract.comparison)};forged.result.deltaDb.pair=99;
  const native=createSupportIsolationStore({invoke:async(command,args)=>command==='support_isolation_observation_get'?(args.id===a.id?a:b):forged});
  await assert.rejects(native.saveComparison(contract.comparison),/disagrees|delta/i);
});

test('same-ID catalog physical changes retain original evidence with a context issue at first save', async () => {
  for(const mutate of [rows=>{rows.supportConfiguration[0].structureJson='[{"newLayer":"foam"}]';},rows=>{rows.supportConfiguration[0].coupledState='changed';},rows=>{rows.supportConfiguration[0].approximateMassKg=12;},rows=>{rows.setup[0].components[0].assetId='replacement';},rows=>{rows.setup[0].components[0].settingsSnapshotId='new-settings';}]) {
    const rows={venue:[copy(contract.observationA.context.venue)],setup:[copy(contract.observationA.context.setup)],supportConfiguration:[copy(contract.observationA.context.support)]};mutate(rows);
    const store=createSupportIsolationStore({invoke:null,storage:memory(),catalog:{list:async entity=>copy(rows[entity])}});
    const row=await store.saveObservation(contract.observationA);assert.deepEqual(row.context,contract.observationA.context);assert.deepEqual(row.contextIssues,['catalog_context_changed']);
  }
});
test('algebraic consistency preserves exact zero instead of accepting invented tiny positive power',()=>{
  const row=copy(contract.observationA);for(const key of ['psdL','psdR','segmentPowersL','segmentPowersR'])row.analysis[key].fill(0);
  for(const key of ['powerL','powerR','pairPower'])row.analysis[key]=1e-15;
  for(const key of ['levelDbfsL','levelDbfsR','levelDbfsPair'])row.analysis[key]=-150;
  assert.throws(()=>normalizeObservation(row),/power.*disagrees|inconsistent/i);
});
test('malformed observed quality and calibration identities remain rejection evidence rather than throwing',()=>{
  const a=copy(contract.observationA);a.capture.quality.pairs=[null];assert.ok(observationIssues(a).includes('capture_integrity_missing'));
  const b=copy(contract.observationB);b.calibration={state:'available',applied:false,sourceKey:'x',reasons:[],profile:{version:1,deviceName:12,sampleRate:4096,valid:true,issues:[],gainDb:{left:0,right:0},uncertainty:{},mismatchDb:0,clockPpm:0,latencyMs:0}};
  assert.ok(observationIssues(b).includes('calibration_context_unavailable'));
});
test('equal-time browser history uses Unicode scalar ordering like native SQLite',async()=>{
  const store=makeStore(memory());for(const id of ['ä','z'])await store.saveObservation({...copy(contract.observationA),id});
  assert.deepEqual((await store.list()).observations.map(row=>row.id),['ä','z']);
});

test('non-finite captured suffix remains saved rejection evidence and callback gaps add no invented threshold',async()=>{
  const base=contract.observationA,left=samples(reference.cases[0]),extended=new Float32Array(left.length+100);extended.set(left);extended[extended.length-1]=NaN;
  const result={audio:{left:extended,right:extended,sampleRate:4096,channels:2,pairs:[{pair:base.capture.pair}],nativeFields:copy(base.capture.nativeFields)},deviceName:'Interface A',quality:copy(base.capture.quality),streamErrors:[]};
  result.quality.framesCaptured=extended.length;for(const key of ['left','right'])result.audio.nativeFields[key].samples=extended.length;
  const observation=createObservation({...base,result,captureInfo:base.capture.info});assert.equal(observation.analysis,null);
  assert.match(observation.analysisError,/non-finite/);assert.equal(observation.capture.framesL,extended.length);assert.equal(observation.capture.sampleIntegrity.nonFiniteL,1);
  assert.ok(observationIssues(observation).includes('non_finite_samples'));const saved=await makeStore(memory()).saveObservation(observation);assert.deepEqual(saved.capture,observation.capture);
  const clean=copy(base);clean.capture.quality.maxCallbackGapMs=125;assert.deepEqual(observationIssues(clean),[]);
  for(const key of ['framesCaptured','overrunSamples','streamErrors','callbackCount']){const missing=copy(base);delete missing.capture.quality[key];assert.ok(observationIssues(missing).includes('capture_integrity_missing'));}
});

test('unobservable browser key enumeration cannot become an empty or successfully appended history',async()=>{
  for(const value of [undefined,-1,NaN,'0']){
    let writes=0;const storage={length:value,key:()=>null,getItem:()=>null,setItem:()=>{writes++;}};
    const store=makeStore(storage);await assert.rejects(store.list(),/storage|enumerat/i);await assert.rejects(store.saveObservation(contract.observationA),/storage|enumerat/i);assert.equal(writes,0);
  }
  const storage={length:1,key:()=>null,getItem:()=>null,setItem:()=>{throw new Error('Unexpected write');}};
  await assert.rejects(makeStore(storage).list(),/storage|enumerat/i);
});

test('native history rejects inconsistent immutable originals repeated inside a comparison',async()=>{
  const store=makeStore(memory());await store.saveObservation(contract.observationA);await store.saveObservation(contract.observationB);await store.saveComparison(contract.comparison);
  const history=await store.list();history.comparisons[0].observationA.context.support.name='Contradictory historical name';
  const native=createSupportIsolationStore({invoke:async()=>history});await assert.rejects(native.list(),/original|snapshot|disagree/i);
});
