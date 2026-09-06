import {endpoint,body,mutate} from '@/lib/operations/core';
import {OPERATIONS} from '@/lib/commerce/access';
import {clock,clockSchema} from '@/lib/operations/timeclock';
export const POST=endpoint(OPERATIONS,async(actor,request:Request,props:{params:Promise<{id:string}>})=>{
 const {id}=await props.params;const raw=await body(request);const input=clockSchema.parse({...raw as object,staffId:id});return Response.json(await mutate(actor,request,'timeclock',input,tx=>clock(tx,actor,input)));
});
