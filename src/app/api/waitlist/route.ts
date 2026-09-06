import prisma from '@/lib/prisma';
import {OPERATIONS} from '@/lib/commerce/access';
import {endpoint,body,mutate,audit} from '@/lib/operations/core';
import {waitlistSchema} from '@/lib/operations/frontdesk';
export const GET=endpoint(OPERATIONS,async()=>Response.json(await prisma.waitlist.findMany({where:{status:{in:['WAITING','NOTIFIED']}},orderBy:{createdAt:'asc'},take:500})));
export const POST=endpoint(OPERATIONS,async(actor,request:Request)=>{const input=waitlistSchema.parse(await body(request));return Response.json(await mutate(actor,request,'waitlist.add',input,async tx=>{const row=await tx.waitlist.create({data:{...input,quotedTime:input.quotedTime?new Date(input.quotedTime):null,status:'WAITING'}});await audit(tx,actor,'WAITLIST_ADDED','Waitlist',row.id,input);return row;}),{status:201});});
