// Layout budgets keep the outer app fixed while preserving every verse in long poems.
export function versePages(lines,{width=300,height=500,pinyin=false,game=false,family=false,titleLength=6}={}){
  const font=24;
  const columns=Math.max(6,Math.floor(width/(font+1)));
  const titleRows=Math.min(3,Math.ceil(titleLength/Math.max(8,Math.floor(width/22))));
  const reserve=(game?(family?(height<430?290:320):250):230)+(titleRows-1)*25;
  const budget=Math.max(78,height-reserve);
  const weight=line=>Math.ceil([...line].length/columns)*33+(pinyin?16:0)+8;
  const pages=[];let start=0,cost=0;
  for(let i=0;i<lines.length;){
    const end=Math.min(i+2,lines.length),pairCost=lines.slice(i,end).reduce((sum,line)=>sum+weight(line),0);
    if(i>start&&cost+pairCost>budget){pages.push({start,end:i});start=i;cost=0;}
    if(pairCost>budget&&end-i===2){
      for(let n=i;n<end;n++){const amount=weight(lines[n]);if(n>start&&cost+amount>budget){pages.push({start,end:n});start=n;cost=0;}cost+=amount;}
    }else cost+=pairCost;
    i=end;
  }
  if(start<lines.length)pages.push({start,end:lines.length});
  return pages;
}
export function listPageSize(height){return Math.max(2,Math.min(10,Math.floor((height-166)/66)));}
export function stampPageSize(height){return Math.max(2,Math.min(8,Math.floor((height-80)/176)*2));}
