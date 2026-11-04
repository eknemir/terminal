'use strict';
// git.js: Source Control in the dashboard (activity bar, CHANGES tree, actions, GRAPH, editor tab, status bar, cards'
// chips), against a fake git bridge and a stub GitEditor.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDom } = require('./dom');

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const repos = () => [
  {
    root: '/r/a', name: 'a', path: '/r/a', branch: 'main', ahead: 1, behind: 2, sessions: [{ id: 's1' }],
    files: [
      { path: 'src/z.js', status: 'M', staged: false, add: 3, del: 1, editors: ['s1'] },
      { path: 'src/b.js', status: 'M', staged: false, add: 1, del: 0 },
      { path: 'a.txt', status: 'A', staged: true, add: 5, del: 0 },
      { path: 'gone.md', status: 'D', staged: false },
      { path: 'new.py', status: 'U', staged: false },
    ],
  },
  { root: '/r/b', name: 'b', path: '/r/b', branch: 'dev', ahead: null, behind: 0, files: [], sessions: [] },
];
const commits = () => [
  { hash: 'u1aaaaaaa', parents: ['c3aaaaaaa'], author: 'Up', date: iso(30_000), subject: 'upstream', refs: ['refs/remotes/origin/main'] },
  { hash: 'c3aaaaaaa', parents: ['c2aaaaaaa'], author: 'Me', date: iso(2 * 3600_000), subject: 'third <b>', refs: ['HEAD -> refs/heads/main', 'tag: refs/tags/v1', 'refs/remotes/origin/HEAD'] },
  { hash: 'c2aaaaaaa', parents: ['c1aaaaaaa', 'm1aaaaaaa'], author: 'Me', date: iso(3 * 86400_000), subject: 'merge', refs: [] },
  { hash: 'm1aaaaaaa', parents: ['c1aaaaaaa'], author: 'Other', date: iso(10 * 86400_000), subject: 'side', refs: ['refs/heads/feature'] },
  { hash: 'c1aaaaaaa', parents: [], author: 'Me', date: iso(400 * 86400_000), subject: 'first', refs: [] },
];

function boot(opts = {}) {
  const answers = opts.answers || {};
  let list = opts.repos || repos();
  const ed = { opened: [], toggled: [], revealed: [], st: { ignoreTrim: true, collapse: false, inline: false }, closed: 0, measured: 0 };
  const git = (m) => {
    if (answers[m.type] !== undefined) return typeof answers[m.type] === 'function' ? answers[m.type](m) : answers[m.type];
    switch (m.type) {
      case 'repos': return { repos: list, noGit: !!opts.noGit };
      case 'log': return m.all
        ? { commits: commits().slice(1), branch: 'refs/heads/main', head: 'c3aaaaaaa', upstream: 'refs/remotes/origin/main', upstreamRev: 'c2aaaaaaa', mergeBase: 'c2aaaaaaa', base: 'refs/heads/feature', baseRev: 'm1aaaaaaa' }
        : { commits: commits(), branch: 'refs/heads/main', head: 'c3aaaaaaa', upstream: 'refs/remotes/origin/main', upstreamRev: 'u1aaaaaaa', mergeBase: 'c3aaaaaaa' };
      case 'show': return { files: [{ path: 'src/z.js', status: 'M' }, { path: 'a.txt', status: 'A' }] };
      case 'confirm': return 0;
      case 'menu': return -1;
      default: return {};
    }
  };
  const d = makeDom({
    reply: { git, radar: () => ({}) },
    storage: opts.storage,
    globals: {
      GitEditor: {
        open: async (el, spec, hooks) => {
          ed.opened.push(JSON.parse(JSON.stringify(spec)));
          hooks.onCursor({ line: 3, col: 4 });
          hooks.onBlame({ who: 'Me', when: '2 days ago', author: 'Me', summary: 'x', hash: 'abcdef12345' });
          return opts.editorNote ? { note: 'Değişiklik yok' } : { abs: '/r/a/src/z.js', indent: 'Spaces: 2', eol: 'LF', language: 'JavaScript' };
        },
        close: () => ed.closed++,
        state: () => ({ ...ed.st }),
        toggle: (w) => { ed.toggled.push(w); if (w === 'inline') ed.st.inline = !ed.st.inline; if (w === 'collapse') ed.st.collapse = !ed.st.collapse; if (w === 'whitespace') ed.st.ignoreTrim = !ed.st.ignoreTrim; },
        reveal: (n) => ed.revealed.push(n),
        measure: () => ed.measured++,
      },
      ...(opts.globals || {}),
    },
  });
  d.run('app.js', 'git-icons.js', 'git.js');
  Object.assign(d, { ed, setRepos: (r) => (list = r), gitCalls: (type) => d.posted.filter((m) => m.via === 'git' && (!type || m.type === type)) });
  return d;
}
const G = (d) => d.window.GitView;
const rowsOf = (d) => d.$$('#git .vs-pane.changes .vs-r');
const fileRow = (d, p, staged = 0) => d.$(`#git .vs-file[data-path="${p}"][data-staged="${staged}"]`);
const toastText = (d) => d.$('#toast').textContent;

