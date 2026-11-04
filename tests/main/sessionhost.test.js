'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const realCp = require('child_process');
const { requireWith } = require('../helpers/electron');

const WIN = process.platform === 'win32';
const pipeOf = (name) => (WIN ? `\\\\.\\pipe\\${name}` : null);
const uniq = () => `atl-test-${process.pid}-${crypto.randomUUID()}`;

// A stand-in host on the pipe: answers each JSON line with `reply(msg, sock)`.
function host(name, reply) {
  const socks = [];
  const got = [];
  const server = net.createServer((sock) => {
    socks.push(sock);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        got.push(m);
        reply(m, sock);
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(pipeOf(name), () => resolve({ server, socks, got, close: () => new Promise((r) => { socks.forEach((s) => s.destroy()); server.close(r); }) })));
}
const send = (sock, m) => sock.write(JSON.stringify(m) + '\n');

function load(cp = realCp) {
  return requireWith('windows/src/sessionhost.js', { child_process: cp });
}

test('openHost: a running host, hello, events, requests by rid, close', { skip: !WIN }, async () => {
  const name = uniq();
  const h = await host(name, (m, sock) => {
    if (m.t === 'hello') send(sock, { rid: m.rid, v: 1, end: true });
    if (m.t === 'list') {
      // events first, in the same write as the answer
      sock.write(JSON.stringify({ t: 'data', id: 'a', d: 'hi' }) + '\nnot json\n' + JSON.stringify({ t: 'replay', id: 'a', d: 'R' }) + '\n' +
        JSON.stringify({ t: 'exit', id: 'b', code: 3 }) + '\n' + JSON.stringify({ rid: m.rid, sessions: [1] }).slice(0, 5));
      setTimeout(() => sock.write(JSON.stringify({ rid: m.rid, sessions: [1] }).slice(5) + '\n'), 10);
    }
  });
  const { openHost } = load();
  const link = await openHost({ name, dir: 'unused', source: 'unused' });
  assert.equal(link.canEnd, true);
  const data = [], exits = [];
  link.on('data', (id, d) => data.push([id, d]));
  link.on('exit', (id, c) => exits.push([id, c]));
  const r = await link.request({ t: 'list' });
  assert.deepEqual(r, { rid: '2', sessions: [1] });
  assert.deepEqual(data, [['a', 'hi'], ['a', 'R']]);
  assert.deepEqual(exits, [['b', 3]]);
  link.send({ t: 'input', id: 'a', d: 'x' });
  await new Promise((r2) => setTimeout(r2, 30));
  assert.deepEqual(h.got.map((m) => m.t), ['hello', 'list', 'input']);
  assert.equal(h.got[0].rid, '1');
  assert.equal(h.got[2].rid, undefined);
  // a request still waiting when the line closes gets an error
  const pending = link.request({ t: 'never' });
  const closed = new Promise((r2) => link.on('close', r2));
  h.socks[0].destroy();
  assert.deepEqual(await pending, { t: 'error', message: 'oturum sunucusu kapandı' });
  await closed;
  assert.equal(link.closed, true);
  assert.deepEqual(await link.request({ t: 'x' }), { t: 'error', message: 'oturum sunucusu kapandı' });
  link.send({ t: 'dropped' }); // no throw once closed
  link.close();
  await h.close();
});

test('openHost: wrong protocol closes and throws; an old host cannot end', { skip: !WIN }, async () => {
  const name = uniq();
  const h = await host(name, (m, sock) => send(sock, { rid: m.rid, v: 2 }));
  const { openHost } = load();
  await assert.rejects(openHost({ name, dir: 'x', source: 'x' }), /oturum sunucusu 2 sürümünü kullanıyor, 1 değil/);
  await h.close();
  const name2 = uniq();
  const h2 = await host(name2, (m, sock) => send(sock, { rid: m.rid, v: 1 }));
  const link = await openHost({ name: name2, dir: 'x', source: 'x' });
  assert.equal(link.canEnd, false);
  link.close();
  await h2.close();
});

test('openHost: no host -> builds with csc, spawns it, waits for the pipe', { skip: !WIN }, async () => {
  const name = uniq();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-sh-'));
  const source = path.join(dir, 'src.cs');
  fs.writeFileSync(source, 'class X {}');
  const hash = crypto.createHash('sha256').update('class X {}').digest('hex').slice(0, 12);
  // stale ones go, the current one's files stay
  fs.writeFileSync(path.join(dir, 'terminal-app-host-old.exe'), '');
  fs.writeFileSync(path.join(dir, 'host-old.cs'), '');
  fs.writeFileSync(path.join(dir, 'keep.txt'), '');
  const calls = [];
  let h = null;
  const cp = {
    execFile(file, args, opts, cb) {
      calls.push({ kind: 'execFile', file, args, opts });
      const out = args.find((a) => a.startsWith('/out:')).slice(5);
      fs.writeFileSync(out, 'exe');
      setImmediate(() => cb(null, ''));
    },
    spawn(exe, args, opts) {
      calls.push({ kind: 'spawn', exe, args, opts });
      const ee = new (require('events'))();
      ee.unref = () => calls.push({ kind: 'unref' });
      setTimeout(async () => {
        h = await host(name, (m, sock) => send(sock, { rid: m.rid, v: 1 }));
      }, 150);
      return ee;
    },
  };
  const { openHost } = load(cp);
  const link = await openHost({ name, dir, source });
  const exe = path.join(dir, `terminal-app-host-${hash}.exe`);
  assert.equal(fs.readFileSync(exe, 'utf8'), 'exe');
  assert.equal(fs.readFileSync(path.join(dir, `host-${hash}.cs`), 'utf8'), 'class X {}');
  assert.equal(calls[0].kind, 'execFile');
  assert.match(calls[0].file, /Framework64[\\/]v4\.0\.30319[\\/]csc\.exe$/);
  assert.deepEqual(calls[0].args.slice(0, 5), ['/nologo', '/target:winexe', '/optimize+', '/r:System.Web.Extensions.dll', '/r:System.Core.dll']);
  assert.equal(calls[0].args[6], path.join(dir, `host-${hash}.cs`));
  assert.equal(calls[0].opts.timeout, 60000);
  assert.deepEqual(calls[1], { kind: 'spawn', exe, args: [name], opts: { cwd: dir, detached: true, stdio: 'ignore', windowsHide: true } });
  assert.equal(calls[2].kind, 'unref');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.existsSync(path.join(dir, 'terminal-app-host-old.exe')), false);
  assert.equal(fs.existsSync(path.join(dir, 'host-old.cs')), false);
  assert.equal(fs.existsSync(path.join(dir, 'keep.txt')), true);
  link.close();
  await h.close();

  // built already: no compile
  const name2 = uniq();
  const calls2 = [];
  const cp2 = {
    execFile() { calls2.push('execFile'); },
    spawn() {
      calls2.push('spawn');
      setTimeout(async () => { h = await host(name2, (m, sock) => send(sock, { rid: m.rid, v: 1 })); }, 50);
      return Object.assign(new (require('events'))(), { unref() {} });
    },
  };
  const link2 = await load(cp2).openHost({ name: name2, dir, source });
  assert.deepEqual(calls2, ['spawn']);
  link2.close();
  await h.close();
});

