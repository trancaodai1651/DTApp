import { Suspense,useMemo,useRef,useEffect,useState,Component,type ReactNode,type RefObject } from 'react';
import { Canvas,useFrame } from '@react-three/fiber';
import { OrbitControls,useGLTF,useAnimations } from '@react-three/drei';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Vector3,type Group } from 'three';
import type { Row } from './database.types';
import { avatarState,roles,statuses } from './state';
import { Button } from './ui/button';

const asset=`${import.meta.env.BASE_URL}office/employee.glb`;
function Employee({agent,position,onSelect,reduced}:{agent:Row<'agents'>;position:[number,number,number];onSelect:(id:string)=>void;reduced:boolean}) {
 const {scene,animations}=useGLTF(asset);const model=useMemo(()=>clone(scene),[scene]);
 const ref=useRef<Group>(null);const {actions}=useAnimations(animations,ref);const state=avatarState(agent.status,agent.role);
 useEffect(()=>{
  const clip=actions[state==='testing'?'typing':state];
  if(!reduced)clip?.reset().fadeIn(.2).play();
  return ()=>{clip?.fadeOut(.2);};
 },[state,actions,reduced]);
 return <group position={position} onClick={event=>{event.stopPropagation();onSelect(agent.id);}}>
  <group ref={ref}><primitive object={model}/></group>
 </group>;
}
function Box({position,size,color}:{position:[number,number,number];size:[number,number,number];color:string}) {return <mesh castShadow receiveShadow position={position}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.8}/></mesh>;}
function Desk({position}:{position:[number,number,number]}) {return <group position={position}>
 <Box position={[0,.82,0]} size={[1.55,.12,.8]} color="#d5bb93"/>
 {[-.65,.65].map(x=><Box key={x} position={[x,.39,0]} size={[.08,.76,.65]} color="#52665d"/>)}
 <Box position={[0,1.22,-.2]} size={[.62,.42,.04]} color="#364c44"/>
 <Box position={[0,1.22,-.172]} size={[.54,.34,.01]} color="#90b4a3"/>
 <Box position={[0,.98,-.2]} size={[.06,.25,.06]} color="#52665d"/>
 <Box position={[0,.9,.12]} size={[.48,.025,.18]} color="#eef0e9"/>
 <Box position={[0,.48,.88]} size={[.6,.12,.6]} color="#728a7e"/>
 <Box position={[0,.82,1.15]} size={[.6,.7,.1]} color="#728a7e"/>
 </group>;}
