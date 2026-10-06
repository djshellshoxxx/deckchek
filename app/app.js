const equipment=[
  {name:"Technics SL-1200MK2",kind:"Turntable",chain:"Ortofon Concorde MKII · Rane Seventy-Two",tested:"Oct 06, 2026",status:"Good"},
  {name:"Pioneer PLX-1000",kind:"Turntable",chain:"Shure M44-7 · Allen & Heath Xone:96",tested:"Oct 05, 2026",status:"Review"},
  {name:"Pioneer CDJ-3000",kind:"Media player",chain:"Digital out · Rane Seventy-Two",tested:"Sep 30, 2026",status:"Good"},
  {name:"Rane Twelve MKII",kind:"Controller",chain:"USB · Rane Seventy-Two",tested:"Sep 28, 2026",status:"Good"},
  {name:"Focusrite Scarlett 4i4",kind:"Audio interface",chain:"Measurement input",tested:"Not tested",status:"Review"},
  {name:"Pioneer DDJ-REV1",kind:"Controller",chain:"USB audio · built-in interface",tested:"Not tested",status:"Review"}
];
const pages=["overview","tests","equipment","results","setup"];
const toast=document.getElementById("toast");
function showToast(message){toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("show"),2800)}
function go(page){pages.forEach(name=>{document.getElementById("page-"+name).classList.toggle("active",name===page)});document.querySelectorAll(".nav-item").forEach(button=>button.classList.toggle("active",button.dataset.page===page));document.getElementById("crumb-current").textContent=({overview:"Overview",tests:"Test center",equipment:"Equipment",results:"Results",setup:"Audio setup"})[page]||"Overview";window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>go(button.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(button=>button.addEventListener("click",()=>go(button.dataset.goto)));
function renderEquipment(query=""){const body=document.getElementById("equipment-table");const filtered=equipment.filter(item=>(item.name+" "+item.kind+" "+item.chain).toLowerCase().includes(query.toLowerCase()));body.innerHTML=filtered.map(item=>"<tr><td><strong>"+item.name+"</strong></td><td>"+item.kind+"</td><td>"+item.chain+"</td><td>"+item.tested+"</td><td><span class=\"status-pill "+(item.status==="Good"?"good":"review")+"\">"+item.status+"</span></td><td><button class=\"row-action\" data-equipment=\""+item.name+"\">Open →</button></td></tr>").join("");document.getElementById("equipment-empty").classList.toggle("hidden",filtered.length!==0);body.querySelectorAll("[data-equipment]").forEach(button=>button.addEventListener("click",()=>showToast(button.dataset.equipment+" · equipment record preview")))}
renderEquipment();document.getElementById("equipment-search").addEventListener("input",event=>renderEquipment(event.target.value));
const backdrop=document.getElementById("modal-backdrop");
function openTest(name){document.getElementById("modal-title").textContent=name;document.getElementById("modal-copy").textContent="Select the device and review the signal path before starting this diagnostic.";const select=document.getElementById("modal-deck");select.innerHTML=equipment.filter(item=>item.kind==="Turntable").map(item=>"<option>"+item.name+"</option>").join("");backdrop.classList.remove("hidden")}
document.querySelectorAll("[data-test]").forEach(button=>button.addEventListener("click",()=>openTest(button.dataset.test)));
document.querySelectorAll("[data-result]").forEach(button=>button.addEventListener("click",()=>showToast(button.dataset.result+" · sample report")));
document.querySelectorAll("[data-equipment]").forEach(button=>button.addEventListener("click",()=>go("equipment")));
document.getElementById("modal-close").addEventListener("click",()=>backdrop.classList.add("hidden"));
document.getElementById("modal-cancel").addEventListener("click",()=>backdrop.classList.add("hidden"));
backdrop.addEventListener("click",event=>{if(event.target===backdrop)backdrop.classList.add("hidden")});
document.getElementById("modal-run").addEventListener("click",()=>{backdrop.classList.add("hidden");go("results");showToast("Sample result opened · no hardware was measured")});
document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-filter]").forEach(item=>item.classList.toggle("selected",item===button));document.querySelectorAll(".test-card").forEach(card=>card.classList.toggle("hidden",button.dataset.filter!=="all"&&card.dataset.kind!==button.dataset.filter))}));
document.querySelectorAll(".notice-close").forEach(button=>button.addEventListener("click",()=>button.closest(".notice").remove()));
document.getElementById("add-equipment").addEventListener("click",()=>showToast("Equipment editor is next in the build roadmap"));
document.querySelector(".add-equipment").addEventListener("click",()=>showToast("Equipment editor is next in the build roadmap"));
document.getElementById("calibrate").addEventListener("click",()=>showToast("Audio capture is not connected in this preview"));
document.getElementById("export-results").addEventListener("click",()=>showToast("Report export will follow the local report engine"));
document.addEventListener("keydown",event=>{if(event.key==="Escape")backdrop.classList.add("hidden")});
