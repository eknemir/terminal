'use strict';
// Pure helpers of windows/src/engine.js: pricing, token windows, text clipping/redaction, paths, tool summaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, tmpDir, write } = require('./_load');

const HOME_DIR = 'C:\\Users\\TestUser';
const T = loadEngine({ home: HOME_DIR }).__t;
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('priceFor: prefix match, most specific first, rejects non-strings', () => {
  assert.equal(T.priceFor('claude-opus-5-5-20261001').in, 4);
  assert.equal(T.priceFor('claude-opus-5-20260101').in, 5);
  assert.equal(T.priceFor('claude-fable-5-1').cr, 0.25);
  assert.equal(T.priceFor('claude-fable-5').cr, 1);
  assert.equal(T.priceFor('claude-haiku-4-5-20251001').ctx, 2e5);
  assert.equal(T.priceFor('gpt-5'), null);
  assert.equal(T.priceFor(''), null);
  assert.equal(T.priceFor(undefined), null);
  assert.equal(T.priceFor(42), null);
});

test('tokenCount: units, shorthand and rejects', () => {
  assert.equal(T.tokenCount('500k'), 500_000);
  assert.equal(T.tokenCount('1M'), 1_000_000);
  assert.equal(T.tokenCount(' 300K '), 300_000);
  assert.equal(T.tokenCount('200000'), 200_000);
  assert.equal(T.tokenCount('200'), 200_000); // shorthand for 200k
  assert.equal(T.tokenCount('0.5m'), 500_000);
  assert.equal(T.tokenCount('10000'), 10_000); // boundary: not shorthand
  assert.equal(T.tokenCount('9999'), 9_999_000);
  for (const bad of ['auto', '', 'k', 'm', '-5', '0', 'abc', '1e']) assert.equal(T.tokenCount(bad), null, bad);
});

test('tokenCount quirk: the "x1000 shorthand" also applies after a unit ("5k" -> 5M) [reported bug]', () => {
  // "5k" is 5,000 tokens, under 10,000, so it is multiplied again. Documents current behaviour.
  assert.equal(T.tokenCount('5k'), 5_000_000);
});

test('compactSetting: numbers, strings, invalid files, 5 s cache', () => {
  const { dir, cleanup } = tmpDir();
  try {
    const f = (name, obj) => write(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
    assert.equal(T.compactSetting(f('a.json', { autoCompactWindow: 300 })), 300_000);
    assert.equal(T.compactSetting(f('b.json', { autoCompactWindow: 250_000 })), 250_000);
    assert.equal(T.compactSetting(f('c.json', { autoCompactWindow: '400k' })), 400_000);
    assert.equal(T.compactSetting(f('d.json', { autoCompactWindow: 'auto' })), null);
    assert.equal(T.compactSetting(f('e.json', { other: 1 })), null);
    assert.equal(T.compactSetting(f('f.json', '{not json')), null);
    assert.equal(T.compactSetting(path.join(dir, 'missing.json')), null);
    assert.equal(T.compactSetting(f('g.json', 'null')), null);
    // Cached for 5 s: a change right after is not seen.
    const g = f('h.json', { autoCompactWindow: 100 });
    assert.equal(T.compactSetting(g), 100_000);
    fs.writeFileSync(g, JSON.stringify({ autoCompactWindow: 900 }));
    assert.equal(T.compactSetting(g), 100_000);
    // Numeric 0 / negative values are not rejected as the string path does [reported bug].
    assert.equal(T.compactSetting(f('z.json', { autoCompactWindow: 0 })), 0);
    assert.equal(T.compactSetting(f('n.json', { autoCompactWindow: -5 })), -5000);
  } finally {
    cleanup();
  }
});

test('contextLimit / autoCompactWindow: env, project local, project, user settings', () => {
  const { dir, cleanup } = tmpDir();
  const saved = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  try {
    delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    const user = path.join(dir, 'user-settings.json');
    assert.equal(T.contextLimit('claude-opus-4-1', null, user), 1e6);
    assert.equal(T.contextLimit('unknown-model', null, user), 0);
    assert.equal(T.contextLimit('claude-haiku-5-5', null, user), 0); // ctx 0: no settings read
    assert.equal(T.autoCompactWindow(null, user), null);

    const p1 = path.join(dir, 'p1');
    write(path.join(p1, '.claude', 'settings.local.json'), JSON.stringify({ autoCompactWindow: '150k' }));
    write(path.join(p1, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: '250k' }));
    assert.equal(T.contextLimit('claude-opus-4-1', p1, user), 150_000);
    const p2 = path.join(dir, 'p2');
    write(path.join(p2, '.claude', 'settings.json'), JSON.stringify({ autoCompactWindow: '250k' }));
    assert.equal(T.contextLimit('claude-haiku-4-5', p2, user), 2e5); // min(window, setting)
    const user2 = write(path.join(dir, 'u2.json'), JSON.stringify({ autoCompactWindow: '600k' }));
    assert.equal(T.autoCompactWindow(path.join(dir, 'p3'), user2), 600_000);
    assert.equal(T.autoCompactWindow(null, user2), 600_000);

    process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '120k';
    assert.equal(T.contextLimit('claude-opus-4-1', p1, user), 120_000);
    process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = 'auto'; // ignored: falls through to the files
    assert.equal(T.contextLimit('claude-opus-4-1', p1, user), 150_000);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    else process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = saved;
    cleanup();
  }
});

