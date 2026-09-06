import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import prisma from '@/lib/prisma';
import {requireActor,AuthorizationError,type Actor} from '@/lib/commerce/authz';
import {MANAGEMENT,withAccess} from '@/lib/commerce/access';
export class OperationError extends Error {constructor(message:string,public status=422){super(message);}}
export function json(value:unknown):Prisma.InputJsonValue {return JSON.parse(JSON.stringify(value));}
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new OperationError('Request body required',400);let total=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>1_000_000){await reader.cancel();throw new OperationError('Request is too large',413);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new OperationError('Invalid JSON',400);}
}
export async function audit(tx:Prisma.TransactionClient,actor:Actor,action:string,entity:string,entityId:string,details:unknown){await tx.operationAudit.create({data:{actorId:actor.userId,action,entity,entityId,details:json(details)}});}
export async function mutate<T>(actor:Actor,request:Request,operation:string,input:unknown,work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 const key=request.headers.get('idempotency-key');if(!key||! /^[a-zA-Z0-9:_-]{8,128}$/.test(key))throw new OperationError('Idempotency-Key of 8–128 safe characters is required',400);
 const hash=digest({actor:actor.userId,operation,input});
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('restaurant-operations'))`;
  const previous=await tx.operationReceipt.findUnique({where:{id:key}});
  if(previous){if(previous.requestHash!==hash)throw new OperationError('This request key was already used for different changes',409);return previous.response as T;}
  const result=await work(tx);await tx.operationReceipt.create({data:{id:key,actorId:actor.userId,operation,requestHash:hash,response:json(result)}});return result;
 },{timeout:15000});
}
export function endpoint<Args extends unknown[]>(roles:readonly string[],handler:(actor:Actor,...args:Args)=>Promise<Response>){return withAccess(roles,async(...args:Args)=>{try{return await handler(await requireActor(roles),...args);}catch(error){
 if(error instanceof AuthorizationError||error instanceof OperationError)return Response.json({error:error.message},{status:error.status});
 if(error instanceof z.ZodError)return Response.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:422});
 if(error instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2003','P2025','P2034'].includes(error.code))return Response.json({error:'Record changed or conflicts with existing data; reload and retry'},{status:409});
 console.error('Operation failed',error instanceof Error?error.name:'UnknownError');return Response.json({error:'The operation failed; changes were not confirmed'},{status:500});
}});}
export const managerEndpoint=<Args extends unknown[]>(handler:(actor:Actor,...args:Args)=>Promise<Response>)=>endpoint(MANAGEMENT,handler);
export function csv(rows:unknown[][]){return rows.map(row=>row.map(cell=>{let s=String(cell??'');if(/^[\s]*[=+@-]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;}).join(',')).join('\r\n');}
