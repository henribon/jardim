import { config } from './config.js';
import { Garden } from './garden.js';
import { MapView } from './map-view.js';
import { CardView } from './card-view.js';
import { LocalStore } from './stores/local-store.js';

const $ = id => document.getElementById(id);
const ZOOM_STEP = 1.2;
const TOAST_DURATION = 2600;

const toast = (() => {
  let timer = 0;
  return message => {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), TOAST_DURATION);
  };
})();

async function connect() {
  if (!config.supabaseUrl) return { store: new LocalStore(), signOut: null };
  const [{ Auth }, { SupabaseStore }] = await Promise.all([import('./auth.js'), import('./stores/supabase-store.js')]);
  const auth = new Auth(config);
  const user = (await auth.currentUser()) ?? (await askForLogin(auth));
  return { store: new SupabaseStore(auth.client, user.id), signOut: () => auth.signOut() };
}

function askForLogin(auth) {
  const screen = $('login');
  const form = $('loginForm');
  const error = $('loginError');
  const submit = form.querySelector('button');
  screen.hidden = false;
  form.elements.email.focus();
  return new Promise(resolve => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        const user = await auth.signIn(form.elements.email.value, form.elements.code.value);
        screen.hidden = true;
        resolve(user);
      } catch {
        error.textContent = 'email ou código inválido';
        form.elements.code.select();
      } finally {
        submit.disabled = false;
      }
    });
  });
}

async function start() {
  const { store, signOut } = await connect();
  const garden = new Garden(store, toast);
  $('app').hidden = false;

  const openIdea = id => {
    card.open(id);
    map.select(id);
  };

  const addIdea = async parentId => {
    const idea = await garden.add(parentId);
    if (!idea) return;
    card.open(idea.id, { focusTitle: true });
    map.select(idea.id);
    map.reveal(idea.id);
  };

  const map = new MapView($('map'), garden, {
    onSelect: openIdea,
    onAdd: addIdea,
    onBackground: () => card.close(),
    coveredFrom: () => ($('card').classList.contains('open') ? $('card').offsetLeft : null)
  });

  const card = new CardView($('card'), garden, {
    onNavigate: openIdea,
    onAddChild: addIdea,
    onClose: () => map.select(null),
    onError: toast
  });

  garden.subscribe(() => { $('empty').hidden = garden.size > 0; });

  $('addRoot').addEventListener('click', () => addIdea(null));
  $('zoomIn').addEventListener('click', () => map.zoom(ZOOM_STEP));
  $('zoomOut').addEventListener('click', () => map.zoom(1 / ZOOM_STEP));
  $('zoomFit').addEventListener('click', () => map.fit());
  $('modeBadge').hidden = store.mode !== 'local';

  if (signOut) {
    $('logout').hidden = false;
    $('logout').addEventListener('click', async () => {
      await garden.flush();
      await signOut();
      location.reload();
    });
  }

  addEventListener('keydown', event => {
    if (event.key === 'Escape') card.close();
  });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') garden.flush();
  });

  await garden.load();
  map.render();
}

start();
