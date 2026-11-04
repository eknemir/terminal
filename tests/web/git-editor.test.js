'use strict';
// git-editor.js: the diff view git.js opens (without the highlighter, which loads its scripts only in the app):
// parsing, split / inline / single layouts, word marks, whitespace, folding, rulers, sticky lines, the cursor and blame.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const DIFF = [
  'diff --git a/x.css b/x.css',
  '--- a/x.css',
  '+++ b/x.css',
  '@@ -1,6 +1,7 @@',
  ' .a {',
  '   .b {',
  '-    color: red;',
  '+    color: #ff0000;',
  '+    /* todo: more */',
  '   }',
  ' }',
  '-gone',
  '@@ -20,3 +21,3 @@',
  ' x\r',
  '-  y  ',
  '+y',
  '\\ No newline at end of file',
  ' z',
].join('\n');

function boot(opts = {}) {
  const answers = { diff: { diff: DIFF, abs: '/r/x.css' }, blame: { hash: 'abc1234', author: 'Ann', me: 'Me', time: Date.now() / 1000 - 3 * 86400, summary: 'tweak' }, ...(opts.answers || {}) };
  const d = makeDom({ reply: { git: (m) => (typeof answers[m.type] === 'function' ? answers[m.type](m) : answers[m.type]) }, storage: opts.storage, globals: { __tmLanguages: { names: { makefile: 'source.makefile' }, ext: { '.css': 'source.css', '.go': 'source.go' }, labels: { 'source.css': 'CSS' }, scopes: [] }, ...(opts.globals || {}) } });
  if (opts.noLanguages) delete d.window.__tmLanguages;
  d.document.body.insertAdjacentHTML('beforeend', '<section id="git"><div class="vs-dv"></div></section>');
  d.run('git-editor.js');
  d.el = d.$('#git .vs-dv');
  return d;
}
const E = (d) => d.window.GitEditor;
const spec = (over = {}) => ({ root: '/r', path: 'x.css', staged: false, kind: 'change', ...over });

test('open: split view of a change, facts for the status bar, word marks, swatches', async (t) => {
  const d = boot();
  t.after(d.close);
  assert.match(d.document.documentElement.style.getPropertyValue('--code-font'), /Menlo/);
  assert.equal(E(d).state(), null);
  const r = await E(d).open(d.el, spec(), {});
  assert.deepEqual({ ...r }, { abs: '/r/x.css', indent: 'Boşluk: 2', eol: 'CRLF', language: 'CSS' });
  assert.equal(d.el.className, 'vs-dv split');
  assert.deepEqual({ ...E(d).state() }, { ignoreTrim: true, collapse: false, inline: false, mode: 'split' });
  const rows = d.$$('#git .vs-dr');
  // .a, .b, mod, ins, }, }, del, gap, x, y (equal but for its spaces), z
  assert.equal(rows.length, 11);
  assert.ok(rows[7].classList.contains('gap'));
  const mod = rows[2];
  assert.ok(mod.querySelector('.vs-hl.del'));
  assert.ok(mod.querySelector('.vs-hl.ins'));
  assert.ok(mod.querySelector('.vs-m'));
  assert.equal(mod.querySelector('[data-s="a"] .vs-n').textContent, '3');
  assert.equal(mod.querySelector('[data-s="b"] .vs-n').textContent, '3');
  assert.ok(mod.querySelector('.vs-sw')); // a CSS colour gets its swatch
  assert.ok(rows[3].querySelector('.vs-h.fill'));
  assert.ok(rows[3].querySelector('.ins.whole'));
  assert.ok(rows[6].querySelector('.del.whole'));
  // ignoreTrim: "  y  " and "y" stay one equal row
  assert.ok(!rows[9].querySelector('.del'));
  assert.equal(rows[9].querySelector('[data-s="a"] .vs-n').textContent, '21');
  assert.equal(rows[9].querySelector('[data-s="b"] .vs-n').textContent, '22');
  assert.equal(d.el.style.getPropertyValue('--digits'), '3');
  assert.ok(d.el.querySelector('.vs-sticky.left'));
  assert.ok(d.el.querySelector('.vs-er.left'));
  assert.ok(d.el.querySelector('.vs-dov .vs-marks'));
  assert.ok(d.el.querySelectorAll('.vs-mk').length >= 2);
});