test('costOf: list prices, cache writes 5m/1h, long-context tier, fast mode, unknown model', () => {
  const u = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 300 };
  close(T.costOf('claude-opus-4-1', u), 0.014375);
  close(T.costOf('claude-opus-4-1', { ...u, speed: 'fast' }), 0.02875);
  close(T.costOf('claude-haiku-4-5', { input_tokens: 2000, output_tokens: 100, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_1h_input_tokens: 400 } }), 0.00405);
  // 1h writes larger than all writes: 5m part clamps to 0.
  close(T.costOf('claude-haiku-4-5', { cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 400 } }), 400 * 2 / 1e6);
  // haiku-5-5: past 100k prompt tokens the long rates apply; at exactly 100k the base rates.
  close(T.costOf('claude-haiku-5-5', { input_tokens: 50_000, output_tokens: 1000, cache_read_input_tokens: 60_000 }), 0.0305);
  close(T.costOf('claude-haiku-5-5', { input_tokens: 100_000 }), 0.01);
  assert.equal(T.costOf('mystery', u), 0);
  assert.equal(T.costOf('claude-opus-4', { input_tokens: 'x', output_tokens: NaN, cache_read_input_tokens: Infinity }), 0);
  close(T.costOf('claude-opus-4', { input_tokens: 10.9 }), 50 / 1e6); // truncated
});

test('savedOf', () => {
  close(T.savedOf('claude-opus-4-1', { cache_read_input_tokens: 5000 }), 0.0225);
  assert.equal(T.savedOf('nope', { cache_read_input_tokens: 5000 }), 0);
  assert.equal(T.savedOf('claude-opus-4', {}), 0);
});

test('shortModel', () => {
  assert.equal(T.shortModel('claude-opus-4-1-20250805'), 'opus 4.1');
  assert.equal(T.shortModel('claude-sonnet-4-20250514'), 'sonnet 4');
  assert.equal(T.shortModel('claude-haiku-4-5'), 'haiku 4.5');
  assert.equal(T.shortModel('gpt-5'), 'gpt 5');
  assert.equal(T.shortModel('claude-opus-4-1-beta'), 'opus-4-1-beta');
  assert.equal(T.shortModel(''), '');
  assert.equal(T.shortModel(null), '');
});

test('catOf', () => {
  assert.equal(T.catOf('WebFetch'), 'web');
  assert.equal(T.catOf('PowerShell'), 'bash');
  assert.equal(T.catOf('Task'), 'agent');
  assert.equal(T.catOf('mcp__claude-in-chrome__navigate'), 'browser');
  assert.equal(T.catOf('mcp__computer-use__screenshot'), 'browser');
  assert.equal(T.catOf('computer'), 'browser');
  assert.equal(T.catOf('mcp__linear__list'), 'mcp');
  assert.equal(T.catOf('TodoWrite'), 'plan');
  assert.equal(T.catOf('toString'), 'plan'); // own-property check, not prototype
});

