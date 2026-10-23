import { Worker } from 'bullmq';
import { env,redisConnection } from './env';
import { officeClient,SupabaseStore,must,check } from './store';
import { OfficeTools } from './tools';
import { providerAdapter } from './provider';
import { Engine } from './engine';
import { wakeRun,getQueue } from './queue';

if(!env.OFFICE_SUPABASE_SERVICE_KEY)throw new Error('Configure OFFICE_SUPABASE_SERVICE_KEY on worker only');
const client=officeClient(env.OFFICE_SUPABASE_SERVICE_KEY),store=new SupabaseStore(client);
const engine=new Engine(store,providerAdapter,new OfficeTools(client));
const active=new Map<string,AbortController>();
const worker=new Worker('office-runs',async job=> {
 const id=String(job.data.id);const abort=new AbortController();active.set(String(job.id),abort);
 const timeout=setTimeout(()=>abort.abort(),180000);
 let polling=false;
 const poll=setInterval(()=>{if(polling)return;polling=true;void store.status(id).then(status=>{if(status!=='running'&&status!=='queued')abort.abort();}).catch(()=>abort.abort()).finally(()=>{polling=false;});},1500);
 try {
  await engine.run(id,abort.signal);
 } finally {
  clearTimeout(timeout);clearInterval(poll);active.delete(String(job.id));
  const run=must(await client.from('agent_runs').select('status,agent_id,task_id').eq('id',id).single());
  if(abort.signal.aborted&&run.status==='running') {
   await store.finish(await store.load(id),'failed','Execution timed out/interrupted; reconcile any provider reservation or running tool before retry.');
  }
 }
},{connection:redisConnection(),concurrency:3,maxStalledCount:0});
worker.on('failed',(job)=>console.error(JSON.stringify({event:'job.failed',job_id:job?.id}))); // Never log input, JWT or secrets.
let scanning=false;
const scan=setInterval(()=>{
 if(scanning)return;scanning=true;
 void (async()=>{
  const queued=must(await client.from('agent_runs').select('id').eq('status','queued').limit(100));
  for(const row of queued)await wakeRun(row.id);
  // Unknown outcomes are quarantined, never replayed automatically.
  const stale=must(await client.from('agent_runs').select('id').eq('status','running').lt('updated_at',new Date(Date.now()-300000).toISOString()).limit(100));
  for(const row of stale)await store.finish(await store.load(row.id),'failed','Worker interrupted. Human reconciliation required before new run.');
  const planned=must(await client.from('tasks').select('project_id').eq('auto_start',true).eq('status','todo').limit(100));
  for(const projectId of new Set(planned.map(t=>t.project_id))) {
   const project=must(await client.from('projects').select('created_by').eq('id',projectId).single());
   check(await client.rpc('office_dispatch_project',{p_project:projectId,p_actor:project.created_by}));
  }
 })().catch(()=>console.error(JSON.stringify({event:'outbox.scan_failed'}))).finally(()=>{scanning=false;});
},5000);
async function shutdown(){clearInterval(scan);for(const abort of active.values())abort.abort();await worker.close();await getQueue().close();}
process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
console.log(JSON.stringify({event:'worker.started',concurrency:3}));
