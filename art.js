import {PHOSPHOR_ICONS} from './vendor/phosphor-icons.js';
import {illustrationFor} from './illustrations.js?v=39';
export {illustrationFor,POEM_ILLUSTRATIONS} from './illustrations.js?v=39';
export function icon(name,size=20){return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${PHOSPHOR_ICONS[name]||PHOSPHOR_ICONS.book}</svg>`;}
const escapeArt=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function artworkImage(item,className='',loading='lazy'){
  const standard=item.variants.find(v=>v.width===960),full=item.variants.at(-1);
  return `<img draggable="false" class="${className}" data-art-image="${item.poemId}" src="${standard.src}" srcset="${item.variants.map(v=>`${v.src} ${v.width}w`).join(', ')}" sizes="${className==='art-gallery-image'?'(max-width: 850px) calc(100vw - 56px), 750px':'(max-width: 600px) calc(100vw - 100px), (max-width: 1100px) calc(50vw - 100px), 440px'}" width="${full.width}" height="${full.height}" loading="${loading}" decoding="async" alt="${escapeArt(item.alt)}">`;
}
export function poemArtwork(poem,className=''){
  const item=illustrationFor(poem.id);if(!item)return landscape(poem.theme,className);
  return `<button class="landscape poem-art-button ${className}" data-action="view-poem-art" data-id="${poem.id}" aria-label="查看《${escapeArt(poem.title)}》诗境插画">${artworkImage(item,'poem-illustration')}<span class="art-zoom caption-5">${icon('search',14)}看大图</span></button>`;
}

let artId=0;
export function landscape(theme='山河',className=''){
  const id=`land-${++artId}`;
  const winter=theme==='四季',moon=theme==='月色'||theme==='思念',forest=theme==='山林';
  return `<svg class="landscape ${className}" viewBox="0 0 440 310" fill="none" role="img" aria-label="${theme}诗境插画"><defs><linearGradient id="${id}-sky" x1="220" y1="0" x2="220" y2="310" gradientUnits="userSpaceOnUse"><stop stop-color="${moon?'#cedee8':'#dbe8e6'}"/><stop offset="1" stop-color="#f6f7ef"/></linearGradient><linearGradient id="${id}-water"><stop stop-color="#8fb7b4"/><stop offset="1" stop-color="#d8e8df"/></linearGradient></defs><rect width="440" height="310" rx="150" fill="url(#${id}-sky)"/><circle cx="315" cy="73" r="28" fill="${moon?'#fcf7d7':'#e6c993'}" opacity=".95"/><path d="m0 185 61-85 40 38 62-96 92 126 44-52 71 66 70-47v175H0Z" fill="#b2c9c4"/><path d="m0 216 75-77 37 40 62-86 73 116 67-51 126 80v72H0Z" fill="#749d99"/><path d="m0 257 85-46 75 23 73-38 74 61 133-33v86H0Z" fill="#3e7777"/><path d="M0 268c94-24 121 3 204-8s156-20 236-5v55H0Z" fill="url(#${id}-water)"/><path d="M130 281h106m-84 10h126m17-19h43" stroke="#eff4e9" stroke-width="2" stroke-linecap="round" opacity=".8"/><path d="m273 264 35 1-8 5h-21Z" fill="#254e55"/><path d="M288 264v-27l-14 23h14Z" fill="#faf5e5"/><path d="m55 69 8-4 8 4m8-6 7-4 7 4" stroke="#597a7b" stroke-width="1.7" stroke-linecap="round"/>${forest?'<path d="M40 252V111m0 17-17-21m17 43 21-26m-21 52-23-22m23 48 25-27" stroke="#2c6367" stroke-width="5" stroke-linecap="round"/>':''}${winter?'<path d="m130 136 44-43 32 51-32-15-16 10-13-14Z" fill="#f5f8ed" opacity=".85"/>':''}</svg>`;
}

export function emblem(){return `<svg viewBox="0 0 220 220" class="cover-emblem" fill="none" aria-hidden="true"><circle cx="110" cy="110" r="99" stroke="currentColor" stroke-width=".7"/><circle cx="110" cy="110" r="91" stroke="currentColor" stroke-width=".5" stroke-dasharray="1 5"/><path d="m27 136 33-35 18 17 27-46 42 64 24-32 24 32M29 145h163m-132 11h101m-117 9h126" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="151" cy="69" r="17" stroke="currentColor" stroke-width="1"/><path d="m59 69 7-4 7 4m5-10 6-3 6 3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M107 182h7" stroke="currentColor" stroke-width="2"/></svg>`;}
