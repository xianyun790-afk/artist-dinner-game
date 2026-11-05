import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artists} from '../src/lib/artists.ts';
import {responderFor,roomReply} from '../src/lib/room.ts';
const guests=artists.slice(0,4);
test('anyone can speak at the table without first selecting an artist',()=>{
  assert.equal(responderFor('今天好累',guests,null,null)?.id,'georgia');
  assert.equal(responderFor('日落真美',guests,null,null)?.id,'monet');
  assert.equal(responderFor('喜欢蓝色',guests,null,null)?.id,'vincent');
  assert.equal(responderFor('我昨天做了一个梦',guests,null,null)?.id,'dali');
});
test('calling a name overrides topic and a selected seat',()=>{
  assert.equal(responderFor('梵高，你怎么看日落',guests,'monet','dali')?.id,'vincent');
  assert.equal(responderFor('欧姬芙，你会做梦吗',guests,null,null)?.id,'georgia');
});
test('a chosen guest stays in the conversation and an unnamed follow-up has context',()=>{
  assert.equal(responderFor('颜色呢',guests,'monet',null)?.id,'monet');
  assert.equal(responderFor('后来呢',guests,null,'dali')?.id,'dali');
});
test('removed seats cannot receive a response, including a custom-only table',()=>{
  const a={...artists[4],id:'custom-paper',name:'纸灯'};
  assert.equal(responderFor('日落', [a], 'monet','dali')?.id,a.id);
  assert.equal(responderFor('你好',[],null,null),undefined);
});
test('a boundary is not replaced with an enthusiastic topical reply',()=>{
  assert.equal(roomReply(guests[0],'不要聊日落'),null);
  assert.equal(roomReply(guests[2],'我不想说这个梦'),null);
  assert.ok(roomReply(guests[0],'日落')?.includes('明天'));
});
