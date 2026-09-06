import {managerEndpoint,body} from '@/lib/operations/core';
import {runAi} from '@/lib/operations/ai';
import {z} from 'zod';
export const POST=managerEndpoint(async(actor,request:Request)=>{const input=z.object({prompt:z.string().trim().min(5).max(10000)}).strict().parse(await body(request));const run=await runAi(actor,request,{feature:'daily-summary',instructions:input.prompt});return Response.json({id:run.id,status:run.status,content:run.output,model:run.model,providerReceipt:run.providerRef,error:run.error});});
