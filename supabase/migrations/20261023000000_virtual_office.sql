-- Additive migration: preserves DTApp poster/bio tables. Supabase PostgreSQL 15+.
begin;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', avatar_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 120),
 created_by uuid not null references auth.users(id), stopped boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('ceo','manager','member','viewer')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id,user_id)
);
create index office_members_user on public.organization_members(user_id, organization_id);

create table public.projects (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check (length(btrim(name)) between 1 and 160), goal text not null default '',
 status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id,id)
);
create table public.project_members (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 user_id uuid not null references auth.users(id), role text not null default 'member' check (role in ('manager','member','viewer')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (organization_id,project_id) references public.projects(organization_id,id), unique(project_id,user_id)
);
create table public.model_providers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, adapter text not null check (adapter in ('openai','anthropic')),
 credential_env text not null check ((adapter='openai' and credential_env='OFFICE_OPENAI_KEY') or (adapter='anthropic' and credential_env='OFFICE_ANTHROPIC_KEY')),
 enabled boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.agents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check (length(btrim(name)) between 1 and 80),
 role text not null check (role in ('pm','ba','developer','tester','accountant','designer','devops','security','dba','researcher','marketing','analyst','custom')),
 avatar_url text, status text not null default 'idle' check (status in ('idle','working','waiting_approval','paused','error','completed')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.agent_configs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, agent_id uuid not null unique,
 provider_id uuid not null, model text not null check (length(model) between 1 and 120), system_prompt text not null,
 allowed_tools text[] not null default '{}', memory_scope text not null default 'project' check (memory_scope in ('none','agent','project')),
 max_iterations integer not null default 8 check (max_iterations between 1 and 30),
 max_output_tokens integer not null default 2048 check (max_output_tokens between 128 and 16384),
 input_micro_usd_per_million bigint not null check (input_micro_usd_per_million >= 0),
 output_micro_usd_per_million bigint not null check (output_micro_usd_per_million >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id),
 foreign key(organization_id,provider_id) references public.model_providers(organization_id,id)
);
create table public.agent_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, agent_id uuid not null, project_id uuid not null,
 external_id text, status text not null default 'active' check(status in ('active','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200), description text not null default '',
 acceptance_criteria text not null default '', assigned_agent_id uuid, auto_start boolean not null default false,
 status text not null default 'todo' check(status in ('todo','blocked','running','waiting_approval','done','failed','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 foreign key(organization_id,assigned_agent_id) references public.agents(organization_id,id),
 unique(organization_id,id), unique(organization_id,project_id,id)
);
create table public.task_dependencies (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 task_id uuid not null, depends_on_id uuid not null, check(task_id <> depends_on_id), unique(task_id,depends_on_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id,task_id) references public.tasks(organization_id,project_id,id),
 foreign key(organization_id,project_id,depends_on_id) references public.tasks(organization_id,project_id,id)
);
create table public.agent_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null, task_id uuid not null, agent_id uuid not null,
 status text not null default 'queued' check(status in ('queued','running','waiting_approval','paused','succeeded','failed','cancelled')),
 iteration integer not null default 0 check(iteration >= 0), checkpoint jsonb not null default '{"messages":[]}',
 error text, idempotency_key uuid not null, requested_by uuid not null references auth.users(id),
 reserved_micro_usd bigint not null default 0 check(reserved_micro_usd >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,idempotency_key),
 foreign key(organization_id,project_id,task_id) references public.tasks(organization_id,project_id,id),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id)
);
create unique index office_one_active_task_run on public.agent_runs(task_id) where status in ('queued','running','waiting_approval','paused');
create unique index office_one_active_agent_run on public.agent_runs(agent_id) where status in ('queued','running','waiting_approval','paused');
create table public.conversations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 title text not null, kind text not null default 'team' check(kind in ('direct','team','meeting','import')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id), unique(organization_id,id)
);
create table public.conversation_members (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, conversation_id uuid not null,
 user_id uuid references auth.users(id), agent_id uuid, check(num_nonnulls(user_id,agent_id)=1),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id)
);
create table public.agent_messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, conversation_id uuid not null,
 sender_user_id uuid references auth.users(id), sender_agent_id uuid, recipient_agent_id uuid, parent_id uuid,
 content text not null check(length(content) <= 100000), kind text not null default 'message' check(kind in ('message','system','tool','report')),
 metadata jsonb not null default '{}', legacy_source text, legacy_id bigint,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id),
 foreign key(organization_id,sender_agent_id) references public.agents(organization_id,id),
 foreign key(organization_id,recipient_agent_id) references public.agents(organization_id,id),
 unique(organization_id,id), unique(organization_id,conversation_id,id), unique(organization_id,legacy_source,legacy_id),
 foreign key(organization_id,conversation_id,parent_id) references public.agent_messages(organization_id,conversation_id,id)
);
create index office_messages_conversation on public.agent_messages(organization_id,conversation_id,created_at);
create index office_messages_search on public.agent_messages using gin(to_tsvector('simple',content));
create table public.task_comments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, task_id uuid not null,
 author_id uuid not null references auth.users(id), content text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,task_id) references public.tasks(organization_id,id)
);
create table public.task_artifacts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, task_id uuid not null, run_id uuid not null,
 name text not null, storage_path text not null, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 mime_type text not null, size_bytes bigint not null check(size_bytes>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,task_id) references public.tasks(organization_id,id),
 foreign key(organization_id,run_id) references public.agent_runs(organization_id,id), unique(run_id,name)
);
create table public.project_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 title text not null, content text not null default '', storage_path text, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table public.project_repositories (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 url text not null check(url ~ '^https://github.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'), default_branch text not null default 'main',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id), unique(project_id,url)
);
create table public.project_memories (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 key text not null, content text not null, source_run_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,key),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 foreign key(organization_id,source_run_id) references public.agent_runs(organization_id,id)
);
create table public.agent_memories (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, agent_id uuid not null,
 key text not null, content text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(agent_id,key),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id)
);
create table public.agent_tool_calls (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, run_id uuid not null,
 call_key text not null, tool text not null, input jsonb not null, input_hash text not null,
 status text not null check(status in ('pending','waiting_approval','running','succeeded','failed')), output jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(run_id,call_key), unique(organization_id,id),
 foreign key(organization_id,run_id) references public.agent_runs(organization_id,id)
);
create table public.agent_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, agent_id uuid, run_id uuid,
 event_key text not null, kind text not null, payload jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,event_key),
 foreign key(organization_id,agent_id) references public.agents(organization_id,id),
 foreign key(organization_id,run_id) references public.agent_runs(organization_id,id)
);
create table public.approvals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, run_id uuid not null, tool_call_id uuid not null unique,
 kind text not null check(kind in ('scope','tool','budget','deployment')), summary text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 decided_by uuid references auth.users(id), decided_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,run_id) references public.agent_runs(organization_id,id),
 foreign key(organization_id,tool_call_id) references public.agent_tool_calls(organization_id,id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id), title text not null, body text not null default '', read_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.activity_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid references auth.users(id), action text not null, entity_id uuid, details jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.model_usage (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, run_id uuid not null,
 request_key text not null, model text not null, input_tokens integer not null check(input_tokens>=0), output_tokens integer not null check(output_tokens>=0),
 cost_micro_usd bigint not null check(cost_micro_usd>=0), pricing jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(run_id,request_key),
 foreign key(organization_id,run_id) references public.agent_runs(organization_id,id)
);
create table public.budgets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null unique,
 limit_micro_usd bigint not null check(limit_micro_usd>=0), spent_micro_usd bigint not null default 0 check(spent_micro_usd>=0),
 reserved_micro_usd bigint not null default 0 check(reserved_micro_usd>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, project_id uuid not null,
 category text not null check(category in ('api','hosting','other')), description text not null,
 amount_micro_usd bigint not null check(amount_micro_usd>=0), incurred_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create table public.office_layouts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, layout jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.office_assets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, storage_path text not null, license text not null, source_url text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_settings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 settings jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create function public.office_role(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
 select role from public.organization_members where organization_id=p_org and user_id=auth.uid()
$$;
revoke all on function public.office_role(uuid) from public, anon;
grant execute on function public.office_role(uuid) to authenticated;

create function public.office_create_organization(p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required'; end if;
 insert into public.profiles(id) values(auth.uid()) on conflict do nothing;
 insert into public.organizations(name,created_by) values(p_name,auth.uid()) returning id into v_org;
 insert into public.organization_members(organization_id,user_id,role) values(v_org,auth.uid(),'ceo');
 return v_org;
end $$;
revoke all on function public.office_create_organization(text) from public, anon;
grant execute on function public.office_create_organization(text) to authenticated;

create function public.office_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;

-- Serialize edits per project to prevent concurrent insertion of a dependency cycle.
create function public.office_dependency_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 perform 1 from public.projects where id=new.project_id for update;
 if exists(with recursive deps(id) as (
   select new.depends_on_id union
   select d.depends_on_id from public.task_dependencies d join deps on d.task_id=deps.id
   where d.project_id=new.project_id and d.id<>new.id
 ) select 1 from deps where id=new.task_id) then raise exception 'Dependency cycle'; end if;
 return new;
end $$;
create trigger office_dependency_guard before insert or update on public.task_dependencies for each row execute function public.office_dependency_guard();

-- Uniform tenant read policies; only explicit configuration tables are user writable.
do $$
declare t text;
begin
 foreach t in array array['projects','project_members','model_providers','agents','agent_configs','agent_sessions','tasks','task_dependencies','agent_runs','conversations','conversation_members','agent_messages','task_comments','task_artifacts','project_documents','project_repositories','project_memories','agent_memories','agent_tool_calls','agent_events','approvals','notifications','activity_logs','model_usage','budgets','expenses','office_layouts','office_assets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy office_read on public.%I for select to authenticated using (public.office_role(organization_id) is not null)',t);
  execute format('create index %I on public.%I(organization_id,created_at desc)','office_'||t||'_org',t);
  execute format('create trigger office_updated_at before update on public.%I for each row execute function public.office_updated_at()',t);
 end loop;
 foreach t in array array['projects','project_members','model_providers','agents','agent_configs','tasks','task_dependencies','conversations','conversation_members','project_documents','project_repositories','office_layouts','office_assets'] loop
  execute format('grant insert,update,delete on public.%I to authenticated',t);
  execute format('create policy office_manage on public.%I for all to authenticated using (public.office_role(organization_id) in (''ceo'',''manager'')) with check (public.office_role(organization_id) in (''ceo'',''manager''))',t);
 end loop;
end $$;

revoke update on public.agents,public.tasks from authenticated;
grant update(name,role,avatar_url,enabled) on public.agents to authenticated;
grant update(title,description,acceptance_criteria,assigned_agent_id) on public.tasks to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.user_settings enable row level security;
revoke all on public.profiles,public.organizations,public.organization_members,public.user_settings from public,anon,authenticated;
grant all on public.profiles,public.organizations,public.organization_members,public.user_settings to service_role;
grant select,update on public.profiles,public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select,insert,update,delete on public.user_settings to authenticated;
create policy office_profile on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy office_org_read on public.organizations for select to authenticated using(public.office_role(id) is not null);
create policy office_org_update on public.organizations for update to authenticated using(public.office_role(id)='ceo') with check(public.office_role(id)='ceo');
create policy office_member_read on public.organization_members for select to authenticated using(public.office_role(organization_id) is not null);
create policy office_settings on public.user_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create trigger office_updated_at before update on public.organizations for each row execute function public.office_updated_at();
create trigger office_updated_at before update on public.profiles for each row execute function public.office_updated_at();
create trigger office_updated_at before update on public.organization_members for each row execute function public.office_updated_at();
create trigger office_updated_at before update on public.user_settings for each row execute function public.office_updated_at();

grant insert on public.agent_messages,public.task_comments to authenticated;
create policy office_send_message on public.agent_messages for insert to authenticated with check (
 public.office_role(organization_id) in ('ceo','manager','member') and sender_user_id=auth.uid() and sender_agent_id is null and legacy_source is null and legacy_id is null and kind='message'
);
create policy office_comment on public.task_comments for insert to authenticated with check(public.office_role(organization_id) in ('ceo','manager','member') and author_id=auth.uid());

create function public.office_create_project(p_org uuid,p_name text,p_goal text,p_budget bigint) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if public.office_role(p_org) is distinct from 'ceo' then raise exception 'CEO required to allocate budget'; end if;
 insert into public.projects(organization_id,name,goal,created_by,status) values(p_org,p_name,p_goal,auth.uid(),'active') returning id into v_id;
 insert into public.budgets(organization_id,project_id,limit_micro_usd) values(p_org,v_id,p_budget);
 insert into public.activity_logs(organization_id,actor_id,action,entity_id) values(p_org,auth.uid(),'project.created',v_id);
 return v_id;
end $$;
revoke all on function public.office_create_project(uuid,text,text,bigint) from public,anon;
grant execute on function public.office_create_project(uuid,text,text,bigint) to authenticated;

create function public.office_enqueue_task(p_task uuid,p_key uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tasks; v_id uuid;
begin
 select * into t from public.tasks where id=p_task for update;
 if t.id is null or coalesce(public.office_role(t.organization_id),'') not in ('ceo','manager') then raise exception 'Task unavailable'; end if;
 select id into v_id from public.agent_runs where organization_id=t.organization_id and idempotency_key=p_key;
 if v_id is not null then
  if not exists(select 1 from public.agent_runs where id=v_id and task_id=p_task) then raise exception 'Idempotency key mismatch'; end if;
  return v_id;
 end if;
 if exists(select 1 from public.organizations where id=t.organization_id and stopped) then raise exception 'Emergency stop'; end if;
 if not exists(select 1 from public.projects where id=t.project_id and status='active') then raise exception 'Project is not active'; end if;
 if t.status not in ('todo','failed','blocked') then raise exception 'Task cannot start'; end if;
 if not exists(select 1 from public.agents a join public.agent_configs c on c.agent_id=a.id join public.model_providers p on p.id=c.provider_id where a.id=t.assigned_agent_id and a.enabled and p.enabled) then raise exception 'Configure an enabled agent/provider first'; end if;
 if exists(select 1 from public.task_dependencies d join public.tasks parent on parent.id=d.depends_on_id where d.task_id=p_task and parent.status<>'done') then raise exception 'Dependencies incomplete'; end if;
 insert into public.agent_runs(organization_id,project_id,task_id,agent_id,requested_by,idempotency_key) values(t.organization_id,t.project_id,t.id,t.assigned_agent_id,auth.uid(),p_key) returning id into v_id;
 update public.tasks set status='running' where id=p_task;
 insert into public.activity_logs(organization_id,actor_id,action,entity_id) values(t.organization_id,auth.uid(),'run.queued',v_id);
 return v_id;
end $$;
revoke all on function public.office_enqueue_task(uuid,uuid) from public,anon;
grant execute on function public.office_enqueue_task(uuid,uuid) to authenticated;

create function public.office_control_run(p_run uuid,p_action text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs;
begin
 select * into r from public.agent_runs where id=p_run for update;
 if r.id is null or coalesce(public.office_role(r.organization_id),'') not in ('ceo','manager') then raise exception 'Run unavailable'; end if;
 if p_action='pause' and r.status in ('queued','running') then
  update public.agent_runs set status='paused' where id=p_run;
  update public.agents set status='paused' where id=r.agent_id;
 elsif p_action='resume' and r.status='paused' then
  if r.reserved_micro_usd>0 then raise exception 'Reconcile outstanding provider reservation before resume'; end if;
  update public.agent_runs set status='queued' where id=p_run;
 elsif p_action='cancel' and r.status in ('queued','running','paused','waiting_approval') then
  update public.agent_runs set status='cancelled' where id=p_run;
  update public.tasks set status='cancelled' where id=r.task_id;
  update public.agents set status='idle' where id=r.agent_id;
 else raise exception 'Invalid run transition'; end if;
 insert into public.activity_logs(organization_id,actor_id,action,entity_id) values(r.organization_id,auth.uid(),'run.'||p_action,p_run);
end $$;
revoke all on function public.office_control_run(uuid,text) from public,anon;
grant execute on function public.office_control_run(uuid,text) to authenticated;

-- CEO decisions are compare-and-set, auditable and bound to a persisted tool call.
create function public.office_decide_approval(p_id uuid,p_approved boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_run uuid;
begin
 select organization_id,run_id into v_org,v_run from public.approvals where id=p_id and status='pending' for update;
 if v_org is null then raise exception 'Approval unavailable'; end if;
 if public.office_role(v_org) is distinct from 'ceo' then raise exception 'CEO approval required'; end if;
 update public.approvals set status=case when p_approved then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now() where id=p_id;
 update public.agent_runs set status='queued' where id=v_run and status='waiting_approval';
 insert into public.activity_logs(organization_id,actor_id,action,entity_id) values(v_org,auth.uid(),case when p_approved then 'approval.approved' else 'approval.rejected' end,p_id);
 return v_run;
end $$;
revoke all on function public.office_decide_approval(uuid,boolean) from public,anon;
grant execute on function public.office_decide_approval(uuid,boolean) to authenticated;

-- Server-only atomic budget reservation. A crashed request retains its reservation
-- until reconciled by the operator, avoiding undercounting unknown provider charges.
create function public.office_reserve(p_run uuid,p_amount bigint) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_run public.agent_runs; v_budget public.budgets;
begin
 select * into v_run from public.agent_runs where id=p_run for update;
 if not found or v_run.status<>'running' or p_amount<0 then raise exception 'Invalid reservation'; end if;
 select * into v_budget from public.budgets where project_id=v_run.project_id for update;
 if not found or v_budget.spent_micro_usd+v_budget.reserved_micro_usd+p_amount>v_budget.limit_micro_usd then return false; end if;
 update public.budgets set reserved_micro_usd=reserved_micro_usd+p_amount where id=v_budget.id;
 update public.agent_runs set reserved_micro_usd=reserved_micro_usd+p_amount where id=p_run;
 return true;
end $$;
create function public.office_settle(p_run uuid,p_key text,p_reserved bigint,p_cost bigint,p_input integer,p_output integer,p_model text,p_pricing jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_run public.agent_runs;
begin
 select * into v_run from public.agent_runs where id=p_run for update;
 if exists(select 1 from public.model_usage where run_id=p_run and request_key=p_key) then return; end if;
 if p_cost<0 or p_reserved<0 or p_reserved>v_run.reserved_micro_usd then raise exception 'Invalid settlement'; end if;
 insert into public.model_usage(organization_id,run_id,request_key,model,input_tokens,output_tokens,cost_micro_usd,pricing) values(v_run.organization_id,p_run,p_key,p_model,p_input,p_output,p_cost,p_pricing);
 update public.budgets set reserved_micro_usd=reserved_micro_usd-p_reserved,spent_micro_usd=spent_micro_usd+p_cost where project_id=v_run.project_id;
 update public.agent_runs set reserved_micro_usd=reserved_micro_usd-p_reserved where id=p_run;
end $$;
revoke all on function public.office_reserve(uuid,bigint) from public,anon,authenticated;
revoke all on function public.office_settle(uuid,text,bigint,bigint,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.office_reserve(uuid,bigint) to service_role;
grant execute on function public.office_settle(uuid,text,bigint,bigint,integer,integer,text,jsonb) to service_role;

create function public.office_record_response(p_run uuid,p_key text,p_reserved bigint,p_cost bigint,p_input integer,p_output integer,p_model text,p_pricing jsonb,p_checkpoint jsonb,p_iteration integer) returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.office_settle(p_run,p_key,p_reserved,p_cost,p_input,p_output,p_model,p_pricing);
 update public.agent_runs set checkpoint=p_checkpoint,iteration=p_iteration where id=p_run;
end $$;
revoke all on function public.office_record_response(uuid,text,bigint,bigint,integer,integer,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.office_record_response(uuid,text,bigint,bigint,integer,integer,text,jsonb,jsonb,integer) to service_role;

-- Queue is an outbox, not the source of truth. Worker dispatches only ready nodes.
create function public.office_dispatch_project(p_project uuid,p_actor uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare t public.tasks; v_count integer:=0;
begin
 perform 1 from public.projects where id=p_project and status='active' for update;
 if not found then return 0; end if;
 for t in select task.* from public.tasks task join public.organizations o on o.id=task.organization_id
   join public.agents a on a.id=task.assigned_agent_id
   join public.agent_configs c on c.agent_id=a.id join public.model_providers p on p.id=c.provider_id
   where task.project_id=p_project and task.status='todo' and task.auto_start and not o.stopped and a.enabled and p.enabled
   and not exists(select 1 from public.task_dependencies d join public.tasks parent on parent.id=d.depends_on_id where d.task_id=task.id and parent.status<>'done')
   and not exists(select 1 from public.agent_runs r where r.agent_id=a.id and r.status in ('queued','running','paused','waiting_approval'))
   order by task.created_at,task.id
 loop
  begin
   insert into public.agent_runs(organization_id,project_id,task_id,agent_id,requested_by,idempotency_key) values(t.organization_id,t.project_id,t.id,t.assigned_agent_id,p_actor,gen_random_uuid());
   update public.tasks set status='running' where id=t.id; v_count:=v_count+1;
  exception when unique_violation then null;
  end;
 end loop;
 return v_count;
end $$;
revoke all on function public.office_dispatch_project(uuid,uuid) from public,anon,authenticated;
grant execute on function public.office_dispatch_project(uuid,uuid) to service_role;

create function public.office_apply_plan(p_run uuid,p_call uuid,p_nodes jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs; n jsonb; dep text; v_agent uuid; v_id uuid; ids jsonb:='{}'; previous jsonb;
begin
 select * into r from public.agent_runs where id=p_run for update;
 if not exists(select 1 from public.approvals a join public.agent_tool_calls c on c.id=a.tool_call_id where c.id=p_call and c.run_id=p_run and a.status='approved' and a.kind='scope') then raise exception 'Approved scope required'; end if;
 select payload into previous from public.agent_events where organization_id=r.organization_id and event_key='plan:'||p_call::text;
 if previous is not null then return previous; end if;
 if jsonb_array_length(p_nodes)>20 or (select count(*) from public.tasks where project_id=r.project_id)>80 then raise exception 'Task limit'; end if;
 for n in select value from jsonb_array_elements(p_nodes) loop
  select a.id into v_agent from public.agents a join public.agent_configs c on c.agent_id=a.id
   where a.organization_id=r.organization_id and a.role=n->>'role' and a.enabled order by a.id limit 1;
  if v_agent is null then raise exception 'No configured agent for role %',n->>'role'; end if;
  insert into public.tasks(organization_id,project_id,title,description,acceptance_criteria,assigned_agent_id,auto_start)
   values(r.organization_id,r.project_id,n->>'title',n->>'description',n->>'acceptance_criteria',v_agent,true) returning id into v_id;
  ids:=ids||jsonb_build_object(n->>'key',v_id);
 end loop;
 for n in select value from jsonb_array_elements(p_nodes) loop
  for dep in select jsonb_array_elements_text(n->'depends_on') loop
   insert into public.task_dependencies(organization_id,project_id,task_id,depends_on_id) values(r.organization_id,r.project_id,(ids->>(n->>'key'))::uuid,(ids->>dep)::uuid);
  end loop;
 end loop;
 insert into public.agent_events(organization_id,run_id,event_key,kind,payload) values(r.organization_id,p_run,'plan:'||p_call::text,'plan.created',ids);
 return ids;
end $$;
revoke all on function public.office_apply_plan(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_apply_plan(uuid,uuid,jsonb) to service_role;

create function public.office_finish_run(p_run uuid,p_status text,p_error text) returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.agent_runs;
begin
 if p_status not in ('succeeded','failed','waiting_approval') then raise exception 'Invalid terminal state'; end if;
 select * into r from public.agent_runs where id=p_run and status='running' for update;
 if not found then return false; end if;
 if p_status='succeeded' and not exists(select 1 from public.agent_tool_calls where run_id=p_run and tool='complete_task' and status='succeeded' and output->>'verified'='true') then raise exception 'Verified completion receipt required'; end if;
 update public.agent_runs set status=p_status,error=p_error where id=p_run;
 update public.agents set status=case p_status when 'succeeded' then 'completed' when 'failed' then 'error' else 'waiting_approval' end where id=r.agent_id;
 update public.tasks set status=case p_status when 'succeeded' then 'done' when 'failed' then 'failed' else 'waiting_approval' end where id=r.task_id;
 insert into public.agent_events(organization_id,run_id,agent_id,event_key,kind,payload) values(r.organization_id,r.id,r.agent_id,r.id::text||':'||p_status||':'||r.iteration::text,'run.'||p_status,jsonb_build_object('error',p_error)) on conflict(organization_id,event_key) do nothing;
 return true;
end $$;
revoke all on function public.office_finish_run(uuid,text,text) from public,anon,authenticated;
grant execute on function public.office_finish_run(uuid,text,text) to service_role;

create function public.office_audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb;
begin
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 insert into public.activity_logs(organization_id,actor_id,action,entity_id) values(coalesce(row_data->>'organization_id',row_data->>'id')::uuid,auth.uid(),tg_table_name||'.'||lower(tg_op),(row_data->>'id')::uuid);
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['organizations','projects','agents','agent_configs','model_providers','tasks','task_dependencies','conversations','project_documents','project_repositories','office_layouts','office_assets'] loop
  execute format('create trigger office_audit after insert or update or delete on public.%I for each row execute function public.office_audit_change()',t);
 end loop;
end $$;

create function public.office_dashboard_stats(p_org uuid) returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object(
  'projects',(select count(*) from public.projects where organization_id=p_org),
  'active_projects',(select count(*) from public.projects where organization_id=p_org and status='active'),
  'active_agents',(select count(*) from public.agents where organization_id=p_org and status='working'),
  'running_tasks',(select count(*) from public.tasks where organization_id=p_org and status='running'),
  'failed_tasks',(select count(*) from public.tasks where organization_id=p_org and status='failed'),
  'pending_approvals',(select count(*) from public.approvals where organization_id=p_org and status='pending'),
  'cost_micro_usd',(select coalesce(sum(cost_micro_usd),0) from public.model_usage where organization_id=p_org),
  'input_tokens',(select coalesce(sum(input_tokens),0) from public.model_usage where organization_id=p_org),
  'output_tokens',(select coalesce(sum(output_tokens),0) from public.model_usage where organization_id=p_org)
 )
$$;
revoke all on function public.office_dashboard_stats(uuid) from public,anon;
grant execute on function public.office_dashboard_stats(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('office-documents','office-documents',false,20971520,array['text/plain','text/markdown','application/pdf','application/json']),
 ('office-artifacts','office-artifacts',false,20971520,null)
on conflict(id) do nothing;
create policy office_storage_read on storage.objects for select to authenticated using (
 bucket_id in ('office-documents','office-artifacts') and exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.organization_id::text=(storage.foldername(name))[1])
);
create policy office_storage_upload on storage.objects for insert to authenticated with check (
 bucket_id='office-documents' and exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.role in ('ceo','manager','member') and m.organization_id::text=(storage.foldername(name))[1])
);

do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['agents','agent_runs','tasks','agent_messages','approvals','agent_events','model_usage','activity_logs'] loop
   execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
 end if;
end $$;
commit;
