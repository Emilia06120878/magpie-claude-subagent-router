// Minimal DOM for this page's own controls; not a browser or a dependency.
export class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.style = { setProperty: (key, value) => { this.attributes[`style-${key}`] = value; } };
    this.placeholder = "";
    this.className = "";
  }

  set class(value) { this.className = value; this.attributes.class = value; }
  get class() { return this.className; }
  append(...children) {
    for (const child of children) {
      if (child?.parentNode) child.parentNode.removeChild(child);
      this.children.push(child);
      if (child) child.parentNode = this;
    }
  }
  prepend(child) {
    if (child?.parentNode) child.parentNode.removeChild(child);
    this.children.unshift(child);
    if (child) child.parentNode = this;
  }
  appendChild(child) { this.append(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === "type" && value === "search") this.value ||= ""; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name) { for (const fn of this.listeners[name] || []) fn({ target: this }); }
  click() { this.dispatch("click"); }

  walk() { return [this, ...this.children.flatMap((child) => child.walk())]; }
  queryAll(predicate) { return this.walk().filter(predicate); }
  text() { return this.textContent + this.children.map((child) => child.text()).join(""); }
}

export function makePage(documentIds) {
  const elements = new Map(documentIds.map((id) => [id, new FakeElement(["search"].includes(id) ? "input" : id === "routing-mode" ? "select" : "div")]));
  for (const value of ["strict", "prefer"]) {
    const option = elements.get("routing-mode").appendChild(new FakeElement("option"));
    option.value = value;
  }
  const document = {
    documentElement: new FakeElement("html"),
    head: new FakeElement("head"),
    title: "",
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => {
      if (!elements.has(id)) throw new Error(`Unknown test element: ${id}`);
      return elements.get(id);
    },
  };
  return { document, elements };
}