test('toggles: whitespace, inline and collapse, kept in storage', async (t) => {
  const d = boot();
  t.after(d.close);
  E(d).toggle('inline'); // nothing open: nothing
  await E(d).open(d.el, spec(), {});
  E(d).toggle('whitespace');
  assert.equal(d.window.localStorage.getItem('git.ignoreTrim'), '0');
  const rows = d.$$('#git .vs-dr');
  assert.ok(rows.some((r) => r.querySelector('[data-s="a"]')?.textContent.includes('  y  ') && r.querySelector('.del')));
  E(d).toggle('inline');
  assert.equal(d.el.className, 'vs-dv inline');
  assert.equal(d.window.localStorage.getItem('git.inline'), '1');
  const inl = d.$$('#git .vs-dr.inl');
  assert.ok(inl.length > 10);
  assert.ok(inl.some((r) => r.querySelector('.del.whole')));
  assert.ok(inl.some((r) => r.querySelector('.ins.whole')));
  assert.ok(inl.some((r) => r.querySelectorAll('.vs-n').length === 2));
  assert.equal(d.el.querySelector('.vs-sticky.left'), null);
  E(d).toggle('collapse');
  assert.equal(d.window.localStorage.getItem('git.collapse'), '1');
  assert.equal(E(d).state().collapse, true);
  // the kept settings apply to the next file
  const d2 = boot({ storage: { 'git.ignoreTrim': '0', 'git.inline': '1', 'git.collapse': '1' } });
  t.after(d2.close);
  await E(d2).open(d2.el, spec(), {});
  assert.deepEqual({ ...E(d2).state() }, { ignoreTrim: false, collapse: true, inline: true, mode: 'inline' });
});

test('folding long unchanged runs: three lines kept around changes', async (t) => {
  const lines = ['@@ -1,20 +1,20 @@'];
  for (let i = 1; i <= 20; i++) lines.push(i === 10 ? '-ten' : ` line ${i}`);
  lines.splice(11, 0, '+TEN');
  const d = boot({ answers: { diff: { diff: lines.join('\n'), abs: '/r/a.txt' } }, storage: { 'git.collapse': '1' } });
  t.after(d.close);
  await E(d).open(d.el, spec({ path: 'a.txt' }), {});
  const gaps = d.$$('#git .vs-dr.gap');
  assert.equal(gaps.length, 2);
  assert.equal(gaps[0].textContent, '6 gizli satır');
  assert.equal(gaps[1].textContent, '7 gizli satır');
  assert.equal(d.$$('#git .vs-dr').length, 2 + 3 + 1 + 3);
});

test('single view: a new file and a deleted file open alone; tabs for indent', async (t) => {
  const added = ['@@ -0,0 +1,3 @@', '+\tone', '+\ttwo', '+\t\tthree'].join('\n');
  const d = boot({ answers: { diff: { diff: added, abs: '/r/n.go' } } });
  t.after(d.close);
  const r = await E(d).open(d.el, spec({ path: 'n.go' }), {});
  assert.equal(d.el.className, 'vs-dv single');
  assert.equal(r.indent, 'Sekme Boyutu: 4');
  assert.equal(r.eol, 'LF');
  assert.equal(d.$$('#git .vs-dr [data-s="b"]').length, 3);
  assert.equal(d.el.querySelector('.vs-dov'), null);
  const removed = ['@@ -1,2 +0,0 @@', '-a', '-b', '@@ -9,1 +0,0 @@', '-c'].join('\n');
  const d2 = boot({ answers: { diff: { diff: removed, abs: '/r/o.txt' } } });
  t.after(d2.close);
  await E(d2).open(d2.el, spec({ path: 'o.txt' }), {});
  assert.equal(d2.$$('#git .vs-dr [data-s="a"]').length, 3);
  assert.equal(d2.$('#git .vs-dr.gap').textContent, '⋯');
});

