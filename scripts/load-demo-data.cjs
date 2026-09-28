const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { createHash, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const env = parseEnv(fs.readFileSync(path.join(project, '.env'), 'utf8'));
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;
const url = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Demo loading requires a local, non-production database');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const demoNote = 'DEMO — fictional evaluation data. No real service, approval, payment, delivery or external submission occurred.';
const names = ['Avery','Jordan','Taylor','Casey','Riley','Morgan','Alex','Jamie','Cameron','Drew','Reese','Quinn','Skyler','Rowan','Emerson'];
const stamp = (days = 0, hour = 10) => { const d = new Date(); d.setDate(d.getDate()+days); d.setHours(hour,0,0,0); return d; };
const key = (kind, i) => `demo-${kind}-${String(i+1).padStart(3,'0')}`;
// Mirror src/lib/commerce/crypto.ts so seeded OrderEvent rows form a valid chain.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}
const auditHash = input => createHash('sha256').update(canonicalize(input)).digest('hex');
const touched = new Set();
async function insert(tx, model, id, data) {
  touched.add(model);
  return tx[model].upsert({ where: { id }, update: {}, create: { id, ...data } });
}
async function snapshot() {
  const result = {};
  for (const model of [...touched].sort()) {
    const rows = await db[model].findMany({orderBy:{id:'asc'}});
    result[model] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return result;
}
async function main() {
  const email = process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const admin = email ? await db.user.findUnique({where:{email}}) : await db.user.findFirst({where:{role:'ADMIN'}});
  if (!admin) throw new Error('Create the configured administrator first');
  const accountPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const run = () => db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('local-demo-data-loader'))`;
    await seed(tx, admin, accountPassword);
  }, { timeout: 120000, maxWait: 10000 });
  const adminBefore = JSON.stringify(admin);
  await run();
  const first = await snapshot();
  if (process.argv.includes('--verify')) { await run(); assert.deepEqual(await snapshot(), first, 'Reload must preserve every existing record and avoid duplicates'); }
  assert.equal(JSON.stringify(await db.user.findUnique({where:{id:admin.id}})), adminBefore, 'Administrator must remain unchanged');
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(first).map(([model,value])=>[model,value.count])), verifiedRepeat:process.argv.includes('--verify'), administratorPreserved:true },null,2));
}
async function seed(tx, admin, accountPassword) {
  const dishes = ['Garden salad','Tomato soup','Roasted vegetable bowl','Grilled chicken plate','Mushroom pasta','Lentil stew','Fish tacos','Margherita pizza','Rice and beans','Turkey sandwich','Vegetable curry','Baked potato','Berry dessert','Fruit bowl','Iced tea'];
  for (let i=0;i<15;i++) {
    const uid=key('restaurant-user',i), staffId=key('restaurant-staff',i), customerId=key('restaurant-customer',i), tableId=key('restaurant-table',i), categoryId=key('restaurant-category',i), itemId=key('restaurant-menu',i), vendorId=key('restaurant-vendor',i), ingredientId=key('restaurant-ingredient',i);
    await insert(tx,'user',uid,{email:`demo.restaurant.staff.${i+1}@example.invalid`,password:accountPassword,name:`${names[i]} (Demo)`,role:'STAFF',isActive:true});
    await insert(tx,'staff',staffId,{userId:uid,firstName:names[i],lastName:'Demo',position:['Server','Chef','Host'][i%3],hourlyRate:20+i,phone:`202-555-01${String(i).padStart(2,'0')}`});
    await insert(tx,'schedule',key('restaurant-shift',i),{staffId,date:stamp(),startTime:stamp(0,8),endTime:stamp(0,16),position:'Demo shift'});
    await insert(tx,'trainingRecord',key('restaurant-training',i),{staffId,trainingName:'Demo onboarding review',status:'PENDING'});
    await insert(tx,'table',tableId,{number:900+i,capacity:2+i%4,section:'Demo dining room',status:'AVAILABLE'});
    await insert(tx,'customer',customerId,{firstName:names[i],lastName:'Demo',email:`demo.restaurant.customer.${i+1}@example.invalid`,phone:`202-555-01${String(i).padStart(2,'0')}`,dietaryPrefs:[],allergens:[]});
    await insert(tx,'reservation',key('restaurant-reservation',i),{customerId,customerName:`${names[i]} Demo`,customerPhone:`202-555-01${String(i).padStart(2,'0')}`,partySize:2,date:stamp(),time:stamp(0,17+i%4),tableId,notes:demoNote,status:'PENDING',source:'demo'});
    await insert(tx,'waitlist',key('restaurant-waitlist',i),{customerName:`${names[i]} Demo`,customerPhone:`202-555-01${String(i).padStart(2,'0')}`,partySize:2,estimatedWait:15+i,notes:demoNote});
    await insert(tx,'menuCategory',categoryId,{name:`Demo ${['Salads','Soups','Bowls','Grill','Pasta','Stews','Tacos','Pizza','Sides','Sandwiches','Curry','Baked sides','Desserts','Fruit','Drinks'][i]}`,description:demoNote,sortOrder:i});
    const price=10+i;
    await insert(tx,'menuItem',itemId,{categoryId,name:`Demo ${dishes[i]}`,description:demoNote,price,cost:3+i*.25,allergens:[],prepTime:15,isAvailable:true});
    await insert(tx,'vendor',vendorId,{name:`Demo Food Supplier ${i+1}`,email:`demo.supplier.${i+1}@example.invalid`});
    await insert(tx,'ingredient',ingredientId,{name:`Demo ingredient for ${dishes[i]}`,unit:'portion',currentStock:100,parLevel:40,reorderPoint:20,cost:3,vendorId});
    await insert(tx,'menuItemIngredient',key('restaurant-recipe-ingredient',i),{menuItemId:itemId,ingredientId,quantity:1,unit:'portion'});
    await insert(tx,'recipe',key('restaurant-recipe',i),{menuItemId:itemId,prepTime:10,cookTime:15,servings:1,instructions:[{step:1,instruction:'Review this demo recipe with the kitchen lead before use.'}],notes:demoNote,allergenNotes:'Demo only. Ingredients and allergens require review.'});
    const poId=key('restaurant-po',i);
    await insert(tx,'purchaseOrder',poId,{vendorId,orderNumber:`DEMO-PO-${i+1}`,status:'DRAFT',subtotal:30,total:30,expectedDate:stamp(7),notes:demoNote});
    await insert(tx,'purchaseOrderItem',key('restaurant-po-line',i),{purchaseOrderId:poId,ingredientId,quantity:10,unitPrice:3,totalPrice:30});
    await insert(tx,'wasteRecord',key('restaurant-waste',i),{ingredientId,quantity:1,reason:'Demo waste example',cost:3,recordedBy:admin.id});
    const orderId=key('restaurant-order',i);
    await insert(tx,'order',orderId,{orderNumber:`DEMO-ORDER-${i+1}`,tableId,customerId,staffId,type:i%3===0?'DELIVERY':'DINE_IN',status:i%2===0?'PENDING':'PREPARING',subtotal:price,total:price,tax:0,paymentStatus:'UNPAID',notes:demoNote+' Tax has not been assessed.',source:'demo'});
    await insert(tx,'orderItem',key('restaurant-order-line',i),{orderId,menuItemId:itemId,quantity:1,unitPrice:price,totalPrice:price,status:i%2===0?'PENDING':'PREPARING'});
    if(i%3===0) await insert(tx,'deliveryInfo',key('restaurant-delivery',i),{orderId,address:`${100+i} Example Lane`,city:'Demo City',state:'GA',zipCode:'30301'});
    const deliveryOrderId=key('restaurant-delivery-order',i);
    await insert(tx,'order',deliveryOrderId,{orderNumber:`DEMO-DELIVERY-${i+1}`,customerId,staffId,type:'DELIVERY',status:'PREPARING',subtotal:price,total:price,paymentStatus:'UNPAID',notes:demoNote+' Tax has not been assessed.',source:'demo'});
    await insert(tx,'orderItem',key('restaurant-delivery-line',i),{orderId:deliveryOrderId,menuItemId:itemId,quantity:1,unitPrice:price,totalPrice:price,status:'PREPARING'});
    await insert(tx,'deliveryInfo',key('restaurant-delivery-detail',i),{orderId:deliveryOrderId,address:`DEMO: ${200+i} Example Lane`,city:'Demo City',state:'GA',zipCode:'30301'});
    const loyaltyId=key('restaurant-loyalty',i);
    // Give each demo customer a loyalty history. Previously only customerId
    // was set, so every account sat at 0 points / BRONZE and the loyalty
    // screen looked empty. Tiers follow the app's own thresholds
    // (500 SILVER, 1500 GOLD, 5000 PLATINUM).
    const lifetimePoints = 250 + i * 420;
    await insert(tx,'loyaltyPoints',loyaltyId,{
      customerId,
      lifetimePoints,
      points: Math.floor(lifetimePoints / 3),
      tier: lifetimePoints >= 5000 ? 'PLATINUM' : lifetimePoints >= 1500 ? 'GOLD' : lifetimePoints >= 500 ? 'SILVER' : 'BRONZE',
    });
    await insert(tx,'feedback',key('restaurant-feedback',i),{customerId,source:'demo',rating:4,comment:'Demo feedback for reviewing the customer service screen.'});
    await insert(tx,'promotion',key('restaurant-promo',i),{name:`Demo offer ${i+1}`,description:demoNote,code:`DEMO-OFFER-${i+1}`,type:'PERCENTAGE',value:10,startDate:stamp(),endDate:stamp(30),isActive:false,applicableTo:[],dayOfWeek:[]});
    await insert(tx,'notificationTemplate',key('restaurant-template',i),{name:`Demo message template ${i+1}`,type:'CUSTOM',channel:'EMAIL',subject:'Demo customer message',content:demoNote,isActive:false});
    await insert(tx,'location',key('restaurant-location',i),{name:`Demo dining location ${i+1}`,code:`DEMO-${i+1}`,address:`${100+i} Example Lane`,city:'Demo City',state:'GA',zipCode:'30301'});
  }
  await seedTopUps(tx, admin);
}

// Top up every user-facing table to at least 15 rows so each screen has content.
// All ids are deterministic and rows are only created (never overwritten), so
// reloading stays idempotent and existing edits are preserved.
async function seedTopUps(tx, admin) {
  const now = new Date();
  const dayKey = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  for (let i=0;i<15;i++) {
    const staffId = key('restaurant-staff',i), customerId = key('restaurant-customer',i), itemId = key('restaurant-menu',i), orderId = key('restaurant-order',i), ingredientId = key('restaurant-ingredient',i), loyaltyId = key('restaurant-loyalty',i);

    // Modifiers and their menu-item links.
    const groupId = key('restaurant-modifier-group',i), modifierId = key('restaurant-modifier',i);
    await insert(tx,'modifierGroup',groupId,{name:`Demo choice group ${i+1}`,required:i<3,minSelect:i<3?1:0,maxSelect:1});
    await insert(tx,'modifier',modifierId,{groupId,name:`Demo option ${i+1}`,priceAdjustment:i%3,isDefault:i%5===0,isAvailable:true});
    await insert(tx,'menuItemModifierGroup',key('restaurant-menu-modifier',i),{menuItemId:itemId,modifierGroupId:groupId});
    await insert(tx,'orderItemModifier',key('restaurant-order-item-modifier',i),{orderItemId:key('restaurant-order-line',i),modifierId,priceAdjustment:i%3});

    // Today's reservations so the default date view is populated.
    const when = new Date(); when.setHours(17+(i%5),(i%2)*30,0,0);
    await insert(tx,'reservation',`demo-restaurant-reservation-${dayKey}-${String(i+1).padStart(3,'0')}`,{customerId,customerName:`${names[i]} (Today Demo)`,customerPhone:`202-555-02${String(i).padStart(2,'0')}`,partySize:2+(i%6),date:when,time:when,tableId:key('restaurant-table',i),notes:demoNote,status:'PENDING',source:'demo'});

    // Payments, attempts and refunds (all terminal states; nothing chargeable).
    await insert(tx,'payment',key('restaurant-payment',i),{orderId,amount:20+i,method:'card',reference:`demo-payment-ref-${i+1}`,status:'completed'});
    await insert(tx,'paymentAttempt',key('restaurant-payment-attempt',i),{orderId,provider:'stripe',providerRef:`demo-attempt-ref-${i+1}`,idempotencyKey:`demo-attempt-key-${i+1}`,amountCents:(20+i)*100,currency:'USD',status:'SUCCEEDED',resumeStatus:'PREPARING'});
    await insert(tx,'refund',key('restaurant-refund',i),{orderId,provider:'stripe',providerRef:`demo-refund-ref-${i+1}`,idempotencyKey:`demo-refund-key-${i+1}`,amountCents:500+i*100,currency:'USD',reason:'Demo refund for screen review',status:'SUCCEEDED',requestedById:admin.id,completedAt:new Date()});

    // Inventory reservations (released) with their lines.
    const reservationId = key('restaurant-inventory-reservation',i);
    await insert(tx,'inventoryReservation',reservationId,{orderId,provider:'internal-postgres',providerRef:orderId,idempotencyKey:`demo-inventory-key-${i+1}`,status:'RELEASED',releasedAt:new Date()});
    await insert(tx,'inventoryReservationLine',key('restaurant-inventory-line',i),{reservationId,ingredientId,quantity:1});

    // Split checks with one item each.
    const splitId = key('restaurant-split',i);
    await insert(tx,'splitCheck',splitId,{orderId,guestName:`${names[i]} Demo`,guestNumber:i+1,subtotal:10+i,tax:1,tip:2,total:13+i,isPaid:true,paidAt:new Date(),paymentMethod:'card'});
    await insert(tx,'splitCheckItem',key('restaurant-split-item',i),{splitCheckId:splitId,orderItemId:key('restaurant-order-line',i),quantity:1,amount:10+i});

    // Workforce history.
    const clockIn = stamp(-1,9), clockOut = stamp(-1,17);
    await insert(tx,'timeClock',key('restaurant-timeclock',i),{staffId,clockIn,clockOut,totalHours:7.5,breakMinutes:30,approvedById:admin.id,approvedAt:clockOut});
    await insert(tx,'tipDistribution',key('restaurant-tip',i),{staffId,date:stamp(-i),amount:10+i,source:'card'});
    await insert(tx,'tipFairnessReport',key('restaurant-tip-report',i),{periodStart:stamp(-7),periodEnd:stamp(),giniIndex:0.1+i/100,flagged:[],summary:demoNote});
    await insert(tx,'performanceRecord',key('restaurant-performance',i),{staffId,date:stamp(-i),metric:'Demo review score',value:3+i%5,notes:demoNote});
    await insert(tx,'stockMovement',key('restaurant-stock-movement',i),{ingredientId,type:'USED',quantity:1,reason:'Demo stock movement',reference:'DEMO'});

    // Integrations and their logs.
    const integrationId = key('restaurant-integration',i);
    await insert(tx,'integration',integrationId,{type:'pos',name:`Demo integration ${i+1}`,isActive:false});
    await insert(tx,'integrationLog',key('restaurant-integration-log',i),{integrationId,action:'demo.sync',status:'success',message:demoNote});

    // AI and reporting surfaces.
    await insert(tx,'aIRecommendation',key('restaurant-ai-recommendation',i),{type:'menu_price',title:`Demo recommendation ${i+1}`,description:demoNote,status:'pending'});
    await insert(tx,'aiResult',key('restaurant-ai-result',i),{feature:'demo_review',refType:'MenuItem',refId:itemId,userId:admin.id,model:'demo-model',input:{demo:true},output:{demo:true}});
    await insert(tx,'demandForecast',key('restaurant-demand',i),{date:stamp(i),dayOfWeek:stamp(i).getDay(),hour:12+(i%10),predictedCovers:20+i,predictedRevenue:200+i*10,confidence:0.5});
    await insert(tx,'salesReport',key('restaurant-sales-report',i),{date:stamp(-i),totalOrders:10+i,totalRevenue:500+i*20,totalTax:40,totalTips:30,totalDiscount:5,avgOrderValue:45});
    await insert(tx,'dynamicPriceSuggestion',key('restaurant-price-suggestion',i),{menuItemId:itemId,oldPrice:10+i,suggestedPrice:11+i,reason:demoNote,signals:{demo:true},status:'pending'});
    await insert(tx,'noShowRiskScore',key('restaurant-no-show',i),{customerId,customerName:`${names[i]} Demo`,customerPhone:`202-555-02${String(i).padStart(2,'0')}`,totalReservations:5,noShowCount:i%3,cancellationCount:i%2,riskScore:i/20,riskBand:'low',rationale:demoNote});
    await insert(tx,'conciergeMessage',key('restaurant-concierge',i),{channel:'sms',direction:'inbound',fromNumber:`+1555000${String(i).padStart(4,'0')}`,toNumber:'+15559990000',body:demoNote,intent:'info',status:'received'});
    await insert(tx,'restaurantAiRun',key('restaurant-ai-run',i),{actorId:admin.id,feature:'demo_summary',status:'DRAFT',instructions:demoNote,sources:[],sourceHash:createHash('sha256').update(`demo-run-${i}`).digest('hex'),output:{demo:true},model:'demo-model',costUsd:0.01});
    await insert(tx,'restaurantKnowledge',key('restaurant-knowledge',i),{title:`Demo knowledge ${i+1}`,content:demoNote,authorId:admin.id,approvedById:admin.id,approvedAt:new Date(),active:true});
    await insert(tx,'customerLead',key('restaurant-lead',i),{sessionId:`demo-session-${i+1}`,name:`${names[i]} Lead`,email:`demo.lead.${i+1}@example.invalid`,phone:`202-555-03${String(i).padStart(2,'0')}`,note:demoNote,source:'demo'});
    await insert(tx,'loyaltyTransaction',key('restaurant-loyalty-tx',i),{loyaltyId,points:50+i,type:'earned',description:'Demo points history'});

    // Terminal notification/outbox/webhook evidence (never PENDING, so workers skip them).
    await insert(tx,'notification',key('restaurant-notification',i),{type:'ORDER_CONFIRMATION',channel:'EMAIL',recipient:`demo.customer.${i+1}@example.invalid`,subject:'Demo notification',message:demoNote,status:'DELIVERED',sentAt:new Date(),deliveredAt:new Date(),consentRecorded:true,provider:'resend',providerRef:`demo-provider-ref-${i+1}`,deliveryKey:`demo-delivery-${i+1}`,createdById:admin.id});
    await insert(tx,'outboxEvent',key('restaurant-outbox',i),{orderId,topic:'delivery.schedule',idempotencyKey:`demo-outbox-${i+1}`,payload:{demo:true},status:'SUCCEEDED',attempts:1,processedAt:new Date()});
    await insert(tx,'webhookEvent',key('restaurant-webhook',i),{provider:'stripe',eventId:`demo-event-${i+1}`,eventType:'demo.event',payloadHash:`demo-payload-hash-${i+1}`,status:'PROCESSED',attempts:1,processedAt:new Date()});
    await insert(tx,'passwordResetToken',key('restaurant-reset',i),{userId:key('restaurant-user',i),tokenHash:createHash('sha256').update(`demo-reset-${i}`).digest('hex'),expiresAt:stamp(-1)});
    await insert(tx,'session',key('restaurant-session',i),{sessionToken:`demo-session-token-${i+1}`,userId:key('restaurant-user',i),expires:stamp(30)});
    await insert(tx,'settings',key('restaurant-setting',i),{key:`demo-setting-${i+1}`,value:{demo:true,index:i+1}});
    await insert(tx,'operationAudit',key('restaurant-operation-audit',i),{actorId:admin.id,action:'DEMO_TOPUP',entity:'Demo',entityId:`demo-${i+1}`,details:{demo:true}});
    await insert(tx,'operationReceipt',key('restaurant-operation-receipt',i),{actorId:admin.id,operation:'demo.topup',requestHash:`demo-hash-${i+1}`,response:{demo:true}});
  }

  // A dedicated demo order with a valid hash-chained event history.
  const auditOrderId = 'demo-topup-audit-order';
  await insert(tx,'order',auditOrderId,{orderNumber:'DEMO-AUDIT-ORDER',type:'DINE_IN',status:'CONFIRMED',subtotal:0,total:0,paymentStatus:'UNPAID',source:'demo',notes:demoNote});
  let previousHash = null;
  for (let i=0;i<15;i++) {
    const sequence = i+1;
    const payload = {demo:true,step:sequence};
    const fields = {orderId:auditOrderId,sequence,type:'DEMO_EVENT',fromStatus:null,toStatus:null,actorUserId:admin.id,actorRole:'ADMIN',idempotencyKey:`demo-audit-event-${sequence}`,payload,previousHash};
    const hash = auditHash(fields);
    await insert(tx,'orderEvent',`demo-topup-orderevent-${String(sequence).padStart(3,'0')}`,{...fields,hash});
    previousHash = hash;
  }
}

main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(()=>db.$disconnect());
