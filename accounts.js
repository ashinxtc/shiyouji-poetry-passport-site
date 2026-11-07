import {apiUrl} from './api.js?v=53';
import {initialData} from './store.js?v=53';
import {APP_ID,clone,same,canonical,initialSpace,newProfile,validateSpace,generateCode,normalizeCode,codeHash,mergeSpaces,chooseConflicts,MAX_PROFILES,MAX_PROFILE_RECORDS,isDeleted} from './sync-core.js?v=53';
export const INDEX_KEY='shiyouji.accounts.index.v1',CODES_KEY='shiyouji.accounts.codes.v1',ACTIVE_KEY='shiyouji.accounts.active.v1',PREFIX='shiyouji.accounts.space.v1:';
export class PoetryAccounts {
  constructor(poemIds,{storage=globalThis.localStorage,session=globalThis.sessionStorage,fetcher=globalThis.fetch.bind(globalThis),onChange=()=>{}}={}){Object.assign(this,{poemIds,storage,session,fetcher,onChange});this.busy=new Set();this.syncTasks=new Map();this.statuses=new Map();this.timers=new Map();this.cache=new Map();this.active=null;}
  read(key,fallback=null){const raw=this.storage.getItem(key);if(raw===null)return clone(fallback);try{return JSON.parse(raw);}catch{throw new Error('本机账号数据读取失败，原始数据已保留，请先导出备份。');}}
  write(key,value){this.storage.setItem(key,JSON.stringify(value));}
  keys(){return Array.from({length:this.storage.length},(_,i)=>this.storage.key(i)).filter(Boolean);}
  metaKey(id){return PREFIX+id+':meta';}
  profileKey(space,id){return PREFIX+space+':profile:'+id;}
  meta(id=this.spaceId){const m=this.read(this.metaKey(id));if(!m||m.app!==APP_ID)throw new Error('诗游记账号空间无效。');return m;}
  payload(id=this.spaceId){const head=PREFIX+id+':profile:',profiles={};for(const key of this.keys().filter(k=>k.startsWith(head))){const record=this.read(key);profiles[record.id]=record;}return validateSpace({_app:APP_ID,schema:1,profiles},this.poemIds);}
  install(id,payload,{checkpoint=null,revision=0}={}){const checked=validateSpace(payload,this.poemIds);for(const p of Object.values(checked.profiles)){this.write(this.profileKey(id,p.id),p);this.cache.set(this.profileKey(id,p.id),clone(p));}this.write(this.metaKey(id),{app:APP_ID,revision,checkpoint,pending:null,conflict:null,lastSyncedAt:null});}
  initialize(legacy){
    let index=this.read(INDEX_KEY);if(!index){this.install('local',initialSpace(legacy));index={app:APP_ID,schema:1,defaultSpace:'local',spaces:{local:{label:'本机护照'}}};this.write(INDEX_KEY,index);}
    if(index.app!==APP_ID||index.schema!==1)throw new Error('账号索引不属于诗游记。');
    let active;try{active=JSON.parse(this.session.getItem(ACTIVE_KEY)||'null');}catch{active=null;}
    this.spaceId=index.spaces[active?.spaceId]?active.spaceId:index.defaultSpace||'local';
    const payload=this.payload();this.profileId=payload.profiles[active?.profileId]&&!isDeleted(payload.profiles[active?.profileId])?active.profileId:this.ordered(payload)[0].id;this.remember();
    for(const p of Object.values(payload.profiles))this.cache.set(this.profileKey(this.spaceId,p.id),clone(p));
    return this.current();
  }
  ordered(payload=this.payload()){return Object.values(payload.profiles).filter(p=>!isDeleted(p)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
  current(){const p=this.payload();if(!p.profiles[this.profileId]||isDeleted(p.profiles[this.profileId])){this.profileId=this.ordered(p)[0].id;this.remember();}return clone(p.profiles[this.profileId].data);}
  context(){return this.spaceId+'/'+this.profileId;}
  remember(){this.session.setItem(ACTIVE_KEY,JSON.stringify({spaceId:this.spaceId,profileId:this.profileId}));}
  code(id=this.spaceId){return this.read(CODES_KEY,{})[id]??null;}
  codeSet(id,code){const all=this.read(CODES_KEY,{});if(code)all[id]=code;else delete all[id];this.write(CODES_KEY,all);}
  status(id=this.spaceId){const m=this.meta(id);if(m.localConflict||m.conflict&&!m.conflict.initialCollision)return {state:'conflict',message:'同步有冲突，双方内容均已保留，请选择处理方式'};const state=this.statuses.get(id);return state&&state.state!=='conflict'?state:{state:this.code(id)?'idle':'local',message:this.code(id)?'等待同步':'仅保存在本机'};}
  notify(id=this.spaceId,contextChanged=false){if(id===this.spaceId)this.current();this.onChange({spaceId:id,contextChanged,context:this.context(),status:this.status(id)});}
  setStatus(id,state,message){this.statuses.set(id,{state,message});this.notify(id);}
  saveCurrent(data,expectedContext=this.context(),baseline=null){
    if(expectedContext!==this.context())throw new Error('账号已切换，这次结果未写入其他账号。');
    const payload=this.payload(),current=payload.profiles[this.profileId];if(!current||isDeleted(current))throw new Error('该账号已移入回收站，这次结果未写入其他账号。');const record={...current,data:clone(data)},wrap=p=>({_app:APP_ID,schema:1,profiles:{[p.id]:p}});
    const result=baseline?mergeSpaces(wrap({...current,data:baseline}),wrap(record),wrap(current)):{merged:wrap(record),conflicts:[]};
    const checked=validateSpace(result.merged,this.poemIds),saved=checked.profiles[this.profileId],key=this.profileKey(this.spaceId,saved.id);this.write(key,saved);this.cache.set(key,clone(saved));
    if(result.conflicts.length){const m=this.meta();m.localConflict={conflicts:result.conflicts};this.write(this.metaKey(this.spaceId),m);this.setStatus(this.spaceId,'conflict','两个窗口的修改有冲突，双方内容均已保留');}
    this.schedule(this.spaceId);return {data:clone(saved.data),conflicts:result.conflicts.length};
  }
  addProfile(name,stage,grade=null){const payload=this.payload();if(this.ordered(payload).length>=MAX_PROFILES)throw new Error('每组护照最多 20 个可用学习账号。');if(Object.keys(payload.profiles).length>=MAX_PROFILE_RECORDS)throw new Error('含回收站的账号已达 100 个，请导出备份并另建护照组。');const data=initialData();data.profile={name:String(name).trim(),stage,grade};const record=newProfile(data);validateSpace({...payload,profiles:{...payload.profiles,[record.id]:record}},this.poemIds);this.write(this.profileKey(this.spaceId,record.id),record);this.cache.set(this.profileKey(this.spaceId,record.id),clone(record));this.profileId=record.id;this.remember();this.notify(this.spaceId,true);this.schedule(this.spaceId);return record.id;}
  switchProfile(id){if(!this.payload().profiles[id]||isDeleted(this.payload().profiles[id]))throw new Error('找不到可用学习账号；已删除的账号需先从回收站恢复。');this.profileId=id;this.remember();this.notify(this.spaceId,true);}
  switchSpace(id){const index=this.read(INDEX_KEY);if(!index.spaces[id])throw new Error('找不到这组护照。');this.spaceId=id;this.profileId=this.ordered()[0].id;index.defaultSpace=id;this.write(INDEX_KEY,index);this.remember();this.notify(id,true);this.schedule(id,0);}
  deleted(payload=this.payload()){return Object.values(payload.profiles).filter(isDeleted).sort((a,b)=>b.lifecycle.changedAt.localeCompare(a.lifecycle.changedAt)||a.id.localeCompare(b.id));}
  changeProfileState(id,deleted,{spaceId=this.spaceId,expectedLifecycle=undefined,expectedName=undefined}={}){
    if(spaceId!==this.spaceId)throw new Error('护照组已切换，请重新选择账号。');
    const payload=this.payload(),record=payload.profiles[id];if(!record)throw new Error('找不到这个学习账号。');
    if(expectedName!==undefined&&record.data.profile.name!==expectedName)throw new Error('账号名字已变化，请重新核对后操作。');
    if(expectedLifecycle!==undefined&&JSON.stringify(record.lifecycle)!==expectedLifecycle)throw new Error('该账号的状态已变化，请重新核对后操作。');
    if(isDeleted(record)===deleted)throw new Error(deleted?'该账号已在回收站。':'该账号已经恢复。');
    if(deleted&&this.ordered(payload).length<=1)throw new Error('至少保留一个可用账号，请先建立另一个学习账号。');
    if(!deleted&&this.ordered(payload).length>=MAX_PROFILES)throw new Error('可用账号已达 20 个，请先删除另一个账号后再恢复。');
    const next={...record,lifecycle:{revision:(record.lifecycle?.revision||0)+1,deleted,changedAt:new Date().toISOString(),operationId:crypto.randomUUID()}},draft={...payload,profiles:{...payload.profiles,[id]:next}};
    validateSpace(draft,this.poemIds);const key=this.profileKey(this.spaceId,id);this.write(key,next);this.cache.set(key,clone(next));
    if(deleted&&this.profileId===id){this.profileId=this.ordered(draft)[0].id;this.remember();}
    this.setStatus(this.spaceId,this.code()?'pending':'local',deleted?(this.code()?'已移入回收站，等待云同步；可恢复':'账号已移入回收站，可恢复'):(this.code()?'账号已恢复，等待云同步':'账号及学习记录已恢复'));this.schedule(this.spaceId);return clone(next);
  }
  deleteProfile(id,options={}){return this.changeProfileState(id,true,options);}
  restoreProfile(id,options={}){return this.changeProfileState(id,false,options);}
  async request(code,options={}){
    const response=await this.fetcher(apiUrl('/api/poetry-sync'),{...options,headers:{Authorization:'Bearer '+encodeURIComponent(code),'X-Poetry-Code-Encoding':'uri','X-Poetry-Client':'14',...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
    const body=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(body.error||'云同步暂时不可用，本机数据已保留。');error.status=response.status;error.code=body.code;throw error;}
    if(body.app!==APP_ID)throw new Error('云端不是诗游记的同步空间，已停止读取。');return body;
  }
  async createCode(){
    const code=generateCode(),id=await codeHash(code),seed=this.payload();this.install(id,seed);
    const index=this.read(INDEX_KEY);index.spaces[id]={label:'同步护照'};this.write(INDEX_KEY,index);this.codeSet(id,code);this.switchSpace(id);
    const meta=this.meta(id);meta.pending={id:crypto.randomUUID(),base:0,payload:seed,localSnapshot:seed,body:JSON.stringify(seed)};this.write(this.metaKey(id),meta);
    await this.sync(id);return code;
  }
  async connectCode(input){
    const context=this.context(),code=normalizeCode(input),id=await codeHash(code),index=this.read(INDEX_KEY);
    const check=()=>{this.current();if(this.context()!==context)throw new Error('学习账号已切换，请在当前账号重新设置同步码。');};check();
    if(index.spaces[id]){this.codeSet(id,code);this.switchSpace(id);await this.sync(id);return;}
    const remote=await this.request(code);const payload=validateSpace(remote.payload,this.poemIds);if(!Number.isSafeInteger(remote.revision)||remote.revision<1)throw new Error('云端版本无效。');check();
    this.install(id,payload,{checkpoint:payload,revision:remote.revision});const latest=this.read(INDEX_KEY);latest.spaces[id]={label:'同步护照'};this.write(INDEX_KEY,latest);this.codeSet(id,code);this.switchSpace(id);this.setStatus(id,'success','已连接并同步');
  }
  async useCode(input,{expectedContext=this.context()}={}){
    const code=normalizeCode(input),source=this.spaceId,selected=this.profileId,id=await codeHash(code);
    const check=()=>{this.current();if(this.context()!==expectedContext)throw new Error('学习账号已切换，请在当前账号重新设置同步码。');};check();
    if(this.read(INDEX_KEY).spaces[id]){await this.connectCode(code);return;}
    const join=async()=>{check();await this.connectCode(code);};
    let setup=this.meta(source).codeSetup;
    if(setup?.spaceId!==id){
      try{await this.request(code);await join();return;}catch(error){if(error.status!==404||error.code!=='NOT_FOUND')throw error;}
      check();const seed=this.payload(source);setup={spaceId:id,requestId:crypto.randomUUID(),seed,body:JSON.stringify(seed)};
      const meta=this.meta(source);meta.codeSetup=setup;this.write(this.metaKey(source),meta);
    }
    check();let ack;
    try{ack=await this.request(code,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'0','Idempotency-Key':setup.requestId},body:setup.body});}
    catch(error){
      if(error.status!==409||error.code!=='REVISION_CONFLICT')throw error;
      // Another device claimed the same new code. Its data stays authoritative;
      // this device's original passport remains in its original local space.
      check();await join();const meta=this.meta(source);if(meta.codeSetup?.requestId===setup.requestId){delete meta.codeSetup;this.write(this.metaKey(source),meta);}return;
    }
    check();if(!Number.isSafeInteger(ack.revision)||ack.revision<1)throw new Error('云端回执无效，本机护照已保留，请重试。');
    const local=this.payload(source);this.install(id,local,{checkpoint:setup.seed,revision:ack.revision});
    const index=this.read(INDEX_KEY);index.spaces[id]={label:'同步护照'};this.write(INDEX_KEY,index);this.codeSet(id,code);this.switchSpace(id);
    if(local.profiles[selected]&&!isDeleted(local.profiles[selected]))this.switchProfile(selected);
    const meta=this.meta(source);if(meta.codeSetup?.requestId===setup.requestId){delete meta.codeSetup;this.write(this.metaKey(source),meta);}
    await this.sync(id);
  }
  disconnect(){const id=this.spaceId;this.codeSet(id,null);this.setStatus(id,'local','已断开同步，账号和进度仍保留在本机');}
  schedule(id=this.spaceId,delay=1500){if(!this.code(id))return;clearTimeout(this.timers.get(id));this.timers.set(id,setTimeout(()=>{this.timers.delete(id);void this.sync(id);},delay));}
  apply(id,payload,base){
    const current=this.payload(id),rebased=mergeSpaces(base,current,payload);const checked=validateSpace(rebased.merged,this.poemIds);
    for(const p of Object.values(checked.profiles)){const key=this.profileKey(id,p.id);if(!same(this.read(key),p))this.write(key,p);this.cache.set(key,clone(p));}
    for(const old of Object.keys(current.profiles))if(!checked.profiles[old])this.storage.removeItem(this.profileKey(id,old));
    return rebased;
  }
  async pendingWrite(id){
    const before=this.meta(id),p=before.pending;if(!p)return true;let ack;
    const boundCode=this.code(id);
    try{ack=await this.request(boundCode,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':String(p.base),'Idempotency-Key':p.id},body:p.body});}
    catch(error){if(error.status===409){const m=this.meta(id);if(m.pending?.id===p.id){m.pending=null;if(p.base===0&&!m.checkpoint)m.conflict={initialCollision:true};this.write(this.metaKey(id),m);}if(p.base===0&&!before.checkpoint)throw new Error('此同步码未能创建，请保留本机数据并重新创建一个码。');return false;}throw error;}
    if(this.code(id)!==boundCode)return true;
    if(!Number.isSafeInteger(ack.revision)||ack.revision<1)throw new Error('云端回执无效，本机待同步记录已保留。');
    const m=this.meta(id);if(ack.revision<m.revision)return true;
    const rebase=this.apply(id,p.payload,p.localSnapshot);m.checkpoint=p.payload;m.revision=ack.revision;m.lastSyncedAt=ack.updatedAt;if(m.pending?.id===p.id)m.pending=null;
    if(rebase.conflicts.length)m.conflict={revision:ack.revision,localHash:canonical(rebase.merged),conflicts:rebase.conflicts};this.write(this.metaKey(id),m);this.notify(id);return true;
  }
  sync(id=this.spaceId,options={}){
    clearTimeout(this.timers.get(id));this.timers.delete(id);
    const running=this.syncTasks.get(id);if(running)return options.resolution?running.then(()=>this.sync(id,options)):running;
    const task=this.performSync(id,options).finally(()=>this.syncTasks.delete(id));this.syncTasks.set(id,task);return task;
  }
  async performSync(id,{resolution=null,expectedRevision=null,expectedLocalHash=null}={}){
    if(!this.code(id)||this.busy.has(id))return false;
    const run=async()=>{
      this.busy.add(id);this.setStatus(id,'syncing','正在同步');
      try{
        if(this.meta(id).localConflict){this.setStatus(id,'conflict','本机窗口之间有冲突，双方内容均已保留');return false;}
        if(this.meta(id).conflict?.initialCollision)throw new Error('同步码创建冲突，请重新创建同步码。');
        if(this.meta(id).pending)await this.pendingWrite(id);
        for(let attempt=0;attempt<4;attempt++){
          const m=this.meta(id);if(m.conflict&&!resolution){this.setStatus(id,'conflict','本机与云端有冲突，请选择保留方式');return false;}
          const boundCode=this.code(id),local=this.payload(id),remote=await this.request(boundCode),cloud=validateSpace(remote.payload,this.poemIds);if(this.code(id)!==boundCode)return false;
          if(!Number.isSafeInteger(remote.revision)||remote.revision<1)throw new Error('云端版本无效。');
          if(resolution&&(remote.revision!==expectedRevision||canonical(local)!==expectedLocalHash)){m.conflict=null;this.write(this.metaKey(id),m);resolution=null;this.setStatus(id,'conflict','数据已变化，请重新核对冲突');}
          const result=mergeSpaces(m.checkpoint,local,cloud,{preference:resolution});
          if(result.conflicts.length&&!resolution){m.conflict={revision:remote.revision,localHash:canonical(local),conflicts:result.conflicts};this.write(this.metaKey(id),m);this.setStatus(id,'conflict','本机与云端有冲突，双方数据均已保留');return false;}
          const merged=validateSpace(result.merged,this.poemIds);
          if(same(merged,cloud)){const rebase=this.apply(id,cloud,local);m.checkpoint=cloud;m.revision=remote.revision;m.pending=null;m.conflict=rebase.conflicts.length?{revision:remote.revision,localHash:canonical(rebase.merged),conflicts:rebase.conflicts}:null;m.lastSyncedAt=remote.updatedAt;this.write(this.metaKey(id),m);this.notify(id);break;}
          m.conflict=null;m.pending={id:crypto.randomUUID(),base:remote.revision,payload:merged,localSnapshot:local,body:JSON.stringify(merged)};this.write(this.metaKey(id),m);
          if(await this.pendingWrite(id))break;
        }
        const end=this.meta(id);if(end.pending){this.setStatus(id,'pending','云端仍在变化，正在保留待同步内容');this.schedule(id,3000);return false;}
        if(end.conflict){this.setStatus(id,'conflict','同步有冲突，双方数据均已保留');return false;}
        this.setStatus(id,'success','已同步');if(!same(this.payload(id),end.checkpoint))this.schedule(id);return true;
      }catch(error){if(this.code(id))this.setStatus(id,'error',error.name==='TimeoutError'?'网络较慢，待同步内容已保存在本机':error.name==='TypeError'?'网络暂不可用，待同步内容已保存在本机，联网后重试':error.message||'同步失败，本机数据已保留');return false;}
      finally{this.busy.delete(id);}
    };
    if(globalThis.navigator?.locks)return navigator.locks.request('shiyouji-sync-'+id,run);return run();
  }
  async conflictBackup(){const id=this.spaceId,m=this.meta(),local=this.payload(id);if(m.localConflict)return {_app:APP_ID,kind:'local-conflict-backup',local,alternative:chooseConflicts(local,m.localConflict.conflicts,'cloud')};const remote=await this.request(this.code(id));return {_app:APP_ID,kind:'sync-conflict-backup',local,cloud:validateSpace(remote.payload,this.poemIds),revision:remote.revision};}
  async resolve(preference){
    const id=this.spaceId,m=this.meta(),local=this.payload(id),conflict=m.localConflict||m.conflict;if(!conflict||conflict.initialCollision)throw new Error('当前没有可处理的普通同步冲突。');
    let draft=local;
    if(!m.localConflict){const remote=await this.request(this.code(id));if(remote.revision!==conflict.revision||canonical(local)!==conflict.localHash){m.conflict=null;this.write(this.metaKey(id),m);await this.sync(id);this.setStatus(id,'conflict','数据已变化，请重新核对后再选择');return false;}draft=mergeSpaces(m.checkpoint,local,remote.payload).merged;m.checkpoint=validateSpace(remote.payload,this.poemIds);m.revision=remote.revision;}
    draft=validateSpace(chooseConflicts(draft,conflict.conflicts,preference),this.poemIds);m.localConflict=null;m.conflict=null;m.localResolution=crypto.randomUUID();this.write(this.metaKey(id),m);this.apply(id,draft,local);this.setStatus(id,this.code(id)?'idle':'local','冲突选择已保存在本机');if(this.code(id))return this.sync(id);this.notify(id);return true;
  }
  handleStorage(event){
    if(event.key===CODES_KEY){if(!this.code())this.setStatus(this.spaceId,'local','已断开同步，本机数据保留');return;}
    if(!event.key?.startsWith(PREFIX)||!event.newValue)return;
    const marker=':profile:',at=event.key.indexOf(marker);if(at<0){const previous=event.oldValue?JSON.parse(event.oldValue):{},next=JSON.parse(event.newValue);if(previous.localResolution!==next.localResolution)for(const key of this.cache.keys())if(key.startsWith(event.key.replace(/:meta$/,':profile:')))this.cache.delete(key);if(event.key===this.metaKey(this.spaceId))this.notify();return;}
    const id=event.key.slice(PREFIX.length,at),record=JSON.parse(event.newValue),old=event.oldValue?JSON.parse(event.oldValue):undefined,cached=this.cache.get(event.key);
    const m=this.meta(id);
    if(!m.localConflict&&cached&&old&&!same(cached,record)&&!same(cached,old)){
      const wrap=p=>({_app:APP_ID,schema:1,profiles:{[p.id]:p}}),r=mergeSpaces(wrap(old),wrap(cached),wrap(record));
      if(r.conflicts.length){m.localConflict={conflicts:r.conflicts};this.write(this.metaKey(id),m);this.setStatus(id,'conflict','两个窗口的修改有冲突，双方内容均已保留');}
      if(!same(r.merged.profiles[record.id],record)){this.write(event.key,r.merged.profiles[record.id]);this.cache.set(event.key,clone(r.merged.profiles[record.id]));this.schedule(id);}else this.cache.set(event.key,clone(record));
    }else this.cache.set(event.key,clone(record));
    if(id===this.spaceId)this.notify(id);
  }
  start(){if(!globalThis.window)return;window.addEventListener('storage',e=>{try{this.handleStorage(e);}catch{this.setStatus(this.spaceId,'error','另一窗口的账号数据无法读取，本机内容已保留');}});for(const event of ['focus','online'])window.addEventListener(event,()=>this.schedule(this.spaceId,0));document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.schedule(this.spaceId,0);});this.poll=setInterval(()=>{if(!document.hidden)this.schedule(this.spaceId,0);},60000);this.schedule(this.spaceId,0);}
  stop(){clearInterval(this.poll);for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();}
}
