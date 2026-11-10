import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
import { createSpeechQueue } from './speechQueue';
import { artistSpeechStyle, defaultServiceVoice, connectVoiceCatalog, createVoiceSynthesizer, validateServiceVoice, voicesForModel, type VoiceCatalog } from './voiceService';
import { expressionDirection, type ArtistExpression } from './artistExpression';
import { createVoiceTiming, type VoiceInputTiming, type VoiceTurnTiming } from './voiceTiming';
const serviceBase = (import.meta.env.VITE_VOICE_SERVICE_URL || '').trim();
export const voiceEngineFor = (a: Artist) => a.voiceEngine ?? (a.voiceURI || !serviceBase ? 'device' : 'service');
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [firstAudioMs, setFirstAudioMs] = useState<number | null>(null);
  const [timing, setTiming] = useState<VoiceTurnTiming>({});
  const [currentExpression, setCurrentExpression] = useState<ArtistExpression>('calm');
  const [timingScope, setTimingScope] = useState<'turn' | 'group-followup'>('turn');
  const [caption, setCaption] = useState<{ artistId: string; text: string } | null>(null);
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [connection, setConnection] = useState<'off' | 'connecting' | 'ready' | 'error'>(serviceBase ? 'connecting' : 'off');
  const [connectionError, setConnectionError] = useState('');
  const connectionTask = useRef<Promise<VoiceCatalog | null> | null>(null);
  const seq = useRef(0), utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const request = useRef<AbortController | null>(null), catalogRequest = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null);
  const synthesisCache = useRef(createVoiceSynthesizer());
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const release = useCallback(() => {
    seq.current++; request.current?.abort(); request.current = null;
    if (source.current) { source.current.onended = null; try { source.current.stop(); } catch { /* Already ended. */ } source.current.disconnect(); source.current = null; }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; utterance.current.onstart = null; }
    if (available) window.speechSynthesis.cancel();
    utterance.current = null;
  }, [available]);
  const stop = useCallback(() => { release(); setSpeaking(false); setLoading(false); setStatus(''); setCaption(null); }, [release]);
  // Called synchronously from a click/submit, before the asynchronous TTS request.
  const unlock = useCallback(() => {
    if (!serviceBase) return;
    try { context.current ??= new AudioContext(); if (context.current.state === 'suspended') void context.current.resume().catch(() => {}); } catch { /* Device speech remains available. */ }
  }, []);
  const refresh = useCallback((): Promise<VoiceCatalog | null> => {
    if (!serviceBase) return Promise.resolve(null);
    if (connectionTask.current) return connectionTask.current;
    synthesisCache.current.clear();
    const controller = new AbortController(); catalogRequest.current = controller;
    setConnection('connecting'); setConnectionError('');
    const task = (async () => {
      try {
        const result = await connectVoiceCatalog(serviceBase, controller.signal);
        if (catalogRequest.current !== controller) return null;
        setCatalog(result); setConnection('ready'); setError('');
        return result;
      } catch (error) {
        if (catalogRequest.current !== controller) return null;
        setConnection('error');
        const detail = error instanceof Error && error.message.includes('超时') ? '连接超时，已自动重试一次。' : '暂时无法访问音色服务，已自动重试一次。';
        setConnectionError(`${detail}可以重新连接；请确认当前设备能访问服务所在网络。`);
        return null;
      } finally { if (catalogRequest.current === controller) connectionTask.current = null; }
    })();
    connectionTask.current = task;
    return task;
  }, []);
  useEffect(() => { void refresh(); return () => { catalogRequest.current?.abort(); catalogRequest.current = null; connectionTask.current = null; }; }, [refresh]);
  useEffect(() => {
    const retry = () => { if (!document.hidden && connection === 'error') void refresh(); };
    window.addEventListener('online', retry); document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [connection, refresh]);
  useEffect(() => {
    if (!available) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update(); window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, [available]);
  useEffect(() => () => { release(); synthesisCache.current.clear(); void context.current?.close(); }, [release]);
  const voiceFor = useCallback((a: Artist) => a.serviceVoice ?? (catalog ? defaultServiceVoice(a.id, catalog) : undefined), [catalog]);
  const startStream = useCallback((a: Artist, signal?: AbortSignal, onCaption?: (text: string) => void, options?: { expression?: ArtistExpression; submittedAt?: number; inputTiming?: VoiceInputTiming; timingScope?: 'turn' | 'group-followup' }) => {
    stop(); setError(''); setFirstAudioMs(null); setTiming({}); unlock(); const turn = seq.current;
    const clock = createVoiceTiming(options?.submittedAt ?? performance.now(), options?.inputTiming);
    const expression = options?.expression ?? 'calm';
    setCurrentExpression(expression);
    setTimingScope(options?.timingScope ?? 'turn');
    const style = `${artistSpeechStyle(a.id)}${expressionDirection(expression)}`;
    const rate = a.rate * (expression === 'firm' ? .97 : expression === 'warm' ? 1.02 : 1);
    const controller = new AbortController(); request.current = controller;
    const cancel = () => { if (turn === seq.current) stop(); else controller.abort(); };
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', cancel, { once: true });
    let firstAudio = true, playbackFailed = false;
    const markAudio = () => { if (firstAudio) { firstAudio = false; clock.mark('firstAudioMs'); const snapshot = clock.snapshot(); setFirstAudioMs(snapshot.firstAudioMs ?? null); setTiming(snapshot); } };
    const active = () => turn === seq.current && !controller.signal.aborted;
    const metadata = voiceEngineFor(a) === 'service'
      ? connection === 'ready' && catalog ? Promise.resolve(catalog) : refresh()
      : Promise.resolve(null);
    let label = '', serviceFailed = false, segmentIndex = 0;
    const queue = createSpeechQueue<AudioBuffer | null>({
      signal: controller.signal,
      waiting: () => { if (active()) { setSpeaking(false); setLoading(true); setStatus('正在准备声音…'); } },
      prepare: async text => {
        const index = segmentIndex++;
        if (voiceEngineFor(a) === 'device' || serviceFailed) return null;
        const liveCatalog = await metadata;
        if (!active()) return null;
        const choice = a.serviceVoice ?? (liveCatalog ? defaultServiceVoice(a.id, liveCatalog) : undefined);
        if (!serviceBase || !liveCatalog || !choice || !validateServiceVoice(choice, liveCatalog)) {
          serviceFailed = true;
          setError(a.serviceVoice && liveCatalog ? '所选服务音色当前不可用，本次改用设备音色。' : '没有连上音色服务，本次改用设备音色。可在声音设置中重新连接。');
          return null;
        }
        const provider = liveCatalog.providers.find(p => p.id === choice.provider)!;
        label = voicesForModel(provider, choice.model).find(v => v.id === choice.voice)?.name || choice.voice;
        const synthesis = new AbortController();
        const abort = () => synthesis.abort(); controller.signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 20000);
        try {
          const audio = await synthesisCache.current.synthesize(serviceBase, choice, text, rate, a.pitch, synthesis.signal, fetch, style);
          if (!active()) return null;
          const buffer = context.current ? await context.current.decodeAudioData(audio) : null;
          if (active() && buffer && index === 0) { clock.mark('firstPreparedMs'); setTiming(clock.snapshot()); }
          return buffer;
        } catch {
          if (active()) { serviceFailed = true; setError('音色服务暂时不可用，本次改用设备语音；字幕已保留。'); }
          return null;
        } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
      },
      play: (buffer, text) => new Promise<void>(resolve => {
        if (!active()) { resolve(); return; }
        // Follow the single playback queue, rather than text arriving ahead
        // from the model. Keep the last clause readable after speech finishes.
        let shown = false;
        const showCaption = () => { if (active()) { setCaption({ artistId: a.id, text }); if (!shown) { shown = true; onCaption?.(text); } } };
        const finished = () => { controller.signal.removeEventListener('abort', finished); resolve(); };
        controller.signal.addEventListener('abort', finished, { once: true });
        if (buffer) {
          const ctx = context.current;
          if (!ctx || ctx.state !== 'running') {
            playbackFailed = true; showCaption(); setLoading(false); setError('请点击试听或说话按钮启用声音；本次字幕已保留。'); finished(); return;
          }
          const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination); source.current = node;
          node.onended = () => { node.disconnect(); if (source.current === node) source.current = null; finished(); };
          try { node.start(); showCaption(); markAudio(); setLoading(false); setSpeaking(true); setStatus(`正在朗读 · ${label}`); }
          catch { playbackFailed = true; showCaption(); node.disconnect(); source.current = null; finished(); }
          return;
        }
        if (!available) { playbackFailed = true; showCaption(); setError('这段声音暂时不可用，可继续看字幕。'); finished(); return; }
        const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = rate; u.pitch = a.pitch;
        const selected = voices.find(v => v.voiceURI === a.voiceURI) ?? voices.find(v => /zh[-_]CN/i.test(v.lang)) ?? voices.find(v => /^zh/i.test(v.lang));
        if (selected) u.voice = selected;
        u.onstart = () => { if (active()) { showCaption(); markAudio(); setLoading(false); setSpeaking(true); setStatus(serviceFailed ? '正在使用设备语音回退' : '正在用设备音色朗读'); } };
        u.onend = finished;
        u.onerror = e => { playbackFailed = true; if (active() && !['interrupted', 'canceled'].includes(e.error)) { showCaption(); setError('设备声音暂时不可用，字幕已保留。'); } finished(); };
        utterance.current = u;
        try { window.speechSynthesis.speak(u); } catch { playbackFailed = true; showCaption(); setError('声音暂时不可用，可继续看字幕。'); finished(); }
      }),
    });
    // A stopped queue resolves even when an old fetch/decode finishes late.
    const done = queue.done.then(() => active() && !playbackFailed && !firstAudio).catch(() => { if (active()) setError('声音暂时不可用，可继续看字幕。'); return false; }).finally(() => {
      signal?.removeEventListener('abort', cancel);
      if (turn === seq.current) { setLoading(false); setSpeaking(false); setStatus(`已播完 · ${serviceFailed ? '设备语音回退' : label || '设备音色'}`); if (request.current === controller) request.current = null; }
    });
    return { push: (text: string) => { if (active() && text.trim()) { clock.mark('firstSentenceMs'); setTiming(clock.snapshot()); queue.push(text); } }, end: queue.end, done };
  }, [available, voices, stop, unlock, catalog, connection, refresh]);
  const play = useCallback((text: string, a: Artist) => {
    const stream = startStream(a); stream.push(text); stream.end(); return stream.done;
  }, [startStream]);
  return { voices, speaking, loading, error, status, firstAudioMs, timing, timingScope, expression: currentExpression, caption, play, startStream, stop, unlock, available, catalog, connection, connectionError, refresh, voiceFor, serviceConfigured: !!serviceBase };
}
export type SpeechController = ReturnType<typeof useSpeech>;
