# Task: Tela de Login

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` neste repo). Não
toca `backend/`. Especificação já fornecida integralmente pelo usuário — sem
etapa de `spec`.

## Estado atual verificado (antes do plano)

- `frontend/package.json`: já tem `@supabase/supabase-js` ^2.112.4; **não** tem
  `react-router-dom` nem nenhum router.
- `frontend/src/`: só existe o scaffold default do Vite (`App.tsx` com
  contador/links, `App.css`, `index.css`, `main.tsx`, `assets/hero.png`,
  `assets/react.svg`, `assets/vite.svg`). Nenhum componente de formulário,
  input ou modal reaproveitável existe ainda — este é o primeiro feature real
  do projeto.
- `frontend/src/index.css`: usa custom properties (`--text`, `--bg`,
  `--accent`, `--border`, etc.) e não tem Tailwind. Padrão a manter (CSS puro).
- Não existe `frontend/src/vite-env.d.ts`, nem `.env`/`.env.example`.
- `frontend/.gitignore` (linhas 14-15) ignora **tanto** `.env` quanto
  `.env.example` — isso impede o `.env.example` de ser versionado, o que
  normalmente é indesejado (o exemplo deve ir pro git; só o `.env` real não).
- Assets já existentes em `frontend/public/`: `imagem-tela-login.jpg` e
  `logo.jpg` — devem ser referenciados via caminho absoluto de `public/`
  (ex. `/imagem-tela-login.jpg`), não importados de `src/assets`.
- Nenhum `.claude/tasks/tela-login/spec.md` existe — plano feito direto a
  partir do pedido já esclarecido.

## Plano — Frontend

1. frontend-developer — ✅ concluído

   **Resumo da implementação**
   - Instalado `react-router-dom` (`^7.18.3`).
   - Criados `frontend/.env.example` (placeholders vazios) e
     `frontend/src/vite-env.d.ts`; removida a linha `.env.example` do
     `.gitignore` (mantendo `.env` ignorado).
   - Criado `frontend/src/lib/supabaseClient.ts` (client via
     `import.meta.env`, com `console.error` — sem logar valores — caso as env
     vars estejam ausentes).
   - `frontend/src/main.tsx` envolvido em `<BrowserRouter>` e importando o
     novo `frontend/src/styles/theme.css`.
   - `frontend/src/App.tsx` reescrito só com as rotas `/login` e fallback
     `*` → `Navigate to="/login"`; scaffold default do Vite removido por
     completo (`App.css` apagado, imports de hero/react/vite removidos).
   - Paleta navy/dourado extraída visualmente do `frontend/public/logo.jpg`
     e adicionada em `frontend/src/styles/theme.css`
     (`--color-navy: #16305c`, `--color-navy-hover: #0e2044`,
     `--color-gold: #c9a227`, `--color-gray-light: #f3f4f6`) — extração feita
     por inspeção visual do asset, não há ferramenta de leitura de pixel
     disponível no ambiente (sem Python/ImageMagick/sharp instalados).
   - Criados `frontend/src/components/FormField/{FormField.tsx,.css}`
     (label+input reutilizável, com estado de erro inline e `forwardRef`
     para foco programático) — reaproveitado em `LoginPage` e
     `EsqueciSenhaModal`.
   - Criados `frontend/src/pages/LoginPage/{LoginPage.tsx,.css}`: layout
     split-screen (`/imagem-tela-login.jpg` à esquerda em card com borda
     dourada curva; formulário centralizado à direita com `/logo.jpg` como
     cabeçalho), sem login social nem link de cadastro. Estados tratados:
     validação client-side (campos obrigatórios + formato de e-mail),
     loading (botão "Entrando...", inputs desabilitados, sem double-submit)
     e erro genérico "E-mail ou senha inválidos" (não diferencia e-mail
     inexistente de senha incorreta). Redirecionamento pós-login deixado
     como `// TODO` comentado, sem navegar para rota inexistente.
   - Criados
     `frontend/src/components/EsqueciSenhaModal/{EsqueciSenhaModal.tsx,.css}`:
     modal controlado `open`/`onClose`, ciclo `idle → loading → success |
     error`, fecha via X/clique fora/ESC sempre resetando o estado interno,
     mensagem de sucesso que não confirma/nega existência do e-mail
     ("Se o e-mail existir em nossa base, enviamos um link..."), foco
     movido para o input de e-mail ao abrir, `aria-modal`/`role="dialog"`.
   - Verificado com `npx tsc -b`, `npm run build` e `npm run lint` — todos
     sem erros.

   **Dependências**
   - Instalar `react-router-dom` (única rota pública `/login` por enquanto,
     mas o projeto vai precisar de router de qualquer forma).

   **Ambiente / configuração**
   - Criar `frontend/.env.example` com `VITE_SUPABASE_URL=` e
     `VITE_SUPABASE_ANON_KEY=` (placeholders vazios, sem valor real).
   - Editar `frontend/.gitignore`: remover a linha `.env.example` (mantendo
     `.env` ignorado), para que o exemplo fique versionado.
   - Criar `frontend/src/vite-env.d.ts` com
     `/// <reference types="vite/client" />` e uma interface `ImportMetaEnv`
     tipando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
   - Criar `frontend/src/lib/supabaseClient.ts` exportando o client
     (`createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`),
     com uma checagem simples (throw/console.error, sem logar os valores) caso
     as env vars estejam ausentes em runtime.

   **Roteamento**
   - `frontend/src/main.tsx`: envolver `<App />` em `<BrowserRouter>`.
   - `frontend/src/App.tsx`: remover por completo o conteúdo default do
     scaffold Vite (contador, hero, seções "Documentation"/"Connect with us",
     imports de `App.css`, `hero.png`, `react.svg`, `vite.svg`) e substituir
     por definição de rotas:
     - `<Route path="/login" element={<LoginPage />} />`
     - `<Route path="*" element={<Navigate to="/login" replace />} />`
       (fallback simples — nenhuma outra rota existe ainda no projeto).
   - Não é necessário apagar os arquivos de asset do scaffold, só remover os
     imports não usados (evitar erro de lint/build por import morto).

   **Componentes/página novos** (nada disso existe hoje, então tudo nasce
   aqui — ficam disponíveis para reaproveitamento futuro):
   - `frontend/src/pages/LoginPage/LoginPage.tsx` — página com layout
     split-screen:
     - painel esquerdo: `<img src="/imagem-tela-login.jpg" ... />` dentro de
       um container com borda curva (card).
     - painel direito: formulário centralizado verticalmente, com
       `<img src="/logo.jpg" ... />` centralizado como cabeçalho do
       formulário (acima dos campos, não no topo da página).
     - campos e-mail/senha arredondados, fundo levemente acinzentado, label
       acima (ou placeholder — decisão de implementação).
     - botão "Entrar".
     - link "Esqueci minha senha" que abre `EsqueciSenhaModal`.
     - **sem** botões de login social e **sem** link de cadastro/"Sign up"
       (spec explícita — plataforma é single-tenant, sem auto-cadastro).
   - `frontend/src/pages/LoginPage/LoginPage.css` — CSS puro seguindo o
     padrão de custom properties já usado em `src/index.css` (não introduzir
     Tailwind nem outra lib de estilo).
   - `frontend/src/components/EsqueciSenhaModal/EsqueciSenhaModal.tsx` —
     modal controlado (`open`/`onClose`), com campo de e-mail e submit
     chamando `supabase.auth.resetPasswordForEmail(email)`.
   - `frontend/src/components/EsqueciSenhaModal/EsqueciSenhaModal.css`.
   - Um componente `FormField` (label+input) reaproveitável entre
     `LoginPage` e `EsqueciSenhaModal` é opcional — avaliar se compensa para
     só 3 campos ao todo; não é obrigatório para este escopo.

   **Papéis com acesso**
   - `/login` é rota pública, sem autenticação — acessível a qualquer
     visitante não logado. Não há diferenciação de conteúdo por papel
     (`admin`/`gestor_rh`/`colaborador`) nesta tela, pois o papel só é
     conhecido depois do login.
   - Após login bem-sucedido: deixar um `// TODO: redirecionar conforme o
     papel (role) do colaborador quando as rotas protegidas existirem` no
     código. Não navegar para uma rota inexistente — não criar página de
     destino "stub" fora do escopo desta task.

   **Integrações consumidas** (SDK Supabase Auth direto, não é endpoint REST
   do `apps/api`):
   - `supabase.auth.signInWithPassword({ email, password })`
   - `supabase.auth.resetPasswordForEmail(email)`

   **Estados a tratar — login (LoginPage)**
   - Carregando: botão "Entrar" desabilitado + indicador visual
     (spinner/texto "Entrando..."), inputs desabilitados durante o submit.
   - Erro: mensagem genérica de erro (ex. "E-mail ou senha inválidos") sem
     diferenciar "e-mail não existe" de "senha incorreta" (evita enumeração
     de contas).
   - Validação client-side mínima antes de chamar a API (campos obrigatórios
     preenchidos, formato de e-mail válido) — não substitui a validação do
     Supabase.
   - Vazio: não aplicável (é um formulário, não uma listagem).

   **Estados a tratar — recuperação de senha (EsqueciSenhaModal)**
   - `idle -> loading -> success | error`.
   - Loading: desabilita input e botão de envio do modal, mostra indicador.
   - Success: substitui o formulário por mensagem de confirmação (algo como
     "Se o e-mail existir, enviamos um link de redefinição") — mensagem que
     não confirma nem nega a existência do e-mail no sistema, por segurança.
     Oferece botão para fechar o modal.
   - Error: mensagem de erro inline (e-mail inválido, falha de rede), mantém
     o modal aberto e o e-mail digitado.
   - Fechar o modal (X, clique fora ou ESC) deve resetar o estado interno
     para a próxima abertura.

   **Paleta de cores** (extraída do logo em `frontend/public/logo.jpg` —
   inspecionar o asset real antes de fixar os hex, este plano não prescreve
   valores):
   - Adicionar novas custom properties (em `src/index.css` ou em um arquivo
     de tema dedicado, ex. `src/styles/theme.css` importado em `main.tsx`),
     sem quebrar as existentes:
     - cor primária navy (textos de destaque, botão "Entrar").
     - variação de navy para hover/estado ativo do botão.
     - cor de acento dourado (bordas de foco, hover de links, borda do
       painel curvo esquerdo).
     - cinza claro para fundo dos inputs.
   - Não usar a paleta verde da imagem de referência de layout — só a
     estrutura/layout foi usada como inspiração; as cores vêm do logo.

