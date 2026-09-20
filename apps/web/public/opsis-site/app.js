import {createParticleTransition} from './particle-transition.js?v=3';
export const modules=[
 {id:'explorer',name:'Wallet Explorer',short:'Explorer',code:'EX',component:'IDENTITY',hint:'Explore wallet activity.',description:'Inspect a wallet, transaction, or contract through source-linked records.',path:'/app'},
 {id:'swap',name:'Swap Lab',short:'Swap Lab',code:'SW',component:'LIQUIDITY',hint:'See how fees affect a swap.',description:'See how a WETH/USDG route, example pool fee, and slippage tolerance affect the output.',path:'/swap'},
 {id:'portfolio',name:'Portfolio',short:'Portfolio',code:'PF',component:'HOLDINGS',hint:'See your holdings at a glance.',description:'View holdings, movements, and reference values together in your local encrypted portfolio.',path:'/vault?view=portfolio'},
 {id:'rwa',name:'Asset Proof',short:'Asset Proof',code:'AP',component:'PROVENANCE',hint:'Check what’s behind an asset.',description:'Inspect token identity, custody, and redemption evidence as separate layers.',path:'/rwa'},
 {id:'quant',name:'Quant Lab',short:'Quant Lab',code:'QL',component:'QUANTITATIVE',hint:'Compare tokens and try what-ifs.',description:'Inspect the Robinhood Chain market snapshot, compare exact tokens, and stress a hypothetical portfolio.',path:'/quant/'},
 {id:'world',name:'World Map',short:'World Map',code:'WM',component:'WORLD EVENTS',hint:'Explore news and price moves.',description:'Select a report on the globe and compare dated price observations around publication.',path:'/world/'}
];
const transition=createParticleTransition();let navigation=0,closing=false,ambientOn=false;
const $=s=>document.querySelector(s);const dialog=$('#terminal');let workspaceOpen=false,scene,lastFocus,selected=0,motionOn=!matchMedia('(prefers-reduced-motion:reduce)').matches;
for(const [i,m] of modules.entries()){
 const b=document.createElement('button');b.className='module-label';b.dataset.module=i;b.setAttribute('aria-label',`Open ${m.name}`);b.setAttribute('aria-hidden','true');b.innerHTML=`<span>${m.id==='quant'?'START HERE':m.id==='world'?'EXPLORE THE WORLD':'OPEN TOOL'}<span>↗</span></span><strong>${m.short}</strong><small>${['Wallet activity','Swap costs','Your holdings','Asset backing','Tokens & what-ifs','News & price moves'][i]}</small>`;if(m.id==='quant')b.classList.add('recommended');b.tabIndex=-1;b.addEventListener('click',()=>openTool(i));b.addEventListener('pointerenter',()=>scene?.highlight(i));b.addEventListener('pointerleave',()=>scene?.highlight(-1));$('#module-labels').append(b);
 const row=document.createElement('button');row.className='index-row';row.innerHTML=`<span>${m.id==='quant'?'START':m.id==='world'?'WORLD':'TOOL'}</span><span><strong>${m.name}</strong><small>${m.hint}</small></span><span>↗</span>`;row.addEventListener('click',()=>openTool(i));if(m.id==='quant'){$('#index-list').prepend(row);row.classList.add('recommended')}else if(m.id==='world')$('#index-list .recommended').after(row);else $('#index-list').append(row);
 for(const target of ['#terminal-nav','#rail-tools']){const nav=document.createElement('button');nav.className=target==='#terminal-nav'?'terminal-nav-button':'rail-tool';nav.dataset.module=i;nav.innerHTML=target==='#terminal-nav'?`<span>0${i+1}</span>${m.short}`:`${m.short.toUpperCase()}<small>0${i+1}</small>`;nav.addEventListener('click',()=>openTool(i));$(target).append(nav)}
}
function paintTool(i){selected=i;$('#workspace-select').value=String(i);const m=modules[i];dialog.classList.toggle('quant-open',['quant','world'].includes(m.id));$('.demo-label').textContent=m.id==='world'?'DATED EVENT CAPTURE':m.id==='quant'?'MAP: 10 SEP SNAPSHOT':'CONNECTED TOOLS';$('#terminal-kicker').textContent=`// MODULE 0${i+1} / ${m.code}`;$('#terminal-title').textContent=m.name;$('#terminal-description').textContent=m.description;document.querySelectorAll('.terminal-nav-button').forEach((b,n)=>{b.classList.toggle('active',n===i);b.setAttribute('aria-current',n===i?'page':'false')});$('#tool-content').replaceChildren();$('.terminal-main').scrollTop=0;$('#tool-content').textContent='Opening connected workspace…'}
export async function openTool(i){
 if(!Number.isInteger(i)||!modules[i]||closing)return;
 const id=++navigation,isNew=!dialog.open;transition.cancel();scene?.restoreRing();
 if(isNew)lastFocus=document.activeElement;
 const shape=isNew?scene?.transitionRing(i):null;
 scene?.setPaused(true);
 if(!isNew&&motionOn){await transition.play({element:$('.terminal-main'),enter:false,enabled:motionOn,duration:220});if(id!==navigation)return}
 paintTool(i);
 if(isNew){dialog.showModal();document.body.style.overflow='hidden';dialog.classList.add('particle-opening')}
 await transition.play({element:isNew?dialog:$('.terminal-main'),enter:true,ring:shape?.points,origin:shape?.origin,enabled:motionOn,duration:isNew?680:420});
 if(id!==navigation)return;dialog.classList.remove('particle-opening');scene?.restoreRing();
 document.dispatchEvent(new CustomEvent('opsis:navigate',{detail:{type:'opsis:open-tool',tool:modules[i].id}}));
}
async function closeTerminal(){
 if(!dialog.open||closing)return;closing=true;const id=++navigation;transition.cancel();scene?.restoreRing();const shape=scene?.transitionRing(selected);dialog.classList.remove('particle-opening');dialog.classList.add('particle-closing');
 await transition.play({element:dialog,enter:false,ring:shape?.points,origin:shape?.origin,enabled:motionOn,duration:560});
 if(id!==navigation)return;dialog.classList.remove('particle-closing');if(['quant','world'].includes(modules[selected].id))$('#tool-content').replaceChildren();dialog.close();scene?.restoreRing();closing=false;
}
$('#close-terminal').addEventListener('click',closeTerminal);dialog.addEventListener('cancel',e=>{e.preventDefault();closeTerminal()});dialog.addEventListener('close',()=>{if(dialog.open)return;closing=false;transition.cancel();dialog.classList.remove('particle-opening','particle-closing');if(['quant','world'].includes(modules[selected].id))$('#tool-content').replaceChildren();document.body.style.overflow='';scene?.setPaused(false);scene?.highlight(-1);lastFocus?.focus({preventScroll:true})});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeTerminal()}});
for(const id of ['#open-terminal','#terminal-shortcut'])$(id).addEventListener('click',()=>openTool(4));
export function jump(p){if(document.body.classList.contains('no-webgl')){$('#modules').scrollIntoView();return}window.scrollTo({top:$('#experience').offsetTop+($('#experience').offsetHeight-innerHeight)*p,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.jump))));
$('#motion-toggle').textContent=`MOTION / ${motionOn?'ON':'OFF'}`;$('#motion-toggle').addEventListener('click',()=>{motionOn=!motionOn;scene?.setMotion(motionOn);$('#motion-toggle').textContent=`MOTION / ${motionOn?'ON':'OFF'}`});
import('./scene.js?v=data-18').then(async({createScanner})=>{scene=await createScanner({open:i=>openTool(i),jump});scene.setMotion(motionOn);scene.setAmbient(ambientOn);if(dialog.open||workspaceOpen)scene.setPaused(true)}).catch(e=>{console.warn('Point cloud unavailable',e);document.body.classList.add('no-webgl');$('#load-state').textContent='STATIC VIEW / TOOLS BELOW';document.dispatchEvent(new Event('chain-ready'))});

