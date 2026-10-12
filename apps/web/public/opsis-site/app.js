import {c, t, localize} from './locale.js';
export const modules=[
 {id:'research',name:c('Research','研究'),label:c('Open Research','打开研究'),code:'RE',hint:c('Understand a token, wallet, or transaction.','了解代币、钱包或交易。'),summary:c('Public evidence','公开证据')},
 {id:'check',name:c('Trade Check','交易核查'),label:c('Open Trade Check','打开交易核查'),code:'TC',hint:c('Check exit costs at your entered size.','按输入的数量核查退出成本。'),summary:c('Size & exit costs','数量与退出成本')},
 {id:'watch',name:c('Watch','观察'),label:c('Open Watch','打开观察'),code:'WA',hint:c('Check a public wallet and review saved changes.','核查公开钱包并查看已保存的变化。'),summary:c('Wallet changes','钱包变化')},
 {id:'rwa',name:c('Stock-token check','股票代币核查'),label:c('Open Stock-token check','打开股票代币核查'),code:'ST',hint:c('Inspect stock-token identity and redemption evidence.','查看股票代币身份与赎回证据。'),summary:c('Identity & backing','身份与支持证据')},
 {id:'quant',name:c('Quant Lab','量化实验室'),label:c('Open Quant Lab','打开量化实验室'),code:'QL',hint:c('Explore captured pools and local experiments.','探索已采集的资金池与本地实验。'),summary:c('Data & experiments','数据与实验')},
 {id:'world',name:c('World & markets','世界与市场'),label:c('Open World & markets','打开世界与市场'),code:'WM',hint:c('Compare dated reports and price observations.','比较有日期的报道与价格观测。'),summary:c('News & price moves','新闻与价格变化')}
];
const $=s=>document.querySelector(s);
let enabled=new Set(),workspaceOpen=false,scene,lastFocus,ambientOn=false,motionOn=!matchMedia('(prefers-reduced-motion:reduce)').matches;
const shortcutSelector='[data-tool], [data-workspace], [data-open-quant], #public-search button';
function destination(button){return button.dataset.tool||button.dataset.workspace||(button.hasAttribute('data-open-quant')?'quant':'research')}
function syncCapabilities(){
 document.querySelectorAll(shortcutSelector).forEach(button=>{const available=enabled.has(destination(button));button.hidden=!available;button.disabled=!available});
 $('#public-search').hidden=!enabled.has('research');scene?.refreshLayout();
}
export function navigateTool(tool,entity,opener=document.activeElement){
 if(!enabled.has(tool))return;
 lastFocus=opener?.matches?.('button,input,a')?opener:document.querySelector(`.module-label[data-tool="${tool}"]`);
 // Dispatch before any scene work: navigation never waits for animation or asset loading.
 document.dispatchEvent(new CustomEvent('opsis:navigate',{detail:{type:'opsis:open-tool',tool,entity}}));
}
export function openTool(i){if(Number.isInteger(i)&&modules[i])navigateTool(modules[i].id,undefined,document.querySelector(`.module-label[data-tool="${modules[i].id}"]`))}
for(const [i,m] of modules.entries()){
 const b=document.createElement('button');b.className='module-label';b.dataset.module=i;b.dataset.tool=m.id;b.disabled=true;b.setAttribute('aria-label',m.label);b.setAttribute('aria-hidden','true');b.innerHTML=`<span>0${i+1}<span>↗</span></span><strong>${m.name}</strong><small>${m.summary}</small>`;b.tabIndex=-1;if(m.id==='quant')b.classList.add('recommended');b.addEventListener('pointerenter',()=>scene?.highlight(i));b.addEventListener('pointerleave',()=>scene?.highlight(-1));$('#module-labels').append(b);
 const row=document.createElement('button');row.className='index-row';row.dataset.tool=m.id;row.disabled=true;if(m.id==='quant')row.classList.add('recommended');row.innerHTML=`<span>0${i+1}</span><span><strong>${m.name}</strong><small>${m.hint}</small></span><span>↗</span>`;$('#index-list').append(row);
 const nav=document.createElement('button');nav.className='rail-tool';nav.dataset.tool=m.id;nav.disabled=true;nav.innerHTML=`${m.name}<small>0${i+1}</small>`;$('#rail-tools').append(nav);
}
syncCapabilities();
document.addEventListener('opsis:capabilities',event=>{enabled=new Set(Array.isArray(event.detail?.enabled)?event.detail.enabled:[]);syncCapabilities()});
// Delegation includes generated rings, rail, index, stories, top bar and call to action.
document.addEventListener('click',event=>{const button=event.target.closest('[data-tool], [data-workspace], [data-open-quant]');if(button&&!button.disabled)navigateTool(destination(button),undefined,button)});
export function jump(p){if(document.body.classList.contains('no-webgl')){$('#modules').scrollIntoView();return}window.scrollTo({top:$('#experience').offsetTop+($('#experience').offsetHeight-innerHeight)*p,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>jump(Number(b.dataset.jump))));
function syncMotion(){
 $('#motion-toggle').textContent=c(`MOTION / ${motionOn?'ON':'OFF'}`,`动态 / ${motionOn?'开启':'关闭'}`);
 $('#motion-toggle').setAttribute('aria-pressed',String(motionOn));
 $('#footer-motion').textContent=c(`Motion: ${motionOn?'On':'Off'}`,`动态：${motionOn?'开启':'关闭'}`);
 $('#footer-motion').setAttribute('aria-pressed',String(motionOn));
}
$('#motion-toggle').addEventListener('click',()=>{motionOn=!motionOn;scene?.setMotion(motionOn);syncMotion()});
$('#footer-motion').addEventListener('click',()=>$('#motion-toggle').click());syncMotion();
import('./scene.js?v=data-18').then(async({createScanner})=>{scene=await createScanner({open:i=>openTool(i),jump});scene.setMotion(motionOn);scene.setAmbient(ambientOn);scene.setPaused(workspaceOpen)}).catch(()=>{document.body.classList.add('no-webgl');$('#load-state').textContent=c('STATIC VIEW / TOOLS BELOW','静态视图 / 工具在下方');document.dispatchEvent(new Event('chain-ready'))});

// Hover reveals desktop navigation; focus and touch provide equivalent access.
const rail=$('#sidebar'),railPanel=$('#sidebar-panel'),railToggle=$('#sidebar-toggle');
function showRail(open){rail.classList.toggle('is-open',open);railPanel.inert=!open;railToggle.setAttribute('aria-expanded',String(open));railToggle.setAttribute('aria-label',open?c('Close navigation','关闭导航'):c('Open navigation','打开导航'))}
let hoverOpenedAt=0;
rail.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(min-width:851px)').matches&&!rail.classList.contains('is-open')){hoverOpenedAt=performance.now();showRail(true)}});
rail.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!rail.querySelector(':focus-visible'))showRail(false)});
rail.addEventListener('focusin',e=>{if(e.target.matches(':focus-visible'))showRail(true)});
rail.addEventListener('focusout',e=>{if(e.relatedTarget&&!rail.contains(e.relatedTarget))showRail(false)});
// A click that follows the hover which just opened the rail keeps it open instead of toggling it shut.
railToggle.addEventListener('click',()=>{const open=rail.classList.contains('is-open');if(open&&performance.now()-hoverOpenedAt<800){hoverOpenedAt=0;return}showRail(!open)});
rail.addEventListener('keydown',e=>{if(e.key==='Escape'){railToggle.focus();showRail(false);e.preventDefault()}});
document.addEventListener('pointerdown',e=>{if(!rail.contains(e.target))showRail(false)});
railPanel.addEventListener('click',e=>{if(e.target.closest('button')&&!matchMedia('(hover:hover)').matches)showRail(false)});
const featurePreviews={map:['quant-map.png',c('Quant Lab pool map showing liquidity, volume, and 24-hour price changes alongside source-based analysis.','量化实验室资金池图谱，展示流动性、交易量和 24 小时价格变化及来源分析。')],compare:['quant-compare.png',c('Quant Lab comparison of WETH, PONS, and CASHCAT with exact-token market metrics.','量化实验室比较 WETH、PONS 和 CASHCAT 的精确代币市场指标。')],scenario:['quant-scenario.png',c('Quant Lab portfolio surface with editable price shocks and calculated portfolio exposure.','量化实验室投资组合曲面，包含可编辑的价格冲击和计算的组合敞口。')]};
document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>{const [file,alt]=featurePreviews[b.dataset.preview];$('#product-preview').src='assets/'+file+'?v=data-18';$('#product-preview').alt=t(alt);document.querySelectorAll('[data-preview]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-pressed',String(t===b))});if(matchMedia('(max-width:850px)').matches)$('#product-preview').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}));
$('#ambient-toggle').addEventListener('click',()=>{ambientOn=!ambientOn;scene?.setAmbient(ambientOn);$('#ambient-toggle').textContent=c('Ambient news: '+(ambientOn?'On':'Off'),'背景新闻：'+(ambientOn?'开启':'关闭'));$('#ambient-toggle').setAttribute('aria-pressed',String(ambientOn))});
document.addEventListener('opsis:locale',()=>{localize();syncMotion();scene?.refreshLayout()});
document.addEventListener('opsis:overview',()=>{workspaceOpen=false;scene?.setPaused(false);if(lastFocus?.isConnected&&!lastFocus.hidden&&!lastFocus.disabled){if(railPanel.contains(lastFocus))showRail(true);lastFocus.focus({preventScroll:true})}});
document.addEventListener('opsis:workspace-open',()=>{workspaceOpen=true;scene?.setPaused(true)});

// Every visible control is bound before it becomes clickable.
document.querySelectorAll('[data-jump], [data-preview], #sidebar-toggle, #motion-toggle, #footer-motion, #ambient-toggle').forEach(button=>{button.disabled=false});