test('value helpers', () => {
  assert.equal(T.isObj({}), true);
  assert.equal(T.isObj([]), false);
  assert.equal(T.isObj(null), false);
  assert.equal(T.int(3.9), 3);
  assert.equal(T.int(-3.9), -3);
  assert.equal(T.int('3'), 0);
  assert.equal(T.int(NaN), 0);
  assert.equal(T.str('a'), 'a');
  assert.equal(T.str(1), undefined);
});

test('clip: folds whitespace, ellipsis, counts code points', () => {
  assert.equal(T.clip('  a \n\t b  ', 10), 'a b');
  assert.equal(T.clip('abcdef', 6), 'abcdef');
  assert.equal(T.clip('abcdef', 4), 'abc…');
  assert.equal(T.clip('😀😀😀', 2), '😀…');
  assert.equal(T.clip('😀', 1), '😀'); // 2 UTF-16 units but 1 code point: kept whole
  assert.equal(T.clip(null, 5), '');
  assert.equal(T.clip('', 5), '');
  assert.equal(T.clip(12345, 3), '12…');
});

test('redact: known token shapes, key=value, long mixed tokens', () => {
  const R = '‹•••›';
  assert.equal(T.redact('key sk-ant-abcdefghij12 end'), `key ${R} end`);
  assert.equal(T.redact('sk-abcdefghijklmnopqrstu'), R);
  assert.equal(T.redact('ghp_' + 'a'.repeat(24)), R);
  assert.equal(T.redact('github_pat_' + 'A'.repeat(22)), R);
  assert.equal(T.redact('lin_api_' + 'b'.repeat(20)), R);
  assert.equal(T.redact('xoxb-1234567890-abc'), R);
  assert.equal(T.redact('AKIAABCDEFGHIJKLMNOP'), R);
  assert.equal(T.redact('eyJhbGciOiJI.eyJzdWIiOiIx.abcdEFGH'), R);
  assert.equal(T.redact('deadbeef'.repeat(4)), R);
  assert.equal(T.redact('password=hunter22'), `password=${R}`);
  assert.equal(T.redact('"api_key": "abcdef123"'), `"api_key": "${R}"`);
  assert.equal(T.redact('Bearer abcdef123456'), `Bearer ${R}`);
  assert.equal(T.redact('token=$GITHUB_TOKEN'), 'token=$GITHUB_TOKEN'); // a variable, not a secret
  assert.equal(T.redact('password=abc'), 'password=abc'); // too short
  assert.equal(T.redact('AbCdEfGh12345678AbCdEfGh12345678'), R);
  assert.equal(T.redact('z'.repeat(40)), 'z'.repeat(40));
  assert.equal(T.redact(''), '');
  assert.equal(T.redact(null), '');
  assert.equal(T.redact('plain text'), 'plain text');
});

test('URLs: parseURL, urlPath, hostPath, hostOf', () => {
  assert.equal(T.parseURL('nope'), null);
  assert.equal(T.parseURL(5), null);
  assert.equal(T.urlPath(new URL('https://x.com/a%20b/')), '/a b');
  assert.equal(T.urlPath(new URL('https://x.com/')), '/');
  assert.equal(T.urlPath(new URL('https://x.com/bad%E0%A4%A')), '/bad%E0%A4%A');
  assert.equal(T.hostPath('https://www.example.com/a/b/'), 'example.com/a/b');
  assert.equal(T.hostPath('https://example.com/'), 'example.com');
  assert.equal(T.hostPath('https://example.com'), 'example.com');
  assert.equal(T.hostPath('not a url'), 'not a url');
  assert.equal(T.hostPath('mailto:a@b.c'), 'mailto:a@b.c'); // no hostname
  assert.equal(T.hostPath(undefined), '');
  assert.equal(T.hostPath('https://example.com/' + 'x'.repeat(100)).length, 70);
  assert.equal(T.hostOf('https://www.a.org/x'), 'a.org');
  assert.equal(T.hostOf('junk'), '');
});

