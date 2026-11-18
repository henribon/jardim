import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export class Auth {
  #client;

  constructor({ supabaseUrl, supabaseAnonKey }) {
    this.#client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  get client() {
    return this.#client;
  }

  async currentUser() {
    const { data } = await this.#client.auth.getSession();
    return data.session?.user ?? null;
  }

  async signIn(email, code) {
    const { data, error } = await this.#client.auth.signInWithPassword({ email: email.trim(), password: code });
    if (error) throw error;
    return data.user;
  }

  signOut() {
    return this.#client.auth.signOut();
  }
}
