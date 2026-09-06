import prisma from '@/lib/prisma';
import {OPERATIONS,MANAGEMENT} from '@/lib/commerce/access';
import {endpoint,managerEndpoint,body,mutate,csv,OperationError} from '@/lib/operations/core';
import {clock,clockSchema,correctClock,correctionSchema} from '@/lib/operations/timeclock';
export const GET=endpoint(OPERATIONS,async(actor,request:Request)=>{
 const params=new URL(request.url).searchParams;const end=params.get('to')?new Date(params.get('to')!):new Date();const start=params.get('from')?new Date(params.get('from')!):new Date(end.getTime()-31*86400000);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start||+end-+start>366*86400000)throw new OperationError('Choose a valid date range up to one year');
 const management=MANAGEMENT.includes(actor.role);const rows=await prisma.timeClock.findMany({where:{clockIn:{gte:start,lte:end},...(!management?{staff:{userId:actor.userId}}:{})},include:{staff:{select:{firstName:true,lastName:true}}},orderBy:{clockIn:'desc'},take:2000});
 if(params.get('format')==='csv'){if(!management)throw new OperationError('Manager access required',403);return new Response(csv([['Staff','Clock in UTC','Clock out UTC','Break minutes','Hours','Hourly rate','Base pay','Approved UTC'],...rows.filter(r=>r.approvedAt).map(r=>[`${r.staff.firstName} ${r.staff.lastName}`,r.clockIn.toISOString(),r.clockOut?.toISOString(),r.breakMinutes,r.totalHours,r.hourlyRateSnapshot?.toFixed(2),r.hourlyRateSnapshot?.mul(r.totalHours||0).toFixed(2),r.approvedAt?.toISOString()])]),{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="approved-time.csv"'}});}
 const staff=await prisma.staff.findMany({where:{status:'ACTIVE',...(!management?{userId:actor.userId}:{})},select:{id:true,firstName:true,lastName:true},take:500});return Response.json({rows,staff,management,limit:2000});
});
export const POST=endpoint(OPERATIONS,async(actor,request:Request)=>{const input=clockSchema.parse(await body(request));return Response.json(await mutate(actor,request,'timeclock',input,tx=>clock(tx,actor,input)));});
export const PATCH=managerEndpoint(async(actor,request:Request)=>{const input=correctionSchema.parse(await body(request));return Response.json(await mutate(actor,request,'timeclock.correct',input,tx=>correctClock(tx,actor,input)));});