test('paths: shortPath, baseName, tildify, cwdLabel (Windows separators)', { skip: !T.WIN && 'Windows path rules' }, () => {
  assert.equal(T.shortPath('C:\\a\\b\\c.js'), 'b\\c.js');
  assert.equal(T.shortPath('C:/a/b/c.js'), 'b/c.js');
  assert.equal(T.shortPath('c.js'), 'c.js');
  assert.equal(T.shortPath(''), '');
  assert.equal(T.shortPath(null), '');
  assert.equal(T.baseName('C:\\a\\b'), 'b');
  assert.equal(T.baseName('C:\\a\\b\\'), 'b');
  assert.equal(T.baseName('\\\\'), '\\');
  assert.equal(T.baseName(''), '');
  assert.equal(T.HOME, HOME_DIR);
  assert.equal(T.tildify(HOME_DIR + '\\code\\x'), '~\\code\\x');
  assert.equal(T.tildify('c:\\users\\testuser\\y'), '~\\y'); // case-insensitive on Windows
  assert.equal(T.tildify('D:\\other'), 'D:\\other');
  assert.equal(T.tildify(null), '');
  assert.equal(T.cwdLabel('C:\\a\\b\\c\\d\\e'), 'C:\\a\\…\\d\\e');
  assert.equal(T.cwdLabel('C:\\a\\b\\c'), 'C:\\a\\b\\c');
  assert.equal(T.cwdLabel(HOME_DIR + '\\p\\q\\r\\s'), '~\\p\\…\\r\\s');
  assert.equal(T.cwdLabel(''), '');
});

test('fmtBytes and trimWs', () => {
  assert.equal(T.fmtBytes(0), '0B');
  assert.equal(T.fmtBytes(1023), '1023B');
  assert.equal(T.fmtBytes(1024), '1KB');
  assert.equal(T.fmtBytes(1536), '1KB');
  assert.equal(T.fmtBytes(1 << 20), '1.0MB');
  assert.equal(T.fmtBytes(1.5 * (1 << 20)), '1.5MB');
  assert.equal(T.trimWs('\t  /compact \u00a0'), '/compact');
  assert.equal(T.trimWs(' a\n'), 'a\n'); // newlines are not trimmed
});

