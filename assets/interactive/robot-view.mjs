import * as THREE from '../vendor/three/three.module.js';
const point=(array,index,v)=>v.set(array[index*3],array[index*3+1],array[index*3+2]);
const quaternion=(array,index,q)=>q.set(array[index*4+1],array[index*4+2],array[index*4+3],array[index*4]);
export function createRobotBodies(model,world,meshCache){
 const bodies=[];
 for(let id=0;id<model.nbody;id++){const body=new THREE.Group();world.add(body);bodies[id]=body;}
 for(let i=0;i<model.ngeom;i++){
  if(model.geom_group[i]>=3||model.geom_type[i]!==7)continue;
  const id=model.geom_dataid[i];let geometry=meshCache.get(id);
  if(!geometry){geometry=new THREE.BufferGeometry();const start=model.mesh_vertadr[id]*3,count=model.mesh_vertnum[id]*3,face=model.mesh_faceadr[id]*3,n=model.mesh_facenum[id]*3;geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(model.mesh_vert.slice(start,start+count)),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(model.mesh_face.slice(face,face+n)),1));geometry.computeVertexNormals();meshCache.set(id,geometry);}
  const matId=model.geom_matid[i],rgba=matId<0?model.geom_rgba.slice(i*4,i*4+4):model.mat_rgba.slice(matId*4,matId*4+4);
  const material=new THREE.MeshPhysicalMaterial({color:new THREE.Color().setRGB(rgba[0],rgba[1],rgba[2],THREE.SRGBColorSpace),roughness:.37,metalness:.20,clearcoat:.15});
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;point(model.geom_pos,i,mesh.position);quaternion(model.geom_quat,i,mesh.quaternion);bodies[model.geom_bodyid[i]].add(mesh);
 }
 return bodies;
}
