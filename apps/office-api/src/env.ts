import { z } from 'zod';
export const env = z.object({
 OFFICE_SUPABASE_URL:z.url().optional(),OFFICE_SUPABASE_ANON_KEY:z.string().min(20).optional(),OFFICE_SUPABASE_SERVICE_KEY:z.string().min(20).optional(),
 OFFICE_PORT:z.coerce.number().int().min(1).max(65535).default(8790),OFFICE_HOST:z.string().default('127.0.0.1'),
 OFFICE_ALLOWED_ORIGINS:z.string().default('http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173'),
 OFFICE_REDIS_URL:z.url().default('redis://127.0.0.1:6379'),
 OFFICE_RUNNER_URL:z.url().optional(),OFFICE_RUNNER_TOKEN:z.string().min(32).optional(),
}).parse(process.env);
export function redisConnection() {
 const url=new URL(env.OFFICE_REDIS_URL);
 return {host:url.hostname,port:Number(url.port||6379),username:decodeURIComponent(url.username)||undefined,password:decodeURIComponent(url.password)||undefined,db:Number(url.pathname.slice(1)||0),maxRetriesPerRequest:null,...(url.protocol==='rediss:'?{tls:{}}:{})};
}
