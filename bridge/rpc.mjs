import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export class CodexRPC {
 constructor(executable,onEvent,onRequest){this.pending=new Map();this.next=1;this.child=spawn(executable,['app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe'],windowsHide:true});this.child.stderr.on('data',()=>{});createInterface({input:this.child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.method){if(m.id!==undefined)onRequest(m);else onEvent(m);}else if(this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});this.child.on('exit',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Local Codex process stopped.'));}this.pending.clear();this.closed=true;});}
 send(m){if(this.closed)throw new Error('Codex connection stopped');this.child.stdin.write(JSON.stringify(m)+'\n');}
 call(method,params={}){const id=this.next++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(method+' timed out'));},45000);this.pending.set(id,{resolve,reject,timer});this.send({jsonrpc:'2.0',id,method,params});});}
 respond(id,result){this.send({jsonrpc:'2.0',id,result});}
 async initialize(){await this.call('initialize',{clientInfo:{name:'ExampleUser_project_hub',title:'ExampleUser Projects',version:'2.0.0'},capabilities:{experimentalApi:true}});this.send({jsonrpc:'2.0',method:'initialized'});}
 close(){this.child.kill();}
}