2. frontend-codereviewer

   Pontos de atenção específicos para o revisor conferir:
   - `.env` real não foi commitado; apenas `.env.example` (com placeholders
     vazios) foi versionado, e a entrada `.env.example` foi de fato removida
     do `.gitignore`.
   - A anon key/URL do Supabase não estão hardcoded em nenhum arquivo fora de
     `import.meta.env.*` (sempre via env var, nunca valor literal no código).
   - Mensagem de erro do login não diferencia "e-mail não existe" de "senha
     errada" (evita enumeração de contas); mensagem de sucesso do
     "esqueci minha senha" também não confirma/nega existência do e-mail.
   - Estados de carregando/erro/sucesso realmente tratados nos dois fluxos
     (login e reset de senha) — botão desabilitado durante submit, sem
     double-submit possível.
   - Nenhum botão de login social nem link de cadastro/"Sign up" foi
     adicionado (violaria a spec — plataforma sem auto-cadastro).
   - Rota `/login` não exige autenticação prévia e não faz nenhuma checagem
     de papel (`admin`/`gestor_rh`/`colaborador`) — isso só é decidido após o
     login.
   - Redirecionamento pós-login está de fato como TODO comentado, sem
     navegar para rota inexistente nem criar página "stub" fora do escopo.
   - Assets referenciados via caminho de `public/` (`/logo.jpg`,
     `/imagem-tela-login.jpg`), não importados de `src/assets`.
   - Estilo consistente com o padrão CSS puro já existente no projeto (sem
     introdução de Tailwind ou outra lib de UI não combinada); paleta usa
     navy/dourado extraídos do logo, não a paleta verde da referência visual.
   - Acessibilidade básica: labels associados aos inputs (via `htmlFor`/`id`
     ou `aria-label`), modal com gerenciamento de foco razoável e botão de
     fechar acessível por teclado.
   - Conteúdo default do scaffold Vite (`App.tsx` antigo, `App.css`) foi
     removido por completo, sem imports mortos nem CSS morto aplicado à
     tela de login.

