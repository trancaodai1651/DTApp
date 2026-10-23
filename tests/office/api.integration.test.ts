import { beforeAll,afterAll,it,expect } from 'vitest';
import { spawn,type ChildProcess } from 'node:child_process';
import { createServer,type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
let processHandle:ChildProcess,identity:Server,base:string;
beforeAll(async()=>{
 identity=createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url?.startsWith('/auth/v1/user')){if(req.headers.authorization!=='Bearer fixture-valid-token'){res.writeHead(401).end('{"message":"Invalid token"}');return;}res.end(JSON.stringify({id:'22222222-2222-4222-a222-222222222222',aud:'authenticated',role:'authenticated',is_anonymous:false,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}));return;}
  res.end('[]');
 });
 await new Promise<void>(resolve=>identity.listen(0,'127.0.0.1',resolve));
 const identityPort=(identity.address() as {port:number}).port;
 const port=18970+Math.floor(Math.random()*100);base=`http://127.0.0.1:${port}`;
 processHandle=spawn(process.execPath,['apps/office-api/dist/main.js'],{stdio:'pipe',env:{...process.env,OFFICE_PORT:String(port),OFFICE_HOST:'127.0.0.1',OFFICE_SUPABASE_URL:`http://127.0.0.1:${identityPort}`,OFFICE_SUPABASE_ANON_KEY:'sb_publishable_fixture_credential'}});
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(`${base}/api/office/health`)).ok){ready=true;break;}}catch{/* wait startup */}await delay(100);}
 if(!ready)throw new Error('Compiled Nest API did not become ready');
});
afterAll(async()=>{processHandle?.kill();await new Promise<void>(resolve=>identity?.close(()=>resolve()));});
it('serves compiled Nest health endpoint',async()=>{const response=await fetch(`${base}/api/office/health`);expect(response.status).toBe(200);expect((await response.json()).configured).toBe(true);});
it('rejects missing or invalid auth before database access',async()=>{expect((await fetch(`${base}/api/office/organizations`)).status).toBe(401);expect((await fetch(`${base}/api/office/organizations`,{headers:{authorization:'Bearer invalid-token'}})).status).toBe(401);});
it('uses the verified user JWT for organization reads (identity fixture)',async()=>{const response=await fetch(`${base}/api/office/organizations`,{headers:{authorization:'Bearer fixture-valid-token'}});expect(response.status).toBe(200);expect(await response.json()).toEqual([]);});
it('blocks authenticated users without organization membership',async()=>{const response=await fetch(`${base}/api/office/11111111-1111-4111-a111-111111111111/snapshot`,{headers:{authorization:'Bearer fixture-valid-token'}});expect(response.status).toBe(403);});
it('does not return CORS access for an unapproved origin',async()=>{const response=await fetch(`${base}/api/office/health`,{headers:{origin:'https://attacker.invalid'}});expect(response.headers.get('access-control-allow-origin')).toBeNull();});
