import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, Row } from './database.types';
import type { Turn, Call } from './provider';
import { env } from './env';
import { hashInput, redact } from './policy';

export type OfficeClient=SupabaseClient<Database>;
export function must<T>(result:{data:T;error:{code?:string;message?:string}|null}):NonNullable<T> {
 if(result.error) throw new Error(`Database operation failed (${result.error.code||'unknown'})`);
 if(result.data===null || result.data===undefined)throw new Error('Database record unavailable');
 return result.data as NonNullable<T>;
}
export function check(result:{error:{code?:string;message?:string}|null}):void {if(result.error)throw new Error(`Database operation failed (${result.error.code||'unknown'})`);}
export const json=(value:unknown):Json=>JSON.parse(JSON.stringify(value)) as Json;
export function officeClient(key:string,token?:string):OfficeClient {
 if(!env.OFFICE_SUPABASE_URL)throw new Error('Configure OFFICE_SUPABASE_URL');
 return createClient<Database>(env.OFFICE_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{...(token?{headers:{Authorization:`Bearer ${token}`}}:{}),fetch:(input,init)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(15000)})}});
}
export interface Checkpoint { messages:Turn[]; pending?:Call[]; completed?:boolean }
export interface Context {run:Row<'agent_runs'>;agent:Row<'agents'>;config:Row<'agent_configs'>;provider:Row<'model_providers'>;task:Row<'tasks'>;project:Row<'projects'>;stopped:boolean}
export interface Ledger {id:string;status:string;input_hash:string;output:unknown}
export interface ExecutionStore {
 claim(id:string):Promise<boolean>;load(id:string):Promise<Context>;status(id:string):Promise<string>;
 save(id:string,checkpoint:Checkpoint):Promise<void>;
 reserve(id:string,amount:number):Promise<boolean>;
 recordResponse(id:string,key:string,reserved:number,cost:number,input:number,output:number,context:Context,checkpoint:Checkpoint,iteration:number):Promise<void>;
 ledger(context:Context,call:Call):Promise<Ledger>;
 toolResult(id:string,status:string,output:unknown):Promise<void>;
 approval(context:Context,ledger:Ledger,call:Call):Promise<'pending'|'approved'|'rejected'>;
 finish(context:Context,status:'succeeded'|'failed'|'waiting_approval',error?:string):Promise<void>;
}

export class SupabaseStore implements ExecutionStore {
 constructor(readonly client:OfficeClient){}
 async claim(id:string) {
  const changed=must(await this.client.from('agent_runs').update({status:'running'}).eq('id',id).eq('status','queued').select('agent_id,task_id'));
  if(!changed.length)return false;
  check(await this.client.from('agents').update({status:'working'}).eq('id',changed[0].agent_id));
  check(await this.client.from('tasks').update({status:'running'}).eq('id',changed[0].task_id));return true;
 }
 async load(id:string):Promise<Context> {
  const run=must(await this.client.from('agent_runs').select('*').eq('id',id).single());
  const [agent,config,task,project,org]=await Promise.all([
   this.client.from('agents').select('*').eq('organization_id',run.organization_id).eq('id',run.agent_id).single(),
   this.client.from('agent_configs').select('*').eq('organization_id',run.organization_id).eq('agent_id',run.agent_id).single(),
   this.client.from('tasks').select('*').eq('organization_id',run.organization_id).eq('id',run.task_id).single(),
   this.client.from('projects').select('*').eq('organization_id',run.organization_id).eq('id',run.project_id).single(),
   this.client.from('organizations').select('stopped').eq('id',run.organization_id).single(),
  ]);
  const cfg=must(config);
  return {run,agent:must(agent),config:cfg,task:must(task),project:must(project),stopped:must(org).stopped,provider:must(await this.client.from('model_providers').select('*').eq('id',cfg.provider_id).eq('organization_id',run.organization_id).single())};
 }
 async status(id:string) {
  const c=await this.load(id);
  if(c.stopped||c.project.status==='cancelled'||!c.agent.enabled) {
   check(await this.client.from('agent_runs').update({status:'cancelled'}).eq('id',id).in('status',['queued','running']));
   check(await this.client.from('tasks').update({status:'cancelled'}).eq('id',c.task.id));
   check(await this.client.from('agents').update({status:'idle'}).eq('id',c.agent.id)); return 'cancelled';
  }
  if(c.project.status==='paused') {check(await this.client.from('agent_runs').update({status:'paused'}).eq('id',id).eq('status','running'));return 'paused';}
  if(c.run.status==='paused'||c.run.status==='cancelled')check(await this.client.from('agents').update({status:c.run.status==='paused'?'paused':'idle'}).eq('id',c.agent.id));
  return c.run.status;
 }
 async save(id:string,checkpoint:Checkpoint) {check(await this.client.from('agent_runs').update({checkpoint:json(checkpoint)}).eq('id',id));}
 async reserve(id:string,amount:number) {return must(await this.client.rpc('office_reserve',{p_run:id,p_amount:amount}));}
 async recordResponse(id:string,key:string,reserved:number,cost:number,input:number,output:number,context:Context,checkpoint:Checkpoint,iteration:number) {
  check(await this.client.rpc('office_record_response',{p_run:id,p_key:key,p_reserved:reserved,p_cost:cost,p_input:input,p_output:output,p_model:context.config.model,p_pricing:json({input:context.config.input_micro_usd_per_million,output:context.config.output_micro_usd_per_million}),p_checkpoint:json(checkpoint),p_iteration:iteration}));
 }
 async ledger(context:Context,call:Call):Promise<Ledger> {
  const result=await this.client.from('agent_tool_calls').select('*').eq('run_id',context.run.id).eq('call_key',call.id).maybeSingle();check(result);
  if(result.data)return result.data;
  return must(await this.client.from('agent_tool_calls').insert({organization_id:context.run.organization_id,run_id:context.run.id,call_key:call.id,tool:call.name,input:json(call.input),input_hash:hashInput(call.input),status:'pending'}).select('*').single());
 }
 async toolResult(id:string,status:string,output:unknown) {
  check(await this.client.from('agent_tool_calls').update({status,output:json(output)}).eq('id',id));
 }
 async approval(context:Context,ledger:Ledger,call:Call):Promise<'pending'|'approved'|'rejected'> {
  const result=await this.client.from('approvals').select('status').eq('tool_call_id',ledger.id).maybeSingle(); check(result);
  if(result.data)return result.data.status as 'pending'|'approved'|'rejected';
  check(await this.client.from('approvals').insert({organization_id:context.run.organization_id,run_id:context.run.id,tool_call_id:ledger.id,kind:call.name==='create_tasks'?'scope':'tool',summary:redact(JSON.stringify({tool:call.name,input:call.input})).slice(0,16000)}));
  return 'pending';
 }
 async finish(context:Context,status:'succeeded'|'failed'|'waiting_approval',error?:string) {
  const changed=must(await this.client.rpc('office_finish_run',{p_run:context.run.id,p_status:status,p_error:error?redact(error).slice(0,1000):''}));
  if(!changed)return;
  if(status==='succeeded')check(await this.client.rpc('office_dispatch_project',{p_project:context.project.id,p_actor:context.run.requested_by}));
 }
}