## Revisão

Arquivos lidos: `.env.example`, `.gitignore`, `src/vite-env.d.ts`,
`src/lib/supabaseClient.ts`, `src/main.tsx`, `src/App.tsx`,
`src/pages/LoginPage/{LoginPage.tsx,LoginPage.css}`,
`src/components/FormField/{FormField.tsx,FormField.css}`,
`src/components/EsqueciSenhaModal/{EsqueciSenhaModal.tsx,EsqueciSenhaModal.css}`,
`src/styles/theme.css`, `src/index.css`, `package.json`.

**Sem achados críticos.** Não há vazamento de identidade (tela pública, sem
listagem de avaliadores) nem problema de controle de acesso (rota `/login`
não tem por que checar papel). Confirmado especificamente:
- `.env` real não foi commitado (não existe no repo); só `.env.example` com
  placeholders vazios está versionado; `.gitignore` mantém `.env` ignorado e
  não ignora mais `.env.example`.
- Nenhum valor literal de URL/anon key hardcoded — `supabaseClient.ts` só usa
  `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, e o
  `console.error` de fallback não loga os valores.
- Mensagem de erro do login ("E-mail ou senha inválidos.") é única para
  e-mail inexistente e senha errada — não há branch condicional no código que
  diferencie os dois casos. Mensagem de sucesso do reset de senha ("Se o
  e-mail existir em nossa base, enviamos um link...") também não confirma/nega
  a existência do e-mail, e é exibida mesmo quando `resetPasswordForEmail`
  não retorna erro (comportamento correto, já que o próprio Supabase não
  distingue os dois casos por padrão).
- Loading tratado nos dois fluxos com inputs e botão desabilitados durante o
  submit; `LoginPage` ainda tem uma guarda explícita `if (loading) return` no
  início do `handleSubmit` como defesa extra contra double-submit.
- Nenhum botão de login social nem link de cadastro/"Sign up" foi
  adicionado.
- Redirecionamento pós-login é de fato só um `// TODO` comentado, sem
  `navigate`/`Navigate` para rota inexistente.
