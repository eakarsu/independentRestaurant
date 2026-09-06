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
    await insert(tx,'loyaltyPoints',loyaltyId,{customerId});
    await insert(tx,'feedback',key('restaurant-feedback',i),{customerId,source:'demo',rating:4,comment:'Demo feedback for reviewing the customer service screen.'});
    await insert(tx,'promotion',key('restaurant-promo',i),{name:`Demo offer ${i+1}`,description:demoNote,code:`DEMO-OFFER-${i+1}`,type:'PERCENTAGE',value:10,startDate:stamp(),endDate:stamp(30),isActive:false,applicableTo:[],dayOfWeek:[]});
    await insert(tx,'notificationTemplate',key('restaurant-template',i),{name:`Demo message template ${i+1}`,type:'CUSTOM',channel:'EMAIL',subject:'Demo customer message',content:demoNote,isActive:false});
    await insert(tx,'location',key('restaurant-location',i),{name:`Demo dining location ${i+1}`,code:`DEMO-${i+1}`,address:`${100+i} Example Lane`,city:'Demo City',state:'GA',zipCode:'30301'});
  }
}

main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(()=>db.$disconnect());
