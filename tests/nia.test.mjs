import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signNiaToken, buildPersonaPrompt, generateNiaReply } from '../server/nia.mjs';
const config = { accessKey: 'test-access', secretKey: 'test-only-secret', model: 'test-model' };
function socketMock(scenario = 'ok') {
  class Mock extends EventTarget {
    static instances = [];
    readyState = 0; sent = []; closed = false;
    constructor(url) { super(); this.url = url; Mock.instances.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    emit(data) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
    send(raw) {
      const data = JSON.parse(raw); this.sent.push(data);
      queueMicrotask(() => {
        if (this.closed) return;
        if (data.type === 'CreateSession') this.emit({ type: 'CreateSessionResult', success: true, session_id: 'test-session' });
        if (data.type === 'ConfigPipeline') this.emit({ type: scenario === 'reject' ? 'ConfigRejected' : 'ConfigUpdated' });
        if (data.type === 'PostMultimodalGenerate') {
          if (scenario === 'hang') return;
          if (scenario === 'blocked') { this.emit({ type: 'ResponseBlocked' }); return; }
          if (scenario === 'report') { this.emit({ type: 'Report', code: 403, level: 'error', content: 'SENSITIVE-UPSTREAM' }); return; }
          this.emit({ type: 'ResponseStartTextStream', index: 1 });
          this.emit({ type: 'ResponseTextSegment', index: 1, text: '你好。' });
          this.emit({ type: 'ResponseTextSegment', index: 1, text: '我在听。' });
          this.emit({ type: 'ResponseEndTextStream', index: 1, complete: true, text: '你好。我在听。' });
        }
      });
    }
    close() { this.closed = true; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return Mock;
}
const options = { config, persona: { name: '莫奈', personality: '慢热' }, text: '你好', history: [], mode: 'private' };
test('JWT is server-signed with short expiry and does not embed the secret', () => {
  const jwt = signNiaToken(config.accessKey, config.secretKey, 1000000), [head, body, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), { iss: 'test-access', exp: 1180, nbf: 995 });
  assert.equal(signature, createHmac('sha256', config.secretKey).update(`${head}.${body}`).digest('base64url'));
  assert.ok(!jwt.includes(config.secretKey));
});
test('NIA uses the documented session lifecycle and returns one completed text without a duplicate ending', async () => {
  const Socket = socketMock();
  assert.equal(await generateNiaReply(options, Socket), '你好。我在听。');
  const socket = Socket.instances[0];
  assert.deepEqual(socket.sent.map(m => m.type), ['CreateSession', 'ConfigPipeline', 'StartServing', 'PostMultimodalGenerate']);
  assert.equal(socket.sent[1].custom_config.tts.enabled, false);
  assert.equal(socket.sent[1].custom_config.websearch.enabled, false);
  assert.equal(socket.closed, true);
});
test('group prompt and wire context include only supplied group messages, with no application tools', async () => {
  const Socket = socketMock(); const history = [{ who: 'artist', name: '梵高', text: '我喜欢黄。' }];
  await generateNiaReply({ ...options, mode: 'group', history }, Socket);
  const socket = Socket.instances[0];
  assert.match(socket.sent[1].custom_config.system_prompt, /不能提及或猜测任何私聊/);
  assert.equal(socket.sent[1].custom_config.fn_call, undefined);
  assert.deepEqual(JSON.parse(socket.sent[3].text), { recentConversation: history, playerMessage: '你好' });
  assert.match(buildPersonaPrompt(options.persona), /没有任何操作工具/);
});
test('interrupt during generation closes the session and cannot return a late reply', async () => {
  const Socket = socketMock('hang'), controller = new AbortController();
  const pending = generateNiaReply({ ...options, signal: controller.signal }, Socket);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(Socket.instances[0].closed, true);
  assert.equal(Socket.instances[0].sent.at(-1).type, 'InterruptAgent');
});
test('configuration rejection, content blocking, upstream errors and timeout fail without exposing upstream data', async () => {
  for (const scenario of ['reject', 'blocked', 'report', 'hang']) {
    await assert.rejects(generateNiaReply({ ...options, timeoutMs: 10 }, socketMock(scenario)), e => {
      assert.ok(!e.message.includes('SENSITIVE-UPSTREAM')); assert.ok(!e.message.includes(config.secretKey)); return true;
    });
  }
});