function Environment(){return <>
 <Box position={[0,-.12,0]} size={[19,.24,14]} color="#e2e1d5"/>
 <Box position={[0,1.1,-6.8]} size={[19,2.4,.15]} color="#c5cec0"/>
 <Box position={[-9.4,1.1,0]} size={[.15,2.4,14]} color="#d2d6c8"/>
 <Box position={[-5.7,.55,-3.5]} size={[.1,1.2,6]} color="#b2c3b6"/>
 <Desk position={[-7.5,0,-4]}/>
 <group position={[-6.4,0,3.5]}><mesh position={[0,.75,0]}><cylinderGeometry args={[1.2,1.2,.1,32]}/><meshStandardMaterial color="#d5bb93"/></mesh><Box position={[0,.35,0]} size={[.2,.7,.2]} color="#52665d"/></group>
 <Box position={[7.5,.4,-5.5]} size={[2,.8,.65]} color="#668979"/>
 </>;}
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}> {state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?this.props.fallback:this.props.children;}}
interface Marker {id:string;position:[number,number,number];text?:string;agent?:Row<'agents'>}
const rooms:Marker[]=[{id:'ceo',position:[-7.5,2.7,-5.8],text:'PHÒNG GIÁM ĐỐC · CEO'},{id:'workspace',position:[.2,2.7,-6],text:'KHÔNG GIAN LÀM VIỆC'},{id:'meeting',position:[-6.4,1.8,3.5],text:'PHÒNG HỌP'},{id:'break',position:[7.5,1.7,-5.5],text:'KHU NGHỈ'}];
function ProjectMarkers({markers,elements}:{markers:Marker[];elements:RefObject<Map<string,HTMLElement>>}) {
 const point=useMemo(()=>new Vector3(),[]);
 useFrame(({camera,size})=>{for(const marker of markers){const el=elements.current.get(marker.id);if(!el)continue;point.set(...marker.position).project(camera);el.style.display=point.z>-1&&point.z<1?'block':'none';el.style.transform=`translate(-50%, -100%) translate(${(point.x+1)*size.width/2}px,${(1-point.y)*size.height/2}px)`;}});
 return null;
}
export default function OfficeScene({agents,onSelect}:{agents:Row<'agents'>[];onSelect:(id:string)=>void}) {
 const [camera,setCamera]=useState<'iso'|'perspective'>('iso'),[night,setNight]=useState(false);
 const [enabled,setEnabled]=useState(()=>!window.matchMedia('(max-width: 700px)').matches);
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const busy=agents.some(a=>['working','waiting_approval'].includes(a.status));
 const elements=useRef(new Map<string,HTMLElement>());
 const markers=useMemo<Marker[]>(()=>[...rooms,...agents.slice(0,20).map((agent,index)=>({id:agent.id,agent,position:[-3+(index%4)*3.1,2.1,-4+Math.floor(index/4)*2.4+.9] as [number,number,number]}))],[agents]);
 const fallback=<div className="of-scene-fallback"><h3>Nhân viên trong văn phòng</h3><p>Chọn một nhân viên để xem công việc thực tế.</p>{agents.map(agent=><Button key={agent.id} variant="secondary" onClick={()=>onSelect(agent.id)}>{agent.name} · {roles[agent.role]} · {statuses[agent.status]}</Button>)}</div>;
 return <section className="of-scene-wrap" aria-label="Văn phòng AI 3D">
  <div className="of-scene-toolbar"><span><span className="of-live-dot"/> TRẠNG THÁI TỪ HỆ THỐNG</span><div><Button variant="secondary" onClick={()=>setCamera(v=>v==='iso'?'perspective':'iso')}>{camera==='iso'?'Isometric':'Phối cảnh'}</Button><Button variant="secondary" onClick={()=>setNight(v=>!v)}>{night?'Ban ngày':'Ban đêm'}</Button><Button variant="secondary" onClick={()=>setEnabled(v=>!v)}>{enabled?'Danh sách':'Bật 3D'}</Button></div></div>
  {enabled?<SceneBoundary fallback={fallback}><div className="of-canvas-body"><Suspense fallback={<div className="of-empty">Đang tải mô hình 3D…</div>}><Canvas key={camera} orthographic={camera==='iso'} camera={{position:[18,18,22],zoom:camera==='iso'?27:1,fov:45,near:.1,far:120}} dpr={[1,1.5]} shadows={false} frameloop={busy&&!reduced?'always':'demand'} gl={{antialias:true,powerPreference:'low-power'}}>
   <color attach="background" args={[night?'#162b27':'#f0f0e6']}/><ambientLight intensity={night?.5:1.5}/><directionalLight position={[4,12,8]} intensity={night?.8:2.2}/>
   <Environment/>
   {agents.slice(0,20).map((agent,index)=>{const x=-3+(index%4)*3.1,z=-4+Math.floor(index/4)*2.4;return <group key={agent.id}><Desk position={[x,0,z]}/><Employee agent={agent} position={[x,0,z+.9]} onSelect={onSelect} reduced={reduced}/></group>;})}
   <OrbitControls makeDefault target={[0,.2,0]} minZoom={16} maxZoom={90} minDistance={8} maxDistance={55} maxPolarAngle={Math.PI/2.1} enableDamping/>
   <ProjectMarkers markers={markers} elements={elements}/>
  </Canvas></Suspense><div className="of-marker-overlay">{markers.map(marker=>{const agent=marker.agent;return agent?<button key={marker.id} ref={el=>{if(el)elements.current.set(marker.id,el);else elements.current.delete(marker.id);}} className={`of-avatar-label ${agent.status}`} style={{display:'none'}} onClick={()=>onSelect(agent.id)}><strong>{agent.status==='waiting_approval'?'⚠ ':agent.status==='error'?'! ':''}{agent.name}</strong><small>{statuses[agent.status]||agent.status}</small></button>:<span key={marker.id} ref={el=>{if(el)elements.current.set(marker.id,el);else elements.current.delete(marker.id);}} className="of-room-label" style={{display:'none'}}>{marker.text}</span>;})}</div></div></SceneBoundary>:fallback}
  <div className="of-scene-caption">Kéo để xoay · Cuộn để zoom · Chuột phải để di chuyển <span>{agents.length} nhân viên{agents.length>20?' · hiển thị 20 trong cảnh':''}</span></div>
 </section>;
}
