import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceCatalog, voicesForModel, defaultServiceVoice, validateServiceVoice, loadVoiceCatalog, connectVoiceCatalog, synthesizeVoice, synthesisBody, serviceUrl } from '../src/lib/voiceService.ts';
const config = { providers: {
  minimax: { ready: true, defaultModel: 'speech-2.8-hd', defaultVoice: 'default', apiKey: 'DO-NOT-COPY', models: [{ id: 'speech-2.8-hd' }, { id: 'speech-2.8-turbo' }], voices: [{ id: 'default', name: '默认' }, { id: 'Chinese (Mandarin)_Gentleman', name: '温润' }] },
  aliyun: { ready: true, defaultModel: 'cosyvoice-v3-plus', defaultVoice: 'base', models: [{ id: 'cosyvoice-v3-plus' }, { id: 'cosyvoice-v3.5-plus', voices: [] }], voices: [{ id: 'base', name: '系统音色' }] },
  sensetimev5: { ready: true, defaultModel: 'tts-v5', models: [{ id: 'tts-v5' }], voices: [] },
  volcengine: { ready: false, models: [{ id: 'unavailable' }], voices: [{ id: 'not-ready' }] },
} };
const library = { voices: [{ provider: 'aliyun', voice: 'new-clone', model: 'cosyvoice-v3.5-plus', label: '已存音色' }, { provider: 'sensetimev5', voice: 'v5-clone', model: 'tts-v5', label: '库中音色' }, { provider: 'minimax', voice: 'broken', model: 'unknown' }], history: ['PRIVATE'] };
const catalog = parseVoiceCatalog(config, library);

test('voice catalog keeps usable metadata and omits keys, history and unavailable providers', () => {
  assert.deepEqual(catalog.providers.map(p => p.id), ['minimax', 'aliyun', 'sensetimev5']);
  assert.ok(!JSON.stringify(catalog).includes('DO-NOT-COPY'));
  assert.ok(!JSON.stringify(catalog).includes('PRIVATE'));
  assert.ok(!JSON.stringify(catalog).includes('broken'));
});
test('model-specific empty system list stays empty; library voices stay with their model and platform', () => {
  const aliyun = catalog.providers[1];
  assert.deepEqual(voicesForModel(aliyun, 'cosyvoice-v3-plus').map(v => v.id), ['base']);
  assert.deepEqual(voicesForModel(aliyun, 'cosyvoice-v3.5-plus').map(v => v.id), ['new-clone']);
  assert.deepEqual(voicesForModel(catalog.providers[2], 'tts-v5').map(v => v.id), ['v5-clone']);
  assert.deepEqual(voicesForModel(aliyun, 'missing-model'), []);
});
test('built-in default is available, custom artist uses the declared service default, and missing saved choices stay invalid', () => {
  assert.equal(defaultServiceVoice('monet', catalog)?.voice, 'Chinese (Mandarin)_Gentleman');
  assert.equal(defaultServiceVoice('custom-monet-picture', catalog)?.voice, 'default');
  assert.equal(validateServiceVoice({ provider: 'aliyun', model: 'cosyvoice-v3-plus', voice: 'new-clone' }, catalog), false);
  assert.equal(validateServiceVoice({ provider: 'sensetimev5', model: 'tts-v5', voice: 'v5-clone' }, catalog), true);
});
test('catalog requests no shared history and still permits system voices if the optional library is down', async () => {
  const paths: string[] = [];
  const fetcher = (async (url, init) => {
    paths.push(String(url)); assert.equal(init?.credentials, 'omit');
    return new Response(JSON.stringify(paths.length === 1 ? config : { ok: false }), { status: paths.length === 1 ? 200 : 503 });
  }) as typeof fetch;
  const result = await loadVoiceCatalog('http://example.test/', new AbortController().signal, fetcher);
  assert.equal(result.libraryUnavailable, true);
  assert.equal(result.providers[0].voices.length, 2);
  assert.deepEqual(paths, ['http://example.test/api/config', 'http://example.test/api/library']);
});
test('synthesis only sends the requested utterance and voice controls, returning inline audio rather than fetching a supplied URL', async () => {
  const controller = new AbortController();
  const fetcher = (async (url, init) => {
    assert.equal(url, 'http://example.test/api/tts'); assert.equal(init?.signal, controller.signal);
    assert.equal(init?.credentials, 'omit');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body).sort(), ['model', 'options', 'provider', 'text', 'voice']);
    assert.equal(body.text, '晚上好');
    return new Response(JSON.stringify({ ok: true, audio: { format: 'mp3', base64: 'SUQz' }, url: 'https://untrusted.invalid' }));
  }) as typeof fetch;
  const audio = await synthesizeVoice('http://example.test', { provider: 'minimax', model: 'speech-2.8-hd', voice: 'default' }, '晚上好', .9, 1, controller.signal, fetcher);
  assert.equal(new TextDecoder().decode(audio), 'ID3');
});
test('aborting a pending synthesis propagates cancellation instead of producing audio', async () => {
  const controller = new AbortController();
  const fetcher = ((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }); })) as typeof fetch;
  const pending = synthesizeVoice('http://example.test', { provider: 'minimax', model: 'm', voice: 'v' }, '一句话', 1, 1, controller.signal, fetcher);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});
