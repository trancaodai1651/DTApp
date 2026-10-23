import { createHash } from 'node:crypto';

export function legacyUuid(source, id) {
 const hex = createHash('sha256').update(`dt-office-import:${source}:${id}`).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

export function mapLegacyMessages(rows, { organizationId, conversationId, sourceId }) {
 if (!sourceId || !organizationId || !conversationId) throw new Error('Organization, conversation and stable source ID are required');
 const ids = new Set(rows.map(row => Number(row.id)));
 if (ids.size !== rows.length) throw new Error('Duplicate source IDs');
 const parents=new Map(rows.map(row=>[Number(row.id),row.thread_id==null?null:Number(row.thread_id)]));
 const complete=new Set();
 for(const row of rows){const visiting=new Set();let id=Number(row.id);while(id!=null&&!complete.has(id)){if(visiting.has(id))throw new Error('Thread cycle in source');visiting.add(id);const parent=parents.get(id);if(parent==null)break;id=parent;}for(const key of visiting)complete.add(key);}
 return rows.map(row => {
  if (!Number.isSafeInteger(Number(row.id)) || typeof row.text !== 'string' || !Number.isFinite(Number(row.timestamp))) throw new Error('Invalid legacy message');
  if (row.thread_id != null && !ids.has(Number(row.thread_id))) throw new Error(`Missing thread root for legacy message ${row.id}`);
  return {
   id: legacyUuid(sourceId, row.id), organization_id: organizationId, conversation_id: conversationId,
   content: row.text, kind: row.is_system ? 'system' : 'message',
   sender_user_id: null, sender_agent_id: null, recipient_agent_id: null,
   parent_id: row.thread_id == null ? null : legacyUuid(sourceId, row.thread_id),
   legacy_source: sourceId, legacy_id: Number(row.id),
   metadata: { legacy_sender: row.sender, legacy_role: row.role, recipient: row.recipient ?? null, msg_type: row.msg_type ?? null, reactions: row.reactions ?? '[]', seen: row.seen ?? 0, read_at: row.read_at ?? null },
   created_at: new Date(Number(row.timestamp)).toISOString(), updated_at: new Date(Number(row.timestamp)).toISOString(),
  };
 });
}
