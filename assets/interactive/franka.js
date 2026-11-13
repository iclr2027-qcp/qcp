import {trajectoryMaterial} from './trajectory.mjs?v=studio-77';
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import loadMujoco from '../vendor/mujoco/mujoco.js';
import {loadPeople} from './people.mjs?v=studio-77';
import { TaskPhysics } from './task-physics.mjs?v=studio-77';
import { createRobotBodies } from './robot-view.mjs?v=intro-17';
import { WineIntro } from './wine-intro.mjs?v=studio-87';
import { createTaskVisuals } from './task-scene.mjs?v=studio-77';
const root=document.getElementById('scene'),overlay=document.getElementById('loading'),status=document.getElementById('status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const params={quality:1,level:3,playing:parent===window&&!reduced.matches,active:parent===window,mode:'intro',autoPreview:false,introTime:0,iteration:0,restart:0};

let mj,sim,renderer,intro,introRecording,scene,camera,controls,world,visuals,bodies=[],loaded=false,renderNeeded=true,lastFrame=0,accumulator=0,hold=0,lastPhase='',lastSample=0,trial=0;
let line,trailGeometry,trailPoints=[],history=[],seenResult=false,controlReported=false,lastControlProgress='';
const COLLECTION_LIMIT=5,FAILURE_TRIAL=3,COLLECTION_SPEED=10;
let kept=0,excluded=0,collectionOrder=[],collectionIndex=0;
let collectionSeek=null,lastCollectionSeekId=null,lastCollectionProgress='';
const simulations={},meshCache=new Map();
const notify=message=>{if(parent!==window)parent.postMessage({source:'qcp-franka',...message},location.origin);};
const point=(array,index,v)=>v.set(array[index*3],array[index*3+1],array[index*3+2]);
const quaternion=(array,index,q)=>q.set(array[index*4+1],array[index*4+2],array[index*4+3],array[index*4]);
async function load(){
 await loadPeople();
 mj=await loadMujoco();mj.FS.mkdir('/qcp');mj.FS.mkdir('/qcp/assets');
 const base=new URL('../models/franka_fr3/',import.meta.url),files=await(await fetch(new URL('manifest.json',base))).json();let done=0;
 await Promise.all(files.map(async name=>{const r=await fetch(new URL(name,base));if(!r.ok)throw Error(name+': '+r.status);mj.FS.writeFile('/qcp/'+name,new Uint8Array(await r.arrayBuffer()));status.textContent=`Preparing the robot (${++done}/${files.length})`;}));
 for(const kind of ['wine','conveyor','safety']){const model=mj.MjModel.mj_loadXML('/qcp/'+kind+'.xml'),plan=await(await fetch(new URL(kind+'-plan.json',base))).json();simulations[kind]=new TaskPhysics(mj,model,kind,plan);simulations[kind].failurePlan=await(await fetch(new URL(kind+'-failure-plan.json',base))).json();simulations[kind].collectionPlans=await(await fetch(new URL(kind+'-collection-plans.json',base))).json();}
 simulations.conveyor.secondPlan=await(await fetch(new URL('conveyor-second-plan.json',base))).json();
 introRecording=await(await fetch(new URL('wine-intro-clips.json',base))).json();
 simulations.wine.failurePlan=await(await fetch(new URL('wine-failure-plan.json',base))).json();
}
function buildRobot(){bodies=createRobotBodies(sim.model,world,meshCache);}
function sync(){for(let i=0;i<bodies.length;i++){point(sim.data.xpos,i,bodies[i].position);quaternion(sim.data.xquat,i,bodies[i].quaternion);}world.updateMatrixWorld(true);}
function clearTrail(clearHistory=true){
 trailPoints=[];lastSample=0;if(line){world.remove(line);line.geometry.dispose();line.material.dispose();}
 trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(1500),3));trailGeometry.setDrawRange(0,0);line=new THREE.Points(trailGeometry,trajectoryMaterial());world.add(line);
 if(clearHistory){history.forEach(x=>{world.remove(x);x.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});});history=[];trial=0;kept=0;excluded=0;root.dataset.collectionComplete='false';root.dataset.trial='0';document.getElementById('rollouts').textContent='';updateCollection();}
}
function nextCollectionPlan(){
 const entry=collectionOrder[collectionIndex++%collectionOrder.length];
 sim.setCollectionPlan(entry.plan);root.dataset.trajectory=String(entry.id);
}
function useTask(resetCamera=true,preserveCollectionOrder=false){
 collectionSeek=null;lastCollectionSeekId=null;lastCollectionProgress='';root.dataset.seeking='false';
 const kind=params.quality===0?'conveyor':params.quality===3?'safety':'wine';
 if(sim?.kind!==kind){if(visuals)visuals.dispose();for(const body of bodies){world.remove(body);body.traverse(o=>{if(o.material)o.material.dispose();});}bodies=[];sim=simulations[kind];buildRobot();sync();visuals=createTaskVisuals(world,bodies,sim);}
 sim.configure(params.quality,params.level,params.iteration);
 if(params.mode==='collect'){
  if(!preserveCollectionOrder||!collectionOrder.length){
   collectionOrder=sim.collectionPlans.map((entry,id)=>({...entry,id}));
   for(let i=collectionOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[collectionOrder[i],collectionOrder[j]]=[collectionOrder[j],collectionOrder[i]];}
  }
  collectionIndex=0;nextCollectionPlan();sim.reset();
 }
 sync();visuals.reset(true);hold=0;seenResult=false;controlReported=false;lastControlProgress='';root.dataset.controlComplete='false';root.dataset.outcome='running';clearTrail();accumulator=0;renderNeeded=true;
 root.dataset.task=kind;updateLabel();if(resetCamera)setCamera();
}
function updateLabel(){
 if(intro)intro.element.hidden=params.mode!=='intro';if(controls)controls.enabled=params.mode!=='intro';
 renderer?.domElement.setAttribute('aria-label',params.mode==='intro'?'One wine-serving task, replayed with different execution qualities.':'3D task view. Drag to orbit the camera. Expand the view for zoom controls.');
 document.getElementById('behavior').textContent=params.mode==='collect'?'High-quality':params.quality===0?'Conveyor pickup':params.quality===3?'Shared assembly':'Wine serving';
 root.dataset.level=String(params.level);root.dataset.quality=['speed','smoothness','stability','safety'][params.quality];root.dataset.playing=String(params.playing);root.dataset.mode=params.mode;
 line.visible=params.mode!=='intro';history.forEach(l=>l.visible=params.mode==='collect');
}
function buildScene(){
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D task view. Drag to orbit the camera. Expand the view for zoom controls.');root.prepend(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0xf4f6f9);scene.fog=new THREE.Fog(0xf4f6f9,3.5,7);
 world=new THREE.Group();world.rotation.x=-Math.PI/2;scene.add(world);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:0xe9edf1,roughness:1}));floor.receiveShadow=true;floor.position.z=-.002;world.add(floor);
 const grid=new THREE.GridHelper(3,30,0xd9e0e8,0xe3e8ee);grid.position.y=.0005;scene.add(grid);
 scene.add(new THREE.HemisphereLight(0xffffff,0xa1b1c7,1.4));const light=new THREE.DirectionalLight(0xfffaf3,2.5);light.position.set(-.8,3,2);light.castShadow=true;light.shadow.mapSize.set(1536,1536);Object.assign(light.shadow.camera,{left:-1.3,right:1.6,top:1.6,bottom:-1.3,near:.1,far:6});light.shadow.normalBias=.006;scene.add(light);
 const fill=new THREE.DirectionalLight(0xbad5ff,.7);fill.position.set(2,1,-1);scene.add(fill);
 camera=new THREE.PerspectiveCamera(34,1,.02,15);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=.8;controls.maxDistance=3.5;controls.maxPolarAngle=Math.PI*.48;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.addEventListener('change',()=>{renderNeeded=true;});
 useTask();new ResizeObserver(resize).observe(root);resize();renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')setCamera();});
}
function setCamera(){camera.position.set(...(sim?.kind==='safety'?[1.13,1.74,1.24]:[1.35,1.08,1.45]));controls.target.set(.42,.31,0);controls.update();renderNeeded=true;}
function drawScene(){
 if(params.mode==='intro')intro.render(params.introTime);else{scene.background.set(getComputedStyle(root).getPropertyValue('--qcp-scene-background').trim()||0xf4f6f9);scene.fog.color.copy(scene.background);renderer.render(scene,camera);}
 renderNeeded=false;
}
let renderWidth=0,renderHeight=0;
function resize(){
 if(!renderer||!root.clientWidth||!root.clientHeight)return;
 const width=root.clientWidth,height=root.clientHeight;
 // Assigning canvas dimensions clears WebGL, even when the size is unchanged.
 if(width!==renderWidth||height!==renderHeight){renderer.setSize(width,height,false);renderWidth=width;renderHeight=height;}
 const compact=window.parent!==window?window.parent.matchMedia('(max-width:900px)').matches:width<560;
 // A small embedded canvas should not consume the page's scrolling gesture.
 root.dataset.compact=String(compact&&!document.fullscreenElement);
 controls.enableZoom=!compact||!!document.fullscreenElement;
 const fitAspect=compact&&sim?.kind==='safety'?1.65:1.85;
 camera.aspect=width/height;camera.fov=Math.min(65,2*Math.atan(Math.tan(17*Math.PI/180)*Math.max(1,fitAspect/camera.aspect))*180/Math.PI);
 const choose=params.mode==='choose';
 const tabletChoose=choose&&window.parent!==window&&window.parent.matchMedia('(min-width:561px) and (max-width:700px)').matches;
 const offsetX=tabletChoose?-Math.min(24,width*.06):['control','collect'].includes(params.mode)?-Math.min(28,width*.05):(width<360?10:14)-(choose?Math.min(18,width*.035):0);
 const offsetY=tabletChoose?-Math.min(22,height*.11):choose?-Math.min(20,height*.055):0;
 camera.setViewOffset(width,height,offsetX,offsetY,width,height);
 renderNeeded=true;if(loaded)drawScene();
}
function sampleTrail(){if(!sim.grasped||sim.released||sim.time-lastSample<.04)return;lastSample=sim.time;const p=sim.data.xpos.slice(sim.payload*3,sim.payload*3+3);if(trailPoints.length&&Math.hypot(...p.map((v,i)=>v-trailPoints[trailPoints.length-3+i]))<.03)return;trailPoints.push(...p);const attr=trailGeometry.attributes.position;attr.array.set(trailPoints.slice(0,1500));attr.needsUpdate=true;trailGeometry.setDrawRange(0,Math.min(500,trailPoints.length/3));}
function updateCollection(){
 document.getElementById('collection-rate').textContent=`${trial} / ${COLLECTION_LIMIT} rollouts`;
 document.getElementById('collection-summary').textContent=`${kept} kept · ${excluded} excluded`;
 document.getElementById('collection-complete').setAttribute('aria-label',`${kept} new high-quality rollouts collected; ${excluded} failed rollout${excluded===1?'':'s'} filtered out. Relabel the accumulated experience and retrain QCP with these rollouts.`);
 root.dataset.trial=String(trial);root.dataset.kept=String(kept);root.dataset.excluded=String(excluded);root.dataset.filtered=String(excluded>0);document.getElementById('collection-complete').hidden=trial<COLLECTION_LIMIT;
}
function finish(announce=true){
 const measured=sim.result();
 // Wine uses an intentionally misplaced trajectory; gravity and measured success determine its outcome.
 const demonstrationFailure=params.mode==='collect'&&trial===FAILURE_TRIAL-1;
 const result={...measured,success:measured.success,demonstrationFailure};
 root.dataset.outcome=result.success?'success':'retry';root.dataset.metric=result.metric;document.querySelector('.collection-rejection').textContent='Failures filtered';
 if(params.mode==='collect'){
  trial++;
  if(result.success){
   kept++;
   const stored=new THREE.Group();
   const points=Array.from({length:trailPoints.length/3},(_,i)=>new THREE.Vector3(...trailPoints.slice(i*3,i*3+3)));
   if(points.length>1){
    stored.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(points),trajectoryMaterial(.90)));
   }
   world.add(stored);history.push(stored);
  }else{excluded++;line.material.color.set(0xaeb6c1);line.material.opacity=.18;}
  const token=document.createElement('span');token.dataset.editId=`rollout-${trial}`;token.dataset.editLabel=`Rollout ${trial} 배지`;const name=document.createElement('span'),mark=document.createElement('span');name.className='rollout-name';mark.className='rollout-result';name.textContent=`τ${trial}`;mark.textContent=result.success?'✓':'× filtered';token.append(name,' ',mark);token.className=result.success?'success':'failure';token.title=result.success?'Added to replay':demonstrationFailure?'Failure example: excluded from replay':'Failed rollout: excluded from replay';token.setAttribute('aria-label',`Rollout ${trial}: ${token.title}`);document.getElementById('rollouts').append(token);
  updateCollection();if(announce)notify({type:'rollout',...result,restart:params.restart,seekId:lastCollectionSeekId,trial,trace:Array.from({length:32},(_,i)=>{const j=Math.round(i/31*(trailPoints.length/3-1))*3;return trailPoints.slice(j,j+3);})});
  if(trial===COLLECTION_LIMIT){root.dataset.collectionComplete='true';params.playing=false;root.dataset.playing='false';if(announce)notify({type:'collection-complete',quality:params.quality,restart:params.restart,seekId:lastCollectionSeekId,trial,kept,excluded});}
 }
}
const collectionHold=count=>count===FAILURE_TRIAL?.45:.08;
function collectionDuration(){let seconds=COLLECTION_LIMIT*sim.duration/COLLECTION_SPEED;for(let i=1;i<COLLECTION_LIMIT;i++)seconds+=collectionHold(i);return seconds;}
function collectionFraction(){
 if(trial===COLLECTION_LIMIT)return 1;
 const completed=seenResult?trial-1:trial;
 let seconds=(completed*sim.duration+Math.min(sim.time,sim.duration))/COLLECTION_SPEED;
 for(let i=1;i<=completed;i++)seconds+=collectionHold(i);
 if(seenResult)seconds+=Math.min(hold,collectionHold(trial));
 return Math.min(1,seconds/collectionDuration());
}
function nextRollout(){
 sim.cycle++;if(params.mode==='collect'&&trial!==FAILURE_TRIAL-1)nextCollectionPlan();sim.setFailureTrial(params.mode==='collect'&&trial===FAILURE_TRIAL-1);sim.reset();accumulator=0;sync();visuals.reset();clearTrail(false);line.visible=params.mode!=='intro';hold=0;seenResult=false;root.dataset.outcome='running';
}
function seekCollection(request){
 // Reuse this collection's shuffled plans so rewinding preserves the same paths.
 useTask(false,true);lastCollectionSeekId=request.id;
 collectionSeek={id:request.id,fraction:request.fraction,remaining:request.fraction*collectionDuration(),visualTime:0};
 root.dataset.seeking='true';
}
function advanceCollectionSeek(){
 const job=collectionSeek,deadline=performance.now()+8,step=sim.model.opt.timestep;
 // Replay real physics in short slices, allowing a newer scrub request to replace this one.
 while(job.remaining>1e-8&&trial<COLLECTION_LIMIT){
  if(sim.done){
   if(!seenResult){finish(false);seenResult=true;}
   if(trial===COLLECTION_LIMIT)break;
   const wait=Math.min(job.remaining,Math.max(0,collectionHold(trial)-hold));hold+=wait;job.remaining-=wait;
   if(hold>=collectionHold(trial)-1e-8&&job.remaining>1e-8){nextRollout();job.visualTime=0;}
  }else{
   if(job.remaining<step/COLLECTION_SPEED-1e-8)break;
   sim.step();sampleTrail();job.remaining-=step/COLLECTION_SPEED;
   // Account for floating point accumulation at the exact final physics step.
   if(!sim.done&&sim.time>=sim.duration-1e-8){sim.step();sampleTrail();}
   if(sim.time-job.visualTime>=.1){sync();visuals.update(sim.time-job.visualTime);job.visualTime=sim.time;}
  }
  if(performance.now()>=deadline)return;
 }
 if(sim.done&&!seenResult){finish(false);seenResult=true;}
 sync();if(sim.time>job.visualTime)visuals.update(sim.time-job.visualTime);
 collectionSeek=null;accumulator=0;lastFrame=0;renderNeeded=true;root.dataset.seeking='false';
 notify({type:'collection-seeked',quality:params.quality,restart:params.restart,seekId:job.id,fraction:job.fraction,cycleProgress:sim.fraction,trial,kept,excluded});
}
function playbackSpeed(){return params.mode==='collect'?COLLECTION_SPEED:params.mode==='control'?(sim.kind==='conveyor'?[1.3,1.65,2.3,3.4][params.level]:1.3):1;}
function animate(now){
 requestAnimationFrame(animate);const dt=lastFrame?Math.min((now-lastFrame)/1000,.04):0;lastFrame=now;
 if(!loaded||document.hidden)return;
 if(collectionSeek){advanceCollectionSeek();if(collectionSeek)return;}
 if(!params.active)return;
 if(params.mode==='intro'){if(renderNeeded||params.playing){intro.render(params.introTime);renderNeeded=false;}return;}
 if(params.playing&&(params.mode!=='collect'||trial<COLLECTION_LIMIT)){
  if(sim.done){
   if(!seenResult){finish();seenResult=true;}hold+=dt;
   if(params.mode==='control'){
    if(sim.kind==='conveyor'&&params.level>0&&sim.cycle===0&&hold>.12){
     visuals.keepPlacement();const firstPath=new THREE.Points(trailGeometry.clone(),trajectoryMaterial(.9));world.add(firstPath);history.push(firstPath);root.dataset.outcome='running';sim.cycle=1;sim.plan=sim.secondPlan;sim.reset();sync();visuals.reset();clearTrail(false);hold=0;seenResult=false;accumulator=0;
    }else if(hold>.6&&!controlReported){controlReported=true;root.dataset.controlComplete='true';notify({type:'control-complete',quality:params.quality,level:params.level,restart:params.restart});}
   }else if(hold>(params.mode==='collect'?(trial===FAILURE_TRIAL?.45:.08):.75)&&!(params.mode==='collect'&&trial>=COLLECTION_LIMIT)){
    nextRollout();
   }
  }
  else{accumulator+=dt*(playbackSpeed());while(accumulator>=sim.model.opt.timestep&&!sim.done){sim.step();sampleTrail();accumulator-=sim.model.opt.timestep;}sync();}
  visuals.update(dt*(playbackSpeed()));renderNeeded=true;
 }
 root.dataset.failureTrial=String(sim.failureTrial);root.dataset.released=String(sim.released);
 if(params.mode==='collect'){
  const fraction=collectionFraction(),key=fraction.toFixed(4);root.dataset.progress=key;
  if(params.playing&&key!==lastCollectionProgress){lastCollectionProgress=key;notify({type:'collection-progress',quality:params.quality,restart:params.restart,seekId:lastCollectionSeekId,fraction,cycleProgress:sim.fraction});}
 }
 if(params.mode==='control'&&params.playing){
  const fraction=sim.kind==='conveyor'&&params.level>0?(sim.cycle+sim.fraction)/2:sim.fraction,key=`${sim.cycle}:${fraction.toFixed(2)}`;
  if(key!==lastControlProgress){lastControlProgress=key;root.dataset.progress=fraction.toFixed(3);notify({type:'control-progress',quality:params.quality,level:params.level,restart:params.restart,fraction});}
 }
 const phase=sim.phase;if(phase!==lastPhase){lastPhase=phase;document.getElementById('phase').textContent=phase;root.dataset.phase=phase;}
 document.getElementById('task-progress').style.width=(sim.fraction*100)+'%';controls.update();if(renderNeeded){renderer.render(scene,camera);renderNeeded=false;}
}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin||event.data?.source!=='qcp-story'||event.data.type!=='state')return;
 const v=event.data,quality=Number.isInteger(v.quality)&&v.quality>=0&&v.quality<=3?v.quality:1,level=Number.isInteger(v.level)&&v.level>=0&&v.level<=3?v.level:3,mode=['intro','choose','control','collect','train'].includes(v.mode)?v.mode:'choose',iteration=Number.isInteger(v.iteration)?Math.max(0,Math.min(3,v.iteration)):0;
 const restart=Number.isSafeInteger(v.restart)?v.restart:0;
 const reset=restart!==params.restart||quality!==params.quality||level!==params.level||iteration!==params.iteration||mode!==params.mode&&['collect','control','choose'].includes(mode);const taskChange=quality!==params.quality,modeChange=mode!==params.mode;
 Object.assign(params,{quality,level,mode,autoPreview:Boolean(v.autoPreview),introTime:Number.isFinite(v.introTime)?Math.max(0,Math.min(12.5,v.introTime)):0,iteration,restart,playing:Boolean(v.playing),active:Boolean(v.active)});
 if(loaded){
  if(reset)useTask(taskChange);else updateLabel();
  if(mode==='collect'&&Number.isSafeInteger(v.collectionSeek?.id)&&Number.isFinite(v.collectionSeek?.fraction)&&v.collectionSeek.id!==lastCollectionSeekId)seekCollection({id:v.collectionSeek.id,fraction:Math.max(0,Math.min(1,v.collectionSeek.fraction))});
  if(mode!=='collect'){collectionSeek=null;root.dataset.seeking='false';}
  if(modeChange)resize();renderNeeded=true;
 }
});
document.getElementById('reset').addEventListener('click',()=>{if(params.mode==='collect'&&parent!==window)notify({type:'collection-restart'});else useTask();});
const expand=document.getElementById('expand');expand.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{}});document.addEventListener('fullscreenchange',()=>expand.setAttribute('aria-label',document.fullscreenElement?'Exit full screen':'Expand 3D view'));
document.addEventListener('visibilitychange',()=>{lastFrame=0;});reduced.addEventListener('change',e=>{if(e.matches)params.playing=false;});// The parent owns viewport visibility, including reopening the hidden training iframe.

try{await load();buildScene();intro=new WineIntro(simulations.wine.model,introRecording,renderer,meshCache,root);updateLabel();loaded=true;resize();if(renderNeeded)drawScene();root.qcpCaptureFrame=drawScene;overlay.hidden=true;root.dataset.ready='true';notify({type:'ready',introExamplesDuration:intro.duration});requestAnimationFrame(animate);}catch(error){console.error('QCP scene:',error);status.textContent='The 3D task could not load. Reload to try again.';root.dataset.ready='error';notify({type:'error'});}
