const CURVE='cubic-bezier(.22,1,.36,1)';
export class PassportEffects {
  constructor(enabled){
    this.enabled=enabled;this.seen=new WeakSet();this.frame=null;
    const dialog=document.getElementById('app-dialog');
    new MutationObserver(()=>{
      for(const stamp of dialog.querySelectorAll('.stamp.is-new'))if(!this.seen.has(stamp)){this.seen.add(stamp);if(this.active())this.celebrate(stamp);}
    }).observe(dialog,{childList:true,subtree:true});
  }
  active(){return this.enabled()&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden;}
  cover(root){
    const cover=root.querySelector('.passport-cover');if(!cover)return;
    this.coverObject=cover.closest('.passport-object');
    const envelope=document.createElement('span');envelope.className='cover-envelope';envelope.setAttribute('aria-hidden','true');envelope.dataset.noCapture='';this.coverObject.append(envelope);
    this.fitCover();
    const current=this.coverObject;document.fonts?.ready.then(()=>{if(this.coverObject===current)this.fitCover();});
    const foil=document.createElement('span');foil.className='cover-foil';foil.setAttribute('aria-hidden','true');foil.dataset.noCapture='';cover.append(foil);
    let last=0;
    const shine=()=>{if(!this.active()||performance.now()-last<1000)return;last=performance.now();foil.getAnimations().forEach(a=>a.cancel());foil.animate([{transform:'translateX(-140%) rotate(-18deg)',opacity:0},{opacity:.45,offset:.3},{opacity:.6,offset:.55},{transform:'translateX(180%) rotate(-18deg)',opacity:0}],{duration:1000,easing:CURVE});};
    cover.addEventListener('pointerdown',shine);cover.addEventListener('pointerenter',shine);
  }
  fitCover(){
    const object=this.coverObject;if(!object?.isConnected||object.classList.contains('opening'))return;
    const desk=object.closest('.cover-desk'),envelope=object.querySelector('.cover-envelope');if(!desk||!envelope)return;
    // Measure the transformed book including the projecting page block, not its flat layout box.
    object.style.setProperty('--cover-fit','1');object.style.setProperty('--cover-x','0px');object.style.setProperty('--cover-y','0px');
    const area=desk.getBoundingClientRect(),gutter=16;let scale=1,x=0,y=0;
    for(let n=0;n<3;n++){
      const bounds=envelope.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
      const factor=Math.min(1,(area.width-2*gutter)/bounds.width,(area.height-2*gutter)/bounds.height);
      if(factor<1){scale*=Math.max(.1,factor);object.style.setProperty('--cover-fit',String(scale));}
      const fitted=envelope.getBoundingClientRect();x+=(area.left+area.right-fitted.left-fitted.right)/2;y+=(area.top+area.bottom-fitted.top-fitted.bottom)/2;
      object.style.setProperty('--cover-x',x+'px');object.style.setProperty('--cover-y',y+'px');
    }
  }
  lift(sheet,dx){
    if(!this.active())return;
    this.dx=dx;this.sheet=sheet;if(this.frame)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;const s=this.sheet;if(!s?.isConnected)return;let fold=s.querySelector(':scope > .page-lift');if(!fold){fold=document.createElement('span');fold.className='page-lift';fold.setAttribute('aria-hidden','true');fold.dataset.noCapture='';s.append(fold);}
      fold.getAnimations().forEach(a=>a.cancel());const amount=Math.min(1,Math.abs(this.dx)/160);fold.classList.toggle('lift-left',this.dx>0);fold.style.opacity=String(amount*.85);fold.style.transform=`scaleX(${.25+amount*.75}) rotateY(${this.dx>0?-18:18}deg)`;
    });
  }
  release(sheet){
    if(this.frame){cancelAnimationFrame(this.frame);this.frame=null;}this.sheet=null;
    const fold=sheet.querySelector(':scope > .page-lift');if(!fold)return;
    if(!this.active()){fold.remove();return;}
    const animation=fold.animate([{opacity:getComputedStyle(fold).opacity,transform:fold.style.transform},{opacity:0,transform:'scaleX(.15) rotateY(0deg)'}],{duration:500,easing:CURVE});
    animation.finished.catch(()=>{}).finally(()=>{if(!fold.getAnimations().some(a=>a!==animation&&a.playState==='running'))fold.remove();});
  }
  celebrate(stamp){
    const burst=document.createElement('span');burst.className='stamp-burst';burst.setAttribute('aria-hidden','true');burst.dataset.noCapture='';
    const ring=document.createElement('i');ring.className='ink-ring';burst.append(ring);
    const animations=[ring.animate([{transform:'scale(.7)',opacity:0},{opacity:.6,offset:.2},{transform:'scale(1.65)',opacity:0}],{duration:1000,delay:200,easing:CURVE,fill:'both'})];
    for(let n=0;n<12;n++){
      const spark=document.createElement('i');spark.className='gold-spark';const angle=n*Math.PI/6,distance=64+(n%3)*16,rotation=n*37;burst.append(spark);
      animations.push(spark.animate([{transform:`translate(0,0) rotate(${rotation}deg) scale(.5)`,opacity:0},{opacity:.9,offset:.12},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) rotate(${rotation+75}deg) scale(.25)`,opacity:0}],{duration:1000,delay:220+n%3*40,easing:CURVE,fill:'both'}));
    }
    stamp.append(burst);Promise.allSettled(animations.map(a=>a.finished)).then(()=>{animations.forEach(a=>a.cancel());burst.remove();});
  }
}
