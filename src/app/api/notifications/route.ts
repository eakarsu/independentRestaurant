import {NotificationStatus,NotificationType,NotificationChannel} from '@prisma/client';
import {z} from 'zod';
import prisma from '@/lib/prisma';
import {managerEndpoint,body,mutate,audit,OperationError} from '@/lib/operations/core';
import {notificationSchema,queueNotification} from '@/lib/operations/notifications';
export const GET=managerEndpoint(async(_actor,request:Request)=>{
 const p=new URL(request.url).searchParams;const input=z.object({limit:z.coerce.number().int().min(1).max(200).default(50),status:z.nativeEnum(NotificationStatus).optional(),type:z.nativeEnum(NotificationType).optional(),channel:z.nativeEnum(NotificationChannel).optional()}).parse(Object.fromEntries(p));
 const {limit,...where}=input;return Response.json(await prisma.notification.findMany({where,take:limit,orderBy:{createdAt:'desc'}}));
});
export const POST=managerEndpoint(async(actor,request:Request)=>Response.json(await queueNotification(actor,request,notificationSchema.parse(await body(request))),{status:201}));
export const PATCH=managerEndpoint(async(actor,request:Request)=>{
 const input=z.object({id:z.string().min(1),action:z.enum(['cancel','retry'])}).strict().parse(await body(request));
 return Response.json(await mutate(actor,request,'notification.action',input,async tx=>{
  const row=await tx.notification.findUnique({where:{id:input.id}});if(!row)throw new OperationError('Message not found',404);
  const allowed=input.action==='cancel'?['PENDING','FAILED']:['FAILED'];if((input.action==='retry'&&row.providerRef)||!allowed.includes(row.status))throw new OperationError('This message cannot be changed. Uncertain deliveries require provider reconciliation.',409);
  const result=await tx.notification.update({where:{id:row.id},data:{status:input.action==='cancel'?'CANCELLED':'PENDING',attempts:0,nextAttemptAt:new Date(),errorMessage:null}});await audit(tx,actor,`NOTIFICATION_${input.action.toUpperCase()}`,'Notification',row.id,{previous:row.status});return result;
 }));
});
