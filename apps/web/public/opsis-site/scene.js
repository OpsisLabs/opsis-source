import {c} from './locale.js';
import * as THREE from './assets/vendor/build/three.module.min.js';
import {createNewsCloud} from './news-cloud.js?v=data-18';
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export async function createScanner({open,jump}){
 const canvas=document.querySelector('#scanner'),container=document.querySelector('#scene'),track=document.querySelector('#experience');
 const [metaResponse,dataResponse,depthResponse]=await Promise.all([fetch('assets/chain-points.json'),fetch('assets/chain-points.bin'),fetch('assets/chain-depth.bin')]);if(!metaResponse.ok||!dataResponse.ok||!depthResponse.ok)throw Error('Blockchain asset unavailable');
 const [meta,buffer,depthBuffer]=await Promise.all([metaResponse.json(),dataResponse.arrayBuffer(),depthResponse.arrayBuffer()]);if(buffer.byteLength!==meta.total*meta.stride)throw Error('Blockchain point data is incomplete');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x1000ff,0);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,80);camera.position.set(0,0,24);camera.lookAt(0,0,0);
 const newsCloud=createNewsCloud({THREE,scene,camera});
 // An eight-character glyph texture; every glyph sits on the real Blockchain's sampled surface.
 const glyphCanvas=document.createElement('canvas');glyphCanvas.width=256;glyphCanvas.height=32;const ctx=glyphCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.font='bold 27px monospace';ctx.textAlign='center';ctx.textBaseline='middle';[...'.:+*X01N'].forEach((c,i)=>ctx.fillText(c,i*32+16,17));const atlas=new THREE.CanvasTexture(glyphCanvas);atlas.minFilter=THREE.LinearFilter;atlas.magFilter=THREE.NearestFilter;atlas.generateMipmaps=false;
 const uniforms={atlas:{value:atlas},pointSize:{value:4.5},sweep:{value:20},scan:{value:0},fade:{value:1}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,vertexShader:`attribute vec3 aNormal;attribute float aSeed;varying float vLight;varying float vSeed;varying float vSweep;uniform float pointSize;uniform float sweep;uniform float scan;void main(){vec4 wp=modelMatrix*vec4(position+aNormal*.017,1.);vec3 n=normalize(mat3(modelMatrix)*aNormal);vLight=.38+.62*pow(abs(dot(n,normalize(vec3(-.35,.5,1.)))),.75);vSeed=aSeed;vSweep=exp(-pow((wp.y-sweep)*2.,2.))*scan;gl_Position=projectionMatrix*viewMatrix*wp;gl_Position.z-=.00015;gl_PointSize=pointSize+vSweep*1.2;}`,
 fragmentShader:`uniform sampler2D atlas;uniform float fade;varying float vLight;varying float vSeed;varying float vSweep;void main(){float cell=floor(vSeed*8.);vec2 uv=vec2((cell+gl_PointCoord.x)/8.,1.-gl_PointCoord.y);float a=texture2D(atlas,uv).a;if(a<.1)discard;gl_FragColor=vec4(vec3(1.),a*min(1.,vLight*.96+vSweep*.65)*fade);}`});
 const units=[],depths=[],centers=[],hitboxes=[],labels=[...document.querySelectorAll('.module-label')];const view=new DataView(buffer);
 for(let i=0;i<meta.parts.length;i++){
  const part=meta.parts[i],positions=new Float32Array(part.count*3),normals=new Float32Array(part.count*3),seeds=new Float32Array(part.count);
  for(let j=0;j<part.count;j++){const o=(part.offset+j)*16;for(let k=0;k<3;k++){positions[j*3+k]=view.getFloat32(o+k*4,true);normals[j*3+k]=view.getInt8(o+12+k)/127}seeds[j]=((j*73+17)%997)/997}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aNormal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));geometry.computeBoundingSphere();
  const points=new THREE.Points(geometry,material);points.userData.module=i;points.renderOrder=2;scene.add(points);units.push(points);
  const depthGeometry=new THREE.BufferGeometry();depthGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(depthBuffer,part.depthOffset*12,part.depthCount*3),3));const depthMesh=new THREE.Mesh(depthGeometry,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide}));depthMesh.renderOrder=0;scene.add(depthMesh);depths.push(depthMesh);centers.push(new THREE.Vector3(...part.center));
  const hit=new THREE.Mesh(new THREE.BoxGeometry(...part.size.map(s=>Math.max(.35,s))),new THREE.MeshBasicMaterial({visible:false}));hit.userData.module=i;scene.add(hit);hitboxes.push(hit);
 }
 // Actual spatial links preserve the chain as the six nodes move.
 const scanLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6.2,0,0),new THREE.Vector3(6.2,0,0)]),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.35}));scene.add(scanLine);
 const home=Array.from({length:6},(_,i)=>new THREE.Vector3((i-2.5)*2.25,0,0));
 const intro=document.querySelector('#intro'),scanCopy=document.querySelector('#scan-copy'),reveal=document.querySelector('#reveal-title'),spec=document.querySelector('#spec-label'),labelRoot=document.querySelector('#module-labels'),progress=document.querySelector('#progress-fill'),phaseLabel=document.querySelector('#phase-label'),instructions=document.querySelector('#scroll-instruction'),load=document.querySelector('#load-state'),chapters=[...document.querySelectorAll('.chapters button')];
 let width=0,height=0,small=false,labelWidths=[],p=0,target=0,raf=0,last=0,paused=false,visible=true,hover=-1,animating=true,drawn=false,previousPhase=-1,motionTime=0,unwrappedTime=0,ambient=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let reducedMotion=reduced.matches;
 const hoverStates=Array(6).fill(0),projected=new THREE.Vector3(),position=new THREE.Vector3(),startQuat=new THREE.Quaternion(),endQuat=new THREE.Quaternion(),q=new THREE.Quaternion(),spinQuat=new THREE.Quaternion(),spinEuler=new THREE.Euler();
 function readScroll(){target=reducedMotion?.94:clamp((scrollY-track.offsetTop)/Math.max(1,track.offsetHeight-innerHeight),0,1);request()}
 function resize(){width=container.clientWidth;height=container.clientHeight;small=width<780;labelWidths=labels.map(b=>b.offsetWidth);renderer.setSize(width,height,false);const v=small?Math.max(13.8,10.5*height/width):Math.max(5.0,16.3*height/width);camera.top=v/2;camera.bottom=-v/2;camera.left=-v*width/height/2;camera.right=-camera.left;camera.updateProjectionMatrix();uniforms.pointSize.value=(small?3.2:4.3)*renderer.getPixelRatio();units.forEach((u,i)=>u.geometry.setDrawRange(0,Math.floor(meta.parts[i].count*1)));readScroll()}
 function request(){if(!raf&&!paused&&visible&&!document.hidden)raf=requestAnimationFrame(frame)}
 function frame(time){raf=0;if(paused||!visible||document.hidden)return;const moving=Math.abs(p-target)>.001;const dt=last?Math.min((time-last)/1000,.05):.016;if(!reducedMotion&&!moving&&time-last<32){request();return}last=time;if(animating&&!reducedMotion)motionTime+=dt;p=reducedMotion?target:lerp(p,target,1-Math.exp(-dt*15));if(Math.abs(p-target)<.0001)p=target;
  const separate=smooth(.47,.86,p),scanPhase=smooth(.15,.5,p),spin=smooth(.86,.90,p);
  if(p<.86)unwrappedTime=0;else if(p>=.8999&&animating&&!reducedMotion)unwrappedTime+=dt;
  const drift=animating&&!reducedMotion?Math.sin(motionTime*.18)*.035:0;
  startQuat.setFromEuler(new THREE.Euler(lerp(.42,.70,scanPhase),lerp(-.22,.12,scanPhase),(small?.95:clamp(height/width*.95,.24,.52))-scanPhase*.12+drift));endQuat.setFromEuler(new THREE.Euler(.28,-.28,-.18));
  const scanActive=smooth(.13,.24,p)*(1-smooth(.52,.65,p));uniforms.scan.value=scanActive;uniforms.sweep.value=lerp(3.2,-3.2,scanPhase);scanLine.visible=scanActive>.01;scanLine.position.set(0,uniforms.sweep.value,2);scanLine.material.opacity=scanActive*.35;
  const scaleStart=small?.94:lerp(1.2,1,scanPhase);
  for(let i=0;i<6;i++){
   const u=units[i],stagger=smooth(.46+i*.01,.76+i*.015,p);hoverStates[i]=lerp(hoverStates[i],hover===i?1:0,1-Math.exp(-dt*12));
   position.copy(home[i]).multiplyScalar(scaleStart).applyQuaternion(startQuat);
   if(!small){position.x+=2*(1-scanPhase);position.y-=1.3*(1-scanPhase)}
   const row=small?Math.floor(i/2):Math.floor(i/3),col=small?i%2:i%3;
   const dx=small?(col-.5)*camera.right*.98:(col-1)*camera.right*.61;
   const dy=small?camera.top*.62-row*camera.top*.64:camera.top*.60-row*camera.top*1.08;
   const destination=new THREE.Vector3(dx,dy,0);u.position.copy(position).lerp(destination,stagger);
   if(!reducedMotion){u.position.y+=Math.sin(motionTime*.5)*.035+Math.sin(unwrappedTime*.8+i)*.07*spin;u.position.x+=Math.cos(unwrappedTime*.48+i)*.035*spin;}u.position.y+=hoverStates[i]*.10*spin;
   q.copy(startQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),i%2?Math.PI/2:0)).slerp(endQuat,stagger);u.quaternion.copy(q);
   // Start the idle turn clock only after every link has finished unwrapping.
   // Quaternion blending avoids multiplying a long-running angle by scroll progress.
   if(!reducedMotion&&spin>0){spinEuler.set((Math.sin(unwrappedTime*.62+i)-Math.sin(i))*.22,(Math.sin(unwrappedTime*.28+i*.35)-Math.sin(i*.35))*.35,(Math.sin(unwrappedTime*.48+i)-Math.sin(i))*.16,'YXZ');spinQuat.setFromEuler(spinEuler).premultiply(endQuat);u.quaternion.slerp(spinQuat,spin)}
   u.rotateY(hoverStates[i]*.13*spin);
   const endScale=small?Math.min(.96,camera.right*.19):Math.min(.98,camera.top*.23);u.scale.setScalar(lerp(scaleStart,endScale,stagger));
   const depthMesh=depths[i];depthMesh.position.copy(u.position);depthMesh.quaternion.copy(u.quaternion);depthMesh.scale.copy(u.scale);
   const hit=hitboxes[i];hit.position.copy(u.position);hit.quaternion.copy(u.quaternion);hit.scale.copy(u.scale);hit.updateMatrixWorld(true);
   projected.copy(u.position);projected.y-=u.scale.x*1.1;projected.project(camera);const sx=(projected.x*.5+.5)*width,sy=(-projected.y*.5+.5)*height;
   labels[i].style.transform=`translate(${(sx-labelWidths[i]/2).toFixed(1)}px,${sy.toFixed(1)}px)`;const a=smooth(.78,.90,p);labels[i].style.opacity=a;labels[i].tabIndex=a>.8&&!labels[i].hidden?0:-1;labels[i].setAttribute('aria-hidden',String(a<=.8||labels[i].hidden));
  }
  const a=1-smooth(.10,.24,p);intro.style.opacity=a;intro.style.visibility=a<.01?'hidden':'visible';intro.style.transform=`translateY(${-smooth(.1,.24,p)*30}px)`;scanCopy.style.opacity=smooth(.22,.30,p)*(1-smooth(.52,.62,p));reveal.style.opacity=smooth(.62,.76,p);reveal.setAttribute('aria-hidden',String(p<.62));spec.style.opacity=1-smooth(.2,.45,p);labelRoot.classList.toggle('enabled',p>.87);labelRoot.inert=p<=.87;progress.style.transform=`scaleX(${p})`;
  const phase=p<.24?0:p<.66?1:2;if(phase!==previousPhase){container.closest('.viewport').dataset.phase=String(phase);phaseLabel.textContent=[c('// OVERVIEW','// 概览'),c('// CHAIN ANALYSIS','// 链条分析'),c('// INTELLIGENCE MODULES','// 分析工具')][phase];chapters.forEach((b,i)=>b.classList.toggle('active',i===phase));instructions.textContent=phase===2?c('Choose a tool above','选择上方的工具'):c('Scroll to explore the chain ↓','滚动探索链条 ↓');previousPhase=phase}
  newsCloud.update(time,{active:animating&&!reducedMotion,small,enabled:ambient&&!reducedMotion});renderer.render(scene,camera);canvas.dataset.state='ready';canvas.dataset.phase=String(phase);canvas.dataset.points=String(renderer.info.render.points);canvas.dataset.drawCalls=String(renderer.info.render.calls);
  if(!drawn){drawn=true;container.classList.add('ready');load.textContent=c('CHAIN 001 / READY','链条 001 / 已就绪');document.dispatchEvent(new Event('chain-ready'))}
  if((animating&&!reducedMotion)||Math.abs(p-target)>.0001||hoverStates.some((x,i)=>Math.abs(x-(hover===i?1:0))>.005))request();
 }
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();function pick(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(hitboxes,false)[0]?.object.userData.module??-1}
 let down;canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY]});canvas.addEventListener('pointermove',e=>{if(p<.7)return;const hit=pick(e);if(hit!==hover){hover=hit;canvas.style.cursor=hit<0||labels[hit].hidden?'default':'pointer';request()}});canvas.addEventListener('pointerleave',()=>{hover=-1;request()});canvas.addEventListener('click',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])>8)return;const i=pick(e);if(i>=0){if(p<.7)jump(.92);else if(!labels[i].hidden)open(i)}});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;cancelAnimationFrame(raf);raf=0;container.classList.remove('ready');document.body.classList.add('no-webgl');load.textContent=c('STATIC VIEW / TOOLS BELOW','静态视图 / 工具在下方')});
 new ResizeObserver(resize).observe(container);window.addEventListener('scroll',readScroll,{passive:true});window.addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',()=>{last=0;request()});new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){last=0;request()}else{cancelAnimationFrame(raf);raf=0}}).observe(container);reduced.addEventListener('change',()=>{reducedMotion=reduced.matches;readScroll()});resize();
 let hiddenRing=-1;
 function restoreRing(){if(hiddenRing>=0){units[hiddenRing].visible=true;depths[hiddenRing].visible=true;hiddenRing=-1;renderer.render(scene,camera)}}
 function transitionRing(i){restoreRing();const u=units[i],r=canvas.getBoundingClientRect();if(!u||r.bottom<0||r.top>innerHeight)return {points:[]};u.updateMatrixWorld(true);const attr=u.geometry.attributes.position,point=new THREE.Vector3(),points=[];for(let n=0;n<attr.count;n+=5){point.fromBufferAttribute(attr,n).applyMatrix4(u.matrixWorld).project(camera);const x=r.x+(point.x*.5+.5)*r.width,y=r.y+(-point.y*.5+.5)*r.height;if(x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight)points.push({x,y})}point.copy(u.position).project(camera);const origin={x:r.x+(point.x*.5+.5)*r.width,y:r.y+(-point.y*.5+.5)*r.height};if(points.length){hiddenRing=i;u.visible=false;depths[i].visible=false;renderer.render(scene,camera)}return {points,origin}}
 return {refreshLayout:resize,transitionRing,restoreRing,setAmbient(v){ambient=v;request()},highlight(i){hover=i;request()},setPaused(v){paused=v;newsCloud.pause();if(v){cancelAnimationFrame(raf);raf=0}else{last=0;request()}},setMotion(v){animating=v;request()}};
}
