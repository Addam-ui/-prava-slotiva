import test from 'node:test';
import assert from 'node:assert/strict';

// Základní regression test přenosu neuložených změn – bez skutečného prohlížeče.
class MockNode {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.clientWidth = 390;
    this.listeners = {};
    this.classList = {
      toggle: (name, enabled) => {
        const values = new Set(this.className.split(' ').filter(Boolean));
        if (enabled === undefined ? !values.has(name) : enabled) values.add(name);
        else values.delete(name);
        this.className = [...values].join(' ');
      },
    };
  }
  append(...children) { this.children.push(...children); }
  addEventListener(name, cb) { this.listeners[name] = cb; }
  removeEventListener(name) { delete this.listeners[name]; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

test('náhled odešle změny jen do iframe a uloží je až po kliknutí', async () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldLocation = globalThis.location;
  const oldNode = globalThis.Node;
  const oldResize = globalThis.ResizeObserver;
  const listeners = {};
  const posted = [];
  globalThis.Node = MockNode;
  globalThis.document = {
    createElement: (name) => {
      const node = new MockNode();
      if (name === 'iframe') node.contentWindow = { postMessage: (...args) => posted.push(args) };
      return node;
    },
    createTextNode: (text) => ({ text }),
    addEventListener: () => {},
  };
  globalThis.window = {
    location: { origin: 'https://slotiva.example' },
    addEventListener: (name, cb) => { listeners[name] = cb; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  globalThis.location = { origin: 'https://slotiva.example' };
  globalThis.ResizeObserver = undefined;
  try {
    const { createLiveBookingPreview } = await import('../public/app/js/live-preview.js');
    let saved = 0;
    let draft = { business: { name: 'PULZ' }, brandColor: '#0a7c80', appearance: { logo: '', background: '', backgroundColor: '#101819' } };
    const preview = createLiveBookingPreview({ slug: 'pulz', getDraft: () => draft, onSave: () => { saved++; } });
    preview.update();
    assert.equal(posted.at(-1)[0].business.name, 'PULZ');
    assert.equal(posted.at(-1)[1], 'https://slotiva.example');
    draft = { ...draft, business: { name: 'PULZ NOVÝ' } };
    preview.update();
    preview.setDirty(true);
    assert.equal(posted.at(-1)[0].business.name, 'PULZ NOVÝ');
    assert.equal(saved, 0, 'Live změny nesmějí měnit databázi');
    assert.ok(preview.element);
    preview.destroy();
    assert.equal(listeners.message, undefined, 'Zavření pohledu musí zrušit posluchač');
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.location = oldLocation;
    globalThis.Node = oldNode;
    globalThis.ResizeObserver = oldResize;
  }
});
