let THREE;

const CURVE='cubic-bezier(.22,1,.36,1)';
const paint=()=>new Promise(resolve=>requestAnimationFrame(resolve));
let copyId=0;
// Match the CSS curve for the mesh instead of accelerating through the first half.
const ease=t=>{let s=t;for(let n=0;n<6;n++){const x=3*(1-s)*(1-s)*s*.22+3*(1-s)*s*s*.36+s*s*s,dx=.66*(1-s)*(1-s)+.84*(1-s)*s+1.92*s*s;if(dx)s=Math.max(0,Math.min(1,s-(x-t)/dx));}return 1-Math.pow(1-s,3);};
function paperCopy(node){
  const copy=node.cloneNode(true),prefix=`turn-${++copyId}-`,ids=new Map();
  for(const el of [copy,...copy.querySelectorAll('[id]')])if(el.id){ids.set(el.id,prefix+el.id);el.id=prefix+el.id;}
  for(const el of copy.querySelectorAll('*'))for(const attr of [...el.attributes]){
    if(attr.value.includes('url(#'))el.setAttribute(attr.name,attr.value.replace(/url\(#([^)]+)\)/g,(all,id)=>ids.has(id)?`url(#${ids.get(id)})`:all));
    if(['href','xlink:href'].includes(attr.name)&&ids.has(attr.value.slice(1)))el.setAttribute(attr.name,'#'+ids.get(attr.value.slice(1)));
  }
  copy.inert=true;copy.setAttribute('aria-hidden','true');copy.removeAttribute('data-swipe-bound');
  copy.style.transform='none';copy.style.animation='none';copy.style.transition='none';
  copy.querySelectorAll('.page-lift,[data-no-capture]').forEach(n=>n.remove());
  return copy;
}
function place(layer,board,page){const br=board.getBoundingClientRect(),pr=page.getBoundingClientRect();Object.assign(layer.style,{left:(pr.left-br.left)+'px',top:(pr.top-br.top)+'px',width:pr.width+'px',height:pr.height+'px'});}
export class BookMotion {
  constructor(enabled=()=>true){this.enabled=enabled;this.renderer=null;this.busy=false;this.mode='pending';this.webglFailed=false;}
  reduced(){return !this.enabled()||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  preferDOM(){return matchMedia('(max-width: 900px), (pointer: coarse)').matches;}
  async prepareRenderer(){try{THREE??=await import('./vendor/three.module.js');return this.initRenderer();}catch{this.webglFailed=true;this.mode='dom';return false;}}
  async capture(node){
    if(!window.html2canvas)throw new Error('snapshot unavailable');
    const svgSizes=[...node.querySelectorAll('svg')].map(svg=>{const r=svg.getBoundingClientRect();return {width:r.width,height:r.height};});
    return window.html2canvas(node,{scale:Math.min(devicePixelRatio||1,1.6),backgroundColor:'#fcfcf6',logging:false,useCORS:false,ignoreElements:el=>el.hasAttribute('data-no-capture'),onclone:doc=>{
      doc.querySelectorAll('.paper-sheet').forEach(p=>{p.style.animation='none';p.style.transition='none';p.style.backgroundImage='none';});
      doc.querySelector('.paper-right')?.querySelectorAll('svg').forEach((svg,i)=>{const size=svgSizes[i];if(size){svg.setAttribute('width',size.width);svg.setAttribute('height',size.height);svg.style.width=size.width+'px';svg.style.height=size.height+'px';}});
    }});
  }
  initRenderer(){
    if(this.webglFailed)return false;
    if(this.renderer){this.mode='webgl';return true;}
    try{
      this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.setClearColor(0,0);
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.domElement.className='turn-canvas';this.renderer.domElement.setAttribute('aria-hidden','true');
      this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.webglFailed=true;this.mode='dom';this.renderer.domElement.style.visibility='hidden';});
      this.mode='webgl';return true;
    }catch{this.webglFailed=true;this.mode='dom';return false;}
  }
  makeLeaf(canvas,board,page,forward){
    const br=board.getBoundingClientRect(),pr=page.getBoundingClientRect();
    const width=pr.width,height=pr.height,cols=48,rows=8;
    const geometry=new THREE.BufferGeometry();
    const count=(cols+1)*(rows+1),positions=new Float32Array(count*3),colors=new Float32Array(count*3),uvs=new Float32Array(count*2),indices=[];
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const n=row*(cols+1)+col;uvs[n*2]=col/cols;uvs[n*2+1]=1-row/rows;
      if(row<rows&&col<cols){const b=n+cols+1;indices.push(n,b,n+1,b,b+1,n+1);}
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    const material=new THREE.MeshBasicMaterial({map:texture,vertexColors:true,side:THREE.FrontSide,toneMapped:false});
    const backMaterial=new THREE.MeshBasicMaterial({color:'#f0f3e6',vertexColors:true,side:THREE.BackSide,toneMapped:false});
    const leaf=new THREE.Mesh(geometry,material),back=new THREE.Mesh(geometry,backMaterial);leaf.frustumCulled=false;back.frustumCulled=false;
    const scene=new THREE.Scene();scene.add(leaf,back);
    const camera=new THREE.OrthographicCamera(-br.width/2,br.width/2,br.height/2,-br.height/2,.1,4000);camera.position.z=2000;
    const hinge=pr.left-br.left-br.width/2,top=br.height/2-(pr.top-br.top);
    this.renderer.setSize(br.width,br.height,false);board.append(this.renderer.domElement);
    const update=t=>{
      const phase=forward?t:1-t,curl=Math.sin(Math.PI*phase),step=width/cols;
      for(let row=0;row<=rows;row++){
        const v=row/rows;let x=0,z=0;
        for(let col=0;col<=cols;col++){
          const u=col/cols,n=(row*(cols+1)+col)*3;
          const angle=Math.PI*phase+curl*(forward?1:-1)*(.84*(u-.1)+.16*(v-.5)*u);
          if(col){x+=Math.cos(angle)*step;z+=Math.sin(angle)*step;}
          positions[n]=hinge+x;positions[n+1]=top-v*height+curl*Math.sin(u*Math.PI)*8*(v-.5);positions[n+2]=Math.max(z,0)+3;
          const shade=Math.max(.64,1-.19*Math.abs(Math.sin(angle))-.035*curl*u);
          colors[n]=shade;colors[n+1]=shade;colors[n+2]=shade;
        }
      }
      geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;
      this.renderer.render(scene,camera);
    };
    return {update,dispose:()=>{geometry.dispose();material.dispose();backMaterial.dispose();texture.dispose();scene.clear();this.renderer.domElement.remove();if(!this.webglFailed)this.renderer.clear();}};
  }
  async domTurn(copy,board,page,forward){
    this.mode='dom';
    const layer=document.createElement('div');layer.className='dom-turn';layer.setAttribute('aria-hidden','true');place(layer,board,page);
    const leaf=document.createElement('div');leaf.className='dom-leaf';
    const front=document.createElement('div');front.className='turn-face turn-front';front.append(copy);
    const back=document.createElement('div');back.className='turn-face turn-back';
    leaf.append(front,back);layer.append(leaf);board.append(layer);
    const shadow=document.createElement('div');shadow.className='turn-shadow';place(shadow,board,page);board.append(shadow);
    const motion=forward?[{transform:'perspective(1400px) rotateY(0deg)'},{transform:'perspective(1400px) rotateY(-168deg)'}]:[{transform:'perspective(1400px) rotateY(-168deg)'},{transform:'perspective(1400px) rotateY(0deg)'}];
    const animations=[];
    try{
      animations.push(leaf.animate(motion,{duration:600,easing:CURVE,fill:'both'}));
      animations.push(layer.animate(forward?[{opacity:1,offset:0},{opacity:1,offset:.7},{opacity:0}]:[{opacity:0},{opacity:1,offset:.18},{opacity:1}],{duration:600,easing:CURVE,fill:'both'}));
      animations.push(shadow.animate([{opacity:0,transform:'scaleX(.5)'},{opacity:.16,transform:'scaleX(1)',offset:.38},{opacity:0,transform:'scaleX(.3)'}],{duration:600,easing:CURVE,fill:'both'}));
      await Promise.all(animations.map(a=>a.finished));
    }finally{animations.forEach(a=>a.cancel());layer.remove();shadow.remove();}
  }
  async turn(swap,direction=1){
    if(this.busy)return false;
    const old=document.querySelector('.paper-right');
    if(!old||this.reduced()){this.mode='none';document.documentElement.dataset.pageRenderer='none';swap();return true;}
    this.busy=true;document.getElementById('main').classList.add('is-turning');
    let leaf=null,safety=null,swapped=false;
    try{
      const oldBoard=old.closest('.book-board'),oldCopy=paperCopy(old);
      safety=document.createElement('div');safety.className='turn-safety';safety.setAttribute('aria-hidden','true');safety.append(paperCopy(old));place(safety,oldBoard,old);oldBoard.append(safety);
      let snapshot=null;
      const mesh=!this.preferDOM()&&await this.prepareRenderer();
      if(mesh)try{snapshot=await this.capture(old);}catch{/* Native DOM paper remains available. */}
      swap();swapped=true;
      const board=document.getElementById('book-board'),page=document.querySelector('.paper-right');
      if(!board||!page)return true;
      if(safety.parentElement!==board){place(safety,board,page);board.append(safety);}
      if(mesh&&snapshot&&direction<0)try{snapshot=await this.capture(page);}catch{snapshot=null;}
      // Guard against an empty/black snapshot rather than putting it over readable HTML.
      if(snapshot){const sample=document.createElement('canvas');sample.width=sample.height=24;const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(snapshot,0,0,24,24);const pixels=ctx.getImageData(0,0,24,24).data;let paper=0;for(let n=0;n<pixels.length;n+=4)if(pixels[n]+pixels[n+1]+pixels[n+2]>360&&pixels[n+3]>200)paper++;if(paper<24*24*.35)snapshot=null;}
      if(mesh&&snapshot&&!this.webglFailed){
        leaf=this.makeLeaf(snapshot,board,page,direction>0);
        leaf.update(0);
        await paint();if(direction>0)safety.remove();
        await new Promise(resolve=>{const start=performance.now(),duration=650;const tick=now=>{if(this.webglFailed){resolve();return;}const p=Math.min(1,(now-start)/duration);leaf.update(ease(p));if(p<1&&!document.hidden)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
      }else{
        const animation=this.domTurn(direction>0?oldCopy:paperCopy(page),board,page,direction>0);
        await paint();if(direction>0)safety.remove();await animation;
      }
      document.documentElement.dataset.pageRenderer=this.mode;
      return true;
    }catch{
      if(!swapped)swap();
      document.documentElement.dataset.pageRenderer='simple';return true;
    }finally{
      leaf?.dispose();safety?.remove();this.busy=false;document.getElementById('main').classList.remove('is-turning');
    }
  }
}
