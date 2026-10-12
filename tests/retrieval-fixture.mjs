import crypto from 'node:crypto';
import {MemoryBucket} from './storage.mjs';
import {MODEL} from '../worker/knowledge.mjs';
export const unit=Array.from({length:384},(_,i)=>i===0?1:0);
export async function fixture(embedding=async()=>unit){
 const env={BUCKET:new MemoryBucket()},ids={};
 const topics=[
  ['Cooling handbook','alpha','cooling',[
   'Engine coolant protects the motor from overheating. Inspect the radiator, reservoir and hoses before service. '+('Maintenance observations are recorded in the service log. '.repeat(13))+'The coolant replacement interval is 24 months. Do not open the cap while the engine is hot.',
   'Engine coolant replacement is required every 24 months. Use premixed coolant; a hot radiator cap can release steam.',
   'Engine coolant replacement is required every 12 months for severe service. This exception overrides the normal interval.',
   'The automobile requires lubrication and routine servicing. Replace the oil filter every 8000 kilometers.',
  ]],
  ['Backup runbook','all','backup',[
   'Database backup retention covers recovery and audit needs. '+('Backup operators record the completed job and verify storage availability. '.repeat(10))+'Nightly database snapshots are retained for 35 days. Verify a restore every Friday.',
   'The database recovery point objective is 15 minutes. Transaction logs are shipped at that interval.',
   'The backup encryption key is rotated every 90 days. Do not place secrets in a status report.',
   'A failed backup raises an alert to the operator. Verify the last successful restore before deleting any snapshot.'
  ]],
  ['Invoice policy','alpha','invoice',[
   'Invoice approval requires a recorded purchase order. '+('The accounts team retains the supplier invoice and supporting purchase records. '.repeat(10))+'Invoices above 5000 dollars need two approvals. Payment terms are net 30 days.',
   'Travel reimbursement receipts must be submitted within 14 days. Attach the receipt and explain the business purpose.',
   'Invoice disputes must be recorded before the payment deadline. The accounts team tracks each open dispute.'
  ]],
  ['Private beta plan','beta','private',['The private beta launch code is ORCHID-73. Database backups are retained for 99 days in beta.']],
  ['Kitchen reference','alpha','kitchen',['An apple pie uses cinnamon, flour and butter. Bake at 180 degrees Celsius for 45 minutes.']],
  ['Portal verification','alpha','portal',['ExampleUser portal verification. An automobile needs routine engine servicing. Coolant should be inspected every six months. This is a synthetic test document, not a project requirement.']]
 ];
 for(const [title,projectId,label,texts] of topics){const id=crypto.createHash('sha256').update(label).digest('hex');ids[label]=id;
  const passages=[];for(const [i,text]of texts.entries()){const p={text,location:'Page '+(i+1),vector:await embedding(text)};passages.push(p);if(i===0&&label!=='private'&&label!=='kitchen')passages.push({...p});}
  await env.BUCKET.put('knowledge/docs/'+id+'.json',JSON.stringify({id,title,filename:label+'.txt',projectId,status:'ready',generation:'fixture',version:1,sha256:id,chunks:passages.length,archive:{provider:'unraid',path:'private-NAS-path'}}));
  await env.BUCKET.put('knowledge/index/'+id+'/fixture.json',JSON.stringify({model:MODEL,passages}));
 }
 return {env,ids};
}
export const cases=[
 {query:'coolant replacement interval',facts:['24 months','12 months'],source:'cooling'},
 {query:'How should I maintain my car?',facts:['8000 kilometers'],source:'cooling'},
 {query:'radiator cap hot engine',facts:['hot'],source:'cooling'},
 {query:'nightly database snapshot retention',facts:['35 days'],source:'backup'},
 {query:'database recovery point objective',facts:['15 minutes'],source:'backup'},
 {query:'backup encryption key rotation',facts:['90 days'],source:'backup'},
 {query:'verify a restore',facts:['Friday'],source:'backup'},
 {query:'invoice approvals above threshold',facts:['5000','two approvals'],source:'invoice'},
 {query:'invoice payment terms',facts:['net 30'],source:'invoice'},
 {query:'travel receipts reimbursement submission',facts:['14 days'],source:'invoice'}
];
