// Deterministic point geometry. Coordinates share the accessible SVG's 760 × 370 space.
const TAU=Math.PI*2;
const fract=n=>n-Math.floor(n);
const noise=i=>fract(Math.sin(i*127.1+311.7)*43758.5453);
export function torusPoints(shares=[1],count=10500){
 const points=[];let start=0;
 shares.forEach((share,segment)=>{
  const n=Math.round(count*share),gap=shares.length>1?.025:0;
  for(let i=0;i<n;i++){
   const u=(start+share*(i+.5)/n)*TAU-Math.PI/2,v=TAU*noise(i+segment*971);
   if(i/n<gap||i/n>1-gap)continue;
   const radius=122+32*Math.cos(v),x=radius*Math.cos(u),y=radius*Math.sin(u),z=32*Math.sin(v);
   points.push({x:380+x*1.62+Math.cos((start+share/2)*TAU-Math.PI/2)*9,y:172+y*.77-z*1.6,z:y*.7+z,alpha:.4+noise(i+81)*.6,segment});
  }start+=share;
 });return points.sort((a,b)=>a.z-b.z);
}
export function networkPoints(nodes,edges){
 const out=[];
 edges.forEach(([a,b],j)=>{for(let i=0;i<360;i++){
  const t=i/359,w=Math.sin(t*Math.PI)*8;
  out.push({x:nodes[a].x+(nodes[b].x-nodes[a].x)*t+(noise(i+j*71)-.5)*w,y:nodes[a].y+(nodes[b].y-nodes[a].y)*t+(noise(i+372)-.5)*w,z:0,alpha:.15+noise(i)*.45});
 }});
 nodes.forEach((n,index)=>{const count=index===0?2500:900;
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,angle=i*2.3999632297,r=Math.sqrt(1-y*y);
   let x=r*Math.cos(angle),z=r*Math.sin(angle),py=y;
   if(index===0){const u=i/count*TAU,v=noise(i)*TAU;x=(.84+.28*Math.cos(v))*Math.cos(u);py=(.84+.28*Math.cos(v))*Math.sin(u)*.64;z=.28*Math.sin(v);}
   out.push({x:n.x+x*n.r*1.42,y:n.y+py*n.r*1.42-z*n.r*.32,z,alpha:.2+(z+1)*.36,segment:index});
  }
 });return out;
}
export function curvePoints(values,lo,hi){
 const out=[];
 for(let i=0;i<7600;i++){
  const t=i/7599*(values.length-1),a=Math.floor(t),f=t-a,value=values[a]*(1-f)+(values[Math.min(values.length-1,a+1)])*f;
  const angle=noise(i)*TAU,r=4+noise(i+31)*9;
  out.push({x:60+t/(values.length-1)*650,y:306-(value-lo)/(hi-lo)*260+Math.cos(angle)*r,z:Math.sin(angle)*r,alpha:.16+noise(i+63)*.65});
 }return out;
}
export function evidencePoints(){
 const out=[];
 for(let level=0;level<4;level++)for(let a=0;a<72;a++)for(let b=0;b<38;b++){
  const edge=a===0||a===71||b===0||b===37,missing=level===1||level===2;
  if(missing&&!edge&&noise(a*38+b)>.06)continue;
  out.push({x:140+a*4.4+b*3.1,y:87+level*62-a*.68+b*1.7,z:level,alpha:missing?.35:.45+noise(a+b*72)*.55,segment:level});
 }return out;
}
