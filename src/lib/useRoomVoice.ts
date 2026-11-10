import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceTurn, type VoiceInputTiming, type VoiceResults } from './voiceTurn';

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onspeechstart: (() => void) | null; onspeechend: (() => void) | null;
  onresult: ((event: { results: VoiceResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; abort: () => void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const detach = (recognition: Recognition) => {
  recognition.onstart = recognition.onspeechstart = recognition.onspeechend = recognition.onend = null;
  recognition.onresult = recognition.onerror = null;
};

// Recognition pauses during replies: the browser API does not expose dependable
// acoustic echo cancellation or audio frames for hands-free barge-in.
export function useRoomVoice(onText: (text: string) => void, blocked: boolean, onInputTiming?: (timing: VoiceInputTiming) => void) {
  const [enabled, setEnabled] = useState(false), [listening, setListening] = useState(false);
  const [interim, setInterim] = useState(''), [error, setError] = useState('');
  const callback = useRef(onText), timingCallback = useRef(onInputTiming);
  callback.current = onText; timingCallback.current = onInputTiming;
  const intent = useRef(false), busy = useRef(blocked), current = useRef<Recognition | null>(null);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null), startRef = useRef<() => void>(() => {});
  const turn = useRef<ReturnType<typeof createVoiceTurn> | null>(null);
  busy.current = blocked;
  const stopCurrent = useCallback(() => {
    if (restart.current) clearTimeout(restart.current); restart.current = null;
    turn.current?.cancel(); turn.current = null;
    const recognition = current.current; current.current = null;
    if (recognition) { detach(recognition); try { recognition.abort(); } catch { /* Already ended. */ } }
    setListening(false); setInterim('');
  }, []);
  const stop = useCallback(() => { intent.current = false; setEnabled(false); stopCurrent(); }, [stopCurrent]);
  const start = () => {
    if (!intent.current || busy.current || current.current || document.hidden) return;
    const browser = window as VoiceWindow, Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { intent.current = false; setEnabled(false); setError('这个浏览器暂不支持语音输入，可以换 Safari／Chrome 或打字聊天。'); return; }
    turn.current ??= createVoiceTurn({ onDraft: setInterim, onSubmit: (text, timing) => {
      if (!intent.current || busy.current || document.hidden) return;
      stopCurrent(); timingCallback.current?.(timing); callback.current(text);
    } });
    const buffer = turn.current, recognition = new Constructor(); let failed = false;
    const active = () => current.current === recognition && intent.current && !busy.current;
    recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true;
    current.current = recognition;
    recognition.onstart = () => { if (active()) setListening(true); };
    recognition.onspeechstart = () => { if (active()) buffer.speechStart(); };
    recognition.onspeechend = () => { if (active()) buffer.speechEnd(); };
    recognition.onresult = event => { if (active()) buffer.results(event.results); };
    recognition.onerror = event => {
      if (!active() || ['no-speech', 'aborted'].includes(event.error)) return;
      failed = true; intent.current = false; setEnabled(false); stopCurrent();
      setError(event.error === 'not-allowed' ? '麦克风或语音识别没有获准，请在浏览器网站设置中允许后重试。'
        : event.error === 'audio-capture' ? '没有找到麦克风，可以先打字聊天。'
          : event.error === 'service-not-allowed' ? '浏览器没有允许语音识别，可以换 Safari／Chrome 或先打字。'
            : event.error === 'language-not-supported' ? '浏览器识别服务暂不支持中文，可以先打字聊天。'
              : '语音输入未连上浏览器识别服务，可以重试或先打字聊天。');
    };
    recognition.onend = () => {
      if (current.current !== recognition) return;
      current.current = null; detach(recognition); setListening(false); buffer.sessionEnded();
      if (!failed && intent.current && !busy.current) restart.current = setTimeout(() => startRef.current(), buffer.hasText ? 100 : 500);
    };
    try { recognition.start(); }
    catch { stopCurrent(); intent.current = false; setEnabled(false); setError('语音输入没有启动，可以重试或先打字聊天。'); }
  };
  startRef.current = start;
  const resume = () => { setError(''); intent.current = true; setEnabled(true); startRef.current(); };
  const toggle = () => { if (intent.current) stop(); else resume(); };
  useEffect(() => {
    if (blocked) stopCurrent();
    else if (intent.current) restart.current = setTimeout(() => startRef.current(), 180);
    return () => { if (restart.current) clearTimeout(restart.current); };
  }, [blocked, stopCurrent]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { intent.current = false; stopCurrent(); document.removeEventListener('visibilitychange', visibility); };
  }, [stop, stopCurrent]);
  return { enabled, listening, interim, error, toggle, resume, stop };
}
