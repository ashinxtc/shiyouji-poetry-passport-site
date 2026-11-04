import {initialData,validateData,STORAGE_KEY,LEGACY_STORAGE_KEY,summary,markSeen,completeReading,recordAttempt,recordGame,bestScore,shuffled,makeCloze,localDay} from './store.js?v=30';
import {icon,landscape,emblem,poemArtwork,artworkImage,illustrationFor,POEM_ILLUSTRATIONS} from './art.js?v=30';
import {MAIN_TABS,rootTab,readingPageTarget,homeLearningTarget,navigationHash,locationRoute} from './navigation.js?v=30';
import {applyPinyinCatalog,hasPinyin,pinyinState} from './pinyin.js?v=30';
import {BookMotion} from './book.js?v=30';
import {PassportEffects} from './effects.js?v=30';
import {versePages,listPageSize,stampPageSize} from './pagination.js?v=30';

import {ReadingTracker} from './reading.js?v=30';
import {VoiceUI,speechCorrectionDetails} from './voice-ui.js?v=30';
import {headingLabels,headingRequirements} from './recitation-options.js?v=30';
import {PoetryAccounts,INDEX_KEY,CODES_KEY,PREFIX} from './accounts.js?v=30';
import {accountPanel,profileRows,deletedRows} from './account-ui.js?v=30';
import {GRADE_NAMES,STAGE_NAMES,stageForGrade,profileGradeLabel,gradeOptions,targetPoems,targetAssignments,curriculumProgress,recommendation,mastered,poemCurriculumLabel,standardItems,standardPoetry} from './curriculum.js?v=30';

