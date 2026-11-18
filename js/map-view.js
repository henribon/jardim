import { h } from './dom.js';
import { layoutMindMap } from './map-layout.js';
import { colorHex, readableTextOn } from './palette.js';
import { iconSvg } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CORE_RADIUS = 38;
const DRAG_THRESHOLD = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const FIT_PADDING = 64;
const COMPACT_WIDTH = 640;
const MIN_FIT_ZOOM = 0.6;
const COMPACT_CORE_INSET = 64;
const MIN_VISIBLE_WIDTH = 240;
const UNTITLED = 'sem título';
const CROSS_BEND = 0.18;

export class MapView {
  #el;
  #world;
  #links;
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
    this.#links = document.createElementNS(SVG_NS, 'g');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.append(this.#links);
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
    this.#drawLinks(nodes, links);
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
      h('span', { class: 'label' }, h('span', { class: 'glyph' }), h('span', { class: 'text' })),
      h('button', { class: 'add', textContent: '+', 'aria-label': 'Adicionar sub-ideia' }));
    el.dataset.id = id;
    this.#world.append(el);
    this.#nodes.set(id, el);
    return el;
  }

  #updateNode(el, { id, title, color, icon, tint, depth, dir, x, y }) {
    const classes = ['node', `depth-${Math.min(depth, 3)}`, dir < 0 ? 'left' : 'right'];
    if (id === this.#selected) classes.push('selected');
    if (el.classList.contains('dragging')) classes.push('dragging');
    el.className = classes.join(' ');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = dir < 0 ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
    const [label] = el.children;
    const [glyph, text] = label.children;
    text.textContent = title.trim() || UNTITLED;
    label.classList.toggle('untitled', !title.trim());
    this.#paint(label, colorHex(color), colorHex(tint));
    if (glyph.dataset.icon !== (icon ?? '')) {
      glyph.dataset.icon = icon ?? '';
      glyph.innerHTML = icon ? iconSvg(icon, 15) : '';
    }
    glyph.hidden = !icon;
  }

  #paint(label, fill, tint) {
    label.classList.toggle('filled', Boolean(fill));
    label.style.setProperty('--fill', fill ?? 'transparent');
    label.style.setProperty('--ink', fill ? readableTextOn(fill) : 'inherit');
    label.style.setProperty('--tint', tint ?? 'var(--line2)');
  }

  #drawLinks(nodes, links) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const outlet = (id, dir) => {
      if (!id) return { x: dir * CORE_RADIUS, y: 0 };
      const node = byId.get(id);
      return { x: node.x + dir * this.#nodes.get(id).firstChild.offsetWidth, y: node.y };
    };
    const groups = new Map();
    for (const { from, to, dir, tint } of links) {
      const a = outlet(from, dir);
      const b = byId.get(to);
      const mid = (a.x + b.x) / 2;
      const key = colorHex(tint) ?? '';
      groups.set(key, (groups.get(key) ?? '') + `M${a.x},${a.y}C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`);
    }
    const paths = [...groups].map(([stroke, d]) => this.#path(stroke ? 'links tinted' : 'links', d, stroke));
    const cross = this.#crossLinks(byId);
    this.#links.replaceChildren(...paths, ...(cross ? [this.#path('cross', cross)] : []));
  }

  #crossLinks(byId) {
    const center = id => {
      const node = byId.get(id);
      return { x: node.x + node.dir * this.#nodes.get(id).firstChild.offsetWidth / 2, y: node.y };
    };
    return this.#garden.connections()
      .filter(([a, b]) => byId.has(a) && byId.has(b))
      .map(([a, b]) => {
        const from = center(a);
        const to = center(b);
        const bend = CROSS_BEND * Math.hypot(to.x - from.x, to.y - from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2;
        const cx = (from.x + to.x) / 2 + Math.cos(angle) * bend;
        const cy = (from.y + to.y) / 2 + Math.sin(angle) * bend;
        return `M${from.x},${from.y}Q${cx},${cy} ${to.x},${to.y}`;
      }).join('');
  }

  #path(className, d, stroke) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    if (stroke) path.style.stroke = stroke;
    path.setAttribute('d', d);
    return path;
  }

  #revealNow(id) {
    this.#pendingReveal = null;
    const el = this.#nodes.get(id);
    if (!el) return;
    const area = this.#visibleArea();
    const rect = el.getBoundingClientRect();
    const inside = rect.left > area.left && rect.right < area.right && rect.top > area.top && rect.bottom < area.bottom;
    if (inside) return;
    this.#view.x -= rect.left + rect.width / 2 - (area.left + area.right) / 2;
    this.#view.y -= rect.top + rect.height / 2 - (area.top + area.bottom) / 2;
    this.#apply();
  }

  #visibleArea() {
    const { left, right, top, bottom } = this.#el.getBoundingClientRect();
    const coveredFrom = this.#events.coveredFrom?.() ?? right;
    const usable = coveredFrom - left >= MIN_VISIBLE_WIDTH;
    return { left, top, bottom, right: usable ? coveredFrom : right };
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
      this.#gesture?.end?.();
      this.#gesture = this.#pointers.size === 1 ? this.#startSingle(event) : this.#startPinch();
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
      this.#gesture?.end?.();
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

  #startSingle(event) {
    const node = event.target.closest?.('.node');
    if (node && !event.target.closest('.add')) return this.#startNodeDrag(event, node);
    return this.#startPan(event);
  }

  #startNodeDrag(event, el) {
    const idea = this.#garden.get(el.dataset.id);
    const start = { x: event.clientX, y: event.clientY, ox: idea.offsetX, oy: idea.offsetY };
    let moved = false;
    return {
      target: event.target,
      isTap: () => !moved,
      move: () => {
        const [pointer] = this.#pointers.values();
        const dx = pointer.x - start.x;
        const dy = pointer.y - start.y;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moved) el.classList.add('dragging');
        moved = true;
        this.#garden.edit(idea.id, {
          offsetX: Math.round(start.ox + dx / this.#view.k),
          offsetY: Math.round(start.oy + dy / this.#view.k)
        });
      },
      end: () => el.classList.remove('dragging')
    };
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
