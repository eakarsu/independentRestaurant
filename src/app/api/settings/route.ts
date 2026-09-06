import {z} from 'zod';
import {managerEndpoint,body,mutate,audit,OperationError,json} from '@/lib/operations/core';
import {settingsSchema,restaurantSettings} from '@/lib/operations/settings';
export const GET=managerEndpoint(async()=>Response.json({...await restaurantSettings(),providers:{tax:!!(process.env.TAX_RATE_BPS||process.env.TAX_PROVIDER_URL),delivery:!!(process.env.FULFILLMENT_PROVIDER_URL&&process.env.FULFILLMENT_PROVIDER_TOKEN),payments:!!(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET),notificationsEnabled:process.env.ENABLE_NOTIFICATION_DELIVERY==='true'}}));
export const PUT=managerEndpoint(async(actor,request:Request)=>{
 const input=z.object({value:settingsSchema,updatedAt:z.string().datetime().nullable()}).strict().parse(await body(request));
 return Response.json(await mutate(actor,request,'settings.save',input,async tx=>{const old=await tx.settings.findUnique({where:{key:'restaurant-profile'}});if((old?.updatedAt.toISOString()||null)!==input.updatedAt)throw new OperationError('Settings changed; refresh before saving',409);const row=await tx.settings.upsert({where:{key:'restaurant-profile'},create:{key:'restaurant-profile',value:json(input.value)},update:{value:json(input.value)}});await audit(tx,actor,'SETTINGS_UPDATED','Settings',row.id,{before:old?.value,after:row.value});return {value:row.value,updatedAt:row.updatedAt};}));
});