const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=$('#main'),dialog=$('#app-dialog');
const levelNames=STAGE_NAMES;
let curriculum=null,pinyinCatalog=null,pinyinLoadError=null;
const outcomeNames={independent:'独立背出',hinted:'提醒后背出',learning:'继续练习'};
let poems=[],data=initialData(),invalidRaw=null,storageFailed=false,toastTimer=null,speaking=false;
let accounts=null,accountsError=null,dataContext=null,dataBaseline=null,accountRenderPending=false,accountOperation=false;
let navigationReady=false,navigationEntry=null,pendingHistory=null,pendingChallengeBack=null,restoringHistory=false,entryNavigation=null;
const ui={opened:false,route:'passport',readerFrom:'library',returnKey:null,lastPoemId:null,poemId:null,reading:'read',artPage:false,hint:'none',revealed:new Set(),hints:0,filter:'适合我',search:'',game:null,busy:false,stampFilter:'poems',versePage:0,gameVersePage:0,listPage:0,collectionPage:0,resultPage:0,suppressClickUntil:0};
const motion=new BookMotion(()=>data.settings.motion);
const effects=new PassportEffects(()=>data.settings.motion);
const player=new Audio();player.preload='none';player.id='poem-audio';player.hidden=true;document.body.append(player);
function audioButton(){const b=$('[data-action="speak"]');if(b){b.innerHTML=icon('sound',14)+(speaking?'停止':'朗读');b.setAttribute('aria-pressed',String(speaking));}}
player.addEventListener('ended',()=>{if(player.dataset.poemId)readingTracker.audioEnded(player.dataset.poemId);speaking=false;audioButton();updateReadingAction();});
player.addEventListener('error',()=>{if(player.getAttribute('src')){speaking=false;audioButton();say('朗读暂时没加载好，联网后点一下重试。');}});
const readingTracker=new ReadingTracker();
let speechVariants={},speechPhonetics={},speechHeadings={},manualVoiceContext=null;
const voiceUI=new VoiceUI({dialog,icon,escape,showDialog,onConfirmed:saveVoiceConfirmation,onManual:manualVoiceReview,speechMode:()=>data.settings.speechMode,variants:()=>speechVariants,phonetics:()=>speechPhonetics,headings:()=>speechHeadings,requirements:()=>data.settings.recitationHeading,onRequirementsChange:(requirements,flow)=>{if((accounts?.context()??null)!==flow.accountContext)return;data.settings.recitationHeading=headingRequirements(requirements);persist();}});
const currentPoem=()=>{const p=poems.find(p=>p.id===ui.poemId)||poems[0];return p.archived?poems.find(x=>x.id===p.replacementId)||poems[0]:p;};
const stats=()=>summary(data,poems);
const recentSuccess=p=>[...(data.entries[p.id]?.attempts||[])].reverse().find(a=>a.outcome==='independent');
const totalIndependent=()=>stats().independent.length;
function say(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);}
function announce(message){$('#live-region').textContent=message;}
function persist(){
  if(invalidRaw!==null){say('旧记录已保留，请先在设置中处理备份。');return false;}
  try{if(accounts){const saved=accounts.saveCurrent(data,dataContext,dataBaseline);data=saved.data;dataBaseline=structuredClone(data);}localStorage.setItem(STORAGE_KEY,JSON.stringify(data));storageFailed=false;$('#save-status').textContent=accounts?.code()?'进度已保存在本机，正在同步':'进度已保存在这台设备';return true;}
  catch{storageFailed=true;$('#save-status').textContent='保存失败，请导出备份';say('本次未能写入设备，请在设置里导出备份。');return false;}
}
function navSnapshot(){return {app:'shiyouji-navigation-v1',context:dataContext,opened:ui.opened,route:ui.route,poemId:ui.poemId,readerFrom:ui.readerFrom,returnKey:ui.returnKey,lastPoemId:ui.lastPoemId,artPage:ui.artPage,versePage:ui.versePage,filter:ui.filter,search:ui.search,category:ui.category||'',listPage:ui.listPage,collectionPage:ui.collectionPage,stampFilter:ui.stampFilter};}
function recordNavigation(push=false){
  if(!navigationReady)return;
  const old=history.state?.poetryNav,entry={...navSnapshot(),key:push?crypto.randomUUID():old?.key||crypto.randomUUID(),position:push?(navigationEntry?.position||0)+1:old?.position||0};
  history[push?'pushState':'replaceState']({poetryNav:entry},'',navigationHash(ui.route,ui.poemId));navigationEntry=entry;
}
function refreshNavigation(){const old=history.state?.poetryNav;if(navigationReady&&!old?.overlay&&old?.context===dataContext&&old.route===ui.route&&(ui.route!=='practice'||old.poemId===ui.poemId))recordNavigation(false);}
function saveSession(){try{sessionStorage.setItem('shiyouji.session',JSON.stringify(navSnapshot()));}catch{/* Learning records have their own explicit save path. */}refreshNavigation();}
function restoreNavigation(entry){
  stopSpeech();if(voiceUI.flow)voiceUI.close();if(dialog.open)closeDialog();resetPractice();
  const valid=entry?.app==='shiyouji-navigation-v1'&&entry.context===dataContext;
  if(valid){
    ui.route=MAIN_TABS.some(([r])=>r===entry.route)||entry.route==='practice'?entry.route:'passport';
    if(entry.poemId&&poems.some(p=>p.id===entry.poemId&&!p.archived))ui.poemId=entry.poemId;else if(ui.route==='practice')ui.route='library';
    ui.readerFrom=rootTab('practice',entry.readerFrom);ui.returnKey=entry.returnKey||null;ui.lastPoemId=ui.route==='practice'?ui.poemId:ui.lastPoemId||entry.lastPoemId||null;ui.artPage=!!entry.artPage;ui.versePage=Math.max(0,entry.versePage||0);
    ui.filter=['全部','适合我','课标75篇','唐诗三百首','读完的','会背的','待复习'].includes(entry.filter)?entry.filter:'适合我';ui.search=String(entry.search||'').slice(0,40);ui.category=entry.category||'';ui.listPage=Math.max(0,entry.listPage||0);ui.collectionPage=Math.max(0,entry.collectionPage||0);ui.stampFilter=entry.stampFilter==='badges'?'badges':'poems';
  }else{ui.route='passport';ui.lastPoemId=null;ui.readerFrom='library';ui.returnKey=null;}
  ui.opened=valid?entry.opened!==false||ui.route!=='passport':true;if(ui.route!=='challenge')ui.game=null;recordNavigation(false);render();
}
function backFromPoem(){if(history.state?.poetryNav?.returnKey){history.back();return;}void navigate(ui.readerFrom,{replace:true});}
window.addEventListener('popstate',event=>{
  if(restoringHistory){restoringHistory=false;return;}
  const entry=event.state?.poetryNav;if(!entry)return;
  if(navigationEntry?.overlay&&entry.key===navigationEntry.overlayBase?.key&&entry.context===dataContext){if(voiceUI.flow)voiceUI.close();closeDialog();navigationEntry=entry;recordNavigation(false);return;}
  if(entry.overlay){navigationEntry={...entry.overlayBase,position:entry.position};history.replaceState({poetryNav:navigationEntry},'',navigationHash(navigationEntry.route,navigationEntry.poemId));return;}
  if(entry.context===dataContext&&entry.key===navigationEntry?.key&&entry.position!==navigationEntry.position){const direction=entry.position>navigationEntry.position?1:-1;navigationEntry=entry;history.go(direction);return;}

  if(ui.game&&!ui.game.done&&entry.route!=='challenge'){
    pendingChallengeBack=entry;const delta=(navigationEntry?.position||0)-(entry.position||0);if(delta){restoringHistory=true;history.go(delta);}
    showDialog('先离开这场挑战？','已保存的学习记录会保留，未结束的这场挑战不会计入成绩。','<div class="dialog-actions"><button class="button" data-action="cancel-history-back">继续挑战</button><button class="button primary" data-action="confirm-history-back">结束并返回</button></div>',{history:false});return;
  }
  if(ui.busy){pendingHistory=entry;return;}restoreNavigation(entry);
});
window.addEventListener('hashchange',()=>{
  if(!navigationReady||restoringHistory||pendingHistory||location.hash===navigationHash(ui.route,ui.poemId))return;
  const linked=locationRoute(location.hash,poems.filter(p=>!p.archived).map(p=>p.id));if(!linked)return;
  if(ui.game&&!ui.game.done){recordNavigation(false);say('请先完成或结束当前挑战。');return;}
  const entry={...navSnapshot(),...linked,poemId:linked.poemId||ui.poemId,opened:true,readerFrom:rootTab(ui.route,ui.readerFrom),returnKey:linked.route==='practice'?navigationEntry?.key||null:null,key:crypto.randomUUID(),position:(navigationEntry?.position||0)+1};
  history.replaceState({poetryNav:entry},'',location.hash);if(ui.busy)pendingHistory=entry;else restoreNavigation(entry);
});
function stopSpeech(){player.pause();player.removeAttribute('src');player.load();speaking=false;audioButton();}
function sound(kind='page'){
  if(!data.settings.sound)return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const ctx=new Audio(),o=ctx.createOscillator(),gain=ctx.createGain();o.connect(gain);gain.connect(ctx.destination);o.type=kind==='stamp'?'sine':'triangle';o.frequency.setValueAtTime(kind==='stamp'?240:540,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='stamp'?90:260,ctx.currentTime+.12);gain.gain.setValueAtTime(.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.16);o.start();o.stop(ctx.currentTime+.18);o.onended=()=>ctx.close();}catch{/* Sound is optional; visual feedback remains available. */}
}
function updateChrome(){
  $('#header-name').textContent=data.profile.name;$('#profile-initial').textContent=[...data.profile.name][0]||'诗';
  $('#context-label').textContent=!ui.opened?'我的护照':{passport:'学习首页',library:'选诗',practice:'读诗 · 背诗',challenge:'背诵挑战',stamps:'我的护照'}[ui.route]||'我的护照';
  document.body.classList.toggle('reduce-motion',!data.settings.motion);
  const route=rootTab(ui.route,ui.readerFrom);
  const back=$('#reader-back');back.hidden=ui.route!=='practice';back.innerHTML=icon('left',18)+'返回'+(MAIN_TABS.find(([r])=>r===ui.readerFrom)?.[2]||'选诗');back.setAttribute('aria-label',back.textContent);$('.brand').hidden=ui.route==='practice';
  $('#main-nav').innerHTML=MAIN_TABS.map(([r,i,label])=>`<button class="nav-item ${r===route?'active':''}" data-route="${r}" ${r===route?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');
}
function recommended(){return recommendation(data,poems,curriculum,stats().due)||poems[0];}
function confirmationLabel(value){return value==='speech'?'语音核对':value==='family'?'家人确认':'自行记录';}
function collectionProgress(count){return `<span class="collection-progress" role="img" aria-label="书库 ${new Set(poems.filter(p=>!p.archived).map(p=>p.workId||p.id)).size} 篇（含教材节选），已独立背出 ${count} 首"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="track" cx="12" cy="12" r="9" stroke-width="2"/><circle class="value" cx="12" cy="12" r="9" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-count/new Set(poems.filter(p=>!p.archived).map(p=>p.workId||p.id)).size}"/></svg><span aria-hidden="true">${count} / ${new Set(poems.filter(p=>!p.archived).map(p=>p.workId||p.id)).size}</span></span>`;}
function statMarkup(){const s=stats();return `<div class="stat-triplet"><div><strong>${s.learned.length}</strong><span>完成阅读</span></div><div><strong>${s.independent.length}</strong><span>独立背出</span></div><div><strong>${s.remembered.length}</strong><span>隔天仍记得</span></div></div>`;}
function stampMarkup(p,{large=false,fresh=false,pending=false}={}){
  const a=recentSuccess(p),date=a?localDay(a.at).replaceAll('-','.'):'等待你的足迹';
  return `<div class="stamp ${large?'large':''} ${fresh?'is-new':''} ${pending?'pending':''}"><span class="stamp-sub">${escape(p.title)}</span><span class="stamp-title">${pending?'尚待启程':'独立背出'}</span><span class="stamp-date">${date}</span></div>`;
}
function coverStatus(s=stats()){return `<span><strong>${s.independent.length}</strong>首独立背出</span><span><strong>${s.remembered.length}</strong>首隔天记得</span><span><strong>${new Set(poems.filter(p=>!p.archived).map(p=>p.workId||p.id)).size}</strong>篇等你探索</span>`;}
function coverView(){const s=stats();return `<section class="cover-view view-enter" aria-label="我的护照封面"><div class="cover-intro"><p>把读完的风景，变成记得的诗。</p></div><div class="cover-desk"><div class="passport-object" id="passport-object"><div class="passport-cover"><h1 class="cover-title">诗游记</h1><div class="cover-subtitle">我的诗词护照</div>${emblem()}<div class="cover-owner">${escape(data.profile.name)}的诗词旅程</div><button class="open-passport" data-action="open">翻开我的护照</button></div></div></div><p class="cover-caption">每背会一首，就留下一个印记。</p><div class="cover-status">${coverStatus(s)}</div></section>`;}
function leftIdentity(){const s=stats(),last=[...s.independent].sort((a,b)=>new Date(recentSuccess(b).at)-new Date(recentSuccess(a).at))[0];return `<div class="eyebrow">诗词旅人 · 个人页</div><h2 class="section-title">属于我的，<br>一程又一程。</h2><div class="identity-row"><div class="identity-avatar">${escape([...data.profile.name][0])}</div><div><div class="identity-name">${escape(data.profile.name)}</div><p class="small">${profileGradeLabel(data.profile)}</p></div></div>${statMarkup()}<p class="note">“独立背出”按当前版本核对，节选单独标注，同一作品不重复计数。<br>“隔天仍记得”来自之后日期的再次独立背诵。</p>${last?`<div class="last-stamp"><div class="mini-seal">记</div><div><div class="small">最近背出 · ${escape(last.title)}</div><div class="note">${localDay(recentSuccess(last).at)} · ${confirmationLabel(recentSuccess(last).confirmation)}</div></div></div>`:`<div class="guide-label">第一枚印章，等你留下。</div>`}<div class="passport-serial">SHI YOU JI · 诗游记</div>`;}
function leftScene(title,subtitle,theme='山河',extra='',poem=null){return `<div class="eyebrow">${escape(subtitle)}</div><h2 class="section-title">${title}</h2>${poem?poemArtwork(poem):landscape(theme)}${extra||'<p class="poetic-caption">山河很远，<br>诗句就在心里。</p>'}`;}
function homeRight(){
  const s=stats(),pick=homeLearningTarget(data,poems,curriculum,s.due,ui.lastPoemId),p=pick.poem;
  return `<section class="home-page"><p class="home-greeting caption-5">你好，<strong>${escape(data.profile.name)}</strong></p><div class="home-welcome"><h2>今天学什么</h2><button class="text-button" data-action="choose-grade">${data.profile.grade?profileGradeLabel(data.profile)+' · 更改':'选择年级'}</button></div>${statMarkup()}<div class="home-ticket"><div class="home-reason"><span class="eyebrow">${pick.label}</span><p class="caption-5">${escape(pick.reason)}</p></div><div><h3 class="ticket-title">${escape(p.title)}</h3><p class="ticket-author">${p.dynasty} · ${escape(p.author)}</p></div>${poemArtwork(p,'small-art')}<button class="button primary full" data-action="poem" data-id="${p.id}" data-recite="${pick.recite}">${pick.action}${icon('right',14)}</button></div><div class="home-bottom"><button class="button" data-action="browse-grade">${icon('compass',16)}按年级选诗</button><button class="button" data-action="review" ${s.due.length?'':'disabled'}>${icon('refresh',16)}复习 ${s.due.length} 首</button></div></section>`;
}
function libraryRight(){
  const categories=[...new Set(poems.map(p=>p.category))];
  return `<section class="library-page"><div class="library-heading"><h2>选诗</h2><button class="text-button" data-action="choose-grade">${profileGradeLabel(data.profile)} · ${data.profile.grade?'更改年级':'选择年级'}</button></div><div class="search-field">${icon('search',17)}<input id="poem-search" type="search" maxlength="40" value="${escape(ui.search)}" placeholder="找诗名、诗人或诗句" aria-label="搜索诗名、诗人或诗句"></div><div class="library-filters"><select id="poem-status-filter" aria-label="按学习情况筛选">${['全部','适合我','课标75篇','唐诗三百首','读完的','会背的','待复习'].map(f=>`<option value="${f}" ${ui.filter===f?'selected':''}>${f==='适合我'?f+' · '+profileGradeLabel(data.profile):f==='课标75篇'?(data.profile.stage==='junior'?'初中课标诗词40首':'小学课标75篇'):f}</option>`).join('')}</select><select id="poem-category-filter" aria-label="按诗体筛选"><option value="">全部诗体</option>${categories.map(c=>`<option value="${escape(c)}" ${ui.category===c?'selected':''}>${escape(c)}</option>`).join('')}</select></div><div id="poem-results">${poemResults()}</div></section>`;
}
function filteredPoems(){const s=stats(),source=ui.filter==='适合我'?targetPoems(data.profile,poems,curriculum):poems.filter(p=>!p.archived);return source.filter(p=>!p.archived).filter(p=>{const e=data.entries[p.id],f=ui.filter;return (f==='全部'||f==='适合我'&&targetPoems(data.profile,poems,curriculum).some(x=>x.id===p.id)||f==='课标75篇'&&standardPoetry(data.profile,curriculum).some(x=>x.poemId===p.id)||f==='唐诗三百首'&&p.sourceIndex!==null||f==='读完的'&&!!e?.reading?.completedAt||f==='会背的'&&!!recentSuccess(p)||f==='待复习'&&s.due.some(x=>x.id===p.id))&&(!ui.category||p.category===ui.category)&&(!ui.search||[p.title,p.alternateTitle,p.author,...p.lines].join('').includes(ui.search.trim()));}).sort((a,b)=>{const q=ui.search.trim();if(!q)return 0;const rank=p=>p.title===q?0:p.alternateTitle===q?1:2;return rank(a)-rank(b);});}
function poemResults(){
  const results=filteredPoems(),size=listPageSize(sheetMetrics().height),count=Math.max(1,Math.ceil(results.length/size));ui.listPage=Math.min(ui.listPage,count-1);
  const start=ui.listPage*size,visible=results.slice(start,start+size);
  return `<p class="list-count">${ui.filter==='适合我'?`对应篇目会背 ${curriculumProgress(data,poems,curriculum).known}/${curriculumProgress(data,poems,curriculum).total} · `:''}${results.length} 篇 · 第 ${ui.listPage+1} / ${count} 页</p>${visible.length?`<ul class="poem-list">${visible.map((p,i)=>`<li><button class="poem-row" data-action="poem" data-id="${p.id}" aria-label="${escape(p.title)}，${escape(p.author)}"><span class="row-index">${String(start+i+1).padStart(2,'0')}</span><span class="poem-row-text"><span class="poem-row-title">${escape(p.title)}</span><p>${escape(p.author)} · ${escape(p.lines[0])}</p></span>${recentSuccess(p)?'<span class="pill success">会背了</span>':data.entries[p.id]?.reading?.completedAt?'<span class="pill">已读完</span>':data.entries[p.id]?.seen?'<span class="pill">浏览过</span>':''}${icon('right')}</button></li>`).join('')}</ul>`:`<div class="empty-state">${icon('compass',28)}<h3>没有找到这首诗</h3><p class="small">换个关键词或分类再看看。</p></div>`}`;
}
function poemText(p,{mode=ui.reading,hint=ui.hint,revealed=ui.revealed,game=false}={}){
  const reading=mode==='read',pinyin=reading&&data.settings.pinyin&&Array.isArray(p.pinyin),v=verseState(p,game);
  return `<div class="poem-lines ${pinyin?'with-pinyin':''}">${p.lines.slice(v.start,v.end).map((line,local)=>{
    const n=v.start+local,visible=reading||revealed.has(n);
    const content=[...line].map((c,i)=>visible||hint==='first'&&i===0||mode==='keywords'&&(i%2===0||/[，。？！]/.test(c))?escape(c):`<span class="masked-word" aria-hidden="true">${escape(c)}</span>`).join('');
    return `<${reading?'div':'button'} class="poem-line" ${reading?`data-verse-index="${n}"`:`data-verse-index="${n}" data-action="${game?'game-reveal':'reveal'}" data-index="${n}" aria-label="${visible?escape(line):hint==='first'?`第 ${n+1} 句，首字 ${escape(line[0])}，点击揭开`:`第 ${n+1} 句，点击揭开`}"`} ${reading?'': 'type="button"'}>${pinyin?`<span class="py">${escape(p.pinyin[n])}</span>`:''}<span class="verse-text">${content}</span>${!reading&&!visible?icon('eye',13).replace('<svg ','<svg class="hint-eye" '):''}</${reading?'div':'button'}>`;
  }).join('')}</div>`;
}
async function loadPinyin(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{const r=await fetch('./pinyin.json?v=30',{signal:controller.signal});if(!r.ok)throw new Error('拼音资料暂未加载');const catalog=await r.json();poems=applyPinyinCatalog(poems,catalog);pinyinCatalog=catalog;pinyinLoadError=null;return true;}
  catch{pinyinLoadError='拼音资料暂未加载，联网后可以重试。';return false;}
  finally{clearTimeout(timer);}
}
function pinyinButton(p,scene=false){
  const state=pinyinState(p,{reading:ui.reading==='read',scene,enabled:data.settings.pinyin,error:pinyinLoadError});
  if(!state.visible)return '';
  const name=state.available?(state.shown?'隐藏拼音':'显示拼音'):pinyinLoadError?'重试拼音资料':'拼音待补';
  return `<button class="toggle-chip pinyin-control ${state.available?'':'pinyin-pending'}" data-action="${state.action}" data-id="${p.id}" aria-label="${name}" ${state.available?`aria-pressed="${state.shown}"`:''} title="${name}">拼音</button>`;
}
function pinyinInfo(id){
  const p=poems.find(x=>x.id===id)||currentPoem(),available=hasPinyin(p),note=p.pinyinReview?.note,links=p.pinyinReview?.sources||[];
  showDialog(available?'拼音说明':pinyinLoadError?'拼音资料暂未加载':'这首诗的拼音待补',available?'拼音帮助认字；背诵时会随正文一起隐藏。':pinyinLoadError||'这首诗的拼音尚未核对，暂不自动注音。',`<p class="body-6">${available?escape(pinyinCatalog?.policy||'辅助注音中的一、不采用本调；异读请以学校课本为准。'):'已有拼音的诗仍可正常使用。'}${note?'<br>'+escape(note):''}</p>${links.length?`<p class="caption-5">读音参考：${links.map((url,i)=>`<a href="${escape(url)}" target="_blank" rel="noopener">参考 ${i+1}</a>`).join(' · ')}</p>`:''}${pinyinLoadError?'<button class="button primary full" data-action="retry-pinyin">重新加载拼音资料</button>':'<button class="button full" data-action="dialog-close">知道了</button>'}`);
}
function practiceRight(){
  const p=currentPoem(),reading=ui.reading==='read',reciting=ui.reading==='recite',v=verseState(p);
  if(artPageActive(p))return sceneRight(p);
  return `<section class="practice-page" data-poem-id="${p.id}"><div class="poem-topline"><div class="reading-step" role="navigation" aria-label="学习阶段"><button class="reading-step-button ${reading?'active':''}" data-action="read-again" ${reading?'disabled aria-current="step"':''}>读诗</button><i></i><button class="reading-step-button ${!reading&&!reciting?'active':''}" data-action="practice-options">练习</button><i></i><button class="reading-step-button ${reciting?'active':''}" data-action="start-reciting" ${reciting?'disabled aria-current="step"':''}>背诵</button></div><div class="inline-actions">${reading&&p.audio?`<button class="toggle-chip" data-action="speak" aria-label="${speaking?'停止朗读':'播放朗读'}" aria-pressed="${speaking}">${icon('sound',16)}${speaking?'停止':'听读'}</button>`:''}${reading?pinyinButton(p):''}<button class="toggle-chip" data-action="poem-details" data-id="${p.id}" aria-label="诗境、来源与记录">···</button></div></div>${poemHeading(p)}${poemText(p)}<div class="practice-controls">${reading?`<div class="inline-actions"><button class="button small" data-action="practice-options">提示练习</button><button class="button small" data-route="library">选另一首</button></div><div id="reading-primary">${readingAction(p,v)}</div>`:`<div class="inline-actions"><button class="button small" data-action="read-again">再读一遍</button>${reciting?`<button class="button small" data-action="first-hint" ${ui.hint==='first'?'disabled':''}>首字提示</button>`:`<button class="button small" data-action="start-reciting">全文藏起</button>`}</div>${reciting?`<button class="button primary full" data-action="voice-start">${icon('microphone',20)}录音背诵并自动判定</button><button class="text-button manual-entry" data-action="finish-reciting">家人听背（备用）</button>`:''}`}</div><p class="practice-status" id="reading-progress">${reciting?`本次提示 ${ui.hints} 次 · 录音结束后核对${p.workId?'本节选':'整首'}`:reading?readingStatus(p):'点一下诗句，可以揭开提示。'}</p>${v.pages.length>1?`<p class="page-range">${p.workId?'本节选':'全诗'} ${p.lines.length} 句 · 本页第 ${v.start+1}–${v.end} 句</p>`:''}</section>`;
}
function hasArtPage(p){return innerWidth<=850&&!!illustrationFor(p.id);}
function artPageActive(p){return ui.reading==='read'&&ui.artPage&&hasArtPage(p);}
function sceneRight(p){
  const item=illustrationFor(p.id);
  return `<section class="poem-scene-page" data-poem-id="${p.id}"><div class="poem-topline"><div class="reading-step" role="navigation" aria-label="学习阶段"><span class="scene-current">诗境</span><i></i><button class="reading-step-button" data-action="art-to-text">读诗</button><i></i><button class="reading-step-button" data-action="start-reciting">背诵</button></div><div class="inline-actions">${p.audio?`<button class="toggle-chip" data-action="speak" aria-label="播放朗读" aria-pressed="${speaking}">${icon('sound',16)}听读</button>`:''}${pinyinButton(p,true)}<button class="toggle-chip" data-action="poem-details" data-id="${p.id}" aria-label="诗境、来源与记录">···</button></div></div>${poemHeading(p)}<figure class="scene-figure"><button class="scene-picture" data-action="view-poem-art" data-id="${p.id}" aria-label="放大《${escape(p.title)}》完整插画">${artworkImage(item,'scene-image','eager')}</button><figcaption class="caption-5">${escape(item.label)}</figcaption></figure><button class="button primary full" data-action="art-to-text">翻页读诗${icon('right',18)}</button><p class="caption-5 scene-swipe-note">左滑，进入正文</p></section>`;
}
function challengeLeft(){return leftScene('让记住的诗，<br>再闪一次光。','挑战馆 · 与自己和家人比一比','山河',`<p class="poetic-caption">抽一枚诗签，<br>看看自己记得多少。</p><div class="best-record"><div><span>接句最佳 · 五题</span><br><strong>${bestScore(data,'cloze',5)} / 5</strong></div><div><span>抽背最佳 · 三首</span><br><strong>${bestScore(data,'recite',3)} / 3</strong></div></div><p class="note">接句、排序记录挑战成绩。<br>整首独立背出，才会获得背诗印章。</p>`);}
function challengeRight(){
  if(ui.game)return gameRight();
  return `<section class="challenge-page"><div class="eyebrow">和自己，也和家人比一比</div><h2 class="section-title">今天，挑战哪一种？</h2><div class="challenge-list">${[['recite','shuffle','抽签背诗','藏起全文，看看自己记得多少。'],['cloze','spark','接下一句','找出你记得的下一句。'],['sequence','book','诗句归位','把四句诗排回原位。'],['family','users','家庭擂台','轮流背诗，邀请家人听背。']].map(([type,i,title,desc])=>`<button class="challenge-tile" data-action="setup-game" data-type="${type}"><span class="challenge-symbol">${icon(i,23)}</span><span><h3>${title}</h3><p>${desc}</p></span></button>`).join('')}</div><button class="text-button" data-action="history">我的挑战记录</button></section>`;
}
function stampsRight(){
  const s=stats(),badges=earnedAchievements(),items=ui.stampFilter==='poems'?s.independent:badges;
  const size=collectionSize(),count=Math.max(1,Math.ceil(items.length/size));ui.collectionPage=Math.min(ui.collectionPage,count-1);
  const visible=items.slice(ui.collectionPage*size,(ui.collectionPage+1)*size);
  return `<section class="collection-page"><div class="my-heading"><h2 class="title-2">${escape(data.profile.name)}的护照</h2><button class="text-button" data-action="profile">设置与同步</button></div>${statMarkup()}<div class="filter-row"><button class="filter-chip ${ui.stampFilter==='poems'?'active':''}" data-action="stamp-filter" data-value="poems">背诗印章 ${s.independent.length}</button><button class="filter-chip ${ui.stampFilter==='badges'?'active':''}" data-action="stamp-filter" data-value="badges">挑战徽章 ${badges.filter(a=>a.earned).length}</button></div>${ui.stampFilter==='poems'?!items.length?`<div class="empty-state">${icon('seal',36)}<h3>第一枚印章，等你留下</h3><p class="small">独立背出一首诗，<br>就会在这里留下印记。</p><button class="button primary" data-route="library">挑一首诗</button></div>`:`<div class="badge-grid">${visible.map(p=>`<button class="stamp-button" data-action="stamp-detail" data-id="${p.id}" aria-label="${escape(p.title)}的背诵记录">${stampMarkup(p)}<span>${escape(p.title)}</span><small>${confirmationLabel(recentSuccess(p).confirmation)}</small></button>`).join('')}</div>`:`<div class="badge-grid">${visible.map(a=>`<div class="stamp-button"><div class="stamp ${a.color} ${a.earned?'':'pending'}"><span class="stamp-sub">${a.earned?'已经获得':'等你点亮'}</span><span class="stamp-title">${a.title}</span><span class="stamp-date">${a.progress}</span></div><span>${a.title}</span><small>${a.description}</small></div>`).join('')}</div>`}</section>`;
}
function earnedAchievements(){const s=stats();return [
  {title:'初次启程',earned:s.independent.length>=1,progress:`${Math.min(s.independent.length,1)} / 1`,description:'独立背出第一首诗',color:'green'},
  {title:'五诗小旅人',earned:s.independent.length>=5,progress:`${Math.min(s.independent.length,5)} / 5`,description:'独立背出五首不同的诗',color:'gold'},
  {title:'记在心里',earned:s.remembered.length>=1,progress:`${Math.min(s.remembered.length,1)} / 1`,description:'隔天再次独立背出',color:'blue'},
  {title:'接句能手',earned:bestScore(data,'cloze',5)===5,progress:`${bestScore(data,'cloze',5)} / 5`,description:'五题接句全部答对',color:'gold'},
  {title:'句句归位',earned:data.games.some(g=>g.type==='sequence'&&g.score===g.total),progress:data.games.some(g=>g.type==='sequence'&&g.score===g.total)?'已完成':'待挑战',description:'完成一次诗句排序',color:'green'},
  {title:'三诗连背',earned:bestScore(data,'recite',3)===3,progress:`${bestScore(data,'recite',3)} / 3`,description:'三首抽背均独立完成',color:'blue'},
];}
function readingStatus(p){const status=readingTracker.status(p.id,p.lines);return data.entries[p.id]?.reading?.completedAt?'已读完，可以试着背诵。':status.ready?'读完了就点“完成阅读”，再试着背诵。':'先读一遍全文，再确认完成。';}
function readingAction(p,v=verseState(p)){
  if(data.entries[p.id]?.reading?.completedAt)return '<button class="button primary full" data-action="start-reciting">开始背诵</button>';
  const s=readingTracker.status(p.id,p.lines);
  if(s.ready)return '<button class="button primary full" data-action="complete-reading">完成阅读</button>';
  if(v.index<v.pages.length-1)return '<button class="button primary full" data-action="page-next">继续读下一页</button>';
  const missingEarlier=s.missing.some(n=>n<v.start);
  return `<button class="button primary full" data-action="${missingEarlier?'return-unread':'complete-reading'}" ${missingEarlier?'':'disabled'}>${missingEarlier?'回去读未读诗句':'读一读，再点完成'}</button>`;
}
function updateReadingAction(){if(ui.route!=='practice'||ui.reading!=='read'||dialog.open)return;const p=currentPoem(),button=$('#reading-primary'),status=$('#reading-progress'),v=verseState(p),r=readingTracker.status(p.id,p.lines),key=JSON.stringify([p.id,!!data.entries[p.id]?.reading,v.index,r.ready,r.missing.some(n=>n<v.start)]);if(button&&button.dataset.readState!==key){button.innerHTML=readingAction(p,v);button.dataset.readState=key;}if(status)status.textContent=readingStatus(p);}
function openVoice(scope='practice'){
  stopSpeech();const game=scope==='game'?ui.game:null;if(game&&(!['recite','family'].includes(game.type)||game.done))return;
  const poem=game?game.deck[game.index]:currentPoem();
  voiceUI.open({poem,purpose:'recite',scope,hints:game?game.hints:ui.hints,game,round:game?.index??null,participant:game?.player??null,accountContext:accounts?.context()??null});
}
function voiceEvidence(flow){const a=flow.analysis;return {poemId:flow.poem.id,engine:flow.engine,status:a.status,finalized:a.finalized,expectedChars:a.expectedChars,recognizedChars:a.recognizedChars,matchedChars:a.matchedChars,matchedUnits:a.matchedUnits,matchBasis:a.matchBasis,durationMs:flow.result.durationMs,confidence:a.confidence,heading:{requirements:a.headingRequirements,matched:a.headingMatched}};}
async function saveVoiceConfirmation(flow){
  if(accounts&&flow.accountContext!==accounts.context()){say('账号已切换，这次录音没有记到其他人的护照里。');return;}
  const p=flow.poem,a=flow.analysis;if(a.status!=='matched')return;const evidence=voiceEvidence(flow);
  const owner=flow.scope!=='game'||flow.game.type!=='family'||flow.participant===0;
  if(flow.scope==='game'&&(ui.game!==flow.game||ui.game.index!==flow.round||ui.game.player!==flow.participant)){say('场次已变化，这段录音未计入其他诗。');return;}
  if(owner)completeReading(data,p.id,{method:'speech',activeMs:flow.result.durationMs,minimumMs:a.minimumMs,totalLines:p.lines.length,coveredLines:p.lines.length,audioCompleted:false,speechEvidence:evidence});
  const outcome=flow.hints?'hinted':'independent';
  if(flow.scope==='game'){await recordGameRecitation(outcome,{confirmation:'speech',evidence});say(outcome==='independent'?'系统判定通过，已自动记分。':'已自动记录为提醒后背出。');return;}
  recordAttempt(data,p.id,{outcome,hints:flow.hints,confirmation:'speech',evidence});const saved=persist();resetPractice();render();sound('stamp');
  const replay=flow.result.blob?URL.createObjectURL(flow.result.blob):null;
  showDialog(saved?(outcome==='independent'?'背诵通过':'提示后背出'):'已通过，保存失败',saved?'系统已自动记录，不需要家长核验。':'本次未写入设备，请到家长设置导出备份。',`${!saved?'<p class="body-6">请先导出备份，保留本次结果。</p>':outcome==='independent'?stampMarkup(p,{large:true,fresh:true}):'<p class="body-6">本次不增加独立背出首数。</p>'}<p class="caption-5 auto-result-count">${outcome==='independent'?`已独立背出 ${totalIndependent()} 首不同的诗`:'已记为提醒后背出，继续练习后可再试独立背诵。'}</p>${replay?`<audio controls src="${replay}" class="voice-replay" aria-label="回听本次录音"></audio>`:''}${speechCorrectionDetails(a,escape)}<div class="dialog-actions"><button class="button" data-action="go-stamps">查看印章</button><button class="button primary" data-action="voice-next-poem">再学一首</button></div>`);
  dialog.classList.add('auto-recitation-result');
  if(replay){const clean=()=>{if(!dialog.open){URL.revokeObjectURL(replay);dialog.removeEventListener('close',clean);}};dialog.addEventListener('close',clean);}
}
function manualVoiceReview(flow){
  if(flow.purpose==='read')return;
  manualVoiceContext={...flow,requirements:flow.requirements??data.settings.recitationHeading,accountContext:accounts?.context()??null};const audio=flow.result?.blob?URL.createObjectURL(flow.result.blob):null;
  showDialog('请家人回听或听背确认','人工确认会单独记录来源，不会标记成语音自动核对通过。',`${audio?`<audio controls src="${audio}" class="voice-replay" aria-label="回听录音"></audio>`:''}<label class="family-confirm"><input id="manual-voice-reviewed" type="checkbox">家人已回听或听背，并核对完整原文${headingLabels(manualVoiceContext.requirements).length?'及'+headingLabels(manualVoiceContext.requirements).join('、'):''}</label><div class="outcome-options">${[['independent','独立背出'],['hinted','提醒后背出'],['learning','继续练习']].map(([value,label])=>`<button class="outcome-button" data-action="voice-manual-save" data-outcome="${value}" disabled>${label}</button>`).join('')}</div>`);
  if(audio){const clean=()=>{if(!dialog.open){URL.revokeObjectURL(audio);dialog.removeEventListener('close',clean);}};dialog.addEventListener('close',clean);}
}
function gameVoiceActions(g,last){return `<div class="game-voice-actions"><button class="button primary full" data-action="game-voice-start">${icon('microphone',20)}录音背诗，自动记分</button><button class="text-button" data-action="game-manual-start">家人听背（备用）</button></div>`;}

function sheetMetrics(){
  const node=$('#right-content'),h=window.visualViewport?.height||innerHeight;
  return {width:node?.clientWidth||Math.max(190,innerWidth<=850?innerWidth-80:Math.min(1080,innerWidth-62)/2-64),height:node?.clientHeight||Math.max(150,h-(innerWidth<=850?185:207))};
}
function verseState(p,game=false){
  const metrics=sheetMetrics(),g=ui.game,reading=game?g?.showing:ui.reading==='read';
  const pages=versePages(p.lines,{...metrics,pinyin:!!(reading&&data.settings.pinyin&&p.pinyin),game,family:game&&g?.type==='family',titleLength:p.title.length});
  const key=game?'gameVersePage':'versePage';ui[key]=Math.max(0,Math.min(ui[key]||0,pages.length-1));
  return {...pages[ui[key]],index:ui[key],pages};
}
function poemHeading(p){return `<div class="poem-heading ${p.title.length>16?'very-long':p.title.length>7?'long':''}"><h2>${escape(p.title)}</h2><p class="poem-meta">${p.dynasty} · ${escape(p.author)}</p></div>`;}
function collectionSize(){return stampPageSize(sheetMetrics().height-76);}
function hasPager(){return ui.route==='practice'||ui.route==='library'||ui.route==='stamps'||ui.route==='challenge'&&ui.game&&(ui.game.done||['recite','family'].includes(ui.game.type));}
function resultPageSize(){return Math.max(2,Math.min(5,Math.floor((sheetMetrics().height-230)/36)));}
function pagerMarkup(){
  let label='左右滑动，翻一页',detail='',previous=true,next=true;
  if(ui.route==='practice'){const p=currentPoem(),v=verseState(p),withArt=ui.reading==='read'&&hasArtPage(p),art=artPageActive(p);label=`${art?1:v.index+1+Number(withArt)} / ${v.pages.length+Number(withArt)} 页`;detail=art?'诗境 · 左滑读诗':`第 ${v.start+1}–${v.end} 句 · ${p.workId?'本节选':'全诗'} ${p.lines.length} 句`;previous=!!readingPageTarget({direction:-1,atArt:art,hasArt:withArt,index:v.index,count:v.pages.length});next=!!readingPageTarget({direction:1,atArt:art,hasArt:withArt,index:v.index,count:v.pages.length});}
  else if(ui.route==='library'){const n=Math.max(1,Math.ceil(filteredPoems().length/listPageSize(sheetMetrics().height)));label=`诗单 ${ui.listPage+1} / ${n} 页`;detail='左右滑动翻页';previous=ui.listPage>0;next=ui.listPage<n-1;}
  else if(ui.route==='stamps'){const a=ui.stampFilter==='poems'?stats().independent:earnedAchievements(),n=Math.max(1,Math.ceil(a.length/collectionSize()));label=`印章 ${ui.collectionPage+1} / ${n} 页`;detail='左右滑动翻页';previous=ui.collectionPage>0;next=ui.collectionPage<n-1;}
  else if(ui.route==='challenge'&&ui.game){const g=ui.game;if(g.done){const n=Math.max(1,Math.ceil(g.answers.length/resultPageSize()));label=`成绩 ${ui.resultPage+1} / ${n} 页`;previous=ui.resultPage>0;next=ui.resultPage<n-1;}else if(['recite','family'].includes(g.type)){const v=verseState(g.deck[g.index],true);label=`${v.index+1} / ${v.pages.length} 页`;detail=`第 ${v.start+1}–${v.end} 句 · 左右滑动`;previous=v.index>0;next=v.index<v.pages.length-1;}else{label=g.type==='cloze'?`第 ${g.index+1} / ${g.total} 题`:'把诗句排回原位';previous=false;next=g.type==='cloze'&&g.choice!==undefined;}}
  else{previous=false;next=false;}
  if(!previous&&!next)return `<div class="pager-info single-page"><strong>${ui.route==='stamps'&&stats().independent.length===0?'暂无背诗印章':label}</strong></div>`;
  return `<button data-action="page-prev" aria-label="上一页" ${previous?'':'disabled'}>${icon('left',18)}上一页</button><div class="pager-info"><strong>${label}</strong><span>${detail}</span></div><button data-action="page-next" aria-label="下一页" ${next?'':'disabled'}>下一页${icon('right',18)}</button>`;
}
function updatePager(){const el=$('#book-pager'),show=!!hasPager();if(el){el.hidden=!show;el.innerHTML=show?pagerMarkup():'';}$('.workbench')?.classList.toggle('without-pager',!show);}

function render(){
  pendingViewportRender=false;
  accountRenderPending=false;
  updateChrome();
  const warning=storageFailed?'<div class="storage-alert" role="alert">进度暂时未能保存，请在家长设置中导出备份。</div>':invalidRaw!==null?'<div class="storage-alert" role="alert">旧记录无法读取，原始内容已保留。请在家长设置中处理备份。</div>':'';
  if(!ui.opened){
    const cover=main.querySelector('.cover-view');
    if(cover){
      // Keep the cover and its button mounted while cloud status changes.
      main.querySelector('.storage-alert')?.remove();if(warning)main.insertAdjacentHTML('afterbegin',warning);
      cover.querySelector('.cover-owner').textContent=data.profile.name+'的诗词旅程';
      cover.querySelector('.cover-status').innerHTML=coverStatus();
    }else{main.innerHTML=warning+coverView();effects.cover(main);}
    saveSession();return;
  }
  let left,right;
  switch(ui.route){
    case 'library':left=leftScene('翻过一页，<br>再见一首诗。','唐诗与教材诗词','山河',`<p class="poetic-caption">${poems.filter(p=>!p.archived).length} 个读背篇目，<br>一页一页慢慢读。</p><div class="rule"></div><p class="note">按诗体或学习情况筛选，<br>也可以搜索诗名、诗人与诗句。</p>`);right=libraryRight();break;
    case 'practice':{const p=currentPoem();left=leftScene(`${escape(p.category||'诗境')}，<br>读进心里。`,p.sourceIndex!==null?'唐诗三百首':'教材诗词选篇',p.theme,`<p class="guide-quote">${escape(p.guide||'先读出声音，再试着记住一句。')}</p>${p.guide?'<p class="guide-label">应用阅读提示</p>':''}`,p);right=practiceRight();break;}
    case 'challenge':left=challengeLeft();right=challengeRight();break;
    case 'stamps':left=leftScene('会背的诗，<br>值得留下印记。','我的收藏','月色',statMarkup());right=stampsRight();break;
    default:left=leftIdentity();right=homeRight();
  }
  const bench=main.querySelector('.workbench');
  if(bench){
    main.querySelector('.storage-alert')?.remove();if(warning)main.insertAdjacentHTML('afterbegin',warning);
    bench.dataset.view=ui.route;
    bench.querySelector('.paper-left > .sheet-content').innerHTML=left;
    bench.querySelector('#right-content').innerHTML=right;
    updatePager();
  }else main.innerHTML=warning+`<section class="workbench ${hasPager()?'':'without-pager'}" data-view="${ui.route}" aria-label="诗词护照"><div class="book-stage"><div id="book-board" class="book-board"><article class="paper-sheet paper-left"><div class="sheet-content">${left}</div></article><article class="paper-sheet paper-right"><div class="sheet-content" id="right-content">${right}</div></article></div></div><div class="book-pager" id="book-pager" ${hasPager()?'':'hidden'}>${hasPager()?pagerMarkup():''}</div></section>`;
  bindSwipe();saveSession();
}
async function transition(change,direction=1){if(ui.busy)return;ui.busy=true;stopSpeech();try{await motion.turn(()=>{change();render();},direction);sound('page');}finally{ui.busy=false;if(pendingHistory){const entry=pendingHistory;pendingHistory=null;restoreNavigation(entry);}else if(pendingViewportRender||accountRenderPending)render();}}
function resetPractice(){ui.reading='read';ui.artPage=false;ui.hint='none';ui.revealed=new Set();ui.hints=0;ui.versePage=0;}
async function navigate(route,{force=false,replace=false}={}){
  if(!dialog.open)discardDialogHistory();
  if(!MAIN_TABS.some(([r])=>r===route))return;
  if(ui.game&&!ui.game.done&&route!=='challenge'&&!force){showDialog('先离开这场挑战？','已记录的单首背诵会保留；未结束的这场挑战不会计入成绩。',`<div class="dialog-actions"><button class="button" data-action="dialog-close">继续挑战</button><button class="button primary" data-action="leave-game" data-route-target="${route}">结束并离开</button></div>`);return;}
  if(ui.route===route&&ui.opened)return;
  if(route==='challenge'&&ui.game?.done)ui.game=null;
  stopSpeech();ui.opened=true;ui.route=route;ui.returnKey=null;render();recordNavigation(!replace);announce('已打开'+MAIN_TABS.find(([r])=>r===route)[2]);
}
async function openPoem(id,{recite=false,skipArt=false}={}){
  if(!dialog.open)discardDialogHistory();
  if(!poems.some(p=>p.id===id&&!p.archived))return;
  const already=ui.route==='practice',parent=already?ui.readerFrom:ui.route,key=already?ui.returnKey:history.state?.poetryNav?.key||null;
  await transition(()=>{ui.opened=true;ui.route='practice';ui.readerFrom=rootTab(parent);ui.returnKey=key;ui.poemId=id;ui.lastPoemId=id;resetPractice();if(recite)ui.reading='recite';else ui.artPage=!skipArt&&hasArtPage(currentPoem());markSeen(data,id);persist();});recordNavigation(!already);
}
function showDialog(title,description,content,{history:withHistory=true}={}){
  const replacing=dialog.open;if(replacing)dialog.close();
  dialog.classList.remove('auto-recitation-result','poem-art-dialog');dialog.innerHTML=`<div class="dialog-inner"><div class="dialog-header"><h2>${title}</h2><button class="icon-button" data-action="dialog-close" aria-label="关闭窗口">${icon('close',18)}</button></div>${description?`<p class="dialog-description">${description}</p>`:''}${content}</div>`;dialog.showModal();document.body.classList.add('modal-open');
  if(navigationReady&&!replacing&&withHistory){const base=history.state?.poetryNav||navigationEntry;if(base){const overlay={...base,key:crypto.randomUUID(),position:base.position+1,overlay:true,overlayBase:base};window.history.pushState({poetryNav:overlay},'',location.href);navigationEntry=overlay;}}
}
function discardDialogHistory(){
  const entry=history.state?.poetryNav;if(!entry?.overlay)return;
  const base=entry.overlayBase,next={...navSnapshot(),key:base.key,position:entry.position};history.replaceState({poetryNav:next},'',navigationHash(ui.route,ui.poemId));navigationEntry=next;
}
function showPoemArt(id){
  const index=Math.max(0,POEM_ILLUSTRATIONS.findIndex(item=>item.poemId===id)),item=POEM_ILLUSTRATIONS[index],p=poems.find(p=>p.id===item.poemId);
  showDialog(escape(p.title),`${p.dynasty} · ${escape(p.author)} · AI 诗境插画`,`<figure class="art-gallery-figure">${artworkImage(item,'art-gallery-image','eager')}<figcaption class="caption-5">${escape(item.label)}</figcaption></figure><div class="art-gallery-pager"><button class="button small" data-action="view-poem-art" data-id="${POEM_ILLUSTRATIONS[index-1]?.poemId||''}" ${index===0?'disabled':''}>上一幅</button><span class="caption-5">${index+1} / ${POEM_ILLUSTRATIONS.length} · 诗境画册</span><button class="button small" data-action="view-poem-art" data-id="${POEM_ILLUSTRATIONS[index+1]?.poemId||''}" ${index===POEM_ILLUSTRATIONS.length-1?'disabled':''}>下一幅</button></div><button class="button primary full" data-action="art-read-poem" data-id="${p.id}">读这首诗</button>`);
  dialog.classList.add('poem-art-dialog');
}
function closeDialog(){dialog.close();discardDialogHistory();}
function accountChanged(event){
  if(!accounts||event.spaceId!==accounts.spaceId)return;
  const current=accounts.current(),context=accounts.context(),changed=context!==dataContext;
  if(changed){const managing=!!dialog.querySelector('#account-list,[data-action=account-delete-confirm]');if(voiceUI.flow)voiceUI.close();stopSpeech();ui.game=null;resetPractice();ui.route='passport';entryNavigation=null;ui.lastPoemId=null;ui.returnKey=null;ui.readerFrom='library';ui.search='';ui.filter='适合我';ui.category='';ui.listPage=0;if(dialog.open&&!managing){closeDialog();say('学习账号已切换，旧账号的操作窗口已关闭。');}}
  data=current;dataContext=context;dataBaseline=structuredClone(data);if(changed)recordNavigation(false);
  const status=accounts.status(),label=$('#account-sync-status');if(label)label.textContent=status.message;
  const list=$('#account-list');if(list)list.innerHTML=profileRows(accounts,escape,levelNames,!!ui.game&&!ui.game.done);
  const trash=$('#account-trash-list');if(trash)trash.innerHTML=deletedRows(accounts,escape,!!ui.game&&!ui.game.done);const trashCount=$('#account-trash-count');if(trashCount)trashCount.textContent=accounts.deleted().length;
  const conflict=$('#account-conflict-actions');if(conflict)conflict.hidden=status.state!=='conflict';
  $('#save-status').textContent=status.message;
  if(changed||!ui.busy&&!dialog.open&&!ui.game)render();else accountRenderPending=true;
}
function accountsDialog(){
  if(!accounts){showDialog('账号与云同步',accountsError||'账号数据尚未就绪。','<button class="button" data-action="account-recovery">导出账号原始备份</button>');return;}
  showDialog('账号与云同步','自己设一个同步码，手机、平板输入同一码即可同步。',accountPanel(accounts,escape,levelNames,!!ui.game&&!ui.game.done));
}
function accountDeleteDialog(id,spaceId=accounts.spaceId){
  if(spaceId!==accounts.spaceId){say('护照组已切换，请重新选择账号。');return;}
  const record=accounts.payload().profiles[id];if(!record||record.lifecycle?.deleted){say('该账号状态已变化，请重新选择。');return;}
  if(accounts.ordered().length<=1){say('至少保留一个可用账号，请先建立另一个学习账号。');return;}
  const attrs=`data-id="${id}" data-space="${accounts.spaceId}" data-life="${escape(JSON.stringify(record.lifecycle))}" data-name="${escape(record.data.profile.name)}"`;
  showDialog('删除「'+escape(record.data.profile.name)+'」？','当前这组护照中的账号及学习记录将移入回收站，可随时恢复。同一同步码连接的设备在同步后也会隐藏此账号。',`<p class="body-6">${id===accounts.profileId?'删除当前账号后，会自动打开这组护照中的另一个可用账号。':'本次操作只针对选中的学习账号。'}</p><p id="account-delete-error" class="account-notice caption-5" role="alert" hidden></p><div class="dialog-actions"><button class="button" data-action="account-delete-cancel">返回管理</button><button class="button" data-action="account-export-target" ${attrs}>先导出此账号备份</button><button class="button danger" data-action="account-delete-confirm" ${attrs}>删除账号</button></div>`);
}
function curriculumDialog(){
  const progress=curriculumProgress(data,poems,curriculum),stage=curriculum.stages[data.profile.stage],rows=targetAssignments(data.profile,curriculum),junior=data.profile.stage==='junior',standard=standardItems(data.profile,curriculum),poetry=standardPoetry(data.profile,curriculum),known=poetry.filter(i=>{const p=poems.find(p=>p.id===i.poemId);return p&&mastered(data,p);}).length;
  const source=junior?curriculum.standard.juniorSource:null,prose=standard.filter(i=>i.kind==='prose'),bookAudit=curriculum.textbookAudit;
  showDialog(profileGradeLabel(data.profile)+' · 教材诗词','统编人教版 · 六三学制 · 按年级与上下册整理',`<section class="curriculum-overview"><h3 class="title-3">可学诗词：会背 ${progress.known} / ${progress.total} 首</h3><p class="body-6">${escape(stage.focus)}</p><p class="caption-5">${STAGE_NAMES[data.profile.stage]}的课标要求积累优秀诗文 ${stage.target} 篇（段），包括古今中外诗文。这里的背诗进度不代表全部语文积累任务。</p><p class="caption-5">${junior?'初中课标推荐60篇（段），其中诗词40首、文言文20项':'小学课标推荐75篇'}；诗词部分已会背 ${known} / ${poetry.length} 首。</p></section>
  <h3 class="title-3">本年级教材目录</h3><p class="caption-5">按目录推荐，不把“教材收录”一概标为“逐首必背”。册次可能属于不同修订版本，请对照学校课本；未提供正文的条目会单独列出。</p>
  ${['上','下'].map(term=>{const items=rows.filter(a=>a.term===term);return items.length?`<section class="textbook-term"><h4 class="title-3">${profileGradeLabel(data.profile)}${term}册</h4><p class="caption-5">参考站原版次标注：${escape(items[0].editionLabel.replace(/ · [^·]*首$/,''))}；本册目录 ${items.length} 项。出版状态请以学校课本为准。</p><ol class="curriculum-list">${items.map(a=>{const p=poems.find(p=>p.id===a.poemId),checked=a.verification.startsWith('official-');return `<li>${p?`<button class="curriculum-item" data-action="curriculum-poem" data-id="${p.id}"><strong class="title-4">${escape(a.title)}</strong><span class="caption-5">${escape(a.section)} · ${mastered(data,p)?'已会背':'待学习'}${checked?' · 原书目录已核':''}</span></button>`:`<div class="curriculum-item unavailable"><strong class="title-4">${escape(a.title)}</strong><span class="caption-5">${escape(a.section)} · 目录已列，正文待补</span></div>`}</li>`;}).join('')}</ol></section>`:'';}).join('')}
  ${junior?`<details class="curriculum-sources"><summary>初中课标60篇的范围</summary><p class="body-6">60篇（段）由40首诗词和20项文言文组成，按学段推荐，不是按七、八、九年级逐首指定。本应用的诗词筛选包含40首，文言文只列目录，不计入背诗完成数。</p><ol class="standard-directory">${standard.map(i=>`<li value="${i.number}">${escape(i.title)}${i.author?' · '+escape(i.author):''}${i.kind==='prose'?' · 文言文目录':''}</li>`).join('')}</ol></details>`:''}
  <details class="curriculum-sources"><summary>核查结果与来源</summary><p class="body-6">参考站的205项是目录条目，包含跨册重复及部分近现代作品，不能当作205首不同古诗。九上已核对出版社当前目录；九下旧版补列原书仍有的《梅岭三章》。其他未逐页核对的册次保留参考状态。</p><p class="body-6">《古朗月行》保留教材前四句；《采薇》保留末章八句，不把参考链接中的较长原文当作节选背诵要求。</p><p class="body-6"><a href="${junior?source.url:curriculum.standard.sourceUrl}" target="_blank" rel="noopener">2022年语文课标原件</a> · <a href="${junior?curriculum.textbookReference.officialJuniorCatalogue:curriculum.textbookReference.officialCatalogue}" target="_blank" rel="noopener">人教社电子教材</a> · <a href="${curriculum.textbookReference.crosswalkUrl}" target="_blank" rel="noopener">诗笺参考目录</a></p><p class="caption-5">新增诗词的注音、音频与配图按实际可用状态提供；未核对的资料不会自动补成确定答案。异文、教材修订与具体背诵要求请对照孩子课本。</p></details><button class="button full" data-action="curriculum-filter">按这个年级选诗</button>`);
}
async function accountWork(work){
  if(accountOperation)return;accountOperation=true;try{await work();if(dialog.open)accountsDialog();}catch(error){const message=error.name==='TypeError'?'网络暂不可用，本机记录已保留。请联网后用同一码重试。':error.name==='TimeoutError'?'网络较慢，本机记录已保留。请用同一码重试。':error.message||'操作未完成，本机数据已保留。';say(message);const label=$('#account-sync-status')||$('#account-delete-error');if(label){label.hidden=false;label.textContent=message;}}finally{accountOperation=false;}
}
async function accountAction(el){
  const action=el.dataset.action;if(action==='account-open'){accountsDialog();return;}
  if(action==='account-recovery'){const payload={app:'shiyouji-poetry-v1',kind:'local-account-recovery',values:{}};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key===INDEX_KEY||key.startsWith(PREFIX))payload.values[key]=localStorage.getItem(key);}download(JSON.stringify(payload,null,2),'诗游记账号原始备份.json');return;}
  if(!accounts){say(accountsError||'账号服务尚未就绪。');return;}
  if(action==='account-copy'){try{await navigator.clipboard.writeText(accounts.code());say('同步码已复制，请只交给本家庭的设备。');}catch{say('请点显示同步码后，长按选择复制。');}return;}
  if(action==='account-reveal'){const input=$('#account-code-input');if(input){input.type=input.type==='password'?'text':'password';const shown=input.type==='text';el.textContent=shown?'隐藏':'显示';el.setAttribute('aria-label',shown?'隐藏同步码':'显示同步码');el.setAttribute('aria-pressed',String(shown));}return;}
  if(ui.game&&!ui.game.done){say('请先完成或退出当前挑战，再切换账号。');return;}
  if(action==='account-delete'){accountDeleteDialog(el.dataset.id,el.dataset.space);return;}
  if(action==='account-delete-cancel'){accountsDialog();return;}
  if(action==='account-export-target'){if(el.dataset.space!==accounts.spaceId){say('护照组已切换，请重新选择。');return;}const p=accounts.payload().profiles[el.dataset.id];if(!p){say('账号状态已变化，请重新选择。');return;}download(JSON.stringify(p.data,null,2),'诗游记-'+p.data.profile.name+'-备份.json');return;}
  await accountWork(async()=>{
    if(action==='account-delete-confirm'){accounts.deleteProfile(el.dataset.id,{spaceId:el.dataset.space,expectedLifecycle:el.dataset.life,expectedName:el.dataset.name});say('账号已移入回收站，可随时恢复。');}
    if(action==='account-restore'){accounts.restoreProfile(el.dataset.id,{spaceId:el.dataset.space,expectedLifecycle:el.dataset.life,expectedName:el.dataset.name});say('账号及学习记录已恢复。');}
    if(action==='account-switch'){accounts.switchProfile(el.dataset.id);say('已打开 '+accounts.current().profile.name+' 的护照。');}
    if(action==='account-space')accounts.switchSpace(el.dataset.id);
    if(action==='account-sync-now')await accounts.sync();
    if(action==='account-disconnect'){if(accounts.busy.has(accounts.spaceId))throw new Error('本次同步尚未结束，请稍后再断开。');accounts.disconnect();}
    if(action==='account-conflict-backup')download(JSON.stringify(await accounts.conflictBackup(),null,2),'诗游记同步冲突双方备份.json');
    if(action==='account-resolve')await accounts.resolve(el.dataset.choice);
  });
}
dialog.addEventListener('close',()=>{if(dialog.open)return;discardDialogHistory();document.body.classList.remove('modal-open');manualVoiceContext=null;if(pendingViewportRender||accountRenderPending)render();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function gradeDialog(){showDialog('选择年级','推荐会按统编人教版参考篇目调整。',`<form id="grade-form" data-account-context="${escape(dataContext||'legacy')}"><label class="field">所在年级<select name="grade" required><option value="">请选择</option>${Object.entries(GRADE_NAMES).map(([g,label])=>`<option value="${g}" ${data.profile.grade===Number(g)?'selected':''}>${label}</option>`).join('')}</select></label><button class="button primary full" type="submit">保存年级</button><button class="text-button grade-curriculum" type="button" data-action="curriculum">查看教材对照与课标要求</button></form>`);}
function profileDialog(){
  showDialog('我的护照设置','当前学习账号的设置。可在“账号与云同步”中建立独立护照并连接其他设备。',`<button class="button full account-entry" data-action="account-open">${icon('users',18)}账号与云同步 · ${escape(data.profile.name)}</button><button class="text-button" data-action="close-book">查看护照封面</button><form id="profile-form" data-account-context="${escape(dataContext||'legacy')}"><label class="field">护照上的名字<input name="name" value="${escape(data.profile.name)}" maxlength="16" required autocomplete="off"></label><label class="field">所在年级 · 统编人教版<select name="grade">${gradeOptions(data.profile,escape)}</select></label><button class="text-button" type="button" data-action="curriculum">查看教材对照与课标要求</button><label class="switch-row"><span>阅读时显示拼音<small>背诵时拼音会一起藏起</small></span><input type="checkbox" name="pinyin" ${data.settings.pinyin?'checked':''}></label><label class="switch-row"><span>立体翻页与盖章动作<small>系统的减少动态设置也会生效</small></span><input type="checkbox" name="motion" ${data.settings.motion?'checked':''}></label><label class="switch-row"><span>翻页与盖章音效<small>轻轻一声，可以随时关闭</small></span><input type="checkbox" name="sound" ${data.settings.sound?'checked':''}></label><label class="field" style="margin-top:16px">背诵判定方式<select name="speechMode"><option value="cloud" ${data.settings.speechMode==='cloud'?'selected':''}>联网识别并核对</option><option value="record-only" ${data.settings.speechMode==='record-only'?'selected':''}>只录音回听，不上传</option></select></label><p class="note">云识别经服务端发送至 Cloudflare，仅作本次转写，不长期保存录音。使用现有 Cloudflare 账户额度，按其套餐与用量计费；服务端设有频率限制。阅读统计需要全文覆盖并主动确认；旧浏览记录不补算已读。</p><div class="dialog-actions"><button class="button primary" type="submit">保存设置</button></div></form><div class="rule"></div><div class="inline-actions"><button class="button small" data-action="export">${icon('download',15)}导出备份</button><button class="button small" data-action="import">${icon('upload',15)}导入备份</button></div><input id="backup-input" data-account-context="${escape(dataContext||'legacy')}" type="file" accept="application/json,.json" hidden><div class="inline-actions" style="margin-top:15px"><button class="text-button" data-action="credits">诗文来源与使用说明</button></div><p class="note" style="margin-top:12px">${data.entries['primary-063']?'旧版《小池》存在正文误录，其历史记录保留在完整备份中，未计入正确《小池》的完成进度。<br>':''}学习记录按账号分别保存；已连接同步码的账号可跨设备同步。导入只替换当前学习账号，其他账号不受影响。清理浏览器数据前请确认同步并备份。</p>${invalidRaw!==null?'<div class="rule"></div><p class="note">检测到无法读取的旧记录。先导出原始备份，再选择开始新护照。</p><button class="button danger small" data-action="recover-storage">开始新护照</button>':''}`);
}
function recitationDialog(){showDialog('这一遍，背得怎么样？',`刚才使用了 ${ui.hints} 次提示。请按实际情况记录整首背诵。`,`<label class="field">这次由谁检查？<select id="confirmation"><option value="self">我自己检查</option><option value="family">家人已经听背确认</option></select></label><div class="outcome-options"><button class="outcome-button" data-action="record" data-outcome="independent" ${ui.hints?'disabled':''}>${icon('seal',24)}<span><strong>我独立背出来了</strong><small>${ui.hints?'本次用过提示，选择下面的记录':'整首背完，没有查看提示'}</small></span></button><button class="outcome-button" data-action="record" data-outcome="hinted">${icon('leaf',24)}<span><strong>提醒以后背出来了</strong><small>记住了大部分，继续练就会更熟</small></span></button><button class="outcome-button" data-action="record" data-outcome="learning">${icon('book',24)}<span><strong>我还想再练一练</strong><small>留下记录，下次接着来</small></span></button></div>`);}
async function saveRecitation(outcome){const p=currentPoem(),before=totalIndependent(),confirmation=$('#confirmation')?.value==='family'?'family':'self';const attempt=recordAttempt(data,p.id,{outcome,hints:ui.hints,confirmation});const saved=persist();closeDialog();resetPractice();render();if(attempt.outcome==='independent'){sound('stamp');showDialog(before<totalIndependent()?'又一首，住进心里。':'这一首，记得更牢了。',`${saved?'已保存背诵记录':'本次记录尚未保存，请导出备份'} · ${confirmation==='family'?'家人听背确认':'自己检查'}`,`<div class="stamp-celebration">${stampMarkup(p,{large:true,fresh:true})}</div><p class="result-label" style="text-align:center">你的护照里已有 ${totalIndependent()} 首独立背出的诗</p><div class="dialog-actions"><button class="button" data-action="dialog-close">再读一遍</button><button class="button primary" data-action="go-stamps">看看我的印章</button></div>`);}else say('记录好了，明天再来温习这一首。');}
function poemDetails(id){const p=poems.find(x=>x.id===id);if(!p)return;const e=data.entries[id],attempts=[...(e?.attempts||[])].reverse();showDialog(escape(p.title),'每一次背诵和提示使用情况都会留下记录。',`<button class="button full" data-action="view-poem-art" data-id="${p.id}">${illustrationFor(p.id)?'看这首诗的插画':'浏览诗境画册'}</button><button class="text-button" data-action="pinyin-info" data-id="${p.id}">${hasPinyin(p)?'拼音说明':'拼音待补说明'}</button><div class="mini-history">${attempts.length?attempts.slice(0,12).map(a=>`<div class="history-row"><span>${localDay(a.at)} · ${confirmationLabel(a.confirmation)}</span><strong>${outcomeNames[a.outcome]}${a.evidence?.heading&&headingLabels(a.evidence.heading.requirements).length?' · 含'+headingLabels(a.evidence.heading.requirements).join('、'):''}${a.hints?' · 提示 '+a.hints+' 次':''}</strong></div>`).join(''):'<p class="note">还没有背诵记录，先读一读，再试着藏起全文。</p>'}</div><div class="source-list">${p.alternateTitle?`<p>原数据附题：${escape(p.alternateTitle)}</p>`:''}<p>诗文来源：<a href="${escape(p.source.url)}" target="_blank" rel="noopener noreferrer">${p.sourceIndex!==null?'chinese-poetry · 唐诗三百首':'诗文正文来源'}</a>。作者、原文和原始版本信息随应用保存。</p>${p.sourceNotes.length?`<p>原数据附记：${p.sourceNotes.map(escape).join('；')}</p>`:''}${p.punctuationChanges.length?'<p>应用对句末标点作了规范化处理，文字保留原数据版本。</p>':''}<p>${p.pinyin?'本篇已配置辅助拼音。':'本篇拼音未核对，暂不显示。'}朗读音频为 AI 合成；逐句译注未配置。</p></div><div class="dialog-actions"><button class="button primary" data-action="detail-practice" data-id="${p.id}">去背这首诗</button></div>`);}
function setupGame(type){
  if(ui.game&&!ui.game.done){say('先完成当前挑战，或离开后重新开始。');return;}
  const labels={recite:'抽签背诗',cloze:'接下一句',sequence:'诗句归位',family:'家庭擂台'};
  const description={recite:'随机抽出几首诗，藏起全文后背诵。完成后自己检查，也可以请家人确认。',cloze:'每题选出正确的下一句，系统自动判分。接句成绩单独记录。',sequence:'把一组打乱的诗句按原文顺序排列，长诗使用明确标出的节选。',family:'两个人使用同一组诗轮流背诵，由另一位参与者听背确认。首位玩家使用这本护照。'};
  showDialog(labels[type],description[type],`<form id="game-setup" data-type="${type}"><label class="field">从哪里抽诗<select name="pool"><option value="all">全部书库 · ${poems.filter(p=>!p.archived).length} 篇</option><option value="seen">我读完的 · ${stats().learned.length} 首</option><option value="known">我会背的 · ${stats().independent.length} 首</option><option value="level" selected>适合我 · ${profileGradeLabel(data.profile)}</option></select></label>${type==='sequence'?'':`<label class="field">${type==='cloze'?'题目数量':type==='family'?'每人背几首':'抽背数量'}<select name="count">${(type==='cloze'?[5,10]:[3,1,5]).map(n=>`<option value="${n}">${n} ${type==='cloze'?'题':'首'}</option>`).join('')}</select></label>`}${type==='family'?`<label class="field">我的名字<input name="player1" value="${escape(data.profile.name)}" maxlength="16" required></label><label class="field">另一位参与者<input name="player2" value="家人" maxlength="16" required></label><p class="note">只有首位玩家的整首背诵会记入这本护照。双方挑战成绩都会保留在比赛记录中。</p>`:''}<p class="note" id="setup-error" role="alert"></p><div class="dialog-actions"><button class="button" type="button" data-action="dialog-close">再想想</button><button class="button primary" type="submit">开始挑战</button></div></form>`);
}
async function startGame(form){
  const fd=new FormData(form),type=form.dataset.type,poolType=fd.get('pool');
  const pool=poolType==='seen'?stats().learned:poolType==='known'?stats().independent:poolType==='level'?targetPoems(data.profile,poems,curriculum):poems.filter(p=>!p.archived);
  const count=type==='sequence'?1:Number(fd.get('count'));
  if(!pool.length||(['recite','family'].includes(type)&&pool.length<count)){$('#setup-error').textContent=`这个范围有 ${pool.length} 首，请选择更少的数量或换个范围。`;return;}
  const g={type,index:0,player:null,score:0,total:count,done:false,answers:[],hints:0,hint:'none',revealed:new Set(),showing:false,confirmed:false};
  if(type==='cloze'){g.questions=makeCloze(pool,count);if(!g.questions.length){$('#setup-error').textContent='这个范围没有足够的短句，请换个范围再试。';return;}}
  if(type==='sequence'){
    const length=sheetMetrics().height<430?2:4,candidates=[];
    for(const poem of pool)for(let start=0;start+length<=poem.lines.length;start+=2)if(poem.lines.slice(start,start+length).every(line=>line.length<=12))candidates.push({poem,start});
    if(!candidates.length){$('#setup-error').textContent='这个范围没有适合归位的短句，请换个范围。';return;}
    const pick=shuffled(candidates)[0];g.poem=pick.poem;g.rangeStart=pick.start;g.sequenceLines=g.poem.lines.slice(pick.start,pick.start+length);
    g.pieces=shuffled(g.sequenceLines.map((line,index)=>({line,index})));if(g.pieces.every((p,i)=>p.index===i))g.pieces.reverse();g.selected=[];g.checked=false;
  }
  if(['recite','family'].includes(type))g.deck=shuffled(pool).slice(0,count);
  if(type==='family'){const a=String(fd.get('player1')||'').trim(),b=String(fd.get('player2')||'').trim();if(!a||!b||a===b){$('#setup-error').textContent='请填写两个不同的参与者名字。';return;}g.players=[{name:a,score:0},{name:b,score:0}];g.player=0;}
  closeDialog();await transition(()=>{ui.opened=true;ui.route='challenge';ui.game=g;ui.gameVersePage=0;ui.resultPage=0;});
}
function gameProgress(g){const total=g.type==='family'?g.total*2:g.total,done=g.type==='family'?g.index*2+g.player:g.index;return `<div class="row-label"><span class="eyebrow">${{recite:'抽签背诗',cloze:'接下一句',sequence:'诗句归位',family:'家庭擂台'}[g.type]}</span><button class="text-button" data-action="exit-game">结束挑战</button></div><div class="progress-track" role="progressbar" aria-label="挑战进度" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}"><div class="progress-fill" style="width:${done/total*100}%"></div></div>`;}
function gameRight(){
  const g=ui.game;if(g.done)return resultRight(g);
  if(g.type==='cloze'){
    const q=g.questions[g.index];
    return `<section class="game-page">${gameProgress(g)}<p class="question-source">第 ${g.index+1} / ${g.total} 题 · ${escape(q.title)}</p><h2 class="question-prompt">${escape(q.prompt)}</h2><div class="answer-options">${q.options.map((o,i)=>`<button class="answer-option ${g.choice!==undefined?(o===q.answer?'correct':g.choice===i?'wrong':''):''}" data-action="choose-answer" data-index="${i}" ${g.choice!==undefined?'disabled':''}>${escape(o)}</button>`).join('')}</div><div class="answer-feedback ${g.choice!==undefined&&q.options[g.choice]!==q.answer?'wrong':''}" role="status">${g.choice===undefined?'下一句是？选出你记得的那一句。':q.options[g.choice]===q.answer?'接对了，这一句你记得！':'正确答案已标出，再记一记。'}</div><button class="button primary full" data-action="next-question" ${g.choice===undefined?'disabled':''}>${g.index===g.total-1?'看看成绩':'下一题'}${icon('right',15)}</button></section>`;
  }
  if(g.type==='sequence'){
    const p=g.poem,lines=g.sequenceLines,excerpt=lines.length!==p.lines.length;
    return `<section class="game-page sequence-game" data-poem-id="${p.id}">${gameProgress(g)}${poemHeading(p)}<p class="question-source">${excerpt?`节选 · 第 ${g.rangeStart+1}–${g.rangeStart+lines.length} 句`:'把这首诗的诗句排回原位'}</p><div class="sequence-target" aria-label="已排列的诗句">${lines.map((_,i)=>`<div class="sequence-slot" data-order="${i+1}">${g.selected[i]!==undefined?escape(lines[g.selected[i]]):''}</div>`).join('')}</div>${!g.checked?`<div class="sequence-pool">${g.pieces.map(piece=>`<button class="sequence-piece" data-action="sequence-pick" data-index="${piece.index}" ${g.selected.includes(piece.index)?'disabled':''}>${escape(piece.line)}</button>`).join('')}</div><div class="sequence-actions"><button class="button small" data-action="sequence-undo" ${!g.selected.length?'disabled':''}>退回一句</button><button class="button primary small" data-action="sequence-check" ${g.selected.length!==lines.length?'disabled':''}>核对顺序</button></div>`:''}<div class="answer-feedback" role="status">${g.feedback||'按顺序点选诗句，填进上面的空位。'}</div>${g.checked?'<button class="button primary full" data-action="sequence-finish">看看成绩</button>':''}</section>`;
  }
  const p=g.deck[g.index],family=g.type==='family',v=verseState(p,true),last=v.index===v.pages.length-1;
  return `<section class="game-page recite-game" data-poem-id="${p.id}">${gameProgress(g)}${family?`<div class="duel-scores">${g.players.map((player,i)=>`<div class="${g.player===i?'current':''}"><span>${escape(player.name)}</span><strong>${player.score}</strong></div>`).join('')}</div><p class="player-turn">轮到 ${escape(g.players[g.player].name)}</p>`:`<p class="question-source">第 ${g.index+1} / ${g.total} 首 · 整首背诵</p>`}${poemHeading(p)}${poemText(p,{mode:g.showing?'read':'recite',hint:g.hint,revealed:g.revealed,game:true})}<div class="game-hints"><button class="button small" data-action="game-first-hint" ${g.hint==='first'||g.showing?'disabled':''}>首字提示</button><button class="button small" data-action="game-show">${g.showing?'藏起全文':'揭开全文'}</button></div><p class="practice-status">本轮提示 ${g.hints} 次${v.pages.length>1?` · ${p.workId?'本节选':'全诗'} ${p.lines.length} 句`:''}</p>${gameVoiceActions(g,last)}</section>`;
}
function resultRight(g){
  const family=g.type==='family',sequence=g.type==='sequence',best=bestScore(data,g.type,g.total),size=resultPageSize(),count=Math.max(1,Math.ceil(g.answers.length/size));ui.resultPage=Math.min(ui.resultPage,count-1);
  const visible=g.answers.slice(ui.resultPage*size,(ui.resultPage+1)*size);
  return `<section class="result-page"><div class="eyebrow">挑战完成 · 又留下了一程足迹</div><div class="result-hero">${icon('trophy',28)}<h2 class="section-title">${family?'这一场，真精彩。':g.score===g.total?'记得真漂亮。':'每次想起，都是进步。'}</h2>${family?`<div class="duel-scores">${g.players.map(p=>`<div><span>${escape(p.name)}</span><strong>${p.score}</strong></div>`).join('')}</div><p class="result-label">${g.players[0].score===g.players[1].score?'打成平手，一起进步！':escape(g.players[g.players[0].score>g.players[1].score?0:1].name)+' 赢得本场挑战'}</p>`:`<div class="result-number">${g.score}<small>/ ${g.total}</small></div><p class="result-label">${sequence?'组诗句顺序正确':g.type==='cloze'?'题接句正确':'首诗独立背出'}</p><p class="note">同题量最佳：${best} / ${g.total}</p>`}</div><div class="result-items">${visible.map(a=>`<div class="result-item"><span>${escape(a.title)}</span><small class="pill ${a.correct||a.outcome==='independent'?'success':''}">${a.outcome?outcomeNames[a.outcome]:a.correct?'答对':'再温习'}${a.player!==undefined?' · '+escape(g.players[a.player].name):''}</small></div>`).join('')}</div><p class="note">${g.type==='cloze'||sequence?'已保存挑战成绩。整首背诗记录在护照里。':'已逐首保存背诵记录，同一首诗只计一次。'}${storageFailed?' 暂未写入设备，请导出备份。':''}</p><div class="inline-actions"><button class="button primary" data-action="another-game">再挑战一次</button><button class="button" data-action="challenge-home">返回挑战</button></div></section>`;
}
function finishGame(g){g.done=true;ui.resultPage=0;const score=g.type==='family'?g.players[0].score:g.score;recordGame(data,g.type,score,g.total,g.type==='family'?g.players:null);persist();render();sound('stamp');announce('挑战完成，成绩已记录');}
async function recordGameRecitation(outcome,{confirmation=null,evidence=null}={}){
  const g=ui.game;if(!g||g.done)return;if(g.type==='family'&&!g.confirmed&&confirmation!=='speech'&&confirmation!=='family')return;if(g.hints&&outcome==='independent')return;
  const p=g.deck[g.index],verified=confirmation||(g.type==='family'?'family':'self');
  if(g.type!=='family'||g.player===0){recordAttempt(data,p.id,{outcome,hints:g.hints,confirmation:verified,evidence,mode:g.type});persist();}
  g.answers.push({title:p.title,outcome,confirmation:verified,player:g.type==='family'?g.player:undefined});
  if(outcome==='independent'){if(g.type==='family')g.players[g.player].score++;else g.score++;}
  ui.gameVersePage=0;g.hints=0;g.hint='none';g.revealed=new Set();g.showing=false;g.confirmed=false;
  if(g.type==='family'&&g.player===0)g.player=1;else{g.index++;g.player=g.type==='family'?0:null;}
  if(g.index>=g.total){finishGame(g);return;}await transition(()=>{});announce('已抽出下一首诗');
}
function historyDialog(){showDialog('我的挑战记录','按挑战类型和题量分别保留成绩。',`<div class="mini-history">${data.games.length?[...data.games].reverse().slice(0,20).map(g=>`<div class="history-row"><span>${localDay(g.at)} · ${{cloze:'接下一句',sequence:'诗句归位',recite:'抽签背诗',family:'家庭擂台'}[g.type]}</span><strong>${g.type==='family'&&g.players?g.players.map(p=>escape(p.name)+' '+p.score).join(' / '):g.score+' / '+g.total}</strong></div>`).join(''):'<p class="note">完成一场挑战后，这里会留下你的成绩。</p>'}</div>`);}
function download(text,filename){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function importBackup(file){if(!file)return;const targetContext=accounts?.context()??null;if(file.size>1024*1024){say('文件过大，请选择应用导出的 JSON 备份。');return;}try{const checked=validateData(JSON.parse(await file.text()),poems.map(p=>p.id));if((accounts?.context()??null)!==targetContext){say('账号已切换，备份没有导入其他账号。');return;}const count=summary(checked,poems).independent.length;showDialog('导入这本护照？',`${escape(checked.profile.name)}的备份包含 ${count} 首独立背出的诗。导入只替换当前学习账号，其他账号不受影响。`, '<p class="note">建议先导出当前护照，以便需要时恢复。</p><div class="dialog-actions"><button class="button" data-action="export">先导出当前记录</button><button class="button primary" id="confirm-import">替换并导入</button></div>');$('#confirm-import').addEventListener('click',()=>{if((accounts?.context()??null)!==targetContext){say('账号已切换，备份没有写入其他账号。');return;}data=checked;invalidRaw=null;persist();ui.game=null;ui.route='passport';resetPractice();closeDialog();render();say('护照已导入，欢迎继续旅程。');});}catch(e){say('导入失败：'+e.message);}}
async function creditsDialog(){
  const credits=await fetch('./credits.json?v=30').then(r=>r.json()).catch(()=>null);
  showDialog('诗文来源与使用说明','诗游记 · 唐诗三百首全本',`<div class="source-list"><p>完整接入 chinese-poetry 的《唐诗三百首》文件，共 ${poems.filter(p=>p.sourceIndex!==null).length} 个条目；小学课标及一至九年级教材补充诗词另存正文与来源。各篇保留原文、作者、来源顺序和附记；附记不混入背诵题目。</p><p>读诗页保留拼音入口；已配置的诗可开关拼音，其余明确提示待补，避免自动注音误导孩子。阅读提示仅在已配置的诗中提供；逐句译注尚未配置。</p><p>“朗读”播放应用提供的 AI 合成 MP3，无需安装手机语音包。首次播放需要联网，已播放的音频可以离线缓存。新打开一首诗、开始背诵或离开页面时会停止播放。</p><p>手机页面固定在屏幕内，长诗、诗单、收藏和成绩按页展示。左右滑动纸面或点页脚按钮，只翻当前诗文、诗单或印章；功能区使用底部导航切换。长诗按页阅读；录音背诵一次核对全文，不必为了结束录音翻到底。</p><p>录音背诵会联网转写，再按读音核对；同音误字自动还原为原诗文字，原始转写可单独查看。漏句、错序或读音未匹配时可回听核对，不作声学发音评分。完成阅读需要覆盖全文并主动确认，或完成整首语音核对。接句、排序成绩单独记录。学习记录按账号保存，可通过诗游记专用同步码跨设备同步。</p><p>${POEM_ILLUSTRATIONS.length} 幅专属诗境已上线，由 AI 生成；未完成的诗篇仍用通用插画，覆盖清单公开保留。手机在独立诗境页看完整配图，左右翻页进入正文；点按配图可放大。浏览配图不计入完成阅读。</p><details><summary>开源许可与数据核对</summary><p><a href="./vendor/chinese-poetry-LICENSE.txt" target="_blank" rel="noopener">诗词数据许可</a> · <a href="./vendor/three-LICENSE.txt" target="_blank" rel="noopener">Three.js</a> · <a href="./vendor/html2canvas-LICENSE.txt" target="_blank" rel="noopener">html2canvas</a> · <a href="./vendor/pypinyin-LICENSE.txt" target="_blank" rel="noopener">pypinyin</a></p><pre>${escape(JSON.stringify(credits?.corpus||null,null,2))}</pre></details></div>`);
}
function bindSwipe(){
  const sheet=$('.paper-right');if(!sheet||sheet.dataset.swipeBound)return;sheet.dataset.swipeBound='true';let start=null;
  sheet.addEventListener('pointerdown',e=>{if(!hasPager()||e.button&&e.pointerType!=='touch'||e.target.closest('input,select,textarea,audio'))return;start={x:e.clientX,y:e.clientY,id:e.pointerId,drag:false};});
  sheet.addEventListener('pointermove',e=>{if(!start||ui.busy)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3){start.drag=true;if(!sheet.hasPointerCapture(e.pointerId))sheet.setPointerCapture(e.pointerId);effects.lift(sheet,dx);e.preventDefault();}},{passive:false});
  sheet.addEventListener('pointerup',e=>{if(!start)return;effects.release(sheet);const dx=e.clientX-start.x,dy=e.clientY-start.y,drag=start.drag;start=null;if(drag&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){ui.suppressClickUntil=performance.now()+500;e.preventDefault();pageStep(dx<0?1:-1);}});
  sheet.addEventListener('pointercancel',()=>{effects.release(sheet);start=null;});
}
async function pageStep(direction){
  if(ui.busy||!hasPager())return;
  if(ui.route==='practice'){
    const p=currentPoem(),v=verseState(p),target=readingPageTarget({direction,atArt:artPageActive(p),hasArt:ui.reading==='read'&&hasArtPage(p),index:v.index,count:v.pages.length});
    if(target)await transition(()=>{ui.artPage=target.art;ui.versePage=target.index;},direction);
    else announce(direction>0?'本首诗已到末页，可以开始背诵或选择另一首。':'已经是本首诗的第一页。');return;
  }
  if(ui.route==='library'){
    const count=Math.max(1,Math.ceil(filteredPoems().length/listPageSize(sheetMetrics().height))),next=ui.listPage+direction;
    if(next<0||next>=count){say(next<0?'已经是诗单第一页':'已经是诗单最后一页');return;}
    await transition(()=>{ui.listPage=next;},direction);return;
  }
  if(ui.route==='stamps'){
    const items=ui.stampFilter==='poems'?stats().independent:earnedAchievements(),count=Math.max(1,Math.ceil(items.length/collectionSize())),next=ui.collectionPage+direction;
    if(next>=0&&next<count)await transition(()=>{ui.collectionPage=next;},direction);return;
  }
  if(ui.route==='challenge'&&ui.game){
    const g=ui.game;
    if(g.done){const next=ui.resultPage+direction,count=Math.max(1,Math.ceil(g.answers.length/resultPageSize()));if(next>=0&&next<count)await transition(()=>{ui.resultPage=next;},direction);return;}
    if(g.type==='recite'||g.type==='family'){
      const v=verseState(g.deck[g.index],true),next=v.index+direction;
      if(next>=0&&next<v.pages.length)await transition(()=>{ui.gameVersePage=next;},direction);else if(direction>0)say('背完以后，选择这一遍的表现。');return;
    }
    if(g.type==='cloze'&&direction>0){if(g.choice===undefined){say('先选一个答案，再进入下一题。');return;}g.index++;delete g.choice;if(g.index>=g.total)finishGame(g);else await transition(()=>{});return;}
    return;
  }
  // Top-level destinations only change through explicit navigation.
}
document.addEventListener('click',e=>{if(performance.now()<ui.suppressClickUntil&&e.target.closest('.paper-right')){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('click',async e=>{
  const el=e.target.closest('button[data-action],button[data-route],a.brand');if(!el||el.disabled||ui.busy)return;
  if(el.matches('a.brand')){e.preventDefault();await navigate('passport');return;}
  if(el.dataset.route){await navigate(el.dataset.route);return;}
  const a=el.dataset.action;
  if(a?.startsWith('account-')){await accountAction(el);return;}
  switch(a){
    case 'open':{ui.busy=true;const object=$('#passport-object');object?.classList.add('opening');sound('page');if(data.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,900));ui.busy=false;if(entryNavigation){const entry=entryNavigation;entryNavigation=null;restoreNavigation(entry);}else{ui.opened=true;ui.route='passport';render();recordNavigation(false);}break;}
    case 'close-book':if(dialog.open)closeDialog();if(ui.game&&!ui.game.done){await navigate('passport');break;}stopSpeech();ui.opened=false;ui.route='passport';render();recordNavigation(false);break;
    case 'profile':profileDialog();break;
    case 'reader-back':backFromPoem();break;
    case 'cancel-history-back':pendingChallengeBack=null;closeDialog();break;
    case 'confirm-history-back':{const target=pendingChallengeBack;pendingChallengeBack=null;ui.game=null;closeDialog();if(target){const delta=(navigationEntry?.position||0)-(target.position||0);if(delta)history.go(-delta);else restoreNavigation(target);}break;}
    case 'choose-grade':gradeDialog();break;
    case 'browse-grade':ui.filter='适合我';ui.category='';ui.search='';ui.listPage=0;await navigate('library');render();break;
    case 'curriculum':curriculumDialog();break;
    case 'curriculum-poem':closeDialog();await openPoem(el.dataset.id,{skipArt:true});break;
    case 'curriculum-filter':closeDialog();ui.filter='适合我';ui.category='';ui.search='';ui.listPage=0;await navigate('library');render();break;
    case 'credits':await creditsDialog();break;
    case 'dialog-close':closeDialog();break;
    case 'view-poem-art':showPoemArt(el.dataset.id);break;
    case 'art-read-poem':closeDialog();await openPoem(el.dataset.id,{skipArt:true});break;
    case 'art-to-text':await transition(()=>{ui.artPage=false;ui.versePage=0;},1);break;
    case 'voice-next-poem':closeDialog();ui.filter='适合我';ui.category='';ui.search='';ui.listPage=0;await navigate('library');render();break;
    case 'poem':await openPoem(el.dataset.id,{recite:el.dataset.recite==='true'});break;
    case 'review':if(stats().due.length)await openPoem(stats().due[0].id,{recite:true});break;
    case 'pinyin':if(artPageActive(currentPoem())){data.settings.pinyin=true;ui.artPage=false;ui.versePage=0;}else data.settings.pinyin=!data.settings.pinyin;persist();render();break;
    case 'pinyin-info':pinyinInfo(el.dataset.id);break;
    case 'retry-pinyin':if(await loadPinyin()){closeDialog();render();say('拼音资料已加载。');}else say(pinyinLoadError);break;
    case 'mask-keywords':stopSpeech();ui.versePage=0;ui.reading='keywords';ui.revealed=new Set();ui.hint='none';render();break;
    case 'mask-first':stopSpeech();ui.versePage=0;ui.reading='first';ui.hint='first';ui.revealed=new Set();render();break;
    case 'read-again':stopSpeech();resetPractice();render();break;
    case 'start-reciting':stopSpeech();ui.versePage=0;ui.reading='recite';ui.hints=0;ui.hint='none';ui.revealed=new Set();render();announce('全文已藏起，可以开始背诵');break;
    case 'first-hint':if(ui.hint!=='first'){ui.hint='first';ui.hints++;render();}break;
    case 'reveal':{const n=Number(el.dataset.index);if(!ui.revealed.has(n)){ui.revealed.add(n);if(ui.reading==='recite')ui.hints++;render();}break;}
    case 'finish-reciting':manualVoiceReview({poem:currentPoem(),hints:ui.hints,scope:'practice',purpose:'recite'});break;
    case 'practice-options':showDialog('选择提示练习','提示练习不会计为独立背出。','<div class="outcome-options"><button class="outcome-button" data-action="choose-keywords">藏几个字</button><button class="outcome-button" data-action="choose-first">只留首字</button></div>');break;
    case 'choose-keywords':closeDialog();stopSpeech();ui.versePage=0;ui.reading='keywords';ui.hint='none';ui.revealed=new Set();render();break;
    case 'choose-first':closeDialog();stopSpeech();ui.versePage=0;ui.reading='first';ui.hint='first';ui.revealed=new Set();render();break;
    case 'complete-reading':{const p=currentPoem(),proof=readingTracker.proof(p.id,p.lines);if(!proof){say('先覆盖完整诗文，再确认完成。');break;}completeReading(data,p.id,proof);persist();render();say('已记为完成阅读，不等于已经会背。');break;}
    case 'return-unread':{const p=currentPoem(),missing=readingTracker.status(p.id,p.lines).missing[0],v=verseState(p);await transition(()=>{ui.versePage=Math.max(0,v.pages.findIndex(page=>missing>=page.start&&missing<page.end));});break;}
    case 'voice-start':openVoice();break;
    case 'game-voice-start':openVoice('game');break;
    case 'game-manual-start':{const g=ui.game;manualVoiceReview({poem:g.deck[g.index],hints:g.hints,scope:'game',purpose:'recite',game:g,round:g.index,participant:g.player});break;}
    case 'voice-manual-save':{
      if(!$('#manual-voice-reviewed')?.checked||!manualVoiceContext)break;
      const flow=manualVoiceContext;manualVoiceContext=null;if(accounts&&flow.accountContext!==accounts.context()){say('账号已切换，这次结果未记到其他账号。');return;}let outcome=el.dataset.outcome;
      if(flow.hints&&outcome==='independent')outcome='hinted';closeDialog();
      if(flow.scope==='game'){
        if(ui.game===flow.game&&ui.game.index===flow.round&&ui.game.player===flow.participant)await recordGameRecitation(outcome,{confirmation:'family'});
      }else{
        recordAttempt(data,flow.poem.id,{outcome,hints:flow.hints,confirmation:'family'});const saved=persist();resetPractice();render();
        if(saved&&outcome==='independent'){
          sound('stamp');showDialog('印章已收下','来源：家人听背确认。',`${stampMarkup(flow.poem,{large:true,fresh:true})}<p class="result-label">已独立背出 ${totalIndependent()} 首不同的诗</p><div class="dialog-actions"><button class="button" data-action="dialog-close">继续读诗</button><button class="button primary" data-action="go-stamps">查看印章</button></div>`);
        }else if(saved)say('已保存家人确认的背诵记录。');
      }break;
    }
    case 'record':await saveRecitation(el.dataset.outcome);break;
    case 'go-stamps':closeDialog();ui.stampFilter='poems';ui.collectionPage=0;await navigate('stamps');render();break;
    case 'poem-details':case 'stamp-detail':poemDetails(el.dataset.id);break;
    case 'detail-practice':closeDialog();await openPoem(el.dataset.id,{recite:true});break;
    case 'speak':{
      if(speaking){stopSpeech();break;}const p=currentPoem();if(!p.audio)break;
      player.dataset.poemId=p.id;player.src=p.audio.src;speaking=true;audioButton();
      try{await player.play();}catch{speaking=false;audioButton();say('朗读暂时没加载好，联网后点一下重试。');}break;
    }
    case 'filter':ui.filter=el.dataset.value;$('#poem-results').innerHTML=poemResults();document.querySelectorAll('[data-action="filter"]').forEach(b=>{b.classList.toggle('active',b.dataset.value===ui.filter);b.setAttribute('aria-pressed',String(b.dataset.value===ui.filter));});break;
    case 'stamp-filter':ui.stampFilter=el.dataset.value;ui.collectionPage=0;render();break;
    case 'setup-game':setupGame(el.dataset.type);break;
    case 'choose-answer':{const g=ui.game;if(!g||g.choice!==undefined)break;g.choice=Number(el.dataset.index);const q=g.questions[g.index],correct=q.options[g.choice]===q.answer;if(correct)g.score++;g.answers.push({title:q.title,correct});render();announce(correct?'答对了':'这一题再温习一下');break;}
    case 'next-question':{const g=ui.game;if(!g||g.choice===undefined)break;g.index++;delete g.choice;if(g.index>=g.total)finishGame(g);else await transition(()=>{});break;}
    case 'sequence-pick':{const g=ui.game,n=Number(el.dataset.index);if(g?.type==='sequence'&&!g.checked&&!g.selected.includes(n)){g.selected.push(n);g.feedback='';render();}break;}
    case 'sequence-undo':if(ui.game?.type==='sequence'){ui.game.selected.pop();ui.game.feedback='';render();}break;
    case 'sequence-check':{const g=ui.game;if(!g||g.selected.length!==g.sequenceLines.length)break;const correct=g.selected.every((n,i)=>g.sequenceLines[n]===g.sequenceLines[i]);if(correct){g.checked=true;g.score=1;g.answers=[{title:g.poem.title,correct:true}];g.feedback='顺序完全正确，诗句都归位了！';}else{g.feedback='有几句还没有回到原位，试着退回再排一遍。';}render();break;}
    case 'sequence-finish':if(ui.game?.checked)finishGame(ui.game);break;
    case 'game-first-hint':if(ui.game&&ui.game.hint!=='first'){ui.game.hint='first';ui.game.hints++;render();}break;
    case 'game-show':if(ui.game){ui.game.showing=!ui.game.showing;if(ui.game.showing)ui.game.hints++;render();}break;
    case 'game-reveal':if(ui.game){const n=Number(el.dataset.index);if(!ui.game.revealed.has(n)){ui.game.revealed.add(n);ui.game.hints++;render();}}break;
    case 'game-record':await recordGameRecitation(el.dataset.outcome);break;
    case 'another-game':{const type=ui.game?.type;ui.game=null;render();if(type)setupGame(type);break;}
    case 'challenge-home':ui.game=null;render();break;
    case 'exit-game':showDialog('结束这场挑战？','已经记录的单首背诵会保留；尚未完成的整场成绩不计入纪录。','<div class="dialog-actions"><button class="button" data-action="dialog-close">继续挑战</button><button class="button primary" data-action="leave-game" data-route-target="challenge">结束挑战</button></div>');break;
    case 'leave-game':closeDialog();ui.game=null;await navigate(el.dataset.routeTarget,{force:true});render();break;
    case 'history':historyDialog();break;
    case 'export':download(invalidRaw!==null?invalidRaw:JSON.stringify(data,null,2),`诗游记${invalidRaw!==null?'原始记录':'护照备份'}-${localDay()}.json`);say('备份文件已准备好，请保留下载的 JSON 文件。');break;
    case 'import':$('#backup-input')?.click();break;
    case 'recover-storage':showDialog('开始一本新护照？','请先确认已经导出原始备份。旧记录将从当前浏览器替换为新护照。','<div class="dialog-actions"><button class="button" data-action="export">导出原始备份</button><button class="button danger" data-action="confirm-recover">已备份，开始新护照</button></div>');break;
    case 'confirm-recover':invalidRaw=null;data=initialData();persist();closeDialog();render();break;
    case 'page-next':await pageStep(1);break;
    case 'page-prev':await pageStep(-1);break;
  }
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='profile-form'){e.preventDefault();const form=e.target;if(accounts&&form.dataset.accountContext!==accounts.context()){say('学习账号已切换，设置没有写入其他账号。');closeDialog();render();return;}const fd=new FormData(form),name=String(fd.get('name')||'').trim();if(!name||name.length>16){say('请填写 1 到 16 个字的名字。');return;}if(name!==form.elements.name.defaultValue)data.profile.name=name;const initialGrade=form.elements.grade.querySelector('[selected]')?.value??'';if(fd.get('grade')!==initialGrade){data.profile.grade=fd.get('grade')?Number(fd.get('grade')):null;if(data.profile.grade)data.profile.stage=stageForGrade(data.profile.grade);ui.lastPoemId=null;ui.listPage=0;ui.filter='适合我';ui.search='';ui.category='';}for(const key of ['pinyin','motion','sound'])if(fd.has(key)!==form.elements[key].defaultChecked)data.settings[key]=fd.has(key);const initialSpeech=form.elements.speechMode.querySelector('[selected]')?.value;if(fd.get('speechMode')!==initialSpeech)data.settings.speechMode=fd.get('speechMode')==='record-only'?'record-only':'cloud';persist();closeDialog();render();say('设置已保存。');}
  if(e.target.id==='grade-form'){e.preventDefault();if(accounts&&e.target.dataset.accountContext!==accounts.context()){closeDialog();say('学习账号已切换，请重新选择。');return;}const grade=Number(new FormData(e.target).get('grade'));if(!GRADE_NAMES[grade])return;data.profile.grade=grade;data.profile.stage=stageForGrade(grade);ui.lastPoemId=null;ui.filter='适合我';ui.search='';ui.category='';ui.listPage=0;persist();closeDialog();render();say('推荐已调整为'+GRADE_NAMES[grade]+'。');}
  if(e.target.id==='account-create-form'){e.preventDefault();const fd=new FormData(e.target);await accountWork(async()=>{if(ui.game&&!ui.game.done)throw new Error('请先结束当前挑战。');const grade=Number(fd.get('accountGrade'));accounts.addProfile(fd.get('accountName'),stageForGrade(grade),grade);say('新的学习账号已建立，拥有独立护照。');});}
  if(e.target.id==='account-sync-form'){e.preventDefault();if(accountOperation)return;const form=e.target,fd=new FormData(form),button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='正在同步…';try{await accountWork(async()=>{if(ui.game&&!ui.game.done)throw new Error('请先结束当前挑战。');await accounts.useCode(fd.get('syncCode'),{expectedContext:form.dataset.accountContext});say(accounts.status().message);});}finally{if(button.isConnected){button.disabled=false;button.textContent='保存并同步';}}}
  if(e.target.id==='game-setup'){e.preventDefault();await startGame(e.target);}
});
document.addEventListener('input',e=>{if(e.target.id==='poem-search'){ui.search=e.target.value;ui.listPage=0;$('#poem-results').innerHTML=poemResults();updatePager();saveSession();}});
document.addEventListener('error',e=>{const img=e.target;if(!img.matches?.('img[data-art-image]'))return;const item=illustrationFor(img.dataset.artImage),button=img.closest('.poem-art-button');if(button){button.innerHTML=landscape(poems.find(p=>p.id===item.poemId)?.theme||'山河')+'<span class="art-zoom caption-5">配图暂未加载，点按重试</span>';}else{const note=document.createElement('p');note.className='body-6 art-unavailable';note.textContent='配图暂未加载，联网后重新打开这一幅。';img.replaceWith(note);}},true);
document.addEventListener('change',e=>{if(e.target.id==='manual-voice-reviewed'){dialog.querySelectorAll('[data-action=voice-manual-save]').forEach(b=>{b.disabled=!e.target.checked||b.dataset.outcome==='independent'&&manualVoiceContext?.hints>0;});}if(e.target.id==='poem-status-filter'||e.target.id==='poem-category-filter'){if(e.target.id==='poem-status-filter')ui.filter=e.target.value;else ui.category=e.target.value;ui.listPage=0;$('#poem-results').innerHTML=poemResults();updatePager();saveSession();}if(e.target.id==='backup-input'){if(accounts&&e.target.dataset.accountContext!==accounts.context())say('学习账号已切换，备份没有导入其他账号。');else importBackup(e.target.files?.[0]);}if(e.target.id==='family-confirm'&&ui.game){ui.game.confirmed=e.target.checked;const y=window.scrollY;render();window.scrollTo(0,y);}});
$('#profile-button').addEventListener('click',()=>{if(!ui.busy)profileDialog();});$('#credits-button').addEventListener('click',creditsDialog);
window.addEventListener('storage',e=>{if(accounts||e.key!==STORAGE_KEY||!e.newValue)return;try{const next=validateData(JSON.parse(e.newValue),poems.map(p=>p.id));data=next;invalidRaw=null;if(!ui.game&&!ui.busy)render();say('已同步这个浏览器另一窗口的学习记录。');}catch{say('另一窗口的记录无法读取，当前学习记录保持原样。');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSpeech();void voiceUI.background();}});
async function boot(){
  try{
    const sources=await Promise.all(['poems','curriculum-poems','textbook-poems','curriculum'].map(async name=>{const r=await fetch('./'+name+'.json?v=30');if(!r.ok)throw new Error('诗单或课标对照加载失败');return r.json();}));poems=[...sources[0],...sources[1],...sources[2]];curriculum=sources[3];await loadPinyin();
    if(!Array.isArray(poems)||!poems.length||new Set(poems.map(p=>p.id)).size!==poems.length)throw new Error('诗单格式无效');
    [speechVariants,speechPhonetics,speechHeadings]=await Promise.all(['speech-variants','speech-phonetics','speech-headings'].map(name=>fetch(`./${name}.json?v=30`).then(r=>r.ok?r.json():{}).catch(()=>({}))));
    let migrated=false;
    try{const current=localStorage.getItem(STORAGE_KEY),legacy=!current?localStorage.getItem(LEGACY_STORAGE_KEY):null,raw=current||legacy;if(raw){try{data=validateData(JSON.parse(raw),poems.map(p=>p.id));migrated=!!legacy;}catch{invalidRaw=raw;}}}catch{storageFailed=true;}
    try{accounts=new PoetryAccounts(poems.map(p=>p.id),{onChange:accountChanged});data=accounts.initialize(data);dataContext=accounts.context();dataBaseline=structuredClone(data);accounts.start();}catch(error){accountsError=error.message;accounts=null;say('多账号数据未能读取，原始数据已保留。');}
    ui.poemId=poems[0].id;
    try{const session=JSON.parse(sessionStorage.getItem('shiyouji.session')||'null');if(session?.context===dataContext){ui.lastPoemId=session.lastPoemId||null;ui.filter=session.filter||'适合我';ui.search=session.search||'';ui.category=session.category||'';ui.listPage=session.listPage||0;}}catch{}
    navigationReady=true;
    const entry=history.state?.poetryNav,linked=locationRoute(location.hash,poems.filter(p=>!p.archived).map(p=>p.id));
    // Each new document starts closed. Session/history keep learning context,
    // but never dismiss the passport cover, including for returning sync users.
    if(linked?.route==='practice'){
      entryNavigation=entry?.context===dataContext&&entry.route==='practice'&&entry.poemId===linked.poemId
        ? {...entry,opened:true}
        : {...navSnapshot(),...linked,opened:true,readerFrom:'library',returnKey:null,lastPoemId:linked.poemId,versePage:0,artPage:hasArtPage(poems.find(p=>p.id===linked.poemId))};
    }
    ui.opened=false;ui.route='passport';recordNavigation(false);render();
    if(migrated)persist();
    if(migrated)say('旧记录已保留：浏览不再计入完成阅读，背诵印章继续保留。');
    if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js?v=30').catch(()=>{});
    window.__SHIYOUJI__=Object.freeze({snapshot:()=>structuredClone(data),renderer:()=>motion.mode,poemCount:poems.length});
  }catch(error){main.innerHTML=`<div class="empty-state"><h1>这次没能打开护照</h1><p>${escape(error.message)}，请联网后重新打开。</p><button class="button primary" onclick="location.reload()">重新打开</button></div>`;}
}
let readingTick=performance.now();
setInterval(()=>{const now=performance.now(),delta=now-readingTick;readingTick=now;if(!poems.length||ui.route!=='practice'||ui.reading!=='read'||ui.busy||dialog.open||document.hidden||!document.hasFocus())return;const p=currentPoem(),bounds=$('.poem-lines')?.getBoundingClientRect();if(!bounds)return;const indices=[...document.querySelectorAll('.paper-right .poem-line')].filter(el=>{const r=el.getBoundingClientRect();return r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1;}).map(el=>Number(el.dataset.verseIndex));readingTracker.observe(p.id,indices,delta);updateReadingAction();},500);

let viewportTimer,pendingViewportRender=false;
function syncViewport(){document.documentElement.style.setProperty('--app-height',(window.visualViewport?.height||innerHeight)+'px');effects.fitCover();clearTimeout(viewportTimer);viewportTimer=setTimeout(()=>{if(!poems.length)return;if(ui.busy||dialog.open||document.activeElement?.matches('input,select,textarea')){pendingViewportRender=true;return;}render();},150);}
window.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('resize',syncViewport);
syncViewport();
boot();
