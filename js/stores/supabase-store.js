const TABLE = 'ideas';
const BUCKET = 'ideas';
const COLUMNS = 'id,parent_id,title,blocks,position';
const SIGNED_URL_TTL = 3600;
const RENEW_MARGIN_MS = 60_000;

const toIdea = row => ({ id: row.id, parentId: row.parent_id, title: row.title, blocks: row.blocks, position: row.position });

const toRow = ({ parentId, ...rest }) => (parentId === undefined ? rest : { ...rest, parent_id: parentId });

export class SupabaseStore {
  #client;
  #userId;
  #urls = new Map();

  constructor(client, userId) {
    this.#client = client;
    this.#userId = userId;
  }

  get mode() {
    return 'cloud';
  }

  async list() {
    const { data, error } = await this.#client.from(TABLE).select(COLUMNS).order('position');
    if (error) throw error;
    return data.map(toIdea);
  }

  async create(draft) {
    const { data, error } = await this.#client.from(TABLE).insert(toRow(draft)).select(COLUMNS).single();
    if (error) throw error;
    return toIdea(data);
  }

  async update(id, patch) {
    const { error } = await this.#client.from(TABLE).update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  async remove(ids) {
    const { error } = await this.#client.from(TABLE).delete().in('id', ids);
    if (error) throw error;
  }

  async removeImages(blocks) {
    const paths = blocks.map(block => block.path).filter(Boolean);
    if (!paths.length) return;
    const { error } = await this.#client.storage.from(BUCKET).remove(paths);
    if (error) throw error;
    paths.forEach(path => this.#urls.delete(path));
  }

  async uploadImage(blob) {
    const extension = blob.type.split('/')[1]?.replace('svg+xml', 'svg') || 'jpg';
    const path = `${this.#userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await this.#client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
    if (error) throw error;
    return { type: 'image', path };
  }

  async imageUrl({ path }) {
    const cached = this.#urls.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await this.#client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (error) throw error;
    this.#urls.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL * 1000 - RENEW_MARGIN_MS });
    return data.signedUrl;
  }
}