test('summarize: every named tool', () => {
  assert.deepEqual(T.summarize('WebSearch', { query: 'q password=hunter22' }), { label: 'q password=‹•••›' });
  assert.deepEqual(T.summarize('WebFetch', { url: 'https://www.x.io/docs/' }), { label: 'x.io/docs' });
  assert.deepEqual(T.summarize('Read', { file_path: 'C:\\r\\a\\b.js' }), { label: 'a\\b.js', file: 'C:\\r\\a\\b.js' });
  assert.deepEqual(T.summarize('Write', {}), { label: '', file: undefined });
  assert.deepEqual(T.summarize('NotebookEdit', { notebook_path: 'C:\\n\\x.ipynb' }), { label: 'n\\x.ipynb', file: 'C:\\n\\x.ipynb' });
  assert.equal(T.summarize('Grep', { pattern: 'TODO', path: 'C:\\w\\d\\src' }).label, '/TODO/ d\\src');
  assert.equal(T.summarize('Grep', { glob: '*.js' }).label, '// *.js');
  assert.equal(T.summarize('Grep', {}).label, '//'); // clip folds the trailing space
  assert.equal(T.summarize('Glob', { pattern: '**/*.ts' }).label, '**/*.ts');
  assert.deepEqual(T.summarize('Bash', { command: 'npm test', description: 'Run tests' }), { label: 'Run tests', cmd: 'npm test' });
  assert.deepEqual(T.summarize('PowerShell', { command: 'ls' }), { label: 'ls', cmd: 'ls' });
  assert.equal(T.summarize('Agent', { description: 'Explore repo' }).label, 'Explore repo');
  assert.equal(T.summarize('Task', { subagent_type: 'Plan' }).label, 'Plan');
  assert.equal(T.summarize('Task', {}).label, 'ajan');
  assert.equal(T.summarize('Skill', { skill: 'pdf' }).label, 'pdf');
  assert.equal(T.summarize('ToolSearch', { query: 'slack' }).label, 'slack');
  assert.equal(T.summarize('TodoWrite', { todos: [1, 2, 3] }).label, '3 görev');
  assert.equal(T.summarize('TodoWrite', {}).label, '0 görev');
  assert.equal(T.summarize('Workflow', { name: 'deploy' }).label, 'deploy');
  assert.equal(T.summarize('Workflow', { scriptPath: 'C:\\w\\flow.js' }).label, 'flow.js');
  assert.equal(T.summarize('Workflow', {}).label, 'iş akışı');
  assert.equal(T.summarize('SendMessage', { to: 'bob' }).label, '→ bob');
  assert.equal(T.summarize('SendMessage', {}).label, '→');
  assert.equal(T.summarize('AskUserQuestion', { questions: [{ question: 'Which one?' }] }).label, 'Which one?');
  assert.equal(T.summarize('AskUserQuestion', { questions: ['x'] }).label, '');
  assert.equal(T.summarize('mcp__claude_ai_Linear__list_issues', { query: 'bug' }).label, 'Linear.list_issues bug');
  assert.equal(T.summarize('mcp__chrome__nav', { url: 'https://a.com/b' }).label, 'chrome.nav a.com/b');
  assert.equal(T.summarize('mcp__cu__batch', { actions: [1, 2] }).label, 'cu.batch ×2');
  assert.equal(T.summarize('mcp__cu__computer', { action: 'click' }).label, 'cu.computer click');
  assert.equal(T.summarize('mcp__srv__a__b', {}).label, 'srv.a__b');
  assert.equal(T.summarize('mcp__', null).label, '.');
  assert.deepEqual(T.summarize('Unknown', { x: 1 }), { label: '' });
  assert.deepEqual(T.summarize('Read', 'not an object'), { label: '', file: undefined });
});

test('resultMeta', () => {
  assert.deepEqual(T.resultMeta(null), { meta: '', hosts: [], agentId: null });
  assert.equal(T.resultMeta({ url: 'u', code: 200, bytes: 2048 }).meta, '200 · 2KB');
  assert.equal(T.resultMeta({ url: 'u', code: 404 }).meta, '404');
  const s = T.resultMeta({ query: 'q', results: [{ content: [{ url: 'https://www.a.com/1' }, { url: 'https://a.com/2' }, { url: 'https://b.com' }, 'x'] }, 'text', { content: [{ url: 'https://c.com' }, { url: 'https://d.com' }, { url: 'https://e.com' }] }] });
  assert.deepEqual(s.hosts, ['a.com', 'b.com', 'c.com', 'd.com']); // at most 4, deduplicated
  assert.equal(s.meta, '6 sonuç');
  assert.deepEqual(T.resultMeta({ agentId: 'ag1', status: 'completed' }), { meta: 'completed', hosts: [], agentId: 'ag1' });
  assert.equal(T.resultMeta({ agentId: 'ag1' }).meta, '');
  assert.equal(T.resultMeta({ interrupted: true }).meta, 'kesildi');
  assert.equal(T.resultMeta({ other: 1 }).meta, '');
});

test('codexCall: patches, exec_command, shell array, fallbacks', () => {
  assert.deepEqual(T.codexCall('apply_patch', {}, 5), { n: 'Edit', c: 'edit', l: 'yama uygula', t: 5 });
  assert.equal(T.codexCall('exec_command', { arguments: '{"cmd":"ls \\"x\\""}' }, 1).l, 'ls "x"');
  assert.equal(T.codexCall('exec_command', { input: 'tools.exec_command({"cmd":"pwd"})', arguments: '{"cmd":"no"}' }, 1).l, 'pwd');
  assert.equal(T.codexCall('exec_command', { arguments: '{"cmd":"bad \\q"}' }, 1).l, 'bad \\q'); // invalid escape: raw
  assert.equal(T.codexCall('shell', { arguments: '{"command":["bash","-lc","cat a"]}' }, 1).l, 'cat a');
  assert.equal(T.codexCall('shell', { arguments: '{"command":[]}' }, 1).l, 'shell');
  assert.equal(T.codexCall('shell', { arguments: 'not json' }, 1).l, 'shell');
  assert.equal(T.codexCall('custom_tool', {}, 1).l, 'custom_tool');
  assert.equal(T.codexCall('x', { arguments: 'null' }, 1).l, 'x'); // JSON null: caught
});

