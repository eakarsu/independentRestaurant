import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import prisma from "../../src/lib/prisma";
import { createRestaurantOrder, transitionOrder, transitionOrderItem, verifyOrderAuditChain } from "../../src/lib/commerce/orders";
import { applyPaymentWebhook, beginPayment, requestRefund } from "../../src/lib/commerce/payments";
import type { PaymentProvider, TaxProvider } from "../../src/lib/commerce/providers";

const enabled = process.env.RUN_DATABASE_TESTS === "1";
const taxProvider: TaxProvider = {
  async quote(input) {
    return { taxCents: Math.round((input.subtotalCents - input.discountCents) * 0.05), providerRef: "test-tax-quote" };
  },
};

test("idempotent order reservation, partial fulfillment, cancellation, oversell, and duplicate webhooks", { skip: !enabled }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({ data: { email: `operator-${suffix}@example.test`, password: "not-a-login-hash", role: "OPERATOR" } });
  const actor = { userId: user.id, role: "OPERATOR" };
  const merchant = await prisma.user.create({ data: { email: `merchant-${suffix}@example.test`, password: "not-a-login-hash", role: "MERCHANT" } });
  const merchantActor = { userId: merchant.id, role: "MERCHANT" };
  const category = await prisma.menuCategory.create({ data: { name: `Workflow ${suffix}` } });
  const ingredient = await prisma.ingredient.create({ data: { name: `Ingredient ${suffix}`, unit: "portion", currentStock: 3, reorderPoint: 0 } });
  const item = await prisma.menuItem.create({
    data: {
      categoryId: category.id,
      name: `Menu item ${suffix}`,
      price: 12.5,
      allergens: [],
      ingredients: { create: { ingredientId: ingredient.id, quantity: 1, unit: "portion" } },
    },
  });

  const request = { idempotencyKey: `order-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: item.id, quantity: 1, modifierIds: [] }] };
  const order = await createRestaurantOrder(request, actor, taxProvider);
  const duplicate = await createRestaurantOrder(request, actor, taxProvider);
  assert.equal(duplicate.id, order.id);
  assert.equal(await prisma.order.count({ where: { idempotencyKey: request.idempotencyKey } }), 1);
  assert.equal((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock, 2);
  assert.equal(await verifyOrderAuditChain(order.id), true);

  const firstItem = order.items[0];
  await transitionOrderItem({ orderId: order.id, itemId: firstItem.id, toStatus: "SENT", idempotencyKey: `item-sent-${suffix}`, actor });
  assert.equal((await prisma.orderItem.findUniqueOrThrow({ where: { id: firstItem.id } })).status, "SENT");
  const failingPayment: PaymentProvider = {
    async createIntent() { throw new Error("processor unavailable"); },
    async refund() { throw Error("Unused refund fixture"); },
  };
  await assert.rejects(beginPayment({ orderId: order.id, idempotencyKey: `pay-fail-${suffix}`, actor }, failingPayment), /processor unavailable/);
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PAYMENT_PENDING");
  assert.equal((await prisma.paymentAttempt.findUniqueOrThrow({ where: { idempotencyKey: `pay-fail-${suffix}` } })).status, "PENDING");
  await transitionOrder({ orderId: order.id, toStatus: "CANCELLED", idempotencyKey: `cancel-${suffix}`, reason: "integration test", actor });
  await transitionOrder({ orderId: order.id, toStatus: "CANCELLED", idempotencyKey: `cancel-${suffix}`, reason: "integration test", actor });
  assert.equal((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock, 3);
  assert.equal(await verifyOrderAuditChain(order.id), true);

  const concurrent = ["a", "b"].map((part) => createRestaurantOrder({ idempotencyKey: `oversell-${part}-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: item.id, quantity: 2, modifierIds: [] }] }, actor, taxProvider));
  const results = await Promise.allSettled(concurrent);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock >= 0);

  const event = { provider: "test-partner", eventId: `event-${suffix}`, eventType: "order.status_changed", payloadHash: "a".repeat(64) };
  await prisma.webhookEvent.create({ data: event });
  await assert.rejects(prisma.webhookEvent.create({ data: event }), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");

  const refundIngredient = await prisma.ingredient.create({ data: { name: `Refund ingredient ${suffix}`, unit: "portion", currentStock: 2 } });
  const refundItem = await prisma.menuItem.create({
    data: { categoryId: category.id, name: `Refund item ${suffix}`, price: 8, allergens: [], ingredients: { create: { ingredientId: refundIngredient.id, quantity: 1, unit: "portion" } } },
  });
  const refundOrder = await createRestaurantOrder({ idempotencyKey: `refund-order-${suffix}`, type: "TAKEOUT", items: [{ menuItemId: refundItem.id, quantity: 1, modifierIds: [] }] }, actor, taxProvider);
  const successfulPayment: PaymentProvider = {
    async createIntent() { return { providerRef: `checkout-${suffix}`, clientSecret: null, status: "requires_action" }; },
    async refund(input) { return { providerRef: `refund-${suffix}`, status: "succeeded", amountCents:input.money.amountCents,currency:input.money.currency,paymentReference:input.paymentReference,refundKey:input.idempotencyKey }; },
  };
  await beginPayment({ orderId: refundOrder.id, idempotencyKey: `payment-${suffix}`, actor }, successfulPayment);
  await applyPaymentWebhook({ eventId: `payment-event-${suffix}`, attemptKey:`payment-${suffix}`, currency:"usd", eventType: "payment_intent.succeeded", paymentReference: `intent-${suffix}`, orderId: refundOrder.id, amountReceivedCents: Math.round(refundOrder.total * 100), paymentMethod: "card" });
  await transitionOrder({ orderId: refundOrder.id, toStatus: "READY", idempotencyKey: `ready-${suffix}`, actor });
  await transitionOrder({ orderId: refundOrder.id, toStatus: "COMPLETED", idempotencyKey: `completed-${suffix}`, actor });
  await requestRefund({ orderId: refundOrder.id, idempotencyKey: `refund-${suffix}`, amountCents: Math.round(refundOrder.total * 100), reason: "integration refund", actor: merchantActor }, successfulPayment);
  const refunded = await prisma.order.findUniqueOrThrow({ where: { id: refundOrder.id } });
  assert.equal(refunded.status, "REFUNDED");
  assert.equal(refunded.paymentStatus, "REFUNDED");
  assert.equal(await verifyOrderAuditChain(refundOrder.id), true);
  await assert.rejects(beginPayment({orderId:refundOrder.id,idempotencyKey:`extra-payment-${suffix}`,actor},successfulPayment), /already been captured/);
  await assert.rejects(beginPayment({orderId:refundOrder.id,idempotencyKey:`payment-${suffix}`,actor:{userId:merchant.id,role:'CUSTOMER'}},successfulPayment), /another customer's/);
  await assert.rejects(requestRefund({orderId:refundOrder.id,idempotencyKey:`refund-${suffix}`,amountCents:1,reason:'changed',actor:merchantActor},successfulPayment), /payload changed/);
  await applyPaymentWebhook({ eventId: `late-failure-${suffix}`, eventType: 'payment_intent.payment_failed', paymentReference: `intent-${suffix}`, orderId: refundOrder.id });
  await applyPaymentWebhook({ eventId: `duplicate-success-${suffix}`, eventType: 'payment_intent.succeeded', paymentReference: `intent-${suffix}`, orderId: refundOrder.id, amountReceivedCents: Math.round(refundOrder.total * 100) });
  assert.equal((await prisma.order.findUniqueOrThrow({where:{id:refundOrder.id}})).status,'REFUNDED');

});

