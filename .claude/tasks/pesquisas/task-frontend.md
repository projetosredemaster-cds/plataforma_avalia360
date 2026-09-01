# Task: Pesquisas (listagem + construtor) — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário — sem
etapa de `spec` (não existe `.claude/tasks/pesquisas/spec.md`). Este plano não
toca `backend/`.

**Atualização (ajuste pós-`task-backend.md`)**: o `task-backend.md` real do
mesmo slug `.claude/tasks/pesquisas/` já existe e foi lido. O contrato de API
abaixo foi corrigido para bater com ele — as divergências entre a versão
original deste plano (assumida antes do backend existir) e o contrato real
estão documentadas na seção "Assunções e pendências" ao final, marcando o que
foi resolvido e o que segue em aberto. Onde ainda restar alguma divergência
não coberta aqui, o `frontend-developer` segue o contrato real do
`task-backend.md` e documenta o desvio no resumo da etapa 1 — mesmo critério
já usado em `.claude/tasks/cadastro-colaboradores-equipes/task-frontend.md`.

## Estado atual verificado (antes do plano)

- Não existe **nada** relacionado a pesquisas em `frontend/src/` hoje: nenhum
  tipo, service, página, rota ou componente de pergunta. Tudo aqui é
  greenfield.
- `frontend/src/App.tsx` hoje define: `/login`, `/definir-senha`,
  `/acesso-negado`, `/` → redirect para `/colaboradores`, e dentro de
  `RotaProtegida papeis={['admin','gestor_rh']}` + `PainelAdminLayout`:
  `/colaboradores`, `/colaboradores/novo`, `/colaboradores/:id/editar`,
  `/equipes`. Fallback `*` → `/login`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` já existe e
  é o shell padrão (AppBar + Drawer fixo com `LINKS`) — **deve ser
  reaproveitado**, só adicionando um novo item de menu "Pesquisas". Não criar
  um layout novo.
- `frontend/src/components/RotaProtegida/RotaProtegida.tsx` já existe e é o
  guard de papel padrão — reaproveitar com `papeis={['admin', 'gestor_rh']}`,
  nunca `colaborador`.
- `frontend/src/lib/apiClient.ts` (`apiFetch`/`ApiError`) e o padrão de
  `services/*Service.ts` (funções finas sobre `apiFetch`, ver
  `services/equipesService.ts`) já existem — reaproveitar, não recriar
  wrapper de fetch.
- `frontend/src/styles/theme.ts` (paleta navy/dourado, botões pill) já existe
  — reaproveitar via `sx`/`theme`, não criar tema novo (a demanda não pede
  paleta nova).
- `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx` já existe
  (dialog de confirmação genérico com `erro?` inline) — reaproveitar para
  excluir pesquisa, excluir página/pergunta e encerrar pesquisa.
- `frontend/src/components/TabelaEstado/TabelaEstado.tsx` existe mas é
  **específico de `<TableRow>`/`colSpan`** — não se aplica à Tela 1 (grid de
  cards, não tabela). Não forçar reaproveitamento; tratar carregando/vazio/erro
  inline na página de listagem (só há um uso, não justifica extrair um
  componente genérico novo agora — mesmo critério usado no
  `cadastro-colaboradores-equipes/task-frontend.md` para não criar um
  "DataGrid" genérico com um único consumidor).
- `frontend/package.json`: **não há** `@mui/icons-material` nem nenhuma lib
  de drag-and-drop (`dnd-kit`, `react-beautiful-dnd`, etc.) instalada. Como a
  demanda pede reordenação **"simples"**, o plano abaixo evita depender
  dessas libs: reordenação via botões "Mover para cima"/"Mover para baixo"
  (texto, não ícone) que trocam a posição do item adjacente, seguindo o
  mesmo critério conservador de não introduzir dependência nova sem
  necessidade clara (já aplicado a `@mui/x-data-grid` e libs de máscara de
  CPF na task de colaboradores/equipes).
- Único componente de pergunta existente: nenhum. `components/perguntas/`
  nasce inteiro nesta task, seguindo a skill `frontend-componente-pergunta`.
- O backend de pesquisas/páginas/perguntas/competências ainda não foi
  implementado (`backend/src/modules/` continua só com `auth`,
  `colaboradores`, `equipes`), mas `task-backend.md` já define o contrato
  completo (rotas, DTOs, shapes de resposta, regras de validação) — o
  contrato abaixo foi atualizado para bater com ele exatamente.

## Contrato de API (confirmado contra `task-backend.md`)

Base: `import.meta.env.VITE_API_URL`, via `apiFetch` (injeta
`Authorization: Bearer <token>` automaticamente). Casing: camelCase em toda
requisição/resposta, confirmado — mesmo padrão de `colaboradores`/`equipes`.

- `GET /api/pesquisas` → array puro `PesquisaResumo[]`: `{ id, titulo,
  status: 'rascunho' | 'publicada' | 'encerrada', cicloId: string | null,
  criadoEm, atualizadoEm }`. Sem paginação/filtro no servidor, confirmado —
  busca, filtro de status e ordenação desta tela são client-side sobre o
  array completo. **Não** traz (e o frontend não deve renderizar mesmo que
  venha) contagem de envios/respostas/tempo médio nem `tags` — fora do
  escopo do MVP. `cicloId` vem sempre `null` hoje (não existe módulo de
  ciclos) — o frontend não precisa exibi-lo nesta task.
- `GET /api/pesquisas/:id` → detalhe completo para o construtor: `{ id,
  titulo, mensagemBoasVindas: string | null, logoUrl: string | null, status,
  cicloId: string | null, paginas: [ { id, ordem, titulo: string | null,
  perguntas: [ { id, ordem, tipo: 'likert' | 'texto_aberto' | 'matriz' |
  'pessoa', enunciado, obrigatoria: boolean, configuracao: Record<string,
  unknown>, competencias: [{ id, nome }] } ] } ], criadoEm, atualizadoEm }`.
  `competencias` é **sempre `[]`** para perguntas que não são `matriz` —
  confirmado pelo backend. **Campo renomeado**: era `mensagemInicial` na
  versão anterior deste plano, o contrato real usa **`mensagemBoasVindas`**
  (coluna `mensagem_boas_vindas`).
- `POST /api/pesquisas` → body `{ titulo, mensagemBoasVindas?, logoUrl? }` →
  cria pesquisa em `rascunho` com `paginas: []`, retorna o objeto completo
  acima. (O backend também aceita `cicloId?` no DTO, mas esta task não expõe
  criação/edição de ciclo na UI — módulo de ciclos não existe.)
- `PUT /api/pesquisas/:id` → body `{ titulo?, mensagemBoasVindas?, logoUrl?
  }` → atualiza os campos de cabeçalho. **Confirmado que o backend NÃO
  restringe este endpoint por status** — ao contrário do que a versão
  anterior deste plano assumia ("backend deve rejeitar 409/422 se status !==
  rascunho"), `task-backend.md` não aplica `garantirEditavel` a este PUT (só
  às rotas de páginas/perguntas). Ou seja: a trava de status sobre
  título/mensagem/logo no construtor (ver 1.6) passa a ser **100% uma
  decisão de UX do frontend**, sem rede de segurança da API por trás — se o
  usuário burlar a UI (ex. via devtools), o backend aceitaria a edição mesmo
  com a pesquisa publicada/encerrada. Mantemos a trava de UI por
  consistência de produto (ver pendência 5 resolvida ao final), mas o
  frontend não deve mais tratar um eventual 409 desse PUT como esperado — se
  a API retornar erro aqui, é inesperado e deve aparecer via `Alert` igual
  qualquer outro erro.
- `PATCH /api/pesquisas/:id/status` → body `{ status: 'publicada' |
  'encerrada' }` → transição. Só `rascunho → publicada` e `publicada →
  encerrada` são aceitas pelo backend (`409 TRANSICAO_STATUS_INVALIDA` para
  qualquer outra combinação, incluindo pular etapa ou repetir o status
  atual); publicar sem pelo menos 1 página com 1 pergunta →
  `422 PESQUISA_VAZIA`. O frontend faz a checagem de UX equivalente antes de
  habilitar o botão "Publicar", mas sempre exibe o erro literal da API se a
  validação client-side passar e a API mesmo assim rejeitar.
- `POST /api/pesquisas/:id/duplicar` → cria uma cópia em `rascunho` com
  `cicloId: null` e `titulo` com sufixo `" (cópia)"` (confirmado — não mais
  "Cópia de X" como a versão anterior deste plano sugeria; como a ação não
  pede confirmação, isso normalmente nem aparece na tela antes do POST).
  Sem `ConfirmDialog` (ação não destrutiva).
- `DELETE /api/pesquisas/:id` → só permitido com a pesquisa em `rascunho`
  (`409 PESQUISA_NAO_REMOVIVEL` caso contrário) — **confirmado, não é mais
  uma regra "a definir pelo backend"**. Ver Correção 6 aplicada em 1.5: o
  botão "Deletar" só aparece quando `status === 'rascunho'`. Mesmo assim, o
  `ConfirmDialog` mantém a exibição literal de qualquer erro da API como
  rede de segurança.
- `POST /api/pesquisas/:id/paginas` → body `{ titulo?: string }` → cria
  página vazia ao final (ordem calculada pelo backend), retorna `{ id,
  ordem, titulo, perguntas: [] }`. Só aceito com a pesquisa em `rascunho`
  (`409 PESQUISA_NAO_EDITAVEL` caso contrário — este sim é imposto pelo
  backend via `garantirEditavel`).
- `PUT /api/pesquisas/:id/paginas/:paginaId` → body `{ titulo? }`. Idem, só
  em `rascunho`.
- `DELETE /api/pesquisas/:id/paginas/:paginaId`. Idem.
- `PATCH /api/pesquisas/:id/paginas/reordenar` → body **`{ itens: { id:
  string; ordem: number }[] }`** (não `{ ids: string[] }` como a versão
  anterior assumia). O backend valida que `itens` cobre **exatamente** o
  conjunto completo de ids de páginas da pesquisa (nenhum faltando, nenhum
  sobrando, sem `ordem` duplicada) → `422 ORDEM_INVALIDA` caso contrário. Só
  em `rascunho`.
- `POST /api/pesquisas/:id/paginas/:paginaId/perguntas` → body `{ tipo,
  enunciado, obrigatoria?, configuracao, competenciaIds?: string[] }`.
  **`competenciaIds` é campo de nível superior do body, irmão de
  `tipo`/`enunciado`/`configuracao`** — não vai dentro de `configuracao`
  (correção em relação à versão anterior deste plano). Regras aplicadas pelo
  backend: `tipo === 'matriz'` exige `competenciaIds` com pelo menos 1 item
  (`422 MATRIZ_SEM_COMPETENCIA`); qualquer outro `tipo` com `competenciaIds`
  não-vazio é **rejeitado** (`422 COMPETENCIA_FORA_DE_ESCOPO`, nunca
  ignorado silenciosamente); id de competência inexistente →
  `404 COMPETENCIA_NAO_ENCONTRADA`. Só em `rascunho`.
- `PUT /api/pesquisas/:id/paginas/:paginaId/perguntas/:perguntaId` → body
  `{ enunciado?, obrigatoria?, configuracao?, competenciaIds?: string[] }`
  (tipo não é editável após criado — decisão deste plano, compatível com o
  backend, que também não aceita `tipo` no DTO de atualização). Se
  `competenciaIds` for enviado, o backend substitui o conjunto de vínculos
  por completo. Só em `rascunho`.
- `DELETE /api/pesquisas/:id/paginas/:paginaId/perguntas/:perguntaId`. Só em
  `rascunho`.
- `PATCH /api/pesquisas/:id/paginas/:paginaId/perguntas/reordenar` → body
  **`{ itens: { id: string; ordem: number }[] }`**, mesma validação de
  cobertura exata do escopo (todas as perguntas da página) que a
  reordenação de páginas. Só em `rascunho`.
- `GET /api/competencias` → `[{ id, nome, descricao }]` (o backend também
  retorna `descricao`; o frontend só precisa de `id`/`nome` para o
  `Autocomplete`, `descricao` pode ser ignorada ou usada como texto
  secundário opcional). Usado só para popular o editor de pergunta
  `matriz`. Sem escrita nesta task — confirmado que o backend também não
  expõe `POST`/`PUT`/`DELETE` de competências ainda (como a tabela é
  populada é pendência do lado backend, não afeta este plano — enquanto
  vazia, o `Autocomplete` de competências simplesmente não tem opções).

### Formato de `configuracao` por tipo (confirmado, `jsonb`, chaves em camelCase)

O campo `configuracao` que a versão anterior deste plano já exigia **passou
a existir de fato** no backend, com formato confirmado por tipo — o backend
rejeita chaves inesperadas, então os editores devem enviar exatamente isto e
nada mais:

- `likert` e `matriz`: `{ niveis: number, rotulos: string[] }` — `niveis`
  inteiro entre **2 e 10**, `rotulos` com exatamente `niveis` itens. Ambos
  obrigatórios. Os editores (`PerguntaLikertEditor`/`PerguntaMatrizEditor`,
  ver 1.3) devem validar isso client-side antes de habilitar salvar, para
  evitar um 422 previsível.
- `texto_aberto`: `{}` — não enviar nenhuma chave além disso.
- `pessoa`: `{ filtroRelacionamento: string[] }` — não vazio, valores
  restritos a `['autoavaliacao', 'gestor', 'pares', 'subordinado',
  'externo']`. Confirma a assunção 6 da versão anterior deste plano (valores
  batiam com o texto de `CLAUDE.md`) — **nota**: a skill
  `frontend-componente-pergunta` escreve esses nomes em `snake_case`
  (`filtro_relacionamento`), mas o contrato real confirmado do projeto é
  **camelCase** (`filtroRelacionamento`) — seguir o contrato real, não a
  grafia da skill.

## Plano — Frontend

1. frontend-developer — **Concluído**

   **Resumo da implementação** (build `tsc -b && vite build` e `eslint .`
   passam sem erros/avisos):

   - `frontend/src/types/pesquisa.ts` e `frontend/src/types/competencia.ts`:
     tipos criados exatamente como no contrato reconciliado —
     `mensagemBoasVindas`, `logoUrl`, `TipoPergunta` com só os 4 valores,
     `Pergunta` como união discriminada por `tipo` com `competencias:
     Competencia[]` (resolvido, leitura) separado de `competenciaIds`
     (campo de nível superior, só em `PerguntaPayload`/
     `AtualizarPerguntaPayload`, nunca dentro de `configuracao`).
   - `frontend/src/services/{pesquisas,paginas,perguntas,competencias}Service.ts`:
     funções finas sobre `apiFetch`, seguindo o padrão de `equipesService.ts`.
     `reordenarPaginas`/`reordenarPerguntas` enviam `{ itens: { id, ordem
     }[] }` (payload completo do escopo, nunca `{ ids: string[] }`).
   - `frontend/src/components/perguntas/Pergunta{Likert,TextoAberto,Matriz,Pessoa}/`:
     editor + resposta por tipo, seguindo a skill `frontend-componente-pergunta`
     — nenhum chama `apiFetch`/services diretamente (recebem `valor`/
     `onChange`/listas via props). `PerguntaMatrizEditor` recebe
     `competencias` via prop (buscada uma única vez em
     `PesquisaConstrutorPage`) e grava seleção em `valor.competenciaIds`
     (nível superior, não em `configuracao`). Componentes `*Resposta` foram
     criados conforme a skill exige, mas não são consumidos por nenhuma
     página desta task (fora de escopo — tela pública de resposta é de
     outra task), como o plano já previa. Funções puras de validação
     (`validarConfiguracaoLikert`, `validarPerguntaMatriz`,
     `validarConfiguracaoPessoa`, validações de resposta) foram extraídas
     para `components/perguntas/validacaoPergunta.ts` em vez de ficarem
     exportadas junto dos componentes — desvio pequeno em relação à
     descrição literal do plano (que as descrevia dentro dos arquivos de
     editor), necessário porque `eslint-plugin-react-hooks`/
     `react-refresh` (`react-refresh/only-export-components`) rejeita
     arquivos de componente que exportam também funções auxiliares; mesmo
     padrão já usado em `AuthContext.tsx` para o hook `useAuth`, aqui
     resolvido via arquivo dedicado em vez de disable inline.
   - `frontend/src/components/perguntas/PerguntaCard/PerguntaCard.tsx`:
     casco comum (Chip do tipo, mover cima/baixo, excluir com
     `ConfirmDialog`, editor por `switch`). Persistência de edição é
     automática (debounce de 700ms após parar de digitar/alterar campo,
     sem botão "Salvar" separado, por `task-frontend.md` 1.6); em erro,
     reverte para o último valor confirmado do servidor e mostra `Alert`
     inline — nunca aplica a mudança otimisticamente.
   - `frontend/src/components/pesquisas/StatusPesquisaChip/StatusPesquisaChip.tsx`:
     reaproveitado na listagem e no construtor.
   - `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx`: painel de
     filtro (busca com debounce 400ms, status Rascunho/Publicada/Encerrada/
     Todas) + grid de cards, ordenação client-side (título A-Z/Z-A, criação
     recente/antiga — nenhuma opção de envio/resposta). Ações: Editar e
     Duplicar sempre visíveis; Deletar só quando `status === 'rascunho'`;
     Encerrar só quando `status === 'publicada'`. Sem ação "Enviar", sem
     "Insights", sem métricas/tags. Estados de carregando (skeleton),
     vazio (mensagem distinta com/sem filtro) e erro (`Alert` + tentar
     novamente) tratados.
   - `frontend/src/pages/PesquisaConstrutorPage/{PesquisaConstrutorPage,PaginaEditor,PerguntaRascunhoCard}.tsx`:
     modo criação (`titulo`/`mensagemBoasVindas`/`logoUrl`, sem
     páginas/perguntas antes de existir `pesquisaId`) e modo edição
     (carrega `buscarPesquisa` + `listarCompetencias` em paralelo, com
     otimização para não refazer o `GET` logo após criar — usa o objeto
     retornado pelo `POST` via `location.state`). Cabeçalho com botão único
     "Salvar alterações". Páginas/perguntas persistem granularmente por
     ação (criar/editar/excluir/reordenar chamam a API imediatamente).
     `likert`/`texto_aberto` são criados de imediato com `configuracao`
     default válida; `matriz`/`pessoa` abrem um card de rascunho 100%
     local (`PerguntaRascunhoCard`, nenhuma chamada à API) até a validação
     passar e o usuário clicar "Salvar". Reordenar (páginas e perguntas)
     sempre recalcula e envia a lista completa do escopo. Trava de status:
     fora de `rascunho`, a página inteira fica em modo leitura (`Alert`
     informativo, campos desabilitados, botões de mover/excluir/adicionar
     ocultos — não só desabilitados —, botão "Publicar" some); documentado
     no código que essa trava é puramente client-side para o cabeçalho
     (`PUT /api/pesquisas/:id` não é restrito por status na API real) e
     reflete uma restrição real do backend (`garantirEditavel`) para
     páginas/perguntas. "Publicar" desabilitado até existir 1 página com 1
     pergunta (checagem de UX; erro literal da API exibido se mesmo assim
     for rejeitado).
   - `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: só
     adicionado `{ to: '/pesquisas', label: 'Pesquisas' }` ao array `LINKS`
     existente — Drawer não duplicado.
   - `frontend/src/App.tsx`: `/pesquisas`, `/pesquisas/nova` e
     `/pesquisas/:id/editar` adicionadas dentro do bloco `RotaProtegida
     papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` já existente
     (mesmo bloco de `/colaboradores`/`/equipes`) — nenhum bloco novo sem
     guard.
   - Nenhuma dependência nova instalada (`package.json` inalterado) —
     reordenação usa botões "Mover para cima"/"Mover para baixo", sem
     `@mui/icons-material` nem lib de drag-and-drop. Nenhum 5º tipo de
     pergunta, nenhuma métrica de envio/resposta/tempo médio, tag ou
     "Insights", nenhum dado de resposta/avaliador (`avaliador_id`,
     `itens_resposta`, `relacionamentos_avaliacao`) em nenhum arquivo desta
     task — confirmado por grep. Estilização 100% Tailwind (layout/
     espaçamento) + MUI (controles), sem `.css` novo nem `style={{}}`
     extenso.

   ### 1.1 Tipos e services (base para todo o resto)

   - `frontend/src/types/pesquisa.ts` (novo): `StatusPesquisa = 'rascunho' |
     'publicada' | 'encerrada'`; `TipoPergunta = 'likert' | 'texto_aberto' |
     'matriz' | 'pessoa'` (exatamente esses 4, nenhum outro); `Pergunta`
     (campos comuns `id, ordem, tipo, enunciado, obrigatoria` +
     `configuracao` tipado por tipo via união discriminada por `tipo` — não
     `Record<string, unknown>` solto — com os formatos confirmados:
     `{ tipo: 'likert' | 'matriz', configuracao: { niveis: number; rotulos:
     string[] } }`, `{ tipo: 'texto_aberto', configuracao: Record<string,
     never> }`, `{ tipo: 'pessoa', configuracao: { filtroRelacionamento:
     string[] } }`; **`competenciaIds?: string[]`** (só relevante/preenchido
     quando `tipo === 'matriz'`, campo de nível superior da pergunta, nunca
     dentro de `configuracao` — correção em relação à versão anterior deste
     plano) usado ao **enviar** para a API; na **resposta** da API a
     pergunta traz `competencias: { id: string; nome: string }[]` já
     resolvido — sempre `[]` fora de `matriz`); `Pagina { id, ordem, titulo:
     string | null, perguntas: Pergunta[] }`; `PesquisaResumo { id, titulo,
     status, cicloId: string | null, criadoEm, atualizadoEm }`; `Pesquisa`
     (detalhe completo — inclui `mensagemBoasVindas: string | null`,
     `logoUrl: string | null`, `cicloId`, `paginas: Pagina[]`, para o
     construtor). **Nota**: campo renomeado de `mensagemInicial` (versão
     anterior) para `mensagemBoasVindas` (contrato real do backend).
   - `frontend/src/types/competencia.ts` (novo): `Competencia { id, nome }`.
   - `frontend/src/services/pesquisasService.ts` (novo): `listarPesquisas`,
     `buscarPesquisa(id)`, `criarPesquisa`, `atualizarPesquisa(id, dados)`,
     `atualizarStatusPesquisa(id, status)`, `duplicarPesquisa(id)`,
     `removerPesquisa(id)`.
   - `frontend/src/services/paginasService.ts` (novo): `criarPagina`,
     `atualizarPagina`, `removerPagina`, `reordenarPaginas(pesquisaId,
     itens: { id: string; ordem: number }[])` → `PATCH
     /api/pesquisas/:pesquisaId/paginas/reordenar` com body `{ itens }`
     (formato corrigido — não mais `{ ids: string[] }`).
   - `frontend/src/services/perguntasService.ts` (novo): `criarPergunta`,
     `atualizarPergunta`, `removerPergunta`, `reordenarPerguntas(pesquisaId,
     paginaId, itens: { id: string; ordem: number }[])` → `PATCH
     .../perguntas/reordenar` com body `{ itens }` (idem).
   - `frontend/src/services/competenciasService.ts` (novo):
     `listarCompetencias`.
   - Todos seguindo o padrão fino de `equipesService.ts` (função por rota,
     sem lógica de negócio, `apiFetch` faz o transporte). Nenhuma
     agregação/anonimização — não há dado de resposta/avaliador aqui, então
     essa regra nem se aplica diretamente, mas nenhum destes services deve
     importar nada relacionado a `itens_resposta`/`relacionamentos_avaliacao`.

   ### 1.2 Navegação

   - `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`
     (editado): adicionar `{ to: '/pesquisas', label: 'Pesquisas' }` ao array
     `LINKS` existente. Não duplicar o layout.
   - `frontend/src/App.tsx` (editado): dentro do mesmo bloco `RotaProtegida
     papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` que já envolve
     `/colaboradores`/`/equipes`, adicionar:
     ```
     <Route path="/pesquisas" element={<PesquisasListPage />} />
     <Route path="/pesquisas/nova" element={<PesquisaConstrutorPage />} />
     <Route path="/pesquisas/:id/editar" element={<PesquisaConstrutorPage />} />
     ```
     Sem rota pública de resposta a pesquisa nesta task (fora de escopo, ver
     1.7).

   ### 1.3 Componentes de pergunta (`components/perguntas/`)

   Seguindo a skill `frontend-componente-pergunta` à risca: um editor +
   um componente de resposta por tipo, em pastas próprias. Nenhum dos dois
   chama a API diretamente — recebem dados/callbacks via props.

   - `components/perguntas/PerguntaLikert/PerguntaLikertEditor.tsx`: edita
     `enunciado` (`TextField`), `obrigatoria` (`Switch`), `configuracao.niveis`
     (número de pontos da escala, `TextField type="number"`, limite
     **confirmado 2–10 inteiro**, não mais um "intervalo razoável" assumido)
     e `configuracao.rotulos` (um `TextField` por nível, lista dinâmica que
     acompanha `niveis` — ao mudar `niveis`, o editor ajusta o array de
     `rotulos` para ter exatamente esse tamanho, preenchendo/truncando).
     Validação client-side antes de permitir salvar: `niveis` entre 2 e 10,
     `rotulos.length === niveis`, nenhum rótulo vazio — evita o `422`
     previsível do backend (que exige exatamente essa forma). Props:
     `pergunta`, `onChange(pergunta)`, `somenteLeitura?: boolean` (ver 1.6,
     trava quando pesquisa não está em rascunho).
   - `components/perguntas/PerguntaLikert/PerguntaLikertResposta.tsx`:
     `RadioGroup` MUI com `niveis` opções rotuladas por `rotulos`, salva
     `{ nota: number }` em `valor` via `onChange`. Bloqueia submit externo
     (expõe validade via retorno/prop, não via chamada de API) quando
     `obrigatoria && valor == null`.
   - `components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoEditor.tsx`:
     só `enunciado` + `obrigatoria` (sem configuração extra). **Envia
     `configuracao: {}`** ao salvar (não omitir o campo, não enviar chaves
     extras) — o backend rejeita qualquer chave inesperada em `configuracao`
     para este tipo.
   - `components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta.tsx`:
     `TextField multiline`, salva `{ texto: string }`.
   - `components/perguntas/PerguntaMatriz/PerguntaMatrizEditor.tsx`: mesmo
     `enunciado`/`obrigatoria`/`niveis`/`rotulos` do Likert (mesma validação
     2–10/`rotulos.length === niveis`), **mais** um seletor múltiplo de
     competências (`Autocomplete multiple` do MUI) que salva os ids
     escolhidos em **`pergunta.competenciaIds`, campo de nível superior da
     pergunta — não mais dentro de `configuracao`** (correção em relação à
     versão anterior deste plano, que guardava em
     `configuracao.competenciaIds`; o backend modela isso como um campo
     relacional próprio, irmão de `configuracao`). Validação client-side:
     pelo menos 1 competência selecionada antes de permitir salvar (espelha
     o `422 MATRIZ_SEM_COMPETENCIA` do backend). Recebe a lista de
     competências **via prop** (`competencias: Competencia[]`) — quem busca
     `GET /api/competencias` é a página pai (`PesquisaConstrutorPage`), não
     o editor (mantém a regra "componente não chama API" também para o
     editor, não só para a resposta). A escolha de múltiplas competências
     por pergunta (em vez de uma só) está confirmada pelo backend
     (`perguntas_competencias`, many-to-many) — mantida sem mudança de UX.
   - `components/perguntas/PerguntaMatriz/PerguntaMatrizResposta.tsx`:
     renderiza uma linha por competência a partir de `pergunta.competencias`
     (campo já resolvido `{ id, nome }[]` que a API devolve na pergunta, sem
     chamada extra — não mais lido de dentro de `configuracao`) com a mesma
     escala de níveis, salva `{ notas: { [competenciaId]: number } }`.
   - `components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`: edita
     `enunciado`/`obrigatoria` + `configuracao.filtroRelacionamento`
     (`CheckboxGroup`/`Select multiple` com os tipos de relacionamento:
     `autoavaliacao`, `gestor`, `pares`, `subordinado`, `externo` — **agora
     confirmado pelo contrato real do backend**
     (`configuracao.pessoa = { filtroRelacionamento: string[] }`, valores
     restritos a esse conjunto exato), não mais uma suposição a partir do
     texto de `CLAUDE.md`). Validação client-side: `filtroRelacionamento`
     não pode ficar vazio antes de salvar (espelha a validação do backend).
   - `components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`:
     seletor de colaborador (`Autocomplete` sobre uma lista recebida via
     prop, não buscada pelo próprio componente), salva
     `{ colaboradorId: string }`.
   - **Nota explícita para o revisor**: os componentes `*Resposta` são
     construídos agora para cumprir o padrão obrigatório da skill (um editor
     + uma resposta por tipo, reaproveitável), mas **nenhuma página desta
     task os consome** — não existe ainda a tela pública de resposta a
     pesquisa (fluxo "link + CPF, sem login" citado em `CLAUDE.md` como
     futuro). Ficam prontos para a task que implementar esse fluxo. Isso é
     esperado, não é código morto por engano.
   - Estilização: Tailwind para layout/espaçamento, MUI para os controles
     (`TextField`, `Switch`, `RadioGroup`, `Autocomplete`) — sem CSS novo.

   ### 1.4 Componentes reaproveitáveis novos

   - `frontend/src/components/perguntas/PerguntaCard/PerguntaCard.tsx`: casco
     comum de uma pergunta dentro do construtor — cabeçalho com `Chip` do
     tipo (rótulo fixo por tipo, ex. "Likert"/"Texto aberto"/"Matriz"/
     "Pessoa"), botões "Mover para cima"/"Mover para baixo" (desabilitados no
     primeiro/último item), botão "Excluir" (abre `ConfirmDialog`), e
     renderiza o editor correto (`PerguntaLikertEditor` etc.) por `switch` em
     `pergunta.tipo`. Props incluem `somenteLeitura` (repassado a
     `disabled`/oculta os botões de mover/excluir quando `true`). **Os
     botões "Mover para cima"/"Mover para baixo" não chamam a API
     diretamente com só o item movido** — disparam um callback do pai
     (`PaginaEditor`, ver 1.6) que recalcula a lista completa `{ id, ordem
     }[]` de todas as perguntas da página e chama `reordenarPerguntas` com o
     payload completo (formato corrigido do backend, ver contrato de API
     acima).
   - `frontend/src/components/pesquisas/StatusPesquisaChip/StatusPesquisaChip.tsx`:
     `Chip` pequeno mapeando `rascunho → cor default "Rascunho"`,
     `publicada → cor success "Publicada"`, `encerrada → cor default/warning
     "Encerrada"` — reaproveitado na listagem (card) e no cabeçalho do
     construtor.
   - Reordenação de páginas usa o mesmo padrão de botões "Mover para
     cima"/"Mover para baixo" (sem componente extra, é só um par de
     `IconButton`/`Button` no cabeçalho de cada `PaginaEditor`, ver 1.6).

   ### 1.5 Tela 1: `PesquisasListPage`

   - `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx` (novo),
     rota `/pesquisas`.
   - **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
     comportamento entre os dois (nenhuma restrição adicional foi
     especificada para `gestor_rh`). `colaborador` nunca alcança esta rota
     (bloqueado por `RotaProtegida`).
   - Layout: painel de filtro à esquerda (`Paper`, ~240px, Tailwind para o
     grid `md:grid-cols-[240px_1fr]`) + grid de cards à direita (`Grid`/CSS
     grid via Tailwind, cards em `Card` do MUI). **Este painel de filtro é
     interno à página**, distinto do `Drawer` de navegação global do
     `PainelAdminLayout` (que só tem os links Colaboradores/Equipes/Pesquisas).
   - Painel de filtro: `RadioGroup`/lista de status — **Rascunho / Publicada
     / Encerrada** + opção "Todas" (default) — e um `TextField` de busca por
     título (debounce ~400ms). Sem filtro por tag (fora do MVP).
   - Ordenação: `Select` com "Título (A-Z)", "Título (Z-A)", "Criação mais
     recente" (default), "Criação mais antiga". Nenhuma opção baseada em
     envio/resposta/tempo médio.
   - Busca, filtro de status e ordenação **100% client-side** sobre o array
     completo de `GET /api/pesquisas` (assunção documentada no contrato de
     API acima — mesmo padrão de `ColaboradoresListPage`).
   - Card (inspirado no padrão "binds.co", adaptado ao escopo do MVP):
     título (`Typography variant="h6"`, trunca com `noWrap`+`title` se muito
     longo), `StatusPesquisaChip`, data de criação formatada
     (`Intl.DateTimeFormat('pt-BR')`), ID/hash abreviado (`#` + primeiros 8
     caracteres de `id`, com `Tooltip` mostrando o id completo — decisão de
     UI já que não há campo dedicado de "hash" curto confirmado no contrato,
     ver "Assunções e pendências"), e uma barra de ações:
     - **Editar** → sempre visível, navega para `/pesquisas/:id/editar`.
     - **Duplicar** → sempre visível, chama `duplicarPesquisa(id)`; sucesso
       recarrega a listagem com `Snackbar` de confirmação; erro em
       `Snackbar severity="error"`. Sem `ConfirmDialog` (não é destrutivo).
     - **Deletar** → visível **só quando `status === 'rascunho'`** — mesmo
       critério de "ocultar ação impossível" já aplicado a "Encerrar"
       (correção em relação à versão anterior deste plano, que deixava
       "Deletar" sempre visível e delegava a regra ao backend). O backend
       confirma `DELETE /api/pesquisas/:id` só permitido em `rascunho`
       (`409 PESQUISA_NAO_REMOVIVEL` caso contrário). Quando visível, abre
       `ConfirmDialog` com o título da pesquisa; erro da API exibido
       literalmente dentro do dialog como rede de segurança (mesmo padrão de
       excluir equipe vinculada), embora não deva mais acontecer na prática
       dado o filtro de visibilidade.
     - **Encerrar** → visível **só quando `status === 'publicada'`**; abre
       `ConfirmDialog` ("Encerrar pesquisa? Não será mais possível
       coletar/editar respostas." — texto adaptado, sem mencionar métricas
       de envio que não existem); chama
       `atualizarStatusPesquisa(id, 'encerrada')`.
     - **Sem** ação "Enviar" (desabilitada/oculta — motor de envios ainda não
       existe) e **sem** botão/link de "Insights" (fora do MVP).
   - **Sem** exibição de métricas de envios/respostas/tempo médio em nenhum
     lugar do card, mesmo que o contrato de API venha a incluir esses campos
     no futuro — a UI simplesmente não os lê.
   - **Sem** exibição/filtro de tags.
   - Botão "Nova pesquisa" no topo → navega para `/pesquisas/nova`.
   - Estados: carregando (skeleton de cards — alguns `Skeleton
     variant="rounded"` no lugar do grid), vazio ("Nenhuma pesquisa
     encontrada" + texto que muda se há filtro ativo vs. base realmente
     vazia, com CTA "Nova pesquisa" só no caso de base vazia sem filtro),
     erro (`Alert severity="error"` + "Tentar novamente").
   - **Endpoints consumidos**: `GET /api/pesquisas`,
     `POST /api/pesquisas/:id/duplicar`, `DELETE /api/pesquisas/:id`,
     `PATCH /api/pesquisas/:id/status`.

   ### 1.6 Tela 2: `PesquisaConstrutorPage`

   - `frontend/src/pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx`
     (novo), usado em `/pesquisas/nova` e `/pesquisas/:id/editar` (lê
     `useParams().id`; ausente → modo criação).
   - **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
     comportamento.
   - **Modo criação** (`/pesquisas/nova`): formulário com `titulo`
     (`TextField` obrigatório), `mensagemBoasVindas` (`TextField multiline`,
     rótulo visível "Mensagem inicial" — campo renomeado de
     `mensagemInicial` para `mensagemBoasVindas` para bater com o contrato
     real do backend) e **`logoUrl`** (`TextField`, rótulo "URL do logo",
     opcional, campo novo desta correção; sem upload de arquivo, só a URL).
     Nenhuma página/pergunta pode ser adicionada antes de a pesquisa existir
     no backend (não há `pesquisaId` para pendurar páginas). Botão único
     "Salvar rascunho" → `criarPesquisa({ titulo, mensagemBoasVindas,
     logoUrl })` → em caso de sucesso, `navigate('/pesquisas/:id/editar', {
     replace: true })` com o `id` retornado, mantendo os dados em memória
     (sem re-fetch desnecessário). Erro de validação (ex. título vazio) via
     `Alert` no topo, mantendo os dados digitados.
   - **Modo edição** (`/pesquisas/:id/editar`): carrega `buscarPesquisa(id)`
     e, em paralelo, `listarCompetencias()` (só precisa existir para popular
     `PerguntaMatrizEditor` quando houver alguma pergunta `matriz` ou quando
     o usuário adicionar uma) — mantido em estado local, passado como prop
     `competencias` para baixo. Estado: carregando (spinner de página cheia,
     não formulário vazio piscando), erro (mensagem + "Tentar novamente").
   - **Cabeçalho editável**: `titulo`, `mensagemBoasVindas` e **`logoUrl`**
     (campo novo) com botão "Salvar alterações" próprio (chama
     `atualizarPesquisa(id, { titulo, mensagemBoasVindas, logoUrl })`),
     independente do salvamento de páginas/perguntas (que já persistem
     granularmente, ver abaixo) — evita perder edições de cabeçalho não
     salvas ao navegar para outra pergunta. **Nota confirmada contra o
     backend**: `PUT /api/pesquisas/:id` não é de fato restrito por status
     na API (ver contrato de API acima) — a trava abaixo é só uma decisão de
     UX do frontend, não uma barreira real do backend para este PUT
     específico (diferente de páginas/perguntas, essas sim restritas de
     verdade pelo backend via `garantirEditavel`).
   - **Páginas e perguntas — persistência granular** (confirmado pelo
     backend real: `pesquisas`/`paginas_pesquisa`/`perguntas` são recursos
     REST com CRUD dedicado, não um documento único — a versão anterior
     deste plano assumia isso, agora está confirmado, ver "Assunções e
     pendências"): cada ação (adicionar página, editar enunciado/
     configuração/competências de uma pergunta, excluir, reordenar) chama
     imediatamente o endpoint correspondente e atualiza o estado local com a
     resposta da API — não existe um botão "salvar" separado para a
     estrutura de páginas/perguntas. **Reordenar** (mover para cima/baixo)
     recalcula a lista completa `{ id, ordem }[]` do escopo afetado (todas
     as páginas da pesquisa, ou todas as perguntas da página) e envia o
     payload completo — o backend valida que a lista cobre exatamente o
     conjunto de ids existentes, sem faltar/sobrar/duplicar `ordem` (`422
     ORDEM_INVALIDA` caso contrário; formato corrigido, ver contrato de API
     acima). Cada `PaginaEditor`/`PerguntaCard` mostra seu próprio indicador
     de "salvando..." local (não trava a tela inteira) e, em erro, mantém o
     valor anterior confirmado (não aplica otimisticamente uma mudança que
     falhou) + `Alert` inline explicando o que não foi salvo.
   - **`PaginaEditor`** (subcomponente local desta página, não precisa ser
     genérico/reaproveitável fora daqui): cabeçalho com `titulo` opcional da
     página (`TextField`), botões "Mover para cima"/"Mover para baixo"
     (recalculam a lista completa `{ id, ordem }[]` de todas as páginas da
     pesquisa e chamam `reordenarPaginas` com o payload completo — formato
     corrigido, ver contrato de API acima), "Excluir página"
     (`ConfirmDialog`, `removerPagina`), lista de `PerguntaCard` (1.4), e um
     `Select` + botão "Adicionar pergunta" (escolhe o tipo entre os 4
     permitidos). **Comportamento de criação ajustado ao contrato real** (o
     backend valida `configuracao`/`competenciaIds` já no `POST`, não só no
     `PUT`):
     - `likert`/`texto_aberto`: criados imediatamente via `criarPergunta`
       com `configuracao` default válida (`likert` → `{ niveis: 5, rotulos:
       ['1','2','3','4','5'] }`; `texto_aberto` → `{}`), já que esses tipos
       não têm campo obrigatório sem valor padrão sensato.
     - `matriz`/`pessoa`: **não têm default válido** para
       `competenciaIds`/`filtroRelacionamento` (backend exige não-vazio).
       "Adicionar pergunta" abre o card em estado de **rascunho local não
       persistido** (id temporário só no cliente, sem chamar a API ainda)
       com o editor correspondente aberto; o botão "Salvar" do card só fica
       habilitado quando a validação client-side passar (≥1 competência
       para `matriz`, ≥1 relacionamento para `pessoa`), e só nesse momento
       dispara o primeiro `criarPergunta`. Cancelar/remover o card antes de
       salvar não chama a API.
   - Botão "Adicionar página" no rodapé da lista de páginas
     (`criarPagina({})`).
   - **Trava de edição por status** (regra central desta tela): quando
     `pesquisa.status !== 'rascunho'`, a página inteira entra em modo
     leitura — `Alert severity="info"` fixo no topo ("Esta pesquisa está
     publicada/encerrada. Não é possível editar sua estrutura."), campos de
     cabeçalho (`titulo`/`mensagemBoasVindas`/`logoUrl`) e todos os
     `PerguntaCard`/`PaginaEditor` recebem `somenteLeitura`/`disabled`,
     botões "Adicionar página"/"Adicionar pergunta"/"Mover"/"Excluir" ficam
     ocultos (não só desabilitados, para não sugerir uma ação que nunca vai
     funcionar), e o botão "Publicar" some. **Decisão mantida, com nuance
     confirmada contra o backend**: a trava cobre título/mensagem/logo além
     de perguntas — mas para o cabeçalho (`PUT /api/pesquisas/:id`) essa
     trava é **puramente client-side** (o backend aceitaria a edição de
     `titulo`/`mensagemBoasVindas`/`logoUrl` mesmo fora de `rascunho`, ver
     nota no contrato de API), enquanto para páginas/perguntas a trava
     replica uma restrição real do backend (`garantirEditavel`, `409
     PESQUISA_NAO_EDITAVEL`). Ver pendência 5 resolvida ao final.
   - **Botões de rodapé** (visíveis só quando `status === 'rascunho'`):
     - "Salvar rascunho": nesta tela, com a pesquisa já persistida
       granularmente por ação (**confirmado pelo backend real** — CRUD
       dedicado de páginas/perguntas existe de fato), esse botão passa a
       significar "salvar cabeçalho + permanecer em rascunho" — na prática,
       dispara o mesmo `atualizarPesquisa` do cabeçalho (sem redundância de
       dois botões fazendo a mesma coisa — plano consolida em **um único
       botão** "Salvar alterações" descrito acima, e o botão "Publicar"
       cobre a transição). Simplificação mantida — ver pendência 2 resolvida
       ao final.
     - "Publicar": habilitado só se houver pelo menos 1 página com pelo
       menos 1 pergunta (checagem client-side de UX); chama
       `atualizarStatusPesquisa(id, 'publicada')`. Em sucesso, atualiza
       `pesquisa.status` local (não precisa reload completo) e a UI
       re-renderiza em modo leitura imediatamente. Erro da API (ex. regra de
       negócio que o frontend não previu) em `Alert` no topo, pesquisa
       continua em rascunho.
   - Estados gerais: carregando inicial (spinner de página cheia), erro de
     carregamento (mensagem + "Tentar novamente", sem formulário), salvando
     por ação (indicadores locais por card/botão, sem loading global que
     trave toda a tela a cada pequena edição), vazio não se aplica a esta
     tela no sentido de listagem (uma pesquisa nova legitimamente começa sem
     páginas — mostrar uma mensagem amigável "Nenhuma página ainda. Adicione
     a primeira." em vez de área em branco).
   - **Endpoints consumidos**: `GET /api/pesquisas/:id`,
     `POST /api/pesquisas`, `PUT /api/pesquisas/:id`,
     `PATCH /api/pesquisas/:id/status`, `GET /api/competencias`,
     `POST|PUT|DELETE /api/pesquisas/:pesquisaId/paginas[/:id]`,
     `PATCH /api/pesquisas/:pesquisaId/paginas/reordenar` (body `{ itens: {
     id, ordem }[] }`),
     `POST|PUT|DELETE /api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas[/:id]`,
     `PATCH .../perguntas/reordenar` (idem, body `{ itens: { id, ordem }[]
     }`).

   ### 1.7 Fora de escopo explícito (não implementar nesta task)

   - Qualquer tela pública de resposta a pesquisa (link + CPF, sem login) —
     os componentes `*Resposta` são construídos (1.3) mas não consumidos por
     nenhuma página aqui.
   - Qualquer geração automática/IA/template de pesquisa ou de perguntas —
     criação é sempre manual, campo a campo (regra central do projeto).
   - Tags, "Insights" (IA), métricas de envio/resposta/tempo médio, ação
     "Enviar" — todos explicitamente fora do MVP conforme a demanda.
   - Qualquer exibição de respostas, agregadas ou identificadas — este
     construtor é 100% estrutural (título, páginas, perguntas). Não expor
     `avaliador_id`, contagens de respondentes nem nenhuma prévia de "como
     ficaria a resposta" com dados reais. Se algo nesse sentido parecer
     necessário durante a implementação, é sinal de scope creep — parar e
     perguntar, não implementar.
   - Um 5º tipo de pergunta (CSAT, NPS, KPI, CES, NVS, Imagem, Indicação) —
     mesmo que pareça "fácil" adicionar seguindo o mesmo padrão dos 4
     existentes, está fora do MVP por decisão já registrada.
   - CRUD de competências (criar/editar/excluir) — esta task só **lista**
     competências para popular o editor de pergunta `matriz`.
   - Ciclos de avaliação / motor de envios — não existem ainda, não há nada
     aqui que dependa deles além do texto do `Alert` de "Encerrar" evitar
     mencioná-los.

2. frontend-codereviewer

   Pontos de atenção específicos para o revisor conferir:
   - **Controle de acesso**: `/pesquisas`, `/pesquisas/nova` e
     `/pesquisas/:id/editar` estão de fato dentro do bloco `RotaProtegida
     papeis={['admin', 'gestor_rh']}` existente em `App.tsx` (não um novo
     bloco solto sem guard), e nenhuma chamada a `GET /api/pesquisas`/
     `GET /api/pesquisas/:id` dispara antes de `useAuth().status ===
     'autenticado'` com papel confirmado.
   - **Exatamente 4 tipos de pergunta**: `TipoPergunta` em `types/pesquisa.ts`
     e o `Select`/`switch` de criação de pergunta em `PaginaEditor` não
     incluem nenhum tipo além de `likert`/`texto_aberto`/`matriz`/`pessoa` —
     nem como opção visível, nem como um `case` morto no switch.
   - **Nenhuma métrica de envio/resposta/tempo médio, tag ou "Insights"**
     apareceu em nenhum card ou tela — checar tanto a UI quanto os tipos
     (`PesquisaResumo` não deveria ganhar campos desses só "porque a API pode
     mandar").
   - **Ação "Enviar" realmente ausente/desabilitada** e nenhuma rota pública
     de resposta foi criada por engano.
   - **Trava de status (`rascunho` vs. `publicada`/`encerrada`)**: com a
     pesquisa não-rascunho, confirmar que não é possível de fato adicionar,
     editar ou excluir página/pergunta pela UI (botões ocultos, não só
     desabilitados de um jeito que ainda dispare a chamada) — e que isso não
     depende só do frontend (o `PUT`/`POST`/`DELETE` de páginas/perguntas
     deve continuar protegido no backend; a trava de UI é só UX). Para o
     cabeçalho (`titulo`/`mensagemBoasVindas`/`logoUrl`), confirmar que a
     trava é reconhecida no código/PR como decisão de UX pura (sem depender
     de um 409 do backend que não existe para esse PUT).
   - **Componentes de pergunta seguem a skill**: editor + resposta por tipo,
     em `components/perguntas/Pergunta<Tipo>/`; nenhum dos dois chama
     `apiFetch`/services diretamente (recebem dados via props); `Resposta`
     bloqueia submit quando `obrigatoria` não atendida (verificar que a
     validação é exposta via prop/retorno, não decidida silenciosamente sem
     sinalizar o pai).
   - **`PerguntaMatrizEditor` não busca competências sozinho** — recebe via
     prop, buscado uma vez em `PesquisaConstrutorPage`.
   - **`competenciaIds` nunca dentro de `configuracao`**: no body enviado a
     `criarPergunta`/`atualizarPergunta`, `competenciaIds` deve estar no
     nível superior do objeto (irmão de `tipo`/`enunciado`/`configuracao`),
     nunca aninhado em `configuracao.competenciaIds` — checar o service e o
     ponto de montagem do body em `PaginaEditor`/`PerguntaCard`.
   - **`configuracao` bate exatamente com o formato confirmado por tipo**:
     `likert`/`matriz` só `{ niveis, rotulos }` (niveis 2–10,
     `rotulos.length === niveis`), `texto_aberto` só `{}` (nenhuma chave
     extra), `pessoa` só `{ filtroRelacionamento: string[] }` não-vazio —
     nenhum editor deve enviar chave fora dessas.
   - **`mensagemBoasVindas` e `logoUrl` presentes**: `types/pesquisa.ts`,
     `pesquisasService.ts` e o formulário de cabeçalho de
     `PesquisaConstrutorPage` usam `mensagemBoasVindas` (não
     `mensagemInicial`) e incluem um campo `logoUrl` salvo junto de
     `titulo`/`mensagemBoasVindas` pelo mesmo botão "Salvar alterações".
   - **Reordenação envia o payload completo `{ itens: { id, ordem }[] }`**:
     os botões "Mover para cima"/"Mover para baixo" recalculam a ordem de
     todo o escopo (todas as páginas da pesquisa, ou todas as perguntas da
     página) antes de chamar `reordenarPaginas`/`reordenarPerguntas` — nunca
     enviam só o item movido nem o formato antigo `{ ids: string[] }`.
   - **"Deletar" só visível em `rascunho`**: o card na `PesquisasListPage`
     oculta (não desabilita) a ação "Deletar" quando `status !== 'rascunho'`
     — mesmo critério já usado para "Encerrar".
   - **Nenhum dado de resposta/avaliador**: grep por `avaliador`,
     `itens_resposta`, `relacionamentos_avaliacao` não deveria encontrar nada
     nesta task (construtor é puramente estrutural).
   - **Estados tratados** (carregando/vazio/erro) presentes nas duas telas,
     incluindo o caso "pesquisa nova sem nenhuma página ainda" (mensagem
     amigável, não área em branco) e falha pontual de salvamento granular
     (indicador local por card, não um loading global bloqueante).
   - **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
     `style={{}}` extenso; nenhuma dependência nova instalada sem
     justificativa clara (checar em particular que não entrou
     `@mui/icons-material` nem lib de drag-and-drop — reordenação deveria ser
     só botões "mover para cima/baixo").
   - **Reaproveitamento**: `RotaProtegida`, `PainelAdminLayout` (com o novo
     item "Pesquisas" no `LINKS` existente, não um Drawer duplicado),
     `ConfirmDialog`, `theme.ts`, padrão de `services/*Service.ts` sobre
     `apiFetch` — nada disso deveria ter sido recriado do zero.
   - Se o `frontend-developer` precisou desviar do contrato de API deste
     plano (porque `task-backend.md` real definiu algo diferente do que está
     documentado aqui — o que não deveria mais acontecer com frequência,
     dado que este plano já foi confirmado contra o backend real, mas pode
     acontecer se o backend mudar durante a implementação), confirmar que o
     desvio está documentado no resumo da etapa 1 e que o comportamento de UI
     (estados, trava por status, papéis) continua batendo com o que este
     plano pede.

## Assunções e pendências

Registradas na versão original deste plano por dependerem de detalhe da
API/decisão de produto ainda não confirmado. Com `task-backend.md` real
agora existindo, cada item foi conferido contra o contrato real e marcado
como **Resolvido** ou **Ainda em aberto** abaixo:

1. **Persistência granular vs. documento único**: este plano assumia que
   páginas e perguntas são recursos REST próprios (`POST`/`PUT`/`DELETE`
   dedicados), conforme a frase do usuário "CRUD de pesquisas/páginas/
   perguntas".
   **Resolvido**: `task-backend.md` confirma CRUD granular de fato —
   `paginas-pesquisa` e `perguntas` são módulos/rotas próprios, com
   `garantirEditavel` aplicada a cada operação. Nenhuma mudança de
   comportamento necessária.
2. **Botão "Salvar rascunho" isolado**: a demanda original pede os botões
   "salvar rascunho / publicar" como par. Com CRUD granular (páginas/
   perguntas já persistem por ação), este plano consolidou "salvar rascunho"
   no mesmo botão que salva o cabeçalho (`titulo`/`mensagemBoasVindas`/
   `logoUrl`), renomeado "Salvar alterações".
   **Resolvido**: como o item 1 confirma CRUD granular, a consolidação em
   "Salvar alterações" permanece a decisão de UX correta — não há mais
   cenário de documento único que reintroduziria o par original.
3. **Endpoint/formato de reordenação**: assumido `PATCH .../reordenar {
   ids: string[] }` (lista completa na nova ordem).
   **Resolvido, com correção de formato**: o backend real usa `PATCH
   .../reordenar` com body `{ itens: { id: string; ordem: number }[] }`,
   validando cobertura exata do conjunto de ids do escopo (nenhum
   faltando/sobrando, sem `ordem` duplicada) → `422 ORDEM_INVALIDA`. O plano
   foi ajustado (services, botões "mover para cima/baixo" recalculando a
   lista completa, contrato de API) para refletir isso.
4. **"ID/hash" do card na Tela 1**: não há confirmação de um campo dedicado
   de código/hash curto para a pesquisa (usado normalmente para o link
   público de resposta, ainda fora de escopo). Assumido exibir os primeiros
   8 caracteres do `id` (UUID) prefixados por `#`, com tooltip do id
   completo.
   **Resolvido/compatível**: `task-backend.md` não introduz nenhum campo de
   código/hash público dedicado (não é necessário para esta task). A
   abordagem assumida continua válida sem conflito. Se/quando a pesquisa
   ganhar um campo de código público dedicado (provavelmente junto do motor
   de envios/link público, fora de escopo aqui), trocar para ele.
5. **Trava de status cobrindo título/mensagem inicial, não só perguntas**: a
   demanda cita explicitamente "edição de perguntas só é permitida quando
   rascunho". Este plano estendeu a trava para título/mensagem inicial
   também, por consistência.
   **Resolvido, com nuance importante**: `task-backend.md` confirma que
   `garantirEditavel` (que gera `409 PESQUISA_NAO_EDITAVEL`) só é aplicada
   às rotas de páginas/perguntas — **não** ao `PUT /api/pesquisas/:id` de
   cabeçalho. Ou seja, o backend aceitaria editar
   `titulo`/`mensagemBoasVindas`/`logoUrl` mesmo com a pesquisa
   `publicada`/`encerrada`. A trava sobre o cabeçalho no construtor
   **permanece mantida neste plano por decisão de produto/UX**
   (consistência visual: não faz sentido deixar só 3 campos editáveis numa
   pesquisa travada), mas agora está documentado que ela não tem
   correspondência real no backend — é puramente client-side, sem 409 de
   verdade por trás. Se o produto decidir permitir editar cabeçalho após
   publicar, isso já é tecnicamente possível sem mudança de backend, só
   removendo a trava de UI.
6. **Valores de `filtroRelacionamento` na pergunta `pessoa`**: assumidos
   `autoavaliacao`, `gestor`, `pares`, `subordinado`, `externo` — por
   corresponderem literalmente ao texto de regras de negócio em `CLAUDE.md`.
   **Resolvido**: `task-backend.md` confirma exatamente esses 5 valores e o
   formato `{ filtroRelacionamento: string[] }` em camelCase (não
   `filtro_relacionamento` como a skill genérica sugere). Nenhuma mudança de
   valores necessária, só a nota de casing já incorporada ao plano.
7. **Escala de `matriz` reaproveita `niveis`/`rotulos` do Likert** (mesma
   estrutura de configuração, aplicada por competência).
   **Resolvido**: confirmado pelo backend — `matriz` usa exatamente o mesmo
   formato de `configuracao` que `likert` (`{ niveis, rotulos }`), com a
   diferença de que `matriz` também carrega `competenciaIds` como campo à
   parte (não dentro de `configuracao`).
8. **`GET /api/pesquisas` sem paginação/filtro no servidor**: assumido por
   consistência com `colaboradores`/`equipes`.
   **Resolvido**: `task-backend.md` não define paginação/filtro para `GET
   /api/pesquisas` — listagem leve, sem aninhamento, filtro/busca/ordenação
   ficam client-side como assumido.
9. **Exclusão de pesquisa `publicada`/`encerrada`**: não havia regra de
   negócio documentada; o plano original deixava o botão "Deletar" sempre
   visível, delegando a regra ao backend.
   **Resolvido, com correção de comportamento**: o backend define
   explicitamente `DELETE /api/pesquisas/:id` só permitido em `rascunho`
   (`409 PESQUISA_NAO_REMOVIVEL` caso contrário). O plano foi ajustado para
   ocultar o botão "Deletar" fora de `rascunho`, no mesmo padrão já usado
   para "Encerrar" (ver 1.5), em vez de deixá-lo sempre visível.

Itens novos, decorrentes de assunções que o próprio `task-backend.md`
registra como **não confirmadas com o usuário** (não são pendências deste
plano de frontend, mas afetam o contrato consumido aqui — acompanhar se
`task-backend.md` mudar antes/durante a implementação):

10. **Modelagem de `matriz` via `perguntas_competencias` (many-to-many)**: o
    próprio backend marca isso como "o ponto de maior incerteza de
    modelagem" e uma decisão não confirmada com o usuário — se o backend
    real migrar para 1 competência por pergunta (campo único
    `competenciaId`, sem array), o `Autocomplete multiple` em
    `PerguntaMatrizEditor` precisa virar um `Autocomplete` de seleção única
    e `pergunta.competenciaIds: string[]` viraria `competenciaId: string`.
    Sem ação agora — só sinalizado para o `frontend-developer` verificar o
    DTO real no momento da implementação.
11. **`DELETE` restrito a `rascunho` e `duplicar` sempre reseta
    `cicloId`/sufixo de título** também são "decisões assumidas" do backend
    ainda não confirmadas explicitamente com o usuário (mas já refletidas
    neste plano, ver itens 9 e o texto de duplicar no contrato de API). Se o
    usuário rejeitar essas decisões ao confirmar `task-backend.md`, este
    plano precisa ser reajustado de novo (voltar "Deletar" a ficar sempre
    visível, ou ajustar o texto/preview de duplicar).
12. **Como a tabela `competencias` é populada** (seed manual vs. task futura
    de CRUD) é uma pendência puramente de backend — não bloqueia esta task,
    mas explica por que o `Autocomplete` de competências pode aparecer vazio
    em ambiente de desenvolvimento até alguém popular a tabela.

## Revisão

Revisão feita lendo `task-frontend.md` (checklist da seção "2.
frontend-codereviewer") e `task-backend.md` (contrato real de API) por
inteiro, e todos os arquivos novos/editados desta etapa: `types/pesquisa.ts`,
`types/competencia.ts`, os 4 `services/*Service.ts`, os 8 componentes de
`components/perguntas/Pergunta*` + `validacaoPergunta.ts` +
`PerguntaCard.tsx`, `StatusPesquisaChip.tsx`, `PesquisasListPage.tsx`,
`PesquisaConstrutorPage.tsx` + `PaginaEditor.tsx` + `PerguntaRascunhoCard.tsx`,
`PainelAdminLayout.tsx` e `App.tsx`. Também conferido via grep: ausência de
`avaliador`/`itens_resposta`/`relacionamentos_avaliacao`/`respondente`/
`envios_pesquisa`, ausência de tags/Insights/métricas/"Enviar", ausência de
`@mui/icons-material`/libs de drag-and-drop em `package.json`, ausência de
`.css` novo e de `style={{}}` nas telas/componentes novos.

### Nenhum achado Crítico

- **Controle de acesso**: `/pesquisas`, `/pesquisas/nova` e
  `/pesquisas/:id/editar` estão de fato dentro do mesmo bloco
  `RotaProtegida papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` que já
  envolve `/colaboradores`/`/equipes` em `App.tsx` — nenhum bloco novo sem
  guard, nenhum papel mais amplo. `RotaProtegida` só monta `<Outlet/>` (as
  páginas filhas) depois de `status === 'autenticado'` e papel confirmado, e
  todas as chamadas de dados das duas telas (`listarPesquisas`,
  `buscarPesquisa`, `listarCompetencias`) acontecem em `useEffect` das
  próprias páginas — ou seja, só disparam depois que o guard já liberou a
  montagem. `colaborador` não alcança nenhuma das 3 rotas.
- **Anonimização**: grep por `avaliador`, `itens_resposta`,
  `relacionamentos_avaliacao`, `respondente`, `envios_pesquisa` não encontrou
  nada em `frontend/src`. O construtor é 100% estrutural; `filtroRelacionamento`
  na pergunta `pessoa` é configuração de formulário (quais relacionamentos são
  selecionáveis), não dado de resposta — presença legítima, sem contagens nem
  identificação de respondente em nenhuma tela.
- **Fidelidade ao contrato reconciliado**: confirmado em código —
  `mensagemBoasVindas` (não `mensagemInicial`) e `logoUrl` presentes em
  `types/pesquisa.ts`, `pesquisasService.ts` e nos dois formulários de
  cabeçalho (criação e edição) da `PesquisaConstrutorPage`. Reordenação
  (`reordenarPaginas`/`reordenarPerguntas` em `paginasService.ts`/
  `perguntasService.ts`) sempre envia `{ itens: { id, ordem }[] }` com a
  **lista completa recalculada** do escopo (`handleMoverPagina` em
  `PesquisaConstrutorPage.tsx`, `calcularNovaOrdem`/`handleMoverPergunta` em
  `PaginaEditor.tsx`) — nunca só o item movido, nunca `{ ids: [] }`.
  `competenciaIds` é campo de nível superior em todo o fluxo (`PerguntaPayload`,
  `AtualizarPerguntaPayload`, `PerguntaMatrizEditor`, `PerguntaCard.commit`,
  `PerguntaRascunhoCard.handleSalvar`) — nunca aninhado em `configuracao`;
  editores de `likert`/`texto_aberto`/`pessoa` nunca populam esse campo.
  `configuracao` bate exatamente com o formato por tipo: `likert`/`matriz` →
  `{ niveis, rotulos }` com `niveis` clampado a 2–10
  (`NIVEIS_MIN`/`NIVEIS_MAX`) e `rotulos` sempre ajustado para o mesmo
  tamanho (`ajustarRotulosParaNiveis`); `texto_aberto` → `{}` estrito (nunca
  chave extra); `pessoa` → `{ filtroRelacionamento: string[] }` restrito às 5
  opções do `Select` (nenhuma opção fora do conjunto confirmado).
- **Escopo do MVP**: confirmada a ausência de tags, "Insights", métricas de
  envio/resposta/tempo médio, ação "Enviar" e qualquer 5º tipo de pergunta
  (nem opção de UI, nem `case`/`if` morto — `TipoPergunta` e todo `switch`/
  condicional de tipo só cobrem os 4 valores). Filtro de status é
  Rascunho/Publicada/Encerrada + "Todas" (default); ordenação só
  título A-Z/Z-A e criação recente/antiga (default recente). "Deletar" só
  visível quando `status === 'rascunho'`, "Encerrar" só quando
  `status === 'publicada'` — ambos ocultos (não desabilitados) fora disso, no
  card de `PesquisasListPage`.
- **Skill `frontend-componente-pergunta`**: editor + resposta por tipo em
  pastas próprias; nenhum dos 8 componentes de pergunta chama `apiFetch`/
  services — todos recebem dados/callbacks via props.
  `PerguntaMatrizEditor` recebe `competencias` via prop, buscada uma única
  vez em `PesquisaConstrutorPage` (`Promise.all` com `buscarPesquisa`) e
  repassada por `PaginaEditor`/`PerguntaCard`/`PerguntaRascunhoCard` — nunca
  busca sozinho.
- **Reaproveitamento**: `RotaProtegida`, `PainelAdminLayout` (só um item novo
  em `LINKS`, Drawer não duplicado), `ConfirmDialog`, `theme.ts` (via
  cores/props padrão dos componentes MUI) e o padrão `services/*Service.ts`
  sobre `apiFetch` foram reaproveitados, não recriados. Nenhuma dependência
  nova em `package.json` — reordenação usa só botões "Mover para cima/baixo".
- **Estilo**: Tailwind (layout/espaçamento, ex. `flex flex-col gap-3`,
  `grid gap-4 md:grid-cols-[240px_1fr]`) + MUI (todos os controles) em todos
  os arquivos novos; nenhum `.css` novo; nenhum `style={{}}` encontrado.
- **Estados**: carregando/vazio/erro tratados nas duas telas — skeleton de
  cards + vazio distinto com/sem filtro + `Alert`/"Tentar novamente" na
  listagem; spinner de página cheia + erro com "Tentar novamente" no
  carregamento do construtor, e "Nenhuma página ainda. Adicione a primeira."
  para pesquisa nova sem páginas. Falha pontual de salvamento é indicada
  localmente por card/seção (`Alert` inline + `CircularProgress` pequeno),
  sem loading global bloqueante.
- **Os três desvios documentados pelo desenvolvedor** (extração de
  validadores para `validacaoPergunta.ts`; `matriz`/`pessoa` como rascunho
  local não persistido; debounce de 700ms com reversão em erro) são,　na sua
  essência, escolhas razoáveis e bem justificadas — ver ressalvas abaixo em
  "Deveria corrigir" para os pontos que precisam de ajuste fino, não reversão
  da abordagem.

### Deveria corrigir

1. **Erro de exclusão de pergunta fica visualmente escondido atrás do
   `ConfirmDialog`** (`components/perguntas/PerguntaCard/PerguntaCard.tsx`,
   `handleExcluir`): em caso de falha, `erroSalvar` é setado e renderizado
   como `Alert` dentro do `CardContent`, mas o `ConfirmDialog` de exclusão
   **não recebe a prop `erro`** (diferente de `PaginaEditor.tsx` e
   `PesquisasListPage.tsx`, que passam `erro={erroExclusao}`/
   `erro={erroExcluir}`/`erro={erroEncerrar}` corretamente ao `ConfirmDialog`
   — mesmo padrão "rede de segurança" que o próprio plano pede). Como o
   diálogo continua aberto após a falha (só fecha em sucesso), o `Alert`
   fica atrás do backdrop do modal e o usuário não vê por que a exclusão
   falhou até fechar o diálogo manualmente. Ajuste: passar
   `erro={erroSalvar}` ao `ConfirmDialog` de exclusão em `PerguntaCard.tsx`
   (e considerar limpar `erroSalvar` ao reabrir o diálogo).
2. **Perda silenciosa de edição em digitação com debounce pendente**
   (`PerguntaCard.tsx`, `agendarSalvamento`/`commit` + `useEffect` de
   cleanup): o `useEffect` de desmontagem só faz `clearTimeout(timerRef.current)`,
   nunca dispara o `commit` pendente. Se o usuário editar um campo e navegar
   para fora (outra pergunta, outra página do construtor, sair da rota) antes
   dos 700ms de inatividade, a edição é descartada sem nenhum aviso — nem
   flush do commit pendente no unmount, nem indicação visual de "alteração
   não salva". Isso é exatamente o risco que a task pediu para avaliar
   criticamente; recomendo pelo menos um dos dois: (a) disparar o `commit`
   pendente no cleanup do `useEffect`, ou (b) expor um indicador visível
   (ex. "Alterações não salvas") enquanto o timer está pendente.
3. **Mesmo problema de ausência de feedback quando a validação client-side
   falha** (`PerguntaCard.commit`): `if (!valorValido(...)) return` aborta o
   `commit` silenciosamente — nem persiste, nem reverte, nem mostra erro. O
   usuário pode digitar um `niveis` fora de 2–10 (via `handleNiveisChange` o
   valor é clampado, então esse caso específico não ocorre) ou deixar um
   rótulo vazio / enunciado vazio, e simplesmente não terá nenhum retorno de
   que aquela edição nunca foi persistida — pode achar que está salva e
   navegar embora. Sugiro exibir algo como "Preencha os campos obrigatórios
   para salvar" nesse ramo, em vez de retornar em silêncio.
4. **Campos opcionais de cabeçalho não podem ser esvaziados depois de
   preenchidos** (`PesquisaConstrutorPage.tsx`, `handleCriar`/
   `handleSalvarHeader`): `mensagemHeader.trim() || undefined` e
   `logoUrlHeader.trim() || undefined` fazem com que, ao apagar o conteúdo de
   um campo que já tinha valor salvo, o corpo do `PUT` **omita** a chave
   (porque `JSON.stringify` descarta `undefined`) em vez de enviá-la como
   string vazia/`null` — e como o DTO do backend trata campo ausente como
   "não alterar" (`atualizar-pesquisa.dto.ts`), o valor antigo persiste no
   servidor mesmo com o campo visualmente vazio na UI até o próximo reload
   (quando o valor antigo reaparece). Não é uma violação do contrato de API,
   mas é uma lacuna de UX real: hoje não há como limpar `mensagemBoasVindas`/
   `logoUrl` pela tela depois de definidos uma vez.

### Sugestão

- `PerguntaCard.tsx` renderiza o editor certo por uma cadeia de `if`s em vez
  de um `switch` literal como o texto do plano descreve — puramente
  estilístico, sem efeito funcional; não bloqueia.
- Os componentes `*Resposta` (`PerguntaLikertResposta` etc.) não expõem
  validade via prop/retorno diretamente — essa lógica vive em funções soltas
  de `validacaoPergunta.ts` (`likertRespostaValida` etc.), que o futuro
  consumidor (tela pública de resposta, fora de escopo aqui) precisará
  lembrar de chamar em paralelo. Como esses componentes não são consumidos
  nesta task, isso não bloqueia agora, mas vale revisitar a ergonomia dessa
  separação quando a tela de resposta for implementada.
- Ao aumentar/diminuir `niveis` em `PerguntaLikertEditor`/
  `PerguntaMatrizEditor`, `ajustarRotulosParaNiveis` trunca rótulos além do
  novo tamanho sem aviso — comportamento correto e esperado, só um lembrete
  de UX menor (o texto do rótulo truncado se perde se o usuário depois
  aumentar `niveis` de novo).

### Conclusão

Nenhum achado Crítico. Os 4 achados "Deveria corrigir" são pontuais
(feedback de erro/estado ausente em alguns fluxos específicos, e uma lacuna
de UX para limpar campos opcionais) e não envolvem vazamento de identidade,
controle de acesso ou fidelidade ao contrato de API — a implementação pode
seguir para a etapa de `test-engineer`. Recomendo que os 4 itens de "Deveria
corrigir" sejam corrigidos em paralelo ou logo em seguida (não bloqueantes
para os testes de anonimização/controle de acesso, que são a prioridade do
`test-engineer`, mas valem uma correção rápida antes de considerar esta
task encerrada).

## Correções pós-revisão (frontend-developer)

`npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`) rodados
em `frontend/` após as 4 correções abaixo — ambos passam sem erros/avisos.
Nenhuma dependência nova, nenhum arquivo fora de `frontend/src` tocado.

1. **Erro de exclusão de pergunta escondido** — corrigido em
   `components/perguntas/PerguntaCard/PerguntaCard.tsx`: o `ConfirmDialog` de
   excluir pergunta agora recebe `erro={erroSalvar}` (mesmo padrão de
   `PaginaEditor.tsx`/`PesquisasListPage.tsx`). `erroSalvar` é limpo tanto ao
   abrir o diálogo (clique em "Excluir") quanto ao cancelá-lo, para não vazar
   um erro de salvamento de campo anterior para dentro do diálogo de
   exclusão nem persistir um erro de exclusão antigo na reabertura.
2. **Debounce de 700ms perdendo edição no unmount** — corrigido em
   `PerguntaCard.tsx`: um `pendingValorRef` guarda o último valor editado
   ainda não persistido; o `useEffect` de limpeza agora, além de cancelar o
   `setTimeout` pendente, dispara o `commit` desse valor imediatamente
   (flush) via um `commitRef` sempre atualizado com o `commit` da renderização
   mais recente (evita fechar sobre uma versão desatualizada de `pergunta`/
   `onSalvar`). Resultado: navegar para outra pergunta/página do construtor
   (ou desmontar o card por qualquer motivo) com uma edição pendente agora
   dispara a persistência em vez de descartá-la silenciosamente.
3. **Falha de validação client-side abortando sem feedback** —
   corrigido em `PerguntaCard.commit`: quando `valorValido` retorna `false`,
   em vez de `return` silencioso, o card agora seta `erroSalvar` com uma
   mensagem explicando que campos obrigatórios precisam ser preenchidos
   antes de salvar, exibida no mesmo `Alert` inline já usado para erros de
   API.
4. **Campos opcionais do cabeçalho não podiam ser esvaziados** (coordenada
   com o backend) — corrigido em `services/pesquisasService.ts` e
   `pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx`:
   - `pesquisasService.ts` agora separa o payload em dois tipos:
     `CriarPesquisaPayload` (`mensagemBoasVindas?: string`, `logoUrl?: string`
     — inalterado, usado só por `criarPesquisa`/`POST`) e
     `AtualizarPesquisaPayload` (`mensagemBoasVindas?: string | null`,
     `logoUrl?: string | null` — usado só por `atualizarPesquisa`/`PUT`).
   - `handleSalvarHeader` (modo edição, botão "Salvar alterações") agora
     envia `mensagemHeader.trim() || null` e `logoUrlHeader.trim() || null`
     — `null` explícito quando o usuário esvaziou o campo, nunca mais a
     chave omitida (`JSON.stringify` preserva chaves com valor `null`, só
     descarta `undefined`).
   - `handleCriar` (modo criação, `POST /api/pesquisas`) **não foi alterado**
     — continua usando `|| undefined` (chave omitida quando vazio). Isso é
     intencional, não um esquecimento: verifiquei
     `backend/src/modules/pesquisas/pesquisas.service.ts` (`criar`) e o
     `POST` trata `dto.mensagemBoasVindas !== undefined` chamando
     `validarTextoObrigatorio` diretamente — ou seja, um `null` explícito no
     `POST` hoje resultaria em `422 CAMPO_INVALIDO` (a função rejeita
     qualquer valor que não seja `string`). Como não existe "valor anterior a
     limpar" na criação (a pesquisa ainda não existe), omitir continua sendo
     o comportamento correto e seguro para este endpoint específico.
   - **Pendência verificada, não resolvida por mim (fora do escopo
     `frontend/`)**: conferi `backend/src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts`
     e `pesquisas.service.ts` (`atualizar`) no momento desta correção — o
     `PUT` **ainda não** aplica o padrão `'campo' in dto` a
     `mensagemBoasVindas`/`logoUrl` (só a `cicloId`); hoje ele testa
     `dto.mensagemBoasVindas !== undefined` e, se receber `null`, cai em
     `validarTextoObrigatorio(null, ...)`, que lança `422 CAMPO_INVALIDO`
     (`typeof valor !== 'string'`). Ou seja, com o frontend corrigido mas o
     backend ainda não, tentar limpar `mensagemBoasVindas`/`logoUrl` pela UI
     hoje resulta num erro 422 visível (via `Alert` em `erroHeader`), não
     mais no bug silencioso de "não salva nada". Implementei o lado do
     frontend assumindo o contrato combinado (`null` explícito = limpar) e
     **não improvisei nenhum workaround** (ex.: não mandei string vazia) —
     reportando aqui para coordenação com a correção paralela no
     `backend-developer`, como orientado.

## Revisão (2ª rodada)

Re-revisão focada nas 4 correções aplicadas após a 1ª rodada (seção
"## Revisão" acima). Arquivos lidos por inteiro nesta rodada:
`components/perguntas/PerguntaCard/PerguntaCard.tsx`,
`pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx`,
`pages/PesquisaConstrutorPage/PaginaEditor.tsx`,
`pages/PesquisaConstrutorPage/PerguntaRascunhoCard.tsx`,
`services/pesquisasService.ts`, `components/ConfirmDialog/ConfirmDialog.tsx`.
Também conferido via grep: ausência de `avaliador`/`itens_resposta`/
`relacionamentos_avaliacao`/`respondente`/`envios_pesquisa` em
`frontend/src`, ausência de novas dependências (`@mui/icons-material`,
libs de drag-and-drop) em `package.json`, ausência de `.css` novo, e que
`commitRef`/`pendingValorRef`/`AtualizarPesquisaPayload` só aparecem nos
arquivos que o desenvolvedor declarou ter tocado — escopo desta rodada
contido em `PerguntaCard.tsx`, `PesquisaConstrutorPage.tsx` e
`pesquisasService.ts`, confirmado.

### Nenhum achado Crítico

- Confirmado o contexto de backend passado junto com esta task (função
  `atualizar` de `pesquisas.service.ts` já usa `'campo' in dto` para
  `mensagemBoasVindas`/`logoUrl`) — o relato de "pendência não resolvida"
  registrado ao final da seção "Correções pós-revisão" acima está
  desatualizado; o par frontend/backend do contrato `null` explícito =
  limpar está de fato fechado nos dois lados.
- `handleCriar` (`POST`) continua usando `CriarPesquisaPayload` com
  `|| undefined` (nunca `null`) e `handleSalvarHeader` (`PUT`) usa
  `AtualizarPesquisaPayload` com `|| null` — os dois tipos são distintos
  em `pesquisasService.ts` e não há import cruzado; grep confirma que
  nenhum outro arquivo usa esses tipos, então não há caminho para `null`
  vazar para o `POST`.
- **Sem regressão do risco "campo não tocado vira `null`"**: o cabeçalho é
  um formulário único (`titulo`/`mensagemBoasVindas`/`logoUrl` editados nos
  mesmos três `TextField`, um botão "Salvar alterações"), com os três
  estados (`tituloHeader`/`mensagemHeader`/`logoUrlHeader`) inicializados a
  partir do `Pesquisa` carregado (`dadosPesquisa.mensagemBoasVindas ?? ''`,
  linha ~69-70) e sempre reenviados por inteiro no `PUT`. Ou seja: um campo
  "não tocado" reenvia seu próprio valor carregado (não vira `null` por
  omissão/default) — `null` só é enviado quando o campo já estava vazio ou
  foi explicitamente esvaziado pelo usuário. O cenário de risco descrito na
  tarefa ("PUT que só muda o título apaga `mensagemBoasVindas` de tabela")
  não se aplica a este desenho de formulário único; não há PATCH
  campo-a-campo do cabeçalho que pudesse confundir "ausente" com "vazio".
- **Controle de acesso, anonimização, contrato reconciliado (tipos de
  pergunta, `configuracao` por tipo, `competenciaIds` fora de
  `configuracao`, reordenação com payload completo), escopo do MVP e stack
  de estilização**: nada disso foi tocado nesta rodada de correções (fora
  dos 3 arquivos already declarados) — reconfirmado sem achados novos.

### Deveria corrigir

1. **Correção 2 (flush no unmount) fecha a perda silenciosa de edição, mas
   introduz/mantém uma corrida de escrita sem proteção**
   (`PerguntaCard.tsx`): nem o `commit` disparado pelo debounce normal nem
   o flush do `useEffect` de limpeza verificam se já existe uma requisição
   `onSalvar` em voo antes de disparar outra — não há nenhum lock/fila.
   Cenário concreto: usuário edita o campo A → debounce agenda e depois
   dispara `commit(A)`, que fica em voo (rede lenta); antes dessa
   requisição resolver, o usuário edita o campo B → um novo timer é
   agendado para B; se o usuário navegar para fora (ou o card desmontar)
   antes dos 700ms de B, o flush do unmount dispara `commit(B)`
   **imediatamente**, sem esperar a requisição de A terminar. As duas
   requisições passam a correr em paralelo sem ordem garantida — se a de B
   responder antes da de A (razoável, já que B não tem debounce residual
   nenhum e A já estava em rede lenta), o valor final persistido no
   servidor fica sendo o mais antigo (A), sobrescrevendo silenciosamente a
   edição mais recente do usuário (B) sem qualquer erro visível (a
   requisição de A "termina com sucesso" depois, tecnicamente). Isso não é
   inteiramente novo (o mesmo risco já existiria com dois `commit`s de
   debounce consecutivos sob rede lenta o suficiente), mas a correção desta
   rodada adiciona um gatilho adicional que dispara exatamente no momento
   de navegação/desmontagem — o ponto que a própria correção deveria
   blindar. Sugestão de encaminhamento (não é para o revisor implementar):
   um guard simples (ex. só permitir novo `commit` quando `salvando` for
   `false`, reagendando o flush/timer em vez de disparar em paralelo) ou
   serializar chamadas via uma fila/`Promise` encadeada.

### Sugestão

- `commit`, quando chamado via flush do unmount, ainda executa
  `setSalvando(true)`/`setErroSalvar(...)`/`setValorAtual(...)` de forma
  assíncrona após o componente já ter desmontado (a requisição continua em
  voo depois do `return` do cleanup). Em React 18+/19 isso não produz mais
  o warning clássico de "state update on unmounted component" no console
  (removido pelo React), então não é um bug observável hoje — só um
  lembrete de que esse `setState` pós-unmount é trabalho descartado, caso
  o guard de corrida sugerido acima venha a ser implementado.
- `PerguntaCard`: ao clicar "Excluir", `erroSalvar` é limpo
  incondicionalmente antes de abrir o `ConfirmDialog` — se o usuário tinha
  um erro de validação de campo ainda não corrigido (ver Correção 3) e
  clica "Excluir" em seguida (sem ter salvo com sucesso), esse erro some
  da tela ao cancelar a exclusão, sem indicar que o campo continua
  inválido/não salvo. Comportamento aceitável (a correção 1 pedia
  exatamente esse clear), só um lembrete de UX menor, não bloqueia.

### Conclusão (2ª rodada)

Nenhum achado Crítico. As correções 1, 3 e 4 fecham integralmente os
achados correspondentes da 1ª rodada, sem regressão nos invariantes de
controle de acesso, anonimização, contrato de API, escopo do MVP ou stack
de estilização — escopo desta rodada ficou contido nos 3 arquivos
declarados. A correção 2 resolve o problema original (perda silenciosa de
edição pendente no unmount) mas expõe um risco residual de corrida de
escrita (ordem de persistência indefinida entre um `commit` em voo e um
flush disparado logo em seguida) — registrado acima como novo item
"Deveria corrigir", não bloqueante para a etapa de `test-engineer` (não
envolve vazamento de identidade nem controle de acesso), mas recomendo
que seja endereçado antes de considerar esta task totalmente encerrada,
já que trata de integridade de dados do construtor. **Frontend liberado
para seguir aos testes.**