- Assets referenciados via `/logo.jpg` e `/imagem-tela-login.jpg` (pasta
  `public/`), não importados de `src/assets`.
- Labels associados via `htmlFor`/`id` em `FormField`; modal usa
  `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, fecha por ESC/clique
  fora/X e move foco para o input de e-mail ao abrir.
- `App.tsx`/`App.css` do scaffold Vite removidos por completo, sem imports
  mortos.

### Deveria corrigir

1. **CSS residual do scaffold ainda afeta a tela de login.** A limpeza do
   scaffold cobriu `App.tsx`/`App.css`, mas `src/index.css` (também
   scaffold) não foi revisado. A regra `#root { width: 1126px; max-width:
   100%; margin: 0 auto; text-align: center; border-inline: 1px solid
   var(--border); ... }` continua valendo, porque `LoginPage` é renderizada
   dentro desse mesmo `#root`. Efeito prático: a tela split-screen fica
   limitada a 1126px de largura (ao invés de ocupar a viewport toda),
   ganha uma borda vertical de 1px nas laterais de toda a página, e
   elementos que não sobrescrevem `text-align` (`.modal__title`,
   `.modal__description`, `.modal__success p`) ficam centralizados por
   herança em vez de por decisão explícita do componente. Isso contraria o
   próprio item do checklist "conteúdo default do scaffold Vite removido
   por completo... sem CSS morto aplicado à tela de login" — só não foi
   percebido porque o item foi interpretado apenas como `App.tsx`/`App.css`.
2. **Regra órfã em `src/index.css`:** `#social .button-icon { filter:
   invert(1) brightness(2); }` (dentro do bloco `prefers-color-scheme:
   dark`) referencia um seletor `#social` que não existe mais em nenhum
   componente — é CSS morto do scaffold default que deveria ter sido
   removido junto com a limpeza.

### Sugestões

1. `EsqueciSenhaModal` não implementa focus trap: com o modal aberto, Tab
   pode levar o foco para elementos por trás do overlay; e ao fechar, o
   foco não retorna ao botão "Esqueci minha senha" que abriu o modal.
   Atende ao mínimo pedido no plano (foco inicial no input de e-mail), mas
   poderia ser reforçado.
2. Em `FormField`, quando `error` é passado (caso do modal), o `<input>`
   recebe `aria-invalid` mas não `aria-describedby` apontando para o
   `<span role="alert">` do erro — a associação formal ajudaria leitores de
   tela, além do anúncio via live region que já ocorre.
3. `EsqueciSenhaModal` usa `// eslint-disable-next-line
   react-hooks/exhaustive-deps` no efeito de foco/ESC (deps `[open]`) em vez
   de estabilizar `handleClose` (ex. `useCallback`) e incluí-lo nas deps.
   Não é um bug hoje (o `onClose` recebido de `LoginPage` é sempre um
   wrapper equivalente de `setModalOpen(false)`), mas é um padrão frágil que
   pode esconder um bug real se a lógica de `onClose` mudar no futuro.

