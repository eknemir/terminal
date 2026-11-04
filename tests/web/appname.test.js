'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeElement } = require('../helpers/load');

const named = (mode) => { const e = fakeElement(); if (mode) e.dataset.appname = mode; return e; };

test('AppName.get: default, stored (trimmed), blank, storage failing', () => {
  assert.equal(load('appname.js').window.AppName.get(), 'Derin Terminal');
  assert.equal(load('appname.js', { storage: { 'app.name': '  Foo  ' } }).window.AppName.get(), 'Foo');
  assert.equal(load('appname.js', { storage: { 'app.name': '   ' } }).window.AppName.get(), 'Derin Terminal');
  assert.equal(load('appname.js', { storageThrows: ['get'] }).window.AppName.get(), 'Derin Terminal');
  assert.equal(load('appname.js').window.AppName.DEFAULT, 'Derin Terminal');
});

test('AppName.title', () => {
  const A = load('appname.js', { storage: { 'app.name': 'Foo' } }).window.AppName;
  assert.equal(A.title(), 'Foo');
  assert.equal(A.title(''), 'Foo');
  assert.equal(A.title('Git'), 'Git · Foo');
});

test('apply on load: elements, upper case, title, Mac message, event', () => {
  const a = named(), b = named('upper');
  const t = load('appname.js', { storage: { 'app.name': 'Foo' }, selectors: { '[data-appname]': [a, b] } });
  assert.equal(a.textContent, 'Foo');
  assert.equal(b.textContent, 'FOO');
  assert.equal(t.document.title, 'Foo');
  assert.deepEqual({ ...t.posted.find((m) => m.type === 'appName') }, { type: 'appName', name: 'Foo' });
  const ev = t.events.find((e) => e.type === 'appname');
  assert.equal(ev.detail, 'Foo');
});

test('apply: title suffix, and pages that own their title', () => {
  const s = load('appname.js', { rootDataset: { titleSuffix: 'Mesajlar' } });
  assert.equal(s.document.title, 'Derin Terminal · Mesajlar');
  const own = load('appname.js', { rootDataset: { appTitle: 'own' } });
  assert.equal(own.document.title, '');
});

test('apply without the Mac bridge does not throw', () => {
  const t = load('appname.js', { webkit: null });
  assert.equal(t.document.title, 'Derin Terminal');
  assert.equal(t.posted.length, 0);
});

test('waits for DOMContentLoaded while loading', () => {
  const t = load('appname.js', { readyState: 'loading' });
  assert.equal(t.document.title, '');
  t.fireDoc('DOMContentLoaded');
  assert.equal(t.document.title, 'Derin Terminal');
});

test('set: stores, clears for default/blank, survives storage errors', () => {
  const t = load('appname.js');
  t.window.AppName.set('  Bar ');
  assert.equal(t.localStorage.getItem('app.name'), 'Bar');
  assert.equal(t.document.title, 'Bar');
  t.window.AppName.set('Derin Terminal');
  assert.equal(t.localStorage.getItem('app.name'), null);
  t.window.AppName.set('X');
  t.window.AppName.set('');
  assert.equal(t.localStorage.getItem('app.name'), null);
  t.window.AppName.set(null);
  assert.equal(t.document.title, 'Derin Terminal');

  const bad = load('appname.js', { storageThrows: ['set', 'remove'] });
  bad.window.AppName.set('Y');
  assert.equal(bad.document.title, 'Derin Terminal');
});

test('storage event from another window re-applies only for its key', () => {
  const t = load('appname.js');
  t.localStorage.setItem('app.name', 'Other');
  t.fire('storage', { key: 'unrelated' });
  assert.equal(t.document.title, 'Derin Terminal');
  t.fire('storage', { key: 'app.name' });
  assert.equal(t.document.title, 'Other');
});

test('ChatModel.get', () => {
  assert.equal(load('appname.js').window.ChatModel.get(), 'haiku');
  assert.equal(load('appname.js', { storage: { 'chat.model': 'opus' } }).window.ChatModel.get(), 'opus');
  assert.equal(load('appname.js', { storage: { 'chat.model': 'default' } }).window.ChatModel.get(), 'default');
  assert.equal(load('appname.js', { storage: { 'chat.model': 'gpt' } }).window.ChatModel.get(), 'haiku');
  assert.equal(load('appname.js', { storageThrows: ['get'] }).window.ChatModel.get(), 'haiku');
  const C = load('appname.js').window.ChatModel;
  assert.deepEqual([...C.ALL], ['haiku', 'sonnet', 'opus', 'default']);
  assert.equal(C.LABELS.default, 'Varsayılan');
  assert.equal(C.DEFAULT, 'haiku');
});

test('ChatModel tells the app on load', () => {
  const t = load('appname.js', { storage: { 'chat.model': 'sonnet' } });
  assert.deepEqual({ ...t.posted.find((m) => m.type === 'chatModel') }, { type: 'chatModel', model: 'sonnet' });
  assert.doesNotThrow(() => load('appname.js', { webkit: null }));
});

test('ChatModel.set: valid, invalid, storage failing', () => {
  const t = load('appname.js');
  t.posted.length = 0;
  t.window.ChatModel.set('opus');
  assert.equal(t.localStorage.getItem('chat.model'), 'opus');
  assert.deepEqual({ ...t.posted[0] }, { type: 'chatModel', model: 'opus' });
  assert.equal(t.events.filter((e) => e.type === 'chatmodel').pop().detail, 'opus');
  t.window.ChatModel.set('bogus');
  assert.equal(t.localStorage.getItem('chat.model'), 'haiku');

  const bad = load('appname.js', { storageThrows: ['set'] });
  bad.window.ChatModel.set('opus');
  assert.equal(bad.window.ChatModel.get(), 'haiku');
  assert.equal(bad.events.filter((e) => e.type === 'chatmodel').pop().detail, 'haiku');
});

test('ChatModel follows storage events for its key only', () => {
  const t = load('appname.js');
  t.posted.length = 0;
  t.localStorage.setItem('chat.model', 'sonnet');
  t.fire('storage', { key: 'other' });
  assert.equal(t.posted.filter((m) => m.type === 'chatModel').length, 0);
  t.fire('storage', { key: 'chat.model' });
  assert.deepEqual({ ...t.posted.find((m) => m.type === 'chatModel') }, { type: 'chatModel', model: 'sonnet' });
  assert.equal(t.events.filter((e) => e.type === 'chatmodel').pop().detail, 'sonnet');
});
