export function flowerView(game, {escape, icon}) {
  const {word, phase, note, hint, score, total, computer, answers} = game;
  const lastYou = answers.findLast(answer => answer.who === 'you');
  const lastComputer = game.lastComputer;
  const playing = phase === 'playing';
  const waiting = phase === 'requesting' || phase === 'checking';
  const recording = phase === 'recording';
  const listening = phase === 'listen';
  const voice = game.canSpeak();
  const title = playing ? '电脑在接令' : listening ? '电脑已接令' : waiting ? (phase === 'checking' ? '正在核对诗句' : '正在打开麦克风') : recording ? '正在录音' : '轮到你';
  const recent = lastComputer ? `<div class="flower-verse" aria-label="电脑回答"><p>${escape(lastComputer.text)}</p><small>${escape(lastComputer.poem.author)}《${escape(lastComputer.poem.title)}》</small></div>`
    : '<p class="flower-rule">说一句含令字的诗，电脑再接一句。</p>';
  const primary = listening ? '<button class="button primary full" data-action="flower-play">播放电脑的诗句</button>'
    : `<button class="button primary full" data-action="${recording ? 'flower-stop' : voice ? 'flower-start' : 'flower-text'}" ${waiting || playing ? 'disabled' : ''}>${icon(recording || voice ? 'microphone' : 'book', 20)}${recording ? '说完了，核对' : playing ? '听电脑接令' : waiting ? title + '…' : voice ? '说一句' : '打字接令'}</button>`;
  return `<section class="flower-page">
    <div class="flower-top"><h2>飞花令</h2><button class="text-button" data-action="flower-finish">结束本局</button></div>
    <div class="flower-board">
      <div class="flower-token" aria-label="令字 ${word}">${word}</div>
      <div class="flower-counts"><span>你接出 <strong>${total}</strong> 句</span><span>电脑 <strong>${computer}</strong> 句</span></div>
      <p class="flower-turn" aria-live="polite">${title}</p>
      ${recent}
      ${lastYou ? `<p class="flower-last">${lastYou.corrected ? '同音字已还原为' : '你接出了'}「${escape(lastYou.text)}」</p>` : ''}
      ${hint ? `<p class="flower-hint">想想《${escape(hint.poem.title)}》，这句以「${escape([...hint.text][0])}」开头。</p>` : ''}
      ${note ? `<p class="flower-note" role="status">${escape(note)}</p>` : ''}
    </div>
    <div class="flower-controls">
      ${primary}
      <div class="flower-options">${listening ? '<button class="text-button" data-action="flower-skip-audio">继续接令</button>' : recording || waiting ?
        '<button class="text-button" data-action="flower-cancel">取消本轮录音</button>' :
        `<button class="text-button" data-action="flower-hint" ${hint || playing ? 'disabled' : ''}>给个提示</button>${voice ? `<button class="text-button" data-action="flower-text" ${playing ? 'disabled' : ''}>打字</button>` : ''}${lastComputer ? `<button class="text-button" data-action="flower-play" ${playing ? 'disabled' : ''}>重听</button>` : ''}`}</div>
      <p class="flower-low">${voice ? '录音结束后联网核对' : '可用文字核对完整诗句'} · 独立接出 ${score} 句</p>
    </div>
  </section>`;
}

export function flowerResult(game, {escape, icon}) {
  const {word, total, score, won, best, newBest, saved, answers} = game;
  return `<section class="flower-page flower-result">
    <div class="flower-top"><h2>「${word}」字令</h2><button class="text-button" data-action="challenge-home">返回挑战</button></div>
    <div class="flower-summary">
      <p class="flower-turn">${won ? '电脑接不上了，你赢了' : '本局接令结束'}</p>
      <p>独立接出 <strong>${score}</strong> 句 · 提示后接出 ${total - score} 句</p>
      <small>${!saved && total ? '成绩未能保存' : newBest ? '刷新了本令个人最佳' : `本令个人最佳 ${best} 句`}</small>
    </div>
    <div class="flower-board">
      ${answers.length ? `<h3>本局回顾</h3><ol class="flower-review">${answers.map(answer => `<li><button class="flower-review-row" data-action="poem" data-id="${escape(answer.poem.id)}"><span class="flower-role">${answer.who === 'computer' ? '电脑' : answer.hinted ? '你 · 提示' : '你'}</span><span><strong>${escape(answer.text)}</strong><small>${escape(answer.poem.dynasty)} · ${escape(answer.poem.author)}《${escape(answer.poem.title)}》</small></span>${icon('right', 15)}</button></li>`).join('')}</ol>` : '<p class="flower-rule">这局还没有接出诗句。</p>'}
    </div>
    <div class="flower-controls"><button class="button primary full" data-action="setup-game" data-type="feihualing">再来一局</button></div>
  </section>`;
}
