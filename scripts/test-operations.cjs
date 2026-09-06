const fs=require('node:fs');const {parseEnv}=require('node:util');const {spawnSync}=require('node:child_process');
const local=parseEnv(fs.readFileSync('.env','utf8')),base=new URL(local.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Operations tests require local PostgreSQL');
const files=['tests/integration/operations.test.ts','tests/integration/order-workflow.test.ts','tests/integration/online-ordering.test.ts'];
const selected=process.argv.slice(2);if(selected.some(file=>!files.includes(file)))throw Error('Unknown integration suite');
async function main(){const {PrismaClient}=require('@prisma/client'),admin=new PrismaClient({datasources:{db:{url:local.DATABASE_URL}}});try{for(const [index,file] of (selected.length?selected:files).entries()){
 const schema=`restaurant_ops_test_${process.pid}_${index}`,url=new URL(base);url.searchParams.set('schema',schema);const env={...process.env,DATABASE_URL:url.toString(),RUN_OPERATIONS_TESTS:'1',RUN_DATABASE_TESTS:'1'};
 function run(args){const r=spawnSync('npx',args,{env,stdio:'inherit'});if(r.status!==0)throw Error(`Test command failed: ${args[0]}`);}
 try{run(['prisma','migrate','deploy']);run(['tsx','--test',file]);}catch(e){console.error(e.message);process.exitCode=1;}finally{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);console.log('Disposable test schema removed');}
 }}finally{await admin.$disconnect();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
