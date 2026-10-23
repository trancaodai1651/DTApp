import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import type { Database,Row } from './database.types';
export interface OfficeConnection {supabaseUrl:string;publishableKey:string;apiUrl:string}
const connectionKey='dt.office.connection';
export function readOfficeConnection():OfficeConnection {
 const defaults={supabaseUrl:import.meta.env.VITE_OFFICE_SUPABASE_URL||'',publishableKey:import.meta.env.VITE_OFFICE_SUPABASE_ANON_KEY||'',apiUrl:import.meta.env.VITE_OFFICE_API_URL||(/^https?:$/.test(location.protocol)?location.origin:'http://127.0.0.1:8790')};
 try{return {...defaults,...JSON.parse(localStorage.getItem(connectionKey)||'{}')};}catch{return defaults;}
}
export function saveOfficeConnection(value:OfficeConnection) {
 const supa=new URL(value.supabaseUrl),api=new URL(value.apiUrl);
 if(supa.protocol!=='https:'||!supa.hostname.endsWith('.supabase.co')||supa.username||supa.password||supa.pathname!=='/')throw new Error('Nhập Project URL Supabase HTTPS hợp lệ.');
 if(api.protocol!=='https:'&&!(api.protocol==='http:'&&['localhost','127.0.0.1'].includes(api.hostname)))throw new Error('Office API cần HTTPS hoặc HTTP loopback.');
 if(api.username||api.password||api.search||api.hash)throw new Error('URL API không hợp lệ.');
 if(value.publishableKey.startsWith('sb_secret_'))throw new Error('Chỉ nhập publishable/anon key. Server secret không được dùng trong trình duyệt.');
 if(value.publishableKey.split('.').length===3) {
  try{const claim=JSON.parse(atob(value.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claim.role!=='anon')throw new Error('unsafe');}catch{throw new Error('JWT key cần có role anon.');}
 } else if(!value.publishableKey.startsWith('sb_publishable_'))throw new Error('Nhập publishable key hoặc anon key từ Supabase.');
 localStorage.setItem(connectionKey,JSON.stringify({...value,supabaseUrl:supa.origin,apiUrl:api.origin}));
}
export function createOfficeClient(value:OfficeConnection):SupabaseClient<Database>|null {
 if(!value.supabaseUrl||!value.publishableKey)return null;
 if(value.publishableKey.startsWith('sb_secret_'))return null;
 if(!value.publishableKey.startsWith('sb_publishable_')) {
  try {if(JSON.parse(atob(value.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')return null;}catch{return null;}
 }
 try{return createClient<Database>(value.supabaseUrl,value.publishableKey,{auth:{storageKey:'dt-office-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}catch{return null;}
}
export async function officeRequest<T>(client:SupabaseClient<Database>,apiUrl:string,path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T> {
 const session=await client.auth.getSession();if(!session.data.session)throw new Error('Cần đăng nhập.');
 const response=await fetch(`${apiUrl.replace(/\/$/,'')}/api/office/${path}`,{method,headers:{authorization:`Bearer ${session.data.session.access_token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof result.error==='string'?result.error:typeof result.error?.message==='string'?result.error.message:`API trả về HTTP ${response.status}. Kiểm tra migration, quyền CEO và cấu hình server.`);
 return result as T;
}
export interface Snapshot {
 agents:Row<'agents'>[];agent_configs:Row<'agent_configs'>[];model_providers:Row<'model_providers'>[];projects:Row<'projects'>[];tasks:Row<'tasks'>[];task_dependencies:Row<'task_dependencies'>[];agent_runs:Row<'agent_runs'>[];approvals:Row<'approvals'>[];model_usage:Row<'model_usage'>[];budgets:Row<'budgets'>[];activity_logs:Row<'activity_logs'>[];conversations:Row<'conversations'>[];agent_messages:Row<'agent_messages'>[];project_documents:Row<'project_documents'>[];task_artifacts:Row<'task_artifacts'>[];agent_events:Row<'agent_events'>[];
 stats:{projects:number;active_projects:number;active_agents:number;running_tasks:number;failed_tasks:number;pending_approvals:number;cost_micro_usd:number;input_tokens:number;output_tokens:number};
}