**Conclusão:** nenhum achado crítico — nada bloqueia a progressão para a
etapa de testes. Os dois itens de "Deveria corrigir" são de CSS/layout
(scaffold não totalmente limpo) e não têm relação com segurança, controle de
acesso ou vazamento de identidade.

### Correções aplicadas (pós-revisão)

- `src/index.css`: removida a regra `#root { width: 1126px; max-width: 100%;
  margin: 0 auto; text-align: center; border-inline: 1px solid var(--border);
  ...; box-sizing: border-box; }`. Mantido só `#root { min-height: 100svh;
  display: flex; flex-direction: column; }` (sem largura fixa, sem borda
  lateral, sem `text-align: center` herdado). `.login-page` já define seu
  próprio `min-height: 100svh` e `display: flex`, então o layout split-screen
  agora ocupa a viewport corretamente e `.modal__title`/`.modal__description`/
  `.modal__success p` deixam de herdar centralização de texto indevida.
- `src/index.css`: removida a regra órfã `#social .button-icon { filter:
  invert(1) brightness(2); }` dentro de `@media (prefers-color-scheme: dark)`
  (seletor `#social` não existe em nenhum componente).
- Verificado com `npx tsc -b` e `npm run build` — ambos sem erros.

### Refatoração pontual: migração para Tailwind CSS + MUI

Ajuste posterior (fora do fluxo planejamento/code review, a pedido direto):
removido CSS puro de `LoginPage` e `EsqueciSenhaModal`, reimplementado com
Tailwind CSS + Material UI, preservando toda a lógica/estados existentes.

- Instalado `tailwindcss` + `@tailwindcss/vite` e `@mui/material` +
  `@emotion/react` + `@emotion/styled`. Plugin do Tailwind adicionado em
  `vite.config.ts`; `@import 'tailwindcss';` adicionado no topo de
  `src/index.css` (arquivo global existente, mantido para as custom
  properties `--text`/`--bg`/etc. que não fazem parte deste escopo).
- Criado `src/styles/theme.ts` (`createTheme` do MUI) com a paleta navy
  (`#16305c` primary, `#0e2044` como `primary.dark`) e dourado (`#c9a227`
  secondary) extraída do `theme.css` removido, mais overrides de
  `MuiButton`/`MuiOutlinedInput` para o visual arredondado (pill) já usado
  na tela. Reaproveitável em telas futuras.
- `src/main.tsx`: removido o import de `./styles/theme.css` (apagado);
  árvore agora envolvida em `<ThemeProvider theme={theme}>` +
  `<CssBaseline />` (dentro de `<StrictMode>`, por fora do `<BrowserRouter>`).
- `LoginPage.tsx`: layout split-screen (painéis, breakpoint de 900px que
  esconde o painel esquerdo, larguras/espaçamentos) convertido para classes
  Tailwind puras (`hidden min-[900px]:flex`, `flex-1`, etc.), sem
  `LoginPage.css`. Inputs de e-mail/senha viram MUI `TextField`; botão
  "Entrar" vira MUI `Button variant="contained" color="primary"`; link
  "Esqueci minha senha" vira `Button variant="text"` com hover dourado via
  `sx`. Lógica de validação, mensagem genérica de erro, loading e chamada ao
  Supabase preservadas sem alteração.
- `EsqueciSenhaModal.tsx`: convertido para MUI `Dialog` (`DialogTitle` +
  `IconButton` de fechar posicionado em `sx`, `DialogContent`,
  `DialogActions`). `onClose` do `Dialog` cobre nativamente ESC e clique
  fora (removido o listener manual de `keydown` e o handler de
  `onMouseDown` do overlay). Foco automático no campo de e-mail via
  `slotProps.transition.onEntered`. Estados `idle/loading/success/error`,
  textos e comportamento de não revelar existência do e-mail preservados
  sem alteração.
- `FormField.tsx`/`FormField.css` removidos: era usado só por esses dois
  componentes (confirmado via busca por `FormField` em `src/`) e deixou de
  ser necessário após a troca dos inputs por MUI `TextField`.
- Removidos: `src/styles/theme.css` (substituído por `theme.ts`),
  `LoginPage.css`, `EsqueciSenhaModal.css`, `FormField.css`, e o diretório
  `FormField/` inteiro — sem imports órfãos remanescentes (verificado via
  busca por `.css` em `src/`, só resta o `index.css` global).
- Verificado com `npm run build` (`tsc -b && vite build`) e `npm run lint`
  — ambos sem erros.