addEventListener('message',e=>{const frame=document.querySelector('#quant-frame');if(e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='opsis:close-quant')closeTerminal()});

// Hover reveals the desktop navigation; focus and touch provide equivalent access.
const rail=$('#sidebar'),railPanel=$('#sidebar-panel'),railToggle=$('#sidebar-toggle');
function showRail(open){rail.classList.toggle('is-open',open);railPanel.inert=!open;railToggle.setAttribute('aria-expanded',String(open));railToggle.setAttribute('aria-label',open?'Close navigation':'Open navigation')}
rail.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(min-width:851px)').matches)showRail(true)});
rail.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!rail.querySelector(':focus-visible'))showRail(false)});
rail.addEventListener('focusin',e=>{if(e.target.matches(':focus-visible'))showRail(true)});
rail.addEventListener('focusout',e=>{if(e.relatedTarget&&!rail.contains(e.relatedTarget))showRail(false)});
railToggle.addEventListener('click',()=>showRail(!rail.classList.contains('is-open')));
rail.addEventListener('keydown',e=>{if(e.key==='Escape'){railToggle.focus();showRail(false);e.preventDefault()}});
document.addEventListener('pointerdown',e=>{if(!rail.contains(e.target))showRail(false)});
railPanel.addEventListener('click',e=>{if(e.target.closest('button')&&!matchMedia('(hover:hover)').matches)showRail(false)});

