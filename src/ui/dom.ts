type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** 작은 DOM 빌더 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'class') {
      node.className = String(v);
    } else if (k === 'style') {
      node.setAttribute('style', String(v));
    } else if (v === true) {
      node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  append(node, children);
  return node;
}

export function append(node: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function chip(color: string, text?: string): HTMLElement {
  return el('span', { class: 'chip' }, el('i', { class: 'chip-dot', style: `background:${color}` }), text ?? '');
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** 픽셀 복주머니 아이콘 (inline SVG) */
export function pouchIcon(): HTMLElement {
  const wrap = el('span', { class: 'pouch-icon' });
  wrap.innerHTML =
    '<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges">' +
    '<rect x="6" y="1" width="1" height="2" fill="#f2c744"/><rect x="9" y="1" width="1" height="2" fill="#f2c744"/>' +
    '<rect x="5" y="3" width="6" height="2" fill="#e8663a"/><rect x="4" y="5" width="8" height="1" fill="#f2c744"/>' +
    '<rect x="3" y="6" width="10" height="7" fill="#d9472b"/><rect x="2" y="8" width="1" height="4" fill="#d9472b"/><rect x="13" y="8" width="1" height="4" fill="#d9472b"/>' +
    '<rect x="4" y="13" width="8" height="2" fill="#8e2a1f"/>' +
    '<rect x="7" y="8" width="2" height="3" fill="#f2c744"/><rect x="6" y="9" width="4" height="1" fill="#f2c744"/>' +
    '</svg>';
  return wrap;
}
