import {Resend} from 'resend';
import {recordDeliveryEvidence} from '@/lib/operations/notifications';
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return Response.json({error:'Webhook not configured'},{status:503});
 try{
  const payload=await request.text();if(payload.length>100000)return new Response(null,{status:413});
  const event=new Resend(process.env.RESEND_API_KEY||'webhook-verification').webhooks.verify({payload,headers:{id:request.headers.get('svix-id')||'',timestamp:request.headers.get('svix-timestamp')||'',signature:request.headers.get('svix-signature')||''},webhookSecret:secret});
  const status=event.type==='email.delivered'?'DELIVERED':event.type==='email.bounced'||event.type==='email.failed'?'FAILED':event.type==='email.sent'?'SENT':null;
  if(status&&'email_id' in event.data)await recordDeliveryEvidence({provider:'resend',reference:String(event.data.email_id),status,eventId:request.headers.get('svix-id')!});
  return Response.json({received:true});
 }catch{return Response.json({error:'Webhook could not be verified or processed'},{status:400});}
}
