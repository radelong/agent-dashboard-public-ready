import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {MemoryBucket} from './storage.mjs';
const call=(env,path,payload,headers={})=>worker.fetch(new Request('https://hub.example'+path,payload?{method:'POST',headers:{'Content-Type':'application/json','X-Project-Hub':'1',...headers},body:JSON.stringify(payload)}:{headers}),env);
test('requests persist, answers require current revision and do not change project records',async()=>{
 const env={BUCKET:new MemoryBucket()};const baseline=await (await call(env,'/api/state')).json();
 const r=await (await call(env,'/api/request',{projectId:baseline.projects[0].id,kind:'guidance',text:'Prioritize documentation.'})).json();
 const state=await (await call(env,'/api/state')).json();assert.equal(state.requests.length,1);
 assert.equal((await call(env,'/api/answer',{id:r.id,response:'Recorded.',revision:'old'})).status,409);
 assert.equal((await call(env,'/api/answer',{id:r.id,response:'Recorded.',revision:state.requests[0].revision})).status,200);
 const next=await (await call(env,'/api/state')).json();assert.equal(next.requests[0].response,'Recorded.');assert.deepEqual(next.projects,baseline.projects);
});
test('project refresh preserves actions and requires concurrency revision',async()=>{
 const env={BUCKET:new MemoryBucket()};const base=await (await call(env,'/api/state')).json();const p=base.projects[0];
 assert.equal((await call(env,'/api/action',{action:{id:'next',projectId:p.id,title:'Review release',owner:'User',source:'User',status:'open'}})).status,200);
 assert.equal((await call(env,'/api/sync',{projects:[p],reviewedAt:'2026-10-11T20:00:00Z'})).status,200);
 assert.equal((await call(env,'/api/sync',{projects:[p],reviewedAt:'2026-10-11T20:01:00Z'})).status,409);
 const state=await (await call(env,'/api/state')).json();assert.equal(state.actions.length,1);assert.equal(state.projects.length,base.projects.length);
 assert.equal((await call(env,'/api/sync',{projects:[{...state.projects[0],summary:'Updated from evidence'}],reviewedAt:'2026-10-11T20:02:00Z'})).status,200);
});
test('document revisions survive updates, preserve history, and validate review labels',async()=>{
 const env={BUCKET:new MemoryBucket()};const doc={id:'brief',projectId:'project',title:'Brief',content:'# Draft',source:'Project records',status:'Draft'};
 assert.equal((await call(env,'/api/document',{document:doc})).status,200);
 const state=await (await call(env,'/api/state')).json();assert.equal(state.documents[0].version,1);
 assert.equal((await call(env,'/api/document',{document:{...doc,status:'Approved',revision:state.documents[0].revision}})).status,400);
 assert.equal((await call(env,'/api/document',{document:{...doc,content:'# Revised',revision:state.documents[0].revision}})).status,200);
 assert.equal((await (await call(env,'/api/state')).json()).documents[0].version,2);assert.equal((await env.BUCKET.get('history/brief-1.json')).json instanceof Function,true);
});
test('cross-origin browser writes and malformed requests are rejected',async()=>{
 const env={BUCKET:new MemoryBucket()};assert.equal((await call(env,'/api/request',{projectId:'all',kind:'update',text:'Update'},{Origin:'https://other.example'})).status,403);
 assert.equal((await call(env,'/api/request',{projectId:'all',kind:'bad',text:'Update'})).status,400);
 const list=await (await call(env,'/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.equal(list.result.tools.length,8);assert(list.result.tools.some(t=>t.name==='search_knowledge'));
});
