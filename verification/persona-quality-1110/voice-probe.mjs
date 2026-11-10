// Synthetic lines through the user's configured voice gateway, without keys or microphone access.
// node --experimental-strip-types verification/persona-quality-1110/voice-probe.mjs
import {writeFile} from 'node:fs/promises';
import {loadVoiceCatalog, artistVoicePreset, artistSpeechStyle, synthesizeVoice} from '../../src/lib/voiceService.ts';
import {expressionDirection} from '../../src/lib/artistExpression.ts';

const base = 'http://10.151.204.18:3210';
const catalog = await loadVoiceCatalog(base, AbortSignal.timeout(15000));
const samples = [
  {id: 'monet', line: '我想喝点热汤，配块面包就好。'},
  {id: 'dali', line: '那就不去。让鞋子失望一晚上也没什么。'},
];
const results = [];
for (const sample of samples) {
  const preset = artistVoicePreset(sample.id, catalog);
  if (!preset) throw new Error(`No compatible voice: ${sample.id}`);
  const start = performance.now();
  const buffer = await synthesizeVoice(base, preset.choice, sample.line, preset.rate, preset.pitch,
    AbortSignal.timeout(25000), fetch, artistSpeechStyle(sample.id) + expressionDirection('calm'));
  await writeFile(new URL(`./${sample.id}.mp3`, import.meta.url), Buffer.from(buffer));
  const result = {...sample, choice: preset.choice, rate: preset.rate, pitch: preset.pitch,
    bytes: buffer.byteLength, synthesisMs: Math.round(performance.now() - start)};
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(new URL('./voice-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