test('parseISO and dayStart', () => {
  assert.equal(T.parseISO('2026-10-24T19:41:07.123Z'), Date.UTC(2026, 9, 24, 19, 41, 7) + 123);
  assert.equal(T.parseISO('2026-10-24T19:41:07Z'), Date.UTC(2026, 9, 24, 19, 41, 7));
  assert.equal(T.parseISO('2026-10-24T19:41:07.5Z'), Date.UTC(2026, 9, 24, 19, 41, 7) + 500);
  assert.equal(T.parseISO('2026-10-24T19:41:07+03:00'), Date.UTC(2026, 9, 24, 19, 41, 7)); // offset ignored (as the Mac)
  assert.equal(T.parseISO('2026-10-24'), 0);
  assert.equal(T.parseISO('xxxx-xx-xxTxx:xx:xxZ'), 0);
  assert.equal(T.parseISO(123), 0);
  assert.equal(T.parseISO(undefined), 0);
  const d = new Date(T.dayStart());
  assert.equal(d.getHours() + d.getMinutes() + d.getSeconds() + d.getMilliseconds(), 0);
  assert.ok(Date.now() - T.dayStart() < 86_400_000 + 3_600_000);
});

test('fullText, toolDetail, outputPreview', () => {
  assert.equal(T.fullText('  a\r\nb  ', 10), 'a\nb');
  assert.equal(T.fullText('abcdef', 4), 'abc…');
  assert.equal(T.fullText(null, 4), '');
  assert.equal(T.fullText('password=supersecret', 100), 'password=‹•••›');

  assert.equal(T.toolDetail('Bash', { command: 'echo hi' }), 'echo hi');
  assert.equal(T.toolDetail('WebSearch', { query: 'q' }), 'q');
  assert.equal(T.toolDetail('WebFetch', { url: 'https://a.com/x' }), 'a.com/x');
  assert.equal(T.toolDetail('Read', { file_path: HOME_DIR + '\\f.txt' }), '~\\f.txt');
  assert.equal(T.toolDetail('Edit', {}), '');
  assert.equal(T.toolDetail('NotebookEdit', { notebook_path: 'D:\\n.ipynb' }), 'D:\\n.ipynb');
  assert.equal(T.toolDetail('NotebookEdit', {}), '');
  assert.equal(T.toolDetail('Grep', { pattern: 'x', path: HOME_DIR + '\\p' }), 'x  in ~\\p');
  assert.equal(T.toolDetail('Grep', {}), '');
  assert.equal(T.toolDetail('Glob', { pattern: '*.md' }), '*.md');
  assert.equal(T.toolDetail('Task', { prompt: 'do it' }), 'do it');
  assert.equal(T.toolDetail('Agent', { description: 'd', prompt: 'p' }), 'd');
  assert.equal(T.toolDetail('TodoWrite', { todos: [{ status: 'completed', content: 'a' }, { status: 'pending', content: 'b' }, 'x'] }), '☒ a\n☐ b');
  assert.equal(T.toolDetail('TodoWrite', {}), '');
  assert.equal(T.toolDetail('Other', {}), '');
  assert.equal(T.toolDetail('Bash', null), '');

  assert.equal(T.outputPreview({}, { stdout: 'a\n\n b \nc\nd' }), 'a\n b\nc');
  assert.equal(T.outputPreview({}, { stdout: '', stderr: 'err' }), 'err');
  assert.equal(T.outputPreview({ content: 'fallback' }, { stdout: '', stderr: '' }), 'fallback');
  assert.equal(T.outputPreview({}, { file: { numLines: 7 } }), '7 lines');
  assert.equal(T.outputPreview({ content: 'c' }, { file: { numLines: 0 } }), 'c');
  assert.equal(T.outputPreview({}, { type: 'create' }), 'created');
  assert.equal(T.outputPreview({}, { structuredPatch: [] }), 'updated');
  assert.equal(T.outputPreview({ content: [{ type: 'text', text: 'x' }, { type: 'image' }, 'y', { type: 'text', text: 'z' }] }, null), 'x\nz');
  assert.equal(T.outputPreview({ content: 5 }, undefined), '');
});

