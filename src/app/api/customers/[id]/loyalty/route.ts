import {z} from 'zod';
import {managerEndpoint,body,mutate,audit,OperationError} from '@/lib/operations/core';
const schema=z.object({points:z.number().int().min(-100000).max(100000).refine(n=>n!==0),type:z.enum(['earned','redeemed','bonus','expired']),description:z.string().trim().min(5).max(1000)}).strict().refine(x=>['earned','bonus'].includes(x.type)?x.points>0:x.points<0,{message:'Earning requires positive points; redemption/expiry requires negative points'});
export const POST=managerEndpoint(async(actor,request:Request,props:{params:Promise<{id:string}>})=>{
 const {id}=await props.params;const input=schema.parse(await body(request));
 return Response.json(await mutate(actor,request,'loyalty.adjust',{id,...input},async tx=>{
  if(!await tx.customer.findUnique({where:{id},select:{id:true}}))throw new OperationError('Customer not found',404);
  const loyalty=await tx.loyaltyPoints.upsert({where:{customerId:id},create:{customerId:id},update:{}});
  const points=loyalty.points+input.points;if(points<0)throw new OperationError('Insufficient points',409);
  const lifetime=loyalty.lifetimePoints+Math.max(input.points,0);if(lifetime>2147483647||points>2147483647)throw new OperationError('Points exceed supported limit');
  const changed=await tx.loyaltyPoints.updateMany({where:{id:loyalty.id,points:loyalty.points,lifetimePoints:loyalty.lifetimePoints},data:{points,lifetimePoints:lifetime,tier:lifetime>=5000?'PLATINUM':lifetime>=1500?'GOLD':lifetime>=500?'SILVER':'BRONZE'}});
  if(!changed.count)throw new OperationError('Balance changed; retry',409);
  const entry=await tx.loyaltyTransaction.create({data:{loyaltyId:loyalty.id,...input}});await audit(tx,actor,'LOYALTY_ADJUSTMENT','Customer',id,{...input,transactionId:entry.id,before:loyalty.points,after:points});
  return tx.loyaltyPoints.findUniqueOrThrow({where:{id:loyalty.id}});
 }));
});
