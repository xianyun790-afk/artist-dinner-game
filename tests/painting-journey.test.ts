import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPaintingJourney, PAINTING_JOURNEY_TIMING } from '../src/lib/paintingJourney.ts';
import { starryNight, waterLilies } from '../src/lib/paintings.ts';
import type { PaintingMemory } from '../src/lib/types';

function setup() {
  let time = 0, id = 0;
  const tasks = new Map<number, { at: number; run: () => void }>();
  const archived: PaintingMemory[] = [];
  const journey = createPaintingJourney({
    onArchive: memory => archived.push(memory),
    now: () => new Date('2026-11-09T13:00:00.000Z'),
    timers: { set(run, delay) { const key = ++id; tasks.set(key, { at: time + delay, run }); return key; }, clear(key) { tasks.delete(key as number); } },
  });
  const tick = (duration: number) => {
    const until = time + duration;
    for (;;) {
      const next = [...tasks.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      tasks.delete(next[0]); time = next[1].at; next[1].run();
    }
    time = until;
  };
  return { journey, archived, tick };
}
const explanation = { speakerId: 'vincent', question: '聊聊星月夜', explanation: '柏树伸向夜空。', night: 1 };
const { hold, frame, file } = PAINTING_JOURNEY_TIMING;

test('completed narration waits for the image before holding, framing, recording and returning', () => {
  const { journey, archived, tick } = setup();
  journey.begin('turn-1', '聊聊星月夜'); journey.finish('turn-1', explanation, true);
  assert.equal(journey.state.finishing, true, 'block input immediately, including image loading and subtitle hold');
  tick(10_000); assert.equal(journey.state.phase, 'viewing'); assert.equal(archived.length, 0);
  journey.loaded(starryNight.id); tick(hold - 1); assert.equal(journey.state.phase, 'viewing');
  tick(1); assert.equal(journey.state.phase, 'framing');
  tick(frame - 1); assert.equal(archived.length, 0);
  tick(1); assert.equal(journey.state.phase, 'filing'); assert.equal(archived.length, 1);
  assert.deepEqual(archived[0], { id: 'turn-1', paintingId: starryNight.id, ...explanation, createdAt: '2026-11-09T13:00:00.000Z' });
  tick(file); assert.equal(journey.state.painting, null); assert.equal(journey.state.suppressed, true); assert.equal(journey.state.finishing, false);
});

test('cancel and manual leave prevent completion even after framing starts', () => {
  for (const action of ['cancel', 'leave'] as const) {
    const { journey, archived, tick } = setup();
    journey.begin('turn-1', '星月夜'); journey.loaded(starryNight.id); journey.finish('turn-1', explanation, true); tick(hold);
    journey[action](); tick(10_000); journey.finish('turn-1', explanation, true); tick(10_000);
    assert.equal(archived.length, 0, action);
    assert.equal(journey.state.token, null);
    assert.equal(journey.state.finishing, false);
  }
});

test('a newer turn invalidates old callbacks and replaces pending completion', () => {
  const { journey, archived, tick } = setup();
  journey.begin('old', '星月夜'); journey.loaded(starryNight.id); journey.finish('old', explanation, true); tick(hold);
  journey.begin('new', '再看睡莲'); journey.notice('old', '星月夜'); journey.finish('old', explanation, true);
  assert.equal(journey.state.finishing, false);
  tick(10_000); assert.equal(archived.length, 0); assert.equal(journey.state.painting, waterLilies);
  journey.loaded(waterLilies.id); journey.finish('new', { ...explanation, speakerId: 'monet' }, true); tick(hold + frame);
  assert.equal(archived.length, 1); assert.equal(archived[0].id, 'new'); assert.equal(archived[0].paintingId, waterLilies.id);
});

test('failed images and incomplete narration never archive', () => {
  const { journey, archived, tick } = setup();
  journey.begin('first', '星月夜'); journey.loaded(starryNight.id); journey.finish('first', explanation, false); tick(10_000);
  assert.equal(journey.state.finishing, false);
  assert.equal(archived.length, 0); assert.equal(journey.state.phase, 'viewing');
  journey.finish('first', explanation, true); tick(hold); journey.failed(starryNight.id); tick(10_000);
  assert.equal(journey.state.finishing, false);
  assert.equal(archived.length, 0); assert.equal(journey.state.phase, 'viewing');
  journey.finish('first', explanation, true); tick(10_000); assert.equal(archived.length, 0);
});

test('declining display suppresses assistant mentions and later speech cannot reopen a left scene', () => {
  const { journey, archived, tick } = setup();
  journey.begin('first', '不要展示图片，只聊星月夜'); journey.notice('first', '星月夜里的柏树'); journey.loaded(starryNight.id); journey.finish('first', explanation, true); tick(10_000);
  assert.equal(journey.state.painting, null); assert.equal(archived.length, 0);
  journey.begin('second', '再看星月夜'); journey.leave(); journey.notice('second', '星月夜');
  assert.equal(journey.state.painting, null);
  journey.begin('third', '接着说'); journey.notice('third', '星月夜'); assert.equal(journey.state.painting, null);
});

test('replay is inert and cannot trigger a new memory from an old audio callback', () => {
  const { journey, archived, tick } = setup();
  journey.begin('old', '星月夜'); journey.replay(waterLilies); journey.loaded(waterLilies.id);
  assert.equal(journey.state.finishing, false);
  journey.notice('old', '星月夜'); journey.finish('old', explanation, true); tick(10_000);
  assert.equal(journey.state.phase, 'replay'); assert.equal(journey.state.painting, waterLilies); assert.equal(archived.length, 0);
});

test('duplicate completion and image load events archive once; filing cancellation preserves recorded memory', () => {
  const { journey, archived, tick } = setup();
  journey.begin('once', '星月夜'); journey.loaded(starryNight.id); journey.finish('once', explanation, true);
  journey.loaded(starryNight.id); journey.finish('once', explanation, true); tick(hold + frame);
  assert.equal(archived.length, 1); journey.finish('once', explanation, true); journey.cancel(); tick(10_000);
  assert.equal(archived.length, 1); assert.equal(journey.state.token, null);
});

test('ordinary follow-ups retain a visible painting and disposal removes scheduled work', () => {
  const { journey, archived, tick } = setup();
  journey.begin('first', '星月夜'); journey.begin('follow-up', '那棵树呢？'); assert.equal(journey.state.painting, starryNight);
  journey.loaded(starryNight.id); journey.finish('follow-up', explanation, true); journey.dispose(); tick(10_000);
  assert.equal(archived.length, 0);
});
