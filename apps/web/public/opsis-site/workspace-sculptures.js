import {torusPoints,networkPoints,curvePoints,evidencePoints} from './sculpture-geometry.js';
const mounted=new Set();
// No idle animation loop: only selection, dragging and resize repaint these sculptures.
const cleanup=new MutationObserver(()=>{for(const item of mounted)if(!item.canvas.isConnected){item.observer.disconnect();mounted.delete(item)}});
cleanup.observe(document.documentElement,{childList:true,subtree:true});
function mount(host,points,{pick}={}){
 host.querySelector('.q-particles')?.remove();
 const canvas=document.createElement('canvas');canvas.className='q-particles';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
 const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return {update(){},select(){}}}
 let selected=-1,current=points;
 function draw(){
  const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;
  const dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=width*dpr;canvas.height=height*dpr;
  const scale=Math.min(width/760,height/370),ox=(width-760*scale)/2,oy=(height-370*scale)/2;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);ctx.fillStyle='#fff';
  for(const p of current){ctx.globalAlpha=p.alpha*(selected<0||p.segment===selected?1:.34);const radius=(p.z>0?1:.78);ctx.fillRect(p.x-radius/2,p.y-radius/2,radius,radius)}
  ctx.globalAlpha=1;
 }
 const observer=new ResizeObserver(draw);observer.observe(host);const entry={canvas,observer};mounted.add(entry);draw();
 if(pick){canvas.style.pointerEvents='auto';canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/760,r.height/370),x=(e.clientX-r.left-(r.width-760*scale)/2)/scale,y=(e.clientY-r.top-(r.height-370*scale)/2)/scale;let closest=null,distance=Infinity;for(const p of current){const d=(p.x-x)**2+(p.y-y)**2;if(d<distance){closest=p;distance=d}}if(closest&&distance<1600)pick(closest.segment)}}
 return {update(p){current=p;draw()},select(i){selected=i;draw()}};
}
export function sculptNetwork(host,nodes,edges){host.classList.add('q-sculpt-network');return mount(host,networkPoints(nodes,edges))}
export {networkPoints};
export function sculptCurve(host,values,lo,hi){host.classList.add('q-sculpt-curve');return mount(host,curvePoints(values,lo,hi))}
export function sculptAllocation(host,shares,onPick){host.classList.add('q-sculpt-allocation');return mount(host,torusPoints(shares),{pick:onPick})}
export function sculptEvidence(host,onPick){host.className='q-visual q-sculpt-evidence';return mount(host,evidencePoints(),{pick:onPick})}
