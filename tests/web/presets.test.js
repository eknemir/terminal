'use strict';
// The preset catalogue changes often, so these tests check its rules, not its wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, WEB } = require('../helpers/load');

const P = load('presets.js').window.DTPresets;
const ids = (l) => [...l].map((p) => p.id);
const byCat = (c) => P.list.filter((p) => p.category === c);

test('presets.js defers init while loading and skips without #presets-mount', () => {
  const t = load('presets.js', { readyState: 'loading' });
  assert.equal(t.docListeners.DOMContentLoaded.length, 1);
  t.fireDoc('DOMContentLoaded');
});

test('list: unique ids, known categories, every category used', () => {
  assert.ok(P.list.length >= 18, `only ${P.list.length} presets`);
  assert.equal(new Set(ids(P.list)).size, P.list.length, 'duplicate preset id');
  assert.equal(new Set(P.categories).size, P.categories.length);
  for (const p of P.list) {
    assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, p.id);
    assert.ok(P.categories.includes(p.category), `${p.id}: unknown category ${p.category}`);
    assert.ok(p.name && p.name.trim() && p.description && p.description.trim(), p.id);
  }
  for (const c of P.categories) assert.ok(byCat(c).length > 0, `category ${c} is empty`);
});

test('every prompt: {metin} slot, 1080x1920, Instagram safe area, render step', () => {
  for (const p of P.list) {
    assert.ok(p.template.includes('{metin}'), `${p.id}: no {metin}`);
    assert.ok(p.template.includes('1080x1920'), `${p.id}: not 1080x1920`);
    assert.match(p.template, /güvenli alan/i, `${p.id}: no safe area`);
    assert.match(p.template, /render/i, `${p.id}: no render step`);
  }
});

test('every preset has its preview style (.pv-<id>) in presets.css', () => {
  const css = fs.readFileSync(path.join(WEB, 'presets.css'), 'utf8');
  for (const p of P.list) assert.match(css, new RegExp(`\\.pv-${p.id}(?![\\w-])`), `.pv-${p.id} missing in presets.css`);
});

test('filter: categories', () => {
  const all = P.list.length;
  assert.equal(P.filter(P.list).length, all);
  assert.equal(P.filter(P.list, 'Tümü').length, all);
  assert.equal(P.filter(P.list, '').length, all);
  assert.equal(P.filter(P.list, null, null).length, all);
  for (const c of P.categories) assert.deepEqual(ids(P.filter(P.list, c)), ids(byCat(c)), c);
  assert.deepEqual(ids(P.filter(P.list, 'Yok-böyle-kategori')), []);
  assert.deepEqual([...P.filter(null, P.categories[0])], []);
  assert.deepEqual([...P.filter(undefined)], []);
});

test('filter: query over name, description, id and category; trimmed; Turkish case folding', () => {
  for (const p of P.list) {
    assert.ok(ids(P.filter(P.list, null, p.id)).includes(p.id), `id ${p.id}`);
    assert.ok(ids(P.filter(P.list, null, `  ${p.name.toLocaleUpperCase('tr')}  `)).includes(p.id), `name ${p.name}`);
    assert.ok(ids(P.filter(P.list, 'Tümü', p.description)).includes(p.id), `description ${p.id}`);
  }
  const c = P.categories[0];
  assert.ok(ids(P.filter(P.list, null, c.toLocaleUpperCase('tr'))).length >= byCat(c).length);
  // Turkish folding: "I" is the capital of "ı", "İ" of "i".
  const fake = [{ id: 'x', name: 'Işık', description: 'İnce', category: 'A' }];
  assert.equal(P.filter(fake, null, 'IŞIK').length, 1);
  assert.equal(P.filter(fake, null, 'ince').length, 1);
  assert.equal(P.filter(P.list, null, '   ').length, P.list.length);
  assert.deepEqual(ids(P.filter(P.list, null, 'zzz-hiç-yok-qqq')), []);
});

test('filter: category and query combine', () => {
  const p = P.list[0];
  assert.deepEqual(ids(P.filter(P.list, p.category, p.id)), [p.id]);
  const other = P.categories.find((c) => c !== p.category);
  assert.ok(!ids(P.filter(P.list, other, p.id)).includes(p.id));
});

test('fillPrompt: {metin} and {kelime}, defaults, trimming, literal replacement', () => {
  assert.equal(P.fillPrompt('a {metin} b {metin}', 'X'), 'a X b X');
  assert.equal(P.fillPrompt('[{metin}]', '  merhaba  '), '[merhaba]');
  assert.equal(P.fillPrompt('[{metin}]', ''), '[METNİNİZ]');
  assert.equal(P.fillPrompt('[{metin}]', '   '), '[METNİNİZ]');
  assert.equal(P.fillPrompt('[{metin}]', null), '[METNİNİZ]');
  assert.equal(P.fillPrompt('[{metin}]'), '[METNİNİZ]');
  assert.equal(P.fillPrompt('[{metin}]', 0), '[0]');
  assert.equal(P.fillPrompt('[{metin}]', '$& $1'), '[$& $1]');
  assert.equal(P.fillPrompt('{kelime}/{kelime}', 'm', 'K'), 'K/K');
  assert.equal(P.fillPrompt('{kelime}', 'm', '  k  '), 'k');
  assert.equal(P.fillPrompt('{kelime}', 'm'), 'EFEKT');
  assert.equal(P.fillPrompt('{kelime}', 'm', null), 'EFEKT');
  assert.equal(P.fillPrompt('{kelime}', 'm', ' '), 'EFEKT');
  assert.equal(P.fillPrompt('{kelime}', 'm', 0), '0');
  assert.equal(P.fillPrompt('{metin}', '{kelime}', 'K'), '{kelime}'); // single pass: placeholders inside user text stay literal
  assert.equal(P.fillPrompt('no slot', 'X'), 'no slot');
  assert.equal(P.fillPrompt(null, 'X'), '');
  assert.equal(P.fillPrompt(undefined, 'X'), '');
});

test('fillPrompt on every real preset leaves no placeholder', () => {
  for (const p of P.list) {
    const out = P.fillPrompt(p.template, 'Selam', 'DEV');
    assert.ok(!out.includes('{metin}') && !out.includes('{kelime}'), p.id);
    assert.ok(out.includes('Selam'), p.id);
  }
});
