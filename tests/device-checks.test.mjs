import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDriverCheck,evaluateSoftwareCheck,evaluatePass,compareVersions} from '../app/device-checks.js';

const profile={id:'x',model:'DDJ-X',connectivity:{usb:{classCompliant:false}},
  drivers:[{os:'windows',name:'X driver',asioName:'X ASIO',deviceNamePatterns:['ddj-x'],latestKnownVersion:'1.10.0',required:true}],
  software:[{name:'Serato DJ Pro',minVersion:'3.0'}]};
const dev=o=>({deviceName:'Pioneer DDJ-X',deviceClass:'MEDIA',driverVersion:'1.9.0',isSigned:true,status:'OK',problemCode:0,present:true,...o});
const get=(r,id)=>r.measurements.find(m=>m.metricId===id).value;

test('compareVersions',()=>{
  assert.equal(compareVersions('1.2.9','1.2.10'),-1);
  assert.equal(compareVersions('2.0','2.0.0'),0);
  assert.equal(compareVersions('v3.1','3.0.9'),1);
  assert.equal(compareVersions('abc','1'),null);
});

test('driver healthy but outdated, ASIO registered',()=>{
  const r=evaluateDriverCheck(profile,{supported:true,drivers:[dev()],asioDrivers:[{name:'X ASIO',dllExists:true}]});
  assert.deepEqual([get(r,'driver_present'),get(r,'driver_signed'),get(r,'driver_status_ok'),get(r,'asio_registered')],[1,1,1,1]);
  assert.ok(r.findings.some(f=>f.id==='driver-outdated'));
});
test('driver not found',()=>{
  const r=evaluateDriverCheck(profile,{supported:true,drivers:[dev({deviceName:'Other'})],asioDrivers:[]});
  assert.equal(get(r,'driver_present'),0);
  assert.equal(get(r,'driver_signed'),null);
  assert.equal(get(r,'asio_registered'),0);
  assert.ok(r.findings.some(f=>f.id==='driver-not-found'&&f.severity==='error'));
});
test('unsigned and problem code',()=>{
  const r=evaluateDriverCheck(profile,{supported:true,drivers:[dev({isSigned:false,status:'Error',problemCode:10,driverVersion:'1.10.0'})],asioDrivers:[]});
  assert.equal(get(r,'driver_signed'),0);
  assert.equal(get(r,'driver_status_ok'),0);
  const ids=r.findings.map(f=>f.id);
  assert.ok(ids.includes('driver-unsigned')&&ids.includes('driver-problem')&&!ids.includes('driver-outdated'));
});
test('class-compliant needs no driver; non-windows scan',()=>{
  const cc={...profile,drivers:[],connectivity:{usb:{classCompliant:true}}};
  const r=evaluateDriverCheck(cc,{supported:true,drivers:[],asioDrivers:[]});
  assert.ok(r.findings.some(f=>f.id==='driver-class-compliant'));
  assert.equal(get(r,'driver_present'),null);
  const u=evaluateDriverCheck(profile,{supported:false,drivers:[]});
  assert.equal(get(u,'driver_present'),null);
});

const scan={supported:true,apps:[{app:'Serato DJ Pro',installed:true,files:[
  {kind:'crashDump',path:'a.dmp',matches:[]},{kind:'crashReport',path:'b',matches:[]},
  {kind:'log',path:'l.log',matches:[{severity:'error',line:'e1'},{severity:'warning',line:'w'},{severity:'error',line:'e2'}]}]}]};
test('software check',()=>{
  const r=evaluateSoftwareCheck(profile,'Serato DJ Pro',scan);
  assert.equal(get(r,'software_installed'),1);
  assert.equal(get(r,'software_crashes_90d'),2);
  assert.equal(get(r,'software_log_errors'),2);
  const m=evaluateSoftwareCheck(profile,'Traktor Pro',scan);
  assert.equal(get(m,'software_installed'),0);
  const c=evaluateSoftwareCheck(profile,'Serato DJ Pro',{supported:true,apps:[{app:'Serato DJ Pro',installed:true,files:[]}]});
  assert.equal(get(c,'software_crashes_90d'),0);
  assert.equal(c.findings[0].id,'software-ok');
});

test('evaluatePass ops',()=>{
  const ms=[{metricId:'a',value:-0.4},{metricId:'n',value:null},{metricId:'p',value:100},{metricId:'s',value:'yes'}];
  const ev=(op,value,value2=null,metricId='a')=>evaluatePass({metricId,op,value,value2,unit:'%'},ms).status;
  assert.equal(ev('abs<=',.5),'pass');
  assert.equal(ev('abs<=',.3),'fail');
  assert.equal(ev('<=',-.4),'pass');
  assert.equal(ev('>=',0),'fail');
  assert.equal(ev('between',-1,0),'pass');
  assert.equal(ev('equals',-.4),'pass');
  assert.equal(ev('equals','yes',null,'s'),'pass');
  assert.equal(ev('all-seen',100,null,'p'),'pass');
  assert.equal(ev('<=',1,null,'n'),'unknown');
  assert.equal(ev('<=',1,null,'missing'),'unknown');
  assert.equal(evaluatePass(null,ms).status,'unknown');
});

test('numeric pass criteria require finite numeric evidence and bounds',()=>{
  for(const op of ['abs<=','<=','>=','between','equals','all-seen']){
    const pass={metricId:'a',op,value:0,value2:100};
    for(const value of [NaN,Infinity,-Infinity,'0','',false,[],{},null,undefined]){
      assert.equal(evaluatePass(pass,[{metricId:'a',value}]).status,'unknown',`${op}: ${String(value)}`);
    }
    for(const value of [NaN,Infinity,-Infinity,{},false]){
      assert.equal(evaluatePass({...pass,value},[{metricId:'a',value:0}]).status,'unknown',`${op} invalid bound`);
    }
  }
  for(const value2 of [null,undefined,NaN,Infinity,-Infinity,'100',false]){
    assert.equal(evaluatePass({metricId:'a',op:'between',value:0,value2},[{metricId:'a',value:50}]).status,'unknown');
  }
  assert.equal(evaluatePass({metricId:'a',op:'all-seen'},[{metricId:'a',value:100}]).status,'pass','the documented default remains 100%');
  assert.equal(evaluatePass({metricId:'a',op:'all-seen'},[{metricId:'a',value:99}]).status,'fail');
});

test('the latest unavailable measurement cannot fall back to an earlier passing value',()=>{
  for(const value of [null,undefined,NaN,Infinity]){
    assert.equal(evaluatePass({metricId:'a',op:'equals',value:0},[{metricId:'a',value:0},{metricId:'a',value}]).status,'unknown');
  }
  assert.equal(evaluatePass({metricId:'a',op:'equals',value:0},[{metricId:'a',value:null},{metricId:'a',value:0}]).status,'pass');
});

test('categorical equality keeps exact string evidence without numeric coercion',()=>{
  assert.equal(evaluatePass({metricId:'a',op:'equals',value:'yes'},[{metricId:'a',value:'yes'}]).status,'pass');
  assert.equal(evaluatePass({metricId:'a',op:'equals',value:'yes'},[{metricId:'a',value:'no'}]).status,'fail');
  for(const value of [0,false,[],{},null]) assert.equal(evaluatePass({metricId:'a',op:'equals',value:'0'},[{metricId:'a',value}]).status,'unknown');
});
