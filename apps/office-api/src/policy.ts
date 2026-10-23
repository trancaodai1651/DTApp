import { createHash } from 'node:crypto';
import { z } from 'zod';

export const roleSchema = z.enum(['pm','ba','developer','tester','accountant','designer','devops','security','dba','researcher','marketing','analyst','custom']);
export const tools = ['read_context','write_document','remember','send_message','create_tasks','write_artifact','read_artifacts','run_tests','read_budget','complete_task'] as const;
export const nameSchema=z.string().trim().min(1).max(120);
export const uuid=z.uuid();
export const createAgentSchema=z.object({name:nameSchema.max(80),role:roleSchema}).strict();
export const configSchema=z.object({provider_id:uuid,model:z.string().min(1).max(120),system_prompt:z.string().min(20).max(16000),allowed_tools:z.array(z.enum(tools)).max(tools.length),memory_scope:z.enum(['none','agent','project']),max_iterations:z.number().int().min(1).max(30),max_output_tokens:z.number().int().min(128).max(16384),input_micro_usd_per_million:z.number().int().min(0).max(1000000000000),output_micro_usd_per_million:z.number().int().min(0).max(1000000000000)}).strict();
export function costMicro(input:number,output:number,inputRate:number,outputRate:number):number {
 for(const value of [input,output,inputRate,outputRate]) if(!Number.isSafeInteger(value)||value<0) throw new Error('Invalid usage/pricing');
 const cost=(BigInt(input)*BigInt(inputRate)+BigInt(output)*BigInt(outputRate)+999999n)/1000000n;
 if(cost>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Cost overflow');
 return Number(cost);
}
export function hashInput(value:unknown):string {
 const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
 return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function validateGraph(nodes:{key:string;depends_on:string[]}[]):void {
 const byKey=new Map(nodes.map(n=>[n.key,n])); if(byKey.size!==nodes.length) throw new Error('Duplicate task keys');
 const done=new Set<string>(), visiting=new Set<string>();
 const visit=(key:string)=>{ if(done.has(key))return; if(visiting.has(key))throw new Error('Dependency cycle'); const node=byKey.get(key); if(!node)throw new Error('Unknown dependency'); visiting.add(key); node.depends_on.forEach(visit); visiting.delete(key); done.add(key); };
 nodes.forEach(n=>visit(n.key));
}
export function redact(value:string):string {
 let result=value.replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/(?:sk-|sb_secret_)[A-Za-z0-9_\-]{10,}/g,'[REDACTED]');
 for(const [name,secret] of Object.entries(process.env)) if(/KEY|TOKEN|SECRET|PASSWORD/.test(name)&&secret&&secret.length>=8) result=result.split(secret).join('[REDACTED]');
 return result;
}
export function safeFile(name:string):string {
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,150}$/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..')||name.includes('\\')) throw new Error('Invalid artifact path');
 return name;
}
