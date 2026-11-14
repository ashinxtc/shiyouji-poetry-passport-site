import {apiUrl} from './api.js?v=70';
import {VoiceSession, voiceCapabilities} from './voice.js?v=70';
import {chooseComputerLine, flowerHint, flowerSource, judgeFlowerAnswer} from './feihualing.js?v=70';

export class FlowerPractice {
  constructor({word, index, pool, clips, familiar, reserved, variants, phonetics, update, finish, speechMode}) {
    Object.assign(this, {word, index, pool, clips, familiar, reserved, variants, phonetics, update, finish, speechMode});
    this.type = 'feihualing';
    this.phase = 'ready';
    this.answers = [];
    this.used = new Set();
    this.score = 0;
    this.total = 0;
    this.computer = 0;
    this.hint = null;
    this.note = '';
    this.session = new VoiceSession(({state, error}) => {
      if (this.phase === 'requesting' && state === 'recording') this.show('recording');
      else if (this.phase === 'recording' && error) void this.cancelTurn('录音中断，可以重说或打字。');
    });
  }

  show(phase, note = '') {
    this.phase = phase;
    this.note = note;
    this.update();
  }

  unlockAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    try {
      if (AudioContext) {
        this.audioContext ??= new AudioContext();
        this.audioContext.resume().catch(() => {});
      }
    } catch { /* A tap to play the MP3 remains available. */ }
  }

  canSpeak() {
    const cap = voiceCapabilities();
    return this.speechMode() === 'cloud' && cap.secure && cap.record;
  }

  async startRecording() {
    if (this.phase !== 'ready' || !this.canSpeak()) return;
    this.unlockAudio();
    this.show('requesting');
    try {
      await this.session.start();
    } catch {
      if (this.phase === 'requesting') this.show('ready', '麦克风未能开启，请允许录音或改用打字。');
    }
  }

  async stopRecording() {
    if (this.phase !== 'recording') return;
    const request = new AbortController();
    this.request = request;
    this.show('checking');
    const timeout = setTimeout(() => request.abort(), 15000);
    try {
      const recording = await this.session.stop();
      if (this.request !== request) return;
      if (!recording || recording.captureError || recording.durationMs < 650 || recording.blob.size < 256) {
        this.show('ready', '这一遍录音太短或中断了，请再说一遍。');
        return;
      }
      if (this.speechMode() !== 'cloud') {
        this.show('ready', '当前已关闭联网识别，可以打字作答。');
        return;
      }
      const response = await fetch(apiUrl('/api/transcribe'), {
        method: 'POST', body: recording.blob, headers: {'Content-Type': recording.mimeType},
        signal: request.signal
      });
      const payload = await response.json();
      if (this.phase !== 'checking' || this.request !== request) return;
      if (response.status === 429) {
        this.show('ready', '语音识别请求较多，等一会儿再试，也可以先打字。');
      } else if (!response.ok || typeof payload?.text !== 'string') {
        this.show('ready', '语音识别暂时不可用，可以重说或打字。');
      } else if (!payload.text.trim() || Number.isFinite(payload.confidence) && payload.confidence < .6 ||
        payload.segments?.some(line => line.noSpeechProbability > .6)) {
        this.show('ready', '这句没听清，可以慢一点再说一遍。');
      } else await this.answer(payload.text, true);
    } catch {
      if (this.request === request) this.show('ready', '语音核对未完成，可以重说或打字。');
    } finally {
      clearTimeout(timeout);
      if (this.request === request) {
        this.request = null;
        void this.session.cancel();
      }
    }
  }

  async cancelTurn(note = '') {
    const phase = this.phase;
    if (phase === 'playing') {
      this.stopPlayback?.();
      this.show('listen', note);
      return;
    }
    if (!['requesting', 'recording', 'checking'].includes(phase)) return;
    this.request?.abort();
    this.request = null;
    void this.session.cancel();
    this.show('ready', note);
  }

  revealHint() {
    if (this.phase !== 'ready' || this.hint) return;
    const line = flowerHint(this.index, this.word, this.used, this.familiar, this.reserved);
    if (line) this.hint = {text: line.text, poem: flowerSource(line, this.familiar)};
    this.update();
  }

  addLine(line, who, details = {}) {
    this.used.add(line.text);
    const poem = flowerSource(line, this.familiar);
    const answer = {text: line.text, poem, who, ...details};
    this.answers.push(answer);
    return answer;
  }

  async answer(text, speech = false) {
    if (this.phase !== (speech ? 'checking' : 'ready')) return;
    const result = judgeFlowerAnswer(this.index, this.word, this.used, text, {
      speech, variants: this.variants, phonetics: this.phonetics
    });
    if (result.status !== 'accepted') {
      const notes = {
        empty: '这一遍没听清，请再说一次。',
        unknown: speech ? '诗库里暂未核对到这句。可以重说或试试打字。' : '诗库里暂未核对到这句，请核对文字再试。',
        ambiguous: '有多句的读音相同，可以打字确认是哪一句。',
        'missing-word': `这句诗里没有「${this.word}」，换一句试试。`,
        duplicate: '这句已经接过了，想想其他诗。'
      };
      this.show('ready', notes[result.status]);
      return;
    }
    // Close the microphone before any audio can start.
    void this.session.cancel();
    this.addLine(result.line, 'you', {hinted: !!this.hint, corrected: result.corrected});
    this.total++;
    if (!this.hint) this.score++;
    this.hint = null;
    const computer = chooseComputerLine(this.pool, this.used, this.familiar, this.reserved);
    if (!computer) {
      this.finish(true);
      return;
    }
    this.computer++;
    this.lastComputer = this.addLine(computer, 'computer');
    await this.play();
  }

  async play() {
    if (!['ready', 'checking', 'listen'].includes(this.phase) || !this.lastComputer) return;
    const src = this.clips[this.lastComputer.text].src;
    this.show('playing');
    const abort = new AbortController();
    let completed = false, source = null, player = null, settle = () => {};
    const stop = () => {
      abort.abort();
      if (source) { try { source.stop(); } catch {} }
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
      settle();
    };
    this.stopPlayback = stop;
    const timeout = setTimeout(stop, 12000);
    try {
      const context = this.audioContext;
      if (context?.state === 'running') {
        const response = await fetch(src, {signal: abort.signal});
        if (!response.ok) throw new Error('audio unavailable');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (abort.signal.aborted || context.state !== 'running') throw new Error('playback paused');
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        await new Promise(resolve => {
          settle = resolve;
          source.onended = () => {completed = !abort.signal.aborted;resolve();};
          source.start();
        });
      } else {
        player = new Audio(src);
        await new Promise((resolve, reject) => {
          settle = resolve;
          player.onended = () => {completed = !abort.signal.aborted;resolve();};
          player.onerror = reject;
          player.play().catch(reject);
        });
      }
    } catch { /* Retry or continue with the visible verse. */ }
    finally {
      clearTimeout(timeout);
      stop();
      source?.disconnect();
      if (this.stopPlayback === stop) this.stopPlayback = null;
    }
    if (this.phase === 'playing' && !this.stopPlayback) {
      this.show(completed ? 'ready' : 'listen', completed ? '' : '朗读未播放完，可以重听或直接继续。');
    }
  }

  dispose() {
    this.phase = 'closed';
    this.request?.abort();
    this.stopPlayback?.();
    void this.session.cancel();
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {});
  }
}
