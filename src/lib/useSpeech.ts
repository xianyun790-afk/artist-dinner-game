import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
import { defaultServiceVoice, connectVoiceCatalog, synthesizeVoice, validateServiceVoice, voicesForModel, type VoiceCatalog } from './voiceService';
const serviceBase = (import.meta.env.VITE_VOICE_SERVICE_URL || '').trim();
export const voiceEngineFor = (a: Artist) => a.voiceEngine ?? (a.voiceURI || !serviceBase ? 'device' : 'service');
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [connection, setConnection] = useState<'off' | 'connecting' | 'ready' | 'error'>(serviceBase ? 'connecting' : 'off');
  const [connectionError, setConnectionError] = useState('');
  const connectionTask = useRef<Promise<VoiceCatalog | null> | null>(null);
  const completion = useRef<(() => void) | null>(null);
  const seq = useRef(0), utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const request = useRef<AbortController | null>(null), catalogRequest = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null);
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const release = useCallback(() => {
    completion.current?.(); completion.current = null;
    seq.current++; request.current?.abort(); request.current = null;
    if (source.current) { source.current.onended = null; try { source.current.stop(); } catch { /* Already ended. */ } source.current.disconnect(); source.current = null; }
    if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; utterance.current.onstart = null; }
    if (available) window.speechSynthesis.cancel();
    utterance.current = null;
  }, [available]);
  const stop = useCallback(() => { release(); setSpeaking(false); setLoading(false); setStatus(''); }, [release]);
  // Called synchronously from a click/submit, before the asynchronous TTS request.
  const unlock = useCallback(() => {
    if (!serviceBase) return;
    try { context.current ??= new AudioContext(); if (context.current.state === 'suspended') void context.current.resume().catch(() => {}); } catch { /* Device speech remains available. */ }
  }, []);
  const refresh = useCallback((): Promise<VoiceCatalog | null> => {
    if (!serviceBase) return Promise.resolve(null);
    if (connectionTask.current) return connectionTask.current;
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
  useEffect(() => () => { release(); void context.current?.close(); }, [release]);
  const voiceFor = useCallback((a: Artist) => a.serviceVoice ?? (catalog ? defaultServiceVoice(a.id, catalog) : undefined), [catalog]);
  const play = useCallback((text: string, a: Artist) => {
    stop(); setError(''); unlock(); const turn = seq.current;
    const completed = new Promise<void>(resolve => { completion.current = resolve; });
    const finish = () => { if (turn === seq.current) { completion.current?.(); completion.current = null; } };
    const device = (fallback = false) => {
      if (turn !== seq.current) return;
      if (!available) { setLoading(false); setSpeaking(false); setError('这段声音暂时不可用，可继续看字幕。'); finish(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = a.rate; u.pitch = a.pitch;
      const selected = voices.find(v => v.voiceURI === a.voiceURI) ?? voices.find(v => /zh[-_]CN/i.test(v.lang)) ?? voices.find(v => /^zh/i.test(v.lang));
      if (selected) u.voice = selected;
      u.onstart = () => { if (turn === seq.current) { setSpeaking(true); setStatus(fallback ? '正在使用设备语音回退' : '正在用设备音色朗读'); } };
      u.onend = () => { if (turn === seq.current) { setSpeaking(false); setStatus(fallback ? '已播完 · 设备语音回退' : '已播完 · 设备音色'); finish(); } };
      u.onerror = e => { if (turn === seq.current) { setSpeaking(false); if (!['interrupted', 'canceled'].includes(e.error)) setError('设备声音暂时不可用，字幕已保留。'); finish(); } };
      utterance.current = u;
      try { setLoading(false); setSpeaking(true); window.speechSynthesis.speak(u); }
      catch { setLoading(false); setSpeaking(false); setError('声音暂时不可用，可继续看字幕。'); finish(); }
    };
    if (voiceEngineFor(a) === 'device') { device(); return completed; }
    setLoading(true); setStatus(connection === 'ready' ? '正在准备声音…' : '正在连接音色服务…');
    const controller = new AbortController(); request.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const liveCatalog = connection === 'ready' && catalog ? catalog : await refresh();
        if (turn !== seq.current) return;
        const choice = a.serviceVoice ?? (liveCatalog ? defaultServiceVoice(a.id, liveCatalog) : undefined);
        if (!serviceBase || !liveCatalog || !choice || !validateServiceVoice(choice, liveCatalog)) {
          setError(a.serviceVoice && liveCatalog ? '所选服务音色当前不可用，本次改用设备音色。' : '没有连上音色服务，本次改用设备音色。可在声音设置中重新连接。'); device(true); return;
        }
        const provider = liveCatalog.providers.find(p => p.id === choice.provider)!;
        const label = voicesForModel(provider, choice.model).find(v => v.id === choice.voice)?.name || choice.voice;
        setStatus('正在准备声音…');
        timer = setTimeout(() => controller.abort(), 20000);
        const audio = await synthesizeVoice(serviceBase, choice, text, a.rate, a.pitch, controller.signal);
        clearTimeout(timer);
        if (turn !== seq.current) return;
        const ctx = context.current;
        if (!ctx || ctx.state !== 'running') { setLoading(false); setError('请点击试听或说话按钮启用声音；本次字幕已保留。'); setStatus('声音等待点击启用'); finish(); return; }
        const buffer = await ctx.decodeAudioData(audio);
        if (turn !== seq.current) return;
        const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination); source.current = node;
        node.onended = () => { node.disconnect(); if (turn === seq.current) { source.current = null; setSpeaking(false); setStatus(`已播完 · ${label}`); finish(); } };
        node.start(); setLoading(false); setSpeaking(true); setStatus(`正在朗读 · ${label}`);
      } catch {
        if (turn !== seq.current) return;
        setError('音色服务暂时不可用，本次改用设备语音；字幕已保留。'); device(true);
      } finally { clearTimeout(timer); if (request.current === controller) request.current = null; }
    })();
    return completed;
  }, [available, voices, stop, unlock, catalog, connection, refresh]);
  return { voices, speaking, loading, error, status, play, stop, unlock, available, catalog, connection, connectionError, refresh, voiceFor, serviceConfigured: !!serviceBase };
}
export type SpeechController = ReturnType<typeof useSpeech>;
