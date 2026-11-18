import { h, autosize } from './dom.js';
import { renderBlock, isUrl } from './blocks.js';
import { compressImage } from './image.js';
import { PALETTE, colorHex } from './palette.js';
import { ICONS, iconSvg } from './icons.js';

const UNTITLED = 'sem título';

export class CardView {
  #el;
  #garden;
  #events;
  #id = null;
  #title;
  #blocks;
  #crumbs;
  #children;
  #files;
  #look;
  #reset;

  constructor(el, garden, events) {
    this.#el = el;
    this.#garden = garden;
    this.#events = events;
    garden.subscribe(() => this.#refreshStructure());
    el.addEventListener('paste', event => this.#onPaste(event));
    el.addEventListener('dragover', event => {
      event.preventDefault();
      el.classList.add('drop');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', event => this.#onDrop(event));
  }

  open(id, { focusTitle = false } = {}) {
    if (id === this.#id) return;
    this.#leave();
    this.#id = id;
    this.#render();
    this.#el.classList.add('open');
    if (focusTitle) this.#title.focus();
  }

  close() {
    if (!this.#id) return;
    this.#leave();
    this.#hide();
  }

  #leave() {
    const id = this.#id;
    this.#id = null;
    if (id && this.#garden.isBlank(id)) this.#garden.remove(id);
  }

  #hide() {
    this.#el.classList.remove('open');
    this.#events.onClose();
  }

  #idea() {
    return this.#garden.get(this.#id);
  }

  #render() {
    const idea = this.#idea();
    this.#title = h('textarea', {
      class: 'title',
      rows: 1,
      placeholder: 'nova ideia',
      value: idea.title,
      oninput: event => {
        autosize(event.target);
        this.#garden.edit(this.#id, { title: event.target.value });
      },
      onkeydown: event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        this.#addBlock({ type: 'text', value: '' });
      }
    });
    this.#blocks = h('div', { class: 'blocks' });
    this.#crumbs = h('nav', { class: 'crumbs' });
    this.#children = h('div', { class: 'children' });
    this.#look = h('div', { class: 'look' });
    this.#reset = h('button', { class: 'quiet', textContent: 'posição original', onclick: () => this.#garden.edit(this.#id, { offsetX: 0, offsetY: 0 }) });
    this.#files = h('input', {
      type: 'file',
      accept: 'image/*',
      multiple: true,
      hidden: true,
      onchange: event => {
        this.#uploadFiles(event.target.files);
        event.target.value = '';
      }
    });

    this.#el.replaceChildren(
      h('div', { class: 'card-head' },
        this.#crumbs,
        h('button', { class: 'icon-btn', textContent: '×', 'aria-label': 'Fechar', onclick: () => this.close() })),
      h('div', { class: 'card-body' },
        this.#look,
        this.#title,
        this.#blocks,
        h('div', { class: 'adders' },
          h('button', { textContent: '+ texto', onclick: () => this.#addBlock({ type: 'text', value: '' }) }),
          h('button', { textContent: '+ link', onclick: () => this.#addBlock({ type: 'link', url: '' }) }),
          h('button', { textContent: '+ imagem', onclick: () => this.#files.click() }),
          this.#files),
        h('div', { class: 'section' },
          h('h3', { textContent: 'sub-ideias' }),
          this.#children)),
      h('div', { class: 'card-foot' },
        this.#reset,
        h('button', { class: 'danger', textContent: 'excluir ideia', onclick: () => this.#delete() })));

    requestAnimationFrame(() => autosize(this.#title));
    this.#renderLook();
    this.#renderBlocks();
    this.#refreshStructure();
  }

  #renderLook(picking = false) {
    const idea = this.#idea();
    const hex = colorHex(idea.color);
    const iconButton = h('button', {
      class: `icon-slot${idea.icon ? '' : ' unset'}`,
      'aria-label': 'Escolher ícone',
      onclick: () => this.#renderLook(!picking)
    });
    iconButton.innerHTML = idea.icon ? iconSvg(idea.icon, 26) : iconSvg('smile', 18);
    if (hex) iconButton.style.color = hex;
    const swatches = [null, ...PALETTE].map(color => h('button', {
      class: `swatch${(color?.id ?? null) === idea.color ? ' on' : ''}${color ? '' : ' none'}`,
      title: color ? `${color.name} · ${color.year}` : 'sem cor',
      'aria-label': color ? color.name : 'Sem cor',
      style: color ? `--swatch:${color.hex}` : '',
      onclick: () => {
        this.#garden.edit(this.#id, { color: color?.id ?? null });
        this.#renderLook(picking);
      }
    }));
    const row = h('div', { class: 'look-row' }, iconButton, h('div', { class: 'swatches' }, swatches));
    this.#look.replaceChildren(...(picking ? [row, this.#iconPicker(idea)] : [row]));
  }

  #iconPicker(idea) {
    const grid = h('div', { class: 'icon-grid' });
    const choose = icon => {
      this.#garden.edit(this.#id, { icon });
      this.#renderLook(false);
    };
    const fill = query => {
      const term = query.trim().toLowerCase();
      const matches = ICONS.filter(icon => !term || icon.label.includes(term) || icon.id.includes(term));
      grid.replaceChildren(...matches.map(icon => {
        const button = h('button', { title: icon.label, 'aria-label': icon.label, class: icon.id === idea.icon ? 'on' : '', onclick: () => choose(icon.id) });
        button.innerHTML = iconSvg(icon.id, 18);
        return button;
      }));
    };
    const search = h('input', { type: 'search', placeholder: 'buscar ícone…', oninput: event => fill(event.target.value) });
    fill('');
    requestAnimationFrame(() => search.focus());
    return h('div', { class: 'picker' },
      h('div', { class: 'picker-head' }, search, idea.icon ? h('button', { class: 'quiet', textContent: 'remover', onclick: () => choose(null) }) : null),
      grid);
  }

  #renderBlocks(focusLast = false) {
    const context = index => ({
      change: patch => this.#patchBlock(index, patch),
      remove: () => this.#removeBlock(index),
      imageUrl: block => this.#garden.imageUrl(block)
    });
    this.#blocks.replaceChildren(...this.#idea().blocks.map((block, index) => renderBlock(block, context(index))).filter(Boolean));
    if (focusLast) this.#blocks.lastElementChild?.querySelector('textarea,input')?.focus();
  }

  #setBlocks(blocks) {
    this.#garden.edit(this.#id, { blocks });
  }

  #patchBlock(index, patch) {
    this.#setBlocks(this.#idea().blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  }

  #addBlock(block) {
    this.#setBlocks([...this.#idea().blocks, block]);
    this.#renderBlocks(true);
  }

  #removeBlock(index) {
    const blocks = [...this.#idea().blocks];
    const [removed] = blocks.splice(index, 1);
    this.#setBlocks(blocks);
    this.#garden.discardImages([removed]);
    this.#renderBlocks();
  }

  async #uploadFiles(fileList) {
    const id = this.#id;
    const images = [...fileList].filter(file => file.type.startsWith('image/'));
    for (const file of images) {
      try {
        const block = await this.#garden.uploadImage(await compressImage(file));
        const idea = this.#garden.get(id);
        if (!idea) return;
        this.#garden.edit(id, { blocks: [...idea.blocks, block] });
        if (this.#id === id) this.#renderBlocks();
      } catch {
        this.#events.onError('não foi possível enviar a imagem');
      }
    }
  }

  #onPaste(event) {
    if (!this.#id) return;
    const files = [...event.clipboardData.files];
    if (files.length) {
      event.preventDefault();
      this.#uploadFiles(files);
      return;
    }
    const text = event.clipboardData.getData('text');
    if (!isUrl(text) || event.target.closest?.('input[type=url]')) return;
    event.preventDefault();
    this.#addBlock({ type: 'link', url: text.trim() });
  }

  #onDrop(event) {
    event.preventDefault();
    this.#el.classList.remove('drop');
    if (this.#id) this.#uploadFiles(event.dataTransfer.files);
  }

  #refreshStructure() {
    if (!this.#id) return;
    const idea = this.#idea();
    if (!idea) {
      this.#id = null;
      this.#hide();
      return;
    }
    this.#reset.hidden = !idea.offsetX && !idea.offsetY;
    const crumbs = this.#garden.ancestors(this.#id).flatMap(ancestor => [
      h('button', { textContent: ancestor.title.trim() || UNTITLED, onclick: () => this.#events.onNavigate(ancestor.id) }),
      h('i', { textContent: '/' })
    ]);
    this.#crumbs.replaceChildren(...crumbs);
    const children = this.#garden.childrenOf(this.#id).map(child =>
      h('button', { textContent: child.title.trim() || UNTITLED, onclick: () => this.#events.onNavigate(child.id) }));
    this.#children.replaceChildren(...children,
      h('button', { class: 'new', textContent: '+ sub-ideia', onclick: () => this.#events.onAddChild(this.#id) }));
  }

  async #delete() {
    const idea = this.#idea();
    const nested = this.#garden.descendantIds(idea.id).length - 1;
    const name = idea.title.trim() || UNTITLED;
    const message = nested ? `Excluir "${name}" e ${nested} sub-ideia(s)?` : `Excluir "${name}"?`;
    if (!confirm(message)) return;
    this.#id = null;
    this.#hide();
    await this.#garden.remove(idea.id);
  }
}
