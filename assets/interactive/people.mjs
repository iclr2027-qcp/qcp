import * as T from '../vendor/three/three.module.js';
const templates=new Map();
export async function loadPeople(){
 await Promise.all(['diner','worker'].map(async role=>{
  const base=new URL('../models/people/',import.meta.url),response=await fetch(new URL(`${role}.json`,base));
  if(!response.ok)throw new Error(`Character asset ${role}: ${response.status}`);
  const manifest=await response.json(),actor=new T.Group();actor.name=manifest.name;actor.userData=manifest.provenance;
  for(const part of manifest.meshes){
   const response=await fetch(new URL(part.file,base));if(!response.ok)throw new Error(`Character geometry ${role}: ${response.status}`);
   const buffer=await response.arrayBuffer(),geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.Int16BufferAttribute(new Int16Array(buffer,0,part.vertices*3),3));
   geometry.setAttribute('normal',new T.Int8BufferAttribute(new Int8Array(buffer,part.normalOffset,part.vertices*3),3,true));
   geometry.setIndex(new T.Uint16BufferAttribute(new Uint16Array(buffer,part.indexOffset,part.indices),1));
   for(const group of part.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
   const mesh=new T.Mesh(geometry,part.materials.map(material=>new T.MeshStandardMaterial(material)));
   mesh.scale.setScalar(part.positionScale);mesh.castShadow=mesh.receiveShadow=true;actor.add(mesh);
  }
  templates.set(role,actor);
 }));
}
export function addPerson(parent,role,position){
 const source=templates.get(role);if(!source)throw new Error(`Character asset not loaded: ${role}`);
 const actor=source.clone(true);actor.rotation.x=Math.PI/2;actor.position.set(...position);
 actor.traverse(mesh=>{if(mesh.isMesh){mesh.geometry=mesh.geometry.clone();mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();}});
 parent.add(actor);return actor;
}
