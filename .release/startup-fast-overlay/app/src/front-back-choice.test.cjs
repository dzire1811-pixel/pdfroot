const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Swap in the Front and Back preview submits back first and front second", async () => {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      elements.set(selector, {
        listeners,
        classList: { add() {}, remove() {} },
        addEventListener(name, handler) { listeners.set(name, handler); },
      });
    }
    return elements.get(selector);
  }
  let chosen;
  const context = vm.createContext({
    queueMicrotask,
    document: { querySelector: element },
    window: {
      addEventListener() {},
      pdfrootDesktop: {
      onToolActivate(callback) { queueMicrotask(() => callback({})); },
        frontBackPreviews: async () => ({ images: [
          { name: "front.jpg", preview: "data:image/jpeg;base64,AA==" },
          { name: "back.jpg", preview: "data:image/jpeg;base64,BB==" },
        ] }),
        chooseFrontBackOrder: (order) => { chosen = order; },
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "ui", "front-back-choice.js"), "utf8");
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  element("#swap").listeners.get("click")();
  assert.equal(element("#name-0").textContent, "back.jpg");
  assert.equal(element("#name-1").textContent, "front.jpg");
  element("#merge").listeners.get("click")();
  assert.deepEqual(Array.from(chosen), [1, 0]);
});
