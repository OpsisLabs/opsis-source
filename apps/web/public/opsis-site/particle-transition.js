// Short, interruptible particle transitions. No persistent render loop or screenshots.
export const PARTICLE_DURATION_MULTIPLIER=2.5;
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=t=>t*t*(3-2*t);
export function createParticleTransition(){
 const layer=document.createElement('div');layer.className='particle-transition';layer.setAttribute('popover','manual');layer.setAttribute('aria-hidden','true');layer.inert=true;
 const canvas=document.createElement('canvas');layer.append(canvas);document.body.append(layer);const ctx=canvas.getContext('2d');
 const mask=document.createElement('canvas'),mc=mask.getContext('2d');let stop=null;
 function cancel(){stop?.();stop=null}
 function capture(element){
  const w=innerWidth,h=innerHeight,surface=document.createElement('canvas');surface.width=w;surface.height=h;const c=surface.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';
  for(const el of element.querySelectorAll('h2,h3,strong,span,button,p,td,th,label,dt,dd')){if(el.children.length)continue;const r=el.getBoundingClientRect();if(r.bottom<0||r.top>h||r.right<0||r.left>w)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;c.font=cs.font;c.textBaseline='top';c.fillText(el.textContent.trim().slice(0,85),r.x,r.y,r.width)}
  for(const path of element.querySelectorAll('svg path,svg circle,svg line')){try{const length=path.getTotalLength(),matrix=path.getScreenCTM();if(!matrix)continue;for(let d=0;d<length;d+=7){const p=path.getPointAtLength(d),x=matrix.a*p.x+matrix.c*p.y+matrix.e,y=matrix.b*p.x+matrix.d*p.y+matrix.f;if(x>=0&&x<w&&y>=0&&y<h)c.fillRect(x,y,2,2)}}catch{}}
  const pixels=c.getImageData(0,0,w,h).data,points=[];for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4)if(pixels[(y*w+x)*4+3]>80)points.push({x,y});
  const step=Math.max(1,Math.ceil(points.length/2400));return points.filter((_,i)=>i%step===0);
 }
 function play({element,enter=true,ring=[],origin,enabled=true,duration=650}){
  duration*=PARTICLE_DURATION_MULTIPLIER;
  cancel();if(!enabled||matchMedia('(prefers-reduced-motion:reduce)').matches)return Promise.resolve(true);
  const bounds=element.getBoundingClientRect(),w=innerWidth,h=innerHeight,center=origin||{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
  const page=capture(element),fallback=Array.from({length:600},(_,i)=>({x:bounds.x+(i%30)/29*bounds.width,y:bounds.y+Math.floor(i/30)/19*bounds.height}));
  const shape=ring.length?ring:fallback,source=enter?shape:page.length?page:fallback;
  const points=source.slice(0,2400).map((p,i)=>{const n=((i*73+31)%997)/997,a=n*Math.PI*12,target=enter?{x:center.x+Math.cos(a)*w*(.15+n*.45),y:center.y+Math.sin(a)*h*(.15+n*.4)}:shape[i%shape.length];return {x:p.x,y:p.y,tx:target.x,ty:target.y,n,a}});
  const dpr=Math.min(devicePixelRatio,1.5);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  mask.width=Math.min(240,Math.ceil(bounds.width/5));mask.height=Math.max(24,Math.round(mask.width*bounds.height/bounds.width));const ranks=[];const ox=(center.x-bounds.x)/bounds.width,oy=(center.y-bounds.y)/bounds.height;
  for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){const noise=((x*73+y*151+x*y*17)%997)/997,dist=Math.hypot(x/mask.width-ox,y/mask.height-oy)/1.5;ranks.push(Math.min(.84,dist*.55+noise*.35))}
  element.classList.add('particle-masked');element.style.maskSize='100% 100%';element.style.webkitMaskSize='100% 100%';element.style.maskRepeat='no-repeat';
  try{layer.showPopover()}catch{layer.classList.add('fallback-visible')}
  let raf,start,done=false;
  return new Promise(resolve=>{const cleanup=completed=>{if(done)return;done=true;cancelAnimationFrame(raf);element.classList.remove('particle-masked');element.style.maskImage='';element.style.webkitMaskImage='';element.style.maskSize='';element.style.webkitMaskSize='';element.style.maskRepeat='';ctx.clearRect(0,0,w,h);try{layer.hidePopover()}catch{}layer.classList.remove('fallback-visible');stop=null;resolve(completed)};stop=()=>cleanup(false);
   function frame(time){start??=time;const t=clamp((time-start)/duration),motion=ease(t),reveal=enter?t:1-t;mc.clearRect(0,0,mask.width,mask.height);for(let i=0;i<ranks.length;i++){const alpha=clamp((reveal*1.08-ranks[i])/.20);if(!alpha)continue;mc.fillStyle='rgba(0,0,0,'+alpha+')';mc.fillRect(i%mask.width,Math.floor(i/mask.width),1,1)}const url='url('+mask.toDataURL()+')';element.style.maskImage=url;element.style.webkitMaskImage=url;ctx.clearRect(0,0,w,h);
    for(const p of points){const travel=enter?motion:ease(clamp((t-p.n*.08)/.92)),bend=Math.sin(travel*Math.PI)*(enter?35:70),x=p.x+(p.tx-p.x)*travel+Math.sin(p.a)*bend,y=p.y+(p.ty-p.y)*travel+Math.cos(p.a)*bend;ctx.globalAlpha=enter?Math.pow(1-t,1.3)*.9:Math.sin(Math.PI*Math.min(.99,t*1.05))*.9;ctx.fillStyle=p.n>.75?'#b8abff':'#fff';const size=p.n>.9?2.8:1.5;ctx.fillRect(x,y,size,size)}ctx.globalAlpha=1;
    if(t<1)raf=requestAnimationFrame(frame);else cleanup(true)
   }frame(performance.now());
  });
 }
 addEventListener('pagehide',cancel);return {play,cancel};
}