test('build: compiler failure is the error, first line of its output', { skip: !WIN }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-sh-'));
  const source = path.join(dir, 'src.cs');
  fs.writeFileSync(source, 'broken ' + Math.random());
  const cp = { execFile: (f, a, o, cb) => setImmediate(() => cb(new Error('exit 1'), 'src.cs(1): error CS1001\r\nmore')), spawn() { throw new Error('no'); } };
  await assert.rejects(load(cp).openHost({ name: uniq(), dir, source }), /^Error: csc: src\.cs\(1\): error CS1001$/);
  const cp2 = { execFile: (f, a, o, cb) => setImmediate(() => cb(new Error('spawn ENOENT'), '')), spawn() { throw new Error('no'); } };
  await assert.rejects(load(cp2).openHost({ name: uniq(), dir, source }), /csc: spawn ENOENT/);
});

test('build: another copy built it at the same moment (rename fails, exe there)', { skip: !WIN }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-sh-'));
  const source = path.join(dir, 'src.cs');
  fs.writeFileSync(source, 'race');
  const hash = crypto.createHash('sha256').update('race').digest('hex').slice(0, 12);
  const exe = path.join(dir, `terminal-app-host-${hash}.exe`);
  const name = uniq();
  let h;
  const cp = {
    execFile(f, args, o, cb) {
      const out = args.find((a) => a.startsWith('/out:')).slice(5);
      fs.mkdirSync(exe); // the final name is taken by a folder: rename fails, but it "exists"
      fs.writeFileSync(out, 'mine');
      setImmediate(() => cb(null, ''));
    },
    spawn() {
      setTimeout(async () => { h = await host(name, (m, sock) => send(sock, { rid: m.rid, v: 1 })); }, 20);
      return Object.assign(new (require('events'))(), { unref() {} });
    },
  };
  const link = await load(cp).openHost({ name, dir, source });
  assert.equal(fs.readdirSync(dir).some((f) => f.includes(`-${process.pid}.exe`)), false, 'the half-built one is removed');
  link.close();
  await h.close();
});

test('openHost: host never comes up -> error after 50 tries', { skip: !WIN }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atl-sh-'));
  const source = path.join(dir, 'src.cs');
  fs.writeFileSync(source, 'never');
  const hash = crypto.createHash('sha256').update('never').digest('hex').slice(0, 12);
  fs.writeFileSync(path.join(dir, `terminal-app-host-${hash}.exe`), '');
  const cp = { execFile() {}, spawn: () => Object.assign(new (require('events'))(), { unref() {} }) };
  await assert.rejects(load(cp).openHost({ name: uniq(), dir, source }), /oturum sunucusu başlatılamadı/);
});
