import {z} from 'zod';
import prisma from '@/lib/prisma';
import {OPERATIONS} from '@/lib/commerce/access';
import {endpoint,body,mutate,OperationError} from '@/lib/operations/core';
import {saveReservation} from '@/lib/operations/reservations';
type Context={params:Promise<{id:string}>};
export const GET=endpoint(OPERATIONS,async(_actor,_request:Request,props:Context)=>{const {id}=await props.params;const row=await prisma.reservation.findUnique({where:{id},include:{table:true,customer:true}});if(!row)throw new OperationError('Reservation not found',404);return Response.json(row);});
export const PUT=endpoint(OPERATIONS,async(actor,request:Request,props:Context)=>{const {id}=await props.params;const input=await body(request);return Response.json(await mutate(actor,request,'reservation.update',{id,input},tx=>saveReservation(tx,actor,input,id)));});
export const DELETE=endpoint(OPERATIONS,async(actor,request:Request,props:Context)=>{const {id}=await props.params;const input=z.object({version:z.number().int().positive(),reason:z.string().trim().min(5).max(1000)}).strict().parse(await body(request));return Response.json(await mutate(actor,request,'reservation.cancel',{id,...input},tx=>saveReservation(tx,actor,{...input,status:'CANCELLED'},id)));});
