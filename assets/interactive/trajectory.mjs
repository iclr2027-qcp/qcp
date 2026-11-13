import * as T from '../vendor/three/three.module.js';
const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(16,16,15,0,Math.PI*2);ctx.fill();
const dot=new T.CanvasTexture(canvas);
export function trajectoryMaterial(opacity=.95){return new T.PointsMaterial({color:0x168947,size:.05,toneMapped:false,map:dot,alphaTest:.45,transparent:true,opacity,depthWrite:false});}
export function spacedTrace(points,spacing=.03){const result=[];for(const p of points){const last=result.at(-1);if(!last||Math.hypot(...p.map((v,i)=>v-last[i]))>=spacing)result.push(p);}return result;}
