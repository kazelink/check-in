import test from 'node:test';
import assert from 'node:assert/strict';

import { normalize, emptyState, hasContent } from '../public/modules/store.js';

test('空输入退化为默认状态', () => {
  assert.deepEqual(normalize(null), emptyState());
  assert.deepEqual(normalize('x'), emptyState());
  assert.equal(hasContent(emptyState()), false);
});

test('笔记保留标题与正文，丢弃空条目和脏 id', () => {
  const state = normalize({
    notes: [
      { id: 'n1', t: '标题', h: '<p>正文</p>', u: 123 },
      { id: '', t: '没有 id', h: 'x' },
      { id: 'n2', t: '', h: '' },
      { id: 'n3', t: 1, h: null, u: 'abc' }
    ]
  });
  assert.deepEqual(state.notes, [
    { id: 'n1', t: '标题', h: '<p>正文</p>', u: 123 }
  ]);
});

test('日程兼容早期的字符串事项写法', () => {
  const state = normalize({
    plans: { '2026-10-28': [{ id: 'p1', s: 540, e: 600, t: 's', items: ['写周报', { n: '核对数据', d: 1 }] }] }
  });
  assert.deepEqual(state.plans['2026-10-28'][0].items, [
    { n: '写周报', d: 0 },
    { n: '核对数据', d: 1 }
  ]);
});

test('缺 id 的日程块补 id，空块被丢弃', () => {
  const state = normalize({
    plans: { '2026-10-28': [{ s: 540, e: 600, items: [{ n: '写周报' }] }, { s: 600, e: 660, items: [] }] }
  });
  const list = state.plans['2026-10-28'];
  assert.equal(list.length, 1);
  assert.match(list[0].id, /^p/);
});

test('时间范围非法时回落到默认值', () => {
  assert.deepEqual(normalize({ range: { s: 30, e: 4 } }).range, { s: 23, e: 24 });
  assert.deepEqual(normalize({}).range, { s: 7, e: 23 });
  assert.equal(normalize({ lastT: 's' }).lastT, 's');
});
