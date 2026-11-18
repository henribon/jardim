const SAVE_DELAY = 500;

const DEFAULTS = { title: '', blocks: [], color: null, icon: null, offsetX: 0, offsetY: 0 };

const withDefaults = idea => {
  const merged = { ...DEFAULTS, ...idea, parentId: idea.parentId ?? null };
  for (const [field, fallback] of Object.entries(DEFAULTS)) merged[field] ??= fallback;
  return merged;
};

export class Garden {
  #store;
  #onError;
  #ideas = new Map();
  #children = new Map();
  #listeners = new Set();
  #timers = new Map();
  #dirty = new Map();

  constructor(store, onError) {
    this.#store = store;
    this.#onError = onError;
  }

  get size() {
    return this.#ideas.size;
  }

  async load() {
    const ideas = await this.#guard(() => this.#store.list(), 'não foi possível carregar o jardim');
    this.#ideas = new Map((ideas ?? []).map(idea => [idea.id, withDefaults(idea)]));
    this.#changed();
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get(id) {
    return this.#ideas.get(id);
  }

  roots() {
    return this.childrenOf(null);
  }

  childrenOf(parentId) {
    return this.#children.get(parentId) ?? [];
  }

  ancestors(id) {
    const chain = [];
    let current = this.get(id);
    while (current?.parentId) {
      current = this.get(current.parentId);
      if (current) chain.unshift(current);
    }
    return chain;
  }

  descendantIds(id) {
    const ids = [id];
    for (let i = 0; i < ids.length; i++) this.childrenOf(ids[i]).forEach(child => ids.push(child.id));
    return ids;
  }

  isBlank(id) {
    const idea = this.get(id);
    return Boolean(idea) && !idea.title.trim() && !idea.blocks.length && !idea.icon && !this.childrenOf(id).length;
  }

  async add(parentId = null) {
    const draft = { parentId, title: '', blocks: [], position: Date.now() };
    const idea = await this.#guard(() => this.#store.create(draft), 'não foi possível criar a ideia');
    if (!idea) return null;
    this.#ideas.set(idea.id, withDefaults(idea));
    this.#changed();
    return this.get(idea.id);
  }

  edit(id, patch) {
    const idea = this.get(id);
    if (!idea) return;
    Object.assign(idea, patch);
    const fields = this.#dirty.get(id) ?? new Set();
    Object.keys(patch).forEach(field => fields.add(field));
    this.#dirty.set(id, fields);
    this.#emit();
    this.#scheduleSave(id);
  }

  async remove(id) {
    const ids = this.descendantIds(id);
    const blocks = ids.flatMap(ideaId => this.get(ideaId)?.blocks ?? []);
    ids.forEach(ideaId => {
      this.#cancelSave(ideaId);
      this.#dirty.delete(ideaId);
      this.#ideas.delete(ideaId);
    });
    this.#changed();
    await this.#guard(() => this.#store.remove(ids), 'não foi possível excluir');
    this.discardImages(blocks);
  }

  discardImages(blocks) {
    const images = blocks.filter(block => block?.type === 'image');
    if (images.length) this.#guard(() => this.#store.removeImages(images));
  }

  uploadImage(blob) {
    return this.#store.uploadImage(blob);
  }

  imageUrl(block) {
    return this.#store.imageUrl(block);
  }

  flush() {
    return Promise.all([...this.#timers.keys()].map(id => {
      this.#cancelSave(id);
      return this.#save(id);
    }));
  }

  #scheduleSave(id) {
    this.#cancelSave(id);
    this.#timers.set(id, setTimeout(() => this.#save(id), SAVE_DELAY));
  }

  #cancelSave(id) {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
  }

  #save(id) {
    this.#timers.delete(id);
    const idea = this.get(id);
    const fields = this.#dirty.get(id);
    this.#dirty.delete(id);
    if (!idea || !fields?.size) return Promise.resolve();
    const patch = Object.fromEntries([...fields].map(field => [field, idea[field]]));
    return this.#guard(() => this.#store.update(id, patch), 'não foi possível salvar');
  }

  #changed() {
    this.#reindex();
    this.#emit();
  }

  #reindex() {
    this.#children = new Map();
    for (const idea of this.#ideas.values()) {
      const siblings = this.#children.get(idea.parentId) ?? [];
      siblings.push(idea);
      this.#children.set(idea.parentId, siblings);
    }
    this.#children.forEach(siblings => siblings.sort((a, b) => a.position - b.position));
  }

  #emit() {
    this.#listeners.forEach(listener => listener());
  }

  async #guard(action, message) {
    try {
      return await action();
    } catch {
      if (message) this.#onError(message);
      return null;
    }
  }
}
