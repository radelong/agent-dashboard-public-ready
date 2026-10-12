import fs from 'node:fs';
import crypto from 'node:crypto';
import {SEED} from '../worker/seed.mjs';
import {CodexRPC} from './rpc.mjs';
import {applyJobEvent,jobForEvent} from './events.mjs';
import {createKnowledgeConnection} from './knowledge.mjs';
let configText='';for await(const c of process.stdin)configText+=c;const config=JSON.parse(configText);configText='';
const origin='https://example.invalid';
if(config.origin!==origin||!config.token||!config.codexPath)throw new Error('Invalid local connection configuration');
const bridgeId=crypto.randomUUID(),running=new Map(),dirty=new Map(),approvals=new Map(),acks=new Set();let usage=null,usageNew=false,lastUsage=0,quitting=false;
const api=async(path,payload)=>{const r=await fetch(origin+path,{method:payload?'POST':'GET',headers:{'OAI-Sites-Authorization':'Bearer '+config.token,'X-Project-Hub':'1','Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Dashboard connection returned '+r.status);return r.json();};
const knowledge=createKnowledgeConnection({api,storagePath:config.storagePath,pythonPath:config.pythonPath||'C:/Users/ExampleUser/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',download:async path=>{const r=await fetch(origin+path,{headers:{'OAI-Sites-Authorization':'Bearer '+config.token},signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Document download returned '+r.status);return r.arrayBuffer();},uploadFile:async(id,bytes)=>{const r=await fetch(origin+'/api/knowledge/bridge-file?id='+id,{method:'POST',headers:{'OAI-Sites-Authorization':'Bearer '+config.token,'X-Project-Hub':'1'},body:bytes,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Original restore returned '+r.status);}});
const touch=j=>{j.updatedAt=new Date().toISOString();dirty.set(j.id,(dirty.get(j.id)||0)+1);};
const limits=()=>usage?.rateLimitsByLimitId?.codex||usage?.rateLimits;
const near=()=>!limits()?.primary||!limits()?.secondary||limits().primary.usedPercent>=85||limits().secondary.usedPercent>=85;
const exhausted=()=>!limits()?.primary||!limits()?.secondary||limits().primary.usedPercent>=90||limits().secondary.usedPercent>=90;
const byThread=id=>jobForEvent(running,{threadId:id});
const rpc=new CodexRPC(config.codexPath,m=>{
 const p=m.params||{};if(m.method==='account/rateLimits/updated'){usage=p;usage.observedAt=new Date().toISOString();usageNew=true;lastUsage=Date.now();return;}
 const j=applyJobEvent(running,m,touch);if(m.method==='turn/completed'&&j)for(const [key,a]of approvals)if(a.jobId===j.id)approvals.delete(key);
},m=>{
 const j=byThread(m.params?.threadId);if(!j){rpc.send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'No dashboard agent owns this request'}});return;}
 const supported=['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(m.method);
 if(!supported){rpc.send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'This interaction requires Codex directly; use Stop and follow up in Codex.'}});j.message='Agent needs an interaction currently supported in Codex. Stop here and continue in Codex.';touch(j);return;}
 const id=crypto.randomUUID();approvals.set(id,{rpcId:m.id,jobId:j.id});j.status='waiting_approval';j.approval={id,title:m.method.includes('fileChange')?'Approve proposed file changes':'Approve this command',detail:String(m.params?.command||m.params?.reason||'The agent requested permission.').slice(0,3000)};touch(j);
});
await rpc.initialize();
async function refreshUsage(){usage=await rpc.call('account/rateLimits/read');usage.observedAt=new Date().toISOString();usageNew=true;lastUsage=Date.now();}
await refreshUsage();
if(process.argv.includes('--check')){console.log(JSON.stringify({connected:true,primary:limits()?.primary,secondary:limits()?.secondary}));rpc.close();process.exit(0);}
async function start(job){
 const p=SEED.projects.find(p=>p.id===job.projectId);if(!p?.path||!fs.existsSync(p.path))throw new Error('Registered local project folder is unavailable');
 const broad=['C:\\','C:\\Users\\ExampleUser'].includes(p.path);const mode=broad?'read-only':'workspace-write';
 const t=await rpc.call(job.resumeThreadId?'thread/resume':'thread/start',{...(job.resumeThreadId?{threadId:job.resumeThreadId}:{}),cwd:p.path,sandbox:mode,approvalPolicy:'on-request',developerInstructions:'You are the project agent controlled by the human through their private ExampleUser Projects dashboard. Work only on the requested project and task. Follow applicable AGENTS.md. Do not publish, deploy, send messages, share private documents, alter credentials, or perform destructive operations without direct specific human authorization. Never upload authentication secrets, health details, or instructor answer keys. Give concise progress and a final result. Broad user or drive-root projects are read-only; ask for a bounded project folder for editing. Account limits are monitored by the dashboard connection; do not bypass interruption.'});
 const j={...job,threadId:t.thread.id,status:'running',output:'',approval:null};running.set(j.id,j);touch(j);
 const reference=await knowledge.context(job.text,job.projectId);
 const turn=await rpc.call('turn/start',{threadId:j.threadId,input:[{type:'text',text:job.text+reference}]});j.turnId=turn.turn.id;touch(j);
}
async function report(state='connected',message=''){
 const versions=[...dirty.entries()];const ids=versions.map(([id])=>id);const payload={bridgeId,state,message,jobs:ids.map(id=>running.get(id)),ack:[...acks],...(usageNew?{usage}:{})};await api('/api/bridge',payload);versions.forEach(([id,version])=>{if(dirty.get(id)===version)dirty.delete(id);});acks.clear();usageNew=false;
}
async function tick(){
 void knowledge.tick();
 if(Date.now()-lastUsage>15000){try{await refreshUsage();}catch{for(const j of running.values())if(['running','waiting_approval'].includes(j.status)){j.limitStopped=true;await rpc.call('turn/interrupt',{threadId:j.threadId,turnId:j.turnId});j.message='Paused because account limits could not be checked.';touch(j);}throw new Error('Usage check unavailable; agent work is paused.');}}
 if(exhausted())for(const j of running.values())if(['running','waiting_approval'].includes(j.status)){j.limitStopped=true;await rpc.call('turn/interrupt',{threadId:j.threadId,turnId:j.turnId});j.message='Paused at the account-wide 90% usage threshold.';touch(j);}
 await report();const s=await api('/api/bridge');
 // A lost process must never restart an already-claimed task automatically.
 for(const j of s.jobs.filter(j=>j.bridgeId&&j.bridgeId!==bridgeId&&['starting','running','waiting_approval','stopping'].includes(j.status))){/* shown as stale by the UI; no execution */}
 for(const c of s.commands.filter(c=>c.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
  const j=running.get(c.jobId);if(!j)continue;
  try{
   if(c.kind==='stop'){if(['completed','failed','interrupted'].includes(j.status))throw new Error('This task has already finished.');if(['running','waiting_approval','starting'].includes(j.status))await rpc.call('turn/interrupt',{threadId:j.threadId,turnId:j.turnId});j.status='interrupted';j.approval=null;j.message='Stopped by you.';touch(j);}
   if(c.kind==='guidance'){if(exhausted())throw new Error('Guidance cannot restart work at the limit.');await rpc.call('turn/steer',{threadId:j.threadId,expectedTurnId:j.turnId,input:[{type:'text',text:c.text}]});j.message='Your guidance was delivered.';touch(j);}
   if(c.kind==='approve'||c.kind==='decline'){const a=approvals.get(c.approvalId);if(!a||a.jobId!==j.id)throw new Error('Approval expired');if(exhausted()&&c.kind==='approve')throw new Error('Approval paused at usage limit');rpc.respond(a.rpcId,{decision:c.kind==='approve'?'accept':'decline'});approvals.delete(c.approvalId);j.approval=null;j.status='running';touch(j);}
  }catch(e){j.message=e.message;touch(j);}acks.add(c.id);
 }
 if(!near()&&![...running.values()].some(j=>['running','waiting_approval','starting'].includes(j.status))){
  const job=s.jobs.find(j=>j.status==='queued');if(job){try{await api('/api/bridge',{bridgeId,claim:{id:job.id,revision:job.revision}});await start(job);}catch(e){running.set(job.id,{...job,status:'failed',message:e.message,output:''});touch(running.get(job.id));}}
 }
 await report();
}
console.log('Local project connection started.');
process.on('SIGTERM',()=>{quitting=true;rpc.close();});
while(!quitting){try{await tick();}catch(e){try{await report('error',e.message);}catch{}if(rpc.closed)break;}await new Promise(r=>setTimeout(r,4000));}
rpc.close();
