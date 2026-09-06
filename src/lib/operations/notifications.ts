import {NotificationChannel,NotificationType,Prisma,type Notification} from '@prisma/client';
import {z} from 'zod';
import prisma from '@/lib/prisma';
import {OperationError,audit,mutate,digest,json} from './core';
import type {Actor} from '@/lib/commerce/authz';
export const notificationSchema=z.object({type:z.nativeEnum(NotificationType),channel:z.nativeEnum(NotificationChannel),recipient:z.string().trim().max(254),subject:z.string().trim().max(200).optional(),message:z.string().trim().min(1).max(10000),consentConfirmed:z.literal(true)}).strict().superRefine((v,ctx)=>{if(v.channel==='EMAIL'&&!z.string().email().safeParse(v.recipient).success)ctx.addIssue({code:'custom',message:'Valid recipient email required'});if(v.channel==='SMS'&&!/^\+[1-9]\d{7,14}$/.test(v.recipient))ctx.addIssue({code:'custom',message:'SMS number must include country code'});});
export function notificationConfiguration(channel:string){return channel==='EMAIL'?!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL):!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM_NUMBER&&process.env.NOTIFICATION_WEBHOOK_BASE_URL);}
export async function queueNotification(actor:Actor,request:Request,input:z.infer<typeof notificationSchema>){
 if(!notificationConfiguration(input.channel))throw new OperationError(`${input.channel} provider configuration is incomplete`,503);
 return mutate(actor,request,'notification.queue',input,async tx=>{
  const {consentConfirmed,...data}=input;
  if(input.type==='PROMOTION'){
   const client=await tx.customer.findFirst({where:input.channel==='EMAIL'?{email:input.recipient,allowEmail:true}:{phone:input.recipient,allowSms:true}});
   if(!client)throw new OperationError('Marketing messages require the customer’s saved channel opt-in',409);
  }
  const row=await tx.notification.create({data:{...data,consentRecorded:consentConfirmed,createdById:actor.userId,deliveryKey:request.headers.get('idempotency-key')!,provider:input.channel==='EMAIL'?'resend':'twilio'}});
  await audit(tx,actor,'NOTIFICATION_QUEUED','Notification',row.id,{channel:row.channel,type:row.type,consentConfirmed});return row;
 });
}
export type DeliveryEvidence={provider:string;reference:string;status:'SENT'|'DELIVERED'|'FAILED';eventId:string};
export async function recordDeliveryEvidence(evidence:DeliveryEvidence){
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('restaurant-notification-callback'))`;
  const id=`message-event:${evidence.provider}:${evidence.eventId}`;
  if(await tx.operationReceipt.findUnique({where:{id}}))return;
  await tx.operationReceipt.create({data:{id,actorId:`provider:${evidence.provider}`,operation:'notification.webhook',requestHash:digest(evidence),response:json(evidence)}});
  await applyEvidence(tx,evidence);
 });
}
async function applyEvidence(tx:Prisma.TransactionClient,evidence:DeliveryEvidence){
 const n=await tx.notification.findFirst({where:{provider:evidence.provider,providerRef:evidence.reference}});if(!n)return;
 if(n.status==='DELIVERED'||n.status==='CANCELLED'||(n.status==='FAILED'&&evidence.status==='SENT'))return;
 await tx.notification.update({where:{id:n.id},data:{status:evidence.status,processingAt:null,...(evidence.status==='DELIVERED'?{deliveredAt:new Date()}:evidence.status==='FAILED'?{failedAt:new Date(),errorMessage:'Provider reported delivery failure'}:{sentAt:n.sentAt||new Date()})}});
}
export async function processNextNotification(fetcher:typeof fetch=fetch){
 if(process.env.ENABLE_NOTIFICATION_DELIVERY!=='true')return {enabled:false};
 await prisma.notification.updateMany({where:{status:'PROCESSING',processingAt:{lt:new Date(Date.now()-120000)}},data:{status:'UNKNOWN',errorMessage:'Delivery attempt interrupted. Reconcile with provider before resending.'}});
 const candidates=await prisma.notification.findMany({where:{status:'PENDING',consentRecorded:true,nextAttemptAt:{lte:new Date()},attempts:{lt:5}},orderBy:{createdAt:'asc'},take:20});
 const n=candidates.find(x=>notificationConfiguration(x.channel));if(!n)return null;
 if(n.type==='PROMOTION'&&!await prisma.customer.findFirst({where:n.channel==='EMAIL'?{email:n.recipient,allowEmail:true}:{phone:n.recipient,allowSms:true},select:{id:true}})){
  await prisma.notification.updateMany({where:{id:n.id,status:'PENDING'},data:{status:'CANCELLED',errorMessage:'Marketing consent was withdrawn'}});return {id:n.id,status:'CANCELLED'};
 }
 const claimed=await prisma.notification.updateMany({where:{id:n.id,status:'PENDING'},data:{status:'PROCESSING',processingAt:new Date(),attempts:{increment:1}}});if(!claimed.count)return null;
 try{
  const result=await dispatch(n,fetcher);
  if(result.kind==='retry'){await prisma.notification.updateMany({where:{id:n.id,status:'PROCESSING'},data:{status:n.attempts>=4?'FAILED':'PENDING',nextAttemptAt:new Date(Date.now()+Math.min(300000,30000*2**n.attempts)),errorMessage:'Provider rate limit',processingAt:null}});return {id:n.id,status:'RATE_LIMITED'};}
  if(result.kind==='failed'){await prisma.notification.updateMany({where:{id:n.id,status:'PROCESSING'},data:{status:'FAILED',failedAt:new Date(),errorMessage:'Provider rejected the message',processingAt:null}});return {id:n.id,status:'FAILED'};}
  await prisma.$transaction(async tx=>{
   await tx.notification.update({where:{id:n.id},data:{status:'SENT',providerRef:result.reference,sentAt:new Date(),processingAt:null,errorMessage:null}});
   const receipts=await tx.operationReceipt.findMany({where:{operation:'notification.webhook',response:{path:['reference'],equals:result.reference}},orderBy:{createdAt:'asc'},take:50});
   for(const receipt of receipts)await applyEvidence(tx,receipt.response as DeliveryEvidence);
  });return {id:n.id,status:'SENT'};
 }catch{
  await prisma.notification.updateMany({where:{id:n.id,status:'PROCESSING'},data:{status:'UNKNOWN',errorMessage:'Provider outcome is uncertain. Check provider records; automatic retry is disabled.',processingAt:null}});return {id:n.id,status:'UNKNOWN'};
 }
}
async function dispatch(n:Notification,fetcher:typeof fetch):Promise<{kind:'retry'}|{kind:'failed'}|{kind:'accepted';reference:string}>{
 let response:Response;
 if(n.channel==='EMAIL'){
  response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`restaurant:${n.id}`},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[n.recipient],subject:n.subject||'Restaurant update',text:n.message}),signal:AbortSignal.timeout(20000)});
 }else{
  const callback=new URL('/api/notification-webhooks/twilio',process.env.NOTIFICATION_WEBHOOK_BASE_URL);
  response=await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID!)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:n.recipient,From:process.env.TWILIO_FROM_NUMBER!,Body:n.message,StatusCallback:callback.toString()}),signal:AbortSignal.timeout(20000)});
 }
 if(response.status===429)return {kind:'retry'};
 if(response.status>=500)throw Error('Provider uncertain');
 if(!response.ok)return {kind:'failed'};
 const result=await response.json();const reference=n.channel==='EMAIL'?result.id:result.sid;if(typeof reference!=='string'||!reference)throw Error('Missing provider receipt');return {kind:'accepted',reference};
}
