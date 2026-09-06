import {ReservationStatus} from '@prisma/client';
import {z} from 'zod';
import prisma from '@/lib/prisma';
import {OPERATIONS} from '@/lib/commerce/access';
import {endpoint,body,mutate,OperationError} from '@/lib/operations/core';
import {saveReservation} from '@/lib/operations/reservations';
import {restaurantSettings} from '@/lib/operations/settings';
import {dayBounds} from '@/lib/operations/time';
export const GET=endpoint(OPERATIONS,async(_actor,request:Request)=>{
 const p=new URL(request.url).searchParams;const profile=await restaurantSettings();const timezone=profile.value?.timezone||process.env.RESTAURANT_TIMEZONE||'America/New_York';const target=p.get('date')?new Date(p.get('date')!):new Date();if(!Number.isFinite(+target))throw new OperationError('Invalid date');
 const {start,end}=dayBounds(target,timezone);const status=p.get('status')?z.nativeEnum(ReservationStatus).parse(p.get('status')):undefined;
 return Response.json(await prisma.reservation.findMany({where:{time:{gte:start,lt:end},status},orderBy:{time:'asc'},include:{table:true,customer:true},take:1000}));
});
export const POST=endpoint(OPERATIONS,async(actor,request:Request)=>{const input=await body(request);return Response.json(await mutate(actor,request,'reservation.create',input,tx=>saveReservation(tx,actor,input)),{status:201});});
