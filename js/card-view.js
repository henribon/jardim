import { h, autosize } from './dom.js';
import { renderBlock, isUrl } from './blocks.js';
import { compressImage } from './image.js';

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
        h('button', { class: 'danger', textContent: 'excluir ideia', onclick: () => this.#delete() })));

    requestAnimationFrame(() => autosize(this.#title));
    this.#renderBlocks();
    this.#refreshStructure();
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
    if (!this.#idea()) {
      this.#id = null;
      this.#hide();
      return;
    }
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
