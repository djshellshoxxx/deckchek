// Pure evaluators for driver:check, software:check and pass-criteria evaluation.
import {normalizeMeasurement} from './core.js';

const M=(metricId,label,value,unit='bool')=>normalizeMeasurement({metricId,label,value,unit,origin:'scan'});
const F=(id,severity,title,meaning,action,evidence=[])=>({id,severity,title,meaning,action,evidence});
const has=(hay,needle)=>String(hay||'').toLowerCase().includes(String(needle).toLowerCase());

/** Compare dotted versions numerically ("1.2.10" > "1.2.9"); non-numeric parts ignored. Returns -1/0/1, or null if unparsable. */
export function compareVersions(a,b){
  const p=v=>{const m=String(v??'').match(/\d+(\.\d+)*/);return m?m[0].split('.').map(Number):null;};
  const x=p(a),y=p(b);if(!x||!y)return null;
  for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d<0?-1:1;}
  return 0;
}

export function evaluateDriverCheck(profile,driverScan){
  const findings=[],drivers=(profile?.drivers||[]).filter(d=>!d.os||d.os==='windows');
  const classCompliant=!!profile?.connectivity?.usb?.classCompliant;
  const name=profile?.model||profile?.id||'device';
  if(!driverScan||driverScan.supported===false){
    return {measurements:[M('driver_present',null,null),M('driver_signed',null,null),M('driver_status_ok',null,null),M('asio_registered',null,null)].map(x=>({...x,label:x.metricId})),
      findings:[F('driver-unsupported','info','Driver scan not available','Driver scans only run on Windows.','Run the check on a Windows PC.')]};
  }
  const patterns=drivers.flatMap(d=>d.deviceNamePatterns||[]);
  const scanned=driverScan.drivers||[],asio=driverScan.asioDrivers||[];
  const matched=scanned.filter(d=>patterns.some(p=>has(d.deviceName,p)||has(d.hardwareId,p)));
  const present=matched.filter(d=>d.present!==false);
  const asioMatched=asio.filter(a=>patterns.some(p=>has(a.name,p))||drivers.some(d=>d.asioName&&has(a.name,d.asioName)));
  const requiresAsio=drivers.some(d=>d.asioName);
  let dPresent=null,dSigned=null,dOk=null,dAsio=null;
  if(!drivers.length){
    if(classCompliant)findings.push(F('driver-class-compliant','ok','No driver needed','This device is USB class-compliant, so Windows uses its built-in audio driver.','Nothing to install.'));
    else findings.push(F('driver-no-profile','info','No driver information for this device','The profile lists no driver to check.','Check the manufacturer website.'));
  }else{
    dPresent=present.length?1:0;
    if(!present.length){
      const req=drivers.some(d=>d.required);
      if(classCompliant&&!req)findings.push(F('driver-class-compliant','info','No vendor driver found (not required)','This device is class-compliant and works with the Windows built-in driver.','Install the vendor driver only if you need ASIO or low latency.'));
      else findings.push(F('driver-not-found',req?'error':'warning','Driver not found',`No device matching ${patterns.map(p=>`"${p}"`).join(', ')} was found in the scan. The unit may be unplugged, powered off, or its driver not installed.`,'Connect and power the device, then install the manufacturer driver.'));
      if(!present.length&&matched.length)findings[findings.length-1].evidence=matched.map(d=>d.deviceName);
    }else{
      const signs=present.map(d=>d.isSigned);
      dSigned=signs.some(s=>s===false)?0:signs.every(s=>s===true)?1:null;
      if(dSigned===0)findings.push(F('driver-unsigned','warning','Driver is not signed','Windows may block or flag unsigned drivers, and they can crash the audio stack.','Reinstall the latest driver from the manufacturer.',present.filter(d=>d.isSigned===false).map(d=>d.deviceName)));
      const prob=present.filter(d=>(d.problemCode||0)>0||d.status==='Error'||d.status==='Degraded');
      dOk=prob.length?0:present.every(d=>d.status==='OK')?1:null;
      for(const d of prob)findings.push(F('driver-problem','error',`Driver problem on ${d.deviceName}${d.problemCode?` (code ${d.problemCode})`:''}`,'Device Manager reports a fault with this device.','Reconnect it on another USB port, reinstall the driver, and check Device Manager for details.',[`status: ${d.status}`]));
      const latest=drivers.map(d=>d.latestKnownVersion).filter(Boolean)[0];
      if(latest)for(const d of present){const c=compareVersions(d.driverVersion,latest);if(c===-1)findings.push(F('driver-outdated','warning',`Driver ${d.driverVersion} is older than ${latest}`,'A newer driver is known; fixes for crashes and latency are common in updates.','Download the latest driver from the manufacturer.',[d.deviceName]));}
    }
    if(requiresAsio||asioMatched.length){
      dAsio=asioMatched.length?1:0;
      if(!asioMatched.length)findings.push(F('asio-missing','warning','ASIO driver not registered','DJ software cannot use low-latency ASIO output for this device without it.','Install the manufacturer ASIO driver (or a generic one such as ASIO4ALL).'));
      else if(asioMatched.some(a=>a.dllExists===false))findings.push(F('asio-dll-missing','error','ASIO driver file is missing','The ASIO entry is registered but its DLL no longer exists.','Reinstall the driver.',asioMatched.map(a=>a.name)));
    }
  }
  const measurements=[M('driver_present','Driver present',dPresent),M('driver_signed','Driver signed',dSigned),M('driver_status_ok','Driver status OK',dOk),M('asio_registered','ASIO registered',dAsio)];
  if(findings.length===0)findings.push(F('driver-ok','ok','Driver looks healthy',`${name} driver is installed, signed and reporting OK.`,'No action needed.'));
  return {measurements,findings};
}

