import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, speechParts } from '../src/lib/speechQueue.ts';
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('speech starts with the first ready sentence while the reply is still arriving; later audio never overtakes it', async () => {
  const first = deferred<string>(), second = deferred<string>(), playback = deferred<void>();
  const prepared: string[] = [], played: string[] = [];
  const queue = createSpeechQueue({ signal: new AbortController().signal,
    prepare: text => { prepared.push(text); return text === '第一句' ? first.promise : second.promise; },
    play: async audio => { played.push(audio); if (audio === 'first') await playback.promise; },
  });
  queue.push('第一句'); queue.push('第二句');
  assert.deepEqual(prepared, ['第一句', '第二句']);
  second.resolve('second'); await tick(); assert.deepEqual(played, []);
  first.resolve('first'); await tick(); assert.deepEqual(played, ['first']);
  // Generation need not have called end() before audio begins.
  queue.end(); playback.resolve(); await queue.done;
  assert.deepEqual(played, ['first', 'second']);
});
test('at most two syntheses are in flight and cancellation discards late audio without starting another sentence', async () => {
  const controller = new AbortController(), pending = deferred<string>();
  let prepared = 0, played = 0;
  const queue = createSpeechQueue({ signal: controller.signal,
    prepare: async () => { prepared++; return pending.promise; }, play: async () => { played++; },
  });
  queue.push('一'); queue.push('二'); queue.push('三');
  assert.equal(prepared, 2); controller.abort(); await queue.done;
  pending.resolve('late'); await tick();
  assert.equal(prepared, 2); assert.equal(played, 0);
});
test('interrupting playback resolves the queue and prevents remaining ready audio from playing', async () => {
  const controller = new AbortController(), playing = deferred<void>(); const heard: string[] = [];
  const queue = createSpeechQueue({ signal: controller.signal, prepare: async text => text,
    play: async text => { heard.push(text); await playing.promise; },
  });
  queue.push('一'); queue.push('二'); queue.end(); await tick();
  controller.abort(); await queue.done; playing.resolve(); await tick();
  assert.deepEqual(heard, ['一']);
});
test('sentence boundaries preserve all characters, combine tiny clauses and flush a short final reply', () => {
  const text = '好。先坐一会儿，今天不用急着做出决定。慢慢说，我在听。';
  const first = speechParts(text.slice(0, 22));
  const last = speechParts(first.rest + text.slice(22), true);
  assert.equal([...first.parts, ...last.parts].join('') + last.rest, text);
  assert.equal(speechParts('好的。').parts.length, 0);
  assert.deepEqual(speechParts('好的。', true).parts, ['好的。']);
  const long = speechParts('一'.repeat(140), true);
  assert.ok(long.parts.every(part => part.length <= 48));
  assert.equal(long.parts.join(''), '一'.repeat(140));
});
