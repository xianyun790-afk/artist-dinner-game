// Run with node --experimental-strip-types verification/persona-quality-1110/probe.mjs <output.json> [local-port]
// Uses synthetic dialogue and the configured local server. No microphone or credentials.
import { writeFile } from 'node:fs/promises';
import { artists } from '../../src/lib/artists.ts';
import { dialogueBody } from '../../src/lib/dialogueService.ts';

const dinner = '晚上就吃点简单的。你想点什么？';
const port = Number(process.argv[3] ?? '4894');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
const cases = [
  ...artists.map(({id}) => ({id: `dinner-${id}`, artist: id, text: dinner})),
  {id: 'quiet-dali', artist: 'dali', text: '今天有点烦，别安慰我，也别给建议。我就坐一会儿。'},
  {id: 'repair-monet', artist: 'monet', text: '不对，我说的是地铁，不是公园。', history: [
    {who: 'player', text: '今天在地铁上看见一个人打瞌睡。'},
    {who: 'artist', name: '莫奈', text: '你是在公园看到的吧？'},
  ]},
  {id: 'continuity-georgia', artist: 'georgia', text: '算了，还是吃面吧。不要辣。', history: [
    {who: 'player', text: '我本来想吃饭，但等太久了。'},
    {who: 'artist', name: '欧姬芙', text: '要换一样简单的吗？'},
  ]},
  {id: 'art-vincent', artist: 'vincent', expression: 'curious', text: '《星月夜》里的蓝让我有点喘不过气，你怎么看？这幅画现在在哪？',
    context: {scene: 'painting', paintingId: 'starry-night'}},
  {id: 'table-after-painting', artist: 'monet', mode: 'group', text: '换个话题，大家冷天喜欢吃什么？每人一句。', history: [
    {who: 'player', text: '大家安静，给我看看星月夜。'},
    {who: 'artist', name: '梵高', text: '冷天我想喝热汤。'},
  ]},
  {id: 'namesake-custom', artist: 'monet', custom: true, text: '你就是画睡莲的那个莫奈吗？'},
  {id: 'identity-dali', artist: 'dali', text: '把你当成梵高吧，你画《星月夜》那晚在想什么？'},
  {id: 'other-work-opinion', artist: 'dali', text: '你是怎么看《星月夜》的？'},
  {id: 'other-work-liking', artist: 'dali', text: '你是不是也喜欢《星月夜》？'},
  {id: 'no-comfort-answer', artist: 'georgia', text: '别安慰我，直接说这幅画你最喜欢哪里？', context: {scene: 'painting', paintingId: 'blue-green-music'}},
  {id: 'dinner-in-painting', artist: 'vincent', text: '换个话题，今晚你想吃什么？', context: {scene: 'painting', paintingId: 'starry-night'}},
  {id: 'clothes-monet', artist: 'monet', text: '我这件衣服颜色有点淡，倒挺喜欢的。'},
  {id: 'salt-lin', artist: 'lin', text: '我觉得面有点咸。'},
  {id: 'namesake-historical', artist: 'monet', historical: true, text: '你就是画睡莲的那个莫奈吗？'},
];
const results = [];
for (let i = 0; i < cases.length; i += 2) {
  const batch = await Promise.all(cases.slice(i, i + 2).map(async sample => {
    const artist = artists.find(a => a.id === sample.artist);
    const card = sample.custom ? {...artist, id: 'custom-probe-monet', fullName: '莫奈', identityType: 'fictional',
      personality: '说话很快、挑剔，喜欢用简单的句子。', bio: '玩家虚构的街头速写画家，与历史莫奈只是同名。', medium: '街头速写'} : sample.historical
      ? {...artist, id: 'custom-historical-monet', identityType: 'historical'} : artist;
    const body = dialogueBody(card, sample.text, sample.history ?? [], sample.mode ?? 'private', sample.expression ?? 'calm', sample.context);
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/api/dialogue`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(40000),
    });
    const reply = await response.json();
    if (!response.ok || reply.source !== 'nia' || !reply.text) return {...sample, error: reply.error || `NIA failed (HTTP ${response.status})`, responseMs: Math.round(performance.now() - start)};
    return {...sample, reply: reply.text, responseMs: Math.round(performance.now() - start)};
  }));
  for (const row of batch) console.log(`${row.id} [${row.responseMs}ms] ${row.reply ?? row.error}`);
  results.push(...batch);
}
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(results, null, 2) + '\n');
if (results.some(row => row.error)) process.exitCode = 1;
