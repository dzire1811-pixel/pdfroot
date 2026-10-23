const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("page preview arrow changes the order submitted to the PDF converter", async () => {
  const elements = new Map();
  function element() {
    return {
      children: [], events: new Map(), scrollTop: 0,
      classList: { add() {}, remove() {} },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute() {},
      addEventListener(type, handler) { this.events.set(type, handler); },
    };
  }
  function find(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  }
  let submitted;
  const context = vm.createContext({
    queueMicrotask,
    document: { querySelector: find, createElement: element },
    window: {
      addEventListener() {},
      pdfrootDesktop: {
      onToolActivate(callback) { queueMicrotask(() => callback({})); },
        pageOrderPreviews: async () => ({
          slug: "jpg-to-pdf", warnings: [],
          pages: [
            { id: "0:0", filename: "front.jpg", pageNumber: 1, preview: "data:image/jpeg;base64,AA==" },
            { id: "1:0", filename: "back.jpg", pageNumber: 1, preview: "data:image/jpeg;base64,AA==" },
          ],
        }),
        choosePageOrder: (order) => { submitted = order; },
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "ui/page-order-choice.js"), "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(find("#pages").children.length, 2);
  find("#pages").children[0].children[2].children[2].events.get("click")();
  find("#create").events.get("click")();
  assert.deepEqual(Array.from(submitted), ["1:0", "0:0"]);
});
