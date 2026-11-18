import { h } from './dom.js';
import { layoutMindMap } from './map-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CORE_RADIUS = 38;
const DRAG_THRESHOLD = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const FIT_PADDING = 64;
const COMPACT_WIDTH = 640;
const MIN_FIT_ZOOM = 0.6;
const COMPACT_CORE_INSET = 64;

export class MapView {
  #el;
  #world;
  #path;
  #core;
  #garden;
  #events;
  #nodes = new Map();
  #view = { x: 0, y: 0, k: 1 };
  #selected = null;
  #frame = 0;
  #fitted = false;
  #pendingReveal = null;
  #pointers = new Map();
  #gesture = null;
  #compact = false;

  constructor(el, garden, events) {
    this.#el = el;
    this.#garden = garden;
    this.#events = events;
    this.#path = document.createElementNS(SVG_NS, 'path');
    this.#path.setAttribute('class', 'links');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.append(this.#path);
    this.#core = h('div', { class: 'core', textContent: 'jardim' });
    this.#world = h('div', { class: 'world' }, svg, this.#core);
    el.append(this.#world);
    this.#bindGestures();
    garden.subscribe(() => this.render());
    addEventListener('resize', () => this.#onResize());
    this.#compact = this.#isCompact();
    this.#apply();
  }

  render() {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#draw());
  }

  select(id) {
    this.#selected = id;
    this.#nodes.forEach((el, nodeId) => el.classList.toggle('selected', nodeId === id));
  }

  reveal(id) {
    this.#pendingReveal = id;
    this.render();
  }

  zoom(factor) {
    this.#zoomAt(factor, 0, 0);
  }

  fit() {
    const elements = [this.#core, ...this.#nodes.values()];
    this.#view = { x: 0, y: 0, k: 1 };
    this.#apply();
    const frame = this.#el.getBoundingClientRect();
    const rects = elements.map(el => el.getBoundingClientRect());
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    const k = clamp(Math.min(1, (frame.width - FIT_PADDING * 2) / (right - left), (frame.height - FIT_PADDING * 2) / (bottom - top)));
    const offsetY = (top + bottom) / 2 - (frame.top + frame.height / 2);
    if (k < MIN_FIT_ZOOM) {
      this.#view = { x: COMPACT_CORE_INSET - frame.width / 2, y: -offsetY * MIN_FIT_ZOOM, k: MIN_FIT_ZOOM };
    } else {
      const offsetX = (left + right) / 2 - (frame.left + frame.width / 2);
      this.#view = { x: -offsetX * k, y: -offsetY * k, k };
    }
    this.#apply();
  }

  #isCompact() {
    return this.#el.clientWidth < COMPACT_WIDTH;
  }

  #onResize() {
    const compact = this.#isCompact();
    if (compact === this.#compact) return this.#apply();
    this.#compact = compact;
    this.#fitted = false;
    this.render();
  }

  #draw() {
    const { nodes, links } = layoutMindMap(this.#garden, { singleSide: this.#compact });
    const visible = new Set();
    for (const node of nodes) {
      visible.add(node.id);
      this.#updateNode(this.#nodes.get(node.id) ?? this.#createNode(node.id), node);
    }
    for (const [id, el] of this.#nodes) {
      if (visible.has(id)) continue;
      el.remove();
      this.#nodes.delete(id);
    }
    this.#path.setAttribute('d', this.#linkPath(nodes, links));
    if (!this.#fitted && nodes.length) {
      this.#fitted = true;
      this.fit();
    } else {
      this.#apply();
    }
    if (this.#pendingReveal) this.#revealNow(this.#pendingReveal);
  }

  #createNode(id) {
    const el = h('div', { class: 'node' },
      h('span', { class: 'label' }),
      h('button', { class: 'add', textContent: '+', 'aria-label': 'Adicionar sub-ideia' }));
    el.dataset.id = id;
    this.#world.append(el);
    this.#nodes.set(id, el);
    return el;
  }

  #updateNode(el, { id, title, depth, dir, x, y }) {
    el.className = `node depth-${Math.min(depth, 3)} ${dir < 0 ? 'left' : 'right'}${id === this.#selected ? ' selected' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = dir < 0 ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
    const label = el.firstChild;
    label.textContent = title.trim() || 'sem título';
    label.classList.toggle('untitled', !title.trim());
  }

  #linkPath(nodes, links) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const outlet = (id, dir) => {
      if (!id) return { x: dir * CORE_RADIUS, y: 0 };
      const node = byId.get(id);
      return { x: node.x + dir * this.#nodes.get(id).firstChild.offsetWidth, y: node.y };
    };
    return links.map(({ from, to, dir }) => {
      const a = outlet(from, dir);
      const b = byId.get(to);
      const mid = (a.x + b.x) / 2;
      return `M${a.x},${a.y}C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`;
    }).join('');
  }

  #revealNow(id) {
    this.#pendingReveal = null;
    const el = this.#nodes.get(id);
    if (!el) return;
    const frame = this.#el.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const inside = rect.left > frame.left && rect.right < frame.right && rect.top > frame.top && rect.bottom < frame.bottom;
    if (inside) return;
    this.#view.x -= rect.left + rect.width / 2 - (frame.left + frame.width / 2);
    this.#view.y -= rect.top + rect.height / 2 - (frame.top + frame.height / 2);
    this.#apply();
  }

  #apply() {
    const { x, y, k } = this.#view;
    this.#world.style.transform = `translate(${this.#el.clientWidth / 2 + x}px,${this.#el.clientHeight / 2 + y}px) scale(${k})`;
  }

  #zoomAt(factor, mx, my) {
    const k = clamp(this.#view.k * factor);
    this.#view.x = mx - (mx - this.#view.x) * k / this.#view.k;
    this.#view.y = my - (my - this.#view.y) * k / this.#view.k;
    this.#view.k = k;
    this.#apply();
  }

  #local(clientX, clientY) {
    const frame = this.#el.getBoundingClientRect();
    return { x: clientX - frame.left - frame.width / 2, y: clientY - frame.top - frame.height / 2 };
  }

  #bindGestures() {
    const el = this.#el;
    el.addEventListener('pointerdown', event => {
      el.setPointerCapture(event.pointerId);
      this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.#gesture = this.#pointers.size === 1 ? this.#startPan(event) : this.#startPinch();
    });
    el.addEventListener('pointermove', event => {
      if (!this.#pointers.has(event.pointerId)) return;
      this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.#gesture?.move();
    });
    const end = event => {
      if (!this.#pointers.has(event.pointerId)) return;
      this.#pointers.delete(event.pointerId);
      if (event.type === 'pointerup' && this.#gesture?.isTap()) this.#tap(this.#gesture.target);
      this.#gesture = null;
      el.classList.remove('grabbing');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', event => {
      event.preventDefault();
      const { x, y } = this.#local(event.clientX, event.clientY);
      this.#zoomAt(Math.exp(-event.deltaY * 0.0015), x, y);
    }, { passive: false });
  }

  #startPan(event) {
    const start = { x: event.clientX, y: event.clientY, vx: this.#view.x, vy: this.#view.y };
    let moved = false;
    return {
      target: event.target,
      isTap: () => !moved,
      move: () => {
        const [pointer] = this.#pointers.values();
        const dx = pointer.x - start.x;
        const dy = pointer.y - start.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        this.#el.classList.add('grabbing');
        this.#view.x = start.vx + dx;
        this.#view.y = start.vy + dy;
        this.#apply();
      }
    };
  }

  #startPinch() {
    const measure = () => {
      const [a, b] = [...this.#pointers.values()];
      return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: this.#local((a.x + b.x) / 2, (a.y + b.y) / 2) };
    };
    let last = measure();
    return {
      target: null,
      isTap: () => false,
      move: () => {
        if (this.#pointers.size < 2) return;
        const current = measure();
        this.#zoomAt(current.distance / last.distance, current.center.x, current.center.y);
        this.#view.x += current.center.x - last.center.x;
        this.#view.y += current.center.y - last.center.y;
        this.#apply();
        last = current;
      }
    };
  }

  #tap(target) {
    const node = target?.closest?.('.node');
    if (target?.closest?.('.add') && node) return this.#events.onAdd(node.dataset.id);
    if (node) return this.#events.onSelect(node.dataset.id);
    if (target?.closest?.('.core')) return this.#events.onAdd(null);
    this.#events.onBackground();
  }
}

function clamp(k) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}
