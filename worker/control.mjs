import {read,put,all,reply,fail,id,str,body,state} from './index.js';
const activeJobs = ['queued','starting','running','waiting_approval','stopping','paused_limit'];
const fresh = (t,ms=90000) => t && Date.now()-Date.parse(t)<ms && Date.now()>=Date.parse(t)-5000;
const windows = u => u?.rateLimitsByLimitId?.codex || u?.rateLimits || null;
const canStart = u => {const w=windows(u);return fresh(u?.observedAt)&&w?.primary&&w?.secondary&&w.primary.usedPercent<85&&w.secondary.usedPercent<85;};
const serviceOnly = r => {if(r.headers.get('oai-authenticated-user-id')||r.headers.get('oai-authenticated-user-email'))fail('This endpoint is reserved for the local connection.',403);};
async function controlState(env){return {connection:(await read(env,'control/connection.json'))?.value||null,usage:(await read(env,'control/usage.json'))?.value||null,jobs:await all(env,'jobs/')};}
async function controlRoute(request,env,path){
 if(path==='/api/bridge'){
  serviceOnly(request);
  if(request.method==='GET')return reply({...await controlState(env),commands:await all(env,'commands/')});
  const b=await body(request);
  if(b.claim){const old=await read(env,'jobs/'+b.claim.id+'.json');if(!old||old.etag!==b.claim.revision||old.value.status!=='queued')fail('Job was already claimed',409);const row={...old.value,status:'starting',bridgeId:b.bridgeId,updatedAt:new Date().toISOString()};await put(env,'jobs/'+row.id+'.json',row,old.etag);return reply(row);}
  if(!id(b.bridgeId))fail('Invalid connection');
  const now=new Date().toISOString(),old=await read(env,'control/connection.json');await put(env,'control/connection.json',{bridgeId:b.bridgeId,seenAt:now,state:b.state==='error'?'error':'connected',message:str(b.message,1000)?b.message:''},old?.etag);
  if(b.usage){if(!fresh(b.usage.observedAt))fail('Usage reading is stale');const u=await read(env,'control/usage.json');await put(env,'control/usage.json',b.usage,u?.etag);}
  for(const update of b.jobs||[]){if(!id(update.id))fail('Invalid job');const old=await read(env,'jobs/'+update.id+'.json');if(!old||old.value.bridgeId!==b.bridgeId)fail('Connection does not own this job',403);const row={...old.value,status:update.status,threadId:update.threadId||old.value.threadId,turnId:update.turnId||old.value.turnId,output:String(update.output||'').slice(-40000),message:String(update.message||'').slice(0,1000),approval:update.approval||null,updatedAt:now};if(![...activeJobs,'completed','failed','interrupted'].includes(row.status))fail('Invalid job status');await put(env,'jobs/'+row.id+'.json',row,old.etag);}
  for(const commandId of b.ack||[]){if(!id(commandId))continue;const c=await read(env,'commands/'+commandId+'.json');if(c)await put(env,'commands/'+commandId+'.json',{...c.value,status:'handled'},c.etag);}
  return reply({ok:true});
 }
 if(path==='/api/agent'&&request.method==='POST'){
  const b=await body(request),s=await controlState(env);
  if(b.kind==='start'){
   const p=(await state(env)).projects.find(p=>p.id===b.projectId);if(!p?.path)fail('This project needs a local working folder.');
   if(!fresh(s.connection?.seenAt,45000)||s.connection.state!=='connected')fail('The local Codex connection is offline. Reconnect it from Codex.',503);
   if(!canStart(s.usage))fail('Starting is paused: usage must be fresh and below 85% in both windows to leave room before the 90% stop threshold.',409);
   if(s.jobs.some(j=>activeJobs.includes(j.status)))fail('An agent task is already active. Finish or stop it first.',409);
   if(!str(b.text,15000)||!b.text.trim())fail('Enter the task instructions.');
   const previous=b.previousJobId?s.jobs.find(j=>j.id===b.previousJobId):null;
   if(b.previousJobId&&(!previous||previous.projectId!==p.id||activeJobs.includes(previous.status)||!previous.threadId))fail('Choose a finished task from this project for a follow-up.');
   const row={id:crypto.randomUUID(),projectId:p.id,projectName:p.name,text:b.text.trim(),resumeThreadId:previous?.threadId||null,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),output:''};await put(env,'jobs/'+row.id+'.json',row);return reply(row,201);
  }
  const j=s.jobs.find(j=>j.id===b.jobId);if(!j)fail('Agent task not found',404);
  if(!['stop','guidance','approve','decline'].includes(b.kind))fail('Unknown control');
  if(!activeJobs.includes(j.status))fail('This agent task has finished.',409);
  if(b.kind==='stop'&&(j.status==='queued'||(j.bridgeId&&j.bridgeId!==s.connection?.bridgeId))){const old=await read(env,'jobs/'+j.id+'.json');await put(env,'jobs/'+j.id+'.json',{...old.value,status:'interrupted',message:'Cancelled by the user; this queued or disconnected task will not restart.',updatedAt:new Date().toISOString()},old.etag);return reply({stopped:true});}
  if(b.kind==='guidance'&&(!str(b.text,15000)||!b.text.trim()))fail('Enter guidance.');
  if(['approve','decline'].includes(b.kind)&&(!j.approval||b.approvalId!==j.approval.id))fail('Approval is no longer pending',409);
  const row={id:crypto.randomUUID(),jobId:j.id,kind:b.kind,text:b.kind==='guidance'?b.text.trim():null,approvalId:b.approvalId||null,status:'queued',createdAt:new Date().toISOString()};await put(env,'commands/'+row.id+'.json',row);return reply(row,201);
 }
 return null;
}

export {controlRoute,controlState};
