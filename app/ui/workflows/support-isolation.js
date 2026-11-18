// Passive support observations; the only acquired resource is this workflow's
// owned input lease. Physical test/PA conditions are operator declarations.
import { h } from '../dom.js';
import { startLiveSession, listInputDevices, liveAvailable } from '../audio-io.js';
import { runWithCapture, confirmCaptureBusy } from '../capture-busy.js';
import { readSupportCalibration } from '../state.js';
import { createCatalogStore } from '../../catalog-store.js';
import { createSupportIsolationStore, createObservation, observationIssues, SUPPORT_HISTORY_LIMIT } from '../../support-isolation.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const message=error=>error?.message||String(error);
const fmt=value=>Number.isFinite(value)?value.toFixed(3):'Unavailable';
async function ownedCapture({signal,...options}) {
  return runWithCapture(()=>signal.aborted?Promise.reject(new Error('Capture cancelled')):startLiveSession(options),{
    action:'record the support observation',confirm:async(busy,settings)=>(await confirmCaptureBusy(busy,settings))&&!signal.aborted,
  });
}

/** Stateful capture/write owner with injectable I/O. Writes already dispatched
 * retain their submission while hidden; no cancelled capture dispatches a save. */
export function createSupportCapture({store,capture=ownedCapture,calibrationFor=readSupportCalibration,now=()=>new Date().toISOString(),
  clock=()=>performance.now(),newId=()=>globalThis.crypto.randomUUID(),timers=globalThis,onChange=()=>{}}) {
  let active=true,disposed=false,generation=0,work=null,timer=null,pending=null,pairId=null;
  let state={phase:'ready',a:null,b:null,comparison:null,lastObservation:null,error:null,elapsed:0};
  const visible=()=>active&&!disposed,current=mine=>generation===mine&&!disposed;
  const snapshot=()=>copy({...state,pending:pending?{kind:pending.kind,error:pending.error}:null});
  const emit=()=>{if(visible())onChange(snapshot());};
  const set=patch=>{state={...state,...patch};emit();};
  const clearTimer=()=>{if(timer!==null)timers.clearInterval(timer);timer=null;};
  const writing=()=>['saving-observation','saving-comparison'].includes(state.phase);
  function cancel(reason='Capture cancelled. Saved observations remain in history.') {
    if(writing()||pending)return false;
    generation++;clearTimer();const owned=work;work=null;owned?.abort.abort();
    if(owned?.session)Promise.resolve(owned.session.cancel()).catch(()=>{});
    set({phase:state.b?'review':'ready',error:reason,elapsed:0});return true;
  }
  async function savePending() {
    if(!visible()||!pending||writing())return;
    const savedWork=pending,mine=generation;set({phase:savedWork.kind==='observation'?'saving-observation':'saving-comparison',error:null});
    try {
      const row=await (savedWork.kind==='observation'?store.saveObservation(savedWork.input):store.saveComparison(savedWork.input));
      if(!current(mine)||pending!==savedWork)return;
      pending=null;
      if(savedWork.kind==='comparison'){set({phase:'saved',comparison:copy(row),error:null});return;}
      const issues=observationIssues(row),patch={lastObservation:copy(row),phase:'ready',error:issues.length?`Observation saved with issues: ${issues.join('; ')}. Repeat this capture to compare.`:null};
      if(!issues.length){patch[row.stage.toLowerCase()]=copy(row);if(row.stage==='B')patch.phase='review';}
      set(patch);
    }catch(error){if(current(mine)&&pending===savedWork){savedWork.error=message(error);set({phase:'save-error',error:`Could not confirm this ${savedWork.kind} was saved: ${message(error)}`});}}
  }
  async function finish() {
    const owned=work,mine=generation;if(!visible()||state.phase!=='recording'||!owned?.session||owned.finishing)return;
    owned.finishing=true;clearTimer();set({phase:'analysing'});
    try {
      const result=await owned.session.stop();if(!current(mine)||!active)return;
      const endCalibration=copy(await calibrationFor(result.deviceName,result.audio?.sampleRate));if(!current(mine)||!active)return;
      // An edited profile during acquisition cannot silently become the start
      // profile. Preserve both observations and reject this attempt's context.
      let calibration=owned.calibration;
      if(JSON.stringify(calibration)!==JSON.stringify(endCalibration))calibration={state:'unavailable',sourceKey:calibration?.sourceKey??null,
        profile:{atStart:calibration,atEnd:endCalibration},reasons:['Calibration context changed during capture'],applied:false};
      const input=createObservation({...owned.input,finishedAt:now(),result,captureInfo:owned.info,calibration});
      work=null;pending={kind:'observation',input,error:null};state.phase='ready';await savePending();
    }catch(error){if(current(mine)){work=null;set({phase:'ready',error:message(error),elapsed:0});}}
  }
  async function record({context,deviceName,pairs}) {
    if(!visible()||pending||!['ready'].includes(state.phase)||state.b)return;
    const mine=++generation,stage=state.a?'B':'A';
    try {
      context=copy(context);
      if(!context.venue?.id||!context.setup?.id||context.setup.venueId!==context.venue.id||!context.support?.id)throw new Error('Choose a venue, its setup and the support used for this capture.');
      if(context.support.deckPositionId&&context.support.deckPositionId!==context.setup.deckPositionId)throw new Error('This support is bound to another deck position.');
      for(const key of ['route','gainSettings','procedure','source','placement','paState','paLevel'])if(typeof context.conditions?.[key]!=='string'||!context.conditions[key].trim())throw new Error(`Record ${key} before capture.`);
      if(!context.conditions.stationaryConfirmed)throw new Error('Confirm that the stationary test condition is ready.');
      if(new TextEncoder().encode(JSON.stringify(context)).length>32*1024)throw new Error('The selected context exceeds the capture preflight bound (32 KiB). No evidence was trimmed.');
      if(!deviceName||!Array.isArray(pairs)||pairs.length!==1)throw new Error('Choose an explicit input and one stereo pair.');
      if(state.a&&(state.a.venueId!==context.venue.id||state.a.setupId!==context.setup.id))throw new Error('Start a new pair to change the venue or setup. Observation A remains saved.');
      pairId??=newId();
      const owned={abort:new AbortController(),session:null,info:null,finishing:false,frames:0,startedClock:clock(),
        input:{id:newId(),pairId,stage,venueId:context.venue.id,setupId:context.setup.id,context,capturedAt:now()}};work=owned;
      set({phase:'opening',error:null,elapsed:0});
      const session=await capture({signal:owned.abort.signal,deviceName,pairs:copy(pairs),maxSeconds:35,
        onPreempted:()=>{if(current(mine))cancel('Another feature took over the input. Saved observations remain; repeat this capture.');},
        onStatus:status=>{
          if(!current(mine)||owned.finishing)return;
          if(status?.running===false){cancel('Input stopped before completion. Repeat this capture.');return;}
          if(Number.isSafeInteger(status?.quality?.framesCaptured))owned.frames=status.quality.framesCaptured;
          if(owned.info&&state.phase==='recording'){
            set({elapsed:Math.min(30,owned.frames/owned.info.sampleRate)});
            if(owned.frames>=30*owned.info.sampleRate)void finish();
          }
        },
      });
      if(!current(mine)||!active){await session.cancel();return;}
      owned.session=session;owned.info=copy(session.info??null);owned.startedClock=clock();
      const info=owned.info;
      if(!info||typeof info.deviceName!=='string'||['input','Unnamed audio input'].includes(info.deviceName)||!info.deviceName.trim()||!Number.isSafeInteger(info.sampleRate)||info.sampleRate<=400||!Number.isInteger(info.channels)||info.channels<2||info.pairs?.length!==1||info.pairs[0]?.mono!==false||!Number.isFinite(info.maxSeconds)||info.maxSeconds<30)throw new Error('Actual input, rate, stereo pair or capture bound is unavailable.');
      owned.calibration=copy(await calibrationFor(info.deviceName,info.sampleRate));if(!current(mine)||!active){await session.cancel();return;}
      if(new TextEncoder().encode(JSON.stringify(owned.calibration)).length>8*1024)throw new Error('Calibration context exceeds the capture preflight bound (8 KiB); no evidence was trimmed.');
      set({phase:'recording'});
      timer=timers.setInterval(()=>{if(current(mine)&&!owned.finishing&&clock()-owned.startedClock>=35000)void finish();},100);
      if(owned.frames>=30*info.sampleRate)void finish();
    }catch(error){if(current(mine)){clearTimer();const owned=work;work=null;owned?.abort.abort();if(owned?.session)await owned.session.cancel();set({phase:'ready',error:message(error),elapsed:0});}}
  }
  async function compare(sameConditions) {
    if(!visible()||pending||state.phase!=='review'||!state.a||!state.b)return;
    pending={kind:'comparison',input:{schemaVersion:1,id:newId(),observationAId:state.a.id,observationBId:state.b.id,createdAt:now(),sameConditions:sameConditions===true},error:null};
    await savePending();
  }
  function reset(){if(writing()||pending||['opening','recording','analysing'].includes(state.phase))return false;generation++;pairId=null;state={phase:'ready',a:null,b:null,comparison:null,lastObservation:null,error:null,elapsed:0};emit();return true;}
  return {snapshot,record,compare,retry:savePending,reset,cancel,
    setActive(value){active=Boolean(value);if(!active&&['opening','recording','analysing'].includes(state.phase))cancel();if(active)emit();},
    dispose(){if(disposed)return;active=false;cancel();disposed=true;clearTimer();},
  };
}

