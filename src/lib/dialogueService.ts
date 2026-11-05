import type { Artist } from './types';
export interface DialogueLine { who: 'player' | 'artist'; name?: string; text: string }
export function dialogueBody(artist: Artist, text: string, history: DialogueLine[], mode: 'private' | 'group') {
  if (!text.trim() || text.length > 400) throw new Error('请输入 1–400 字。');
  const { id, name, fullName, identityType, personality, bio, medium } = artist;
  return { persona: { id, name, fullName, identityType, personality, bio, medium }, text: text.trim(), mode,
    history: history.slice(-12).map(m => ({ who: m.who, ...(m.name ? { name: m.name.slice(0, 80) } : {}), text: m.text.slice(0, 2000) })),
  };
}
export function dialogueRoot(base: string) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('对话服务地址不正确。');
  return url.href.replace(/\/+$/, '');
}
export async function requestDialogue(base: string, body: ReturnType<typeof dialogueBody>, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${dialogueRoot(base)}/api/dialogue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || data.ok !== true || typeof data.text !== 'string' || !data.text.trim()) throw new Error('NIA 暂时没有返回对白。');
  return data.text.trim().slice(0, 2000);
}
