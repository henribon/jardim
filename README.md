# jardim digital

Mapa mental minimalista de ideias. Cada ideia é um card com textos, links e imagens, e pode ter sub-ideias, que formam o mapa.

Site estático (HTML, CSS e JavaScript puro, sem build), feito para o GitHub Pages. O login e os dados ficam no [Supabase](https://supabase.com) (plano gratuito).

## Como usar

- **+ ideia** ou clique no centro: cria uma ideia principal.
- Clique numa ideia para abrir o card. Lá dá para:
  - escrever um título;
  - adicionar texto, link ou imagem;
  - criar sub-ideias.
- O **+** ao lado de cada ideia no mapa cria uma sub-ideia direto.
- **Colar** dentro do card:
  - um print: vira um bloco de imagem;
  - um link: vira um bloco de link.
- **Arrastar** imagens para o card também funciona.
- Ideia sem título e sem conteúdo some ao fechar o card.
- **Navegação:** arrastar move o mapa; roda do mouse ou pinça dão zoom; ⤢ enquadra tudo.

Sem o Supabase configurado, o app roda em **modo local**: os dados ficam só no navegador, e o selo "local" aparece no topo.

## Configurar o login (uma vez)

1. Crie um projeto em supabase.com.
2. Em **SQL Editor**, rode o conteúdo de `supabase/schema.sql`. Ele cria a tabela `ideas`, o bucket de imagens `ideas` e as regras de acesso, para que só o dono veja os próprios dados.
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**. Assim ninguém mais consegue criar conta.
4. Em **Authentication → Users → Add user**, crie o seu usuário com **seu email** e o **código de acesso** que você escolher como senha (mínimo de 6 caracteres). Marque **Auto Confirm User**.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole em `js/config.js`:

```js
export const config = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA-CHAVE-ANON'
};
```

A chave anon é pública por natureza. Quem protege os dados são as regras do `schema.sql`.

No site, você entra uma vez em cada aparelho com seu email e o código. A sessão fica salva e é renovada sozinha, então você continua logado até clicar em sair.

## Publicar no GitHub Pages

1. Envie o projeto para um repositório no GitHub.
2. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Rodar localmente

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Estrutura

```
index.html
css/app.css
js/main.js                   inicialização e ligação entre as partes
js/garden.js                 modelo das ideias (árvore, edição, salvamento)
js/map-layout.js             cálculo das posições do mapa
js/map-view.js               desenho do mapa, zoom e arrastar
js/card-view.js              card da ideia
js/blocks.js                 blocos de texto, link e imagem
js/image.js                  compressão de imagens antes do envio
js/auth.js                   login no Supabase
js/stores/local-store.js     armazenamento no navegador
js/stores/supabase-store.js  armazenamento no Supabase
supabase/schema.sql          banco, bucket e regras de acesso
```
