export function normalizeSpeech(text,variants={}){return [...String(text||'').normalize('NFKC')].map(c=>variants[c]||c).join('').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();}
export function compareRecitation(lines,transcript,{variants={},phonetics={},expectedPinyin=null,title='',author='',durationMs=0,finalized=false,recognitionError=null,confidence=null}={}){
  const expected=normalizeSpeech(lines.join(''),variants),raw=normalizeSpeech(transcript,variants);
  const prefixes=[title+'唐'+author,title+author,title].filter(Boolean).map(s=>normalizeSpeech(s,variants)).sort((a,b)=>b.length-a.length);
  const headingDistance=(a,b)=>{let row=Array.from({length:b.length+1},(_,n)=>n);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}return row[b.length];};
  let actual=raw,ignoredPrefixChars=0;for(const prefix of prefixes){if(prefix&&raw.length-prefix.length>=expected.length&&!expected.startsWith(prefix)&&(raw.startsWith(prefix)||headingDistance(raw.slice(0,prefix.length),prefix)<=Math.min(3,Math.floor(prefix.length*.35)))){actual=raw.slice(prefix.length);ignoredPrefixChars=prefix.length;break;}}
  const truncated=actual.length>3500;if(truncated)actual=actual.slice(0,3500);
  const syllables=Array.isArray(expectedPinyin)?expectedPinyin.join(' ').replace(/[，。？！；]/g,'').trim().split(/\s+/):null;
  const homophone=(n,c)=>syllables?.length===expected.length&&phonetics[c]&&phonetics[c]===syllables[n];
  // Global alignment preserves repetitions, additions, omissions and order.
  const width=actual.length+1,matrix=new Uint16Array((expected.length+1)*width);
  for(let i=0;i<=expected.length;i++)matrix[i*width]=i;
  for(let j=0;j<=actual.length;j++)matrix[j]=j;
  for(let i=1;i<=expected.length;i++)for(let j=1;j<=actual.length;j++)matrix[i*width+j]=Math.min(matrix[(i-1)*width+j]+1,matrix[i*width+j-1]+1,matrix[(i-1)*width+j-1]+Number(expected[i-1]!==actual[j-1]&&!homophone(i-1,actual[j-1])));
  const operations=[];let i=expected.length,j=actual.length;
  while(i||j){
    const cost=matrix[i*width+j];
    if(i&&j&&cost===matrix[(i-1)*width+j-1]+Number(expected[i-1]!==actual[j-1]&&!homophone(i-1,actual[j-1]))){operations.push({type:expected[i-1]===actual[j-1]?'match':homophone(i-1,actual[j-1])?'homophone':'change',expected:expected[i-1],actual:actual[j-1],index:i-1});i--;j--;}
    else if(i&&cost===matrix[(i-1)*width+j]+1){operations.push({type:'missing',expected:expected[i-1],actual:null,index:i-1});i--;}
    else{operations.push({type:'extra',expected:null,actual:actual[j-1],index:i});j--;}
  }
  operations.reverse();
  const matched=operations.filter(x=>x.type==='match').length,homophones=operations.filter(x=>x.type==='homophone').length,distance=matrix[expected.length*width+actual.length];
  const minimumMs=Math.max(1000,expected.length*90);
  const enoughAudio=durationMs>=minimumMs;
  const exact=expected.length>0&&actual===expected,contentMatched=expected.length>0&&distance===0&&actual.length===expected.length&&homophones/expected.length<=.25;
  const confidenceAccepted=!Number.isFinite(confidence)||confidence>=.6&&confidence<=1;
  const status=contentMatched&&finalized&&!recognitionError&&enoughAudio&&confidenceAccepted&&!truncated?'matched':'review';
  const lineResults=[];let offset=0;
  for(const [index,line] of lines.entries()){const count=normalizeSpeech(line,variants).length,parts=operations.filter(x=>x.index>=offset&&(x.index<offset+count||index===lines.length-1&&x.index===expected.length)),lineMatched=parts.filter(x=>['match','homophone'].includes(x.type)).length;lineResults.push({number:index+1,expected:line,matched:lineMatched,total:count,exact:lineMatched===count&&!parts.some(x=>!['match','homophone'].includes(x.type)),operations:parts});offset+=count;}
  const assessable=finalized&&!recognitionError&&enoughAudio&&confidenceAccepted&&!truncated&&actual.length>0&&(contentMatched||distance>0);
  const assessment=status==='matched'?'passed':assessable?'practice':'unclear';
  const issues={missing:0,change:0,extra:0};for(const op of operations)if(Object.hasOwn(issues,op.type))issues[op.type]++;
  return {status,assessment,matchedLines:lineResults.filter(r=>r.exact).length,totalLines:lines.length,issueLineNumbers:lineResults.filter(r=>!r.exact).map(r=>r.number),issues,expectedChars:expected.length,recognizedChars:actual.length,matchedChars:matched,matchedUnits:matched+homophones,homophones,matchBasis:homophones?'phonetic':'characters',ignoredPrefixChars,distance,exact,enoughAudio,minimumMs,durationMs,finalized,recognitionError,truncated,confidence:Number.isFinite(confidence)&&confidence>=0&&confidence<=1?confidence:null,operations,lineResults,transcript:String(transcript||''),missingFields:Number.isFinite(confidence)?[]:['recognitionConfidence']};
}