test('skipped, withoutImages, parseLine', () => {
  const b = (s) => Buffer.from(s);
  const prog = b('{"type":"progress","x":1}');
  assert.equal(T.skipped(prog, 0, prog.length), true);
  const user = b('{"type":"user","x":1}');
  assert.equal(T.skipped(user, 0, user.length), false);
  // Only the first 600 bytes are looked at.
  const late = b(`{"pad":"${'x'.repeat(700)}","type":"attachment"}`);
  assert.equal(T.skipped(late, 0, late.length), false);
  // A nested object whose own "type" is a skipped one, early in the line, drops the whole record [reported quirk].
  const nested = b('{"type":"assistant","message":{"content":[{"type":"tool_use","input":{"type":"progress"}}]}}');
  assert.equal(T.skipped(nested, 0, nested.length), true);

  const big = 'A'.repeat(2000);
  assert.equal(T.withoutImages(b(`{"a":{"data":"${big}"},"b":{"data":"small"}}`)).toString(), '{"a":{"data":""},"b":{"data":"small"}}');
  assert.equal(T.withoutImages(b('{"x":1}')).toString(), '{"x":1}');
  assert.equal(T.withoutImages(b('{"data":"unterminated')).toString(), '{"data":"unterminated');
  assert.equal(T.withoutImages(b(`{"data":"${'B'.repeat(1024)}"}`)).toString().length, 1024 + 11); // 1024 is kept

  const line = b('xx{"a":1}yy');
  assert.deepEqual(T.parseLine(line, 2, 9), { a: 1 });
  assert.equal(T.parseLine(b('[1,2]'), 0, 5), null);
  assert.equal(T.parseLine(b('{bad'), 0, 4), null);
  const huge = b(`{"type":"user","img":{"data":"${'C'.repeat(40 << 10)}"},"ok":true}`);
  assert.deepEqual(T.parseLine(huge, 0, huge.length), { type: 'user', img: { data: '' }, ok: true });
});

test('Track: tokens, pending order, loop detection', () => {
  const t = new T.Track();
  t.addTok(1, 2, 3, 4);
  t.addTok(1, 1, 1, 1);
  assert.deepEqual(t.tokDict(), { in: 2, out: 3, cr: 4, cw: 5 });
  t.pendingSet('a', { n: 1 });
  t.pendingSet('b', { n: 2 });
  t.pendingSet('a', { n: 3 });
  assert.deepEqual([...t.pending.keys()], ['b', 'a']);
  assert.equal(t.isLoop, false);
  t.sig = ['x', 'x'];
  assert.equal(t.isLoop, false);
  t.sig = ['y', 'x', 'x', 'x'];
  assert.equal(t.isLoop, true);
  t.sig = ['x', 'x', 'y'];
  assert.equal(t.isLoop, false);
  t.tools = 5;
  t.resetCounters();
  assert.equal(t.tools, 0);
  assert.deepEqual(t.tokDict(), { in: 0, out: 0, cr: 0, cw: 0 });
  assert.equal(t.pending.size, 2); // pending survives a reset
  const s = new T.SubAgent('sid', 'aid');
  assert.equal(s.key, 'sid:aid');
  assert.equal(new T.Session('x').supersededBy, null);
});