export function createSupportIsolationPanel(host,{catalog=createCatalogStore(),store=createSupportIsolationStore({catalog}),available=liveAvailable,inputs=listInputDevices,...options}={}) {
  let active=true,disposed=false,catalogGeneration=0,historyGeneration=0,loaded=false,catalogError=null,historyError=null,history=null,loadingHistory=false;
  let venues=[],setups=[],supports=[],devices=[],lastSaved=null,lastObservationSeen=null;
  const fields={},select=(id,change)=>fields[id]=h('select',{id:`support-ab-${id}`,onchange:change});
  const venue=select('venue',()=>{if(!visible())return;runner.reset();renderSelections();loadHistory();});
  const setup=select('setup',()=>{if(!visible())return;runner.reset();renderSupports();});
  const supportA=select('a'),supportB=select('b'),device=select('device',renderPairs),pair=select('pair');
  const label=(name,control)=>h('div',{class:'field'},h('label',{class:'field-label',for:control.id,text:name}),control);
  const contextFields=[['route','Physical input route'],['gainSettings','Gain, EQ and filter settings'],['procedure','Stationary test procedure'],['source','Test medium / source'],['placement','Deck and monitor placement'],['paLevel','PA level marker (or Off)']];
  for(const [key]of contextFields)fields[key]=h('input',{id:`support-ab-${key}`,type:'text',maxlength:2000});
  const paState=select('paState');paState.append(h('option',{value:'off',text:'PA off'}),h('option',{value:'fixed',text:'Fixed operator-controlled PA level'}));
  fields.stationary=h('input',{id:'support-ab-stationary',type:'checkbox'});fields.confirm=h('input',{id:'support-ab-confirm',type:'checkbox'});
  const catalogStatus=h('div',{id:'support-ab-catalog-status'}),status=h('div',{id:'support-ab-status','aria-live':'polite'}),historyBox=h('div',{id:'support-ab-history'});
  const record=h('button',{id:'support-ab-record',type:'button',class:'btn btn-primary',text:'Capture A',onclick:()=>{
    if(!visible()||!loaded||!available())return;const s=runner.snapshot(),selectedSetup=setups.find(x=>x.id===setup.value),conditions=Object.fromEntries(contextFields.map(([key])=>[key,fields[key].value]));
    conditions.paState=paState.value;conditions.stationaryConfirmed=fields.stationary.checked===true;
    void runner.record({deviceName:device.value,pairs:[Number(pair.value)],context:{venue:venues.find(x=>x.id===venue.value),setup:selectedSetup,support:supports.find(x=>x.id===(s.a?supportB.value:supportA.value)),conditions}});
  }});
  const compare=h('button',{id:'support-ab-compare',type:'button',class:'btn btn-primary',text:'Save comparison',onclick:()=>void runner.compare(fields.confirm.checked)});
  const retry=h('button',{id:'support-ab-retry',type:'button',class:'btn btn-secondary',text:'Retry this unchanged save',onclick:()=>void runner.retry()});
  const cancel=h('button',{id:'support-ab-cancel',type:'button',class:'btn btn-secondary',text:'Cancel capture',onclick:()=>runner.cancel()});
  const fresh=h('button',{id:'support-ab-new',type:'button',class:'btn btn-secondary',text:'Start a new pair',onclick:()=>runner.reset()});
  const runner=createSupportCapture({store,...options,onChange:state=>{
    if(!visible())return;
    if(state.lastObservation?.id&&state.lastObservation.id!==lastObservationSeen){lastObservationSeen=state.lastObservation.id;fields.stationary.checked=false;fields.confirm.checked=false;}
    renderState(state);const id=state.comparison?.id??state.lastObservation?.id;
    if(id&&id!==lastSaved){lastSaved=id;loadHistory();}
  }});
  host.replaceChildren(h('section',{class:'card'},h('h2',{class:'card-title',text:'Support A/B observations'}),
    h('p',{text:'Repeat the same stationary test before and after changing only the support. DeckChek records the input; the PA remains under your control. A saved support description records the configuration you say you used.'}),
    h('p',{class:'muted',text:'20–200 Hz mean channel power from complete Welch windows in the first 30 seconds. Exact analyzed coverage and all capture quality are retained. Digital dBFS RMS is a proxy; uncertainty is unknown. No raw audio is archived.'}),
    catalogStatus,h('div',{class:'field-grid'},label('Venue',venue),label('Setup',setup),label('Support A',supportA),label('Support B',supportB),label('Input',device),label('Stereo input pair',pair),
      ...contextFields.map(([key,name])=>label(name,fields[key])),label('PA state',paState)),
    label('The stationary test condition is ready',fields.stationary),
    h('p',{class:'muted',text:'After A is saved, install support B, restore the same placement, medium, gain and PA settings, then capture B. Any changed condition must be recorded; it can make the pair non-comparable.'}),
    label('Apart from the declared support change, I repeated the same physical test and PA conditions',fields.confirm),
    h('div',{class:'form-actions'},record,compare,retry,cancel,fresh),status,
    h('p',{class:'muted small',text:store.native?'Saved observations and comparisons are included in the local database backup.':'History stays in this browser. Data → Browser venue history file exports and imports all retained incident and support history. Workspace JSON does not include incidents or support history. All-venue history can show imported records without current catalog entries; venue reports require a matching current venue.'}),
    h('h3',{text:'Saved observations and comparisons'}),historyBox));
  function visible(){return active&&!disposed;}
  function renderPairs(){const previous=pair.value,list=devices.find(x=>x.id===device.value)?.pairs||[];pair.replaceChildren(h('option',{value:'',text:'Choose a stereo pair'}),...list.filter(p=>!p.mono).map(p=>h('option',{value:String(p.first),text:p.label})));if(list.some(p=>String(p.first)===previous&&!p.mono))pair.value=previous;renderState();}
  function renderSupports(){const selected=setups.find(x=>x.id===setup.value),eligible=supports.filter(x=>!x.deckPositionId||x.deckPositionId===selected?.deckPositionId);
    for(const control of [supportA,supportB]){const previous=control.value;control.replaceChildren(h('option',{value:'',text:'Choose a support description'}),...eligible.map(x=>h('option',{value:x.id,text:x.name})));control.value=eligible.some(x=>x.id===previous)?previous:control===supportA?(selected?.supportConfigurationId??''):'';}renderState();}
  function renderSelections(){const previous=setup.value,matching=setups.filter(x=>x.venueId===venue.value);setup.replaceChildren(h('option',{value:'',text:'Choose a setup'}),...matching.map(x=>h('option',{value:x.id,text:x.name})));setup.value=matching.some(x=>x.id===previous)?previous:'';renderSupports();}
  function renderState(state=runner.snapshot()){
    if(!visible())return;const busy=['opening','recording','analysing','saving-observation','saving-comparison'].includes(state.phase);
    for(const control of Object.values(fields))control.disabled=!loaded||busy;
    record.textContent=state.a?'Capture B':'Capture A';record.disabled=!loaded||!available()||busy||Boolean(state.pending)||Boolean(state.b);record.hidden=Boolean(state.b);
    compare.hidden=state.phase!=='review';compare.disabled=busy;retry.hidden=!state.pending?.error;retry.disabled=busy;cancel.hidden=!['opening','recording','analysing'].includes(state.phase);fresh.disabled=busy||Boolean(state.pending);
    status.replaceChildren();
    if(!available())status.append(h('p',{text:'Capturing support observations requires the desktop app. Saved history remains available.'}));
    if(state.error)status.append(h('p',{role:'alert',text:state.error}));
    if(busy)status.append(h('p',{role:'status',text:state.phase==='recording'?`Recording ${state.a?'B':'A'}: ${state.elapsed.toFixed(1)} / 30 s of reported frames`:`${state.phase.replaceAll('-',' ')}…`}));
    if(state.lastObservation){const row=state.lastObservation,a=row.analysis;status.append(h('p',{text:`Saved observation ${row.stage} (${row.id}) for ${row.context.venue.name} / ${row.context.setup.name}: ${row.context.support.name}. ${a?`${fmt(a.levelDbfsPair)} dBFS RMS; ${fmt(a.analyzedFrames/a.sampleRate)} s analyzed of ${fmt(a.capturedFrames/a.sampleRate)} s captured; ${a.omittedFrames} captured frames outside analysis.`:row.analysisError}`}));}
    if(state.a&&!state.b&&!busy)status.append(h('p',{text:'A is saved. Change only the declared support and repeat the same test for B.'}));
    if(state.comparison){const result=state.comparison.result;status.append(h('p',{text:result.status==='operator_reported_comparable'?`Saved change B − A: ${fmt(result.deltaDb.pair)} dB. Negative means lower recorded power in B. Operator-reported matching conditions; uncertainty unknown.`:`Saved as not comparable: ${result.reasons.join('; ')}. Original observations remain available.`}));}
  }
  async function loadCatalog(){const mine=++catalogGeneration;loaded=false;catalogError=null;if(visible()){catalogStatus.replaceChildren(h('p',{text:'Loading venues, setups, supports and inputs…'}));renderState();}
    try{const [v,s,p,d]=await Promise.all([catalog.list('venue'),catalog.list('setup'),catalog.list('supportConfiguration'),inputs()]);if(!visible()||mine!==catalogGeneration)return;
      if(![v,s,p,d?.devices].every(Array.isArray))throw new Error('Catalog or input list returned invalid records');venues=copy(v);setups=copy(s);supports=copy(p);devices=copy(d.devices);loaded=true;
      const selectedVenue=venue.value,selectedDevice=device.value;venue.replaceChildren(h('option',{value:'',text:'Choose a venue · all history'}),...venues.map(x=>h('option',{value:x.id,text:x.name})));venue.value=venues.some(x=>x.id===selectedVenue)?selectedVenue:'';
      device.replaceChildren(h('option',{value:'',text:'Choose an explicit input'}),...devices.map(x=>h('option',{value:x.id,text:x.name})));device.value=devices.some(x=>x.id===selectedDevice)?selectedDevice:'';
      catalogStatus.replaceChildren();renderSelections();renderPairs();
    }catch(error){if(!visible()||mine!==catalogGeneration)return;catalogError=message(error);catalogStatus.replaceChildren(h('p',{role:'alert',text:`Could not load capture context: ${catalogError}`}),h('button',{id:'support-ab-catalog-retry',type:'button',text:'Retry context load',onclick:loadCatalog}));renderState();}
  }
  function renderHistory(){if(!visible())return;historyBox.replaceChildren();if(loadingHistory)historyBox.append(h('p',{text:'Loading saved support observations…'}));
    if(historyError){historyBox.append(h('p',{role:'alert',text:`Could not load support history: ${historyError}`}),h('button',{id:'support-ab-history-retry',type:'button',text:'Retry history',onclick:loadHistory}));return;}
    if(!history)return;
    historyBox.append(h('p',{class:'muted small',text:`Showing ${history.observations.length} of ${history.observationTotal} observations and ${history.comparisons.length} of ${history.comparisonTotal} comparisons; newest first, limit ${history.limit} each. Older records remain stored.`}));
    if(!history.observationTotal)historyBox.append(h('p',{text:'No support observations saved for this selection.'}));
    for(const row of history.comparisons){const r=row.result;historyBox.append(h('p',{text:`${row.observationA.context.support.name} → ${row.observationB.context.support.name}: ${r.status==='operator_reported_comparable'?`${fmt(r.deltaDb.pair)} dB (B − A); uncertainty unknown`:`not comparable — ${r.reasons.join('; ')}`}`}));}
    for(const row of history.observations){const issues=observationIssues(row);historyBox.append(h('details',{},h('summary',{text:`${row.stage}: ${row.context.support.name} · ${row.capturedAt}`}),h('p',{text:`${row.analysis?`${fmt(row.analysis.levelDbfsPair)} dBFS RMS; ${fmt(row.analysis.analyzedFrames/row.analysis.sampleRate)} s analyzed`:'Analysis unavailable'}. ${issues.length?issues.join('; '):'Capture evidence meets method checks'}. ${row.context.conditions.route}. Saved ${row.recordedAt}. No raw audio retained.`})));}
  }
  async function loadHistory(){const mine=++historyGeneration,venueId=venue.value||null;loadingHistory=true;historyError=null;history=null;renderHistory();
    try{const result=await store.list({venueId,limit:SUPPORT_HISTORY_LIMIT});if(!visible()||mine!==historyGeneration)return;history=copy(result);loadingHistory=false;renderHistory();}
    catch(error){if(!visible()||mine!==historyGeneration)return;loadingHistory=false;historyError=message(error);renderHistory();}}
  loadCatalog();loadHistory();renderState();
  return {runner,setActive(value){active=Boolean(value);catalogGeneration++;historyGeneration++;if(active){fields.stationary.checked=false;fields.confirm.checked=false;}runner.setActive(active);if(active){loadCatalog();loadHistory();renderState();}},
    dispose(){if(disposed)return;active=false;disposed=true;catalogGeneration++;historyGeneration++;runner.dispose();},cancel:()=>runner.cancel()};
}
