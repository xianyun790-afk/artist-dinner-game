import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declinesPaintingDisplay, findMentionedPainting, starryNight } from '../src/lib/paintings.ts';

test('named Starry Night mentions support Chinese aliases and English title formatting', () => {
  for (const text of ['聊聊《星月夜》', '星月夜为什么没有月亮？', '梵高的星夜', '我想看“星 月 夜”', 'Tell me about “THE   STARRY NIGHT”.', 'Starry Night']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
  }
  assert.equal(starryNight.image, '/artworks/starry-night.jpg');
  assert.equal(starryNight.sourceUrl, 'https://www.moma.org/collection/works/79802');
});

test('general stars and non-artwork uses do not select a painting', () => {
  for (const text of ['今天的星空很好看', '夜空中的星星', '他们星夜兼程赶回来', '他披星夜行', 'Starry nights are beautiful']) {
    assert.equal(findMentionedPainting(text), null, text);
  }
});

test('Rhône artwork is not confused with the 1889 Starry Night', () => {
  for (const text of ['罗讷河上的星夜', '《罗纳河上的星夜》', '罗讷河上的《星夜》', 'Starry Night Over the Rhône', 'the STARRY NIGHT OVER THE RHONE']) {
    assert.equal(findMentionedPainting(text), null, text);
  }
  assert.equal(findMentionedPainting('罗讷河上的星夜和星月夜有什么区别？'), starryNight);
});

test('declining to show art is respected while negative opinions remain valid discussion', () => {
  for (const text of ['不要展示星月夜', '先别看《星月夜》', '不用打开星月夜', '星月夜先不要展示', '我不需要你弹出“星夜”']) {
    assert.equal(findMentionedPainting(text), null, text);
    assert.equal(declinesPaintingDisplay(text), true, text);
  }
  for (const text of ['我不喜欢星月夜', '星月夜为什么没有月亮？', '不用打开作品夹，聊聊星月夜吧']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
    assert.equal(declinesPaintingDisplay(text), false, text);
  }
  assert.equal(findMentionedPainting('先别看星月夜，只聊星月夜的颜色'), null);
});

test('picture display can be declined without repeating the artwork title', () => {
  for (const text of ['先别弹出画面，只聊聊星月夜', '不要展示图片', '不要给我看这幅画', '图片先别展示', '别弹窗', '不用配图']) {
    assert.equal(declinesPaintingDisplay(text), true, text);
    assert.equal(findMentionedPainting(text), null, text);
  }
  for (const text of ['不喜欢这幅画', '不想画画', '别忘记展示图片', '不用打开作品夹']) {
    assert.equal(declinesPaintingDisplay(text), false, text);
  }
  for (const text of ['不喜欢这幅画，但可以聊聊星月夜', '不想画画，聊聊星月夜吧']) {
    assert.equal(findMentionedPainting(text), starryNight, text);
  }
});
