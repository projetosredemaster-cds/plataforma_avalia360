# Task: Cadastro de colaboradores e equipes — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário — sem
etapa de `spec`. Este plano não toca `backend/`; onde depende de contrato de
API ainda não definido por um `task-backend.md`, isso é declarado
explicitamente como pendência de alinhamento, não como suposição silenciosa.

## Estado atual verificado (antes do plano)

- `frontend/src/App.tsx`: só define `<Route path="/login" .../>` e um
  fallback `*` → `Navigate to="/login"`. Nenhuma outra rota existe.
- Não existe **nenhum** dos seguintes, em lugar nenhum de `frontend/src/`:
  contexto/hook de autenticação, guard de rota, layout/shell com menu,
  camada de chamada à API REST do `backend/` (só existe
  `frontend/src/lib/supabaseClient.ts`, que é o client do Supabase Auth —
  não um wrapper de `fetch` para o backend), componente de tabela, componente
  de dialog de confirmação, utilitário de máscara/validação de CPF.
  **Tudo isso nasce nesta task.**
- `frontend/src/lib/supabaseClient.ts` já existe e expõe `supabase` — deve
  ser reaproveitado para obter a sessão/JWT (`supabase.auth.getSession()`,
  `supabase.auth.onAuthStateChange`), não recriado.
- `frontend/src/styles/theme.ts` já existe (`createTheme` MUI, paleta navy
  `#16305c`/`#0e2044` primary, dourado `#c9a227` secondary, botões e inputs
  em formato pill). Deve ser reaproveitado — não criar um segundo tema.
- `frontend/src/vite-env.d.ts` só tipa `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`. Precisa ganhar `VITE_API_URL` (base da API REST
  do `backend/`) — hoje não existe nenhuma env var para isso.
  `frontend/.env.example` também precisa ganhar `VITE_API_URL=`.
- `frontend/package.json`: dependências atuais são `@mui/material`,
  `@emotion/react`/`styled`, `@supabase/supabase-js`, `react-router-dom`,
  Tailwind (`tailwindcss` + `@tailwindcss/vite`). **Não há** `@mui/x-data-grid`
  nem lib de máscara (`react-imask`, `imask` etc.) instalada. O plano abaixo
  evita depender delas: tabela via `Table`/`TablePagination` do próprio
  `@mui/material` (já instalado) e máscara de CPF implementada manualmente
  (função utilitária pura), para não introduzir dependência nova sem
  necessidade clara.
- `LoginPage`/`EsqueciSenhaModal` (únicas telas existentes) já seguem o
  padrão Tailwind + MUI e servem de referência de estilo (`TextField`,
  `Button`, `Dialog`, mensagens de erro via `Typography role="alert"`/MUI
  `Alert`).
- Não existe `.claude/tasks/cadastro-colaboradores-equipes/spec.md` nem
  `task-backend.md` no repo no momento deste plano. Os endpoints abaixo são o
  contrato que o **frontend precisa** que a API exponha — se
  `planejamento-backend` definir nomes/formatos diferentes, o
  `frontend-developer` deve ajustar a camada de API (`apiClient`/hooks) para
  bater com o que existir de fato, sem alterar o comportamento de UI descrito
  aqui.

## Contrato de API esperado pelo frontend (a confirmar com o plano de backend)

Base: `import.meta.env.VITE_API_URL` (nova env var). Toda chamada autenticada
envia `Authorization: Bearer <access_token>` obtido de
`supabase.auth.getSession()`.

- `GET /api/auth/me` → `{ id, nome_completo, email, papel, ativo }` do
  colaborador correspondente ao usuário autenticado (resolvido no backend via
  `colaboradores.usuario_auth_id`). 401 se sessão inválida; 404/403 se o
  usuário Supabase não corresponde a nenhum colaborador ativo.
- `GET /api/colaboradores?busca=&status=ativo|inativo|todos&page=&pageSize=`
  → `{ dados: [ { id, nome_completo, email, papel, cargo, equipe_nome,
  gestor_nome, ativo } ], total }`. **`equipe_nome`/`gestor_nome` já vêm
  resolvidos pelo backend** — o frontend só exibe essas strings, nunca faz
  chamada extra para "resolver" nome de equipe/gestor a partir de um id.
- `GET /api/colaboradores/:id` → detalhe para o formulário de edição,
  precisa incluir os **ids** além dos nomes (para popular os `Select`):
  `{ id, nome_completo, email, cpf, papel, cargo, ativo, equipe_id,
  equipe_nome, gestor_id, gestor_nome }`.
- `POST /api/colaboradores` / `PUT /api/colaboradores/:id` → body
  `{ nome_completo, email, cpf, papel, cargo, equipe_id | null,
  gestor_id | null, ativo }`. Erros esperados: `422` (validação de campo,
  formato `{ erro: string, campo?: string }` ou equivalente — a confirmar) e
  `409` (CPF ou e-mail duplicado). O frontend deve exibir a mensagem vinda da
  API associada ao campo (`cpf`/`email`) quando o backend indicar o campo, e
  nunca abafar um 409 num toast genérico de "erro ao salvar".
- `PATCH /api/colaboradores/:id` com `{ ativo: false }` / `{ ativo: true }` →
  inativar/reativar (nunca exclusão física — a listagem continua mostrando o
  colaborador, só muda o status).
- `GET /api/equipes` → `[ { id, nome } ]` (usado tanto na tela de equipes
  quanto no `Select` de equipe do formulário de colaborador).