test('notes and errors: no diff, an error, a note', async (t) => {
  const d = boot({ answers: { diff: { diff: '', abs: '/r/x' } } });
  t.after(d.close);
  const r = await E(d).open(d.el, spec(), {});
  assert.equal(r.note, 'Değişiklik yok');
  assert.equal(d.el.querySelector('.vs-note').textContent, 'Değişiklik yok');
  assert.equal(E(d).state(), null);
  const d2 = boot({ answers: { diff: { error: 'binary <file>' } } });
  t.after(d2.close);
  assert.equal((await E(d2).open(d2.el, spec(), {})).note, 'binary <file>');
  assert.equal(d2.el.querySelector('.vs-note').textContent, 'binary <file>');
  const d3 = boot({ answers: { diff: () => { throw new Error('gone'); } } });
  t.after(d3.close);
  assert.match((await E(d3).open(d3.el, spec(), {})).note, /gone/);
});

test('reveal: next and previous change wrap around; reopen keeps the scroll', async (t) => {
  const d = boot();
  t.after(d.close);
  E(d).reveal(1); // nothing open
  await E(d).open(d.el, spec(), {});
  const sc = d.el.querySelector('.vs-sc');
  Object.defineProperty(sc, 'clientHeight', { value: 30, configurable: true });
  const rows = d.$$('#git .vs-dr');
  rows.forEach((r, i) => Object.defineProperty(r, 'offsetTop', { value: i * 20, configurable: true }));
  E(d).measure();
  E(d).reveal(1);
  const a = sc.scrollTop;
  E(d).reveal(1);
  E(d).reveal(1);
  E(d).reveal(-1);
  assert.equal(typeof a, 'number');
  sc.scrollTop = 40;
  await E(d).open(d.el, spec(), {});
  assert.equal(d.el.querySelector('.vs-sc').scrollTop, 40);
  E(d).close();
  assert.equal(E(d).state(), null);
  assert.equal(E(d).measure(), null);
  // a diff with no changes reveals nothing
  const d2 = boot({ answers: { diff: { diff: '@@ -1,1 +1,1 @@\n same', abs: '/r/s' } } });
  t.after(d2.close);
  await E(d2).open(d2.el, spec({ path: 's' }), {});
  E(d2).reveal(1);
});

test('the cursor and blame: a click on a line; uncommitted lines; commits blame their own side', async (t) => {
  let blame = { hash: 'abc1234', author: 'Ann', me: 'Me', time: Date.now() / 1000 - 3 * 86400, summary: 'tweak' };
  const d = boot({ answers: { blame: () => blame } });
  t.after(d.close);
  const seen = { cursor: [], blame: [] };
  await E(d).open(d.el, spec(), { onCursor: (c) => seen.cursor.push(c), onBlame: (b) => seen.blame.push(b) });
  const line = d.$('#git .vs-hl[data-s="b"][data-l="3"]');
  d.fire(line.querySelector('.vs-t'), 'mousedown');
  await d.flush();
  assert.ok(line.classList.contains('cur'));
  assert.deepEqual({ ...seen.cursor[0] }, { line: 3, col: 1, side: 'b' });
  const m = d.posted.filter((x) => x.type === 'blame').at(-1);
  assert.deepEqual({ path: m.path, line: m.line, commit: m.commit }, { path: 'x.css', line: 3, commit: '' });
  assert.equal(line.querySelector('.vs-blame').textContent, 'Ann, 3 gün önce • tweak');
  assert.equal(seen.blame.at(-1).who, 'Ann');
  // the old side blames HEAD
  blame = { hash: '0000000', author: 'Not Committed Yet', time: 0 };
  d.fire(d.$('#git .vs-hl[data-s="a"][data-l="3"]'), 'mousedown');
  await d.flush();
  assert.equal(d.posted.filter((x) => x.type === 'blame').at(-1).commit, 'HEAD');
  assert.equal(seen.blame.at(-1).uncommitted, true);
  assert.equal(seen.blame.at(-1).who, 'Siz');
  assert.equal(d.$$('#git .vs-hl.cur').length, 1);
  // a blame error clears it
  blame = { error: 'no' };
  d.fire(d.$('#git .vs-hl[data-s="b"][data-l="1"]'), 'mousedown');
  await d.flush();
  assert.equal(seen.blame.at(-1), null);
  // clicks outside lines do nothing
  d.fire(d.document.body, 'mousedown');
  // commits: each side its own revision; dates in other units
  const d2 = boot({ answers: { blame: () => ({ hash: 'f00', author: 'Me', me: 'Me', time: Date.now() / 1000 - 400 * 86400 }) } });
  t.after(d2.close);
  const b2 = [];
  await E(d2).open(d2.el, spec({ kind: 'commit', hash: 'h1', parent: 'p1' }), { onBlame: (b) => b2.push(b) });
  d2.fire(d2.$('#git .vs-hl[data-s="a"][data-l="3"]'), 'mousedown');
  await d2.flush();
  assert.equal(d2.posted.filter((x) => x.type === 'blame').at(-1).commit, 'p1');
  assert.equal(b2.at(-1).who, 'Siz');
  assert.equal(b2.at(-1).when, '1 yıl önce');
  d2.fire(d2.$('#git .vs-hl[data-s="b"][data-l="3"]'), 'mousedown');
  await d2.flush();
  assert.equal(d2.posted.filter((x) => x.type === 'blame').at(-1).commit, 'h1');
});

