const storageKey=`cdl-ui-assistance:${location.pathname}:tooltips`;
const state={tooltips:localStorage.getItem(storageKey)!=='off'};
const interactive='button,input:not([type="hidden"]),select,textarea,a[href],[role="button"],[tabindex]:not([tabindex="-1"])';
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const esc=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function nameOf(el){
 const by=el.getAttribute('aria-labelledby');
 if(by){const v=by.split(/\s+/).map(id=>clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');if(v)return v}
 if(el.labels?.length){const v=[...el.labels].map(x=>clean(x.textContent)).filter(Boolean).join(' ');if(v)return v}
 return clean(el.getAttribute('aria-label'))||clean(el.dataset.helpLabel)||clean(el.textContent)||clean(el.getAttribute('placeholder'))||clean(el.name)||clean(el.id)||'control';
}
function helpOf(el,name){
 if(el.dataset.help)return clean(el.dataset.help);
 if(el.tagName==='A')return `Open ${name}.`;
 if(el.tagName==='SELECT')return `Choose the ${name} setting.`;
 if(el.tagName==='TEXTAREA')return `Enter or edit ${name}.`;
 if(el.tagName==='INPUT'){
  const t=(el.type||'text').toLowerCase();
  if(t==='checkbox'||t==='radio')return `Turn ${name} on or off.`;
  if(t==='range')return `Adjust ${name}.`;
  if(t==='file')return `Choose a file for ${name}.`;
  if(['number','date','time','color'].includes(t))return `Set ${name}.`;
  return `Enter ${name}.`;
 }
 return `Activate ${name}.`;
}
function visible(el){if(el.hidden)return false;const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'}
function controls(){return [...document.querySelectorAll(interactive)].filter(el=>!el.closest('[data-ui-assistance]')).filter(visible).map(el=>{const name=nameOf(el);return{el,name,help:helpOf(el,name)}})}
function applyTooltips(){
 for(const {el,help} of controls()){
  if(!el.dataset.uiOriginalTitle&&el.hasAttribute('title'))el.dataset.uiOriginalTitle=el.getAttribute('title')||'';
  const tip=clean(el.dataset.tooltip)||clean(el.dataset.uiOriginalTitle)||help;
  if(state.tooltips){el.title=tip;el.dataset.tooltipEnabled='true'}else{el.removeAttribute('title');delete el.dataset.tooltipEnabled}
 }
}
function featureGuide(){return [...document.querySelectorAll('main section,main article,[role="tabpanel"]')].filter(el=>!el.closest('[data-ui-assistance]')).map(el=>{const h=el.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > header h1,:scope > header h2,:scope > .section-head h2');if(!h)return null;const p=el.querySelector(':scope > p,:scope > header p,:scope > .section-head p');return{title:clean(h.textContent),detail:clean(p?.textContent)}}).filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y.title===x.title)===i).slice(0,30)}
function dialog(id,title){
 let d=document.getElementById(id);if(d)return d;
 d=document.createElement('dialog');d.id=id;d.dataset.uiAssistance='true';
 d.innerHTML=`<form method="dialog" class="cdl-help-shell"><header><h2>${esc(title)}</h2><button value="close" aria-label="Close ${esc(title)}">Close</button></header><div class="cdl-help-body"></div></form>`;
 document.body.append(d);return d;
}
function renderHelp(d){
 let body=d.querySelector('.cdl-help-body');
 if(!body){body=document.createElement('section');body.className='cdl-help-body';(d.querySelector('form')||d).append(body)}
 body.querySelector('[data-generated-help]')?.remove();
 const s=document.createElement('section');s.dataset.generatedHelp='true';
 const features=featureGuide(),items=controls().filter(x=>!x.el.closest('dialog')).slice(0,160);
 s.innerHTML=`<h3>Getting started</h3><p>Start with the primary input, device, file or source controls, then configure the relevant settings and run, preview, analyze, generate or export from the matching section.</p>${features.length?`<h3>Feature guide</h3><dl>${features.map(x=>`<dt>${esc(x.title)}</dt><dd>${esc(x.detail||`Use this section for ${x.title}.`)}</dd>`).join('')}</dl>`:''}<h3>Control reference</h3><p>This list is generated from the live interface, so newly added controls are included automatically.</p><dl>${items.map(x=>`<dt>${esc(x.name)}</dt><dd>${esc(x.help)}</dd>`).join('')}</dl><h3>Tooltips</h3><p>Hover over a control to see a short description. Tooltips can be turned on or off from Options and the preference is saved locally.</p><h3>Keyboard and accessibility</h3><p>Use Tab and Shift+Tab to move between controls, Enter or Space to activate buttons, and Escape to close dialogs.</p><h3>Troubleshooting</h3><p>If a control is unavailable, confirm that any required device, file, permission or input has been selected first. Reloading resets transient interface state while preserving saved tooltip preferences.</p>`;
 body.append(s);
}
function renderOptions(d){
 const b=d.querySelector('.cdl-help-body');b.innerHTML=`<fieldset><legend>Interface assistance</legend><label class="cdl-tooltip-option"><input id="cdlTooltipToggle" type="checkbox" ${state.tooltips?'checked':''}> Show tooltips</label><p>When enabled, hovering over an interactive control shows a short description. This preference is saved in this browser.</p></fieldset>`;
 b.querySelector('#cdlTooltipToggle').addEventListener('change',e=>{state.tooltips=e.target.checked;localStorage.setItem(storageKey,state.tooltips?'on':'off');applyTooltips()});
}
function host(){return document.querySelector('.app-actions,.header-actions,.actions,header nav,header .controls,header')||document.body}
function action(id,label){let b=document.getElementById(id);if(b)return b;b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;b.dataset.uiAssistance='true';host().append(b);return b}
function styles(){
 if(document.getElementById('cdlUiAssistanceStyles'))return;
 const s=document.createElement('style');s.id='cdlUiAssistanceStyles';s.textContent='dialog[data-ui-assistance],#helpDialog{max-width:min(780px,92vw);max-height:84vh;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:12px;padding:0;color:inherit;background:Canvas}dialog[data-ui-assistance]::backdrop,#helpDialog::backdrop{background:rgba(0,0,0,.64)}.cdl-help-shell{min-width:min(680px,88vw)}.cdl-help-shell>header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;background:Canvas;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);z-index:1}.cdl-help-shell h2{margin:0}.cdl-help-body{padding:1rem 1.2rem 1.5rem;overflow:auto}.cdl-help-body dl{display:grid;grid-template-columns:minmax(9rem,1fr) 2fr;gap:.35rem 1rem}.cdl-help-body dt{font-weight:700}.cdl-help-body dd{margin:0 0 .45rem;opacity:.88}.cdl-tooltip-option{display:flex;gap:.55rem;align-items:center;font-weight:600}@media(max-width:650px){.cdl-help-shell{min-width:0}.cdl-help-body dl{grid-template-columns:1fr}.cdl-help-body dd{margin-bottom:.8rem}}';document.head.append(s)
}
function init(){
 styles();
 const h=document.getElementById('helpDialog')||dialog('cdlHelpDialog',`${document.title||'Application'} Help`);renderHelp(h);
 const hb=document.getElementById('helpBtn')||action('cdlHelpBtn','Help');
 if(!hb.dataset.uiAssistanceBound){hb.dataset.uiAssistanceBound='true';hb.addEventListener('click',e=>{if(hb.id==='helpBtn')e.stopImmediatePropagation();renderHelp(h);typeof h.showModal==='function'?h.showModal():h.setAttribute('open','')},true)}
 const o=dialog('cdlOptionsDialog','Options'),ob=action('cdlOptionsBtn','Options');
 ob.addEventListener('click',()=>{renderOptions(o);typeof o.showModal==='function'?o.showModal():o.setAttribute('open','')});
 applyTooltips();new MutationObserver(()=>applyTooltips()).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
