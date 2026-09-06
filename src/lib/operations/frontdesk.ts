import {z} from 'zod';
import {Prisma,TableStatus} from '@prisma/client';
import type {Actor} from '@/lib/commerce/authz';
import {OperationError,audit} from './core';
export const tableSchema=z.object({number:z.number().int().min(1).max(10000),capacity:z.number().int().min(1).max(100),section:z.string().trim().min(1).max(100),status:z.nativeEnum(TableStatus).default('AVAILABLE'),posX:z.number().min(0).max(5000).optional(),posY:z.number().min(0).max(5000).optional()}).strict();
export async function updateTable(tx:Prisma.TransactionClient,actor:Actor,id:string,raw:unknown){
 const input=tableSchema.partial().parse(raw);const table=await tx.table.findUnique({where:{id}});if(!table)throw new OperationError('Table not found',404);
 if(input.status==='AVAILABLE'||input.status==='OUT_OF_SERVICE'||input.capacity!==undefined){
  const seated=await tx.reservation.count({where:{tableId:id,status:'SEATED'}});
  const active=await tx.order.count({where:{tableId:id,status:{notIn:['COMPLETED','CANCELLED','REFUNDED']}}});if(seated||active)throw new OperationError('Complete active service before freeing or changing this table',409);
 }
 if(input.capacity!==undefined&&await tx.reservation.count({where:{tableId:id,status:{in:['PENDING','CONFIRMED']},partySize:{gt:input.capacity},time:{gte:new Date()}}}))throw new OperationError('Existing reservations exceed this capacity',409);
 if(input.status==='OUT_OF_SERVICE'&&await tx.reservation.count({where:{tableId:id,status:{in:['PENDING','CONFIRMED']},time:{gte:new Date()}}}))throw new OperationError('Reassign future reservations before taking this table out of service',409);
 const row=await tx.table.update({where:{id},data:input});await audit(tx,actor,'TABLE_UPDATED','Table',id,{before:table,after:row});return row;
}
export const waitlistSchema=z.object({customerName:z.string().trim().min(1).max(200),customerPhone:z.string().trim().min(7).max(40),partySize:z.number().int().min(1).max(100),estimatedWait:z.number().int().min(0).max(600),quotedTime:z.string().datetime().nullable().optional(),notes:z.string().max(3000).optional()}).strict();
export async function changeWaitlist(tx:Prisma.TransactionClient,actor:Actor,id:string,action:'SEATED'|'LEFT'){
 const row=await tx.waitlist.findUnique({where:{id}});if(!row)throw new OperationError('Waitlist entry not found',404);if(!['WAITING','NOTIFIED'].includes(row.status))throw new OperationError('This waitlist entry is closed',409);
 const result=await tx.waitlist.update({where:{id},data:{status:action}});await audit(tx,actor,`WAITLIST_${action}`,'Waitlist',id,{previous:row.status});return result;
}
