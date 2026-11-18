const STORAGE_KEY = 'jardim:ideas';

export class LocalStore {
  get mode() {
    return 'local';
  }

  async list() {
    return this.#read();
  }

  async create(draft) {
    const idea = { id: crypto.randomUUID(), ...draft };
    this.#write([...this.#read(), idea]);
    return { ...idea };
  }

  async update(id, patch) {
    this.#write(this.#read().map(idea => (idea.id === id ? { ...idea, ...patch } : idea)));
  }

  async remove(ids) {
    const removed = new Set(ids);
    this.#write(this.#read().filter(idea => !removed.has(idea.id)));
  }

  async removeImages() {}

  async uploadImage(blob) {
    return { type: 'image', src: await toDataUrl(blob) };
  }

  async imageUrl(block) {
    return block.src;
  }

  #read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
    } catch {
      return [];
    }
  }

  #write(ideas) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }
}

function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