test('sticky lines, the rulers and scrolling', async (t) => {
  const d = boot();
  t.after(d.close);
  await E(d).open(d.el, spec(), {});
  const sc = d.el.querySelector('.vs-sc');
  const rows = d.$$('#git .vs-dr');
  rows.forEach((r, i) => Object.defineProperty(r, 'offsetTop', { value: i * 20, configurable: true }));
  Object.defineProperty(sc, 'scrollHeight', { value: 220, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 50, configurable: true });
  for (const r of d.el.querySelectorAll('.vs-er, .vs-dov')) Object.defineProperty(r, 'clientHeight', { value: 100, configurable: true });
  E(d).measure();
  sc.scrollTop = 45; // row 2: inside .a { .b {
  sc.dispatchEvent(new d.window.Event('scroll'));
  const right = d.el.querySelector('.vs-sticky.right');
  assert.equal(right.hidden, false);
  assert.deepEqual([...right.querySelectorAll('.vs-n')].map((n) => n.textContent), ['1', '2']);
  const slider = d.el.querySelector('.vs-er.right .vs-slider');
  assert.equal(slider.hidden, false);
  assert.match(slider.style.height, /px$/);
  // a sticky line takes you to its line
  d.click(right.querySelector('.vs-hl[data-l="1"]'));
  assert.equal(sc.scrollTop, 0);
  // the wheel and a drag on a ruler scroll
  const ruler = d.el.querySelector('.vs-er.right');
  const wheel = new d.window.Event('wheel');
  wheel.deltaY = 30;
  ruler.dispatchEvent(wheel);
  assert.equal(sc.scrollTop, 30);
  d.fire(ruler, 'mousedown', { clientY: 50 });
  assert.ok(slider.classList.contains('on'));
  d.window.dispatchEvent(new d.window.MouseEvent('mousemove', { clientY: 80 }));
  d.window.dispatchEvent(new d.window.MouseEvent('mouseup'));
  assert.ok(!slider.classList.contains('on'));
  d.fire(slider, 'mousedown', { clientY: 10 });
  d.window.dispatchEvent(new d.window.MouseEvent('mouseup'));
  // the cursor marks the rulers: the left one only for the old side in split view
  d.fire(d.$('#git .vs-hl[data-s="a"][data-l="1"]'), 'mousedown');
  await d.flush();
  assert.equal(d.el.querySelector('.vs-er.left .vs-cur').hidden, false);
  assert.equal(d.el.querySelector('.vs-er.right .vs-cur').hidden, true);
  // the resize observer measures again
  for (const o of d.observers) o.cb([]);
});

test('labels: by file name, by extension, the scope when unnamed, plain text otherwise', async (t) => {
  const d = boot({ answers: { diff: { diff: '@@ -1 +1 @@\n-a\n+b', abs: '/r' } } });
  t.after(d.close);
  assert.equal((await E(d).open(d.el, spec({ path: 'dir/Makefile' }), {})).language, 'source.makefile');
  assert.equal((await E(d).open(d.el, spec({ path: 'a.go' }), {})).language, 'source.go');
  assert.equal((await E(d).open(d.el, spec({ path: 'a.txt' }), {})).language, 'Düz Metin');
});

test('BUG git-editor.js:107/139: without the highlighter\'s language list (tm/ failed to load) opening any diff throws', { todo: 'TM.label reads window.__tmLanguages.names unguarded; git.js then never shows the diff' }, async (t) => {
  const d = boot({ noLanguages: true });
  t.after(d.close);
  const r = await E(d).open(d.el, spec(), {});
  assert.equal(r.language, 'Düz Metin');
});