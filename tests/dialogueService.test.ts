import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artists } from '../src/lib/artists.ts';
import { dialogueBody, requestDialogue } from '../src/lib/dialogueService.ts';

test('dialogue wire format includes a bounded persona and current conversation, omitting reference images and source files', () => {
  const artist = { ...artists[0], referenceImage: 'PRIVATE-IMAGE', sourceNotes: 'PRIVATE-SOURCE', serviceVoice: { provider: 'minimax' as const, model: 'm', voice: 'PRIVATE-VOICE' } };
  const body = dialogueBody(artist, '你好', Array.from({ length: 20 }, (_, i) => ({ who: 'player' as const, text: `消息${i}` })), 'group');
  assert.equal(body.history.length, 12); assert.equal(body.history[0].text, '消息8');
  for (const value of ['PRIVATE-IMAGE', 'PRIVATE-SOURCE', 'PRIVATE-VOICE']) assert.ok(!JSON.stringify(body).includes(value));
  assert.equal(body.persona.name, '莫奈'); assert.equal(body.mode, 'group');
});
test('dialogue calls only the configured backend with no browser credentials and an abortable request', async () => {
  const signal = new AbortController().signal;
  const body = dialogueBody(artists[0], '你好', [], 'private');
  const fetcher = (async (url, init) => {
    assert.equal(url, 'http://localhost:4894/api/dialogue'); assert.equal(init?.signal, signal); assert.equal(init?.credentials, 'omit');
    assert.equal(JSON.parse(String(init?.body)).text, '你好');
    return new Response(JSON.stringify({ ok: true, text: '在听。' }));
  }) as typeof fetch;
  assert.equal(await requestDialogue('http://localhost:4894', body, signal, fetcher), '在听。');
});
