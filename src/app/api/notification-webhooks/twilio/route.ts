import twilio from 'twilio';
import {recordDeliveryEvidence} from '@/lib/operations/notifications';
import {digest} from '@/lib/operations/core';
export async function POST(request:Request){
 const token=process.env.TWILIO_AUTH_TOKEN;const base=process.env.NOTIFICATION_WEBHOOK_BASE_URL;if(!token||!base)return new Response(null,{status:503});
 try{
  const raw=await request.text();if(raw.length>100000)return new Response(null,{status:413});const params=Object.fromEntries(new URLSearchParams(raw));
  const url=new URL('/api/notification-webhooks/twilio',base).toString();
  if(!twilio.validateRequest(token,request.headers.get('x-twilio-signature')||'',url,params))return new Response(null,{status:403});
  if(params.AccountSid!==process.env.TWILIO_ACCOUNT_SID||!params.MessageSid)return new Response(null,{status:403});
  const status=params.MessageStatus==='delivered'?'DELIVERED':['failed','undelivered'].includes(params.MessageStatus)?'FAILED':params.MessageStatus==='sent'?'SENT':null;
  if(status)await recordDeliveryEvidence({provider:'twilio',reference:params.MessageSid,status,eventId:digest({sid:params.MessageSid,status})});return Response.json({received:true});
 }catch{return new Response(null,{status:400});}
}