export function evaluateSoftwareCheck(profile,softwareName,djLogScan){
  const findings=[];
  const nullM=()=>[M('software_installed','Software installed',null),M('software_crashes_90d','Crash evidence (90 days)',null,'count'),M('software_log_errors','Log errors',null,'count')];
  if(!djLogScan||djLogScan.supported===false)return {measurements:nullM(),findings:[F('software-unsupported','info','Software scan not available','DJ log scans only run on Windows.','Run the check on a Windows PC.')]};
  const want=softwareName||profile?.software?.[0]?.name;
  const app=(djLogScan.apps||[]).find(a=>has(a.app,want)||has(want,a.app));
  if(!app||!app.installed){
    findings.push(F('software-missing','warning',`${want||'DJ software'} not found`,'The scan found no install of this program.','Install it, or check the correct software name.'));
    return {measurements:[M('software_installed','Software installed',0),M('software_crashes_90d','Crash evidence (90 days)',0,'count'),M('software_log_errors','Log errors',0,'count')],findings};
  }
  const files=app.files||[];
  const crashFiles=files.filter(f=>f.kind==='crashDump'||f.kind==='crashReport');
  const crashLines=files.flatMap(f=>(f.matches||[]).filter(m=>m.severity==='crash'));
  const crashes=crashFiles.length+(crashFiles.length?0:crashLines.length?1:0);
  const errors=files.reduce((s,f)=>s+(f.kind==='log'?(f.matches||[]).filter(m=>m.severity==='error').length:0),0);
  if(crashes>0)findings.push(F('software-crashes',crashes>=3?'error':'warning',`${app.app} crash evidence found (${crashes})`,'Crash dumps or crash reports exist from the last 90 days, often caused by audio driver or plugin problems.','Update the software and audio driver, and check which module is faulting.',crashFiles.slice(0,5).map(f=>f.path)));
  if(errors>0)findings.push(F('software-log-errors',errors>20?'warning':'info',`${errors} error line${errors>1?'s':''} in ${app.app} logs`,'The program logged errors; audio device or timecode messages are the most relevant.','Review the log excerpts.',files.flatMap(f=>(f.matches||[]).filter(m=>m.severity==='error')).slice(0,5).map(m=>m.line)));
  const need=(profile?.software||[]).find(s=>has(s.name,want)||has(want,s.name));
  if(need?.minVersion&&app.version){const c=compareVersions(app.version,need.minVersion);if(c===-1)findings.push(F('software-old','warning',`${app.app} ${app.version} is older than required ${need.minVersion}`,'This device needs a newer software version.','Update the software.'));}
  if(!findings.length)findings.push(F('software-ok','ok',`${app.app} looks healthy`,'Installed with no crash evidence or logged errors.','No action needed.'));
  return {measurements:[M('software_installed','Software installed',1),M('software_crashes_90d','Crash evidence (90 days)',crashes,'count'),M('software_log_errors','Log errors',errors,'count')],findings};
}

/** Evaluate a profile test.pass against measurements (array of {metricId,value}). */
export function evaluatePass(pass,measurements=[]){
  if(!pass)return {status:'unknown',detail:'No pass criterion (manual judgement).'};
  const ms=measurements.filter(m=>m.metricId===pass.metricId);
  const u=pass.unit?` ${pass.unit}`:'';
  if(!ms.length)return {status:'unknown',detail:`No measurement for ${pass.metricId}.`};
  const nums=ms.map(m=>m.value).filter(v=>v!==null&&v!==undefined);
  if(!nums.length)return {status:'unknown',detail:`${pass.metricId} could not be measured.`};
  const v=Number(nums[nums.length-1]),t=Number(pass.value),t2=Number(pass.value2);
  let ok,desc;
  switch(pass.op){
    case 'abs<=':ok=Math.abs(v)<=t;desc=`|${v}|<=${t}`;break;
    case '<=':ok=v<=t;desc=`${v}<=${t}`;break;
    case '>=':ok=v>=t;desc=`${v}>=${t}`;break;
    case 'between':ok=v>=Math.min(t,t2)&&v<=Math.max(t,t2);desc=`${v} in [${t}, ${t2}]`;break;
    case 'equals':ok=nums.length&&(typeof pass.value==='string'?String(nums[nums.length-1])===pass.value:Math.abs(v-t)<1e-9);desc=`${nums[nums.length-1]}==${pass.value}`;break;
    case 'all-seen':ok=v>=(Number.isFinite(t)?t:100);desc=`${v}% seen`;break;
    default:return {status:'unknown',detail:`Unsupported operator ${pass.op}.`};
  }
  if(Number.isNaN(v)&&pass.op!=='equals')return {status:'unknown',detail:`${pass.metricId} is not numeric.`};
  return {status:ok?'pass':'fail',detail:`${ok?'Pass':'Fail'}: ${desc}${u}${pass.source?` (${pass.source})`:''}`};
}
