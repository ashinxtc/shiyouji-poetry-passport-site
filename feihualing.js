import {normalizeSpeech, compareRecitation} from './recitation.js?v=70';

export const FLOWER_WORDS = ['月', '春', '花', '风', '山', '雨', '水', '云'];

export function buildFlowerIndex(poems, proseIds, variants, phonetics) {
  const byText = new Map();
  const byLength = new Map();
  for (const poem of poems) {
    if (poem.archived || proseIds.has(poem.id)) continue;
    const body = normalizeSpeech(poem.lines.join(''), variants);
    const readings = phonetics?.references?.[body]?.syllables;
    let offset = 0;
    for (const row of poem.lines) {
      for (const fragment of row.split(/[，。！？；、：,.!?;:]/u)) {
        const text = normalizeSpeech(fragment, variants);
        const length = [...text].length;
        const pinyin = readings?.length === [...body].length ? readings.slice(offset, offset + length) : null;
        offset += length;
        if (!/^\p{Script=Han}{1,40}$/u.test(text)) continue;
        const source = {poem, pinyin};
        if (byText.has(text)) {
          byText.get(text).sources.push(source);
          continue;
        }
        const line = {text, sources: [source]};
        byText.set(text, line);
        if (!byLength.has(length)) byLength.set(length, []);
        byLength.get(length).push(line);
      }
    }
  }
  return {byText, byLength};
}

export function judgeFlowerAnswer(index, word, used, transcript, {speech = false, variants, phonetics} = {}) {
  const text = normalizeSpeech(transcript, variants);
  if (!text) return {status: 'empty'};
  let line = index.byText.get(text);
  if (!line && speech) {
    const matches = (index.byLength.get([...text].length) || []).filter(candidate =>
      candidate.sources.some(({pinyin}) => compareRecitation([candidate.text], text, {
        variants, phonetics, expectedPinyin: pinyin, durationMs: Infinity, finalized: true
      }).distance === 0)
    );
    if (matches.length > 1) return {status: 'ambiguous'};
    [line] = matches;
  }
  if (!line) return {status: 'unknown'};
  if (!line.text.includes(word)) return {status: 'missing-word'};
  if (used.has(line.text)) return {status: 'duplicate'};
  return {status: 'accepted', line, corrected: line.text !== text};
}

export function flowerPool(index, catalog, word) {
  return (catalog?.words?.[word] || []).filter(text => catalog.clips?.[text]?.src && index.byText.has(text) && text.includes(word))
    .map(text => index.byText.get(text));
}

export function flowerSource(line, preferred) {
  return (line.sources.find(({poem}) => preferred.has(poem.id)) || line.sources[0]).poem;
}

export function chooseComputerLine(pool, used, familiar, reserved) {
  const playable = pool.filter(line => !used.has(line.text));
  const belongs = (line, set) => line.sources.some(({poem}) => set.has(poem.id));
  return playable.find(line => !belongs(line, reserved) && belongs(line, familiar))
    || playable.find(line => !belongs(line, reserved)) || playable[0] || null;
}

export function flowerHint(index, word, used, familiar, mastered) {
  const candidates = [...index.byText.values()].filter(line => /^\p{Script=Han}{5,7}$/u.test(line.text) && line.text.includes(word) && !used.has(line.text));
  return candidates.find(line => line.sources.some(({poem}) => mastered.has(poem.id)))
    || candidates.find(line => line.sources.some(({poem}) => familiar.has(poem.id)))
    || candidates[0] || null;
}