test('activity bar and the changes badge', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  const items = d.$$('#activity .vs-ab');
  assert.deepEqual(items.map((a) => a.dataset.view), ['dash', 'git', 'friends', 'board', 'themes', 'notifications', 'feedback']);
  assert.ok(items[0].classList.contains('on'));
  const b = d.$('#activity [data-view=git] .vs-badge');
  assert.equal(b.hidden, false);
  assert.equal(b.textContent, '5');
  // no changes: no badge
  d.setRepos([]);
  d.tick(15_000);
  await d.flush();
  assert.equal(b.hidden, true);
});

test('changes: several repos, each with its row, message box, button, groups in VS Code order', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  assert.ok(d.$('#app').classList.contains('git-mode'));
  assert.ok(d.$('#activity [data-view=git]').classList.contains('on'));
  const repoRows = d.$$('#git .vs-repo');
  assert.equal(repoRows.length, 2);
  assert.equal(repoRows[0].querySelector('.vs-pn').textContent, 'a');
  assert.equal(repoRows[0].querySelector('.vs-st span').textContent, 'main*');
  assert.equal(repoRows[0].querySelector('[data-act="sync"] span').textContent, '2↓ 1↑');
  assert.ok(repoRows[1].querySelector('[data-act="publish"]'));
  const groups = d.$$('#git .vs-grp');
  assert.deepEqual(groups.map((g) => g.querySelector('.vs-gn').textContent), ['Stage Edilen Değişiklikler', 'Değişiklikler']);
  assert.deepEqual(groups.map((g) => g.querySelector('.vs-cb').textContent), ['1', '4']);
  // a folder's own files first, then its subfolders, names compared as people read them
  const work = d.$$('#git .vs-file[data-staged="0"]').map((r) => r.dataset.path);
  assert.deepEqual(work, ['gone.md', 'new.py', 'src/b.js', 'src/z.js']);
  const z = fileRow(d, 'src/z.js');
  assert.equal(z.querySelector('.vs-ln').textContent, 'z.js');
  assert.equal(z.querySelector('.vs-ld').textContent, 'src');
  assert.ok(z.querySelector('.vs-deco'));
  assert.match(z.title, /\/r\/a\/src\/z\.js • Değiştirildi/);
  assert.ok(fileRow(d, 'gone.md').querySelector('.vs-res.strike'));
  assert.match(fileRow(d, 'a.txt', 1).title, /Dizine Eklendi/);
  assert.ok(fileRow(d, 'a.txt', 1).querySelector('[data-act="unstage"]'));
  assert.ok(z.querySelector('.vs-fi'));
  // the repos' buttons: commit (changes), publish (no upstream)
  const btns = d.$$('#git .vs-btn .vs-tb');
  assert.deepEqual(btns.map((b) => b.dataset.act), ['commit', 'publish']);
  assert.match(d.$('#git .vs-msg[data-root="/r/a"]').placeholder, /"main" dalına commit/);
  // the status bar: the graph's repo
  assert.match(d.$('#git .vs-sl').textContent, /main\*\+/);
  assert.ok(d.$('#git .vs-sl [data-act="status-sync"]'));
});

test('changes: one repo shows without its row; sync and in-sync buttons', async (t) => {
  const one = (over) => [{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 2, behind: 1, files: [], sessions: [], ...over }];
  const d = boot({ repos: one() });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  assert.equal(d.$$('#git .vs-repo').length, 0);
  assert.equal(d.$('#git .vs-btn .vs-tb').dataset.act, 'sync');
  assert.match(d.$('#git .vs-btn .vs-tb').textContent, /Değişiklikleri Eşitle 1.*2/);
  d.setRepos(one({ ahead: 0, behind: 0 }));
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  const off = d.$('#git .vs-btn .vs-bd');
  assert.ok(off.classList.contains('off'));
  // a disabled commit does nothing
  d.click(off.querySelector('[data-act="commit"]'));
  await d.flush();
  assert.equal(d.gitCalls('commit').length, 0);
  // the picker hides with one repo
  assert.ok(d.$('#git .vs-picker.repo').hidden);
});

test('no repos, and no git at all', async (t) => {
  const d = boot({ repos: [] });
  t.after(d.close);
  G(d).open();
  await d.flush();
  assert.match(d.$('#git .vs-pane.changes .vs-welcome').textContent, /depolar burada görünür/);
  assert.match(d.$('#git .vs-pane.graph').textContent, /Depo yok\./);
  const d2 = boot({ repos: [], noGit: true });
  t.after(d2.close);
  G(d2).open();
  await d2.flush();
  assert.match(d2.$('#git .vs-welcome').textContent, /Git kurulu değil/);
  // a failing bridge reads as no repos
  const d3 = boot({ answers: { repos: () => { throw new Error('x'); } } });
  t.after(d3.close);
  G(d3).open();
  await d3.flush();
  assert.match(d3.$('#git .vs-welcome').textContent, /depolar/);
});

