-- Optional team templates, with NO model keys, simulated tasks or usage.
-- Run as database administrator after creating a real organization via Auth.
-- First execute: set office.seed_org_id = 'YOUR-ORGANIZATION-UUID';
begin;
do $$
declare org uuid:=nullif(current_setting('office.seed_org_id',true),'')::uuid;
begin
 if org is null or not exists(select 1 from public.organizations where id=org) then raise exception 'Set office.seed_org_id to an existing organization UUID'; end if;
 perform 1 from public.organizations where id=org for update;
 insert into public.agents(organization_id,name,role)
 select org,template.name,template.role from (values
  ('Quản lý dự án AI','pm'),('Chuyên viên BA','ba'),('Lập trình viên AI','developer'),('Kiểm thử viên AI','tester'),('Kế toán AI','accountant')
 ) as template(name,role)
 where not exists(select 1 from public.agents a where a.organization_id=org and a.role=template.role and a.name=template.name);
end $$;
commit;
