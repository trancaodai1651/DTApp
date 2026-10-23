// Original DTApp geometry; no third-party character/brand assets.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir,writeFile } from 'node:fs/promises';
globalThis.FileReader=class {
 readAsArrayBuffer(blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob){void blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
};
const root=new THREE.Group();root.name='Avatar';
const tunic=new THREE.MeshStandardMaterial({color:'#638b7c',roughness:.8}),skin=new THREE.MeshStandardMaterial({color:'#eac5a1',roughness:.9}),dark=new THREE.MeshStandardMaterial({color:'#293c38',roughness:.8});
function box(name,w,h,d,x,y,z,material,parent=root){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
box('Torso',.44,.55,.28,0,1.01,0,tunic);
box('LegL',.16,.5,.17,-.13,.5,0,dark);box('LegR',.16,.5,.17,.13,.5,0,dark);
box('ShoeL',.18,.1,.28,-.13,.2,.04,dark);box('ShoeR',.18,.1,.28,.13,.2,.04,dark);
const head=new THREE.Mesh(new THREE.SphereGeometry(.23,12,8),skin);head.name='Head';head.position.y=1.53;root.add(head);
box('Hair',.4,.14,.32,0,1.69,-.02,dark);
for(const [name,x] of [['ArmL',-.32],['ArmR',.32]]) {const group=new THREE.Group();group.name=name;group.position.set(x,1.19,0);root.add(group);box(`${name}Sleeve`,.15,.4,.18,0,-.16,0,tunic,group);box(`${name}Hand`,.13,.13,.14,0,-.4,0,skin,group);}
const clips=[];
for(const [name,bob,angle] of [['idle',.012,.03],['walking',.08,.5],['sitting',0,-.4],['typing',.015,-.85],['reading',.01,-.6],['talking',.02,.3],['thinking',.012,-.3],['meeting',.015,.4],['waiting',.02,1.6],['error',.015,.15],['completed',.07,2.1],['paused',0,0]]) {
 const a=new THREE.Quaternion().setFromEuler(new THREE.Euler(angle,0,.04));const b=new THREE.Quaternion().setFromEuler(new THREE.Euler(angle+.16,0,-.1));
 clips.push(new THREE.AnimationClip(name,1.2,[new THREE.VectorKeyframeTrack('Avatar.position',[0,.6,1.2],[0,0,0,0,bob,0,0,0,0]),new THREE.QuaternionKeyframeTrack('ArmL.quaternion',[0,.6,1.2],[...a.toArray(),...b.toArray(),...a.toArray()]),new THREE.QuaternionKeyframeTrack('ArmR.quaternion',[0,.6,1.2],[...b.toArray(),...a.toArray(),...b.toArray()])]));
}
const data=await new GLTFExporter().parseAsync(root,{binary:true,animations:clips});
await mkdir('public/office',{recursive:true});await writeFile('public/office/employee.glb',Buffer.from(data));console.log('Wrote original GLB with 12 animation clips');
