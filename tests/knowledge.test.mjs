import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import worker from '../worker/index.js';
import {MemoryBucket} from './storage.mjs';
import {MODEL,searchKnowledge} from '../worker/knowledge.mjs';
import {chunkSections,archiveOriginal,extract} from '../bridge/knowledge.mjs';
const call=(env,p,payload,headers={})=>worker.fetch(new Request('https://hub.example'+p,payload?{method:'POST',headers:{'Content-Type':'application/json','X-Project-Hub':'1',...headers},body:JSON.stringify(payload)}:{headers}),env);
const unit=n=>Array.from({length:384},(_,i)=>i===n?1:0);
async function upload(env,text='Engine coolant prevents overheating.',projectId='alpha',extension='txt'){
 const form=new FormData();form.set('file',new File([text],'source.'+extension));form.set('projectId',projectId);
 return worker.fetch(new Request('https://hub.example/api/knowledge/upload',{method:'POST',headers:{'X-Project-Hub':'1'},body:form}),env);
}
async function index(env,text,projectId='alpha',v=unit(0)){
 const d=await(await upload(env,text,projectId)).json();const c=await(await call(env,'/api/knowledge/bridge',{kind:'claim',id:d.id,revision:d.revision})).json();
 const done={kind:'complete',id:d.id,lease:c.lease,model:MODEL,passages:[{text,location:'Page 2',vector:v}],archive:{provider:'unraid',path:'\\\\192.0.2.10\\AgentDocuments\\'+d.id+'\\original.txt',sha256:d.sha256,verifiedAt:new Date().toISOString()}};
 assert.equal((await call(env,'/api/knowledge/bridge',done)).status,200);return {d,c,done};
}
test('uploads preserve original bytes, checksum, scope and duplicate identity; unsafe types and origins fail',async()=>{
 const env={BUCKET:new MemoryBucket()};const d=await(await upload(env)).json();assert.equal(d.sha256,crypto.createHash('sha256').update('Engine coolant prevents overheating.').digest('hex'));assert.equal(d.status,'queued');
 assert.equal((await(await upload(env)).json()).duplicate,true);const other=await(await upload(env,undefined,'beta')).json();assert.notEqual(d.id,other.id);
 assert.equal((await upload(env,'bad','alpha','exe')).status,400);
 assert.equal((await call(env,'/api/knowledge/action',{id:d.id,kind:'delete',revision:d.revision},{Origin:'https://other.example'})).status,403);
 const original=await worker.fetch(new Request('https://hub.example/api/knowledge/download?id='+d.id),env);assert.equal(await original.text(),'Engine coolant prevents overheating.');
});
test('index becomes visible only after valid vectors and a verified NAS receipt; stale leases cannot commit',async()=>{
 const env={BUCKET:new MemoryBucket()};const d=await(await upload(env)).json();const c=await(await call(env,'/api/knowledge/bridge',{kind:'claim',id:d.id,revision:d.revision})).json();
 assert.equal((await call(env,'/api/knowledge/bridge',{kind:'claim',id:d.id,revision:d.revision})).status,409);
 assert.equal((await call(env,'/api/knowledge/bridge',{kind:'failed',id:d.id,lease:c.lease},{'oai-authenticated-user-id':'visitor'})).status,403);
 const a={kind:'complete',id:d.id,lease:c.lease,model:MODEL,passages:[{text:'Engine maintenance.',location:'Lines 1–2',vector:unit(0)}]};
 assert.equal((await call(env,'/api/knowledge/bridge',a)).status,400);
 assert.equal((await searchKnowledge(env,{query:'engine',semantic:false})).results.length,0);
 await call(env,'/api/knowledge/bridge',{kind:'failed',id:d.id,lease:c.lease,error:'NAS offline'});
 assert.equal((await call(env,'/api/knowledge/bridge',a)).status,409);
 assert(await env.BUCKET.get('knowledge/originals/'+d.id));
});
test('hybrid retrieval respects project plus shared scope and returns reproducible citations; deletion removes search access',async()=>{
 const env={BUCKET:new MemoryBucket()};const {d,done}=await index(env,'Coolant prevents overheating in a motor.');await index(env,'An automobile needs routine service.','all',unit(0));await index(env,'Confidential beta budget.', 'beta',unit(1));
 const r=await searchKnowledge(env,{query:'vehicle maintenance',projectId:'alpha',vector:unit(0)});assert.equal(r.mode,'hybrid');assert.equal(r.results.length,2);assert(r.results.every(p=>p.projectId==='alpha'||p.projectId==='all'));assert(r.results.some(p=>p.documentId===d.id));
 const hit=r.results.find(p=>p.documentId===d.id);const passage=await(await call(env,hit.url)).json();assert.equal(passage.text,done.passages[0].text);assert.equal(passage.sha256,d.sha256);assert.equal(passage.vector,undefined);
 assert.equal(await env.BUCKET.get('knowledge/originals/'+d.id),null);
 const list=await(await call(env,'/api/knowledge')).json();const doc=list.documents.find(x=>x.id===d.id);
 assert.equal((await call(env,'/api/knowledge/action',{kind:'delete',id:d.id,revision:'old'})).status,409);
 assert.equal((await call(env,'/api/knowledge/action',{kind:'delete',id:d.id,revision:doc.revision})).status,200);
 assert.equal((await call(env,hit.url)).status,404);assert(!(await searchKnowledge(env,{query:'coolant',semantic:false})).results.some(p=>p.documentId===d.id));
});
test('keyword retrieval works offline and MCP exposes source retrieval without original bytes or vectors',async()=>{
 const env={BUCKET:new MemoryBucket()};await index(env,'The engine inspection interval is six months.');const r=await searchKnowledge(env,{query:'inspection'});assert.equal(r.mode,'keyword');assert.equal(r.results[0].location,'Page 2');
 const rpc=await(await call(env,'/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search_knowledge',arguments:{query:'inspection',projectId:'alpha'}}})).json();const hit=JSON.parse(rpc.result.content[0].text);assert.equal(hit.results.length,1);assert.equal(hit.results[0].vector,undefined);
});
test('NAS archive verifies checksum, uses a bounded document directory, and extraction preserves line citations',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hub-knowledge-'));try{const bytes=Buffer.from('Maintenance interval: six months.');const doc={id:'abc',extension:'txt',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};const receipt=await archiveOriginal(root,doc,bytes);assert.equal(await fs.readFile(receipt.path,'utf8'),bytes.toString());await assert.rejects(archiveOriginal(root,{...doc,sha256:'wrong'},bytes),/checksum/);
 const python=process.env.PYTHON_PATH || 'python';const extracted=await extract(bytes,'txt',python);assert.equal(extracted.sections[0].location,'Lines 1–1');const chunks=chunkSections([{location:'Page 3',text:'maintenance '.repeat(300)}]);assert(chunks.length>1);assert(chunks.every(c=>c.text.length<=1100&&c.location==='Page 3'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
