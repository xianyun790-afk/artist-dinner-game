import type { Artist, GroupChat, GroupMessage, Save } from './types';
import { responderFor, roomReply } from './room.ts';

export function groupMembers(ids: string[], catalog: Artist[]): Artist[] {
  return [...new Set(ids)].flatMap(id => { const a = catalog.find(a => a.id === id); return a ? [a] : []; }).slice(0, 5);
}
export function createGroup(id: string, name: string, ids: string[], catalog: Artist[]): GroupChat | null {
  const members = groupMembers(ids, catalog);
  if (members.length < 2) return null;
  return { id, name: name.trim().slice(0, 28) || members.map(a => a.name).join('、').slice(0, 28), memberIds: members.map(a => a.id), messages: [] };
}
export function appendGroupMessage(save: Save, groupId: string, message: GroupMessage): Save {
  return { ...save, groupChats: (save.groupChats ?? []).map(g => g.id === groupId ? { ...g, messages: [...g.messages, message] } : g) };
}
export const wantsQuiet = (text: string) => /^(大家|你们|请|先|我们|都|就|今晚|今天|，|,|\s)*(安静|停一下|停一停|别说了|不要说了|不聊了|暂停|休息一会)/.test(text);
export interface GroupReply { artist: Artist; text: string }
export function groupReplies(text: string, members: Artist[], history: GroupMessage[], preferred: string | null): GroupReply[] {
  if (!members.length || wantsQuiet(text)) return [];
  const addressed = members.filter(a => [a.name, a.fullName, a.english].some(n => n && text.toLowerCase().includes(n.toLowerCase())));
  const all = /大家|每个人|所有人|都说说|都聊聊/.test(text);
  const previous = history.filter(m => m.who === 'artist').at(-1)?.artistId ?? null;
  const first = responderFor(text, members, preferred, previous)!;
  const start = members.findIndex(a => a.id === previous);
  const rotated = [...members.slice(start + 1), ...members.slice(0, start + 1)];
  const order = addressed.length && !all ? addressed : all ? members : [first, ...rotated.filter(a => a.id !== first.id)].slice(0, 2);
  return order.map((artist, i) => {
    const boundary = /不想|不要|别|不愿/.test(text);
    let line = boundary ? '好，这个话题先放下。想换什么，听你的。' : /你好|晚上好|嗨|哈喽/.test(text) ? artist.greeting : roomReply(artist, text) ?? groupAngle(artist, text);
    if (i > 0 && !boundary && !/你好|晚上好|嗨|哈喽/.test(text)) line = `${order[i - 1].name}，我也想到一点。${line}`;
    return { artist, text: line };
  });
}
function groupAngle(a: Artist, text: string): string {
  if (/累|难过|烦|焦虑/.test(text)) return a.quiet;
  if (/星空|颜色|色彩|日落|光|画/.test(text)) {
    if (a.id === 'monet') return '我会先看光怎样改变眼前的东西。同一个地方，多看一会儿也会不一样。';
    if (a.id === 'vincent') return '我想试试把颜色放得更大胆些。两种颜色挨在一起，常常会有新的感觉。';
    if (a.id === 'dali') return '我倒想让画里的一件东西违背常理。比如，让星星的影子先落在桌上。';
    if (a.id === 'georgia') return '我会挑一个细节，放大了看。先别忙着给整幅画下结论。';
  }
  return a.observation;
}

// One shared audio channel. Aborted turns may finish their current Promise,
// but must never present or synthesize another participant's reply.
export async function playGroupRound(replies: GroupReply[], signal: AbortSignal, callbacks: {
  thinking: (reply: GroupReply) => void;
  generate?: (reply: GroupReply, signal: AbortSignal) => Promise<GroupReply>;
  present: (reply: GroupReply) => void;
  speak: (reply: GroupReply) => Promise<void>;
  pause: (signal: AbortSignal) => Promise<void>;
}) {
  for (const reply of replies) {
    if (signal.aborted) return;
    callbacks.thinking(reply);
    await callbacks.pause(signal);
    if (signal.aborted) return;
    const generated = callbacks.generate ? await callbacks.generate(reply, signal) : reply;
    if (signal.aborted) return;
    callbacks.present(generated);
    await callbacks.speak(generated);
  }
}
export const groupPause = (signal: AbortSignal) => new Promise<void>(resolve => {
  if (signal.aborted) { resolve(); return; }
  const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, 0); signal.addEventListener('abort', done, { once: true });
});
