import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module,Catch,HttpException,type ExceptionFilter,type ArgumentsHost } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request,Response,NextFunction } from 'express';
import { OfficeController,publicError } from './controller';
import { env } from './env';

@Module({controllers:[OfficeController]}) class OfficeModule {}
@Catch() class SafeErrors implements ExceptionFilter {
 catch(original:unknown,host:ArgumentsHost) {
  const error=publicError(original),response=host.switchToHttp().getResponse<Response>();
  const status=error instanceof HttpException?error.getStatus():400;
  response.status(status).json({error:error instanceof HttpException?error.getResponse():'Yêu cầu bị từ chối. Kiểm tra cấu hình, quyền và dữ liệu liên quan.'});
 }
}
export async function createOfficeApp() {
 const app=await NestFactory.create<NestExpressApplication>(OfficeModule,{logger:['error','warn','log']});
 app.useBodyParser('json',{limit:'256kb'});
 app.useGlobalFilters(new SafeErrors());
 const origins=env.OFFICE_ALLOWED_ORIGINS.split(',').map(x=>x.trim());
 app.enableCors({origin:(origin,callback)=>callback(null,!origin||origins.includes(origin)),allowedHeaders:['Content-Type','Authorization'],methods:['GET','POST','PATCH','DELETE','OPTIONS']});
 const limits=new Map<string,{at:number;count:number}>();
 app.use((req:Request,res:Response,next:NextFunction)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  const key=req.socket.remoteAddress||'unknown',now=Date.now();
  if(limits.size>10000)for(const [ip,b] of limits)if(now-b.at>60000)limits.delete(ip);
  const bucket=limits.get(key);if(!bucket||now-bucket.at>60000)limits.set(key,{at:now,count:1});
  else if(++bucket.count>120){res.status(429).json({error:'Quá nhiều yêu cầu. Thử lại sau một phút.'});return;}
  next();
 });
 app.enableShutdownHooks();return app;
}
if(require.main===module)void createOfficeApp().then(app=>app.listen(env.OFFICE_PORT,env.OFFICE_HOST));
