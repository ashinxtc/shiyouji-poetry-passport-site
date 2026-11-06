import {targetPoems,mastered,poemCurriculumLabel,profileGradeLabel} from './curriculum.js?v=47';

export const MAIN_TABS=[['passport','book','首页'],['library','compass','选诗'],['challenge','trophy','挑战'],['stamps','seal','我的']];
export const rootTab=(route,readerFrom='library')=>route==='practice'?(MAIN_TABS.some(([r])=>r===readerFrom)?readerFrom:'library'):route;
export function readingPageTarget({direction,atArt=false,hasArt=false,index=0,count=1}){
  if(atArt)return direction>0?{art:false,index:0}:null;
  if(direction<0&&index===0&&hasArt)return {art:true,index:0};
  const next=index+direction;return next>=0&&next<count?{art:false,index:next}:null;
}
export function homeLearningTarget(data,poems,outline,due=[],lastPoemId=null){
  const active=poems.filter(p=>!p.archived),review=due.find(p=>active.some(x=>x.id===p.id));
  if(review)return {poem:review,label:'到时间复习了',reason:'再独立背一次，看看还记得多少。',recite:true,action:'开始复习'};
  const last=active.find(p=>p.id===lastPoemId);
  if(last&&!mastered(data,last))return {poem:last,label:'继续上次',reason:'接着学习你上次打开的这首诗。',recite:!!data.entries[last.id]?.reading?.completedAt,action:'继续学习'};
  const list=targetPoems(data.profile,active,outline),poem=list.find(p=>!mastered(data,p))||list[0]||active[0];
  return {poem,label:list.length?(data.profile.grade?'年级推荐':'学段推荐'):'诗词推荐',reason:list.length?poemCurriculumLabel(poem,data.profile,outline):'从书库中选一首开始。',recite:mastered(data,poem)||!!data.entries[poem.id]?.reading?.completedAt,action:mastered(data,poem)?'再背一遍':'开始学习'};
}
export function navigationHash(route,poemId=null){return route==='practice'?'#poem/'+encodeURIComponent(poemId):({passport:'#home',library:'#library',challenge:'#challenge',stamps:'#mine'}[route]||'#home');}
export function locationRoute(hash,poemIds){
  const route={'#home':'passport','#passport':'passport','#library':'library','#challenge':'challenge','#mine':'stamps','#stamps':'stamps'}[hash];
  if(route)return {route,poemId:null};
  if(hash.startsWith('#poem/')){try{const id=decodeURIComponent(hash.slice(6));if(poemIds.includes(id))return {route:'practice',poemId:id};}catch{/* An invalid link falls back to the learning home. */}}
  return null;
}
