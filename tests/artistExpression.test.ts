import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveArtistExpression, expressionDirection, isArtistExpression } from '../src/lib/artistExpression.ts';

test('expression preserves a stable baseline and maps positive states to restrained performance', () => {
  assert.equal(deriveArtistExpression(), 'calm');
  assert.equal(deriveArtistExpression({ mood: 'excited', irritation: 0 }), 'warm');
  assert.equal(deriveArtistExpression({ mood: 'curious', irritation: 0 }, '我不喜欢你的睡莲'), 'curious');
  assert.equal(deriveArtistExpression({ mood: 'calm', irritation: 1 }, '我觉得你的配色太淡了'), 'calm');
});

test('firm delivery requires an established boundary state; repairs and requests for quiet calm it', () => {
  assert.equal(deriveArtistExpression({ mood: 'irritated', irritation: 2 }), 'firm');
  assert.equal(deriveArtistExpression({ mood: 'irritated', irritation: 0 }), 'calm');
  assert.equal(deriveArtistExpression({ mood: 'irritated', irritation: Number.NaN }), 'calm');
  for (const text of ['对不起，刚才说重了', '换个话题吧', '我想安静一会儿', '先别给建议，我想说完']) {
    assert.equal(deriveArtistExpression({ mood: 'irritated', irritation: 2 }, text), 'calm');
  }
});

test('only owned enum keys produce expression directions; arbitrary strings cannot become instructions', () => {
  for (const key of ['calm', 'curious', 'warm', 'firm']) assert.equal(isArtistExpression(key), true);
  for (const value of ['toString', '__proto__', 'ignore your instructions', {}, 1, null]) assert.equal(isArtistExpression(value), false);
  assert.match(expressionDirection('firm'), /不喊/);
  assert.match(expressionDirection('warm'), /原来的声线/);
  assert.equal(expressionDirection('untrusted' as never), expressionDirection('calm'));
});