test('stage, unstage, stage all, unstage all, refresh', async (t) => {
  const d = boot({ answers: { unstage: { error: 'locked' } } });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(fileRow(d, 'src/z.js').querySelector('[data-act="stage"]'));
  await d.flush();
  assert.deepEqual(d.gitCalls('stage').at(-1).paths, ['src/z.js']);
  d.click(fileRow(d, 'a.txt', 1).querySelector('[data-act="unstage"]'));
  await d.flush();
  assert.equal(toastText(d), 'locked');
  d.click(d.$('#git .vs-grp[data-group="work"] [data-act="stage-all"]'));
  await d.flush();
  assert.deepEqual(d.gitCalls('stage').at(-1).paths.sort(), ['gone.md', 'new.py', 'src/b.js', 'src/z.js']);
  d.click(d.$('#git .vs-grp[data-group="index"] [data-act="unstage-all"]'));
  await d.flush();
  assert.deepEqual(d.gitCalls('unstage').at(-1).paths, ['a.txt']);
  const before = d.gitCalls('repos').length;
  d.click(d.$('#git .vs-repo [data-act="repo-menu"]')); // menu answers -1: nothing
  await d.flush();
  assert.equal(d.gitCalls('pull').length, 0);
  assert.ok(d.gitCalls('repos').length >= before);
});

test('discard: tracked, untracked, mixed; the question decides', async (t) => {
  let answer = 0;
  const d = boot({ answers: { confirm: (m) => (d.asked.push(m), answer) } });
  d.asked = [];
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(fileRow(d, 'src/z.js').querySelector('[data-act="discard"]'));
  await d.flush();
  assert.match(d.asked[0].message, /'z\.js' dosyasındaki değişiklikleri atmak/);
  assert.deepEqual(d.asked[0].buttons, ['Dosyayı At']);
  assert.deepEqual(d.gitCalls('discard').at(-1).paths, ['src/z.js']);
  d.click(fileRow(d, 'gone.md').querySelector('[data-act="discard"]'));
  await d.flush();
  assert.match(d.asked[1].message, /'gone\.md' dosyasını geri yüklemek/);
  assert.deepEqual(d.asked[1].buttons, ['Dosyayı Geri Yükle']);
  d.click(fileRow(d, 'new.py').querySelector('[data-act="discard"]'));
  await d.flush();
  assert.match(d.asked[2].message, /SİLMEK istediğinizden emin misiniz: 'new\.py'/);
  assert.match(d.asked[2].detail, /Çöp Kutusu/);
  assert.deepEqual(d.asked[2].buttons, ['Çöp Kutusuna Taşı']);
  // mixed: the second button takes them all
  answer = 1;
  d.click(d.$('#git .vs-grp[data-group="work"] [data-act="discard-all"]'));
  await d.flush();
  assert.deepEqual(d.asked[3].buttons, ['İzlenen 3 Dosyanın Tümünü At', '4 Dosyanın Tümünü At']);
  assert.match(d.asked[3].message, /İzlenmeyen şu dosyayı SİLMEK/);
  assert.match(d.asked[3].detail, /GERİ ALINAMAZ/);
  assert.equal(d.gitCalls('discard').at(-1).paths.length, 4);
  answer = 0;
  d.click(d.$('#git .vs-grp[data-group="work"] [data-act="discard-all"]'));
  await d.flush();
  assert.deepEqual(d.gitCalls('discard').at(-1).paths.sort(), ['gone.md', 'src/b.js', 'src/z.js']);
  // cancelled: nothing
  answer = -1;
  const n = d.gitCalls('discard').length;
  d.click(fileRow(d, 'src/z.js').querySelector('[data-act="discard"]'));
  d.click(fileRow(d, 'new.py').querySelector('[data-act="discard"]'));
  d.click(d.$('#git .vs-grp[data-group="work"] [data-act="discard-all"]'));
  await d.flush();
  assert.equal(d.gitCalls('discard').length, n);
  // a non-number answer is a cancel too
  answer = 'x';
  d.click(fileRow(d, 'src/z.js').querySelector('[data-act="discard"]'));
  await d.flush();
  assert.equal(d.gitCalls('discard').length, n);
});

