import { Controller,Get,Post,Patch,Delete,Body,Param,Req,UnauthorizedException,ForbiddenException,ServiceUnavailableException,BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from './env';
import { officeClient,must,check } from './store';
import { configSchema,createAgentSchema,nameSchema,uuid } from './policy';
import { wakeRun } from './queue';

export async function actor(request:Pick<Request,'headers'>) {
 if(!env.OFFICE_SUPABASE_ANON_KEY||!env.OFFICE_SUPABASE_URL)throw new ServiceUnavailableException('Cấu hình Supabase cho Office API trước.');
 const token=/^Bearer (\S+)$/.exec(request.headers.authorization||'')?.[1];
 if(!token)throw new UnauthorizedException('Cần đăng nhập Supabase.');
 const client=officeClient(env.OFFICE_SUPABASE_ANON_KEY,token);
 const auth=await client.auth.getUser(token);
 if(auth.error||!auth.data.user||auth.data.user.is_anonymous)throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
 return {client,user:auth.data.user};
}
async function scope(request:Request,organizationId:string,roles=['ceo','manager','member','viewer']) {
 uuid.parse(organizationId);const context=await actor(request);
 const membership=await context.client.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',context.user.id).maybeSingle();
 if(membership.error||!membership.data||!roles.includes(membership.data.role))throw new ForbiddenException('Không có quyền trong tổ chức này.');
 return context;
}

@Controller('api/office')
export class OfficeController {
 @Get('health') health() {return {service:'dt-office-api',configured:Boolean(env.OFFICE_SUPABASE_URL&&env.OFFICE_SUPABASE_ANON_KEY),version:1};}
 @Get('organizations') async organizations(@Req() req:Request) {const {client}=await actor(req);return must(await client.from('organizations').select('*').order('created_at'));}
 @Post('organizations') async createOrganization(@Req() req:Request,@Body() body:unknown) {const input=z.object({name:nameSchema}).strict().parse(body);const {client}=await actor(req);return {id:must(await client.rpc('office_create_organization',{p_name:input.name}))};}
 @Get(':org/snapshot') async snapshot(@Req() req:Request,@Param('org') org:string) {
  const {client}=await scope(req,org);
  const tables=['agents','agent_configs','model_providers','projects','tasks','task_dependencies','agent_runs','approvals','model_usage','budgets','activity_logs','conversations','agent_messages','project_documents','task_artifacts','agent_events'] as const;
  const entries=await Promise.all(tables.map(async table=>[table,must(await client.from(table).select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(200))]));
  return {...Object.fromEntries(entries),stats:must(await client.rpc('office_dashboard_stats',{p_org:org}))};
 }
 @Post(':org/projects') async createProject(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({name:nameSchema.max(160),goal:z.string().min(1).max(20000),budget_micro_usd:z.number().int().min(0).max(1000000000000)}).strict().parse(body);
  const {client}=await scope(req,org,['ceo']);
  return {id:must(await client.rpc('office_create_project',{p_org:org,p_name:input.name,p_goal:input.goal,p_budget:input.budget_micro_usd}))};
 }
 @Patch(':org/projects/:id') async updateProject(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=z.object({name:nameSchema.optional(),goal:z.string().max(20000).optional(),status:z.enum(['draft','active','paused','completed','cancelled']).optional()}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);
  return must(await client.from('projects').update(input).eq('organization_id',org).eq('id',id).select('*').single());
 }
 @Post(':org/providers') async provider(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({name:nameSchema,adapter:z.enum(['openai','anthropic']),enabled:z.boolean()}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);
  return must(await client.from('model_providers').insert({organization_id:org,...input,credential_env:input.adapter==='openai'?'OFFICE_OPENAI_KEY':'OFFICE_ANTHROPIC_KEY'}).select('*').single());
 }
 @Post(':org/agents') async createAgent(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {const input=createAgentSchema.parse(body);const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('agents').insert({organization_id:org,...input}).select('*').single());}
 @Patch(':org/agents/:id') async updateAgent(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=createAgentSchema.partial().extend({enabled:z.boolean().optional()}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('agents').update(input).eq('id',id).eq('organization_id',org).select('*').single());
 }
 @Delete(':org/agents/:id') async deleteAgent(@Req() req:Request,@Param('org') org:string,@Param('id') id:string) {uuid.parse(id);const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('agents').delete().eq('id',id).eq('organization_id',org).select('id').single());}
 @Post(':org/agents/:id/config') async configureAgent(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=configSchema.parse(body);const {client}=await scope(req,org,['ceo','manager']);
  return must(await client.from('agent_configs').upsert({...input,agent_id:id,organization_id:org},{onConflict:'agent_id'}).select('*').single());
 }
 @Post(':org/tasks') async createTask(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({project_id:uuid,title:nameSchema.max(200),description:z.string().max(20000),acceptance_criteria:z.string().min(1).max(12000),assigned_agent_id:uuid}).strict().parse(body);
  const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('tasks').insert({...input,organization_id:org}).select('*').single());
 }
 @Post(':org/dependencies') async dependency(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({project_id:uuid,task_id:uuid,depends_on_id:uuid}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('task_dependencies').insert({...input,organization_id:org}).select('*').single());
 }
 @Post(':org/tasks/:id/start') async start(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=z.object({idempotency_key:uuid}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);
  must(await client.from('tasks').select('id').eq('id',id).eq('organization_id',org).single());
  const run=must(await client.rpc('office_enqueue_task',{p_task:id,p_key:input.idempotency_key}));
  // If Redis is temporarily down, the DB outbox remains queued; worker reconciles it.
  void wakeRun(run).catch(()=>{});return {id:run,status:'queued'};
 }
 @Post(':org/runs/:id/control') async control(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=z.object({action:z.enum(['pause','resume','cancel'])}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);
  must(await client.from('agent_runs').select('id').eq('organization_id',org).eq('id',id).single());check(await client.rpc('office_control_run',{p_run:id,p_action:input.action}));
  if(input.action==='resume')void wakeRun(id).catch(()=>{});return {accepted:true};
 }
 @Post(':org/approvals/:id') async decide(@Req() req:Request,@Param('org') org:string,@Param('id') id:string,@Body() body:unknown) {
  uuid.parse(id);const input=z.object({approved:z.boolean()}).strict().parse(body);const {client}=await scope(req,org,['ceo']);
  must(await client.from('approvals').select('id').eq('organization_id',org).eq('id',id).single());const run=must(await client.rpc('office_decide_approval',{p_id:id,p_approved:input.approved}));void wakeRun(run).catch(()=>{});return {accepted:true};
 }
 @Post(':org/conversations') async conversation(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({project_id:uuid,title:nameSchema,kind:z.enum(['direct','team','meeting'])}).strict().parse(body);const {client}=await scope(req,org,['ceo','manager']);return must(await client.from('conversations').insert({...input,organization_id:org}).select('*').single());
 }
 @Post(':org/messages') async sendMessage(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({conversation_id:uuid,recipient_agent_id:uuid.nullable(),parent_id:uuid.nullable(),content:z.string().trim().min(1).max(12000)}).strict().parse(body);const {client,user}=await scope(req,org,['ceo','manager','member']);return must(await client.from('agent_messages').insert({...input,organization_id:org,sender_user_id:user.id}).select('*').single());
 }
 @Post(':org/stop') async stop(@Req() req:Request,@Param('org') org:string,@Body() body:unknown) {
  const input=z.object({stopped:z.boolean()}).strict().parse(body);const {client}=await scope(req,org,['ceo']);check(await client.from('organizations').update(input).eq('id',org));return {accepted:true};
 }
}
export function publicError(error:unknown) {
 if(error instanceof z.ZodError)return new BadRequestException(error.issues.map(issue=>({path:issue.path,message:issue.message})));
 return error;
}
