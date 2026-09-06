import {z} from 'zod';
import {ReservationStatus,Prisma} from '@prisma/client';
import type {Actor} from '@/lib/commerce/authz';
import {OperationError,audit} from './core';
import {settingsSchema} from './settings';
import {dateInZone} from './time';
const shape={customerName:z.string().trim().min(1).max(200),customerPhone:z.string().trim().min(7).max(40),customerEmail:z.union([z.string().email(),z.literal(''),z.null()]).optional(),partySize:z.number().int().min(1).max(100),date:z.string().datetime().optional(),time:z.string().datetime(),tableId:z.string().min(1).nullable().optional(),status:z.nativeEnum(ReservationStatus).optional(),specialOccasion:z.string().max(200).nullable().optional(),notes:z.string().max(5000).nullable().optional(),customerId:z.string().min(1).nullable().optional(),source:z.enum(['direct','phone','online']).optional(),durationMinutes:z.number().int().min(15).max(480).optional()};
export const reservationSchema=z.object(shape).strict();
export const updateReservationSchema=z.object({...Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,v.optional()])),version:z.number().int().positive(),reason:z.string().trim().min(5).max(1000).optional()}).strict();
const transitions:Record<ReservationStatus,ReservationStatus[]>={PENDING:['CONFIRMED','CANCELLED','NO_SHOW'],CONFIRMED:['SEATED','CANCELLED','NO_SHOW'],SEATED:['COMPLETED'],COMPLETED:[],CANCELLED:[],NO_SHOW:[]};
export async function saveReservation(tx:Prisma.TransactionClient,actor:Actor,raw:unknown,id?:string){
 const old=id?await tx.reservation.findUnique({where:{id}}):null;if(id&&!old)throw new OperationError('Reservation not found',404);
 const parsed=id?updateReservationSchema.parse(raw):reservationSchema.parse(raw);
 const change=parsed as Partial<z.infer<typeof reservationSchema>>&{version?:number;reason?:string};
 if(old&&change.version!==old.version)throw new OperationError('Reservation changed; refresh before editing',409);
 const currentStatus=change.status||old?.status||'PENDING';
 if(!old&&!['PENDING','CONFIRMED'].includes(currentStatus))throw new OperationError('New reservations must be pending or confirmed');
 if(old&&currentStatus!==old.status&&!transitions[old.status].includes(currentStatus))throw new OperationError(`Cannot change ${old.status} to ${currentStatus}`,409);
 if(old&&['CANCELLED','NO_SHOW','COMPLETED'].includes(old.status))throw new OperationError('Closed reservation history is immutable',409);
 if(old&&currentStatus==='CANCELLED'&&!change.reason)throw new OperationError('Cancellation reason required');
 const settings=await tx.settings.findUnique({where:{key:'restaurant-profile'}});const profile=settings?settingsSchema.parse(settings.value):null;const timezone=profile?.timezone||process.env.RESTAURANT_TIMEZONE||'America/New_York';
 const merged={...old,...change} as Record<string,unknown>;
 const input=reservationSchema.parse(Object.fromEntries(Object.keys(shape).map(k=>[k,merged[k] instanceof Date?(merged[k] as Date).toISOString():merged[k]])));
 const time=new Date(input.time);const duration=input.durationMinutes||old?.durationMinutes||profile?.reservationDurationMinutes||90;const end=new Date(+time+duration*60000);
 const scheduling=!old||change.time!==undefined||change.tableId!==undefined||change.partySize!==undefined||change.durationMinutes!==undefined;
 if(old?.status==='SEATED'&&scheduling)throw new OperationError('Complete the seated reservation before changing its booking details',409);
 if(scheduling&&['PENDING','CONFIRMED'].includes(currentStatus)){
  if(time<new Date()||+time>Date.now()+366*86400000)throw new OperationError('Choose a future reservation within one year');
  if(profile){const day=dateInZone(time,timezone);const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();const hours=profile.hours.find(h=>h.day===weekday)!;const local=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);if(hours.closed||dateInZone(end,timezone)!==day||local(time)<hours.open||local(end)>hours.close)throw new OperationError('Reservation must fit restaurant opening hours');}
 }
 if(input.customerId&&!await tx.customer.findUnique({where:{id:input.customerId},select:{id:true}}))throw new OperationError('Customer not found',404);
 if(input.tableId&&['PENDING','CONFIRMED','SEATED'].includes(currentStatus)){
  const table=await tx.table.findUnique({where:{id:input.tableId}});if(!table||table.status==='OUT_OF_SERVICE')throw new OperationError('Table unavailable',409);if(table.capacity<input.partySize)throw new OperationError('Party exceeds table capacity',409);
  const overlap=await tx.reservation.findMany({where:{id:old?{not:old.id}:undefined,tableId:table.id,status:{in:['PENDING','CONFIRMED','SEATED']},time:{gt:new Date(+time-480*60000),lt:end}},select:{time:true,durationMinutes:true,status:true}});
  if(overlap.some(r=>+r.time+r.durationMinutes*60000>+time))throw new OperationError('Table already reserved during this time',409);
  if(currentStatus==='SEATED'&&old?.status!=='SEATED'&&table.status!=='AVAILABLE'&&table.status!=='RESERVED')throw new OperationError('Table must be available before seating',409);
 }
 if(currentStatus==='SEATED'&&!input.tableId)throw new OperationError('Assign a table before seating');
 if(currentStatus==='NO_SHOW'&&time>new Date())throw new OperationError('Cannot mark a future reservation as no-show');
 const {date:_date,...values}=input;const data={...values,time,date:new Date(`${dateInZone(time,timezone)}T00:00:00Z`),durationMinutes:duration,status:currentStatus,customerEmail:input.customerEmail||null};
 const row=old?await tx.reservation.update({where:{id:old.id},data:{...data,version:{increment:1}}}):await tx.reservation.create({data});
 if(currentStatus==='SEATED'&&input.tableId)await tx.table.update({where:{id:input.tableId},data:{status:'OCCUPIED'}});
 if(currentStatus==='COMPLETED'&&old?.tableId)await tx.table.update({where:{id:old.tableId},data:{status:'CLEANING'}});
 await audit(tx,actor,old?'RESERVATION_UPDATED':'RESERVATION_CREATED','Reservation',row.id,{before:old,after:row,reason:change.reason});return row;
}
