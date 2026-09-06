import prisma from '@/lib/prisma';
import {OPERATIONS,MANAGEMENT} from '@/lib/commerce/access';
import {endpoint,body,mutate,audit} from '@/lib/operations/core';
import {tableSchema} from '@/lib/operations/frontdesk';
export const GET=endpoint(OPERATIONS,async()=>Response.json(await prisma.table.findMany({orderBy:{number:'asc'},include:{reservations:{where:{status:{in:['PENDING','CONFIRMED','SEATED']},time:{gte:new Date(Date.now()-86400000),lte:new Date(Date.now()+86400000)}}}},take:500})));
export const POST=endpoint(MANAGEMENT,async(actor,request:Request)=>{const input=tableSchema.parse(await body(request));return Response.json(await mutate(actor,request,'table.create',input,async tx=>{const row=await tx.table.create({data:input});await audit(tx,actor,'TABLE_CREATED','Table',row.id,input);return row;}),{status:201});});
