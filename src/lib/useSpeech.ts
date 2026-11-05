import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0); const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const stop = useCallback(() => { seq.current++; if (available) window.speechSynthesis.cancel(); utterance.current = null; setSpeaking(false); }, [available]);
  useEffect(() => {
    if (!available) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update(); window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', update); window.speechSynthesis.cancel(); };
  },[available]);
  const play = useCallback((text: string, a: Artist) => {
    stop(); setError('');
    if (!available) { setError('当前浏览器不支持设备语音，可继续使用字幕。'); return; }
    const turn = seq.current; const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = a.rate; u.pitch = a.pitch;
    const selected = voices.find(v => v.voiceURI === a.voiceURI) ?? voices.find(v => /zh[-_]CN/i.test(v.lang)) ?? voices.find(v => /^zh/i.test(v.lang));
    if (selected) u.voice = selected;
    u.onstart = () => { if (turn === seq.current) setSpeaking(true); };
    u.onend = () => { if (turn === seq.current) setSpeaking(false); };
    u.onerror = e => { if (turn === seq.current) { setSpeaking(false); if (!['interrupted','canceled'].includes(e.error)) setError('这段语音暂时不可用，字幕和剧情已保留。'); } };
    utterance.current = u;
    try { setSpeaking(true);window.speechSynthesis.speak(u); } catch { setSpeaking(false);setError('声音暂时不可用，可继续使用字幕。'); }
  },[available, voices, stop]);
  return { voices, speaking, error, play, stop, available };
}
