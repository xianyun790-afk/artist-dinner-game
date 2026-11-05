import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
import { defaultServiceVoice, loadVoiceCatalog, synthesizeVoice, validateServiceVoice, voicesForModel, type VoiceCatalog } from './voiceService';
const serviceBase = (import.meta.env.VITE_VOICE_SERVICE_URL || '').trim();
export const voiceEngineFor = (a: Artist) => a.voiceEngine ?? (a.voiceURI || !serviceBase ? 'device' : 'service');
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [catalog, setCatalog] = useState<VoiceCatalog | null>(null);
  const [connection, setConnection] = useState<'off' | 'connecting' | 'ready' | 'error'>(serviceBase ? 'connecting' : 'off');
  const [connectionError, setConnectionError] = useState('');
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
  const refresh = useCallback(async () => {
    if (!serviceBase) return;
    catalogRequest.current?.abort(); const controller = new AbortController(); catalogRequest.current = controller;
    setConnection('connecting'); setConnectionError('');
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await loadVoiceCatalog(serviceBase, controller.signal);
      if (catalogRequest.current !== controller) return;
      setCatalog(result); setConnection('ready');
    } catch {
      if (catalogRequest.current !== controller) return;
      setCatalog(null); setConnection('error'); setConnectionError('没有连上音色服务。可以重新连接，或使用设备音色。');
    } finally { clearTimeout(timer); }
  }, []);
  useEffect(() => { void refresh(); return () => { catalogRequest.current?.abort(); catalogRequest.current = null; }; }, [refresh]);
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
    const choice = voiceFor(a);
    if (!serviceBase || !catalog || !choice || !validateServiceVoice(choice, catalog)) {
      setError(a.serviceVoice ? '所选服务音色当前不可用，本次改用设备音色。' : '音色服务暂不可用，本次改用设备音色。'); device(true); return completed;
    }
    const provider = catalog.providers.find(p => p.id === choice.provider)!;
    const label = voicesForModel(provider, choice.model).find(v => v.id === choice.voice)?.name || choice.voice;
    setLoading(true); setStatus('正在准备声音…');
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    void (async () => {
      try {
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
  }, [available, voices, stop, unlock, voiceFor, catalog]);
  return { voices, speaking, loading, error, status, play, stop, unlock, available, catalog, connection, connectionError, refresh, voiceFor, serviceConfigured: !!serviceBase };
}
export type SpeechController = ReturnType<typeof useSpeech>;