test('alive, ancestors, sameStart', () => {
  assert.equal(T.alive(process.pid), true);
  assert.equal(T.alive(0), false);
  assert.equal(T.alive(-1), false);
  assert.equal(T.alive(undefined), false);
  assert.equal(T.alive(2 ** 30), false);
  const parents = new Map([[10, 9], [9, 8], [8, 1], [1, 0]]);
  assert.deepEqual(T.ancestors(10, parents), [9, 8, 1]);
  assert.deepEqual(T.ancestors(5, parents), []);
  assert.deepEqual(T.ancestors(3, new Map([[3, 4], [4, 3]])), [4]); // cycle back to self stops
  assert.deepEqual(T.ancestors(3, new Map([[3, 4], [4, 5], [5, 4]])), [4, 5]); // cycle elsewhere stops
  assert.deepEqual(T.ancestors(7, new Map([[7, 7]])), []);
  const long = new Map(Array.from({ length: 40 }, (_, i) => [i + 1, i + 2]));
  assert.equal(T.ancestors(1, long).length, 16);
  assert.equal(T.sameStart(1_000_000, 1_019_999), true);
  assert.equal(T.sameStart(1_000_000, 1_020_000), false);
});

test('agy helpers: request, values, args, tools, planned calls', () => {
  assert.equal(T.agyRequest('<USER_REQUEST> hi there </USER_REQUEST><X>y</X>'), 'hi there');
  assert.equal(T.agyRequest('  raw  '), 'raw');
  assert.equal(T.agyRequest(null), '');
  assert.equal(T.agyValue('"x"'), 'x');
  assert.equal(T.agyValue('nope'), 'nope');
  assert.equal(T.agyValue(5), 5);
  assert.equal(T.agyArg('["a","b",null]'), 'a, b');
  assert.equal(T.agyArg('{"a":1}'), '{"a":1}');
  assert.equal(T.agyArg(null), null);
  assert.equal(T.agyArg('null'), null);
  assert.equal(T.agyArg(7), '7');

  const kind = (name) => { const r = T.agyTool({ name }, 1); return `${r.n}/${r.c}`; };
  assert.equal(kind('run_command'), 'Bash/bash');
  assert.equal(kind('command_status'), 'Bash/bash');
  assert.equal(kind('search_web'), 'WebSearch/web');
  assert.equal(kind('read_url_content'), 'WebFetch/web');
  assert.equal(kind('view_content_chunk'), 'WebFetch/web');
  assert.equal(kind('browser_click'), 'Browser/browser');
  assert.equal(kind('open_browser_url'), 'Browser/browser');
  assert.equal(kind('read_browser_page'), 'Browser/browser');
  assert.equal(kind('capture_browser_screenshot'), 'Browser/browser');
  assert.equal(kind('view_file'), 'Read/read');
  assert.equal(kind('list_dir'), 'Read/read');
  assert.equal(kind('grep_search'), 'Grep/search');
  assert.equal(kind('write_to_file'), 'Edit/edit');
  assert.equal(kind('replace_file_content'), 'Edit/edit');
  assert.equal(kind('invoke_subagent'), 'Agent/agent');
  assert.equal(kind('mcp_tool'), 'MCP/mcp');
  assert.equal(kind('something_else'), 'something_else/plan');
  assert.deepEqual(T.agyTool({}, 3), { n: 'tool', c: 'plan', l: 'tool', t: 3 });
  // Label: first key with a value, in AGY_LABEL_KEYS order.
  assert.equal(T.agyTool({ name: 'run_command', args: { CommandLine: '"npm test"', Url: 'x' } }, 0).l, 'npm test');
  assert.equal(T.agyTool({ name: 'view_file', args: { CommandLine: '', AbsolutePath: '"C:\\\\a.txt"' } }, 0).l, 'C:\\a.txt');
  assert.equal(T.agyTool({ name: 'search_web', args: { queries: '["a","b"]' } }, 0).l, 'a, b');

  const plan = { idx: 1, calls: [{ name: 'a' }, { name: 'b' }], ts: 9 };
  assert.equal(T.agyPlanned(plan, 1), null);
  assert.equal(T.agyPlanned(plan, 2).name, 'a');
  assert.equal(T.agyPlanned(plan, 3).name, 'b');
  assert.equal(T.agyPlanned(plan, 4), null);
  assert.equal(T.agyCall(plan, null), null);
  assert.equal(T.agyCall(plan, 9), null);
  assert.deepEqual(T.agyCall(plan, 3), { n: 'b', c: 'plan', l: 'b', t: 9 });
});
