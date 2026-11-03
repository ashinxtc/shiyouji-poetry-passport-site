export function voiceCapabilities(){return {secure:window.isSecureContext,record:!!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder),recognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition)};}
export class VoiceSession {
  constructor(onUpdate=()=>{}){this.onUpdate=onUpdate;this.state='idle';this.stream=null;this.recorder=null;this.recognition=null;this.blob=null;this.url=null;this.chunks=[];this.results=[];this.error=null;this.recognitionError=null;this.active=false;this.stopping=false;this.starts=0;this.recognitionPending=null;this.frame=0;this.timer=0;this.level=0;this.version=0;}
  emit(){this.onUpdate({state:this.state,durationMs:this.startedAt?Math.round(performance.now()-this.startedAt):0,level:this.level,recognizedChars:this.results.map(x=>x.text).join('').length,recognitionError:this.recognitionError,error:this.error});}
  async start({recognize=false}={}){
    await this.cancel();const token=++this.version;
    const cap=voiceCapabilities();if(!cap.secure)throw new Error('录音需要 HTTPS 安全连接，请用线上入口打开。');if(!cap.record)throw new Error('这台浏览器不支持录音，可以改用家人听背。');
    this.state='requesting';this.error=null;this.recognitionError=null;this.results=[];this.chunks=[];this.starts=0;this.blob=null;this.emit();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1},video:false});
      if(token!==this.version){stream.getTracks().forEach(t=>t.stop());return false;}
      this.stream=stream;
      const types=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'];
      const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
      this.recorder=new MediaRecorder(stream,mimeType?{mimeType,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});
      const chunks=this.chunks;
      this.recorder.addEventListener('dataavailable',event=>{if(token===this.version&&event.data?.size)chunks.push(event.data);});
      this.recorder.addEventListener('error',()=>{if(token!==this.version)return;this.error='录音中断，请检查麦克风后重新开始。';this.emit();});
      stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(token===this.version&&this.active&&!this.stopping){this.error='麦克风停止工作，本次请回听或重录。';this.emit();}}));
      this.recorder.start(500);this.startedAt=performance.now();this.active=true;this.stopping=false;this.state='recording';
      this.recognize=!!(recognize&&cap.recognition);
      if(recognize&&!cap.recognition)this.recognitionError='unsupported';
      if(this.recognize)this.startRecognition();
      this.startMeter();
      this.timer=setInterval(()=>{this.emit();if(performance.now()-this.startedAt>480000){this.recognitionError??='time-limit';this.stop();}},250);
      this.emit();return true;
    }catch(error){if(token!==this.version)return false;this.release();this.state='error';this.error=error.name==='NotAllowedError'?'麦克风未授权，请在浏览器中允许录音后重试。':error.name==='NotFoundError'?'没有找到麦克风，可以改用家人听背。':error.message||'录音未能启动，请重试。';this.emit();throw new Error(this.error);}
  }
  startRecognition(){
    if(!this.active||this.stopping||this.starts>=12)return;
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition)return;
    const engine=new Recognition(),seen=new Set();this.recognition=engine;this.starts++;
    engine.lang='zh-CN';engine.continuous=true;engine.interimResults=true;engine.maxAlternatives=1;
    // No expected poem or phrase hints are supplied to the recognizer.
    engine.onresult=event=>{
      for(let n=event.resultIndex;n<event.results.length;n++){
        const result=event.results[n];if(result.isFinal&&!seen.has(n)){seen.add(n);const alternative=result[0];this.results.push({text:alternative.transcript,confidence:Number.isFinite(alternative.confidence)&&alternative.confidence>0?alternative.confidence:null});}
      }this.emit();
    };
    engine.onerror=event=>{
      if(event.error==='aborted'&&this.stopping)return;
      if(event.error==='no-speech')return;
      this.recognitionError=event.error||'recognition-error';this.emit();
    };
    engine.onend=()=>{
      this.recognitionPending?.();this.recognitionPending=null;
      if(this.active&&!this.stopping&&!this.recognitionError){
        if(this.starts<12)setTimeout(()=>{if(this.active&&!this.stopping)this.startRecognition();},180);
        else{this.recognitionError='session-limit';this.emit();}
      }
    };
    try{engine.start();}catch{this.recognitionError='service-unavailable';this.emit();}
  }
  startMeter(){
    try{
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      this.context=new Context();this.context.resume().catch(()=>{});
      this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;
      this.source=this.context.createMediaStreamSource(this.stream);this.source.connect(this.analyser);
      const buffer=new Uint8Array(this.analyser.fftSize);let previous=0;
      const update=now=>{if(!this.active)return;if(now-previous>90){this.analyser.getByteTimeDomainData(buffer);this.level=Math.min(1,Math.sqrt(buffer.reduce((sum,n)=>sum+Math.pow((n-128)/128,2),0)/buffer.length)*5);previous=now;this.emit();}this.frame=requestAnimationFrame(update);};
      this.frame=requestAnimationFrame(update);
    }catch{this.level=null;}
  }
  async stop(){
    if(this.stopping)return this.stopPromise;
    if(!this.recorder)return this.result||null;
    if(!['recording','paused'].includes(this.recorder.state)){
      if(this.result)return this.result;this.active=false;this.release();this.blob=new Blob(this.chunks,{type:this.recorder.mimeType||'audio/webm'});this.url=URL.createObjectURL(this.blob);this.result={blob:this.blob,url:this.url,mimeType:this.blob.type,durationMs:this.startedAt?Math.round(performance.now()-this.startedAt):0,transcript:'',confidence:null,finalized:false,captureError:this.error||'录音提前中断，本次请回听或重录。'};return this.result;
    }
    this.stopping=true;this.active=false;this.durationMs=Math.round(performance.now()-this.startedAt);this.state='processing';this.emit();
    const token=this.version,recorder=this.recorder,recognition=this.recognition,chunks=this.chunks;
    this.stopPromise=(async()=>{
      const recordingDone=new Promise(resolve=>{recorder.addEventListener('stop',resolve,{once:true});recorder.stop();});
      const recognitionDone=new Promise(resolve=>{
        if(!recognition){resolve();return;}
        let settled=false;const done=()=>{if(!settled){settled=true;resolve();}};
        this.recognitionPending=done;
        try{recognition.stop();}catch{done();}
        setTimeout(()=>{try{recognition.abort();}catch{}done();},1600);
      });
      await Promise.all([recordingDone,recognitionDone]);
      if(token!==this.version)return null;
      this.blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||'audio/webm'});
      this.url=URL.createObjectURL(this.blob);
      const confidences=this.results.map(r=>r.confidence).filter(n=>n!==null);
      this.result={blob:this.blob,url:this.url,mimeType:this.blob.type,durationMs:this.durationMs,transcript:this.results.map(r=>r.text).join(''),confidence:confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:null,finalized:this.recognize&&!this.recognitionError,recognitionError:this.recognitionError||(!this.recognize?'not-enabled':null),captureError:this.error};
      this.release();this.state='review';this.emit();return this.result;
    })();return this.stopPromise;
  }
  release(){clearInterval(this.timer);cancelAnimationFrame(this.frame);this.stream?.getTracks().forEach(track=>track.stop());this.source?.disconnect();if(this.context)this.context.close().catch(()=>{});this.stream=null;this.context=null;this.source=null;}
  async cancel(){
    this.version++;this.active=false;this.stopping=true;
    try{this.recognition?.abort();}catch{}
    if(this.recorder&&this.recorder.state!=='inactive'){try{this.recorder.stop();}catch{}}
    this.release();if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.result=null;this.blob=null;this.recorder=null;this.recognition=null;this.startedAt=null;this.stopping=false;this.state='idle';
  }
}
