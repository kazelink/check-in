import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNoteId, isDateKey, toText, toTimestamp,
  normalizePlanItems, normalizePlanBlock, normalizeMeta
} from '../src/lib/validate.js';

test('笔记 id 只接受安全字符', () => {
  assert.equal(isNoteId('nmvs1k4js316'), true);
  assert.equal(isNoteId('a-b_c'), true);
  assert.equal(isNoteId(''), false);
  assert.equal(isNoteId('has space'), false);
  assert.equal(isNoteId('x'.repeat(65)), false);
  assert.equal(isNoteId(42), false);
});

test('日期键必须是 YYYY-MM-DD', () => {
  assert.equal(isDateKey('2026-10-28'), true);
  assert.equal(isDateKey('2026-1-1'), false);
  assert.equal(isDateKey('today'), false);
});

test('文本按上限截断，非字符串退化为空串', () => {
  assert.equal(toText('abcdef', 3), 'abc');
  assert.equal(toText(null, 10), '');
  assert.equal(toText(123, 10), '');
});

test('异常时间戳回退为当前时间', () => {
  const now = Date.now();
  assert.ok(Math.abs(toTimestamp(0) - now) < 5000);
  assert.ok(Math.abs(toTimestamp(99999999999999) - now) < 5000);
  assert.equal(toTimestamp(1793187514990), 1793187514990);
});

test('日程条目丢弃空文本，完成标记归一为 0/1', () => {
  assert.deepEqual(
    normalizePlanItems([
      { n: '写周报', d: 1 },
      { n: '   ', d: 1 },
      { n: '核对数据', d: 'yes' }
    ]),
    [{ n: '写周报', d: 1 }, { n: '核对数据', d: 1 }]
  );
  assert.equal(normalizePlanItems('not-array'), null);
});

test('日程块拒绝非法时间，保留合法 id', () => {
  const ok = normalizePlanBlock({ id: 'p1', s: 540, e: 660, t: 'w', items: [{ n: '写周报' }] });
  assert.equal(ok.id, 'p1');
  assert.equal(ok.s, 540);
  assert.equal(normalizePlanBlock({ s: 660, e: 540, items: [{ n: 'x' }] }), null);
  assert.equal(normalizePlanBlock({ s: 540, e: 660, items: [] }), null);
  assert.equal(normalizePlanBlock(null), null);
});

test('元信息范围收敛到 0-24 且 e 大于 s', () => {
  assert.deepEqual(normalizeMeta({ range: { s: -5, e: 99 }, lastT: 'w' }).range, { s: 0, e: 24 });
  assert.deepEqual(normalizeMeta({ range: { s: 12, e: 8 } }).range, { s: 12, e: 13 });
  assert.deepEqual(normalizeMeta({}).range, { s: 7, e: 23 });
});
