const assert = require("node:assert/strict");
const test = require("node:test");
const { parseExplorerPaths } = require("./windows-explorer.cjs");

test("Explorer selection parsing preserves only existing selected paths", () => {
  const first = "C:\\Forms\\photo.jpg";
  const second = "C:\\Forms\\document.pdf";
  const parsed = parseExplorerPaths(JSON.stringify([first, second]), (filePath) => filePath === first);
  assert.deepEqual(parsed, [first]);
});

test("Explorer selection parsing safely ignores empty or malformed output", () => {
  assert.deepEqual(parseExplorerPaths("", () => true), []);
  assert.deepEqual(parseExplorerPaths("not-json", () => true), []);
});


const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createSelectionService } = require('./windows-explorer.cjs');
function fakeWorker(response) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stdin = new PassThrough();
  child.kill = () => { child.emit('close'); };
  child.stdin.on('data', data => { response(JSON.parse(data.toString()), child); });
  return child;
}
test('first shortcut waits for a slow worker and passes a Unicode, spaced right-click path', async t => {
  let spawned = 0;
  const path = 'C:\\Forms\\ગુજરાત photo.jpg';
  const service = createSelectionService({ platform: 'win32', startupMs: 1500, exists: () => true, spawnImpl: (_command, args) => {
    assert.equal(args.includes('-STA'), true);
    const child = fakeWorker((request, process) => {
      assert.equal(request.anchor, path);
      process.stdout.write(JSON.stringify({ id: request.id, paths: [path] }) + '\n');
    });
    spawned++; setTimeout(() => child.stdout.write('READY\n'), 950);
    return child;
  } });
  t.after(() => service.stop());
  assert.deepEqual(await service.get({ anchor: path }), [path]);
  assert.deepEqual(await service.get({ anchor: path }), [path]);
  assert.equal(spawned, 1);
});

test('a dead selection helper recovers automatically and stopping prevents restart', async t => {
  const workers = [];
  const service = createSelectionService({ platform: 'win32', startupMs: 100, restartMs: 10, exists: () => true,
    spawnImpl: () => {
      const child = fakeWorker((request, process) => process.stdout.write(JSON.stringify({ id: request.id, paths: ['a.jpg'] }) + '\n'));
      workers.push(child); setImmediate(() => child.stdout.write('READY\n')); return child;
    } });
  t.after(() => service.stop());
  await service.start(); workers[0].emit('close');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(workers.length, 2);
  assert.deepEqual(await service.get(), ['a.jpg']);
  service.stop(); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(workers.length, 2);
});

test('a hung selection helper releases every waiting shortcut instead of freezing the app', async t => {
  const service = createSelectionService({ platform: 'win32', startupMs: 100, requestMs: 200, restartMs: 1000,
    spawnImpl: () => {
      const child = fakeWorker(() => {}); setImmediate(() => child.stdout.write('READY\n')); return child;
    } });
  t.after(() => service.stop());
  assert.deepEqual(await Promise.all([service.get(), service.get()]), [[], []]);
});