document.querySelectorAll('[data-open-quant]').forEach(b=>b.addEventListener('click',()=>openTool(4)));
const featurePreviews={map:['quant-map.png','Quant Lab pool map showing liquidity, volume, and 24-hour price changes alongside source-based analysis.'],compare:['quant-compare.png','Quant Lab comparison of WETH, PONS, and CASHCAT with exact-token market metrics.'],scenario:['quant-scenario.png','Quant Lab portfolio surface with editable price shocks and calculated portfolio exposure.']};
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>{const [file,alt]=featurePreviews[b.dataset.preview];$('#product-preview').src='assets/'+file+'?v=data-18';$('#product-preview').alt=alt;document.querySelectorAll('[data-preview]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-pressed',String(t===b))});if(matchMedia('(max-width:850px)').matches)$('#product-preview').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}));

// One consistent workspace switcher, including when Quant Lab is open.
for(const i of [4,5,0,2,1,3]){const o=document.createElement('option');o.value=i;o.textContent=modules[i].name;$('#workspace-select').append(o)}
$('#workspace-select').addEventListener('change',e=>openTool(Number(e.target.value)));
$('#ambient-toggle').addEventListener('click',()=>{ambientOn=!ambientOn;scene?.setAmbient(ambientOn);$('#ambient-toggle').textContent='Ambient news: '+(ambientOn?'On':'Off');$('#ambient-toggle').setAttribute('aria-pressed',String(ambientOn))});

// Product stories and footer shortcuts use the same particle navigation as the rings.
document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{const i=modules.findIndex(m=>m.id===button.dataset.tool);if(i>=0)openTool(i)}));
const footerMotion=$('#footer-motion');
function syncFooterMotion(){footerMotion.textContent='Motion: '+(motionOn?'On':'Off');footerMotion.setAttribute('aria-pressed',String(motionOn))}
footerMotion.addEventListener('click',()=>{$('#motion-toggle').click()});$('#motion-toggle').addEventListener('click',syncFooterMotion);syncFooterMotion();


// Pause the landing sculpture while its live research dialog is open.
document.addEventListener('asset-search-state',e=>{scene?.setPaused(e.detail.open||dialog.open)});

document.addEventListener('opsis:overview',()=>{workspaceOpen=false;scene?.setPaused(false);closeTerminal()});
document.addEventListener('opsis:workspace-open',()=>{workspaceOpen=true;scene?.setPaused(true)});
