import {z} from 'zod';
import prisma from '@/lib/prisma';
import {managerEndpoint,body,mutate,audit,OperationError} from '@/lib/operations/core';
import {aiFeatures,aiSchema,runAi} from '@/lib/operations/ai';
export const GET=managerEndpoint(async()=>{
 await prisma.restaurantAiRun.updateMany({where:{status:'RUNNING',updatedAt:{lt:new Date(Date.now()-120000)}},data:{status:'FAILED',error:'The job was interrupted. Provider outcome may be uncertain; review usage before making a new request.'}});
 const rows=await prisma.restaurantAiRun.findMany({orderBy:{createdAt:'desc'},take:100});const today=new Date();today.setUTCHours(0,0,0,0);const usage=await prisma.restaurantAiRun.aggregate({where:{createdAt:{gte:today}},_sum:{costUsd:true},_count:{_all:true,costUsd:true}});
 return Response.json({rows,features:aiFeatures,configured:!!(process.env.OPENROUTER_API_KEY&&process.env.OPENROUTER_MODEL),usage:{calls:usage._count._all,reportedCostUsd:usage._sum.costUsd,requestsWithoutReportedCost:usage._count._all-usage._count.costUsd}});
});
export const POST=managerEndpoint(async(actor,request:Request)=>Response.json(await runAi(actor,request,aiSchema.parse(await body(request)))));
export const PATCH=managerEndpoint(async(actor,request:Request)=>{
 const input=z.object({id:z.string().min(1),action:z.enum(['APPROVED','REJECTED','CANCELLED']),notes:z.string().trim().min(5).max(3000)}).strict().parse(await body(request));
 return Response.json(await mutate(actor,request,'ai.review',input,async tx=>{
  const row=await tx.restaurantAiRun.findUnique({where:{id:input.id}});if(!row)throw new OperationError('AI run not found',404);
  if(input.action==='CANCELLED'?!['PENDING','RUNNING'].includes(row.status):row.status!=='DRAFT')throw new OperationError('The job is no longer in a reviewable state',409);
  const changed=await tx.restaurantAiRun.updateMany({where:{id:row.id,status:row.status},data:{status:input.action,reviewedById:actor.userId,reviewedAt:new Date(),reviewNotes:input.notes}});if(!changed.count)throw new OperationError('Job changed; reload',409);
  await audit(tx,actor,'AI_REVIEWED','RestaurantAiRun',row.id,input);return tx.restaurantAiRun.findUniqueOrThrow({where:{id:row.id}});
 }));
});