test('discard: several tracked or several untracked files', async (t) => {
  const d = boot({
    repos: [{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 0, behind: 0, sessions: [], files: [{ path: 'x', status: 'M', staged: false }, { path: 'y', status: 'D', staged: false }] }],
    answers: { confirm: (m) => (d.asked.push(m), 0) },
  });
  d.asked = [];
  t.after(d.close);
  G(d).open();
  await d.flush();
  d.click(d.$('#git [data-act="discard-all"]'));
  await d.flush();
  assert.deepEqual(d.asked[0].buttons, ['2 Dosyanın Tümünü At']);
  d.setRepos([{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 0, behind: 0, sessions: [], files: [{ path: 'x', status: 'U', staged: false }, { path: 'y', status: 'U', staged: false }] }]);
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  d.click(d.$('#git [data-act="discard-all"]'));
  await d.flush();
  assert.match(d.asked[1].message, /İzlenmeyen 2 dosyayı SİLMEK/);
  d.setRepos([{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 0, behind: 0, sessions: [], files: [{ path: 'x', status: 'D', staged: false }, { path: 'y', status: 'D', staged: false }, { path: 'z', status: 'U', staged: false }] }]);
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  d.click(d.$('#git [data-act="discard-all"]'));
  await d.flush();
  assert.match(d.asked[2].detail, /2 dosyadaki TÜM değişiklikleri/);
  assert.equal(d.gitCalls('discard').at(-1).paths.length, 2);
  // all deleted: restore wording
  d.setRepos([{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 0, behind: 0, sessions: [], files: [{ path: 'x', status: 'D', staged: false }, { path: 'y', status: 'D', staged: false }] }]);
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  d.click(d.$('#git [data-act="discard-all"]'));
  await d.flush();
  assert.deepEqual(d.asked[3].buttons, ['2 Dosyanın Tümünü Geri Yükle']);
});

test('commit: needs a message; staged ones go; ⌘/Ctrl+Enter; the draft survives a refresh', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(toastText(d), 'Lütfen bir commit mesajı yazın');
  const ta = d.$('#git .vs-msg[data-root="/r/a"]');
  ta.focus();
  d.type(ta, 'fix: things');
  assert.ok(ta.closest('.vs-editor').classList.contains('focus'));
  // a refresh keeps the text and the focus
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  const ta2 = d.$('#git .vs-msg[data-root="/r/a"]');
  assert.equal(ta2.value, 'fix: things');
  assert.equal(d.document.activeElement, ta2);
  d.fire(ta2, 'keydown', { key: 'Enter', ctrlKey: true });
  await d.flush();
  const c = d.gitCalls('commit').at(-1);
  assert.deepEqual({ root: c.root, message: c.message, all: c.all, push: c.push }, { root: '/r/a', message: 'fix: things', all: false, push: false });
  // the draft goes after a commit
  assert.equal(d.$('#git .vs-msg[data-root="/r/a"]').value, '');
  ta2.blur();
});

test('commit: the smart commit question with Always and Never; commit errors', async (t) => {
  let answer = 1;
  const nothingStaged = () => [{ root: '/r/c', name: 'c', path: '/r/c', branch: 'main', ahead: 0, behind: 0, sessions: [], files: [{ path: 'x', status: 'M', staged: false }] }];
  const d = boot({ repos: nothingStaged(), answers: { confirm: () => answer } });
  t.after(d.close);
  G(d).open();
  await d.flush();
  const write = (v) => d.type(d.$('#git .vs-msg'), v);
  write('one');
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(d.window.localStorage.getItem('git.smartCommit'), 'always');
  assert.equal(d.gitCalls('commit').at(-1).all, true);
  // always: no question
  const asked = d.gitCalls('confirm').length;
  write('two');
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(d.gitCalls('confirm').length, asked);
  // never
  d.window.localStorage.removeItem('git.smartCommit');
  answer = 2;
  write('three');
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(d.window.localStorage.getItem('git.smartCommit'), 'never');
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(toastText(d), 'Commit edilecek stage edilmiş değişiklik yok.');
  // cancel the question
  d.window.localStorage.removeItem('git.smartCommit');
  answer = -1;
  const n = d.gitCalls('commit').length;
  d.click(d.$('#git .vs-btn [data-act="commit"]'));
  await d.flush();
  assert.equal(d.gitCalls('commit').length, n);
});

