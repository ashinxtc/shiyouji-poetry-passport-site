import {normalizeSpeech, pronunciationKey, compareRecitation} from './recitation.js?v=72';

const han = /^[\p{Script=Han}〇々]{1,80}$/u;
const phoneticBase = reading => pronunciationKey(reading)?.slice(0, -1);

function flowerShard(key, count) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return ((hash >>> 0) % count).toString(16).padStart(2, '0') + '.json';
}

export function validFlowerQuery(query) {
  const {word, mode, text, speech} = query ?? {};
  return ['line', 'couplet'].includes(mode) && typeof word === 'string' &&
    han.test(word) && [...word].length === 1 && typeof text === 'string' &&
    text.length <= 300 && typeof speech === 'boolean';
}

export async function matchIndexedFlowerAnswer({word, mode, text, speech}, {manifest, variants, loadShard}) {
  const normalized = normalizeSpeech(text, variants);
  if (!han.test(normalized)) return {status: 'unknown'};
  const units = [...normalized];
  const kind = mode === 'couplet' ? 'c' : 'l';
  const shards = new Map();
  const lookup = async key => {
    const file = flowerShard(key, manifest.shards);
    if (!shards.has(file)) shards.set(file, loadShard(file));
    return (await shards.get(file))[key] ?? [];
  };

  let rows = await lookup(kind + ':' + normalized);
  if (!rows.length && speech) {
    const readings = await loadShard('readings.json');
    const phonetics = {schema: 2, characters: readings};
    const bases = units.map(char => new Set((readings[char] ?? []).map(phoneticBase)));
    const first = new Set([units[0], ...bases[0]]);
    const results = await Promise.all([...first].filter(Boolean).map(key => lookup(kind + ':' + units.length + ':' + key)));
    rows = results.flat().filter(([parts, expectedPinyin]) => {
      if (![...parts.join('')].every((char, n) => char === units[n] || bases[n].has(phoneticBase(expectedPinyin[n])))) return false;
      return compareRecitation(parts, normalized, {variants, phonetics, expectedPinyin,
        durationMs: Infinity, finalized: true}).distance === 0;
    });
  }
  const unique = new Map(rows.map(row => [row[0].join('，'), row]));
  if (unique.size > 1) return {status: 'ambiguous'};
  if (!unique.size) {
    const incomplete = kind === 'c' && (await lookup('l:' + normalized)).length > 0;
    return {status: incomplete ? 'incomplete' : 'unknown'};
  }
  const [parts, , title, author, dynasty, path] = unique.values().next().value;
  if (!parts.some(part => part.includes(word))) return {status: 'missing-word'};
  return {status: 'accepted', parts, corrected: parts.join('') !== normalized, source: {
    title, author, dynasty,
    url: manifest.source + '/blob/' + manifest.revision + '/' + path.split('/').map(encodeURIComponent).join('/')
  }};
}
