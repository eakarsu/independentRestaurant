const crypto=require('node:crypto');

async function inspectPlanningData(db,{actorId,expectedEmail,now=new Date(),rowCount=15,time,timezone='America/New_York'}){
 if(!Number.isInteger(rowCount)||rowCount<15||rowCount>100)throw Error('Choose 15–100 planning rows');
 const actor=await db.user.findUnique({where:{id:actorId},select:{id:true,email:true,role:true,isActive:true}});
 if(!actor?.isActive||!['ADMIN','MERCHANT','MANAGER'].includes(actor.role)||(expectedEmail&&actor.email!==expectedEmail))throw Error('An existing active restaurant manager is required');
 const profile=await db.settings.findUnique({where:{key:'restaurant-profile'}});const zone=profile?.value?.timezone||timezone;const bounds=time.dayBounds(now,zone);
 const staff=await db.staff.findMany({where:{id:{startsWith:'demo-restaurant-staff-'},lastName:'Demo',status:'ACTIVE'},orderBy:{id:'asc'},select:{id:true}});
 const week=new Date(now);week.setDate(week.getDate()-week.getDay());week.setHours(0,0,0,0);const endWeek=new Date(week);endWeek.setDate(endWeek.getDate()+7);
 const counts={reservations:await db.reservation.count({where:{time:{gte:bounds.start,lt:bounds.end}}}),schedules:await db.schedule.count({where:{date:{gte:week,lt:endWeek}}})};
 const actorKey=crypto.createHash('sha256').update(actorId).digest('hex').slice(0,12);const reservations=[],schedules=[];
 for(let i=0;i<rowCount-counts.reservations;i++)reservations.push({id:`training-reservation-${actorKey}-${bounds.date}-${String(i+1).padStart(3,'0')}`,customerName:`Fictional training guest ${i+1}`,customerPhone:'TRAINING-NOT-CONTACTABLE',partySize:2,date:bounds.start,time:new Date(+bounds.start+12*3600000+i*10*60000),durationMinutes:60,status:'PENDING',customerId:null,tableId:null,source:'fictional-training-draft',notes:'Fictional planning example. Not a real customer, confirmed booking, table assignment, consent or payment. Staff must create an actual reservation separately.'});
 if(counts.schedules<rowCount&&staff.length===0)throw Error('Current-week examples require existing explicitly fictional demo staff; no real staff assignment was invented');
 for(let i=0;i<rowCount-counts.schedules;i++)schedules.push({id:`training-shift-${actorKey}-${bounds.date}-${String(i+1).padStart(3,'0')}`,staffId:staff[i%staff.length].id,date:new Date(+bounds.start+12*3600000),startTime:new Date(+bounds.start+12*3600000),endTime:new Date(+bounds.start+16*3600000),position:'Training draft',notes:'Fictional planning example for an existing demonstration staff record. No attendance, payroll approval, staff notice or worked shift is asserted.'});
 return{actorId,day:bounds.date,timezone:zone,counts,planned:{reservations:reservations.length,schedules:schedules.length},reservations,schedules};
}

async function seedPlanningData(db,input){
 const signal=input.signal;signal?.throwIfAborted();
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('restaurant-fictional-planning'),hashtext(${input.actorId}))`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${input.actorId} FOR UPDATE`;
  signal?.throwIfAborted();const plan=await inspectPlanningData(tx,input);
  const reservations=await tx.reservation.createMany({data:plan.reservations,skipDuplicates:true});signal?.throwIfAborted();
  const schedules=await tx.schedule.createMany({data:plan.schedules,skipDuplicates:true});signal?.throwIfAborted();
  return{day:plan.day,before:plan.counts,inserted:{reservations:reservations.count,schedules:schedules.count},fictionalUnconfirmedPlanningOnly:true};
 },{timeout:15000});
}
module.exports={inspectPlanningData,seedPlanningData};

if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util'),env=parseEnv(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'));require('tsx/cjs');
 const time=require('../src/lib/operations/time.ts'),{PrismaClient}=require('@prisma/client');const url=new URL(env.DATABASE_URL);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Only the configured local restaurant database is allowed');
 const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
 (async()=>{const email=env.PROVISION_ADMIN_EMAIL||env.ADMIN_EMAIL,actor=await db.user.findUnique({where:{email}});if(!actor)throw Error('Existing configured restaurant manager not found');const input={actorId:actor.id,expectedEmail:email,time,timezone:env.RESTAURANT_TIMEZONE||'America/New_York'};const plan=await inspectPlanningData(db,input);const result=process.argv.includes('--apply')?await seedPlanningData(db,input):{dryRun:true,day:plan.day,before:plan.counts,planned:plan.planned};console.log(JSON.stringify({project:'independentRestaurant',...result,accountsChanged:false,providerOrApprovalEvidenceCreated:false}));})().catch(error=>{console.log(JSON.stringify({project:'independentRestaurant',error:error.message}));process.exitCode=1;}).finally(()=>db.$disconnect());
}
