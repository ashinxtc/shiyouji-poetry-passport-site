import {GRADE_NAMES,STAGE_NAMES,stageForGrade} from './grades.js?v=69';
export {GRADE_NAMES,STAGE_NAMES,stageForGrade};
export const profileGradeLabel=profile=>GRADE_NAMES[profile.grade]||STAGE_NAMES[profile.stage];
export function gradeOptions(profile,escape){return `<option value="" ${profile.grade===null||profile.grade===undefined?'selected':''}>${STAGE_NAMES[profile.stage]} · 尚未选具体年级</option>`+Object.entries(GRADE_NAMES).map(([g,label])=>`<option value="${g}" ${profile.grade===Number(g)?'selected':''}>${escape(label)}</option>`).join('');}
export function targetAssignments(profile,outline){const grades=profile.grade?[profile.grade]:outline.stages[profile.stage].grades;return outline.assignments.filter(a=>grades.includes(a.grade));}
export function targetPoems(profile,poems,outline){const ids=[...new Set(targetAssignments(profile,outline).map(a=>a.poemId).filter(Boolean))],byId=new Map(poems.map(p=>[p.id,p]));return ids.map(id=>byId.get(id)).filter(Boolean);}
export function mastered(data,p){return [p.id,...(p.workId?[p.workId]:[])].some(id=>data.entries[id]?.attempts.some(a=>a.outcome==='independent'));}
export function curriculumProgress(data,poems,outline){const list=targetPoems(data.profile,poems,outline);return {total:list.length,known:list.filter(p=>mastered(data,p)).length,missing:targetAssignments(data.profile,outline).filter(a=>a.poemId===null)};}
export function recommendation(data,poems,outline,due=[]){if(due.length)return due[0];const list=targetPoems(data.profile,poems,outline);return list.find(p=>!mastered(data,p))||list[0]||null;}
export function poemCurriculumLabel(p,profile,outline){const a=targetAssignments(profile,outline).find(a=>a.poemId===p.id);if(a)return `${GRADE_NAMES[a.grade]}${a.term} · ${a.section}${p.recitationScope?' · '+p.recitationScope:''}`;const junior=profile.stage==='junior',c=(junior?outline.juniorItems||[]:outline.items).find(i=>i.poemId===p.id);return c?(junior?'初中':'小学')+'课标推荐 · 第 '+c.number+' 篇':'诗词拓展';}

export function standardItems(profile,outline){return profile.stage==='junior'?(outline.juniorItems||[]):outline.items;}
export function standardPoetry(profile,outline){return standardItems(profile,outline).filter(item=>item.kind!=='prose');}
