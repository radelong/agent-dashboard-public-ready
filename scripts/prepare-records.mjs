import fs from 'node:fs';
import path from 'node:path';
import {SEED} from '../worker/seed.mjs';
const records=path.resolve(process.env.RECORDS_PATH || './work/example-records');fs.mkdirSync(records,{recursive:true});
const docs=[];
const eligible = n => /\.(md|docx|pdf|xlsx|pptx)$/i.test(n)&& !/(password|secret|credential|answer.?key|instructor.?only)/i.test(n);
for (const project of SEED.projects){
 const dir=path.join(records,project.id);fs.mkdirSync(dir,{recursive:true});
 const inventory=[];
 if(project.path&& !['ExampleUser','C:\\','Example game'].includes(project.name)){
  const walk=(root,depth)=>{if(inventory.length>=60)return;let entries;try{entries=fs.readdirSync(root,{withFileTypes:true});}catch{return;}for(const e of entries){if(inventory.length>=60)break;if(e.name.startsWith('.')||/(node_modules|__pycache__|instructor.?only|bin|obj)/i.test(e.name))continue;const full=path.join(root,e.name);if(e.isFile()&&eligible(e.name)){const s=fs.statSync(full);inventory.push({title:e.name,path:full,updatedAt:s.mtime.toISOString(),status:'Not assessed'});}else if(e.isDirectory()&&depth>0)walk(full,depth-1);}};walk(project.path,1);
 }
 const cleanName=project.name.replace(/[\r\n]/g,' ');
 const overview='# '+cleanName+' — project overview\n\nStatus: Draft baseline\nLast reviewed: '+SEED.createdAt+'\n\n## Current picture\n\n'+project.summary+'\n\n## Next step\n\n'+project.nextStep+'\n\n## Suggested improvement\n\n'+project.suggestion+'\n\n## Scope and priorities\n\nPriority and milestones are not assigned yet. Confirm the current goal before assigning deadlines.\n\n## Evidence\n\n'+project.evidence.map(e=>'- '+e.title+' — '+e.note+(e.threadId?' (Codex chat '+e.threadId+')':'')).join('\n')+'\n\n## Documentation control\n\nThis is a generated draft, not an approved project specification. Decisions should cite the user instruction or source that supports them. Existing deliverables retain their original status. Broad folders are not recursively scanned.\n';
 const register='# '+cleanName+' — document register\n\nStatus: Draft\nInventory date: '+SEED.createdAt+'\n\nThis is a bounded inventory of document names and locations. Contents have not been reviewed or approved. Credential files and instructor-only material are excluded. Existing documents stay in their project folders.\n\n'+(inventory.length?'| Document | Location | Review status |\n|---|---|---|\n'+inventory.map(d=>'| '+d.title.replace(/\|/g,'\\|')+' | '+d.path.replace(/\|/g,'\\|')+' | Not assessed |').join('\n'):'No bounded document inventory available. Establish relevant folders and authoritative documents with the user.')+'\n\n## Decisions\n\nNo project-specific decisions are inferred from registration.\n\n## Changes\n\nInitial document baseline generated; source files were not modified.\n';
 fs.writeFileSync(path.join(dir,'OVERVIEW.md'),overview);fs.writeFileSync(path.join(dir,'DOCUMENT-REGISTER.md'),register);fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify({...project,documentInventory:inventory},null,2));
 for(const [type,title,content] of [['overview','Project overview',overview],['register','Document register',register]])docs.push({id:project.id+'-'+type,projectId:project.id,title:cleanName+' — '+title,content,status:'Draft',source:project.evidence.map(e=>e.title).join('; '),localPath:path.join(dir,type==='overview'?'OVERVIEW.md':'DOCUMENT-REGISTER.md')});
}
fs.writeFileSync(path.join(records,'portfolio.json'),JSON.stringify(SEED,null,2));fs.writeFileSync(path.join(records,'document-payload.json'),JSON.stringify(docs,null,2));
fs.writeFileSync(path.join(records,'PORTFOLIO.md'),'# ExampleUser project portfolio\n\nGenerated baseline: '+SEED.createdAt+'\nDashboard: https://example.invalid\n\n| Project | Recorded status | Next step |\n|---|---|---|\n'+SEED.projects.map(p=>'| '+p.name.replace(/\|/g,'\\|')+' | '+p.status+' | '+p.nextStep+' |').join('\n')+'\n');
console.log('Prepared '+SEED.projects.length+' project baselines and '+docs.length+' document drafts.');
