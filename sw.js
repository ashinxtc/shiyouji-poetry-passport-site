const CACHE='shiyouji-v23-cover-first-20261103';
const ASSETS=['./api.js?v=23','./','./?v=23','./index.html','./app.css?v=23','./app-v2.css?v=23','./app-v3.css?v=23','./app-v4.css?v=23','./app-v5.css?v=23','./app-v6.css?v=23','./app-v7.css?v=23','./app-v8.css?v=23','./app-v9.css?v=23','./app-v10.css?v=23','./app-v15.css?v=23','./app-v16.css?v=23','./app-v17.css?v=23','./app-v18.css?v=23','./app-v19.css?v=23','./pinyin.js?v=23','./pinyin.json?v=23','./navigation.js?v=23','./curriculum.js?v=23','./grades.js?v=23','./grades.js','./textbook-poems.json?v=23','./curriculum.json?v=23','./curriculum-poems.json?v=23','./accounts.js?v=23','./account-ui.js?v=23','./sync-core.js?v=23','./illustrations.js?v=23','./effects.js?v=23','./app.js?v=23','./store.js?v=23','./store.js','./art.js?v=23','./book.js?v=23','./pagination.js?v=23','./reading.js?v=23','./recitation.js?v=23','./voice.js?v=23','./voice-ui.js?v=23','./speech-variants.json?v=23','./speech-phonetics.json?v=23','./poems.json?v=23','./credits.json?v=23','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./vendor/phosphor-icons.js','./vendor/manrope-400.woff2','./vendor/manrope-500.woff2','./vendor/manrope-600.woff2','./vendor/html2canvas.min.js','./vendor/three-LICENSE.txt','./vendor/html2canvas-LICENSE.txt','./vendor/chinese-poetry-LICENSE.txt'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('shiyouji-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function audioResponse(request,cache){
  let response=await cache.match(request.url);
  if(!response){const headers=new Headers(request.headers);headers.delete('Range');response=await fetch(new Request(request,{headers}));if(response.ok&&response.status===200)await cache.put(request.url,response.clone());}
  const range=request.headers.get('Range');if(!range||response.status!==200)return response;
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return response;
  const data=await response.arrayBuffer(),length=data.byteLength;
  const start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2]));
  const end=match[1]&&match[2]?Math.min(Number(match[2]),length-1):length-1;
  if(start>=length||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${length}`}});
  return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${length}`,'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(url.pathname.includes('/audio/')&&url.pathname.endsWith('.mp3'))return audioResponse(request,cache);
    if(/\/illustrations\/[^/]+\.webp$/.test(url.pathname)){const known=await cache.match(request);if(known)return known;const result=await fetch(request);if(result.ok)await cache.put(request,result.clone());return result;}
    if(/\/vendor\/three\.(module|core)\.js$/.test(url.pathname)){const known=await cache.match(request);if(known)return known;const result=await fetch(request);if(result.ok)await cache.put(request,result.clone());return result;}
    if(request.mode==='navigate'){try{return await fetch(request);}catch{return await cache.match(request)||await cache.match('./');}}
    return await cache.match(request)||fetch(request);
  })());
});