test.after(async () => {
  await prisma.$disconnect();
});

test('payment timeout recovery, exact receipt matching, refund hold and signed webhook retries', {skip:!enabled},async()=>{
 const {reconcilePayment,applyRefundReceipt}=await import('../../src/lib/commerce/payments');
 const Stripe=(await import('stripe')).default;
 const {POST:webhook}=await import('../../src/app/api/payments/webhook/route');
 const {NextRequest}=await import('next/server');
 const suffix=`recovery-${Date.now()}`,user=await prisma.user.create({data:{email:`${suffix}@example.test`,password:'not-a-login-hash',role:'MERCHANT'}}),actor={userId:user.id,role:'MERCHANT'};
 const category=await prisma.menuCategory.create({data:{name:suffix}}),item=await prisma.menuItem.create({data:{categoryId:category.id,name:suffix,price:10,allergens:[]}});
 const input={idempotencyKey:`order-${suffix}`,type:'TAKEOUT',items:[{menuItemId:item.id,quantity:1,modifierIds:[]}]};
 const order=await createRestaurantOrder(input,actor,taxProvider);
 await assert.rejects(createRestaurantOrder(input,{...actor,userId:'another-actor'},taxProvider),/different request/);
 await assert.rejects(createRestaurantOrder({...input,idempotencyKey:`discount-${suffix}`,discountCents:1},{...actor,role:'STAFF'},taxProvider),/discount/);
 const group=await prisma.modifierGroup.create({data:{name:'Required option',required:true,minSelect:1,maxSelect:1,modifiers:{create:[{name:'A'},{name:'B'}]}} ,include:{modifiers:true}});
 await prisma.menuItemModifierGroup.create({data:{menuItemId:item.id,modifierGroupId:group.id}});
 await assert.rejects(createRestaurantOrder({...input,idempotencyKey:`missing-modifier-${suffix}`},actor,taxProvider),/Choose/);
 await assert.rejects(createRestaurantOrder({...input,idempotencyKey:`excess-modifier-${suffix}`,items:[{menuItemId:item.id,quantity:1,modifierIds:group.modifiers.map(m=>m.id)}]},actor,taxProvider),/Choose/);

 let created=0;const providerKeys:string[]=[];let checkout:any;let refundResult:any;
 const provider:PaymentProvider={
  async createIntent(value){created++;providerKeys.push(value.idempotencyKey);checkout={providerRef:`cs_${suffix}`,orderId:order.id,attemptKey:value.idempotencyKey,amountCents:value.money.amountCents,currency:value.money.currency,status:'open',redirectUrl:'https://checkout.stripe.com/test'};if(created===1)throw Error('network timeout after acceptance');return {providerRef:checkout.providerRef,clientSecret:null,redirectUrl:checkout.redirectUrl,status:'requires_action'};},
  async checkout(){return checkout;},
  async refund(value){refundResult={providerRef:`re_${suffix}`,status:'succeeded',amountCents:value.money.amountCents,currency:value.money.currency,paymentReference:value.paymentReference,refundKey:value.idempotencyKey};throw Error('refund outcome unknown');},
  async refundReceipt(){return refundResult;}
 };
 await assert.rejects(beginPayment({orderId:order.id,idempotencyKey:`pay-${suffix}`,actor},provider),/timeout/);
 const attempt=await prisma.paymentAttempt.findFirstOrThrow({where:{orderId:order.id}});assert.equal(attempt.failureCode,'OUTCOME_UNKNOWN');
 await beginPayment({orderId:order.id,idempotencyKey:`another-key-${suffix}`,actor},provider);assert.equal(new Set(providerKeys).size,1);assert.equal(await prisma.paymentAttempt.count({where:{orderId:order.id}}),1);
 await assert.rejects(applyPaymentWebhook({eventId:'wrong-reference',eventType:'payment_intent.succeeded',orderId:order.id,paymentReference:'pi_unrelated',amountReceivedCents:1050,currency:'usd'}),/match/);
 checkout={...checkout,status:'paid',paymentReference:`pi_${suffix}`};
 await assert.rejects(applyPaymentWebhook({eventId:'wrong-currency',eventType:'payment_intent.succeeded',orderId:order.id,attemptKey:attempt.idempotencyKey,paymentReference:checkout.paymentReference,amountReceivedCents:1050,currency:'eur'}),/currency/);
 // Simulate a failed callback processing attempt, then retry the exact signed payload.
 const previousKey=process.env.STRIPE_SECRET_KEY,previousSecret=process.env.STRIPE_WEBHOOK_SECRET;
 process.env.STRIPE_SECRET_KEY='sk_test_isolated';process.env.STRIPE_WEBHOOK_SECRET='whsec_isolated';
 try{
  const payload=JSON.stringify({id:`evt_${suffix}`,type:'payment_intent.succeeded',data:{object:{id:checkout.paymentReference,amount_received:1050,currency:'usd',payment_method_types:['card'],metadata:{orderId:order.id,attemptKey:attempt.idempotencyKey}}}}),signature=new Stripe('sk_test_isolated').webhooks.generateTestHeaderString({payload,secret:'whsec_isolated'});
  const send=(sig:string)=>webhook(new NextRequest('http://localhost/api/payments/webhook',{method:'POST',body:payload,headers:{'stripe-signature':sig}}));
  assert.equal((await send('forged')).status,400);
  await prisma.paymentAttempt.update({where:{id:attempt.id},data:{currency:'EUR'}});
  assert.equal((await send(signature)).status,500);
  await prisma.paymentAttempt.update({where:{id:attempt.id},data:{currency:'USD'}});
  assert.equal((await send(signature)).status,200);assert.equal((await send(signature)).status,200);
  assert.equal(await prisma.payment.count({where:{orderId:order.id}}),1);
  assert.equal((await prisma.webhookEvent.findUniqueOrThrow({where:{provider_eventId:{provider:'stripe',eventId:`evt_${suffix}`}}})).status,'PROCESSED');
 }finally{if(previousKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=previousKey;if(previousSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previousSecret;}
 await reconcilePayment({orderId:order.id,reference:checkout.providerRef,actor},provider);assert.equal(await prisma.payment.count({where:{orderId:order.id}}),1);
 await transitionOrder({orderId:order.id,toStatus:'READY',idempotencyKey:`ready-${suffix}`,actor});await transitionOrder({orderId:order.id,toStatus:'COMPLETED',idempotencyKey:`complete-${suffix}`,actor});
 const refundInput={orderId:order.id,actor,idempotencyKey:`refund-${suffix}`,amountCents:1050,reason:'Fixture refund'};
 await assert.rejects(requestRefund(refundInput,provider),/unknown/);
 assert.equal((await prisma.refund.findUniqueOrThrow({where:{idempotencyKey:refundInput.idempotencyKey}})).status,'PENDING');
 await assert.rejects(requestRefund({...refundInput,idempotencyKey:`duplicate-refund-${suffix}`,amountCents:1},provider),/pending refund/);
 await assert.rejects(applyRefundReceipt({...refundResult,amountCents:1}),/mismatch/);
 await applyRefundReceipt(refundResult);await applyRefundReceipt(refundResult);
 assert.equal((await prisma.order.findUniqueOrThrow({where:{id:order.id}})).status,'REFUNDED');
 assert.equal(await verifyOrderAuditChain(order.id),true);
});
