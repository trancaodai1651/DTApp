// Offline conversion only. The application/worker never imports node:sqlite.
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { legacyUuid, mapLegacyMessages } from './office-import-lib.mjs';

const { values } = parseArgs({ options: { file:{type:'string'}, org:{type:'string'}, project:{type:'string'}, 'source-id':{type:'string'}, 'dry-run':{type:'boolean',default:false} } });
try {
 if (!values.file || !values.org || !values.project || !values['source-id']) throw new Error('Usage: --file path/chat.db --org UUID --project UUID --source-id stable-name [--dry-run]');
 const db = new DatabaseSync(values.file, { readOnly: true });
 let source;
 try { source = db.prepare('select * from messages order by timestamp,id').all(); } finally { db.close(); }
 const conversationId = legacyUuid(values['source-id'], 'conversation');
 const rows = mapLegacyMessages(source, { organizationId: values.org, conversationId, sourceId: values['source-id'] });
 if (values['dry-run']) {
  console.log(JSON.stringify({ mode:'dry-run', messages:rows.length, threads:rows.filter(row=>row.parent_id).length, sourceUnchanged:true }));
 } else {
  const url = process.env.OFFICE_SUPABASE_URL, key = process.env.OFFICE_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Set OFFICE_SUPABASE_URL and OFFICE_SUPABASE_SERVICE_KEY in local .env');
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const check = result => { if(result.error) throw new Error(`Database rejected import (${result.error.code || 'unknown'}); no success claimed`); return result.data; };
  check(await client.from('projects').select('id').eq('id',values.project).eq('organization_id',values.org).single());
  const existing = check(await client.from('conversations').select('project_id').eq('id',conversationId).maybeSingle());
  if (existing && existing.project_id!==values.project) throw new Error('Source ID already belongs to another project');
  check(await client.from('conversations').upsert({id:conversationId,organization_id:values.org,project_id:values.project,title:`Claude-Office import · ${values['source-id']}`,kind:'import'}));
  // Import parents before threads; supports threads pointing to later integer IDs.
  const pending = [...rows], inserted = new Set();
  while(pending.length) {
   const ready = pending.filter(row=>!row.parent_id || inserted.has(row.parent_id));
   if(!ready.length) throw new Error('Thread cycle in source; resolve before retry');
   for(let i=0;i<ready.length;i+=200) {
    const batch=ready.slice(i,i+200);
    check(await client.from('agent_messages').upsert(batch,{onConflict:'id'}));
    const target=check(await client.from('agent_messages').select('id,content,parent_id,created_at,metadata,legacy_id,conversation_id').in('id',batch.map(row=>row.id)).eq('organization_id',values.org));
    if(target.length!==batch.length) throw new Error('Verification count mismatch');
    for(const row of batch) {
     const saved=target.find(value=>value.id===row.id);
     if(!saved || saved.content!==row.content || saved.parent_id!==row.parent_id || saved.conversation_id!==conversationId || new Date(saved.created_at).getTime()!==new Date(row.created_at).getTime() || JSON.stringify(saved.metadata)!==JSON.stringify(row.metadata)) {
      // JSONB key order is not stable; compare sorted metadata separately below.
      if(!saved || saved.content!==row.content || saved.parent_id!==row.parent_id || saved.conversation_id!==conversationId || new Date(saved.created_at).getTime()!==new Date(row.created_at).getTime() || Object.keys(row.metadata).some(key=>JSON.stringify(saved.metadata[key])!==JSON.stringify(row.metadata[key]))) throw new Error('Verification content/relation mismatch');
     }
     inserted.add(row.id); pending.splice(pending.findIndex(value=>value.id===row.id),1);
    }
   }
  }
  console.log(JSON.stringify({mode:'import',sourceCount:rows.length,verifiedCount:inserted.size,threadsVerified:rows.filter(row=>row.parent_id).length,sourceUnchanged:true}));
 }
} catch(error) { console.error(error.message); process.exitCode=1; }
