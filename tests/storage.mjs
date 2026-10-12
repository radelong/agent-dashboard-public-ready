export class MemoryBucket {
 constructor(){this.rows=new Map();this.seq=0;}
 async get(key){const row=this.rows.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.text),body:row.text,arrayBuffer:async()=>typeof row.text==='string'?new TextEncoder().encode(row.text).buffer:row.text}:null;}
 async delete(key){this.rows.delete(key);}
 async list({prefix='',cursor,limit=1000}={}){const rows=[...this.rows.entries()].filter(([k])=>k.startsWith(prefix));const start=cursor?Number(cursor):0;return {objects:rows.slice(start,start+limit).map(([key,r])=>({key,etag:r.etag})),truncated:start+limit<rows.length,cursor:String(start+limit)};}
 async put(key,text,options={}){const old=this.rows.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag='rev-'+(++this.seq);this.rows.set(key,{text,etag});return {etag};}
}
