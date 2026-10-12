import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const recordRoot=path.resolve(process.env.RECORDS_PATH || fileURLToPath(new URL('../work/records/',import.meta.url)));
const recordFile=name=>path.join(recordRoot,name);
const allowed=process.env.PROJECT_HUB_ORIGIN || 'https://example.invalid';
const originURL=new URL(allowed);
if(originURL.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(originURL.hostname))throw Error('Use HTTPS or a local test origin');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for Project Hub JSON on stdin (input is hidden).');
let input='';
for await(const chunk of process.stdin){input+=chunk.toString();if(input.includes('\n')||input.includes('\r'))break;}
if(process.stdin.isTTY)process.stdin.setRawMode(false);
process.stdin.pause();
try{
 const config=JSON.parse(input.trim());
 if(config.origin!==allowed)throw new Error('Only this project Site is allowed.');
 const headers={'OAI-Sites-Authorization':'Bearer '+config.token,'X-Project-Hub':'1','Content-Type':'application/json'};
 const fetchJson=async(endpoint,payload)=>{const r=await fetch(allowed+endpoint,{method:payload?'POST':'GET',headers,body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Hub request failed: '+r.status);return r.json();};
 let result;
 if(config.operation==='read'){result=await fetchJson('/api/state');fs.mkdirSync(recordRoot,{recursive:true});fs.writeFileSync(recordFile("hosted-state.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({saved:recordFile("hosted-state.json"),projects:result.projects.length,queuedRequests:result.requests.filter(r=>r.status==='queued').length}));}
 else if(config.operation==='initialize'){
  const seed=JSON.parse(fs.readFileSync(recordFile("portfolio.json"),'utf8'));const existing=await fetchJson('/api/state');
  const projects=seed.projects.map(p=>({...p,revision:existing.projects.find(x=>x.id===p.id)?.revision}));
  await fetchJson('/api/sync',{projects,reviewedAt:seed.createdAt});
  const docs=JSON.parse(fs.readFileSync(recordFile("document-payload.json"),'utf8'));
  for(const doc of docs){const old=existing.documents.find(d=>d.id===doc.id);if(!old)await fetchJson('/api/document',{document:doc});}
  const checks=JSON.parse(fs.readFileSync(recordFile("action-payload.json"),'utf8'));
  for(const action of checks){if(!existing.actions.some(a=>a.id===action.id))await fetchJson('/api/action',{action});}
  result=await fetchJson('/api/state');fs.writeFileSync(recordFile("hosted-state.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({projects:result.projects.length,documents:result.documents.length,actions:result.actions.length,verified:true}));
 }else if(config.operation==='write'){
  const endpoints=['/api/sync','/api/action','/api/document','/api/answer','/api/bridge'];if(!endpoints.includes(config.endpoint))throw new Error('Unsupported operation');
  const payload=config.payload||JSON.parse(fs.readFileSync(config.payloadFile,'utf8'));result=await fetchJson(config.endpoint,payload);console.log(JSON.stringify(result));
 }else throw new Error('Unknown operation');
}catch(e){console.error(e.message);process.exitCode=1;}
