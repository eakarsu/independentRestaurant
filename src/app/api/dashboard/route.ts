import { restaurantSettings } from "@/lib/operations/settings";
import prisma from '@/lib/prisma';
import { withAccess, OPERATIONS, MANAGEMENT } from '@/lib/commerce/access';
import { requireActor } from '@/lib/commerce/authz';
import { dayBounds } from '@/lib/operations/time';
export const GET=withAccess(OPERATIONS,async()=>{
  const actor=await requireActor(OPERATIONS);
  const location=await prisma.location.findFirst({where:{isPrimary:true,isActive:true},select:{timezone:true}});
  const profile=await restaurantSettings();
  const timezone=profile.value?.timezone||location?.timezone||process.env.RESTAURANT_TIMEZONE||'America/New_York';
  const now=new Date();const {date,start,end}=dayBounds(now,timezone);const financial=MANAGEMENT.includes(actor.role);
  const [activeOrders,completedOrders,reservationsToday,recentOrders,upcomingReservations,ingredients,failedDeliveries,payments,refunds]=await Promise.all([
    prisma.order.count({where:{status:{in:['PENDING','CONFIRMED','PAYMENT_PENDING','PREPARING','READY','SERVED','FULFILLMENT_FAILED','EXCEPTION']}}}),
    prisma.order.count({where:{status:'COMPLETED',completedAt:{gte:start,lt:end}}}),
    prisma.reservation.count({where:{time:{gte:start,lt:end},status:{notIn:['CANCELLED','NO_SHOW']}}}),
    prisma.order.findMany({orderBy:{createdAt:'desc'},take:6,select:{id:true,orderNumber:true,type:true,total:true,currency:true,status:true,table:{select:{number:true}},items:{select:{quantity:true}}}}),
    prisma.reservation.findMany({where:{time:{gte:now,lt:end},status:{in:['PENDING','CONFIRMED']}},orderBy:{time:'asc'},take:6,select:{id:true,customerName:true,time:true,partySize:true,table:{select:{number:true}}}}),
    prisma.ingredient.findMany({where:{currentStock:{lte:prisma.ingredient.fields.reorderPoint}},take:10,orderBy:{name:'asc'},select:{id:true,name:true,currentStock:true,unit:true}}),
    prisma.outboxEvent.count({where:{status:'DEAD_LETTER'}}),
    financial?prisma.payment.findMany({where:{createdAt:{gte:start,lt:end},status:'completed'},select:{amount:true,order:{select:{currency:true}}}}):[],
    financial?prisma.refund.findMany({where:{status:'SUCCEEDED',completedAt:{gte:start,lt:end}},select:{amountCents:true,currency:true}}):[],
  ]);
  const money:Record<string,{capturedCents:number;refundedCents:number;netCents:number}>={};
  for(const p of payments){const m=money[p.order.currency]??={capturedCents:0,refundedCents:0,netCents:0};m.capturedCents+=Math.round(p.amount*100);}
  for(const r of refunds){const m=money[r.currency]??={capturedCents:0,refundedCents:0,netCents:0};m.refundedCents+=r.amountCents;}
  for(const m of Object.values(money))m.netCents=m.capturedCents-m.refundedCents;
  return Response.json({asOf:now,date,timezone,financial,money,activeOrders,completedOrders,reservationsToday,recentOrders,upcomingReservations,alerts:[...ingredients.map(i=>({id:i.id,text:`${i.name}: ${i.currentStock} ${i.unit} remaining`,href:'/inventory'})),...(failedDeliveries?[{id:'deliveries',text:`${failedDeliveries} delivery jobs need reconciliation`,href:'/integrations'}]:[])],definitions:{money:'Completed payment records received today minus confirmed refunds completed today, including tax and tips. Currencies are never combined.',completedOrders:'Orders completed during the restaurant calendar day; not an estimate of guest count.'}});
});