test('invalid audio, failed responses and credential-bearing service URLs are rejected', async () => {
  const choice = { provider: 'minimax' as const, model: 'm', voice: 'v' };
  for (const audio of [{ format: 'mp3', base64: '' }, { format: 'html', base64: 'SUQz' }, { format: 'mp3', base64: '<html>' }]) {
    await assert.rejects(synthesizeVoice('http://example.test', choice, 'test', 1, 1, new AbortController().signal, (async () => new Response(JSON.stringify({ audio }))) as typeof fetch));
  }
  await assert.rejects(synthesizeVoice('http://example.test', choice, 'test', 1, 1, new AbortController().signal, (async () => new Response('{}', { status: 502 })) as typeof fetch));
  assert.throws(() => serviceUrl('https://user:secret@example.test'));
  assert.throws(() => serviceUrl('javascript:alert(1)'));
});
test('provider controls preserve each API scale while text and tuning remain bounded', () => {
  assert.equal(synthesisBody({ provider: 'minimax', model: 'm', voice: 'v' }, 'test', 100, 1).options.speed, 1.25);
  assert.equal(synthesisBody({ provider: 'volcengine', model: 'm', voice: 'v' }, 'test', .85, 1).options.speed, -15);
  assert.equal(synthesisBody({ provider: 'sensetime', model: 'm', voice: 'v' }, 'test', 1, 1).options.volume, 0);
  assert.throws(() => synthesisBody({ provider: 'minimax', model: 'm', voice: 'v' }, ' ', 1, 1));
  assert.throws(() => synthesisBody({ provider: 'minimax', model: 'm', voice: 'v' }, 'x'.repeat(1001), 1, 1));
});


test('a slow optional library leaves system voices connected and does not abort the parent request', async () => {
  const controller = new AbortController();
  const fetcher = (async (url, init) => {
    if (String(url).endsWith('/api/config')) return new Response(JSON.stringify(config));
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }));
  }) as typeof fetch;
  const result = await loadVoiceCatalog('http://example.test', controller.signal, fetcher, { libraryMs: 5 });
  assert.equal(controller.signal.aborted, false);
  assert.equal(result.libraryUnavailable, true);
  assert.equal(defaultServiceVoice('monet', result)?.voice, 'Chinese (Mandarin)_Gentleman');
});
test('a timed out startup config reconnects once and then loads the catalog normally', async () => {
  let configs = 0, libraries = 0;
  const fetcher = (async (url, init) => {
    if (String(url).endsWith('/api/config')) {
      configs++;
      if (configs === 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')), { once: true }));
      return new Response(JSON.stringify(config));
    }
    libraries++; return new Response(JSON.stringify(library));
  }) as typeof fetch;
  const result = await connectVoiceCatalog('http://example.test', new AbortController().signal, fetcher, { configMs: 5 });
  assert.equal(configs, 2); assert.equal(libraries, 1);
  assert.equal(result.libraryUnavailable, false);
});
test('explicit cancellation propagates through library loading without reconnecting', async () => {
  const controller = new AbortController(); let configs = 0;
  const fetcher = (async (url, init) => {
    if (String(url).endsWith('/api/config')) { configs++; return new Response(JSON.stringify(config)); }
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      queueMicrotask(() => controller.abort());
    });
  }) as typeof fetch;
  await assert.rejects(connectVoiceCatalog('http://example.test', controller.signal, fetcher), { name: 'AbortError' });
  assert.equal(configs, 1);
});
