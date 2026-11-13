import * as T from '../vendor/three/three.module.js';
import {addPerson} from './people.mjs?v=studio-77';
const mat=(color,options={})=>new T.MeshPhysicalMaterial({color,roughness:.55,...options});
const metal=mat(0xaab9c7,{metalness:.72,roughness:.28}),wood=mat(0x765640),navy=mat(0x334e6a),cloth=mat(0xf5f1e9,{roughness:.95}),dark=mat(0x25313e),blue=mat(0x92afd6),brass=mat(0xb99a64,{metalness:.7,roughness:.32});
function mesh(parent,geometry,material,pos=[0,0,0]){const m=new T.Mesh(geometry,material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const box=(p,s,c,pos)=>mesh(p,new T.BoxGeometry(...s),c,pos);
function cylinder(p,r,h,c,pos){const g=new T.CylinderGeometry(r,r,h,48);g.rotateX(Math.PI/2);return mesh(p,g,c,pos);}
function bar(p,a,b,r,c){const pa=new T.Vector3(...a),pb=new T.Vector3(...b),m=mesh(p,new T.CylinderGeometry(r,r,pa.distanceTo(pb),16),c);m.position.copy(pa).add(pb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),pb.sub(pa).normalize());return m;}
function limb(p,a,b,r,c){const pa=new T.Vector3(...a),pb=new T.Vector3(...b),m=mesh(p,new T.CapsuleGeometry(r,Math.max(.001,pa.distanceTo(pb)-2*r),8,16),c);m.position.copy(pa).add(pb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),pb.sub(pa).normalize());return m;}
function table(p,x,y,sx,sy,top=.29){box(p,[sx,sy,.028],wood,[x,y,top-.017]);for(const dx of [-1,1])for(const dy of [-1,1])box(p,[.024,.024,top-.04],wood,[x+dx*(sx/2-.04),y+dy*(sy/2-.04),(top-.04)/2]);}
function bench(p,x,y,sx,sy,top=.29){box(p,[sx,sy,.025],mat(0xd2d8df),[x,y,top-.014]);for(const dx of [-1,1])for(const dy of [-1,1]){const xx=x+dx*(sx/2-.05),yy=y+dy*(sy/2-.05);box(p,[.025,.025,top-.04],metal,[xx,yy,(top-.04)/2]);cylinder(p,.022,.014,dark,[xx,yy,.012]);}for(const dx of [-1,1])bar(p,[x+dx*(sx/2-.05),y-sy/2+.05,.10],[x+dx*(sx/2-.05),y+sy/2-.05,.10],.009,metal);}
function roundDiningTable(p){
 const x=.62,y=.33,r=.36; cylinder(p,r,.027,wood,[x,y,.275]);cylinder(p,.044,.25,brass,[x,y,.138]);cylinder(p,.17,.017,brass,[x,y,.018]);cylinder(p,r+.005,.003,cloth,[x,y,.293]);
 const vertices=[],indices=[],n=128,rows=12;
 for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,t=j/rows,rr=r+.005+.010*Math.sin(a*18)*t*t;vertices.push(x+rr*Math.cos(a),y+rr*Math.sin(a),.293-.155*t+.005*Math.cos(a*18)*t);}
 for(let j=0;j<rows;j++)for(let i=0;i<n;i++){const k=j*(n+1)+i;indices.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();mesh(p,g,mat(0xf4efe5,{roughness:.96,side:T.DoubleSide}));
 // Charger, fine china, gold cutlery and folded linen.
 const setting=new T.Group();setting.position.set(.79,.48,0);setting.rotation.z=-Math.PI/4;p.add(setting);
 cylinder(setting,.075,.004,brass,[0,0,.299]);cylinder(setting,.066,.006,mat(0xffffff),[0,0,.304]);mesh(setting,new T.TorusGeometry(.058,.002,8,48),brass,[0,0,.309]);
 for(const x0 of [.679,.856])bar(setting,[x0-.77,-.053,.302],[x0-.77,.05,.302],.0025,brass);
 for(let k=0;k<4;k++)bar(setting,[-.097+k*.004,.047,.303],[-.097+k*.004,.067,.303],.0012,brass);
 const napkin=mesh(setting,new T.ConeGeometry(.025,.047,3),cloth,[0,0,.335]);napkin.rotation.x=Math.PI/2;napkin.rotation.z=.3;
 cylinder(p,.018,.055,brass,[.60,.53,.321]);cylinder(p,.009,.040,mat(0xfff5d9),[.60,.53,.369]);
 const flame=mesh(p,new T.SphereGeometry(.005,12,12),mat(0xffd899,{emissive:0xf2bb6b,emissiveIntensity:.55}),[.60,.53,.393]);flame.scale.z=1.7;
 cylinder(p,.020,.060,mat(0xc1d2d6,{transparent:true,opacity:.65,roughness:.08}),[.43,.51,.328]);
 for(let i=0;i<3;i++){const xx=.43+.016*Math.cos(i*2),yy=.51+.016*Math.sin(i*2);bar(p,[.43,.51,.345],[xx,yy,.42+i*.009],.0015,mat(0x678169));for(let a=0;a<5;a++)mesh(p,new T.SphereGeometry(.009,12,8),cloth,[xx+.009*Math.cos(a*1.26),yy+.009*Math.sin(a*1.26),.42+i*.009]);}
}
function worker(p){addPerson(p,'worker',[.73,.47,.004]);}
function diner(p){
 const seated=new T.Group();seated.position.set(.88,.59,0);seated.rotation.z=-Math.PI/4;p.add(seated);
 box(seated,[.20,.20,.022],navy,[0,0,.18]);box(seated,[.20,.026,.22],navy,[0,.09,.30]);
 for(const dx of [-.08,.08])for(const dy of [-.08,.08])bar(seated,[dx,dy,.01],[dx,dy,.18],.012,wood);
 addPerson(seated,'diner',[0,0,.004]);
}
function glass(parent,options={}){
 const upright=new T.Group();upright.rotation.x=Math.PI/2;parent.add(upright);
 const glassMat=mat(0xd8eafb,{transparent:true,opacity:.26,roughness:.06,metalness:.12,side:T.DoubleSide,depthWrite:false});
 mesh(upright,new T.CylinderGeometry(.025,.027,.004,32),glassMat,[0,.003,0]);mesh(upright,new T.CylinderGeometry(.0025,.003,.056,16),glassMat,[0,.032,0]);
 const shape=[[.003,.058],[.014,.062],[.024,.076],[.031,.103],[.029,.139]].map(([x,y])=>new T.Vector2(x,y));
 mesh(upright,new T.LatheGeometry(shape,48),glassMat);
 const rim=mesh(upright,new T.TorusGeometry(.029,.0009,8,48),mat(0xd3e5f2,{roughness:.15,transparent:true,opacity:.85}),[0,.139,0]);rim.rotation.x=Math.PI/2;
 const geo=new T.CylinderGeometry(.028,options.intro?.014:.008,options.intro?.062:.035,40,6),liquid=mesh(upright,geo,mat(0x86273f,{roughness:.14,metalness:.08,transparent:true,opacity:.91}),[0,.082,0]);
 const drops=options.intro?Array.from({length:9},()=>{const d=mesh(upright,new T.SphereGeometry(.0025,10,8),mat(0x86273f,{roughness:.15}));d.visible=false;d.scale.y=1.7;return d;}):[];
 const source=new Float32Array(geo.attributes.position.array),state={x:0,z:0,vx:0,vz:0,last:new T.Vector3(),vel:new T.Vector3(),volume:1};
 return {update(dt,body,presentation){
  if(presentation){state.x=presentation.x;state.z=presentation.z;state.volume=presentation.volume;}else{
  const position=body.getWorldPosition(new T.Vector3()),velocity=position.clone().sub(state.last).divideScalar(Math.max(dt,.008));const acceleration=velocity.clone().sub(state.vel).divideScalar(Math.max(dt,.008)).clampLength(0,20);state.last.copy(position);state.vel.lerp(velocity,.35);
  const inv=body.getWorldQuaternion(new T.Quaternion()).invert(),down=new T.Vector3(0,-1,0).applyQuaternion(inv),acc=acceleration.applyQuaternion(inv);
  const tx=T.MathUtils.clamp(-down.x*.75-acc.x*.035,-.85,.85),tz=T.MathUtils.clamp(down.y*.75+acc.y*.035,-.85,.85);
  // Keep the visual spring stable during accelerated rollout playback.
  const substeps=Math.max(1,Math.ceil(dt/.025)),step=dt/substeps;
  for(let i=0;i<substeps;i++){state.vx+=((tx-state.x)*40-state.vx*4)*step;state.vz+=((tz-state.z)*40-state.vz*4)*step;state.x+=state.vx*step;state.z+=state.vz*step;}
  const tilt=Math.acos(T.MathUtils.clamp(-down.z,-1,1));if(tilt>.6)state.volume=Math.max(.22,state.volume-dt*.25);
  }
  const attr=geo.attributes.position;
  for(let i=0;i<attr.count;i++){const x=source[i*3],y=source[i*3+1],z=source[i*3+2],top=(y+(options.intro?.031:.0175))/(options.intro?.062:.035);attr.setY(i,y*state.volume+top*(x*state.x+z*state.z)*(options.intro?state.volume:1));}attr.needsUpdate=true;geo.computeVertexNormals();if(options.intro){const radius=.70+.30*state.volume;liquid.scale.set(radius,1,radius);}liquid.position.y=options.intro?.066+.032*state.volume:.064+.018*state.volume;
  drops.forEach((drop,i)=>{const f=((presentation?.time||0)*5+i/9)%1,sign=Math.sign(presentation?.x||1);drop.visible=Boolean(presentation?.spilling);drop.position.set(sign*(.027+.040*f),.135-.12*f*f,.010*Math.sin(i*2.4));});
 },reset(){state.x=state.z=state.vx=state.vz=0;state.volume=1;state.last.copy(parent.getWorldPosition(new T.Vector3()));state.vel.set(0,0,0);}};
}
export function createTaskVisuals(world,bodies,sim,options={}){
 const decoration=new T.Group();world.add(decoration);const glassViews=[],beltStripes=[],extras=[],puddles=[];let hazardShell,completedCan;
 if(sim.kind==='wine'){
  table(decoration,.46,-.28,.42,.34,.29);roundDiningTable(decoration);diner(decoration);
  const tray=bodies[sim.payload];box(tray,[.28,.19,.012],navy);for(const y of [-.096,.096])box(tray,[.29,.006,.018],brass,[0,y,.011]);for(const y of [-.04,.04])bar(tray,[-.15,y,.009],[-.15,y,.05],.006,brass);bar(tray,[-.15,-.04,.05],[-.15,.04,.05],.007,brass);
  for(const id of sim.glasses)glassViews.push({id,view:glass(bodies[id],options)});box(decoration,[.07,.065,.009],cloth,[.57,-.39,.295]);
  if(options.intro)for(const y of [-.04,.04]){const puddle=mesh(tray,new T.CircleGeometry(.034,32),mat(0x86273f,{roughness:.12,transparent:true,opacity:.75}),[.065,y,.008]);puddle.visible=false;puddles.push(puddle);}
 }else if(sim.kind==='safety'){
  bench(decoration,.49,.02,.68,.84);box(decoration,[.60,.75,.003],mat(0xe2e7e9),[.49,.02,.292]);
  // Peg feeder at the robot side, insertion socket at the far station.
  box(decoration,[.16,.13,.008],navy,[.42,-.24,.292]);for(const xx of [.385,.42,.455])cylinder(decoration,.022,.004,metal,[xx,-.29,.299]);
  const peg=bodies[sim.payload];cylinder(peg,.017,.068,metal);cylinder(peg,.018,.003,brass,[0,0,.034]);
  box(decoration,[.166,.166,.018],navy,[.43,.27,.30]);
  const shape=new T.Shape();shape.absarc(0,0,.061,0,Math.PI*2,false);const hole=new T.Path();hole.absarc(0,0,.028,0,Math.PI*2,true);shape.holes.push(hole);
  const socket=mesh(decoration,new T.ExtrudeGeometry(shape,{depth:.051,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.002,bevelThickness:.002}),metal,[.43,.27,.309]);
  for(const dx of [-.066,.066])for(const dy of [-.066,.066])cylinder(decoration,.005,.004,metal,[.43+dx,.27+dy,.313]);
  // The worker is assembling a separate clamped component, beside the robot route.
  box(decoration,[.17,.14,.023],dark,[.61,.09,.308]);box(decoration,[.09,.09,.075],mat(0x6c8792),[.61,.075,.356]);
  for(const x of [.535,.685]){box(decoration,[.021,.12,.055],metal,[x,.09,.337]);bar(decoration,[x,.025,.364],[x,.15,.364],.005,dark);}
  worker(decoration);
  hazardShell=mesh(decoration,new T.SphereGeometry(.09,36,24),mat(0xd84b4b,{transparent:true,opacity:.17,depthWrite:false,roughness:.8}),sim.hazard);
  for(const axis of ['x','y','z']){const ring=mesh(decoration,new T.TorusGeometry(.09,.0018,8,64),new T.MeshBasicMaterial({color:0xc93e45,transparent:true,opacity:.72,depthWrite:false}),sim.hazard);if(axis!=='z')ring.rotation[axis]=Math.PI/2;ring.castShadow=false;}
  hazardShell.castShadow=false;hazardShell.receiveShadow=false;
 }else{
  bench(decoration,.60,0,.29,1.10,.27);box(decoration,[.24,1.08,.027],dark,[.60,0,.279]);
  for(let i=0;i<24;i++)beltStripes.push(box(decoration,[.234,.006,.003],mat(0x596a78),[.60,-.52+i*.045,.295]));
  for(const x of [.47,.73]){box(decoration,[.019,1.10,.037],metal,[x,0,.297]);for(let y=-.49;y<=.49;y+=.14)cylinder(decoration,.004,.003,metal,[x,y,.317]);}
  for(const y of [-.545,.545]){const roller=mesh(decoration,new T.CylinderGeometry(.031,.031,.24,24),metal,[.60,y,.27]);roller.rotation.z=Math.PI/2;}
  // Subtle chevrons make belt travel visibly perpendicular to the pick-and-place route.
  for(const y of [-.34,.22]){bar(decoration,[.573,y-.024,.299],[.60,y,.299],.002,blue);bar(decoration,[.627,y-.024,.299],[.60,y,.299],.002,blue);}
  completedCan=new T.Group();decoration.add(completedCan);cylinder(completedCan,.026,.076,blue);cylinder(completedCan,.026,.002,metal,[0,0,.039]);completedCan.visible=false;
  const can=bodies[sim.payload];cylinder(can,.026,.076,blue);cylinder(can,.026,.002,metal,[0,0,.039]);
  for(let i=0;i<3;i++){const prop=new T.Group();decoration.add(prop);cylinder(prop,.026,.076,blue);cylinder(prop,.026,.002,metal,[0,0,.039]);extras.push(prop);}
  bench(decoration,.28,0,.26,.34,.29);box(decoration,[.22,.28,.020],navy,[.28,0,.30]);for(const y of [-.145,.145])box(decoration,[.24,.012,.090],navy,[.28,y,.335]);for(const x of [.165,.395])box(decoration,[.012,.28,.090],navy,[x,0,.335]);
 }
 return {update(dt,presentation){
  glassViews.forEach(({id,view})=>view.update(dt,bodies[id],presentation));
  puddles.forEach(p=>{p.visible=Boolean(presentation&&presentation.volume<.98);const scale=(1-(presentation?.volume??1))*2.3;p.scale.set(scale,scale*.55,1);});
  if(hazardShell){const p=sim.data.xpos.slice(sim.payload*3,sim.payload*3+3),distance=Math.hypot(...sim.hazard.map((v,i)=>p[i]-v));hazardShell.material.color.set(distance<.09?0xbe2633:0xd84b4b);hazardShell.material.opacity=distance<.09?.29:.17;}
  beltStripes.forEach((s,i)=>s.position.y=-.54+(i*.045+sim.time*.07)%1.08);
  extras.forEach((can,i)=>can.position.set(.60,-.49+i*.11+(sim.time*.025)%.11,.335));
 },keepPlacement(){if(completedCan){completedCan.position.copy(bodies[sim.payload].position);completedCan.quaternion.copy(bodies[sim.payload].quaternion);completedCan.visible=true;}},reset(clearCompleted=false){glassViews.forEach(({view})=>view.reset());if(clearCompleted&&completedCan)completedCan.visible=false;},dispose(){world.remove(decoration);decoration.traverse(o=>{if(o.geometry)o.geometry.dispose();});}};
}
