export function hasPinyin(poem){return Array.isArray(poem?.pinyin)&&poem.pinyin.length===poem.lines.length;}
export function applyPinyinCatalog(poems,catalog){
  if(catalog?.schema!==1||!Array.isArray(catalog.items))throw new Error('拼音资料格式无效');
  const byId=new Map(poems.map(p=>[p.id,p])),seen=new Set();
  for(const item of catalog.items){
    const poem=byId.get(item.id);
    if(!poem||seen.has(item.id)||item.title!==poem.title||JSON.stringify(item.lines)!==JSON.stringify(poem.lines)||!Array.isArray(item.pinyin)||item.pinyin.length!==poem.lines.length)throw new Error('拼音资料与诗文版本不一致');
    seen.add(item.id);
    if(item.pinyin.some((line,i)=>typeof line!=='string'||line.trim().split(/\s+/).length!==(poem.lines[i].match(/[\u3400-\u9fff]/g)||[]).length))throw new Error('拼音字数与原文不一致');
  }
  const supplied=new Map(catalog.items.map(item=>[item.id,item]));
  return poems.map(p=>{const item=supplied.get(p.id);return hasPinyin(p)||!item?p:{...p,pinyin:[...item.pinyin],pinyinReview:item.review,missing:(p.missing||[]).filter(key=>key!=='pinyin')};});
}
export function pinyinState(poem,{reading=true,scene=false,enabled=true,error=null}={}){
  const available=hasPinyin(poem);
  return {visible:reading,available,shown:reading&&!scene&&available&&enabled,action:available?'pinyin':'pinyin-info',label:available?'拼音':error?'拼音重试':'拼音待补'};
}
