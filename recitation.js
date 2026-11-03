export function normalizeSpeech(text,variants={}){return [...String(text||'').normalize('NFKC')].map(c=>variants[c]||c).join('').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();}
const toneMarks={'\u0304':1,'\u0301':2,'\u030c':3,'\u0300':4};
export function pronunciationKey(value){
  if(typeof value!=='string')return null;
  let text=value.toLowerCase().replace(/u:|v/g,'ü').normalize('NFD'),tone=5;
  const numbered=text.match(/([0-5])$/);if(numbered){tone=Number(numbered[1])||5;text=text.slice(0,-1);}
  text=text.replace(/[\u0304\u0301\u030c\u0300]/g,mark=>{tone=toneMarks[mark];return '';}).normalize('NFC');
  return /^[a-züê]+$/.test(text)?text+tone:null;
}
export function compareRecitation(lines,transcript,{variants={},phonetics={},expectedPinyin=null,title='',author='',durationMs=0,finalized=false,recognitionError=null,confidence=null}={}){
  const expected=normalizeSpeech(lines.join(''),variants),raw=normalizeSpeech(transcript,variants),expectedUnits=[...expected];
  const prefixes=[title+'唐'+author,title+author,title].filter(Boolean).map(s=>normalizeSpeech(s,variants)).sort((a,b)=>b.length-a.length);
  const headingDistance=(a,b)=>{let row=Array.from({length:b.length+1},(_,n)=>n);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}return row[b.length];};
  let actual=raw,ignoredPrefixChars=0;for(const prefix of prefixes){if(prefix&&raw.length-prefix.length>=expectedUnits.length&&!expected.startsWith(prefix)&&(raw.startsWith(prefix)||headingDistance(raw.slice(0,prefix.length),prefix)<=Math.min(3,Math.floor(prefix.length*.35)))){actual=raw.slice(prefix.length);ignoredPrefixChars=prefix.length;break;}}
  let actualUnits=[...actual];
  const truncated=actualUnits.length>3500;if(truncated){actualUnits=actualUnits.slice(0,3500);actual=actualUnits.join('');}
  const dictionary=phonetics?.schema===2?phonetics.characters:phonetics;
  const supplied=Array.isArray(expectedPinyin)?expectedPinyin.join(' ').replace(/[，。？！；]/g,'').trim().split(/\s+/):null;
  const reference=phonetics?.schema===2?phonetics.references?.[expected]:null;
  const syllables=supplied?.length===expectedUnits.length?supplied:reference?.syllables?.length===expectedUnits.length?reference.syllables:null;
  const referenceSource=supplied?.length===expectedUnits.length?'poem-pinyin':reference?reference.source:'character-dictionary';
  const charCache=new Map(),keysFor=c=>{
    if(charCache.has(c))return charCache.get(c);
    const value=dictionary?.[c],keys=new Set((Array.isArray(value)?value:typeof value==='string'?[value]:[]).map(pronunciationKey).filter(Boolean));
    charCache.set(c,keys);return keys;
  };
  const expectedKeys=expectedUnits.map((c,n)=>{
    const key=pronunciationKey(syllables?.[n]);
    // Without a contextual reference, use only an unambiguous dictionary reading.
    const single=keysFor(c);return new Set(key?[key]:!syllables&&single.size===1?[...single]:[]);
  });
  for(let n=0;n<expectedUnits.length;n++){
    const keys=expectedKeys[n],key=[...keys][0],next=[...expectedKeys[n+1]||[]][0],nextTone=next?.slice(-1);
    if(expectedUnits[n]==='一'&&/^yi[124]$/.test(key||'')){
      keys.add('yi1');if(expectedUnits[n-1]!=='第'){if(nextTone==='4')keys.add('yi2');else if(['1','2','3'].includes(nextTone))keys.add('yi4');}
    }
    if(expectedUnits[n]==='不'&&/^bu[24]$/.test(key||'')){keys.add('bu4');if(nextTone==='4')keys.add('bu2');}
    if(key?.endsWith('3')&&nextTone==='3')keys.add(key.slice(0,-1)+'2');
  }
  const homophone=(n,c)=>{const accepted=expectedKeys[n];if(!accepted?.size)return false;for(const key of keysFor(c))if(accepted.has(key))return true;return false;};
  // Global alignment preserves repetitions, additions, omissions and order.
  const width=actualUnits.length+1,matrix=new Uint16Array((expectedUnits.length+1)*width);
  for(let i=0;i<=expectedUnits.length;i++)matrix[i*width]=i;
  for(let j=0;j<=actualUnits.length;j++)matrix[j]=j;
  for(let i=1;i<=expectedUnits.length;i++)for(let j=1;j<=actualUnits.length;j++)matrix[i*width+j]=Math.min(matrix[(i-1)*width+j]+1,matrix[i*width+j-1]+1,matrix[(i-1)*width+j-1]+Number(expectedUnits[i-1]!==actualUnits[j-1]&&!homophone(i-1,actualUnits[j-1])));
  const operations=[];let i=expectedUnits.length,j=actualUnits.length;
  while(i||j){
    const cost=matrix[i*width+j];
    if(i&&j&&cost===matrix[(i-1)*width+j-1]+Number(expectedUnits[i-1]!==actualUnits[j-1]&&!homophone(i-1,actualUnits[j-1]))){operations.push({type:expectedUnits[i-1]===actualUnits[j-1]?'match':homophone(i-1,actualUnits[j-1])?'homophone':'change',expected:expectedUnits[i-1],actual:actualUnits[j-1],index:i-1});i--;j--;}
    else if(i&&cost===matrix[(i-1)*width+j]+1){operations.push({type:'missing',expected:expectedUnits[i-1],actual:null,index:i-1});i--;}
    else{operations.push({type:'extra',expected:null,actual:actualUnits[j-1],index:i});j--;}
  }
  operations.reverse();
  const matched=operations.filter(x=>x.type==='match').length,homophones=operations.filter(x=>x.type==='homophone').length,distance=matrix[expectedUnits.length*width+actualUnits.length];
  const minimumMs=Math.max(1000,expectedUnits.length*90);
  const enoughAudio=durationMs>=minimumMs;
  const exact=expectedUnits.length>0&&actual===expected,contentMatched=expectedUnits.length>0&&distance===0&&actualUnits.length===expectedUnits.length;
  const confidenceAccepted=!Number.isFinite(confidence)||confidence>=.6&&confidence<=1;
  const status=contentMatched&&finalized&&!recognitionError&&enoughAudio&&confidenceAccepted&&!truncated?'matched':'review';
  const lineResults=[];let offset=0;
  for(const [index,line] of lines.entries()){const count=[...normalizeSpeech(line,variants)].length,parts=operations.filter(x=>x.index>=offset&&(x.index<offset+count||index===lines.length-1&&x.index===expectedUnits.length)),lineMatched=parts.filter(x=>['match','homophone'].includes(x.type)).length;lineResults.push({number:index+1,expected:line,matched:lineMatched,total:count,exact:lineMatched===count&&!parts.some(x=>!['match','homophone'].includes(x.type)),operations:parts});offset+=count;}
  const corrections=[];
  for(const row of lineResults){
    row.corrected=row.exact?row.expected:row.operations.map(op=>op.type==='homophone'?op.expected:op.actual??'□').join('');
    for(const op of row.operations)if(op.type==='homophone')corrections.push({line:row.number,position:op.index+1,from:op.actual,to:op.expected,referenceReading:syllables?.[op.index]??null});
  }
  const correctedLines=lineResults.map(row=>row.corrected),correctedTranscript=correctedLines.join('');
  const unresolvedPronunciationPositions=expectedKeys.map((keys,index)=>keys.size?null:index).filter(index=>index!==null);
  const phoneticResourceMissing=operations.some(op=>op.type==='change'&&(!expectedKeys[op.index]?.size||!keysFor(op.actual).size));
  const assessable=finalized&&!recognitionError&&enoughAudio&&confidenceAccepted&&!truncated&&actualUnits.length>0&&!phoneticResourceMissing&&(contentMatched||distance>0);
  const assessment=status==='matched'?'passed':assessable?'practice':'unclear';
  const issues={missing:0,change:0,extra:0};for(const op of operations)if(Object.hasOwn(issues,op.type))issues[op.type]++;
  return {status,assessment,correctedLines,correctedTranscript,corrections,referenceSource,unresolvedPronunciationPositions,matchedLines:lineResults.filter(r=>r.exact).length,totalLines:lines.length,issueLineNumbers:lineResults.filter(r=>!r.exact).map(r=>r.number),issues,expectedChars:expectedUnits.length,recognizedChars:actualUnits.length,matchedChars:matched,matchedUnits:matched+homophones,homophones,matchBasis:homophones?'phonetic':'characters',ignoredPrefixChars,distance,exact,enoughAudio,minimumMs,durationMs,finalized,recognitionError,truncated,confidence:Number.isFinite(confidence)&&confidence>=0&&confidence<=1?confidence:null,operations,lineResults,transcript:String(transcript||''),missingFields:[...(Number.isFinite(confidence)?[]:['recognitionConfidence']),...(phoneticResourceMissing?['phoneticPronunciation']:[])]};
}
