import http from 'node:http';
import { createHmac,timingSafeEqual } from 'node:crypto';
import { mkdtemp,mkdir,writeFile,chown,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// The controller has only SETUID/SETGID/KILL in a read-only, private-network
// container. Every untrusted test process is a distinct unprivileged UID.
// No Docker socket, provider keys, database credentials or host mounts.
if(process.platform!=='linux'||process.getuid()!==0||process.env.OFFICE_RUNNER_CONTAINER!=='1')throw new Error('Runner must run in the supplied Linux container');
const token=process.env.OFFICE_RUNNER_TOKEN;
if(!token||token.length<32)throw new Error('Runner token required');
let busy=false,nextUid=20000;
const signed=result=>{const payload=JSON.stringify(result);return JSON.stringify({payload,signature:createHmac('sha256',token).update(payload).digest('hex')});};
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/health'&&req.method==='GET'){res.end('{"alive":true}');return;}
 const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${token}`);
 if(auth.length!==expected.length||!timingSafeEqual(auth,expected)){res.writeHead(401).end('{}');return;}
 if(req.url!=='/test'||req.method!=='POST'){res.writeHead(404).end('{}');return;}
 if(busy){res.writeHead(409).end('{}');return;}
 busy=true;let dir,child,timer;
 try {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>2000000)throw new Error('Input limit');chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString());
  if(!/^[0-9a-f-]{36}$/.test(input.id)||!Array.isArray(input.files)||!input.files.length||input.files.length>50)throw new Error('Invalid job');
  const names=new Set();let bytes=0;
  for(const file of input.files){
   if(typeof file.name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,150}$/.test(file.name)||file.name.split('/').some(p=>!p||p==='.'||p==='..')||! /\.(mjs|js|json)$/.test(file.name)||typeof file.content!=='string'||names.has(file.name))throw new Error('Invalid file');
   names.add(file.name);bytes+=Buffer.byteLength(file.content);if(bytes>1000000)throw new Error('File limit');
  }
  const tests=[...names].filter(n=>/\.test\.(mjs|js)$/.test(n));if(!tests.length)throw new Error('No .test.mjs/.test.js files');
  const uid=nextUid++;if(nextUid>60000)nextUid=20000;
  dir=await mkdtemp('/tmp/office-run-');await chown(dir,uid,uid);
  for(const file of input.files){
   const target=join(dir,file.name),parts=file.name.split('/');parts.pop();
   let parent=dir;for(const part of parts){parent=join(parent,part);await mkdir(parent,{recursive:true,mode:0o700});await chown(parent,uid,uid);}
   await writeFile(target,file.content,{mode:0o600});await chown(target,uid,uid);
  }
  let stdout='',stderr='',timedOut=false,exceeded=false;
  child=spawn(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:dir,uid,gid:uid,detached:true,env:{PATH:process.env.PATH,HOME:dir,TMPDIR:dir},stdio:['ignore','pipe','pipe']});
  const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{/* group exited */}};
  const consume=(which,chunk)=>{if(stdout.length+stderr.length+chunk.length>200000){exceeded=true;kill();return;}if(which==='out')stdout+=chunk.toString();else stderr+=chunk.toString();};
  child.stdout.on('data',chunk=>consume('out',chunk));child.stderr.on('data',chunk=>consume('err',chunk));
  timer=setTimeout(()=>{timedOut=true;kill();},30000);
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??124));});
  kill();res.end(signed({id:input.id,exitCode:exceeded?125:exitCode,stdout,stderr,timedOut}));
 }catch {res.writeHead(400).end('{"error":"Runner rejected input or failed; no successful result"}');}
 finally {clearTimeout(timer);if(child?.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}if(dir)await rm(dir,{recursive:true,force:true});busy=false;}
});
server.requestTimeout=35000;server.headersTimeout=5000;server.listen(8081,'0.0.0.0');
