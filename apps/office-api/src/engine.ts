import type { ExecutionStore, Checkpoint, Context, Ledger } from './store';
import type { ModelAdapter, Call, ToolDefinition } from './provider';
import { costMicro, hashInput, redact } from './policy';

export interface ToolExecutor {
 definitions:ToolDefinition[];
 requiresApproval(name:string):boolean;
 execute(context:Context,call:Call,ledger:Ledger,signal:AbortSignal):Promise<unknown>;
}
export class Engine {
 constructor(private store:ExecutionStore,private model:ModelAdapter,private tools:ToolExecutor){}
 async run(id:string,signal:AbortSignal):Promise<void> {
  if(!await this.store.claim(id))return;
  const context=await this.store.load(id);
  const checkpoint=(context.run.checkpoint||{messages:[]}) as unknown as Checkpoint;
  if(!Array.isArray(checkpoint.messages))throw new Error('Invalid persisted checkpoint');
  let iteration=context.run.iteration;
  try {
   if(context.stopped||context.project.status!=='active'||!context.agent.enabled)throw new Error('Office/project/agent is not active');
   this.model.validate?.(context);
   if(!checkpoint.messages.length)checkpoint.messages.push({role:'user',content:JSON.stringify({project:context.project.name,goal:context.project.goal,task:context.task.title,description:context.task.description,acceptance_criteria:context.task.acceptance_criteria})});
   for(;;) {
    if(signal.aborted||await this.store.status(id)!=='running')return;
    if(checkpoint.pending?.length) {
     const call=checkpoint.pending[0];
     if(call.name==='complete_task'&&checkpoint.pending.length>1)throw new Error('complete_task must be the final tool call');
     if(!context.config.allowed_tools.includes(call.name)||!this.tools.definitions.some(t=>t.name===call.name))throw new Error(`Tool not allowed: ${call.name}`);
     const ledger=await this.store.ledger(context,call);
     if(ledger.input_hash!==hashInput(call.input))throw new Error('Tool input changed after checkpoint');
     let output=ledger.output;
     if(ledger.status==='running')throw new Error('Interrupted tool requires human reconciliation; refusing replay');
     if(ledger.status!=='succeeded') {
      if(ledger.status==='failed')throw new Error('Tool previously failed; explicit new run required');
      if(this.tools.requiresApproval(call.name)) {
       const approval=await this.store.approval(context,ledger,call);
       if(approval==='rejected')throw new Error('CEO rejected tool execution');
       if(approval==='pending') {await this.store.toolResult(ledger.id,'waiting_approval',null);await this.store.finish(context,'waiting_approval');return;}
      }
      if(signal.aborted||await this.store.status(id)!=='running')return;
      await this.store.toolResult(ledger.id,'running',null);
      try {output=await this.tools.execute(context,call,ledger,signal);await this.store.toolResult(ledger.id,'succeeded',output);}
      catch(error) {await this.store.toolResult(ledger.id,'failed',{error:redact(error instanceof Error?error.message:'Tool failed')});throw error;}
     }
     checkpoint.messages.push({role:'tool',callId:call.id,content:JSON.stringify(output)});
     checkpoint.pending.shift();
     if(call.name==='complete_task') {
      if(!output||typeof output!=='object'||!('verified' in output)||output.verified!==true)throw new Error('Completion receipt was not verified');
      checkpoint.completed=true;
     }
     await this.store.save(id,checkpoint);
     continue;
    }
    if(checkpoint.completed) {await this.store.finish(context,'succeeded');return;}
    if(iteration>=context.config.max_iterations)throw new Error('Maximum model iterations reached');
    const definitions=this.tools.definitions.filter(t=>context.config.allowed_tools.includes(t.name));
    const bytes=Buffer.byteLength(JSON.stringify({messages:checkpoint.messages,tools:definitions,prompt:context.config.system_prompt}));
    if(bytes>120000)throw new Error('Context limit reached; summarize project context in a new task');
    const reservation=costMicro(bytes+8192,context.config.max_output_tokens,context.config.input_micro_usd_per_million,context.config.output_micro_usd_per_million);
    if(!await this.store.reserve(id,reservation))throw new Error('Project budget exhausted');
    const result=await this.model({config:context.config,provider:context.provider,history:checkpoint.messages,tools:definitions,signal});
    const cost=costMicro(result.inputTokens,result.outputTokens,context.config.input_micro_usd_per_million,context.config.output_micro_usd_per_million);
    checkpoint.messages.push(result.turn); checkpoint.pending=result.turn.calls||[]; iteration++;
    await this.store.recordResponse(id,`model-${iteration}`,reservation,cost,result.inputTokens,result.outputTokens,context,checkpoint,iteration);
    if(!checkpoint.pending.length)throw new Error('Agent ended without complete_task receipt; no completion claimed');
   }
  } catch(error) {
   if(signal.aborted||await this.store.status(id)!=='running')return;
   await this.store.finish(context,'failed',error instanceof Error?error.message:'Execution failed');
  }
 }
}
