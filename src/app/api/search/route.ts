import prisma from '@/lib/prisma';
import {OPERATIONS} from '@/lib/commerce/access';
import {endpoint,OperationError} from '@/lib/operations/core';
export const GET=endpoint(OPERATIONS,async(_actor,request:Request)=>{
 const q=new URL(request.url).searchParams.get('q')?.trim()||'';if(q.length<2||q.length>100)throw new OperationError('Search must contain 2–100 characters');
 const [orders,reservations,customers,menu]=await Promise.all([
 prisma.order.findMany({where:{orderNumber:{contains:q,mode:'insensitive'}},take:20,select:{id:true,orderNumber:true,status:true}}),
 prisma.reservation.findMany({where:{customerName:{contains:q,mode:'insensitive'}},take:20,select:{id:true,customerName:true,time:true,status:true}}),
 prisma.customer.findMany({where:{OR:[{firstName:{contains:q,mode:'insensitive'}},{lastName:{contains:q,mode:'insensitive'}}]},take:20,select:{id:true,firstName:true,lastName:true}}),
 prisma.menuItem.findMany({where:{name:{contains:q,mode:'insensitive'}},take:20,select:{id:true,name:true}}),
 ]);
 return Response.json({results:[...orders.map(r=>({id:r.id,label:`${r.orderNumber} · ${r.status}`,type:'Order',href:`/orders?orderId=${r.id}`})),...reservations.map(r=>({id:r.id,label:`${r.customerName} · ${r.status}`,type:'Reservation',href:`/reservations?reservationId=${r.id}`})),...customers.map(r=>({id:r.id,label:`${r.firstName} ${r.lastName}`,type:'Customer',href:`/customers?customerId=${r.id}`})),...menu.map(r=>({id:r.id,label:r.name,type:'Menu item',href:`/menu?itemId=${r.id}`}))]});
});
