import {z} from 'zod';
import prisma from '@/lib/prisma';
import {managerEndpoint,body,mutate,audit,OperationError} from '@/lib/operations/core';
const schema=z.object({title:z.string().trim().min(1).max(200),content:z.string().trim().min(10).max(20000),sourceUrl:z.union([z.string().url().refine(v=>['http:','https:'].includes(new URL(v).protocol)),z.literal('')]).optional()}).strict();
export const GET=managerEndpoint(async()=>Response.json(await prisma.restaurantKnowledge.findMany({orderBy:{updatedAt:'desc'},take:200})));
export const POST=managerEndpoint(async(actor,request:Request)=>{const input=schema.parse(await body(request));return Response.json(await mutate(actor,request,'knowledge.create',input,async tx=>{const row=await tx.restaurantKnowledge.create({data:{...input,authorId:actor.userId}});await audit(tx,actor,'KNOWLEDGE_CREATED','RestaurantKnowledge',row.id,{title:row.title});return row;}),{status:201});});
export const PATCH=managerEndpoint(async(actor,request:Request)=>{
 const input=z.object({id:z.string(),version:z.number().int().positive(),action:z.enum(['approve','archive','edit']),document:schema.optional()}).strict().parse(await body(request));
 return Response.json(await mutate(actor,request,'knowledge.update',input,async tx=>{
  const row=await tx.restaurantKnowledge.findUnique({where:{id:input.id}});if(!row)throw new OperationError('Document not found',404);if(row.version!==input.version)throw new OperationError('Document changed; reload',409);
  if(input.action==='approve'&&(!row.active||row.authorId===actor.userId))throw new OperationError('A different manager must review an active source',403);
  if(input.action==='edit'&&!input.document)throw new OperationError('Edited document required');
  const updated=await tx.restaurantKnowledge.update({where:{id:row.id},data:input.action==='approve'?{approvedById:actor.userId,approvedAt:new Date(),version:{increment:1}}:input.action==='archive'?{active:false,version:{increment:1}}:{...input.document,approvedById:null,approvedAt:null,authorId:actor.userId,version:{increment:1}}});
  await audit(tx,actor,'KNOWLEDGE_UPDATED','RestaurantKnowledge',row.id,{action:input.action,before:row,after:updated});return updated;
 }));
});
