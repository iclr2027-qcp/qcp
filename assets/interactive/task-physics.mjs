// Explanatory task controller. The four profiles are not trained QCP weights.
export const HOME = [0,0,0,-Math.PI/2,0,Math.PI/2,-Math.PI/4];
export const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
export const smooth = t => { t=clamp(t); return t*t*t*(10+t*(-15+6*t)); };
export function quatMultiply(a,b) { return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]]; }
const errorQuat = (a,b) => {const q=quatMultiply(a,[b[0],-b[1],-b[2],-b[3]]);return q.slice(1).map(v=>2*v*(q[0]<0?-1:1));};
export function solveIK(mj,model,data,target,seed=HOME) {
 const hand=mj.mj_name2id(model,1,'hand'), orient=[0,Math.SQRT1_2,Math.SQRT1_2,0];
 let q=seed.slice();
 const pose=()=>{mj.mj_kinematics(model,data);return {p:[...data.xpos.slice(hand*3,hand*3+3)],r:[...data.xquat.slice(hand*4,hand*4+4)]};};
 for(let it=0;it<160;it++){
  data.qpos.set(q);const now=pose(), err=[...target.map((v,i)=>v-now.p[i]),...errorQuat(orient,now.r).map(v=>v*.35)];
  if(Math.hypot(...err)<.0003)break;
  const J=Array.from({length:6},()=>Array(7).fill(0));
  for(let j=0;j<7;j++){data.qpos[j]+=.0001;const next=pose();data.qpos[j]-=.0001;const dr=errorQuat(next.r,now.r);for(let k=0;k<3;k++){J[k][j]=(next.p[k]-now.p[k])/.0001;J[k+3][j]=dr[k]*.35/.0001;}}
  const A=J.map((row,i)=>[...J.map((r,k)=>row.reduce((sum,v,j)=>sum+v*r[j],0)+(i===k?.001:0)),err[i]]);
  for(let k=0;k<6;k++){let best=k;for(let i=k+1;i<6;i++)if(Math.abs(A[i][k])>Math.abs(A[best][k]))best=i;[A[k],A[best]]=[A[best],A[k]];const d=A[k][k];for(let j=k;j<7;j++)A[k][j]/=d;for(let i=0;i<6;i++)if(i!==k){const f=A[i][k];for(let j=k;j<7;j++)A[i][j]-=f*A[k][j];}}
  q=q.map((v,j)=>clamp(v+clamp(J.reduce((sum,row,k)=>sum+row[j]*A[k][6],0),-.14,.14),model.jnt_range[j*2]+.025,model.jnt_range[j*2+1]-.025));
 }
 data.qpos.set(q);const actual=pose();
 return {q,error:Math.hypot(...target.map((v,i)=>v-actual.p[i]))};
}
export function planTask(mj,model,data,kind,level=3,missTable=false,missTarget=[.112,.31,.457],variation=null) {
 const p=kind==='wine'?.457:.462;
 let points=[[0,[.34,-.2,.64]],[.16,[.31,-.28,p]],[.24,[.31,-.28,p]],[.36,[.31,-.28,.66]],[.57,[.39,.02,.67]],[.68,[.31,.28,.62]],[.79,[.31,.28,kind==='wine'?p:.49]],[.85,[.31,.28,kind==='wine'?p:.49]],[.96,[.32,.25,.64]],[1,[.34,-.2,.64]]];
 if(kind==='conveyor')points=[[0,[.41,0,.66]],[.16,[.60,0,.462]],[.24,[.60,0,.462]],[.36,[.60,0,.61]],[.56,[.43,0,.62]],[.69,[.28,0,.58]],[.79,[.28,0,.49]],[.85,[.28,0,.49]],[.96,[.28,0,.64]],[1,[.41,0,.66]]];
 if(kind==='safety'){const x=[.48,.39,.30,.22][level];points=[[0,[.36,-.18,.64]],[.16,[.42,-.24,.452]],[.24,[.42,-.24,.452]],[.36,[.42,-.24,.57]],[.49,[x,-.06,.58]],[.59,[x,.11,.58]],[.69,[.43,.27,.58]],[.79,[.43,.27,.49]],[.85,[.43,.27,.49]],[.96,[.39,.25,.64]],[1,[.36,-.18,.64]]];}
 if(kind==='wine'&&missTable){const [x,y,z]=missTarget;points=[[0,[.34,-.2,.64]],[.16,[.31,-.28,p]],[.24,[.31,-.28,p]],[.36,[.31,-.28,.66]],[.57,[.39,.02,.67]],[.68,[x,y,.62]],[.79,[x,y,z]],[.85,[x,y,z]],[.96,[.32,.25,.64]],[1,[.34,-.2,.64]]];}
 if(missTable&&kind==='safety')points=points.map(([t,v])=>[t,t>=.69&&t<=.85?[v[0]+.068,v[1],v[2]]:v]);
 if(missTable&&kind==='conveyor')points=points.map(([t,v])=>[t,t===.69?[.425,0,.465]:t===.79||t===.85?[.425,0,.465]:v]);
 // Collection varies transport and placement while keeping the grasp fixed.
 if(variation&&!missTable){
  const {dx=0,dy=0,bendX=0,bendY=0,lift=0}=variation;
  points=points.map(([t,point])=>{const p=point.slice();
   if(t>.3&&t<.76){const w=Math.sin(Math.PI*(t-.24)/(.79-.24));p[0]+=bendX*w;p[1]+=bendY*w;p[2]+=lift;}
   if(t>=.68&&t<=.96){p[0]+=dx;p[1]+=dy;}
   return [t,p];
  });
 }
 let seed=HOME;return Array.from({length:201},(_,i)=>{const t=i/200;let a=points[0],b=points[1];for(let j=1;j<points.length;j++)if(t>=points[j-1][0]){a=points[j-1];b=points[j];if(t<=b[0])break;}const u=smooth((t-a[0])/(b[0]-a[0])),point=a[1].map((v,k)=>v+(b[1][k]-v)*u);if(kind==='wine'&&missTable&&t>=.36&&t<=.79){
   // One continuous rear-diagonal carry, rather than a late sideways correction.
   const v=smooth((t-.36)/.43),w=1-v,[x,y,z]=missTarget;
   const control=[[.31,-.28,.66],[.33,-.08,.76],[x,y,.70],[x,y,z]];
   for(let k=0;k<3;k++)point[k]=w*w*w*control[0][k]+3*w*w*v*control[1][k]+3*w*v*v*control[2][k]+v*v*v*control[3][k];
  }const result=solveIK(mj,model,data,point,seed);seed=result.q;return {t,...result};});
}
export class TaskPhysics {
 constructor(mj,model,kind,plan){this.mj=mj;this.model=model;this.kind=kind;this.data=new mj.MjData(model);this.plans=plan;this.plan=kind==='safety'?plan[3]:plan;this.hazard=[.49,.03,.410];this.hand=mj.mj_name2id(model,1,'hand');this.payload=mj.mj_name2id(model,1,kind==='wine'?'tray':'can');this.glasses=kind==='wine'?[0,1].map(i=>mj.mj_name2id(model,1,'glass'+i)):[];this.level=3;this.quality=2;this.iteration=0;this.cycle=0;this.reset();}
 reset(){const {mj,model,data}=this;mj.mj_resetData(model,data);data.qpos.set(this.plan[0].q);data.qpos[7]=data.qpos[8]=.035;this.time=0;this.sumTilt=0;this.sumJerk=0;this.clearance=Infinity;this.previousAcceleration=null;this.samples=0;this.maxTilt=0;this.failed=false;this.grasped=false;this.released=false;this.done=false;mj.mj_forward(model,data);}
 get duration(){return this.kind==='safety'?9.6:this.kind==='conveyor'?[15,11,8,5.8][this.level]*(this.iteration? .88:1):9.6;}
 get fraction(){return clamp(this.time/this.duration);}
 get phase(){const p=this.fraction;return p<.18?'Approach':p<.3?'Grasp':p<.76?'Carry':p<.86?'Place':'Return';}
 configure(quality,level,iteration=0){this.quality=quality;this.level=level;this.iteration=iteration;this.cycle=0;this.failureTrial=false;this.collectionPlan=null;this.plan=this.kind==='safety'?this.plans[level]:this.plans;this.reset();}
 setCollectionPlan(plan){this.collectionPlan=plan;this.plan=plan||(this.kind==='safety'?this.plans[this.level]:this.plans);}
 setFailureTrial(enabled){this.failureTrial=Boolean(enabled&&this.failurePlan);this.plan=this.failureTrial?this.failurePlan:(this.collectionPlan||(this.kind==='safety'?this.plans[this.level]:this.plans));}
 step(){
  const {mj,model,data}=this,dt=model.opt.timestep;
  this.time+=dt;const p=this.fraction;
  let a=this.plan[0],b=this.plan[1];for(let i=1;i<this.plan.length;i++)if(p>=this.plan[i-1].t){a=this.plan[i-1];b=this.plan[i];if(p<=b.t)break;}
  const u=clamp((p-a.t)/(b.t-a.t)),target=a.q.map((v,i)=>v+(b.q[i]-v)*u);
  const envelope=smooth((p-.32)/.06)*(1-smooth((p-.68)/.06));
  const variation=1+.08*Math.sin(this.cycle*2.1),better=this.iteration? .45:1;
  if(this.kind==='wine'){
   const amplitude=this.quality===2?[.65,.24,.085,.026][this.level]:[.20,.10,.035,.012][this.level];
   target[5]+=amplitude*Math.sin(this.time*(this.quality===1?18:7.5))*envelope*variation*better;
   if(this.quality===1)target[0]+=[.10,.05,.016,0][this.level]*Math.sin(this.time*19)*envelope;
  }
  const kp=[650,700,650,600,260,240,180],kd=[48,52,45,40,22,20,14];
  for(let i=0;i<7;i++)data.ctrl[i]=clamp(kp[i]*(target[i]-data.qpos[i])-kd[i]*data.qvel[i],i<4?-87:-12,i<4?87:12);
  const releaseAt=this.failureTrial&&this.kind==='conveyor'?.72:.82;const close=p>=.18&&p<releaseAt;data.ctrl[7]=data.ctrl[8]=close?.006:.035;
  if(this.kind==='conveyor'&&!this.grasped){const j=model.body_jntadr[this.payload],qa=model.jnt_qposadr[j],va=model.jnt_dofadr[j];data.qpos[qa+1]=-.12+.12*clamp(p/.20);data.qpos[qa+2]=.335;data.qvel.fill(0,va,va+6);}
  if(p>=.22&&!this.grasped){data.eq_active[0]=1;this.grasped=true;}
  if(p>=releaseAt&&!this.released){data.eq_active[0]=0;this.released=true;}
  mj.mj_step(model,data);
  if(p>.32&&p<.79&&this.kind==='wine'){
   const m=data.xmat,tilt=Math.acos(clamp(m[this.payload*9+8],-1,1));this.sumTilt+=tilt;this.samples++;this.maxTilt=Math.max(this.maxTilt,tilt);
   if(this.previousAcceleration)this.sumJerk+=Math.sqrt(data.qacc.slice(0,7).reduce((sum,a,i)=>sum+((a-this.previousAcceleration[i])/dt)**2,0)/7);
   this.failed ||= this.glasses.some(id=>data.xpos[id*3+2]<.26||data.xmat[id*9+8]<.3);
  }
  if(this.kind==='safety'&&p>.32&&p<.79)this.clearance=Math.min(this.clearance,Math.hypot(...this.hazard.map((v,i)=>data.xpos[this.payload*3+i]-v)));
  this.previousAcceleration=Array.from(data.qacc.slice(0,7));
  this.done=this.time>=this.duration;
 }
 result(){
  if(this.kind==='wine'){const mean=this.sumTilt/Math.max(1,this.samples),jerk=this.sumJerk/Math.max(1,this.samples),success=!this.failed&&this.glasses.every(id=>this.data.xpos[id*3+2]>.28&&this.data.xmat[id*9+8]>.75);return {success,score:this.quality===1?1/(1+jerk/1000):1/(1+mean*8),metric:this.quality===1?jerk.toFixed(0)+' rad/s³ jerk':(mean*180/Math.PI).toFixed(1)+'° mean tilt',quality:this.quality,level:this.level};}
  if(this.kind==='safety'){const pos=this.data.xpos.slice(this.payload*3,this.payload*3+3),success=Math.abs(pos[0]-.43)<.024&&Math.abs(pos[1]-.27)<.024&&pos[2]>.30&&pos[2]<.38;return {success,score:this.clearance,metric:(this.clearance*100).toFixed(1)+' cm clearance',quality:3,level:this.level};}
  const pos=this.data.xpos.slice(this.payload*3,this.payload*3+3),success=Math.abs(pos[0]-.28)<.1&&Math.abs(pos[1])<.13&&pos[2]>.30;return {success,score:1/this.duration,metric:this.duration.toFixed(1)+' s / placement',quality:0,level:this.level};
 }
}
