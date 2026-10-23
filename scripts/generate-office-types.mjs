import { PGlite } from '@electric-sql/pglite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
await db.exec(await readFile('supabase/migrations/20261023000000_virtual_office.sql','utf8'));
const cols=(await db.query(`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`)).rows;
const tsType=col => ({uuid:'string',text:'string',boolean:'boolean',integer:'number',bigint:'number',jsonb:'Json','timestamp with time zone':'string',ARRAY:'string[]'}[col.data_type] || 'unknown');
let out='// Generated from the executed office SQL migration. Run node scripts/generate-office-types.mjs\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n';
for(const table of [...new Set(cols.map(col=>col.table_name))]) {
 const fields=cols.filter(col=>col.table_name===table);
 out+=` ${table}: { Row: {\n${fields.map(col=>`  ${col.column_name}: ${tsType(col)}${col.is_nullable==='YES'?' | null':''};`).join('\n')}\n }; Insert: {\n${fields.map(col=>`  ${col.column_name}${col.is_nullable==='YES'||col.column_default?'?':''}: ${tsType(col)}${col.is_nullable==='YES'?' | null':''};`).join('\n')}\n }; Update: Partial<Database['public']['Tables']['${table}']['Insert']>; Relationships: [] };\n`;
}
out+='}; Views: Record<string, never>; Functions: {\n';
const funcs=(await db.query(`select routine_name,data_type,specific_name from information_schema.routines where routine_schema='public' and routine_name like 'office_%' and data_type<>'trigger' order by routine_name`)).rows;
for(const fn of funcs) {
 const args=(await db.query(`select parameter_name,data_type from information_schema.parameters where specific_schema='public' and specific_name=$1 order by ordinal_position`,[fn.specific_name])).rows;
 out+=` ${fn.routine_name}: { Args: { ${args.map(col=>`${col.parameter_name}: ${tsType(col)}`).join('; ')} }; Returns: ${fn.data_type==='void'?'undefined':tsType(fn)} };\n`;
}
out+='}; Enums: Record<string, never>; CompositeTypes: Record<string, never> } };\nexport type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];\n';
for(const target of ['src/office/database.types.ts','apps/office-api/src/database.types.ts']) { await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true}); await writeFile(target,out); }
await db.close(); console.log('Generated types for 32 tables and public office RPCs');
