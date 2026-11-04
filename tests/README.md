# Tests

Node's built-in runner, no dependencies: `npm test` at the repo root
(`node --test --experimental-test-coverage` over `tests/**/*.test.js`). Node 22+.

Layout: `tests/*.test.js` (helpers), `tests/web/` (app/Resources/web), `tests/main/` (windows/src main process),
`tests/engine/`, `tests/orbit/`. Name files `*.test.js`. Test files must not edit app code; report bugs instead.

## Browser scripts: `tests/helpers/load.js`

```js
const { load, fakeElement, fakeStorage, WEB } = require('../helpers/load');
const t = load('video.js', opts);          // or load(['a.js', 'b.js'], opts): same context, in order
t.window.DTVideo.formatTime(61);           // whatever the script put on window
```

Each `load()` is a fresh `vm` context whose global is `window` (paths are relative to `app/Resources/web`).
Cross-realm note: arrays/objects made inside the context fail `deepStrictEqual` against literals; compare
`[...arr]`, `{ ...obj }` or `JSON.parse(JSON.stringify(x))`.

`opts`:

| option | meaning |
| --- | --- |
| `storage` | initial localStorage `{ key: value }` |
| `storageThrows` | `['get','set','remove']`: those localStorage calls throw |
| `readyState` | `document.readyState` (default `'complete'`; `'loading'` defers DOMContentLoaded handlers) |
| `selectors` | `{ selector: [elements] }` returned by `document.querySelectorAll` |
| `single` | `{ selector: element }` returned by `document.querySelector` |
| `ids` | `{ id: element }` returned by `document.getElementById` |
| `rootDataset` | `document.documentElement.dataset` |
| `createElement` | function used by `document.createElement` (default throws) |
| `webkit` | `null` removes `window.webkit.messageHandlers.radar`; otherwise posts are recorded |
| `reply` | value `radar.postMessage` returns |
| `image` | class standing in for `Image` |
| `patchDocument` | `(document) => {}` to add/override anything on the fake document (head, body, ...) before scripts run |
| `extra` | more globals `{ name: value }` (FileReader, navigator, fetch, ...) |

Returned: `{ window, document, localStorage, posted, events, observers, fire(type, e), fireDoc(type, e),
listeners, docListeners }` — `posted`: messages sent to the Mac bridge; `events`: `window.dispatchEvent` calls;
`fire`: run `window` listeners; `fireDoc`: run `document` listeners; `observers`: MutationObserver instances
(`.cb`, `.target`).

`fakeElement(attrs)`: `{ dataset, textContent, getAttribute, setAttribute, src, href }`.

## Node modules (windows/src): `tests/helpers/electron.js`

```js
const { requireWith, fakeElectron } = require('../helpers/electron');
const m = requireWith('windows/src/guards.js', { electron: fakeElectron({ /* overrides */ }) });
```

`requireWith(file, stubs)` loads a fresh copy with any `require(id)` in `stubs` replaced (only while loading; lazy
requires inside functions get the real module). `fakeElectron()` stubs app, ipcMain (`.handlers`), contextBridge
(`.exposed`), protocol, shell, dialog, nativeTheme, screen, clipboard.

## Coverage

CI runs `npm run test:ci`, which fails under the thresholds in `package.json` (lines/branches/functions) over the
files in `--test-coverage-include`. Add a file there once its tests reach the threshold.
