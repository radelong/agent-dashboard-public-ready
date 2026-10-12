import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const records=path.resolve(process.env.RECORDS_PATH || path.join(projectRoot,'work','records'));
const bridge=path.join(projectRoot,'bridge','main.mjs');
fs.mkdirSync(records,{recursive:true});
const stateFile=path.join(records,'local-connection.json');
if(process.stdin.isTTY)process.stdin.setRawMode(true);console.log('Ready for local connection JSON on stdin (input is hidden).');
let input='';for await(const c of process.stdin){input+=c;if(/[\r\n]/.test(input))break;}
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
const config=JSON.parse(input.trim());input='';
if(!config.check&&process.platform==='win32'&&fs.existsSync(stateFile)){
 const old=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(Number.isInteger(old.pid)){try{
  const query='Get-CimInstance Win32_Process -Filter "ProcessId='+old.pid+'" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress';
  const info=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',query],{windowsHide:true,encoding:'utf8'}));
  const normalize=s=>String(s||'').replaceAll('\\','/').toLowerCase();
  if(normalize(info?.ExecutablePath)===normalize(process.execPath)&&normalize(info.CommandLine).includes(normalize(bridge)))execFileSync('taskkill.exe',['/PID',String(old.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 }catch{}}
}
const output=fs.openSync(path.join(records,'local-connection.log'),'a');
const child=spawn(process.execPath,[bridge,...(config.check?['--check']:[])],{cwd:projectRoot,windowsHide:true,detached:!config.check,stdio:['pipe',output,output]});child.stdin.end(JSON.stringify(config));
if(config.check){child.on('exit',code=>process.exit(code||0));}else{child.unref();fs.writeFileSync(stateFile,JSON.stringify({pid:child.pid,startedAt:new Date().toISOString(),origin:config.origin,storagePath:config.storagePath||null,pythonPath:config.pythonPath||null}));console.log(JSON.stringify({started:true,pid:child.pid}));}
