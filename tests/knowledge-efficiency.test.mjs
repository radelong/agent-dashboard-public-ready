import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchKnowledge,knowledgeTool,getPassage} from '../worker/knowledge.mjs';
import {formatContext} from '../bridge/knowledge.mjs';
import {fixture,unit} from './retrieval-fixture.mjs';

test('default model retrieval keeps six full passages, distinct facts and resolvable compact citations',async()=>{
 const {env,ids}=await fixture();const args={query:'coolant replacement interval',projectId:'alpha',vector:unit};
 const raw=await searchKnowledge(env,args),compact=await knowledgeTool(env,'search_knowledge',args);
 assert.equal(raw.results.length,6);assert.equal(compact.results.length,6);assert.equal(new Set(raw.results.map(p=>p.text)).size,6);
 assert(raw.results.some(p=>p.text.includes('24 months')));assert(raw.results.some(p=>p.text.includes('12 months')));
 for(const p of compact.results){const s=compact.sources[p.source-1],full=await getPassage(env,{id:s.id,passage:p.passage});assert.equal(full.text,p.text);assert.equal(full.version,s.version);assert.equal(p.excerpt,undefined);assert.notEqual(s.id,ids.private);}
 const prompt=formatContext(raw);assert(prompt.includes('untrusted'));assert(prompt.includes('12 months'));assert(!prompt.includes('private-NAS-path'));assert(compact.sources.every(s=>!s.sha256&&!s.archive));
});
test('facts near passage ends remain intact and callers can request additional complete passages',async()=>{
 const {env}=await fixture();const args={query:'nightly database snapshot retention',semantic:false};
 const full=await searchKnowledge(env,args),more=await searchKnowledge(env,{...args,limit:12});
 assert(full.results.some(p=>p.text.includes('35 days')));assert(more.results.length>=full.results.length);
 for(const p of more.results){const source=await getPassage(env,{id:p.documentId,passage:p.passage});assert.equal(source.text,p.text);}
 assert(full.results.every(p=>!p.excerpt));
});
test('inventory pagination omits index/archive metadata and no-match retrieval adds no agent context',async()=>{
 const {env}=await fixture();const one=await knowledgeTool(env,'list_knowledge_documents',{projectId:'alpha',limit:2}),two=await knowledgeTool(env,'list_knowledge_documents',{projectId:'alpha',offset:one.nextOffset,limit:2});
 assert.equal(one.total,5);assert.equal(one.documents.length,2);assert.equal(two.documents.length,2);assert(!one.documents.some(p=>two.documents.some(q=>q.id===p.id)));assert(one.documents.every(p=>!p.archive&&!p.sha256&&!p.generation));
 const noMatch=await searchKnowledge(env,{query:'what is the',semantic:false,projectId:'alpha'});assert.equal(noMatch.results.length,0);assert.equal(formatContext(noMatch),'');
});
