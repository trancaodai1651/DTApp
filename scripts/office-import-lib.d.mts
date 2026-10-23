export interface LegacyMessage { id:number;sender:string;role?:string;text:string;timestamp:number;is_system?:number;reactions?:string;thread_id?:number|null;recipient?:string|null;msg_type?:string|null;seen?:number;read_at?:number|null }
export interface ImportedMessage { id:string;organization_id:string;conversation_id:string;content:string;kind:string;sender_user_id:null;sender_agent_id:null;recipient_agent_id:null;parent_id:string|null;legacy_source:string;legacy_id:number;metadata:Record<string,unknown>;created_at:string;updated_at:string }
export function legacyUuid(source:string,id:string|number):string;
export function mapLegacyMessages(rows:LegacyMessage[],options:{organizationId:string;conversationId:string;sourceId:string}):ImportedMessage[];