- `POST /api/equipes` / `PUT /api/equipes/:id` → `{ nome }`.
- `DELETE /api/equipes/:id` → excluir; espera-se `409` quando a equipe ainda
  tem colaboradores vinculados — o frontend deve exibir essa mensagem
  literal da API no dialog de confirmação, não interpretar/recalcular
  vínculos no cliente.
- Opções para o `Select` de gestor: **pendência a alinhar com o backend** —
  não existe hoje um endpoint "leve" de opções. Solução interina proposta
  neste plano: reaproveitar `GET /api/colaboradores?status=ativo&pageSize=500`
  (sem paginação visível, só para popular o select) filtrando no cliente o
  próprio colaborador em edição (evitar auto-referência). Se o backend
  disponibilizar um endpoint dedicado (`GET /api/colaboradores/opcoes` ou
  similar) durante a implementação, o `frontend-developer` deve preferir esse
  endpoint e não a solução interina.

## Plano — Frontend

1. frontend-developer — ✅ concluído

   **Aviso ao revisor: contrato de API substituído**

   Este plano foi escrito antes de existir `task-backend.md` e assumiu um
   contrato em `snake_case`, com paginação/filtros no servidor e
   `PATCH /api/colaboradores/:id` para inativar/reativar. O backend real
   (`.claude/tasks/cadastro-colaboradores-equipes/task-backend.md`) implementa
   um contrato diferente, e a implementação seguiu **o contrato real do
   backend**, não o descrito nas seções 1.1–1.6 abaixo. Principais divergências:

   - Casing **camelCase** em todo request/response (`nomeCompleto`, `equipeId`,
     `gestorId`, `criadoEm`, etc.), não `snake_case`.
   - `GET /api/colaboradores` retorna **array puro**, sem paginação nem query
     params de busca/status — busca, filtro de status e paginação da listagem
     são 100% client-side sobre o array completo.
   - `GET /api/colaboradores/:id` e itens da listagem trazem `equipe` e
     `gestor` como **objetos** (`{ id, nome }` / `{ id, nomeCompleto }`), não
     como strings `equipe_nome`/`gestor_nome`.
   - Inativar/reativar é `PATCH /api/colaboradores/:id/status` (não
     `PATCH /api/colaboradores/:id`).
   - `POST`/`PUT` de colaborador **não** incluem `ativo` no body — o campo é
     gerenciado só pela rota `/status`, então o formulário de
     criar/editar não tem campo `ativo`.
   - `POST /api/colaboradores` pode devolver `emailDefinicaoSenhaEnviado: false`
     — tratado na UI como aviso, não como erro.
   - Erros da API: código semântico (`CPF_INVALIDO`, `CPF_DUPLICADO`,
     `EMAIL_DUPLICADO`, `EMAIL_JA_REGISTRADO_AUTH`, etc.) mapeado para os
     campos `cpf`/`email` do formulário. O formato exato do envelope do corpo
     de erro ficou ambíguo entre duas fontes (a correção de contrato recebida
     descreve `{ codigo, mensagem }` na raiz; `task-backend.md` mostra
     `{ erro: { codigo, mensagem } }`) — `apiClient.ts` faz parsing defensivo
     dos dois formatos (ver resumo abaixo) em vez de assumir um único.
   - O comportamento de UI (estados de carregando/vazio/erro, papéis,
     mensagens do `Alert` de papel, CPF mascarado/validado, erro de
     CPF/e-mail inline) segue exatamente o que este plano descreve — só o
     transporte HTTP (nomes de campo, rotas, paginação) mudou.

   **Resumo da implementação**

   - **Infraestrutura**
     - `frontend/.env.example` e `frontend/src/vite-env.d.ts`: adicionada
       `VITE_API_URL`.
     - `frontend/src/lib/apiClient.ts` (novo): `apiFetch<T>(path, options)` —
       injeta `Authorization: Bearer <token>` via
       `supabase.auth.getSession()` a cada chamada (não cacheado), serializa
       `body` em JSON, e lança `ApiError { status, mensagem, codigo? }` em
       respostas não-2xx. Faz parsing defensivo do corpo de erro, aceitando
       tanto `{ codigo, mensagem }` quanto `{ erro: { codigo, mensagem } }`
       (ver divergência de contrato acima). Erro de rede (fetch falhou) vira
       `ApiError(status: 0, ...)` com mensagem genérica. Só transporte HTTP —
       nenhuma lógica de agregação/anonimização.
     - `frontend/src/types/colaborador.ts` (novo): tipos `Papel`, `Equipe`,
       `Colaborador` compartilhados entre services e páginas.
     - `frontend/src/services/colaboradoresService.ts` e
       `equipesService.ts` (novos): funções finas sobre `apiFetch` para cada
       rota (`listar`, `buscarPorId`, `criar`, `atualizar`,
       `atualizarStatusColaborador`/`removerEquipe`, etc.).
     - `frontend/src/context/AuthContext.tsx` (novo) + `useAuth()`: estado
       `carregando | autenticado | nao_autenticado | erro`; resolve a sessão
       do Supabase e confirma o papel via `GET /api/auth/me`; assina
       `supabase.auth.onAuthStateChange`; usa um contador de versão
       (`versaoRef`) para descartar respostas de resoluções obsoletas (evita
       condição de corrida se a sessão mudar durante uma chamada em
       andamento). `useAuth` reexportado do mesmo arquivo do `AuthProvider`
       de propósito (ver nota de lint abaixo).
     - `frontend/src/components/RotaProtegida/RotaProtegida.tsx` (novo):
       guard de rota — `carregando` → spinner tela cheia; `nao_autenticado` →
       `Navigate to="/login"`; `erro` → mensagem + "Tentar novamente"; papel
       fora da lista permitida → `AcessoNegadoPage` (sem redirecionar);
       senão → `<Outlet/>`. Nenhuma chamada de dados das telas filhas
       dispara antes disso resolver, porque as rotas protegidas só montam
       dentro do `<Outlet/>`.
     - `frontend/src/pages/AcessoNegadoPage/AcessoNegadoPage.tsx` (novo).
     - `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (novo):
       `AppBar` com links "Colaboradores"/"Equipes" e botão "Sair", reaproveita
       `theme.ts`.
     - `frontend/src/main.tsx`: `<App/>` envolvido em `<AuthProvider>` dentro
       do `<BrowserRouter>`, fora do `<ThemeProvider>`/`<CssBaseline>`
       existentes (ordem preservada).
     - `frontend/src/App.tsx`: rotas adicionadas conforme a seção 1.1 do
       plano original (`/login`, `/acesso-negado`,
       `RotaProtegida papeis={['admin','gestor_rh']}` envolvendo
       `PainelAdminLayout` com `/colaboradores`, `/colaboradores/novo`,
       `/colaboradores/:id/editar`, `/equipes`), fallback `*` mantido para
       `/login`.
   - **CPF**: `frontend/src/utils/cpf.ts` (novo) — `normalizarCpf`,
     `formatarCpf` (máscara progressiva `000.000.000-00`) e `cpfValido`
     (11 dígitos + rejeita sequência repetida + dígitos verificadores mod 11),
     funções puras sem dependência nova. Comentário explícito de que é só
     gate de UX — erro `CPF_INVALIDO`/`CPF_DUPLICADO` da API sempre é exibido
     mesmo com validação client-side passando.
   - **Componentes reaproveitáveis**: `ConfirmDialog` (dialog de confirmação
     genérico com `erro?` exibido inline, usado em inativar/reativar
     colaborador e excluir equipe) e `TabelaEstado` (linhas de
     `Skeleton`/erro com "Tentar novamente"/mensagem de vazio, reaproveitado
     nas duas listagens).
   - **`ColaboradoresListPage`**: busca (nome/e-mail, debounce 400ms) e filtro
     de status (Ativos/Inativos/Todos, default Ativos) 100% client-side sobre
     o array completo de `GET /api/colaboradores`; paginação também
     client-side via `TablePagination` (`slice` do array filtrado — não há
     paginação no backend). Colunas: nome, e-mail, papel, cargo,
     `equipe?.nome`, `gestor?.nomeCompleto`, chip de status. Ações por linha:
     "Editar" (navega) e "Inativar"/"Reativar" (abre `ConfirmDialog`, chama
     `PATCH /api/colaboradores/:id/status`). Lê `location.state` (definido
     pelo formulário após salvar) para exibir `Snackbar` de
     sucesso/aviso transitório e limpa o state da rota logo em seguida
     (não reaparece em refresh/voltar).
   - **`ColaboradorFormPage`**: usado em `/colaboradores/novo` e
     `/colaboradores/:id/editar`; em edição, carrega `GET
     /api/colaboradores/:id` em paralelo com `GET /api/equipes` e
     `GET /api/colaboradores` (para as opções de gestor — filtra
     `ativo && id !== próprio id em edição`, já que não existe endpoint leve
     de opções nem paginação a explorar como no plano original). Campos:
     nome completo, e-mail, CPF mascarado, papel (`Select` com `Alert`
     dinâmico — "sem login" para `colaborador`, "conta criada + e-mail de
     senha" para `admin`/`gestor_rh`, atualizado a cada troca), cargo,
     equipe (`Select`, "Nenhuma" envia `equipeId: null`), gestor (`Select`,
     "Nenhum" envia `gestorId: null`, excluindo o próprio registro em
     edição). **Sem campo `ativo`** (fora do contrato de criar/editar,
     tratado só pela listagem). Erros: `CPF_INVALIDO`/`CPF_DUPLICADO` →
     campo `cpf`; `EMAIL_DUPLICADO`/`EMAIL_JA_REGISTRADO_AUTH` → campo
     `email`; demais erros → `Alert` genérico no topo, mantendo os dados
     digitados. Ao salvar com sucesso, navega para `/colaboradores` com
     `state.successMessage`; se `emailDefinicaoSenhaEnviado === false` no
     `POST`, navega com `state.warningMessage` orientando a usar "Esqueci
     minha senha".
   - **`EquipesListPage`**: listagem simples (`Table` MUI, sem paginação,
     `GET /api/equipes` não pagina), `Dialog` único para criar/editar
     (`modoDialog: 'criar' | 'editar'`), exclusão via `ConfirmDialog` que
     chama `DELETE /api/equipes/:id` e exibe qualquer erro retornado
     literalmente dentro do próprio dialog (sem prometer mensagem específica
     de "equipe em uso", já que o delete é físico com `ON DELETE SET NULL`).
   - **Decisão registrada — `equipeId`/`gestorId: null` explícito**: o
     formulário sempre envia o payload completo (não é um PATCH parcial da
     perspectiva da UI), então limpar equipe/gestor em edição envia `null`
     explícito em vez de omitir o campo. Isso não está 100% confirmado no
     resumo de contrato repassado a esta task (que só documenta os campos
     como opcionais) — se o backend tratar `null` de forma diferente de
     "campo omitido" na atualização parcial, o revisor deve sinalizar para
     alinhamento.
   - **Notas de lint (`eslint-plugin-react-hooks` v7)**: o preset
     `recommended` desta versão inclui regras novas orientadas ao React
     Compiler, em especial `set-state-in-effect` (erro em qualquer `setState`
     alcançável a partir de um `useEffect`, incluindo através de funções
     `useCallback` chamadas nele) e `set-state-in-render`. Isso afeta
     diretamente o padrão clássico "buscar dados no mount": onde a busca é
     genuinamente um efeito (carga inicial de colaboradores/equipes em
     `ColaboradoresListPage`/`EquipesListPage`, resolução de sessão em
     `AuthContext`), foi adicionado `// eslint-disable-next-line
     react-hooks/set-state-in-effect` pontual com comentário explicando o
     motivo. Onde havia alternativa sem efeito — reset de página ao mudar
     filtro em `ColaboradoresListPage` — foi reescrito para o padrão
     "ajustar estado durante a renderização" documentado pelo React (compara
     filtro atual com o anterior guardado em estado, sem `useEffect`), que
     não aciona a regra. `useAuth` foi mantido no mesmo arquivo do
     `AuthProvider` com um disable pontual de
     `react-refresh/only-export-components`, por ser o padrão mais simples
     para um contexto pequeno como este.
   - **Fora de escopo** (conforme seção 1.7 do plano original): nenhuma
     geração automática/importação em massa de colaboradores/equipes; nenhum
     link/coluna/modal exibindo respostas ou avaliações (mesmo agregadas);
     nenhum shell de navegação global compartilhado com telas de
     `colaborador`.
   - **Verificação**: `npm run build` (`tsc -b && vite build`) e
     `npm run lint` rodados em `frontend/` — ambos sem erros.

   ### 1.1 Infraestrutura transversal (base para todo o resto) — plano original (contrato divergente, ver aviso acima)

   - `frontend/.env.example`: adicionar `VITE_API_URL=`.
   - `frontend/src/vite-env.d.ts`: adicionar `VITE_API_URL: string` em
     `ImportMetaEnv`.
   - `frontend/src/lib/apiClient.ts` (novo): função `apiFetch<T>(path, options)`
     que:
     - lê `import.meta.env.VITE_API_URL` como base;
     - obtém o token via `supabase.auth.getSession()` e injeta
       `Authorization: Bearer <token>`;
     - define `Content-Type: application/json` e serializa `body`;
     - em resposta não-2xx, lança um erro tipado `ApiError` (`status`,
       `mensagem`, `campo?`) construído a partir do corpo JSON de erro da
       API, para que os formulários consigam distinguir 409/422 de erro
       genérico de rede;
     - **não** implementa nenhuma lógica de agregação/anonimização — é só
       transporte HTTP.
   - `frontend/src/context/AuthContext.tsx` (novo) + hook `useAuth()`:
     - estado `{ status: 'carregando' | 'autenticado' | 'nao_autenticado' |
       'erro', colaborador: { id, nome_completo, email, papel } | null,
       erro?: string }`;
     - no mount, `supabase.auth.getSession()` e assina
       `supabase.auth.onAuthStateChange` para reagir a login/logout em outra
       aba/expiração de sessão;
     - quando há sessão, chama `GET /api/auth/me` (via `apiClient`) para
       resolver o `papel`; se a chamada falhar (rede ou o colaborador não for
       encontrado), vai para `status: 'erro'` — **nunca** deixa a árvore
       renderizar como se estivesse autenticado sem `papel` confirmado;
     - fornece o `Provider` para envolver toda a árvore autenticada (ver
       `main.tsx`/`App.tsx` abaixo).
   - `frontend/src/components/RotaProtegida/RotaProtegida.tsx` (novo):
     - props `{ papeis: Array<'admin' | 'gestor_rh' | 'colaborador'>,
       children }` (ou usa `<Outlet/>`, decisão de implementação);
     - `status === 'carregando'` → `CircularProgress` centralizado
       (tela cheia), sem piscar conteúdo protegido;
     - `status === 'nao_autenticado'` → `<Navigate to="/login" replace />`;
     - `status === 'erro'` → mensagem de erro com botão "Tentar novamente"
       (não deixa a tela em branco nem redireciona para `/login`
       silenciosamente, já que o usuário pode estar de fato autenticado);
     - `status === 'autenticado'` e `colaborador.papel` **não** está em
       `papeis` → renderiza `AcessoNegadoPage` (não redireciona para
       `/login` — o usuário está autenticado, só não tem permissão);
     - `status === 'autenticado'` e papel permitido → renderiza `children`
       (ou `<Outlet/>`).
   - `frontend/src/pages/AcessoNegadoPage/AcessoNegadoPage.tsx` (novo):
     mensagem simples ("Você não tem permissão para acessar esta área.") +
     link/botão para deslogar ou voltar — sem listar nem sugerir nenhuma das
     telas protegidas.
   - `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (novo):
     `AppBar`/`Drawer` (ou `Tabs`) simples do MUI com os links "Colaboradores"
     (`/colaboradores`) e "Equipes" (`/equipes`), reaproveitando `theme.ts`;
     renderiza `<Outlet/>` para as páginas filhas. **Nota explícita para o
     revisor**: este layout hoje só existe dentro da árvore já protegida por
     `RotaProtegida papeis={['admin','gestor_rh']}`, então por construção um
     `colaborador` nunca chega a montá-lo; quando o projeto ganhar um shell de
     navegação global compartilhado com telas de `colaborador`, esse shell
     deverá reusar `useAuth().colaborador.papel` para decidir se mostra os
     links "Colaboradores"/"Equipes" — isso fica fora do escopo desta task.
   - `frontend/src/main.tsx`: envolver `<App />` com `<AuthProvider>` (por
     dentro do `<BrowserRouter>`, para o contexto poder usar hooks de router
     se precisar no futuro; por fora do `<ThemeProvider>`/`<CssBaseline>` já
     existentes, sem alterar a ordem desses).
   - `frontend/src/App.tsx`: adicionar rotas, mantendo `/login` como está:
     ```
     <Route path="/login" element={<LoginPage />} />
     <Route element={<RotaProtegida papeis={['admin','gestor_rh']} />}>
       <Route element={<PainelAdminLayout />}>
         <Route path="/colaboradores" element={<ColaboradoresListPage />} />
         <Route path="/colaboradores/novo" element={<ColaboradorFormPage />} />
         <Route path="/colaboradores/:id/editar" element={<ColaboradorFormPage />} />
         <Route path="/equipes" element={<EquipesListPage />} />
       </Route>
     </Route>
     <Route path="/acesso-negado" element={<AcessoNegadoPage />} />
     <Route path="*" element={<Navigate to="/login" replace />} />
     ```
     Observação: o fallback `*` continua indo para `/login` mesmo para um
     usuário já autenticado que digitar uma rota inexistente — comportamento
     pré-existente (já era assim antes desta task, só com uma rota),
     não é responsabilidade desta task corrigir; se incomodar, registrar como
     item de "Sugestão" na revisão, não como bloqueio.

   ### 1.2 Utilitários de CPF

   - `frontend/src/utils/cpf.ts` (novo): `formatarCpf(valor: string): string`
     (aplica a máscara `000.000.000-00` progressivamente enquanto digita) e
     `cpfValido(valor: string): boolean` (valida 11 dígitos + dígitos
     verificadores). Funções puras, sem dependência nova. Deixar explícito em
     comentário que essa validação é só para UX — a validação autoritativa
     (incluindo unicidade) é do backend, e o formulário precisa exibir o erro
     vindo da API mesmo quando a validação client-side passou.

   ### 1.3 Componentes reaproveitáveis novos

   - `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx`: `Dialog` MUI
     genérico (`open`, `titulo`, `mensagem`, `onConfirmar`, `onCancelar`,
     `carregando`, `erro?`) — reaproveitado para inativar/reativar
     colaborador e excluir equipe. Segue o padrão de `Dialog` já usado em
     `EsqueciSenhaModal` (foco inicial, fecha por ESC/clique fora/X).
   - Tabela: **não** criar um componente 100% genérico tipo "DataGrid" (as
     colunas de colaboradores e de equipes são muito diferentes e só há 2
     usos). Usar `Table`/`TableHead`/`TableBody`/`TablePagination` do MUI
     diretamente em cada página, mas extrair um componente pequeno
     `frontend/src/components/TabelaEstado/TabelaEstado.tsx` só para os 3
     estados repetidos (linha de loading via `Skeleton`, linha de "vazio" com
     mensagem, linha/`Alert` de erro com botão "Tentar novamente"), evitando
     duplicar esse trecho entre `ColaboradoresListPage` e `EquipesListPage`.

   ### 1.4 Página: listagem de colaboradores

   - `frontend/src/pages/ColaboradoresListPage/ColaboradoresListPage.tsx`
     (novo).
   - **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
     comportamento entre os dois (não há restrição adicional especificada
     para `gestor_rh` nesta tela — se isso mudar, precisa vir de uma nova
     spec, não deve ser inventado aqui). `colaborador` nunca alcança esta
     rota (bloqueado por `RotaProtegida`).
   - Colunas: nome, e-mail, papel, cargo, equipe (string `equipe_nome` vinda
     pronta da API), gestor (`gestor_nome` idem), status (chip
     "Ativo"/"Inativo", cor `success`/`default`). Ação por linha: ícone
     "editar" (`IconButton` → navega para `/colaboradores/:id/editar`) e
     ícone "inativar" (colaborador ativo) ou "reativar" (colaborador
     inativo) que abre `ConfirmDialog` e chama
     `PATCH /api/colaboradores/:id { ativo: !ativoAtual }`.
   - Filtros mínimos (necessários para o próprio fluxo de inativar/reativar
     funcionar — sem eles um colaborador inativado "some" da tela): campo de
     busca (nome/e-mail, debounced ~400ms) e `Select` de status
     (Ativos/Inativos/Todos, default "Ativos"). Paginação via
     `TablePagination` (`page`, `pageSize` — sugestão 10/25/50) usando
     `total` retornado pela API — **não** paginar em memória no cliente.
   - Botão "Novo colaborador" → navega para `/colaboradores/novo`.
   - Estados: carregando (via `TabelaEstado`), vazio ("Nenhum colaborador
     encontrado" + o texto muda se há filtro ativo vs. base realmente vazia),
     erro (mensagem + "Tentar novamente" que refaz a última consulta).
   - **Endpoint consumido**: `GET /api/colaboradores?busca=&status=&page=&pageSize=`
     (ver contrato acima). Sem chamada adicional para resolver nome de
     equipe/gestor.

   ### 1.5 Página: formulário de colaborador (criar/editar)

   - `frontend/src/pages/ColaboradorFormPage/ColaboradorFormPage.tsx` (novo),
     usado tanto em `/colaboradores/novo` quanto em
     `/colaboradores/:id/editar` (lê `useParams().id`; se presente, busca
     `GET /api/colaboradores/:id` para pré-popular).
   - **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
     comportamento entre os dois nesta tela.
   - Campos: `nome_completo` (`TextField` obrigatório), `email`
     (`TextField type="email"` obrigatório, mesma regex de formato já usada
     em `LoginPage`), `cpf` (`TextField` com máscara via `formatarCpf`
     aplicada em `onChange`, `inputMode="numeric"`, valida com `cpfValido`
     antes de habilitar submit), `papel` (`Select` com as 3 opções
     `admin`/`gestor_rh`/`colaborador`), `cargo` (`TextField` texto livre),
     `equipe` (`Select` populado por `GET /api/equipes`, com opção "Nenhuma"
     enviando `equipe_id: null`), `gestor` (`Select` populado pela solução
     descrita no contrato de API — ver pendência acima — com opção "Nenhum"
     enviando `gestor_id: null`; **excluir do próprio colaborador em edição
     da lista de opções**, para não permitir selecioná-lo como gestor de si
     mesmo), `ativo` (`Switch`/`Checkbox`, default `true` na criação).
   - **Regra de UX obrigatória (papel)**: abaixo/ao lado do `Select` de
     papel, renderizar um MUI `Alert severity="info"` cujo texto muda
     dinamicamente conforme o valor selecionado, atualizado a cada troca:
     - `papel === 'colaborador'`: algo como *"Esta pessoa poderá ser
       avaliada e avaliar outras pessoas na Avaliação 360°, mas **não** terá
       login na plataforma."*
     - `papel === 'admin'` ou `papel === 'gestor_rh'`: algo como *"Será
       criada uma conta de acesso para este e-mail. Um e-mail de definição
       de senha será enviado automaticamente."*
     Esse alerta deve aparecer tanto na criação quanto na edição (inclusive
     ao trocar o papel de um colaborador existente), não só no primeiro
     carregamento.
   - Estados: carregando (fetch inicial de `equipes`/opções de gestor e, em
     modo edição, do próprio colaborador — mostrar skeleton/spinner no lugar
     do formulário, não um formulário vazio piscando), enviando (botão
     "Salvar" desabilitado + texto "Salvando...", inputs desabilitados,
     guarda contra duplo submit), erro de validação client-side (mensagens
     inline por campo, sem submeter), erro da API:
     - `409`/`422` de CPF duplicado → erro exibido **no campo `cpf`**
       (`helperText` + `error` do `TextField`), texto claro tipo "Este CPF já
       está cadastrado" — nunca um alerta genérico tipo "Erro ao salvar".
     - `409`/`422` de e-mail duplicado → mesma lógica no campo `email`.
     - Outros erros (rede, 500) → `Alert severity="error"` genérico no topo
       do formulário, mantendo os dados digitados.
   - Ao salvar com sucesso, navega de volta para `/colaboradores` (idealmente
     com uma mensagem de sucesso transitória — `Snackbar` local à página de
     listagem via `state` da navegação, ou um `Snackbar` simples aqui antes
     de navegar; decisão de implementação, não precisa de componente
     compartilhado só para isso).
   - **Endpoints consumidos**: `GET /api/colaboradores/:id` (modo edição),
     `GET /api/equipes`, `GET /api/colaboradores?status=ativo&pageSize=...`
     (opções de gestor — solução interina), `POST /api/colaboradores` ou
     `PUT /api/colaboradores/:id`.

   ### 1.6 Página: CRUD de equipes

   - `frontend/src/pages/EquipesListPage/EquipesListPage.tsx` (novo).
   - **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
     comportamento.
   - Listagem simples (nome + ações editar/excluir) via `Table` do MUI (não
     precisa paginação — se `GET /api/equipes` não paginar, listar tudo; se a
     base crescer muito isso pode precisar de paginação futura, fora de
     escopo agora). Botão "Nova equipe" abre um `Dialog` com um único
     `TextField` "Nome" (reaproveitar o mesmo `Dialog` para criar e editar,
     controlado por um estado `{ modo: 'criar' | 'editar', equipe? }`).
   - Excluir: abre `ConfirmDialog` com nome da equipe; ao confirmar, chama
     `DELETE /api/equipes/:id`. Se a API retornar erro (ex.: `409` por
     equipe vinculada a colaboradores), **exibir a mensagem literal vinda da
     API dentro do próprio `ConfirmDialog`** (prop `erro`) em vez de fechar o
     dialog silenciosamente ou mostrar um erro genérico — o usuário precisa
     entender por que não pode excluir.
   - Estados: carregando/vazio ("Nenhuma equipe cadastrada" + CTA)/erro,
     via `TabelaEstado`; salvando (dialog de criar/editar com botão
     desabilitado durante o `POST`/`PUT`); excluindo (mesmo tratamento no
     `ConfirmDialog`).
   - **Endpoints consumidos**: `GET /api/equipes`, `POST /api/equipes`,
     `PUT /api/equipes/:id`, `DELETE /api/equipes/:id`.

   ### 1.7 Fora de escopo explícito (não implementar nesta task)

   - Qualquer tela/atalho de geração automática de colaboradores/equipes
     (importação em massa, IA, templates) — cadastro é sempre manual, campo a
     campo.
   - Qualquer link, coluna ou modal que exiba respostas/avaliações de um
     colaborador (mesmo agregadas) — esta task é só cadastro de dados
     mestres. Não adicionar "ver avaliações" nem nada que aproxime este
     CRUD de dados de resposta identificados/agregados de `pares`/
     `subordinado` — essa é a regra mais sensível do projeto e não tem
     nenhuma razão para tocar telas de cadastro de colaborador/equipe; se
     algo nesse sentido parecer necessário, é sinal de scope creep e deve
     parar e perguntar, não implementar.
   - Um shell de navegação global compartilhado com telas de `colaborador`
     (ver nota em `PainelAdminLayout` acima).

2. frontend-codereviewer

   Pontos de atenção específicos para o revisor conferir:
   - **Controle de acesso**: `RotaProtegida` de fato bloqueia
     `/colaboradores*` e `/equipes` para quem não tem sessão (`Navigate` para
     `/login`) e para sessão autenticada com papel fora de
     `['admin','gestor_rh']` (renderiza `AcessoNegadoPage`, **sem** redirecionar
     para `/login` e sem vazar nenhum dado da listagem antes da checagem de
     papel resolver — ou seja, nenhuma chamada a `GET /api/colaboradores` ou
     `GET /api/equipes` deve disparar antes de `useAuth().status ===
     'autenticado'` com papel confirmado).
   - **Nenhum vazamento de vínculo avaliador→avaliado**: confirmar que nada
     nesta task introduziu referência a `itens_resposta`,
     `relacionamentos_avaliacao` ou qualquer dado de resposta de
     avaliação — isso é 100% fora de escopo aqui, então a simples ausência já
     deveria estar garantida, mas vale checar que nenhuma coluna "extra"
     bisbilhoteira foi adicionada à listagem de colaboradores.
   - **Papel e mensagem de aviso**: o `Alert` de "sem login"
     (`papel === 'colaborador'`) vs. "conta criada + e-mail de senha"
     (`admin`/`gestor_rh`) está presente, correto e atualiza dinamicamente ao
     trocar o `Select`, tanto na criação quanto na edição — não é um texto
     estático fixado só no carregamento inicial.
   - **CPF**: máscara não trava o campo de forma que impeça colar/apagar;
     `cpfValido` é usada só como gate de UX (desabilita/avisa antes de
     enviar), e o erro de CPF duplicado vindo da API (409/422) aparece
     associado ao campo `cpf` — não existe um `catch` genérico que transforma
     esse erro específico numa mensagem tipo "Erro ao salvar" sem contexto.
   - **Equipe/gestor não são "resolvidos" no frontend**: a listagem de
     colaboradores usa diretamente `equipe_nome`/`gestor_nome` retornados
     pela API, sem nenhuma chamada extra tipo "buscar equipe por id" ou
     lógica de join no cliente.
   - **Estados tratados** (carregando/vazio/erro) presentes nas 3 telas
     (listagem de colaboradores, formulário, equipes), incluindo o caso
     específico de exclusão de equipe vinculada (mensagem de erro da API
     visível, dialog não fecha silenciosamente).
   - **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
     `style={{}}` extenso; nenhuma dependência nova desnecessária foi
     instalada (em particular, checar que não entrou `@mui/x-data-grid` nem
     lib de máscara de CPF sem necessidade — a máscara devia ser função pura
     em `utils/cpf.ts`).
   - **Reaproveitamento de `theme.ts`**: nenhuma paleta/cor nova foi
     inventada fora do `theme.ts` existente (navy/dourado); se o layout
     precisar de cores adicionais (ex. cor de erro do `Alert`), devem vir das
     paletas padrão do MUI (`error`, `warning`, `success`), não de hex-code
     solto.
   - **`apiClient`/tratamento de erro**: o parsing de erro de `apiFetch`
     realmente distingue status (409/422 vs. genérico) e não engole o corpo
     da resposta de erro da API; token do Supabase é obtido via
     `supabase.auth.getSession()` a cada chamada (não cacheado indefinidamente
     de um jeito que sobreviva a um logout/troca de usuário na mesma aba).
   - Se o `frontend-developer` precisou desviar do contrato de API proposto
     neste plano (porque o `task-backend.md` real definiu nomes/rotas
     diferentes), confirmar que o desvio está documentado no resumo da etapa
     1 e que o comportamento de UI (estados, mensagens, papéis) continua
     batendo com o que este plano pede.

## Revisão

Arquivos lidos (todos criados/tocados por esta task):
`frontend/src/lib/apiClient.ts`, `frontend/src/context/AuthContext.tsx`,
`frontend/src/components/RotaProtegida/RotaProtegida.tsx`,
`frontend/src/pages/AcessoNegadoPage/AcessoNegadoPage.tsx`,
`frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`,
`frontend/src/App.tsx`, `frontend/src/main.tsx`,
`frontend/src/types/colaborador.ts`,
`frontend/src/services/colaboradoresService.ts`,
`frontend/src/services/equipesService.ts`, `frontend/src/utils/cpf.ts`,
`frontend/src/components/ConfirmDialog/ConfirmDialog.tsx`,
`frontend/src/components/TabelaEstado/TabelaEstado.tsx`,
`frontend/src/pages/ColaboradoresListPage/ColaboradoresListPage.tsx`,
`frontend/src/pages/ColaboradorFormPage/ColaboradorFormPage.tsx`,
`frontend/src/pages/EquipesListPage/EquipesListPage.tsx`,
`frontend/src/vite-env.d.ts`, `frontend/.env.example`,
`frontend/package.json`/`package-lock.json`. Também lido, para contexto de
contrato, o `task-backend.md` real da mesma feature — confirmo que o
contrato camelCase/array-puro/`PATCH .../status` documentado no "Aviso ao
revisor" da etapa 1 bate exatamente com o que `task-backend.md` especifica
(rotas, shapes, `equipe`/`gestor` como objeto, `emailDefinicaoSenhaEnviado`,
ausência de `ativo` no body de criar/editar).

**Nenhum achado crítico.** A task pode seguir para `test-engineer`.

### Crítico

Nenhum.

- **Vazamento de identidade / anonimização**: nenhuma tela desta task expõe
  `avaliador_id`, `itens_resposta` ou `relacionamentos_avaliacao` (grep
  confirmado — só ocorrências incidentais da palavra "resposta" referindo-se
  a respostas HTTP). `gestor` é usado estritamente como estrutura
  organizacional (`{ id, nomeCompleto }`), sem nenhum link para
  avaliações/respostas. Nenhuma agregação/anonimização vive no frontend.
- **Controle de acesso**: `RotaProtegida` (`components/RotaProtegida/RotaProtegida.tsx`)
  cobre corretamente os 4 casos: `carregando` → spinner tela cheia (sem
  montar `<Outlet/>`, logo nenhuma chamada a `GET /api/colaboradores`/`GET
  /api/equipes` dispara antes disso); `nao_autenticado` → `Navigate
  to="/login"`; `erro` → mensagem + "Tentar novamente" (não redireciona
  silenciosamente); papel fora de `['admin','gestor_rh']` → `AcessoNegadoPage`
  sem redirecionar para `/login`. O papel nunca vem de algo persistido no
  client: `AuthContext` sempre confirma via `GET /api/auth/me` depois de obter
  a sessão do Supabase (nunca lê `papel` de `localStorage`/JWT decodificado no
  cliente), e usa um `versaoRef` para descartar respostas obsoletas em caso de
  troca de sessão em voo. O item de menu (`PainelAdminLayout`) só é montado
  dentro da árvore já protegida, então nunca aparece para `colaborador`. Fico
  de acordo com a nota do plano de que isso é UX, não a barreira real — a
  barreira real está no `garantirPapel`/`autenticar` do backend, que a
  revisão de backend já cobriu.
- **`colaborador` sem login**: grep por `auth.admin`, `createUser`,
  `service_role`/`SERVICE_ROLE` em `frontend/src/` não encontrou nenhuma
  ocorrência — `frontend/src/lib/supabaseClient.ts` usa só
  `VITE_SUPABASE_ANON_KEY`. A UI deixa explícito o comportamento por papel: o
  `Alert severity="info"` em `ColaboradorFormPage` muda dinamicamente a cada
  troca do `Select` de papel (não é texto fixado só no mount), com a
  mensagem exata pedida pelo plano para `colaborador` ("não terá login") e
  para `admin`/`gestor_rh` ("conta de acesso" + "e-mail de definição de
  senha"). Confirmado que o formulário não tem campo `ativo` (fora do
  contrato de criar/editar, conforme a divergência de contrato documentada).

### Deveria corrigir

1. **Inconsistência no disable do lint `set-state-in-effect` em
   `ColaboradorFormPage.tsx`** (linhas 97–99): o `useEffect` que dispara
   `carregarDadosIniciais()` no mount **não** tem o
   `// eslint-disable-next-line react-hooks/set-state-in-effect` que os
   efeitos equivalentes de `ColaboradoresListPage.tsx` (linha 104),
   `EquipesListPage.tsx` (linha 64) e `AuthContext.tsx` (linha 88) têm. O
   padrão é idêntico nos quatro casos (uma função `useCallback` que faz
   `setState` é chamada dentro de um `useEffect` de carga inicial), e o
   próprio resumo da etapa 1 descreve a regra como disparando "em qualquer
   `setState` alcançável a partir de um `useEffect`, incluindo através de
   funções `useCallback` chamadas nele" — o que deveria valer aqui também.
   Como não tenho como rodar `npm run lint` nesta revisão (só Read/Grep/Glob/
   Edit), não consigo confirmar se isso é (a) um lint error real que
   contradiz o "ambos sem erros" do resumo, ou (b) uma peculiaridade da regra
   que não dispara neste caso específico por algum motivo não documentado.
   De qualquer forma, a inconsistência entre os 4 locais deveria ser
   explicada ou corrigida (adicionar o disable por consistência, ou remover
   dos outros três e documentar por que este é diferente) antes do
   `test-engineer` assumir que `npm run lint` está de fato limpo.
2. **Fallback `*` redireciona sempre para `/login`, mesmo autenticado**
   (`App.tsx`, rota `<Route path="*" ...>`): comportamento pré-existente que
   o próprio plano já registrou como não sendo responsabilidade desta task
   corrigir, e pediu para ser sinalizado como "Sugestão" caso incomodasse —
   registrando aqui, mas sem bloquear.

### Sugestão

1. **`ColaboradorFormPage` refaz `listarColaboradores()` completo só para
   popular o `Select` de gestor** (linha 72 de `ColaboradorFormPage.tsx`),
   exatamente como a "solução interina" documentada no contrato de API
   previa. Funciona e está corretamente gated por `RotaProtegida`
   (`admin`/`gestor_rh`), mas builda uma segunda chamada idêntica à da
   listagem a cada abertura do formulário; quando/se o backend ganhar um
   endpoint leve de opções (`GET /api/colaboradores/opcoes` ou similar),
   trocar aqui.
2. **`PainelAdminLayout` exibe `colaborador.nomeCompleto` na `AppBar`**
   (linha 46–50) — inofensivo (é o próprio usuário logado, admin/gestor_rh,
   vendo seu próprio nome), só registrando que não é um dado de terceiro.
3. Nenhum problema de estilização encontrado: sem `.css` novo, sem
   `style={{}}` extenso (grep confirmado), `theme.ts` reaproveitado sem
   paleta nova, Tailwind usado só para layout/spacing e MUI para os
   controles reais — consistente com a convenção do projeto.
