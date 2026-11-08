import {STAGE_NAMES,stageForGrade} from './grades.js?v=64';
import {headingRequirements,HEADING_FIELDS} from './recitation-options.js?v=64';
export const STORAGE_KEY='shiyouji.passport.v3';
export const LEGACY_STORAGE_KEY='shiyouji.passport.v1';
export const SCHEMA=2;
export const DAY=86400000;
export function initialData(){return {schema:SCHEMA,profile:{name:'小诗友',stage:'low',grade:null},settings:{pinyin:true,motion:true,sound:false,speechMode:'cloud',recitationHeading:headingRequirements()},entries:{},games:[],createdAt:new Date().toISOString(),migration:null};}
export function localDay(value=new Date()){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function nextDue(now,days){const d=new Date(now);d.setDate(d.getDate()+days);d.setHours(0,0,0,0);return d.toISOString();}
export function validateData(raw,poemIds){
  if(!raw||![1,SCHEMA].includes(raw.schema)||!raw.profile||!raw.settings||!raw.entries||!Array.isArray(raw.games))throw new Error('备份格式或版本无法识别');
  const legacy=raw.schema===1;
  if(typeof raw.profile.name!=='string'||!raw.profile.name.trim()||raw.profile.name.length>16)throw new Error('备份中的名字无效');
  if(!Object.hasOwn(STAGE_NAMES,raw.profile.stage))throw new Error('备份中的年级设置无效');
  const ids=new Set(poemIds);const out=initialData();
  const grade=raw.profile.grade??null;if(grade!==null&&(!Number.isInteger(grade)||grade<1||grade>9))throw new Error('备份中的具体年级无效');
  if(grade!==null&&raw.profile.stage!==stageForGrade(grade))throw new Error('年级与学段不一致');
  out.profile={name:raw.profile.name.trim(),stage:raw.profile.stage,grade};
  for(const key of ['pinyin','motion','sound']){if(typeof raw.settings[key]!=='boolean')throw new Error('备份缺少偏好设置');out.settings[key]=raw.settings[key];}
  if(!legacy&&!['cloud','record-only'].includes(raw.settings.speechMode))throw new Error('备份缺少语音识别设置');
  out.settings.speechMode=legacy?'cloud':raw.settings.speechMode;
  out.settings.recitationHeading=headingRequirements(raw.settings.recitationHeading,{strict:true});
  for(const [id,entry] of Object.entries(raw.entries)){
    if(!ids.has(id))throw new Error('备份包含当前诗单以外的诗');
    if(!entry||!Array.isArray(entry.attempts)||entry.attempts.length>500||typeof entry.seen!=='boolean')throw new Error('背诵记录格式无效');
    const attempts=entry.attempts.map(a=>{
      if(!a||typeof a.id!=='string'||!Number.isFinite(Date.parse(a.at))||!['independent','hinted','learning'].includes(a.outcome)||!['self','family','speech'].includes(a.confirmation)||!Number.isInteger(a.hints)||a.hints<0||a.hints>100||!['practice','recite','family'].includes(a.mode))throw new Error('背诵记录含有无效或缺失字段');
      if(a.outcome==='independent'&&a.hints>0)throw new Error('独立背诵记录与提示次数冲突');
      const evidence=a.confirmation==='speech'?validateSpeechEvidence(a.evidence,id):null;
      return {id:a.id,at:a.at,outcome:a.outcome,confirmation:a.confirmation,hints:a.hints,mode:a.mode,evidence};
    });
    if(entry.dueAt!==null&&!Number.isFinite(Date.parse(entry.dueAt)))throw new Error('复习时间无效');
    const reading=legacy?null:entry.reading===null?null:validateReading(entry.reading,id);
    out.entries[id]={seen:entry.seen,reading,attempts,dueAt:entry.dueAt};
  }
  out.games=raw.games.slice(-100).map(g=>{
    if(!g||!['cloze','sequence','recite','family'].includes(g.type)||!Number.isFinite(Date.parse(g.at))||!Number.isInteger(g.score)||!Number.isInteger(g.total)||g.total<1||g.total>100||g.score<0||g.score>g.total)throw new Error('挑战记录格式无效');
    if(g.type==='family'&&(!Array.isArray(g.players)||g.players.length!==2||g.players.some(p=>!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>16||!Number.isInteger(p.score)||p.score<0||p.score>g.total)))throw new Error('家庭赛参与者记录无效');
    if(g.type!=='family'&&g.players!==null)throw new Error('挑战记录缺少明确的参与者字段');
    return {type:g.type,at:g.at,score:g.score,total:g.total,players:g.type==='family'?g.players.map(p=>({name:p.name,score:p.score})):null};
  });
  if(typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt)))throw new Error('备份缺少有效的创建时间');
  out.createdAt=raw.createdAt;
  out.migration=legacy?{from:1,readingRecordsReclassified:true}:raw.migration??null;
  return out;
}
function validateReading(proof,id){
  if(!proof||!['reading','listening','speech'].includes(proof.method)||!Number.isFinite(Date.parse(proof.completedAt))||!Number.isInteger(proof.totalLines)||proof.totalLines<1||proof.coveredLines!==proof.totalLines||!Number.isFinite(proof.activeMs)||proof.activeMs<0||!Number.isFinite(proof.minimumMs)||proof.minimumMs<0||typeof proof.audioCompleted!=='boolean')throw new Error('阅读完成记录缺少依据');
  if(proof.method==='reading'&&proof.activeMs<proof.minimumMs||proof.method==='listening'&&!proof.audioCompleted)throw new Error('阅读完成条件不足');
  const speechEvidence=proof.method==='speech'?validateSpeechEvidence(proof.speechEvidence,id):null;
  return {method:proof.method,completedAt:proof.completedAt,totalLines:proof.totalLines,coveredLines:proof.coveredLines,activeMs:proof.activeMs,minimumMs:proof.minimumMs,audioCompleted:proof.audioCompleted,speechEvidence};
}
function validateSpeechEvidence(e,id){
  if(!e||e.poemId!==id||e.engine!=='@cf/openai/whisper-large-v3-turbo'||e.status!=='matched'||!e.finalized||!Number.isInteger(e.expectedChars)||e.expectedChars<1||e.matchedUnits!==e.expectedChars||!Number.isInteger(e.matchedChars)||e.matchedChars<0||e.matchedChars>e.expectedChars||e.recognizedChars!==e.expectedChars||!Number.isFinite(e.durationMs)||e.durationMs<Math.max(1000,e.expectedChars*90))throw new Error('语音核对记录缺少完整依据');
  let heading=null;
  if(e.heading!==undefined&&e.heading!==null){
    if(!e.heading.requirements||!e.heading.matched||HEADING_FIELDS.some(({key})=>typeof e.heading.requirements[key]!=='boolean'))throw new Error('背诵信息核对依据缺失');
    const requirements=headingRequirements(e.heading.requirements,{strict:true}),matched={};
    for(const {key} of HEADING_FIELDS){if(requirements[key]&&e.heading.matched?.[key]!==true)throw new Error('所选诗名、朝代或作者尚未核对通过');matched[key]=requirements[key]?true:null;}
    heading={requirements,matched};
  }
  return {poemId:id,engine:e.engine,status:e.status,finalized:true,expectedChars:e.expectedChars,matchedChars:e.matchedChars,matchedUnits:e.matchedUnits,recognizedChars:e.recognizedChars,matchBasis:e.matchBasis||'characters',durationMs:Math.round(e.durationMs),confidence:Number.isFinite(e.confidence)?e.confidence:null,heading};
}
export function markSeen(data,id){if(!data.entries[id])data.entries[id]={seen:true,reading:null,attempts:[],dueAt:null};else data.entries[id].seen=true;}
export function completeReading(data,id,proof,at=new Date().toISOString()){
  const checked=validateReading({...proof,completedAt:at},id);markSeen(data,id);data.entries[id].reading=checked;return checked;
}
export function recordAttempt(data,id,{outcome,confirmation='self',hints=0,mode='practice',at=new Date().toISOString(),evidence=null}){
  markSeen(data,id);
  if(hints>0&&outcome==='independent')outcome='hinted';
  const entry=data.entries[id];
  const checkedEvidence=confirmation==='speech'?validateSpeechEvidence(evidence,id):null;
  const attempt={id:globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`,at,outcome,confirmation,hints,mode,evidence:checkedEvidence};
  entry.attempts.push(attempt);entry.attempts=entry.attempts.slice(-500);
  const daily=new Map();for(const a of [...entry.attempts].reverse()){const day=localDay(a.at);if(!daily.has(day))daily.set(day,a);}
  let streak=0;for(const a of daily.values()){if(a.outcome!=='independent')break;streak++;}
  entry.dueAt=nextDue(at,outcome==='independent'?[1,3,7,14,30][Math.min(streak-1,4)]:1);
  return attempt;
}
export function summary(data,poems,now=new Date()){
  const learned=[],independent=[],remembered=[],due=[];
  for(const p of poems){if(p.archived)continue;const e=data.entries[p.id];if(!e)continue;if(e.reading?.completedAt)learned.push(p);
    const successes=e.attempts.filter(a=>a.outcome==='independent').sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    if(successes.length){independent.push(p);if(successes.some(a=>localDay(a.at)!==localDay(successes[0].at)))remembered.push(p);}
    if(e.dueAt&&new Date(e.dueAt)<=now)due.push(p);
  }
  const unique=list=>[...new Map(list.map(p=>[p.workId||p.id,p])).values()];return {learned:unique(learned),independent:unique(independent),remembered:unique(remembered),due};
}
export function recordGame(data,type,score,total,players=null){data.games.push({type,score,total,players,at:new Date().toISOString()});data.games=data.games.slice(-100);}
export function bestScore(data,type,total){return Math.max(0,...data.games.filter(g=>g.type===type&&g.total===total).map(g=>g.score));}
export function shuffled(items,rng=Math.random){const arr=[...items];for(let i=arr.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
export function makeCloze(poems,count=5,rng=Math.random){
  const pairs=p=>p.lines.map((line,index)=>({line,index})).filter(({line,index})=>index<p.lines.length-1&&line.length<=12&&p.lines[index+1].length<=12);
  const eligible=poems.filter(p=>pairs(p).length);if(!eligible.length)return [];
  const pool=shuffled(eligible,rng);const questions=[];
  for(let n=0;n<count;n++){
    const poem=pool[n%pool.length],choices=pairs(poem),index=choices[Math.floor(rng()*choices.length)].index,answer=poem.lines[index+1];
    const other=[...new Set(poems.flatMap(p=>p.lines).filter(l=>l!==answer&&l.length<=12))];
    if(other.length<3)return [];
    const sameLength=other.filter(l=>l.length===answer.length),rest=other.filter(l=>l.length!==answer.length);
    const distractors=shuffled(sameLength,rng).concat(shuffled(rest,rng)).slice(0,3);
    questions.push({poemId:poem.id,title:poem.title,author:poem.author,prompt:poem.lines[index],answer,options:shuffled([answer,...distractors],rng)});
  }return questions;
}
