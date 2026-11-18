import { h, autosize } from './dom.js';

export const isUrl = value => /^https?:\/\/\S+$/i.test(value.trim());

const renderers = {
  text(block, { change }) {
    const area = h('textarea', {
      rows: 1,
      placeholder: 'escreva…',
      value: block.value ?? '',
      oninput: event => {
        autosize(event.target);
        change({ value: event.target.value });
      }
    });
    requestAnimationFrame(() => autosize(area));
    return area;
  },

  link(block, { change }) {
    const open = h('a', { target: '_blank', rel: 'noopener', textContent: 'abrir ↗' });
    const sync = value => {
      open.hidden = !isUrl(value);
      open.href = isUrl(value) ? value.trim() : '#';
    };
    const input = h('input', {
      type: 'url',
      placeholder: 'cole um link',
      value: block.url ?? '',
      oninput: event => {
        sync(event.target.value);
        change({ url: event.target.value.trim() });
      }
    });
    sync(input.value);
    return [input, open];
  },

  image(block, { imageUrl }) {
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    imageUrl(block).then(src => { img.src = src; }).catch(() => { img.alt = 'imagem indisponível'; });
    return img;
  }
};

export function renderBlock(block, context) {
  const render = renderers[block.type];
  if (!render) return null;
  return h('div', { class: `block ${block.type}` },
    render(block, context),
    h('button', { class: 'remove', textContent: '×', 'aria-label': 'Remover bloco', onclick: context.remove }));
}
