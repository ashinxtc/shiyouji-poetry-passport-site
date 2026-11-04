export const HEADING_FIELDS=[{key:'title',label:'诗名'},{key:'dynasty',label:'朝代'},{key:'author',label:'作者'}];
export function headingRequirements(value,{strict=false}={}){
  if(value!==undefined&&value!==null&&(typeof value!=='object'||Array.isArray(value)))throw new Error('背诵信息设置格式无效');
  const out={};for(const {key} of HEADING_FIELDS){const item=value?.[key];if(strict&&item!==undefined&&typeof item!=='boolean')throw new Error('背诵信息设置无效');out[key]=item===true;}return out;
}
const dynasties=new Set(['唐','汉','南北朝','宋','元','明','清','晋','魏','五代']);
export function headingMetadata(poem){
  const title=typeof poem.title==='string'&&poem.title.trim()?poem.title.trim():null;
  const titles=[title,...String(poem.alternateTitle||'').split('/').map(t=>t.trim())].filter(Boolean);
  for(const item of [...titles]){const short=item.replace(/[（(][^）)]*[）)]/g,'').trim();if(short&&short!==item)titles.push(short);}
  const dynasty=dynasties.has(poem.dynasty)?poem.dynasty:null;
  const author=typeof poem.author==='string'&&poem.author.trim()&&!/诗经|乐府|古诗十九首/.test(poem.author)?poem.author.trim():null;
  return {title:{text:title,aliases:[...new Set(titles)],missingReason:title?null:'诗名未收录'},dynasty:{text:dynasty,aliases:dynasty?[dynasty,dynasty+'代',dynasty+'朝']:[],ignoredAliases:!dynasty&&typeof poem.dynasty==='string'?[poem.dynasty]:[],missingReason:dynasty?null:'朝代信息待核对'},author:{text:author,aliases:author?[author]:[],ignoredAliases:!author&&typeof poem.author==='string'?[poem.author]:[],missingReason:author?null:'作者栏为选集名称或信息待核对'}};
}
export function headingLabels(requirements){const checked=headingRequirements(requirements);return HEADING_FIELDS.filter(f=>checked[f.key]).map(f=>f.label);}
