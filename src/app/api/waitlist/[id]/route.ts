import {z} from 'zod';
import {OPERATIONS} from '@/lib/commerce/access';
import {endpoint,body,mutate} from '@/lib/operations/core';
import {changeWaitlist} from '@/lib/operations/frontdesk';
type Context={params:Promise<{id:string}>};
export const PUT=endpoint(OPERATIONS,async(actor,request:Request,p:Context)=>{const {id}=await p.params;const input=z.object({status:z.enum(['SEATED','LEFT'])}).strict().parse(await body(request));return Response.json(await mutate(actor,request,'waitlist.status',{id,...input},tx=>changeWaitlist(tx,actor,id,input.status)));});
export const DELETE=endpoint(OPERATIONS,async(actor,request:Request,p:Context)=>{const {id}=await p.params;return Response.json(await mutate(actor,request,'waitlist.leave',{id},tx=>changeWaitlist(tx,actor,id,'LEFT')));});
