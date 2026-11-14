import {compareRecitation,normalizeSpeech} from './recitation.js?v=69';
import {HEADING_FIELDS,headingRequirements,headingMetadata} from './recitation-options.js?v=69';

// Locate the beginning of the body independently. Omissions or additions inside
// the poem remain in the body alignment, never supplied from the reference.
export function comparePoemRecitation(poem,transcript,{requirements={},headings={},...options}={}){
  const variants=options.variants||{},phonetics=options.phonetics||{},meta=headingMetadata(poem),requested=headingRequirements(requirements);
  const effective=Object.fromEntries(HEADING_FIELDS.map(({key})=>[key,requested[key]&&!!meta[key].text]));
  const expected=normalizeSpeech(poem.lines.join(''),variants),units=[...expected],raw=[...normalizeSpeech(transcript,variants)];
  const supplied=Array.isArray(poem.pinyin)?poem.pinyin.join(' ').replace(/[，。？！；]/g,'').trim().split(/\s+/):null;
  const reference=supplied?.length===units.length?supplied:phonetics.references?.[expected]?.syllables;
  const length=Math.min(10,units.length),anchor=units.slice(0,length).join('');
  const referenceOptions={...options,title:'',author:'',expectedPinyin:reference?.length===units.length?[reference.slice(0,length).join(' ')]:null,durationMs:1000000,finalized:true,recognitionError:null,confidence:1};
  let cut=0,best=Infinity;
  if(length)for(let start=0;start<=Math.min(80,Math.max(0,raw.length-length));start++){
    const sample=raw.slice(start,start+length).join(''),match=compareRecitation([anchor],sample,referenceOptions);
    const score=match.distance*4+Math.min(12,Math.abs(raw.length-start-units.length));
    if(score<best){best=score;cut=start;}
  }
  const prefix=raw.slice(0,cut),claimed=new Set(),checks=[];
  // Longer fields claim their spans first: a dynasty character inside an author
  // name cannot satisfy two independently selected requirements.
  const ordered=[...HEADING_FIELDS].sort((a,b)=>(meta[b.key].text?.length||0)-(meta[a.key].text?.length||0));
  for(const field of ordered){
    const {key,label}=field,info=meta[key];if(!info.text){checks.push({key,label,required:false,status:requested[key]?'unavailable':'not-required',expected:null,recognized:null,homophones:null,missingReason:info.missingReason});continue;}
    let found=null,unclear=false;
    for(const alias of [...info.aliases].sort((a,b)=>b.length-a.length)){
      const text=normalizeSpeech(alias,variants),size=[...text].length,entry=headings.poems?.[poem.id]?.[key]?.find(x=>x.text===alias);
      for(let start=0;start+size<=prefix.length;start++){
        if(Array.from({length:size},(_,i)=>start+i).some(i=>claimed.has(i)))continue;
        const recognized=prefix.slice(start,start+size).join('');
        const result=compareRecitation([alias],recognized,{...referenceOptions,expectedPinyin:entry?.syllables?[entry.syllables.join(' ')]:null});
        if(result.status==='matched'){found={start,size,recognized,homophones:result.homophones};break;}
        if(result.missingFields.includes('phoneticPronunciation'))unclear=true;
      }
      if(found)break;
    }
    if(found)for(let i=found.start;i<found.start+found.size;i++)claimed.add(i);
    checks.push({key,label,required:effective[key],status:!effective[key]?'not-required':found?'matched':prefix.length?'mismatch':'missing',expected:info.text,recognized:found?.recognized??null,homophones:found?.homophones??null,missingReason:effective[key]&&!found&&unclear?'读音资料未能确认这项信息':null});
  }
  checks.sort((a,b)=>HEADING_FIELDS.findIndex(f=>f.key===a.key)-HEADING_FIELDS.findIndex(f=>f.key===b.key));
  const body=compareRecitation(poem.lines,raw.slice(cut).join(''),{...options,title:'',author:'',expectedPinyin:poem.pinyin});
  let headingUnexpected=prefix.filter((_,index)=>!claimed.has(index)).join('');
  for(const alias of Object.values(meta).flatMap(f=>f.ignoredAliases||[]).sort((a,b)=>b.length-a.length)){const text=normalizeSpeech(alias,variants);if(text)headingUnexpected=headingUnexpected.replace(text,'');}
  headingUnexpected=headingUnexpected.replace(/诗名|诗题|题目|朝代|作者|诗人|出自|正文|是|的/g,'');
  if(!headingUnexpected)for(const check of checks)if(check.required&&check.status==='mismatch')check.status='missing';
  const requiredChecks=checks.filter(c=>c.required),headingPassed=requiredChecks.every(c=>c.status==='matched')&&!headingUnexpected;
  const requiredChars=requiredChecks.reduce((sum,c)=>sum+[...normalizeSpeech(c.expected,variants)].length,0);
  const minimumMs=Math.max(1000,(body.expectedChars+requiredChars)*90),enoughAudio=options.durationMs>=minimumMs;
  const status=body.status==='matched'&&headingPassed&&enoughAudio?'matched':'review';
  const unclear=requiredChecks.some(c=>c.missingReason)||!enoughAudio||body.assessment==='unclear';
  return {...body,bodyStatus:body.status,status,assessment:status==='matched'?'passed':unclear?'unclear':'practice',minimumMs,enoughAudio,transcript:String(transcript||''),ignoredPrefixChars:cut,headingRequirements:effective,headingChecks:checks,headingUnexpected,headingPassed,headingMatched:Object.fromEntries(HEADING_FIELDS.map(({key})=>[key,effective[key]?checks.find(c=>c.key===key).status==='matched':null]))};
}
