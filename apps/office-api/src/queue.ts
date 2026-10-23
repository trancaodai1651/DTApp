import { Queue } from 'bullmq';
import { redisConnection } from './env';
let queue:Queue|undefined;
export function getQueue() {return queue??=new Queue('office-runs',{connection:redisConnection()});}
export async function wakeRun(id:string) {
 // Unique per wake-up, so an earlier waiting-approval job cannot suppress resume.
 await getQueue().add('run',{id},{attempts:1,removeOnComplete:true,removeOnFail:100});
}
