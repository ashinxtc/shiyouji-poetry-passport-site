// Completion guards prevent accidental taps from becoming reading achievements.
// These are interaction requirements, not a measurement of comprehension.
export function minimumReadingMs(lines){return Math.max(4000,Math.min(120000,lines.join('').replace(/[\s\p{P}]/gu,'').length*140));}
export class ReadingTracker {
  constructor(){this.sessions=new Map();}
  session(id){if(!this.sessions.has(id))this.sessions.set(id,{activeMs:0,lineMs:new Map(),audioCompleted:false});return this.sessions.get(id);}
  observe(id,indices,deltaMs){const s=this.session(id),delta=Math.max(0,Math.min(deltaMs,1200));s.activeMs+=delta;for(const index of new Set(indices))s.lineMs.set(index,(s.lineMs.get(index)||0)+delta);}
  audioEnded(id){this.session(id).audioCompleted=true;}
  status(id,lines){const s=this.session(id),covered=lines.map((_,index)=>index).filter(index=>(s.lineMs.get(index)||0)>=600),requiredMs=minimumReadingMs(lines);
    return {ready:s.audioCompleted||covered.length===lines.length&&s.activeMs>=requiredMs,activeMs:Math.round(s.activeMs),requiredMs,coveredLines:covered.length,totalLines:lines.length,audioCompleted:s.audioCompleted,missing:lines.map((_,n)=>n).filter(n=>!covered.includes(n))};
  }
  proof(id,lines){const s=this.status(id,lines);if(!s.ready)return null;return {method:s.audioCompleted?'listening':'reading',activeMs:s.activeMs,minimumMs:s.requiredMs,coveredLines:s.audioCompleted?lines.length:s.coveredLines,totalLines:lines.length,audioCompleted:s.audioCompleted};}
}
