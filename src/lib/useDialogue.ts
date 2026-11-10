import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist } from './types';
import { dialogueBody, dialogueRoot, requestDialogue, type DialogueLine } from './dialogueService';
import type { ArtistExpression } from './artistExpression';
const base = (import.meta.env.VITE_DIALOGUE_SERVICE_URL || '').trim();
export function useDialogue() {
  const [connection, setConnection] = useState<'off' | 'connecting' | 'ready' | 'error'>(base ? 'connecting' : 'off');
  const [error, setError] = useState(''), [model, setModel] = useState(''), [lastSource, setLastSource] = useState('');
  const metadata = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!base) return;
    metadata.current?.abort(); const controller = new AbortController(); metadata.current = controller; setConnection('connecting');
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${dialogueRoot(base)}/api/dialogue/config`, { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      const data = await res.json(); if (metadata.current !== controller) return;
      if (!res.ok || data.configured !== true) throw new Error();
      setModel(typeof data.model === 'string' ? data.model : ''); setConnection('ready'); setError('');
    } catch { if (metadata.current === controller) { setConnection('error'); setError('NIA 本机对话服务未就绪，可重新连接；目前仍可使用本地剧本。'); } }
    finally { clearTimeout(timer); }
  }, []);
  useEffect(() => { void refresh(); return () => { metadata.current?.abort(); metadata.current = null; }; }, [refresh]);
  const reply = useCallback(async (artist: Artist, text: string, history: DialogueLine[], mode: 'private' | 'group', fallback: string, signal: AbortSignal, onSentence?: (text: string) => void, onIncomplete?: () => void, expression: ArtistExpression = 'calm') => {
    if (!base) { onSentence?.(fallback); return fallback; }
    setError(''); const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason); if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 40000);
    let delivered = '';
    try {
      const line = await requestDialogue(base, dialogueBody(artist, text, history, mode, expression), controller.signal, fetch, onSentence ? sentence => {
        delivered += sentence; onSentence(sentence);
      } : undefined);
      if (signal.aborted) throw new DOMException('已打断', 'AbortError');
      setLastSource('NIA 实时生成'); setConnection('ready'); return line;
    } catch (e) {
      if (signal.aborted) throw e;
      // Never repeat already queued speech or replace it with unrelated fallback.
      if (delivered) { onIncomplete?.(); setLastSource('NIA 部分回复'); setError('NIA 回复中断，已保留收到的部分；可以接着聊。'); return delivered; }
      setLastSource('本地剧本回退'); setError('NIA 暂时没有回复，本次使用本地剧本；可以在设置中重连。'); onSentence?.(fallback); return fallback;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }, []);
  return { configured: !!base, connection, model, error, lastSource, refresh, reply };
}
