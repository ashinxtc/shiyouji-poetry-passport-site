import {apiUrl} from './api.js?v=28';
import {VoiceSession,voiceCapabilities} from './voice.js?v=28';
import {compareRecitation} from './recitation.js?v=28';


export function speechCorrectionDetails(analysis,escape){
  const corrected=Array.isArray(analysis.correctedLines)?analysis.correctedLines:[];
  return `${analysis.homophones?`<p class="caption-5 auto-result-count">已按读音自动校正 ${analysis.homophones} 处同音识别文字，本次按正确背诵记录。</p>`:''}<details class="auto-result-details"><summary class="caption-5">${analysis.homophones?'查看校正后的诗句与原始识别':'查看系统核对依据'}</summary><p class="caption-5">正文读音匹配 ${analysis.matchedUnits} / ${analysis.expectedChars} 字。按转写读音核对，不作声学发音评分。</p><p class="caption-5">校正后的诗句：</p>${corrected.map(line=>`<p class="caption-5">${escape(line)}</p>`).join('')}<p class="caption-5">原始识别（仅供对照）：${escape(analysis.transcript)}</p></details>`;
}

export class VoiceUI {
  constructor({dialog,icon,escape,showDialog,onConfirmed,onManual,speechMode,variants,phonetics}){
    Object.assign(this,{dialog,icon,escape,showDialog,onConfirmed,onManual,speechMode,variants,phonetics});this.flow=null;this.allowClose=false;
    dialog.addEventListener('click',event=>{if(this.flow&&event.target===dialog){event.stopImmediatePropagation();return;}const button=event.target.closest('[data-voice]');if(button){event.preventDefault();this.action(button.dataset.voice);}});
    dialog.addEventListener('cancel',event=>{if(this.flow){event.preventDefault();this.close();}});
    dialog.addEventListener('close',()=>{if(dialog.open)return;this.cleanup();this.allowClose=false;dialog.classList.remove('voice-window');});
    window.addEventListener('resize',()=>{const flow=this.flow;if(flow?.phase==='result')requestAnimationFrame(()=>{if(this.flow===flow){flow.resultSize=null;this.renderResult();}});});
  }
  open(context){
    this.cleanup();this.showDialog(context.purpose==='read'?'朗读核对':'录音背诵','', '');
    this.dialog.classList.add('voice-window');
    const cap=voiceCapabilities();
    this.flow={...context,phase:'intro',recognize:this.speechMode()!=='record-only',saved:false,resultPage:0,cap};
    this.renderIntro();if(this.flow.recognize&&cap.record&&cap.secure)void this.preflight(this.flow);
  }
  async preflight(flow){flow.checking=true;this.renderIntro();try{const response=await fetch(apiUrl('/api/voice/config'),{cache:'no-store',signal:AbortSignal.timeout(8000)}),config=await response.json();if(this.flow!==flow)return;if(!response.ok||config.cloudReady!==true)flow.connectionNotice='自动识别服务暂未连接。可以先录音，结束后重试识别。';}catch{if(this.flow!==flow)return;flow.connectionNotice='暂时无法连接自动识别。可以先录音，结束后重试识别。';}if(this.flow===flow){flow.checking=false;this.renderIntro();}}
  backup(){return `<details class="voice-backup"><summary class="caption-5">其他方式</summary><button class="text-button" data-voice="manual">家人听背确认（备用）</button></details>`;}
  header(title){return `<div class="voice-header"><div><p class="caption-5">${this.escape(this.flow.poem.title)}</p><h2 class="heading-5">${title}</h2></div><button class="icon-button" data-voice="close" aria-label="关闭录音窗口">${this.icon('close',20)}</button></div>`;}
  frame(content){this.dialog.innerHTML=`<section class="voice-panel">${content}</section>`;}
  renderIntro(){const f=this.flow,{escape:e,icon}=this;this.frame(`${this.header(f.purpose==='read'?'读一遍，听听自己':'这一遍，大声背出来')}<div class="voice-intro"><div class="voice-emblem">${icon('microphone',40)}</div><p class="title-3">${f.purpose==='read'?'可以看着原文，完整读出一遍。':'从第一句开始，不需要报诗题和作者。'}</p><p class="body-6">${f.recognize?'结束录音后按读音核对，同音识别误字会自动还原；通过就记入护照。':'本次只录音回听，不上传声音，不自动判定。'}</p>${f.hints?`<p class="voice-notice caption-5">本次用过 ${f.hints} 次提示，通过后会记为“提醒后背出”。</p>`:''}<p class="caption-5 muted">录音仅临时保留，可回听或下载；关闭窗口后清除。</p>${f.connectionNotice?`<p class="voice-notice body-6">${e(f.connectionNotice)}</p>`:''}${!f.cap.secure||!f.cap.record?`<p class="voice-notice body-6">${!f.cap.secure?'请使用线上 HTTPS 入口，才能打开麦克风。':'这台浏览器不支持录音，可以请家人听背确认。'}</p>`:''}</div><div class="voice-actions"><button class="button primary full button-md" data-voice="start" ${!f.cap.secure||!f.cap.record||f.checking?'disabled':''}>${icon('microphone',20)}${f.checking?'正在确认识别方式':f.recognize?'开始录音自动判定':'开始录音回听'}</button><button class="button full button-sm" data-voice="close">先不背了</button>${this.backup()}</div>`);}
  renderCapture(){const f=this.flow;this.frame(`${this.header(f.purpose==='read'?'正在录下你的朗读':'这一遍，只靠自己')}<div class="voice-capture"><div class="voice-meter" aria-label="麦克风音量" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${[0,1,2,3,4].map(()=>'<span></span>').join('')}</div><p class="voice-clock heading-4">00:00</p><p class="voice-state title-3">正在连接麦克风</p><p class="voice-help body-6">${f.purpose==='read'?'完整读一遍，结束后核对。':(f.poem.workId?'不用看文字，慢慢把这段节选背出来。':'不用看文字，慢慢把整首诗背出来。')}</p><p class="caption-5 muted">${f.recognize?'录音结束后才发送至云端核对。':'只录音，不联网识别。'}</p></div><div class="voice-actions"><button class="button primary full button-md" data-voice="stop" disabled>正在连接麦克风</button><button class="button full button-sm" data-voice="close">取消本次录音</button></div>`);}
  updateCapture(update){if(!this.flow)return;const state=this.dialog.querySelector('.voice-state'),clock=this.dialog.querySelector('.voice-clock'),button=this.dialog.querySelector('[data-voice=stop]');if(!state||!clock)return;
    if(update.error&&this.flow.phase==='recording'){void this.stop();return;}
    const seconds=Math.floor(update.durationMs/1000);clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if(update.state==='recording'){this.flow.phase='recording';state.textContent='正在录音';if(button){button.disabled=false;button.textContent=this.flow.recognize?'结束并核对':'结束录音';}}
    if(update.level!==null){const level=Math.max(0,Math.min(1,update.level));this.dialog.querySelector('.voice-meter')?.setAttribute('aria-valuenow',String(Math.round(level*100)));this.dialog.querySelectorAll('.voice-meter span').forEach((bar,index)=>bar.style.transform=`scaleY(${Math.max(.12,level*[.55,.8,1,.8,.55][index])})`);}
  }
  async start(){const f=this.flow;if(!f||!['intro','error','result'].includes(f.phase))return;
    if(f.session)await f.session.cancel();f.result=null;f.analysis=null;f.phase='requesting';
    f.session=new VoiceSession(update=>{if(this.flow===f)this.updateCapture(update);});this.renderCapture();
    try{const started=await f.session.start({recognize:false});if(this.flow!==f||!started)return;f.phase='recording';}catch(error){if(this.flow!==f)return;f.phase='error';this.frame(`${this.header('这次还没有开始录音')}<div class="voice-intro"><p class="body-6 voice-notice">${this.escape(error.message)}</p><p class="caption-5 muted">没有录音，也不会记录为背诵失败。</p></div><div class="voice-actions"><button class="button primary full button-md" data-voice="start">重新连接麦克风</button>${this.backup()}</div>`);}
  }
  async stop(){const f=this.flow;if(!f||f.phase!=='recording')return;f.phase='processing';
    this.frame(`${this.header('正在核对这一遍')}<div class="voice-processing"><div class="voice-skeleton"><span></span><span></span><span></span></div><p class="title-3">录音已结束</p><p class="body-6">${f.recognize?'正在联网转写，请稍等。':'正在准备回听。'}</p><p class="caption-5 muted">有差异会请你回听，不直接判背错。</p></div><div class="voice-actions"><button class="button full button-sm" data-voice="close">取消核对并关闭</button></div>`);
    const result=await f.session.stop();if(this.flow!==f||!result)return;f.result=result;await this.analyze(f);
  }
  async analyze(f){
    if(this.flow!==f||!f.result)return;f.phase='processing';const result=f.result;
    this.frame(`${this.header(f.recognize?'系统正在判定':'录音回听')}<div class="voice-processing"><div class="voice-skeleton"><span></span><span></span><span></span></div><p class="title-3">正在核对${f.poem.workId?'节选':'整首'}内容</p><p class="body-6">${f.recognize?'通过后会自动记入护照，不需要家长核验。':'本次仅准备回听，不会自动判定。'}</p><p class="caption-5 muted">若有识别差异，会指出需要再练的句子。</p></div><div class="voice-actions"><button class="button full button-sm" data-voice="close">取消核对并关闭</button></div>`);
    let payload=null,error=result.captureError||(f.recognize?null:'本次只录音，尚未自动识别。');
    if(f.recognize&&!error){
      f.controller=new AbortController();let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;f.controller.abort();},95000);
      try{const response=await fetch(apiUrl('/api/transcribe'),{method:'POST',headers:{'Content-Type':result.mimeType},body:result.blob,signal:f.controller.signal});payload=await response.json().catch(()=>null);if(!response.ok||!payload)throw new Error(payload?.error||'识别暂时不可用，请回听或重录。');}
      catch(problem){error=problem.name==='AbortError'?(timedOut?'识别连接超时，本次录音仍可回听。':'已停止联网核对，本次录音仍可回听。'):/^[\u3400-\u9fff]/.test(problem.message||'')?problem.message:'识别连接中断，本次录音仍可回听。';}
      finally{clearTimeout(timeout);}
    }
    if(this.flow!==f)return;
    const lowQuality=payload?.segments?.some(s=>Number.isFinite(s.noSpeechProbability)&&s.noSpeechProbability>.6||Number.isFinite(s.avgLogProb)&&s.avgLogProb< -1);
    const verifiedEngine=payload?.engine==='@cf/openai/whisper-large-v3-turbo';
    f.analysis=compareRecitation(f.poem.lines,payload?.text||'',{variants:this.variants(),phonetics:this.phonetics(),expectedPinyin:f.poem.pinyin,title:f.poem.title,author:f.poem.author,durationMs:result.durationMs,finalized:!error,recognitionError:error||(!verifiedEngine?'识别来源未确认，请回听复核。':lowQuality?'识别结果不够确定，请回听复核。':null),confidence:payload?.confidence??null});
    f.engine=payload?.engine||null;
    if(f.analysis.status==='matched'&&!f.saved){
      f.saved=true;const context={...f};this.close();
      try{await this.onConfirmed(context);}catch{this.showDialog('这次未能记录','核对结果未能写入护照，请重新尝试。','<button class="button primary full" data-action="dialog-close">返回背诵</button>');}
      return;
    }
    f.phase='result';f.resultPage=0;f.resultSize=null;this.renderResult();
  }
  renderResult(){const f=this.flow,a=f.analysis,practice=a.assessment==='practice',height=window.visualViewport?.height||innerHeight,size=f.resultSize??Math.max(1,Math.min(4,Math.floor((height-476)/68))),results=practice?a.lineResults.filter(r=>!r.exact):a.lineResults,pages=Math.max(1,Math.ceil(results.length/size));f.resultPage=Math.max(0,Math.min(f.resultPage,pages-1));
    const rows=results.slice(f.resultPage*size,(f.resultPage+1)*size),retry=f.recognize&&(!!a.recognitionError||a.missingFields.includes('phoneticPronunciation'));
    const differences=[a.issues.missing?`${a.issues.missing} 字未听到`:'',a.issues.change?`${a.issues.change} 字有差异`:'',a.issues.extra?`多识别 ${a.issues.extra} 字`:''].filter(Boolean).join('，');
    const note=a.recognitionError||(a.missingFields.includes('phoneticPronunciation')?'读音资料未能确认这段转写，请联网刷新后回听核对，本次不记失败。':!a.enoughAudio?'录音较短，请从第一句开始完整背一遍。':!a.transcript?'没有听清正文，请靠近麦克风再录一次。':'识别不够确定，请回听后再录一遍。');
    this.frame(`${this.header(practice?'这几句再核对一下':'这次还没听清')}<div class="voice-summary"><p class="title-3">${practice?`内容匹配 ${a.matchedLines} / ${a.totalLines} 句`:'本次未完成自动判定'}</p><p class="caption-5 muted">${practice?this.escape(differences)+'。同音识别字已校正，其余差异可先回听核对。':this.escape(note)}</p></div><audio class="voice-replay" controls src="${f.result.url}" preload="metadata" aria-label="回听本次录音"></audio><div class="voice-comparison">${a.transcript?rows.map(row=>`<div class="voice-line-result"><p class="caption-5">第 ${row.number} 句：${this.escape(row.expected)}</p><p class="body-6">${row.operations.map(op=>`<span class="voice-word ${op.type}">${this.escape(op.type==='homophone'?op.expected:op.actual??'□')}</span>`).join('')||'未识别到这一句'}</p></div>`).join(''):'<p class="body-6 muted">本次不记成功，也不记失败。</p>'}</div><div class="voice-result-pager"><button class="button small button-xsm" data-voice="previous" ${f.resultPage===0?'disabled':''}>上一组</button><span class="caption-5">${f.resultPage+1} / ${pages}</span><button class="button small button-xsm" data-voice="next" ${f.resultPage===pages-1?'disabled':''}>下一组</button></div><div class="voice-actions"><button class="button primary full button-md" data-voice="${retry?'retry':'start'}">${retry?'重新识别这段录音':practice?(f.poem.workId?'再背节选试试':'再背整首试试'):'重新录一遍'}</button><div class="voice-secondary">${retry?'<button class="button button-sm" data-voice="start">重新录音</button>':''}<button class="button button-sm" data-voice="download">下载录音</button></div>${this.backup()}</div>`);
    const area=this.dialog.querySelector('.voice-comparison');if(area.scrollHeight>area.clientHeight+1){if(size>1){f.resultSize=size-1;this.renderResult();}else area.style.overflowY='auto';}
  }
  async action(action){const f=this.flow;if(!f)return;
    if(action==='start'){await this.start();return;}if(action==='stop'){await this.stop();return;}
    if(action==='retry'&&f.phase==='result'&&f.recognize){await this.analyze(f);return;}
    if(action==='close'){this.close();return;}
    if(action==='previous'||action==='next'){f.resultPage+=action==='next'?1:-1;this.renderResult();return;}
    if(action==='download'&&f.result){const link=document.createElement('a');link.href=f.result.url;link.download=`${f.poem.id}-背诵录音.${f.result.mimeType.includes('mp4')?'m4a':f.result.mimeType.includes('ogg')?'ogg':'webm'}`;link.click();return;}
    if(action==='manual'){const context={...f};this.close();this.onManual(context);return;}
    if(action==='save'&&f.analysis?.status==='matched'&&!f.saved){f.saved=true;const context={...f};this.close();await this.onConfirmed(context);}
  }
  close(){this.cleanup();this.allowClose=true;this.dialog.close();this.dialog.classList.remove('voice-window');}
  async background(){const f=this.flow;if(!f)return;if(f.phase==='recording'){f.phase='processing';const result=await f.session.stop();if(this.flow!==f||!result)return;f.result=result;f.analysis=compareRecitation(f.poem.lines,'',{durationMs:result.durationMs,recognitionError:'离开页面时已停止录音，本次未上传，请回听或重录。'});f.phase='result';f.resultPage=0;this.renderResult();}else if(f.phase==='requesting')this.close();else if(f.phase==='processing')f.controller?.abort();}
  cleanup(){if(this.flow){this.flow.controller?.abort();void this.flow.session?.cancel();this.flow=null;}}
}
