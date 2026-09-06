import prisma from '@/lib/prisma';
import {OPERATIONS,MANAGEMENT} from '@/lib/commerce/access';
import {endpoint,body,mutate,OperationError} from '@/lib/operations/core';
import {updateTable} from '@/lib/operations/frontdesk';
type Context={params:Promise<{id:string}>};
export const GET=endpoint(OPERATIONS,async(_actor,_request:Request,p:Context)=>{const {id}=await p.params;const row=await prisma.table.findUnique({where:{id}});if(!row)throw new OperationError('Table not found',404);return Response.json(row);});
export const PUT=endpoint(OPERATIONS,async(actor,request:Request,p:Context)=>{const {id}=await p.params;const input=await body(request);if(!MANAGEMENT.includes(actor.role)&&Object.keys(input as object).some(k=>k!=='status'))throw new OperationError('Manager access required for table configuration',403);return Response.json(await mutate(actor,request,'table.update',{id,input},tx=>updateTable(tx,actor,id,input)));});
export const DELETE=endpoint(MANAGEMENT,async(actor,request:Request,p:Context)=>{const {id}=await p.params;return Response.json(await mutate(actor,request,'table.archive',{id},tx=>updateTable(tx,actor,id,{status:'OUT_OF_SERVICE'})));});
