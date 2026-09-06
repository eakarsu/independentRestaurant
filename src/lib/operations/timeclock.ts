import {z} from 'zod';
import type {Prisma} from '@prisma/client';
import type {Actor} from '@/lib/commerce/authz';
import {MANAGEMENT} from '@/lib/commerce/access';
import {OperationError,audit} from './core';
export const clockSchema=z.object({action:z.enum(['clockIn','clockOut','breakStart','breakEnd']),staffId:z.string().min(1)}).strict();
export async function clock(tx:Prisma.TransactionClient,actor:Actor,input:z.infer<typeof clockSchema>){
 const staff=await tx.staff.findUnique({where:{id:input.staffId}});if(!staff||staff.status!=='ACTIVE')throw new OperationError('Active staff member not found',404);
 if(!MANAGEMENT.includes(actor.role)&&staff.userId!==actor.userId)throw new OperationError('You can only change your own time clock',403);
 const now=new Date();const open=await tx.timeClock.findFirst({where:{staffId:staff.id,clockOut:null},orderBy:{clockIn:'desc'}});
 if(input.action==='clockIn'){
  if(open)throw new OperationError('Already clocked in',409);
  const row=await tx.timeClock.create({data:{staffId:staff.id,clockIn:now,hourlyRateSnapshot:staff.hourlyRate}});await audit(tx,actor,'CLOCK_IN','TimeClock',row.id,{staffId:staff.id});return row;
 }
 if(!open)throw new OperationError('No open shift',409);
 if(open.approvedAt)throw new OperationError('Approved time is immutable',409);
 let update:Prisma.TimeClockUpdateManyMutationInput={version:{increment:1}};
 if(input.action==='breakStart'){
  if(open.breakStart&&!open.breakEnd)throw new OperationError('Break already running',409);update={...update,breakStart:now,breakEnd:null};
 }else{
  const running=open.breakStart&&!open.breakEnd?Math.floor((now.getTime()-open.breakStart.getTime())/60000):0;
  if(input.action==='breakEnd'){
   if(!open.breakStart||open.breakEnd)throw new OperationError('No running break',409);update={...update,breakEnd:now,breakMinutes:open.breakMinutes+running};
  }else{
   const minutes=(now.getTime()-open.clockIn.getTime())/60000;if(minutes>24*60)throw new OperationError('Shift exceeds 24 hours; a manager must correct it');
   const breaks=open.breakMinutes+running;update={...update,clockOut:now,breakEnd:running?now:open.breakEnd,breakMinutes:breaks,totalHours:Math.max(0,(minutes-breaks)/60)};
  }
 }
 const changed=await tx.timeClock.updateMany({where:{id:open.id,version:open.version,clockOut:null},data:update});if(!changed.count)throw new OperationError('Time entry changed; reload',409);
 const row=await tx.timeClock.findUniqueOrThrow({where:{id:open.id}});await audit(tx,actor,input.action.toUpperCase(),'TimeClock',row.id,{staffId:staff.id,breakMinutes:row.breakMinutes,totalHours:row.totalHours});return row;
}
export const correctionSchema=z.object({id:z.string().min(1),version:z.number().int().positive(),action:z.enum(['approve','correct']),clockIn:z.string().datetime().optional(),clockOut:z.string().datetime().optional(),breakMinutes:z.number().int().min(0).max(1440).optional(),reason:z.string().trim().min(5).max(1000)}).strict();
export async function correctClock(tx:Prisma.TransactionClient,actor:Actor,input:z.infer<typeof correctionSchema>){
 const row=await tx.timeClock.findUnique({where:{id:input.id}});if(!row)throw new OperationError('Time entry not found',404);if(row.version!==input.version)throw new OperationError('Time entry changed',409);if(row.approvedAt)throw new OperationError('Approved entries are immutable',409);
 let data:Prisma.TimeClockUpdateInput;
 if(input.action==='approve'){if(!row.clockOut||row.hourlyRateSnapshot===null)throw new OperationError('Close the shift and record its historical hourly rate before approval');data={approvedById:actor.userId,approvedAt:new Date(),version:{increment:1}};}
 else{
  if(!input.clockIn||!input.clockOut||input.breakMinutes===undefined)throw new OperationError('Provide the complete corrected shift');
  const start=new Date(input.clockIn),end=new Date(input.clockOut),minutes=(end.getTime()-start.getTime())/60000;
  if(minutes<=0||minutes>1440||input.breakMinutes>minutes||end>new Date())throw new OperationError('Invalid time range or break duration');
  if(await tx.timeClock.count({where:{staffId:row.staffId,id:{not:row.id},clockIn:{lt:end},OR:[{clockOut:null},{clockOut:{gt:start}}]}}))throw new OperationError('Shift overlaps another time entry',409);
  data={clockIn:start,clockOut:end,breakMinutes:input.breakMinutes,totalHours:(minutes-input.breakMinutes)/60,breakStart:null,breakEnd:null,version:{increment:1}};
 }
 const updated=await tx.timeClock.update({where:{id:row.id},data});await audit(tx,actor,`TIME_${input.action.toUpperCase()}`,'TimeClock',row.id,{reason:input.reason,before:row,after:updated});return updated;
}
