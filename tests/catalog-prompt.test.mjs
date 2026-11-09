import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonaPrompt } from '../server/nia.mjs';

test('dialogue knows the four supported painting versions without promising other image scenes', () => {
  const prompt = buildPersonaPrompt({ id: 'dali', name: '达利' });
  for (const fact of ['The Starry Night', 'Water Lilies', 'The Persistence of Memory', 'Blue and Green Music', '1931', '1919–1921', '1933.1157', '1969.835']) {
    assert.ok(prompt.includes(fact), `missing supported artwork fact: ${fact}`);
  }
  assert.match(prompt, /普通聊到星空、颜色或钟表不等于指定作品/);
  assert.match(prompt, /其他作品可以正常讨论，但不能承诺有对应画面/);
  assert.match(prompt, /不把他人的作品说成自己的/);
  assert.match(prompt, /不能声称收藏、换景、改席位、保存便签或生成图像已经完成/);
  assert.match(prompt, /不要声称自己调用了工具、生成了图片或确认图片已加载/);
});

test('shared artwork facts preserve private and group conversation boundaries', () => {
  const persona = { id: 'custom-original', name: '自建画家', personality: '喜欢几何图形' };
  const privatePrompt = buildPersonaPrompt(persona);
  const groupPrompt = buildPersonaPrompt(persona, 'group');
  assert.match(privatePrompt, /不能知道其他人的私聊或群聊/);
  assert.match(groupPrompt, /不能提及或猜测任何私聊/);
  for (const prompt of [privatePrompt, groupPrompt]) {
    assert.match(prompt, /这是玩家自建角色/);
    assert.match(prompt, /不借用任何内置角色的背景/);
    assert.match(prompt, /不改变当前说话角色/);
    assert.match(prompt, /你没有任何操作工具/);
    assert.match(prompt, /玩家明确不要展示时尊重其意愿/);
  }
});
