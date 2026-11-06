import test from 'node:test';
import assert from 'node:assert/strict';
import { joinDictation, speechChunks, speechText } from '../src/chat-speech.ts';

test('reading aloud skips code, images and addresses but keeps link words', () => {
  const heard=speechText('## Plan\n\n**Use** two `pointers`, see [the notes](https://a.example/x).\n\n```python\nprint(1)\n```\n\n![pic](a.png)\n\nMore at https://b.example/y now.\n\n- first\n- [x] second');
  assert.equal(heard,'Plan\n\nUse two pointers, see the notes.\n\nMore at now.\n\nfirst\nsecond');
});

test('an unclosed code block is still skipped', () => {
  assert.equal(speechText('Before\n\n```js\nconst a=1;'),'Before');
});

test('tables are read as rows without their rule lines', () => {
  assert.equal(speechText('| Time | Space |\n| --- | --- |\n| O(n) | O(1) |'),'Time, Space\n\nO(n), O(1)');
});

test('math and underscores in words are left alone', () => {
  assert.equal(speechText('Use snake_case_name and 2 * 3 * 4.'),'Use snake_case_name and 2 * 3 * 4.');
});

test('speech is split into short pieces, by language', () => {
  const chunks=speechChunks('Hello there. 这是中文。 Back to English!');
  assert.deepEqual(chunks,[{text:'Hello there.',lang:'en-US'},{text:'这是中文。',lang:'zh-CN'},{text:'Back to English!',lang:'en-US'}]);
  const long=speechChunks(`${'word '.repeat(200)}end.`);
  assert.ok(long.length>1);
  assert.ok(long.every(chunk=>chunk.text.length<=220));
  assert.equal(long.map(chunk=>chunk.text).join(''),`${'word '.repeat(200)}end.`);
});

test('sentences of one language share a piece up to the limit', () => {
  assert.deepEqual(speechChunks('One. Two.'),[{text:'One. Two.',lang:'en-US'}]);
  assert.deepEqual(speechChunks('一。二。'),[{text:'一。二。',lang:'zh-CN'}]);
});

test('dictation lands at the cursor with sensible spaces', () => {
  assert.equal(joinDictation('Ask','about heaps',''),'Ask about heaps');
  assert.equal(joinDictation('Ask ','about heaps',' now'),'Ask about heaps now');
  assert.equal(joinDictation('Ask','about heaps','now'),'Ask about heaps now');
  assert.equal(joinDictation('Ask','about heaps','.'),'Ask about heaps.');
  assert.equal(joinDictation('问题','关于堆','吗'),'问题关于堆吗');
  assert.equal(joinDictation('','hello',''),'hello');
  assert.equal(joinDictation('keep','','this'),'keepthis');
});
