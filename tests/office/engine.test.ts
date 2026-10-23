import { describe,it,expect,vi,afterEach } from 'vitest';
import { Engine,type ToolExecutor } from '../../apps/office-api/src/engine';
import { providerAdapter,type Call,type ModelAdapter } from '../../apps/office-api/src/provider';
import type { Context,ExecutionStore,Checkpoint,Ledger } from '../../apps/office-api/src/store';
import { costMicro,hashInput,validateGraph,safeFile,redact } from '../../apps/office-api/src/policy';
import { avatarState,usdInput } from '../../src/office/state';
import { readFile } from 'node:fs/promises';

function context():Context {
 return {run:{id:'run',status:'queued',checkpoint:{messages:[]},iteration:0},agent:{id:'agent',role:'ba',enabled:true},project:{status:'active',name:'Project',goal:'Goal'},task:{title:'Task',description:'Spec',acceptance_criteria:'Document'},provider:{adapter:'openai',enabled:true,credential_env:'OFFICE_OPENAI_KEY'},config:{allowed_tools:['write_document','complete_task','create_tasks'],model:'configured-model',system_prompt:'Work from tool receipts',max_iterations:3,max_output_tokens:1000,input_micro_usd_per_million:1000000,output_micro_usd_per_million:3000000},stopped:false} as Context;
}
class MemoryStore implements ExecutionStore {
 ctx=context();state='queued';checkpoint:Checkpoint={messages:[]};ledgers=new Map<string,Ledger>();approved:'pending'|'approved'|'rejected'='pending';budget=true;error='';iterations=0;cost=0;
 async claim(){if(this.state!=='queued')return false;this.state='running';return true;}
 async load(){return {...this.ctx,run:{...this.ctx.run,checkpoint:structuredClone(this.checkpoint) as never,iteration:this.iterations}};}
 async status(){return this.state;}
 async save(_id:string,checkpoint:Checkpoint){this.checkpoint=structuredClone(checkpoint);}
 async reserve(){return this.budget;}
 async recordResponse(_id:string,_key:string,_reserved:number,cost:number,_input:number,_output:number,_context:Context,checkpoint:Checkpoint,iteration:number){this.checkpoint=structuredClone(checkpoint);this.iterations=iteration;this.cost+=cost;}
 async ledger(_context:Context,call:Call){let entry=this.ledgers.get(call.id);if(!entry){entry={id:call.id,status:'pending',input_hash:hashInput(call.input),output:null};this.ledgers.set(call.id,entry);}return entry;}
 async toolResult(id:string,status:string,output:unknown){const entry=this.ledgers.get(id)!;entry.status=status;entry.output=structuredClone(output);}
 async approval(){return this.approved;}
 async finish(_context:Context,status:'succeeded'|'failed'|'waiting_approval',error?:string){this.state=status;this.error=error||'';}
}
function executor(approval=false):ToolExecutor&{count:Record<string,number>} {
 const count:Record<string,number>={};return {count,definitions:['write_document','complete_task','create_tasks'].map(name=>({name,description:name,parameters:{type:'object'}})),requiresApproval:name=>approval&&name==='create_tasks',execute:async(_c,call)=>{count[call.name]=(count[call.name]||0)+1;return {verified:true,id:'receipt'};}};
}
function scripted(...names:string[]):ModelAdapter {
 let i=0;return async()=>({turn:{role:'assistant',content:'',calls:[{id:`call-${i}`,name:names[i++]||'write_document',input:{}}]},inputTokens:100,outputTokens:20});
}
const signal=()=>new AbortController().signal;
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('durable execution engine',()=>{
 it('records real tool receipts before completion',async()=>{const store=new MemoryStore(),tools=executor();await new Engine(store,scripted('write_document','complete_task'),tools).run('run',signal());expect(store.state).toBe('succeeded');expect(tools.count).toEqual({write_document:1,complete_task:1});expect(store.cost).toBe(320);});
 it('does not accept prose-only claims of completion',async()=>{const store=new MemoryStore();const model:ModelAdapter=async()=>({turn:{role:'assistant',content:'Tests passed and project finished'},inputTokens:10,outputTokens:10});await new Engine(store,model,executor()).run('run',signal());expect(store.state).toBe('failed');expect(store.error).toContain('without complete_task');});
 it('pauses for CEO and resumes the exact saved call without another model request',async()=>{const store=new MemoryStore(),tools=executor(true),model=vi.fn(scripted('create_tasks','complete_task'));const engine=new Engine(store,model,tools);await engine.run('run',signal());expect(store.state).toBe('waiting_approval');expect(tools.count.create_tasks).toBeUndefined();expect(model).toHaveBeenCalledTimes(1);store.approved='approved';store.state='queued';await engine.run('run',signal());expect(store.state).toBe('succeeded');expect(tools.count.create_tasks).toBe(1);expect(model).toHaveBeenCalledTimes(2);});
 it('CEO rejection prevents execution',async()=>{const store=new MemoryStore(),tools=executor(true);store.approved='rejected';await new Engine(store,scripted('create_tasks'),tools).run('run',signal());expect(store.state).toBe('failed');expect(tools.count.create_tasks).toBeUndefined();});
 it('enforces allowlist even if model asks for a tool',async()=>{const store=new MemoryStore();await new Engine(store,scripted('delete_production'),executor()).run('run',signal());expect(store.state).toBe('failed');expect(store.error).toContain('not allowed');});
 it('refuses replay of a tool with unknown outcome after interruption',async()=>{const store=new MemoryStore(),tools=executor();store.checkpoint={messages:[],pending:[{id:'saved',name:'write_document',input:{}}]};store.ledgers.set('saved',{id:'saved',status:'running',input_hash:hashInput({}),output:null});await new Engine(store,scripted(),tools).run('run',signal());expect(store.state).toBe('failed');expect(store.error).toContain('refusing replay');expect(tools.count.write_document).toBeUndefined();});
 it('rejects input changes after approval checkpoint',async()=>{const store=new MemoryStore();store.checkpoint={messages:[],pending:[{id:'saved',name:'create_tasks',input:{changed:true}}]};store.ledgers.set('saved',{id:'saved',status:'waiting_approval',input_hash:hashInput({changed:false}),output:null});await new Engine(store,scripted(),executor(true)).run('run',signal());expect(store.error).toContain('input changed');});
 it('reuses succeeded tool ledger after checkpoint write interruption',async()=>{const store=new MemoryStore(),tools=executor();store.checkpoint={messages:[],pending:[{id:'saved',name:'write_document',input:{}}]};store.ledgers.set('saved',{id:'saved',status:'succeeded',input_hash:hashInput({}),output:{id:'saved-receipt'}});await new Engine(store,scripted('complete_task'),tools).run('run',signal());expect(store.state).toBe('succeeded');expect(tools.count.write_document).toBeUndefined();});
 it('limits infinite tool loops',async()=>{const store=new MemoryStore();await new Engine(store,scripted(),executor()).run('run',signal());expect(store.state).toBe('failed');expect(store.error).toContain('Maximum model iterations');expect(store.iterations).toBe(3);});
 it('blocks model calls when budget reservation fails',async()=>{const store=new MemoryStore();store.budget=false;const model=vi.fn(scripted());await new Engine(store,model,executor()).run('run',signal());expect(model).not.toHaveBeenCalled();expect(store.error).toContain('budget');});
 it('checks missing credentials before reserving a project budget',async()=>{vi.stubEnv('OFFICE_OPENAI_KEY','');const store=new MemoryStore(),reserve=vi.spyOn(store,'reserve');await new Engine(store,providerAdapter,executor()).run('run',signal());expect(store.error).toContain('Missing server secret');expect(reserve).not.toHaveBeenCalled();});
 it('does not run a duplicate claim',async()=>{const store=new MemoryStore();store.state='running';const model=vi.fn(scripted());await new Engine(store,model,executor()).run('run',signal());expect(model).not.toHaveBeenCalled();});
});
describe('policy, currency and state projection',()=>{
 it('ships a real GLB with animation clips for all declared states',async()=>{const bytes=await readFile('public/office/employee.glb');expect(bytes.toString('utf8',0,4)).toBe('glTF');expect(bytes.readUInt32LE(4)).toBe(2);const size=bytes.readUInt32LE(12);const data=JSON.parse(bytes.toString('utf8',20,20+size));expect(data.animations.map((a:{name:string})=>a.name)).toEqual(['idle','walking','sitting','typing','reading','talking','thinking','meeting','waiting','error','completed','paused']);expect(data.meshes.length).toBeGreaterThan(5);});
 it('uses integer ceiling for sub-micro costs',()=>{expect(costMicro(1,0,1,1)).toBe(1);expect(costMicro(1000000,1000000,2000000,7000000)).toBe(9000000);expect(()=>costMicro(-1,0,0,0)).toThrow();expect(usdInput('1.000001')).toBe(1000001);expect(()=>usdInput('1e6')).toThrow();});
 it('validates DAG references and cycles',()=>{expect(()=>validateGraph([{key:'a',depends_on:[]},{key:'b',depends_on:['a']}])).not.toThrow();expect(()=>validateGraph([{key:'a',depends_on:['b']},{key:'b',depends_on:['a']}])).toThrow(/cycle/);expect(()=>validateGraph([{key:'a',depends_on:['missing']}])).toThrow(/Unknown/);});
 it('blocks filesystem traversal and secret leakage',()=>{for(const name of ['../secret','a/../../secret','C:\\secret','/etc/passwd','.env','a//b'])expect(()=>safeFile(name)).toThrow();expect(safeFile('src/app.test.mjs')).toBe('src/app.test.mjs');vi.stubEnv('OFFICE_OPENAI_KEY','test-secret-private-key');expect(redact('Bearer test-token test-secret-private-key')).toBe('Bearer [REDACTED] [REDACTED]');});
 it('projects avatar states from server status without synthetic progress',()=>{expect(avatarState('working','developer')).toBe('typing');expect(avatarState('working','tester')).toBe('testing');expect(avatarState('waiting_approval','pm')).toBe('waiting');expect(avatarState('idle','developer')).toBe('idle');expect(avatarState('error','tester')).toBe('error');});
});
describe('provider HTTP contract (test fixture, not a live provider)',()=>{
 it('parses Responses function calls and actual usage fields',async()=>{
  vi.stubEnv('OFFICE_OPENAI_KEY','unit-test-key');const fetchMock=vi.fn(async()=>new Response(JSON.stringify({status:'completed',output:[{type:'function_call',call_id:'c1',name:'read_context',arguments:'{}'}],usage:{input_tokens:42,output_tokens:7}}),{status:200}));vi.stubGlobal('fetch',fetchMock);
  const c=context(),result=await providerAdapter({config:c.config,provider:c.provider,history:[{role:'user',content:'Goal'}],tools:[],signal:signal()});expect(result.inputTokens).toBe(42);expect(result.turn.calls?.[0].name).toBe('read_context');expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
 });
 it('never fabricates a result with missing credentials',async()=>{vi.stubEnv('OFFICE_OPENAI_KEY','');const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);const c=context();await expect(providerAdapter({config:c.config,provider:c.provider,history:[],tools:[],signal:signal()})).rejects.toThrow(/Missing server secret/);expect(fetchMock).not.toHaveBeenCalled();});
});
