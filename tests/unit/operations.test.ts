import test from 'node:test';
import assert from 'node:assert/strict';
import {dayBounds} from '../../src/lib/operations/time';
import {notificationSchema} from '../../src/lib/operations/notifications';
import {csv} from '../../src/lib/operations/core';
import {settingsSchema} from '../../src/lib/operations/settings';
test('restaurant calendar days follow DST rather than fixed 24-hour offsets',()=>{
 const spring=dayBounds(new Date('2026-03-08T16:00:00Z'),'America/New_York');assert.equal(+spring.end-+spring.start,23*3600000);assert.equal(spring.start.toISOString(),'2026-03-08T05:00:00.000Z');
 const fall=dayBounds(new Date('2026-11-01T16:00:00Z'),'America/New_York');assert.equal(+fall.end-+fall.start,25*3600000);
});
test('notifications require explicit consent, valid addresses and bounded content',()=>{
 const email={type:'CUSTOM',channel:'EMAIL',recipient:'test@example.test',message:'Testing',consentConfirmed:true};assert.equal(notificationSchema.safeParse(email).success,true);
 for(const change of [{consentConfirmed:false},{recipient:'not an email'},{message:''},{message:'x'.repeat(10001)},{channel:'SMS',recipient:'5551234'}])assert.equal(notificationSchema.safeParse({...email,...change}).success,false);
});
test('payroll CSV neutralizes formulas and quotes embedded commas and quotes',()=>{assert.equal(csv([['=CMD()', 'a,"b"',null]]),'"\'=CMD()","a,""b""",""');});
test('restaurant hours reject duplicate weekdays and invalid timezones',()=>{
 const value={name:'Test',address:'',phone:'',email:'',timezone:'America/New_York',reservationDurationMinutes:90,hours:Array.from({length:7},(_,day)=>({day,closed:false,open:'09:00',close:'17:00'}))};
 assert.equal(settingsSchema.safeParse(value).success,true);assert.equal(settingsSchema.safeParse({...value,timezone:'invalid'}).success,false);assert.equal(settingsSchema.safeParse({...value,hours:value.hours.map(h=>({...h,day:0}))}).success,false);
});

test('AI drafts reject invented source identifiers and demand baseline is reproducible',async()=>{
 const {parseDraft,demandBaseline}=await import('../../src/lib/operations/ai');
 const draft={title:'Fixture',summary:'Summary',suggestions:[{text:'Check inventory',sourceIds:['invented']}],limitations:['Source quality requires review']};
 assert.throws(()=>parseDraft(draft,['inventory']),/unknown source/);
 assert.equal(parseDraft({...draft,suggestions:[{text:'Check inventory',sourceIds:['inventory']}]},['inventory']).suggestions.length,1);
 const now=new Date('2026-09-06T12:00:00Z');const daily:Record<string,number>={};for(let i=1;i<=56;i++)daily[new Date(+now-i*86400000).toISOString().slice(0,10)]=10;
 const baseline=demandBaseline(daily,now);assert.equal(baseline.backtestMeanAbsoluteError,0);assert.ok(baseline.nextSevenDays.every(x=>x.estimatedUnits===10));
});
