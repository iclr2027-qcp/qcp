import {trajectoryMaterial,spacedTrace} from './trajectory.mjs?v=studio-77';
import * as T from '../vendor/three/three.module.js';
import {createRobotBodies} from './robot-view.mjs?v=intro-17';
import {createTaskVisuals} from './task-scene.mjs?v=studio-77';
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const quat=(a,i)=>new T.Quaternion(a[i*4+1],a[i*4+2],a[i*4+3],a[i*4]);
const CLIP_SPAN=3.5;

// Recorded robot poses are successful MuJoCo executions. Liquid motion is illustrative.
// One shared workspace shows the examples in sequence; the motivation stays visible.
export class WineIntro{
 constructor(model,recording,renderer,meshCache,root){
  Object.assign(this,{recording,renderer,root});
  this.clips=[...recording.clips].sort((a,b)=>a.score-b.score);
  this.element=document.createElement('div');this.element.id='intro-stage';this.element.hidden=true;
  this.element.setAttribute('aria-label','One wine-serving task, replayed with different execution qualities. All executions succeed. QCP lets you choose how the robot moves.');root.append(this.element);
  this.element.innerHTML=`<section class="intro-demo" aria-label="Wine-serving examples"><div class="intro-robot-view" aria-label="MuJoCo wine-serving viewport"></div>
   <span class="intro-example">1 / 3</span><span class="intro-success"><span class="intro-served-check">✓</span><span class="intro-served-label">Serving</span></span>
   <span class="intro-lens" aria-hidden="true"></span>
   <div class="intro-motion"><strong>Wine spills</strong><svg viewBox="0 0 82 21" aria-hidden="true"><path/></svg></div>
   <div class="intro-example-track" aria-hidden="true"><span></span><span></span><span></span></div>
  </section>
  <section class="intro-message-panel" aria-label="Why execution quality matters">
   <h2><span class="intro-heading-line" data-edit-id="headline-line-1">Same success.</span><br><span class="intro-heading-line" data-edit-id="headline-line-2">Different quality.</span></h2>
   <div class="intro-quality-scale" aria-label="The examples progress from jerky to smooth delivery.">
    <div class="intro-quality-axis" aria-hidden="true"><span class="intro-quality-trail"></span><i></i><i></i><i></i><b></b></div>
    <div class="intro-quality-labels"><span>Jerky</span><span>Smooth</span></div>
   </div>
   <p class="intro-takeaway"><strong data-edit-id="takeaway-line-1">QCP lets you choose</strong><br><span data-edit-id="takeaway-line-2">how the robot moves.</span></p>
  </section>`;
  this.view=this.element.querySelector('.intro-robot-view');this.card=this.element.querySelector('.intro-demo');this.message=this.element.querySelector('.intro-message-panel');
  this.success=this.element.querySelector('.intro-success');this.label=this.element.querySelector('.intro-motion strong');
  this.path=this.element.querySelector('.intro-motion path');this.lens=this.element.querySelector('.intro-lens');
  this.segments=[...this.element.querySelectorAll('.intro-example-track span')];this.axis=this.element.querySelector('.intro-quality-axis');
  const scene=this.scene=new T.Scene();scene.background=new T.Color(0xf5f6f7);scene.fog=new T.Fog(0xf5f6f7,4,8);
  const world=this.world=new T.Group();world.rotation.x=-Math.PI/2;scene.add(world);
  this.bodies=createRobotBodies(model,world,meshCache);
  this.visuals=createTaskVisuals(world,this.bodies,{kind:'wine',payload:recording.payload,glasses:recording.glasses},{intro:true});
  const floor=new T.Mesh(new T.PlaneGeometry(10,10),new T.MeshStandardMaterial({color:0xeeeeef,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;floor.receiveShadow=true;scene.add(floor);
  scene.add(new T.HemisphereLight(0xffffff,0xb3bcc6,1.6));
  const light=new T.DirectionalLight(0xfffcf6,2.6);light.position.set(-.8,3,2);light.castShadow=true;light.shadow.mapSize.set(512,512);Object.assign(light.shadow.camera,{left:-1.2,right:1.6,top:1.6,bottom:-1.2,near:.1,far:6});light.shadow.normalBias=.006;scene.add(light);
  const fill=new T.DirectionalLight(0xcbdcff,.5);fill.position.set(2,1,-1);scene.add(fill);
  this.camera=new T.PerspectiveCamera(34,1,.02,15);this.camera.position.set(1.35,1.08,1.45);this.camera.lookAt(.43,.31,0);
  this.closeup=new T.OrthographicCamera(-.07,.07,.09,-.09,.005,3);
  this.trail=new T.Points(new T.BufferGeometry(),trajectoryMaterial());world.add(this.trail);
 }
 get duration(){return this.clips.length*CLIP_SPAN;}
 render(seconds){
  const {renderer,root,recording}=this,W=root.clientWidth,H=root.clientHeight,mobile=window.parent!==window?window.parent.matchMedia('(max-width:560px)').matches:W<560,margin=8;
  const compact=window.parent!==window?window.parent.matchMedia('(max-width:900px)').matches:W<800;
  const cardW=mobile?W-16:Math.round((W-16)*.55);
  const cardH=!compact?H-16:mobile?Math.min(238,Math.max(202,W*.68),H-180):Math.min(H-16,Math.max(240,cardW*.85));
  const x=margin,y=mobile||!compact?margin:Math.round((H-cardH)/2);
  Object.assign(this.card.style,{left:x+'px',top:y+'px',width:cardW+'px',height:cardH+'px'});
  Object.assign(this.message.style,mobile?{left:'18px',top:(cardH+20)+'px',width:(W-36)+'px',height:(H-cardH-32)+'px'}:{left:(cardW+32)+'px',top:'8px',width:(W-cardW-48)+'px',height:(H-56)+'px'});
  const index=Math.min(2,Math.floor(seconds/CLIP_SPAN)),local=seconds-index*CLIP_SPAN,clip=this.clips[index];
  const p=.235+.765*clamp((local/1.25-.1)/2.15),simTime=p*recording.duration;
  this.element.dataset.mobile=String(mobile);this.element.dataset.phase=seconds>=CLIP_SPAN*3?'complete':'compare';
  this.root.dataset.introPhase=this.element.dataset.phase;this.card.dataset.rollout=clip.id;
  if(this.current!==index){
   this.current=index;this.card.style.setProperty('--intro-color',['#818994','#628ab6','#2f629b'][index]);
   this.label.textContent=clip.label;this.element.querySelector('.intro-example').textContent=`${index+1} / 3`;
   this.card.setAttribute('aria-label',`${clip.label}. Example ${index+1} of 3. Both glasses are successfully served.`);
   const coords=clip.trace.map(([x,y,z])=>[5+(y+.28)/.57*72,16-(z-.30)/.23*11]);
   this.path.setAttribute('d',coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' '));
   this.trail.geometry.dispose();this.trail.geometry=new T.BufferGeometry().setFromPoints(spacedTrace(clip.trace).map(p=>new T.Vector3(...p)));
  }
  this.success.querySelector('.intro-served-label').textContent=p>=.99?'Served':'Serving';this.success.dataset.served=String(p>=.99);
  this.segments.forEach((s,i)=>s.style.setProperty('--progress',String(i<index?1:i===index?clamp(local/CLIP_SPAN):0)));
  // Move the quality marker with the example; scrubbing and pause share the same clock.
  const quality=index===0?0:(index-1+ease(local/.5))/2;this.axis.style.setProperty('--quality',quality);
  this.message.dataset.example=String(index);
  const frames=clip.frames;let i=0;while(i<frames.length-2&&frames[i+1].t<simTime)i++;
  const a=frames[i],b=frames[i+1],t=clamp((simTime-a.t)/(b.t-a.t));
  this.bodies.forEach((body,k)=>{body.position.set(...a.p.slice(k*3,k*3+3)).lerp(new T.Vector3(...b.p.slice(k*3,k*3+3)),t);body.quaternion.copy(quat(a.q,k)).slerp(quat(b.q,k),t);});this.world.updateMatrixWorld(true);
  const envelope=ease((p-.30)/.05)*(1-ease((p-.69)/.06)),amplitude=index===0?.96:index===1?.28:.035,loss=index===0?.68*ease((p-.37)/.28):0;
  this.visuals.update(0,{time:simTime,x:amplitude*Math.sin(simTime*7.5-1.1)*envelope,z:amplitude*.35*Math.cos(simTime*6.6)*envelope,volume:1-loss,spilling:index===0&&p>.38&&p<.65});
  this.card.dataset.spilling=String(index===0&&p>.38&&p<.65);this.card.dataset.volume=(1-loss).toFixed(2);
  this.trail.geometry.setDrawRange(0,Math.floor(clamp((p-.22)/.60)*this.trail.geometry.attributes.position.count));
  renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);renderer.setClearColor(getComputedStyle(root).getPropertyValue('--qcp-scene-background').trim()||0xf5f6f7);renderer.clear();renderer.setScissorTest(true);
  const rootRect=root.getBoundingClientRect(),vr=this.view.getBoundingClientRect();
  const view={x:vr.left-rootRect.left,y:vr.top-rootRect.top,w:Math.max(1,vr.width),h:Math.max(1,vr.height)};
  // Shift the workspace left and leave room for the inset beside the robot.
  const leftShift=compact?Math.min(48,Math.max(mobile?24:34,view.w*.10)):Math.max(42,view.w/2-132);
  this.camera.aspect=view.w/view.h;
  this.camera.fov=compact?Math.min(60,2*Math.atan(Math.tan(17*Math.PI/180)*Math.max(1,1.45/this.camera.aspect))*180/Math.PI):34;
  this.camera.setViewOffset(view.w,view.h,leftShift,0,view.w,view.h);
  renderer.setViewport(view.x,H-view.y-view.h,view.w,view.h);renderer.setScissor(view.x,H-view.y-view.h,view.w,view.h);renderer.render(this.scene,this.camera);
  let lens={x:x+cardW-110,y:y+39,w:88,h:102};
  Object.assign(this.lens.style,{left:(lens.x-x)+'px',top:(lens.y-y)+'px',width:lens.w+'px',height:lens.h+'px'});
  const lr=this.lens.getBoundingClientRect();lens={x:lr.left-rootRect.left,y:lr.top-rootRect.top,w:Math.max(1,lr.width),h:Math.max(1,lr.height)};
  // Track the midpoint of both glasses, instead of cropping around the first.
  const target=new T.Vector3();
  for(const id of recording.glasses)target.add(this.bodies[id].getWorldPosition(new T.Vector3()));
  target.multiplyScalar(1/recording.glasses.length).add(new T.Vector3(0,.073,0));
  this.closeup.left=-.096*lens.w/lens.h;this.closeup.right=.096*lens.w/lens.h;this.closeup.top=.096;this.closeup.bottom=-.096;this.closeup.position.copy(target).add(new T.Vector3(.16,.045,.24));this.closeup.lookAt(target);this.closeup.updateProjectionMatrix();
  renderer.setViewport(lens.x,H-lens.y-lens.h,lens.w,lens.h);renderer.setScissor(lens.x,H-lens.y-lens.h,lens.w,lens.h);renderer.render(this.scene,this.closeup);
  renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
 }
}
