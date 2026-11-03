// GitHub Pages preview uses the same production backend as the custom domain.
export function apiUrl(path,origin=globalThis.location?.origin){
  if(!path.startsWith('/api/'))throw new Error('Invalid poetry API path');
  return origin==='https://ashinxtc.github.io'?'https://www.poetry.daka-tool.top'+path:path;
}
