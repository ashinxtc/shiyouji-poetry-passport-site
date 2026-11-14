import {normalizeSpeech, compareRecitation} from './recitation.js?v=71';

export const FLOWER_WORDS = ['月', '春', '花', '风', '山', '雨', '水', '云'];
export const FLOWER_MODES = ['line', 'couplet'];
export const flowerUnit = mode => mode === 'couplet' ? '联' : '句';

export function buildFlowerIndex(poems, proseIds, variants, phonetics, mode = 'line') {
  const byText = new Map();
  const byLength = new Map();
  const singleLines = new Set();
  for (const poem of poems) {
    if (poem.archived || proseIds.has(poem.id)) continue;
    const verse = poem.lines.join('');
    const body = normalizeSpeech(verse, variants);
    const bodyLength = [...body].length;
    const readings = phonetics?.references?.[body]?.syllables;
    const groups = mode === 'couplet'
      ? verse.split(/[。！？；.!?;]/u).map(group => group.split(/[，,]/u))
      : poem.lines.flatMap(row => row.split(/[，。！？；、：,.!?;:]/u)).map(fragment => [fragment]);
    let offset = 0;
    for (const group of groups) {
      const parts = group.map(fragment => normalizeSpeech(fragment, variants));
      const key = parts.join('');
      const length = [...key].length;
      const pinyin = readings?.length === bodyLength ? readings.slice(offset, offset + length) : null;
      offset += length;
      if (parts.length !== (mode === 'couplet' ? 2 : 1) || parts.some(part => !/^\p{Script=Han}{1,40}$/u.test(part))) continue;
      for (const part of parts) singleLines.add(part);
      const text = parts.join('，'), source = {poem, pinyin};
      if (byText.has(text)) {
        byText.get(text).sources.push(source);
        continue;
      }
      const line = {text, key, parts, sources: [source]};
      byText.set(text, line);
      if (!byLength.has(length)) byLength.set(length, []);
      byLength.get(length).push(line);
    }
  }
  return {byText, byLength, mode, singleLines};
}

export const usedFlowerLine = (line, used) => line.parts.some(part => used.has(part));

export function judgeFlowerAnswer(index, word, used, transcript, {speech = false, variants, phonetics} = {}) {
  const text = normalizeSpeech(transcript, variants);
  if (!text) return {status: 'empty'};
  const candidates = index.byLength.get([...text].length) || [];
  let matches = candidates.filter(candidate => candidate.key === text);
  if (!matches.length && speech) {
    matches = candidates.filter(candidate =>
      candidate.sources.some(({pinyin}) => compareRecitation([candidate.text], text, {
        variants, phonetics, expectedPinyin: pinyin, durationMs: Infinity, finalized: true
      }).distance === 0)
    );
  }
  if (matches.length > 1) return {status: 'ambiguous'};
  const [line] = matches;
  if (!line) return {status: index.mode === 'couplet' && index.singleLines.has(text) ? 'incomplete' : 'unknown'};
  if (!line.key.includes(word)) return {status: 'missing-word'};
  if (usedFlowerLine(line, used)) return {status: 'duplicate'};
  return {status: 'accepted', line, corrected: line.key !== text};
}

export function flowerPool(index, catalog, word) {
  const words = index.mode === 'couplet' ? catalog?.pairs : catalog?.words;
  return (words?.[word] || []).filter(text => catalog.clips?.[text]?.src && index.byText.has(text) && text.includes(word))
    .map(text => index.byText.get(text));
}

export function flowerSource(line, preferred) {
  return (line.sources.find(({poem}) => preferred.has(poem.id)) || line.sources[0]).poem;
}

export function chooseComputerLine(pool, used, familiar, reserved) {
  const playable = pool.filter(line => !usedFlowerLine(line, used));
  const belongs = (line, set) => line.sources.some(({poem}) => set.has(poem.id));
  return playable.find(line => !belongs(line, reserved) && belongs(line, familiar))
    || playable.find(line => !belongs(line, reserved)) || playable[0] || null;
}

export function flowerHint(index, word, used, familiar, mastered) {
  const candidates = [...index.byText.values()].filter(line => line.parts.every(part => /^\p{Script=Han}{5,7}$/u.test(part)) && line.key.includes(word) && !usedFlowerLine(line, used));
  return candidates.find(line => line.sources.some(({poem}) => mastered.has(poem.id)))
    || candidates.find(line => line.sources.some(({poem}) => familiar.has(poem.id)))
    || candidates[0] || null;
}
