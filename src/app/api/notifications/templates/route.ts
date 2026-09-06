import {z} from 'zod';
import {NotificationType,NotificationChannel} from '@prisma/client';
import prisma from '@/lib/prisma';
import {managerEndpoint,body,mutate,audit} from '@/lib/operations/core';
const schema=z.object({name:z.string().trim().min(1).max(100),type:z.nativeEnum(NotificationType),channel:z.nativeEnum(NotificationChannel),subject:z.string().max(200).optional(),content:z.string().trim().min(1).max(10000)}).strict();
export const GET=managerEndpoint(async()=>Response.json(await prisma.notificationTemplate.findMany({orderBy:{name:'asc'},take:200})));
export const POST=managerEndpoint(async(actor,request:Request)=>{const input=schema.parse(await body(request));return Response.json(await mutate(actor,request,'notification.template',input,async tx=>{const row=await tx.notificationTemplate.create({data:input});await audit(tx,actor,'TEMPLATE_CREATED','NotificationTemplate',row.id,{name:row.name});return row;}),{status:201});});
