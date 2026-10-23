import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mapLegacyMessages,legacyUuid,type LegacyMessage } from '../../scripts/office-import-lib.mjs';

const db = new PGlite();
const ceo = randomUUID(), outsider = randomUUID(), viewer = randomUUID();
let org: string, otherOrg: string, project: string, otherProject: string;
async function asUser(user: string, anonymous = false) {
 await db.exec('reset role; set role authenticated');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,is_anonymous:anonymous})]);
}
const scalar = async (sql: string, args: unknown[] = []) => Object.values((await db.query<Record<string,string>>(sql,args)).rows[0])[0];
beforeAll(async () => {
 // Only Supabase-owned schemas/functions are fixtures. Application migration
 // runs unmodified on the actual PostgreSQL engine compiled to WASM.
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant select,insert on storage.objects to authenticated;
 `);
 await db.exec(await readFile('supabase/migrations/20261023000000_virtual_office.sql','utf8'));
 for (const id of [ceo,outsider,viewer]) await db.query('insert into auth.users(id) values($1)',[id]);
 await asUser(ceo); org=await scalar("select public.office_create_organization('Team A')");
 project=await scalar("select public.office_create_project($1,'A','Goal',1000000)",[org]);
 await asUser(outsider); otherOrg=await scalar("select public.office_create_organization('Team B')");
 otherProject=await scalar("select public.office_create_project($1,'B','Goal',1000000)",[otherOrg]);
 await db.exec('reset role');
 await db.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'viewer')",[org,viewer]);
});
beforeEach(async()=> { await db.exec('reset role'); });
afterAll(async()=> { await db.close(); });

describe('Supabase application migration on PostgreSQL',()=> {
 it('creates exactly 32 application tables with RLS',async()=> {
  const rows=(await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'")).rows;
  expect(rows).toHaveLength(32); expect(rows.every(row=>row.relrowsecurity)).toBe(true);
 });
 it('isolates SELECT between two organizations',async()=> {
  await asUser(ceo); expect((await db.query('select id from projects')).rows).toEqual([{id:project}]);
  await asUser(outsider); expect((await db.query('select id from projects')).rows).toEqual([{id:otherProject}]);
 });
 it('blocks cross-tenant INSERT and UPDATE',async()=> {
  await asUser(outsider);
  await expect(db.query("insert into agents(organization_id,name,role) values($1,'Intruder','developer')",[org])).rejects.toThrow(/row-level security/);
  expect((await db.query("update projects set name='Stolen' where id=$1 returning id",[project])).rows).toHaveLength(0);
 });
 it('viewer reads but cannot create agents or projects',async()=> {
  await asUser(viewer); expect((await db.query('select id from projects')).rows).toHaveLength(1);
  await expect(db.query("insert into agents(organization_id,name,role) values($1,'X','ba')",[org])).rejects.toThrow();
  await expect(db.query("select office_create_project($1,'X','',1)",[org])).rejects.toThrow(/CEO/);
 });
 it('anonymous sign-ins cannot bootstrap a company',async()=> {
  await asUser(viewer,true); await expect(db.query("select office_create_organization('No')")).rejects.toThrow(/Sign in/);
 });
 it('does not allow browsers to forge usage, events, approvals or runs',async()=> {
  await asUser(ceo);
  for(const table of ['agent_runs','agent_events','model_usage','approvals','agent_tool_calls','activity_logs','budgets']) {
   await expect(db.query(`delete from ${table}`)).rejects.toThrow(/permission denied/);
  }
 });
 it('rejects agent references crossing organizations even for worker writes',async()=> {
  const agent=await scalar("insert into agents(organization_id,name,role) values($1,'Other','developer') returning id",[otherOrg]);
  await expect(db.query("insert into tasks(organization_id,project_id,title,assigned_agent_id) values($1,$2,'Cross',$3)",[org,project,agent])).rejects.toThrow(/foreign key/);
 });
 it('rejects dependency cycles and dependencies across projects',async()=> {
  const a=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'A') returning id",[org,project]);
  const b=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'B') returning id",[org,project]);
  await db.query('insert into task_dependencies(organization_id,project_id,task_id,depends_on_id) values($1,$2,$3,$4)',[org,project,a,b]);
  await expect(db.query('insert into task_dependencies(organization_id,project_id,task_id,depends_on_id) values($1,$2,$3,$4)',[org,project,b,a])).rejects.toThrow(/cycle/);
  await expect(db.query('insert into task_dependencies(organization_id,project_id,task_id,depends_on_id) values($1,$2,$3,$4)',[org,otherProject,b,a])).rejects.toThrow(/foreign key/);
 });
 it('locks approval decisions to CEO and rejects replay',async()=> {
  const agent=await scalar("insert into agents(organization_id,name,role) values($1,'Approval agent','ba') returning id",[org]);
  const task=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'Approve') returning id",[org,project]);
  const run=await scalar("insert into agent_runs(organization_id,project_id,task_id,agent_id,requested_by,idempotency_key) values($1,$2,$3,$4,$5,$6) returning id",[org,project,task,agent,ceo,randomUUID()]);
  const call=await scalar("insert into agent_tool_calls(organization_id,run_id,call_key,tool,input,input_hash,status) values($1,$2,'1','create_tasks','{}','hash','waiting_approval') returning id",[org,run]);
  const approval=await scalar("insert into approvals(organization_id,run_id,tool_call_id,kind,summary) values($1,$2,$3,'scope','Plan') returning id",[org,run,call]);
  await asUser(viewer); await expect(db.query('select office_decide_approval($1,true)',[approval])).rejects.toThrow(/CEO/);
  await asUser(outsider); await expect(db.query('select office_decide_approval($1,true)',[approval])).rejects.toThrow(/CEO/);
  await asUser(ceo); expect(await scalar('select office_decide_approval($1,true)',[approval])).toBe(run);
  await expect(db.query('select office_decide_approval($1,false)',[approval])).rejects.toThrow(/unavailable/);
 });
 it('reserves atomically and settles usage idempotently',async()=> {
  const agent=await scalar("insert into agents(organization_id,name,role) values($1,'Budget agent','accountant') returning id",[org]);
  const task=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'Budget') returning id",[org,project]);
  const run=await scalar("insert into agent_runs(organization_id,project_id,task_id,agent_id,requested_by,idempotency_key,status) values($1,$2,$3,$4,$5,$6,'running') returning id",[org,project,task,agent,ceo,randomUUID()]);
  const first=await db.query<{ok:boolean}>('select office_reserve($1,900000) as ok',[run]); expect(first.rows[0].ok).toBe(true);
  const second=await db.query<{ok:boolean}>('select office_reserve($1,200000) as ok',[run]); expect(second.rows[0].ok).toBe(false);
  for(let i=0;i<2;i++) await db.query("select office_settle($1,'req-1',900000,123,100,20,'configured-model','{}')",[run]);
  const budget=(await db.query('select spent_micro_usd,reserved_micro_usd from budgets where project_id=$1',[project])).rows[0];
  expect(Number(budget.spent_micro_usd)).toBe(123); expect(Number(budget.reserved_micro_usd)).toBe(0);
  expect((await db.query('select * from model_usage where run_id=$1',[run])).rows).toHaveLength(1);
 });
 it('keeps private storage isolated by organization prefix',async()=> {
  await asUser(ceo);
  await db.query("insert into storage.objects(bucket_id,name) values('office-documents',$1)",[`${org}/notes.md`]);
  await expect(db.query("insert into storage.objects(bucket_id,name) values('office-documents',$1)",[`${otherOrg}/notes.md`])).rejects.toThrow(/row-level security/);
  await asUser(outsider); expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
 });
 it('imports an actual SQLite fixture twice without duplicates or broken threads',async()=> {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec("create table messages(id integer primary key,sender text,role text,text text,timestamp integer,is_system integer,thread_id integer);");
  sqlite.prepare('insert into messages values(?,?,?,?,?,?,?)').run(1,'Boss','boss','Yêu cầu từ CEO',1700000000000,0,null);
  sqlite.prepare('insert into messages values(?,?,?,?,?,?,?)').run(2,'Developer','developer','Trả lời có liên kết luồng',1700000001000,0,1);
  const source=sqlite.prepare('select * from messages order by id').all() as unknown as LegacyMessage[];
  sqlite.close();
  const conversation=randomUUID();await db.query("insert into conversations(id,organization_id,project_id,title,kind) values($1,$2,$3,'Imported','import')",[conversation,org,project]);
  const rows=mapLegacyMessages(source,{organizationId:org,conversationId:conversation,sourceId:'fixture-source'});
  for(let iteration=0;iteration<2;iteration++)for(const row of rows)await db.query('insert into agent_messages(id,organization_id,conversation_id,content,parent_id,legacy_source,legacy_id,metadata,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set content=excluded.content',[row.id,org,conversation,row.content,row.parent_id,row.legacy_source,row.legacy_id,JSON.stringify(row.metadata),row.created_at]);
  const saved=(await db.query<{id:string;parent_id:string|null;content:string}>('select id,parent_id,content from agent_messages where conversation_id=$1 order by legacy_id',[conversation])).rows;
  expect(saved).toHaveLength(2);expect(saved[1].parent_id).toBe(saved[0].id);expect(saved[1].content).toBe(source[1].text);expect(legacyUuid('fixture-source',1)).toBe(saved[0].id);
  expect(()=>mapLegacyMessages([{...source[1],thread_id:999}],{organizationId:org,conversationId:conversation,sourceId:'fixture-source'})).toThrow(/Missing thread root/);
  expect(()=>mapLegacyMessages([{...source[0],thread_id:1}],{organizationId:org,conversationId:conversation,sourceId:'fixture-source'})).toThrow(/cycle/);
 });
 it('enqueues a configured task idempotently and checks dependencies first',async()=>{
  const provider=await scalar("insert into model_providers(organization_id,name,adapter,credential_env,enabled) values($1,'Provider fixture','openai','OFFICE_OPENAI_KEY',true) returning id",[org]);
  const agent=await scalar("insert into agents(organization_id,name,role) values($1,'Queue agent','developer') returning id",[org]);
  await db.query("insert into agent_configs(organization_id,agent_id,provider_id,model,system_prompt,input_micro_usd_per_million,output_micro_usd_per_million) values($1,$2,$3,'fixture-model','Test fixture prompt',1,1)",[org,agent,provider]);
  const parent=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'Parent') returning id",[org,project]);
  const task=await scalar("insert into tasks(organization_id,project_id,title,assigned_agent_id) values($1,$2,'Child',$3) returning id",[org,project,agent]);
  await db.query('insert into task_dependencies(organization_id,project_id,task_id,depends_on_id) values($1,$2,$3,$4)',[org,project,task,parent]);
  const key=randomUUID();await asUser(ceo);await expect(db.query('select office_enqueue_task($1,$2)',[task,key])).rejects.toThrow(/Dependencies incomplete/);
  await db.exec('reset role');await db.query("update tasks set status='done' where id=$1",[parent]);
  await asUser(ceo);const first=await scalar('select office_enqueue_task($1,$2)',[task,key]);const second=await scalar('select office_enqueue_task($1,$2)',[task,key]);expect(second).toBe(first);
  await expect(db.query("update agents set status='working' where id=$1",[agent])).rejects.toThrow(/permission denied/);
 });
 it('controls pause/resume/cancel with authorized, legal transitions',async()=>{
  await asUser(ceo);const run=await scalar("select id from agent_runs where status='queued' limit 1");
  await db.query("select office_control_run($1,'pause')",[run]);expect(await scalar('select status from agent_runs where id=$1',[run])).toBe('paused');
  await db.query("select office_control_run($1,'resume')",[run]);expect(await scalar('select status from agent_runs where id=$1',[run])).toBe('queued');
  await asUser(outsider);await expect(db.query("select office_control_run($1,'cancel')",[run])).rejects.toThrow(/unavailable/);
  await asUser(ceo);await db.query("select office_control_run($1,'cancel')",[run]);expect(await scalar('select status from agent_runs where id=$1',[run])).toBe('cancelled');
  await expect(db.query("select office_control_run($1,'resume')",[run])).rejects.toThrow(/Invalid/);
 });
 it('atomically finishes run/task/avatar only after verified completion evidence',async()=>{
  const agent=await scalar("insert into agents(organization_id,name,role) values($1,'Receipt agent','ba') returning id",[org]);
  const task=await scalar("insert into tasks(organization_id,project_id,title) values($1,$2,'Receipt') returning id",[org,project]);
  const run=await scalar("insert into agent_runs(organization_id,project_id,task_id,agent_id,requested_by,idempotency_key,status) values($1,$2,$3,$4,$5,$6,'running') returning id",[org,project,task,agent,ceo,randomUUID()]);
  await expect(db.query("select office_finish_run($1,'succeeded','')",[run])).rejects.toThrow(/receipt/);
  await db.query("insert into agent_tool_calls(organization_id,run_id,call_key,tool,input,input_hash,status,output) values($1,$2,'finish','complete_task','{}','hash','succeeded','{\"verified\":true}')",[org,run]);
  await db.query("select office_finish_run($1,'succeeded','')",[run]);
  expect(await scalar('select status from agent_runs where id=$1',[run])).toBe('succeeded');expect(await scalar('select status from tasks where id=$1',[task])).toBe('done');expect(await scalar('select status from agents where id=$1',[agent])).toBe('completed');
 });
});
