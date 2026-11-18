import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export class Auth {
  #client;

  constructor({ supabaseUrl, supabaseAnonKey }) {
    this.#client = createClient(supabaseUrl, supabaseAnonKey);
  }

  get client() {
    return this.#client;
  }

  async currentUser() {
    const { data } = await this.#client.auth.getSession();
    return data.session?.user ?? null;
  }

  async signIn(email, password) {
    const { data, error } = await this.#client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  signOut() {
    return this.#client.auth.signOut();
  }
}