test('commit menu: commit and push, commit and sync; sync and publish buttons', async (t) => {
  let menuAnswer = 1;
  const d = boot({ answers: { menu: () => menuAnswer, commit: (m) => (m.message === 'bad' ? { error: 'hook failed' } : {}), push: { error: 'rejected' } } });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.type(d.$('#git .vs-msg[data-root="/r/a"]'), 'msg');
  d.click(d.$('#git .vs-btn [data-act="commit-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('commit').at(-1).push, true);
  menuAnswer = 2;
  d.type(d.$('#git .vs-msg[data-root="/r/a"]'), 'msg2');
  d.click(d.$('#git .vs-btn [data-act="commit-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('pull').length, 1); // behind: pull first
  assert.equal(toastText(d), 'rejected');
  // a failing commit keeps the draft
  d.type(d.$('#git .vs-msg[data-root="/r/a"]'), 'bad');
  menuAnswer = 0;
  d.click(d.$('#git .vs-btn [data-act="commit-menu"]'));
  await d.flush();
  assert.equal(toastText(d), 'hook failed');
  assert.equal(d.$('#git .vs-msg[data-root="/r/a"]').value, 'bad');
  // the repo row's sync
  d.click(d.$('#git .vs-repo [data-act="sync"]'));
  await d.flush();
  assert.equal(d.gitCalls('pull').length, 2);
  // publish on the second repo
  d.click(d.$('#git .vs-repo[data-root="/r/b"] [data-act="publish"]'));
  await d.flush();
  assert.equal(d.gitCalls('publish').at(-1).root, '/r/b');
  // the repo menu: pull, then commit and push
  menuAnswer = 0;
  d.click(d.$('#git .vs-repo [data-act="repo-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('pull').length, 3);
  menuAnswer = 5;
  d.type(d.$('#git .vs-msg[data-root="/r/a"]'), 'via menu');
  d.click(d.$('#git .vs-repo [data-act="repo-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('commit').at(-1).message, 'via menu');
  assert.equal(d.gitCalls('commit').at(-1).push, true);
});

test('folding: groups by click, repos by their twistie, keys move and fold', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  const grp = () => d.$('#git .vs-grp[data-group="work"]');
  d.click(grp());
  assert.equal(fileRow(d, 'src/z.js'), null);
  assert.ok(grp().querySelector('.vs-tw.shut'));
  d.click(grp());
  assert.ok(fileRow(d, 'src/z.js'));
  d.click(d.$('#git .vs-repo[data-root="/r/b"] .vs-tw'));
  assert.ok(d.$('#git .vs-repo[data-root="/r/b"] .vs-tw.shut'));
  // select a repo row by clicking its body
  d.click(d.$('#git .vs-repo[data-root="/r/a"] .vs-pn'));
  assert.ok(d.$('#git .vs-repo[data-root="/r/a"]').classList.contains('sel'));
  // arrows from the list
  const list = d.$('#git .vs-pane.changes .vs-pb');
  d.fire(list, 'keydown', { key: 'ArrowDown' });
  assert.ok(d.$('#git .vs-grp[data-group="index"]').classList.contains('sel'));
  d.fire(list, 'keydown', { key: 'ArrowLeft' });
  assert.equal(fileRow(d, 'a.txt', 1), null);
  d.fire(list, 'keydown', { key: 'ArrowRight' });
  assert.ok(fileRow(d, 'a.txt', 1));
  d.fire(list, 'keydown', { key: 'ArrowDown' }); // onto a file: it opens
  await d.flush();
  assert.equal(d.ed.opened.at(-1).path, 'a.txt');
  assert.equal(d.ed.opened.at(-1).staged, true);
  d.fire(list, 'keydown', { key: 'ArrowUp' });
  d.fire(list, 'keydown', { key: 'Enter' });
  assert.ok(d.$('#git .vs-grp[data-group="index"] .vs-tw.shut'));
  // keys from elsewhere are ignored
  d.fire(d.$('#git .vs-msg'), 'keydown', { key: 'ArrowDown' });
  // collapse-all (not in the header, but handled)
  d.$('#git .vs-pane.changes .vs-pa').insertAdjacentHTML('beforeend', '<a data-act="collapse-all">x</a>');
  d.click(d.$('#git [data-act="collapse-all"]'));
  assert.equal(d.$$('#git .vs-grp').length, 0);
});

test('graph: lanes, incoming changes, badges, opening a commit and one of its files', async (t) => {
  const d = boot();
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  const rows = d.$$('#git .vs-pane.graph .vs-hi');
  assert.equal(rows.length, 6);
  assert.equal(rows[1].dataset.hash, 'scm-graph-incoming-changes');
  assert.equal(rows[1].querySelector('.vs-ln').textContent, 'Gelen Değişiklikler');
  const head = d.$('#git .vs-hi.cur');
  assert.equal(head.dataset.hash, 'c3aaaaaaa');
  assert.equal(head.querySelector('.vs-ln').textContent, 'third <b>');
  assert.match(head.title, /^Me, 2 sa önce/);
  assert.match(head.title, /c3aaaaa$/);
  assert.equal(head.querySelectorAll('circle').length, 2);
  assert.match(head.querySelector('.vs-lbl').textContent, /main/);
  assert.ok(head.querySelector('.vs-label'));
  const merge = d.$('#git .vs-hi[data-hash="c2aaaaaaa"]');
  assert.equal(merge.querySelectorAll('circle').length, 2);
  assert.match(d.$('#git .vs-hi[data-hash="c1aaaaaaa"]').title, /yıl önce/);
  assert.match(d.$('#git .vs-hi[data-hash="m1aaaaaaa"]').title, /hf önce/);
  assert.equal(d.$('#git [data-act="graph-refs"] span').textContent, 'Otomatik');
  assert.equal(d.$('#git .vs-picker.repo span').textContent, 'a');
  assert.equal(d.gitCalls('log').at(-1).n, 50);
  // the synthetic row doesn't open
  d.click(rows[1]);
  await d.flush();
  assert.equal(d.gitCalls('show').length, 0);
  // open a commit: its files under it
  d.click(head);
  await d.flush();
  const files = d.$$('#git .vs-hc');
  assert.equal(files.length, 2);
  assert.equal(files[0].dataset.path, 'a.txt');
  assert.ok(d.$('#git .vs-hi.cur').classList.contains('open'));
  d.click(files[1]);
  await d.flush();
  const spec = d.ed.opened.at(-1);
  assert.deepEqual({ kind: spec.kind, hash: spec.hash, parent: spec.parent, path: spec.path, status: spec.status }, { kind: 'commit', hash: 'c3aaaaaaa', parent: 'c2aaaaaaa', path: 'src/z.js', status: 'M' });
  assert.equal(d.$('#git .vs-tab .vs-tl').textContent, 'z.js (c2aaaaa) ↔ z.js (c3aaaaa)');
  // close it again; arrows fold it
  const glist = d.$('#git .vs-pane.graph .vs-pb');
  d.click(d.$('#git .vs-hi.cur'));
  assert.equal(d.$$('#git .vs-hc').length, 0);
  d.fire(glist, 'keydown', { key: 'ArrowRight' });
  await d.flush();
  assert.equal(d.$$('#git .vs-hc').length, 2);
  d.fire(glist, 'keydown', { key: 'ArrowLeft' });
  assert.equal(d.$$('#git .vs-hc').length, 0);
  // the current item
  d.click(d.$('#git .vs-hi[data-hash="c1aaaaaaa"]'));
  await d.flush();
  d.click(d.$('#git [data-act="graph-current"]'));
  assert.ok(d.$('#git .vs-hi.cur').classList.contains('sel'));
});

test('graph: all branches with outgoing changes and a base; load more; the repo picker', async (t) => {
  let menuAnswer = 1;
  const many = Array.from({ length: 50 }, (_, i) => ({ hash: `h${i}`, parents: i < 49 ? [`h${i + 1}`] : [], author: 'A', date: iso(1000), subject: `s${i}`, refs: [] }));
  const d = boot({ answers: { menu: () => menuAnswer } });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(d.$('#git [data-act="graph-refs"]'));
  await d.flush();
  assert.equal(d.gitCalls('log').at(-1).all, true);
  assert.equal(d.$('#git [data-act="graph-refs"] span').textContent, 'Tümü');
  const out = d.$('#git .vs-hi[data-hash="scm-graph-outgoing-changes"]');
  assert.ok(out);
  assert.equal(out.querySelector('.vs-ln').textContent, 'Giden Değişiklikler');
  assert.ok(out.querySelector('circle[style*="dasharray"]'));
  assert.match(d.$('#git .vs-hi[data-hash="m1aaaaaaa"] .vs-lbl').textContent, /feature/);
  // the repo picker: to b (no commits)
  menuAnswer = 1;
  d.click(d.$('#git [data-act="graph-repo"]'));
  await d.flush();
  assert.equal(d.gitCalls('log').at(-1).root, '/r/b');
  // more: 50 rows ask for 100
  const d2 = boot({ answers: { log: (m) => ({ commits: many.slice(0, m.n), branch: '', head: null }) } });
  t.after(d2.close);
  await d2.flush();
  G(d2).open();
  await d2.flush();
  const more = d2.$('#git .vs-more');
  assert.ok(more);
  d2.click(more);
  await d2.flush();
  assert.equal(d2.gitCalls('log').at(-1).n, 100);
  // graph header actions: fetch, pull, push, refresh, the ··· menu
  for (const a of ['graph-fetch', 'graph-pull', 'graph-push', 'graph-refresh']) {
    d2.click(d2.$(`#git [data-act="${a}"]`));
    await d2.flush();
  }
  assert.equal(d2.gitCalls('fetch').length, 1);
  assert.equal(d2.gitCalls('push').length, 1);
});

test('graph menu, views menu and changes menu', async (t) => {
  let menuAnswer = 0;
  const d = boot({ answers: { menu: () => menuAnswer, fetch: { error: 'no network' } } });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(d.$('#git [data-act="graph-menu"]'));
  await d.flush();
  assert.equal(toastText(d), 'no network');
  menuAnswer = 4;
  const logs = d.gitCalls('log').length;
  d.click(d.$('#git [data-act="graph-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('log').length, logs + 1);
  // views menu: fold the changes pane
  menuAnswer = 0;
  d.click(d.$('#git .vs-title [data-act="views-menu"]'));
  await d.flush();
  assert.ok(d.$('#git .vs-pane.changes').classList.contains('shut'));
  assert.equal(d.window.localStorage.getItem('git.shut.changes'), '1');
  // the header click unfolds it
  d.click(d.$('#git .vs-pane.changes .vs-ph h3'));
  assert.ok(!d.$('#git .vs-pane.changes').classList.contains('shut'));
  // changes ··· : the focused repo's menu (pull)
  d.click(d.$('#git [data-act="changes-menu"]'));
  await d.flush();
  assert.equal(d.gitCalls('pull').length, 1);
  // commit-focused without a message
  d.click(d.$('#git [data-act="commit-focused"]'));
  await d.flush();
  assert.equal(toastText(d), 'Lütfen bir commit mesajı yazın');
});

test('the editor tab: titles, toolbar toggles, close, the status bar facts', async (t) => {
  let menuAnswer = 0;
  const d = boot({ answers: { menu: () => menuAnswer } });
  t.after(d.close);
  await d.flush();
  G(d).open();
  await d.flush();
  d.click(fileRow(d, 'src/z.js').querySelector('.vs-ln'));
  await d.flush();
  assert.ok(fileRow(d, 'src/z.js').classList.contains('sel'));
  const spec = d.ed.opened.at(-1);
  assert.deepEqual({ kind: spec.kind, root: spec.root, path: spec.path, staged: spec.staged }, { kind: 'change', root: '/r/a', path: 'src/z.js', staged: false });
  assert.equal(d.$('#git .vs-tab .vs-tl').textContent, 'z.js (Çalışma Ağacı)');
  assert.equal(d.$('#git .vs-tab .vs-tdeco').textContent, 'M');
  assert.equal(d.$$('#git .vs-crumbs .vs-bi').length, 3);
  const sr = d.$('#git .vs-sr').textContent;
  assert.match(sr, /Me, 2 days ago/);
  assert.match(sr, /Satır 3, Sütun 4/);
  assert.match(sr, /Spaces: 2/);
  assert.match(sr, /LF/);
  assert.match(sr, /JavaScript/);
  // toolbar
  d.click(d.$('#git [data-act="toggle-inline"]'));
  assert.ok(d.$('#git [data-act="toggle-inline"]').classList.contains('on'));
  d.click(d.$('#git [data-act="toggle-whitespace"]'));
  assert.ok(d.$('#git [data-act="toggle-whitespace"]').classList.contains('on'));
  d.click(d.$('#git [data-act="next-change"]'));
  d.click(d.$('#git [data-act="prev-change"]'));
  assert.deepEqual(d.ed.revealed, [1, -1]);
  // the ··· menu's first item toggles inline back
  d.click(d.$('#git [data-act="editor-menu"]'));
  await d.flush();
  assert.deepEqual(d.ed.toggled, ['inline', 'whitespace', 'inline']);
  // open the file in VS Code: a vscode:// link
  let href = null;
  d.window.HTMLAnchorElement.prototype.click = function () { href = this.href; };
  d.click(d.$('#git [data-act="open-file"]'));
  assert.equal(href, 'vscode://file/r/a/src/z.js');
  menuAnswer = 4;
  d.click(d.$('#git [data-act="editor-menu"]'));
  await d.flush();
  d.click(fileRow(d, 'src/b.js').querySelector('[data-act="open"]'));
  assert.equal(href, 'vscode://file/r/a/src/b.js');
  // the file's change count changed: the editor reloads on refresh
  const n = d.ed.opened.length;
  const next = repos();
  next[0].files[0].add = 99;
  d.setRepos(next);
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  assert.equal(d.ed.opened.length, n + 1);
  // close
  d.click(d.$('#git [data-act="close-editor"]'));
  await d.flush();
  assert.equal(d.$('#git .vs-ed').innerHTML, '');
  assert.equal(d.ed.closed, 1);
  // staged and deleted titles
  d.click(fileRow(d, 'a.txt', 1));
  await d.flush();
  assert.equal(d.$('#git .vs-tab .vs-tl').textContent, 'a.txt (Dizin)');
  d.click(fileRow(d, 'gone.md'));
  await d.flush();
  assert.equal(d.$('#git .vs-tab .vs-tl').textContent, 'gone.md (Silindi)');
  d.click(fileRow(d, 'new.py'));
  await d.flush();
  assert.equal(d.$('#git .vs-tab .vs-tl').textContent, 'new.py (İzlenmiyor)');
  // the status bar's sync
  d.click(d.$('#git .vs-sl [data-act="status-sync"]'));
  await d.flush();
  assert.ok(d.gitCalls('push').length >= 1);
});

test('the editor with a note shows no file facts; status bar publish', async (t) => {
  const d = boot({ editorNote: true, repos: [repos()[1]] });
  t.after(d.close);
  G(d).open();
  await d.flush();
  assert.ok(d.$('#git .vs-sl [data-act="status-publish"]'));
  d.click(d.$('#git .vs-sl [data-act="status-publish"]'));
  await d.flush();
  assert.equal(d.gitCalls('publish').length, 1);
  assert.doesNotMatch(d.$('#git .vs-sr').textContent, /Satır/);
});

test('switching views: keys, the activity bar, Cloud views and feedback', async (t) => {
  const views = [];
  const d = boot({ globals: { Cloud: { showView: (v) => views.push(v), openFeedback: () => views.push('fb') } } });
  t.after(d.close);
  await d.flush();
  d.key('G', { ctrlKey: true, shiftKey: true, code: 'KeyG' });
  assert.ok(d.$('#app').classList.contains('git-mode'));
  d.tick(20);
  assert.ok(d.ed.measured >= 0);
  d.key('Escape');
  assert.ok(!d.$('#app').classList.contains('git-mode'));
  d.click(d.$('#activity [data-view=friends]'));
  assert.ok(d.$('#activity [data-view=friends]').classList.contains('on'));
  d.click(d.$('#activity [data-view=feedback]'));
  d.click(d.$('#activity [data-view=dash]'));
  d.window.__radar.openView('board');
  assert.deepEqual(views, [null, 'friends', 'fb', null, 'board']);
  // typing in a field: Escape doesn't leave
  G(d).open();
  d.document.body.insertAdjacentHTML('beforeend', '<input id="i">');
  d.key('Escape', {}, d.$('#i'));
  assert.ok(d.$('#app').classList.contains('git-mode'));
  G(d).close();
  // the 4 s refresh only while open and shown
  const n = d.gitCalls('repos').length;
  G(d).open();
  await d.flush();
  d.tick(4000);
  await d.flush();
  assert.ok(d.gitCalls('repos').length > n);
});

test('session cards: a chip with their repo changes opens Source Control there', async (t) => {
  const d = boot();
  t.after(d.close);
  const s = { id: 's1', name: 'alpha', title: 't', cwd: '/r/a', status: 'busy', statusSince: Date.now(), lastTs: Date.now(), ctx: 0, ctxMax: 0, tools: 0, web: 0, errors: 0, cost: 0, spark: [0], agents: [], flags: [], pending: [] };
  const st = { sessions: [s], totals: { live: 1, runningAgents: 0, sessionsToday: 1, agentsToday: 0, toolsPerMin: 0, tokPerMin: 0, cost: 0, costPerHour: 0, cacheHit: 0, saved: 0, web: 0, okRate: 1, errors: 0, tools: 0, tok: { out: 0, cr: 0, cw: 0 }, agentShare: 0, avgTurn: 0 }, byCat: {}, toolSpark: [0], costSpark: [0], byModel: [], ticker: [] };
  d.window.__radar.init({ state: st, log: [] });
  d.tick(15_000);
  await d.flush();
  const chip = d.$('#sessions .card .gchip');
  assert.ok(chip);
  assert.equal(chip.querySelector('b').textContent, '1 dosya');
  assert.equal(chip.querySelector('.g-add').textContent, '+3');
  assert.equal(chip.querySelector('.g-del').textContent, '−1');
  assert.equal(chip.title, "a: Kaynak Denetimi'nde aç");
  d.click(chip);
  assert.ok(d.$('#app').classList.contains('git-mode'));
  assert.equal(d.sent('open').length, 0); // the card's own click didn't fire
  await d.flush();
  // the repo clean: the chip goes
  const clean = repos();
  clean[0].files = [];
  d.setRepos(clean);
  d.click(d.$('#git [data-act="refresh-all"]'));
  await d.flush();
  assert.equal(d.$('#sessions .card .gchip'), null);
});

test('sashes: dragging resizes the side bar and the graph, and they are kept', async (t) => {
  const d = boot({ storage: { 'git.sideWidth': '320', 'git.graphHeight': '200', 'git.shut.graph': '1' } });
  t.after(d.close);
  assert.equal(d.$('#git').style.getPropertyValue('--sw'), '320px');
  assert.equal(d.$('#git .vs-pane.graph').style.getPropertyValue('--gh'), '200px');
  assert.ok(d.$('#git .vs-pane.graph').classList.contains('shut'));
  const v = d.$('#git .vs-sash-v');
  d.fire(v, 'mousedown');
  assert.ok(v.classList.contains('on'));
  d.window.dispatchEvent(new d.window.MouseEvent('mousemove', { clientX: 250 }));
  d.window.dispatchEvent(new d.window.MouseEvent('mouseup'));
  assert.ok(!v.classList.contains('on'));
  assert.equal(d.window.localStorage.getItem('git.sideWidth'), String(parseInt(d.$('#git').style.getPropertyValue('--sw'), 10)));
  const h = d.$('#git .vs-sash-h');
  d.fire(h, 'mousedown');
  d.window.dispatchEvent(new d.window.MouseEvent('mousemove', { clientY: 100 }));
  d.window.dispatchEvent(new d.window.MouseEvent('mouseup'));
  assert.equal(d.window.localStorage.getItem('git.graphHeight'), String(parseInt(d.$('#git .vs-pane.graph').style.getPropertyValue('--gh'), 10)));
  // the toolbars fit on resize
  for (const o of d.observers) o.cb([]);
});
