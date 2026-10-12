export function jobForEvent(running,p){const jobs=[...running.values()].reverse().filter(j=>j.threadId===p.threadId);const turnId=p.turnId||p.turn?.id;return (turnId&&jobs.find(j=>j.turnId===turnId))||jobs.find(j=>['starting','running','waiting_approval','stopping'].includes(j.status))||jobs[0];}
export function applyJobEvent(running,m,touch){const p=m.params||{},j=jobForEvent(running,p);if(!j)return null;
 if(m.method==='item/agentMessage/delta'){j.output=(j.output+(p.delta||'')).slice(-40000);touch(j);}
 if(m.method==='turn/started'){j.turnId=p.turn?.id||j.turnId;j.status='running';touch(j);}
 if(m.method==='turn/completed'){j.status=j.limitStopped?'paused_limit':(p.turn?.status||'failed');j.message=p.turn?.error?.message||(j.status==='completed'?'Task completed.':j.message);j.approval=null;touch(j);}
 if(m.method==='item/started'){j.message=p.item?.type==='commandExecution'?'Running a project command…':p.item?.type==='fileChange'?'Editing project files…':'Working…';touch(j);}
 return j;
}
