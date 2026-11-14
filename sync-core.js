import {validateData,localDay,nextDue} from './store.js?v=71';
export const APP_ID='shiyouji-poetry-v1';
export const MAX_PROFILES=20;
export const MAX_PROFILE_RECORDS=100;
export const isDeleted=profile=>profile?.lifecycle?.deleted===true;
export function normalizeLifecycle(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='object'||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>1000000000||typeof value.deleted!=='boolean'||typeof value.changedAt!=='string'||!Number.isFinite(Date.parse(value.changedAt))||typeof value.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(value.operationId))throw new Error('账号删除或恢复标记无效。');
  return {revision:value.revision,deleted:value.deleted,changedAt:value.changedAt,operationId:value.operationId};
}
export function mergeLifecycle(local,cloud){const l=normalizeLifecycle(local),r=normalizeLifecycle(cloud);if(!l)return clone(r);if(!r)return clone(l);if(l.revision!==r.revision)return clone(l.revision>r.revision?l:r);if(l.deleted!==r.deleted)return clone(l.deleted?l:r);return clone(l.operationId>=r.operationId?l:r);}
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const clone=value=>value===undefined?undefined:structuredClone(value);
export function canonical(value){if(value===undefined)return 'undefined';if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export const same=(a,b)=>canonical(a)===canonical(b);
export function normalizeCode(value){
  const code=String(value??'').trim(),compact=code.replace(/[\s-]/g,'').toUpperCase();
  if(/^SYJ[A-HJ-NP-Z2-9]{20}$/.test(compact))return 'SYJ-'+compact.slice(3).match(/.{4}/g).join('-');
  if(!/^[a-zA-Z0-9\u3400-\u9fff_-]{4,32}$/.test(code))throw new Error('同步码须为 4–32 位中文、字母、数字、下划线或连字符，不能包含空格。');
  return code;
}
export function generateCode(){return 'SYJ-'+Array.from(crypto.getRandomValues(new Uint8Array(20)),n=>ALPHABET[n%32]).join('').match(/.{4}/g).join('-');}
export async function codeHash(code){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(APP_ID+'\0'+normalizeCode(code)));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateSpace(raw,poemIds){
  if(!raw||raw._app!==APP_ID||raw.schema!==1||!raw.profiles||Array.isArray(raw.profiles)||typeof raw.profiles!=='object')throw new Error('这不是诗游记的同步数据。');
  const entries=Object.entries(raw.profiles);if(!entries.length||entries.length>MAX_PROFILE_RECORDS)throw new Error('保留的账号（含回收站）最多 100 个，请导出备份并另建一组护照。');
  const profiles={};for(const [id,p] of entries){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/.test(id)||['constructor','prototype','__proto__'].includes(id)||!p||p.id!==id||!Number.isFinite(Date.parse(p.createdAt)))throw new Error('学习账号标识无效。');
    profiles[id]={id,createdAt:p.createdAt,lifecycle:normalizeLifecycle(p.lifecycle),data:validateData(p.data,poemIds)};
  }
  const active=Object.values(profiles).filter(p=>!isDeleted(p)).length;if(!active)throw new Error('至少保留一个可用账号；若多个设备同时删除了最后的账号，请先建立一个新账号再同步。');if(active>MAX_PROFILES)throw new Error('可用学习账号最多 20 个。');
  return {_app:APP_ID,schema:1,profiles};
}
export function newProfile(data){const id='p-'+crypto.randomUUID();return {id,createdAt:new Date().toISOString(),lifecycle:null,data:clone(data)};}
export function initialSpace(data){const p=newProfile(data);return {_app:APP_ID,schema:1,profiles:{[p.id]:p}};}
function latest(items){return [...items].sort((a,b)=>String(a.at).localeCompare(String(b.at))||canonical(a).localeCompare(canonical(b)));}
function retainAttempts(items){
  const sorted=latest(items);if(sorted.length<=500)return sorted;
  const first=sorted.find(a=>a.outcome==='independent'),other=first&&sorted.find(a=>a.outcome==='independent'&&localDay(a.at)!==localDay(first.at));
  const anchors=[first,other].filter(Boolean),ids=new Set(anchors.map(a=>a.id));
  return latest([...anchors,...sorted.filter(a=>!ids.has(a.id)).slice(-(500-anchors.length))]);
}
function reviewDate(attempts){if(!attempts.length)return null;const sorted=latest(attempts),last=sorted.at(-1),daily=new Map();for(const a of [...sorted].reverse())if(!daily.has(localDay(a.at)))daily.set(localDay(a.at),a);let streak=0;for(const a of daily.values()){if(a.outcome!=='independent')break;streak++;}return nextDue(last.at,last.outcome==='independent'?[1,3,7,14,30][Math.min(streak-1,4)]:1);}
export function mergeSpaces(base,local,cloud,{preference=null}={}){
  const conflicts=[],mergedAttempts=new Set();
  function conflict(b,l,r,path){conflicts.push({path,base:clone(b)??null,local:clone(l)??null,cloud:clone(r)??null,localMissing:l===undefined,cloudMissing:r===undefined});return clone(preference==='cloud'?r:l);}
  function events(b,l,r,path,kind){
    const key=a=>kind==='attempts'?a.id:canonical(a),map=x=>Object.fromEntries((x||[]).map(a=>[key(a),a]));
    const bm=map(b),lm=map(l),rm=map(r),out=[];
    for(const id of new Set([...Object.keys(bm),...Object.keys(lm),...Object.keys(rm)])){
      let value;if(same(lm[id],rm[id]))value=lm[id];else if(same(lm[id],bm[id]))value=rm[id];else if(same(rm[id],bm[id]))value=lm[id];else value=conflict(bm[id],lm[id],rm[id],path+'.'+id);
      if(value!==undefined)out.push(clone(value));
    }
    return kind==='attempts'?retainAttempts(out):latest(out).slice(-100);
  }
  function merge(b,l,r,path){
    if(path.endsWith('.lifecycle'))return mergeLifecycle(l,r);
    if(same(l,r))return clone(l);if(same(l,b))return clone(r);if(same(r,b))return clone(l);
    if(path.endsWith('.attempts')&&Array.isArray(l)&&Array.isArray(r)){mergedAttempts.add(path);return events(b,l,r,path,'attempts');}
    if(path.endsWith('.games')&&Array.isArray(l)&&Array.isArray(r))return events(b,l,r,path,'games');
    if(path.endsWith('.reading')&&b==null&&(l===null||r===null))return clone(l||r);
    if(path.endsWith('.reading')&&l&&r){return clone(String(l.completedAt)<=String(r.completedAt)?l:r);}
    if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)){
      const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){if(['__proto__','prototype','constructor'].includes(k))throw new Error('同步字段无效。');const v=merge(b?.[k],l[k],r[k],path+'.'+k);if(v!==undefined)out[k]=v;}return out;
    }
    if(path.endsWith('.dueAt'))return clone(l);
    return conflict(b,l,r,path);
  }
  const merged=merge(base,local,cloud,'space');
  for(const p of Object.values(merged.profiles||{}))for(const [id,entry] of Object.entries(p.data.entries||{}))if(mergedAttempts.has('space.profiles.'+p.id+'.data.entries.'+id+'.attempts'))entry.dueAt=reviewDate(entry.attempts);
  return {merged,conflicts};
}
export function chooseConflicts(payload,conflicts,preference){
  const result=clone(payload);
  for(const conflict of conflicts){const parts=conflict.path.split('.').slice(1);let target=result;
    for(const part of parts.slice(0,-1)){if(['__proto__','prototype','constructor'].includes(part))throw new Error('冲突字段无效。');target=Array.isArray(target)?target.find(v=>v.id===part):target?.[part];if(!target)throw new Error('冲突内容已变化，请重新同步。');}
    const key=parts.at(-1),missing=conflict[preference+'Missing'],value=clone(conflict[preference]);
    if(Array.isArray(target)){const at=target.findIndex(v=>v.id===key);if(missing){if(at>=0)target.splice(at,1);}else if(at>=0)target[at]=value;else target.push(value);}
    else if(missing)delete target[key];else target[key]=value;
  }
  return result;
}
