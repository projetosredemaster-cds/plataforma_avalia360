# Task: Motor de ciclos de avaliação 360 — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário — sem
etapa de `spec` (não existe e não deve existir
`.claude/tasks/ciclos-avaliacao/spec.md`). Este plano não toca `backend/`. O
`task-backend.md` desta mesma pasta já foi lido por completo e é a fonte do
contrato de API abaixo — nenhuma rota/campo foi inventado.

## Estado atual verificado (antes do plano)

- Módulo greenfield no frontend: não existe `types/ciclo.ts`,
  `services/ciclosService.ts` nem nenhuma página/rota de ciclos hoje.
- `frontend/src/App.tsx` hoje define, dentro do bloco
  `RotaProtegida papeis={['admin','gestor_rh']}` + `PainelAdminLayout`:
  `/colaboradores`, `/colaboradores/novo`, `/colaboradores/:id/editar`,
  `/equipes`, `/pesquisas`, `/pesquisas/nova`, `/pesquisas/:id/editar`. As
  rotas novas desta task entram no **mesmo bloco existente**, nenhum bloco
  novo sem guard.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` já existe
  (`AppBar` + `Drawer` fixo com array `LINKS`) — reaproveitar, só adicionando
  `{ to: '/ciclos', label: 'Ciclos' }`. Não criar layout novo.
- `frontend/src/components/RotaProtegida/RotaProtegida.tsx` já existe e é o
  guard de papel padrão — reaproveitar com `papeis={['admin', 'gestor_rh']}`.
- `frontend/src/lib/apiClient.ts` (`apiFetch`/`ApiError`) e o padrão de
  `services/*Service.ts` (funções finas, sem lógica de negócio) já existem —
  reaproveitar.
- `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx` e
  `frontend/src/components/TabelaEstado/TabelaEstado.tsx` já existem —
  reaproveitar (`ConfirmDialog` para excluir ciclo, remover participante,
  ativar ciclo, encerrar ciclo; `TabelaEstado` para os estados de
  carregando/vazio/erro das tabelas de participantes e relacionamentos, que
  são genuinamente tabulares — diferente da listagem de pesquisas, que usa
  grid de cards).
- `frontend/src/components/pesquisas/StatusPesquisaChip/StatusPesquisaChip.tsx`
  é o precedente direto a seguir para um novo `StatusCicloChip` (mesmo
  formato: `Chip` pequeno, mapa `status → { label, color }`).
- `frontend/src/services/colaboradoresService.ts`
  (`listarColaboradores(): Promise<Colaborador[]>`, array puro, já traz
  `ativo`/`equipe`/`gestor`) e `frontend/src/services/equipesService.ts`
  (`listarEquipes(): Promise<Equipe[]>`) já existem — reaproveitar para
  popular os seletores de "adicionar participante individual" e "adicionar
  equipe inteira". Nenhuma chamada nova de "listar colaboradores ativos" —
  filtra `ativo === true` no cliente sobre o array já existente, mesmo
  critério já usado em `ColaboradorFormPage` para o `Select` de gestor.
- `frontend/src/services/pesquisasService.ts` já existe
  (`listarPesquisas`, `atualizarPesquisa`, etc.) mas seu
  `AtualizarPesquisaPayload` **não inclui `cicloId`** hoje, embora o DTO real
  do backend (`backend/src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts`,
  confirmado por leitura direta) já aceite `cicloId?: string | null` — o
  campo só não foi exposto no frontend porque o módulo de ciclos não existia
  quando `pesquisas` foi implementado. **Esta task precisa estender esse
  tipo/service** (ver 1.1) para poder vincular/desvincular pesquisa↔ciclo —
  não existe (e não deve ser criada) nenhuma rota em `ciclos-avaliacao` para
  isso; o vínculo é sempre escrito pelo lado da pesquisa
  (`PUT /api/pesquisas/:id { cicloId }`), conforme `task-backend.md` seção
  1.10 ("Tech debt: `pesquisas.ciclo_id`").
- `frontend/package.json`: sem `@mui/icons-material`, sem
  `@mui/x-date-pickers`, sem lib de drag-and-drop. Mesmo critério
  conservador das tasks anteriores: datas via `TextField type="date"` nativo
  (valor já no formato `YYYY-MM-DD` que a API espera, sem conversão), sem
  instalar nenhuma dependência nova.

## Contrato de API consumido (confirmado contra `task-backend.md`)

Base: `import.meta.env.VITE_API_URL`, via `apiFetch` (injeta
`Authorization: Bearer <token>`). Casing camelCase em toda
requisição/resposta, mesmo padrão de `colaboradores`/`equipes`/`pesquisas`.

### `ciclos-avaliacao` (novo)

- `GET /api/ciclos` → `CicloResposta[]`.
- `GET /api/ciclos/:id` → `CicloResposta` (shape plano — **sem**
  páginas/perguntas/participantes aninhados).
- `POST /api/ciclos` → body `{ nome, descricao?, dataInicio, dataFim,
  anonimizarRespostasPares?, minimoRespostasPares? }` → `201 CicloResposta`.
- `PUT /api/ciclos/:id` → mesmo shape do `POST`, todos opcionais, **sem**
  `status` → `200 CicloResposta`. Só aceito com `status === 'rascunho'`
  (`409 CICLO_NAO_EDITAVEL` caso contrário — restrição real do backend via
  `garantirCicloEditavel`, diferente do `PUT /api/pesquisas/:id`, que não
  tem essa trava).
- `DELETE /api/ciclos/:id` → `204`. Só em `rascunho`
  (`409 CICLO_NAO_REMOVIVEL` caso contrário).
- `PATCH /api/ciclos/:id/status` → body `{ status: 'ativo' | 'encerrado' }`.
  Transições válidas: `rascunho → ativo`, `ativo → encerrado`, mais nenhuma
  (`409 TRANSICAO_STATUS_INVALIDA`). Ativar sem nenhum participante →
  `422 CICLO_SEM_PARTICIPANTES`.
- `GET /api/ciclos/:id/relacionamentos` → `RelacionamentoResposta[]`
  (`{ id, avaliadorId, avaliadorNome, avaliadoId, avaliadoNome,
  tipoRelacionamento, criadoEm }`) — **dado identificado de quem avalia
  quem**, ver aviso de anonimização abaixo.

`CicloResposta`: `{ id, nome, descricao: string | null, dataInicio:
'YYYY-MM-DD', dataFim: 'YYYY-MM-DD', status: 'rascunho' | 'ativo' |
'encerrado', anonimizarRespostasPares: boolean, minimoRespostasPares:
number, criadoPor: string | null, criadoEm, atualizadoEm }`.

### `ciclo-participantes` (novo, sub-recurso `/api/ciclos/:cicloId/participantes...`)

- `GET .../participantes` → `ParticipanteResposta[]` (`{ id,
  colaboradorId, nomeCompleto, email, cargo: string | null, equipe: { id,
  nome } | null }`).
- `POST .../participantes` → body `{ colaboradorIds: string[] }` → `200`
  lista **completa atualizada** de `ParticipanteResposta[]`. Erros:
  `404 COLABORADOR_NAO_ENCONTRADO`, `422 COLABORADOR_INATIVO`,
  `409 CICLO_NAO_EDITAVEL`.
- `POST .../participantes/por-equipe` → body `{ equipeId: string }` → `200`
  lista completa atualizada (equipe sem colaboradores ativos **não é erro**,
  retorna a lista inalterada). Erros: `404 EQUIPE_NAO_ENCONTRADA`,
  `409 CICLO_NAO_EDITAVEL`.
- `DELETE .../participantes/:colaboradorId` → `204`. Erros:
  `404 PARTICIPANTE_NAO_ENCONTRADO`, `409 CICLO_NAO_EDITAVEL`.

### `pesquisas` (existente, estendido nesta task só no frontend)

- `PUT /api/pesquisas/:id` com body `{ cicloId: string | null }` (via
  `atualizarPesquisa`, ver 1.1) → vincula (`cicloId` não nulo, exige
  `pesquisas.status === 'publicada'`, senão `409 PESQUISA_NAO_PUBLICADA`) ou
  desvincula (`cicloId: null`, sem restrição de status) uma pesquisa a um
  ciclo. **Esta rota não checa o `status` do ciclo** — ver "Perguntas em
  aberto" item 2.
- `GET /api/pesquisas` (já existente, `listarPesquisas`) reaproveitado para:
  (a) descobrir se alguma pesquisa já está vinculada ao ciclo atual
  (`pesquisas.filter(p => p.cicloId === ciclo.id)`), e (b) listar candidatas
  a vincular (`status === 'publicada' && cicloId === null`). Nenhuma chamada
  nova — reaproveita o array já buscado.

Nenhuma rota desta task expõe `itens_resposta`/respostas — confirmado por
leitura do `task-backend.md` (o módulo só gera `relacionamentos_avaliacao`,
nunca respostas).

## Aviso de anonimização (obrigatório para o `frontend-developer` e o revisor)

`GET /api/ciclos/:id/relacionamentos` retorna **quem avalia quem,
identificado** (`avaliadorId`/`avaliadorNome`, `avaliadoId`/`avaliadoNome`),
inclusive para os tipos `pares`/`subordinado`. Isso é aceitável **apenas**
porque:

1. Esta tela não expõe nenhuma resposta/nota — só o vínculo estrutural
   avaliador↔avaliado↔tipo, que o próprio backend já entrega identificado a
   `admin`/`gestor_rh` (a regra de anonimização do projeto protege
   **respostas** de `pares`/`subordinado`, não a existência do
   relacionamento em si, e só protege da pessoa **avaliada**, não de
   RH/admin).
2. A tabela só pode viver dentro de `CicloDetalhePage`, atrás de
   `RotaProtegida papeis={['admin', 'gestor_rh']}` — **nunca** numa rota
   alcançável por `colaborador`, nunca reaproveitada num componente
   genérico que outra tela (ex. futura "meu ciclo" de colaborador) possa vir
   a importar sem essa proteção.
3. O campo `minimoRespostasPares` do formulário de ciclo é só um valor de
   configuração salvo/exibido como número — o frontend nunca calcula "já
   atingiu o mínimo" nem combina essa contagem com nenhuma resposta. Isso é
   regra de backend (skill `backend-anonimizacao-respostas`), fora do escopo
   desta task (que não implementa `envios_pesquisa`/`respostas`).
4. Nenhum componente desta task deve juntar a tabela de relacionamentos com
   qualquer dado de resposta — não existe endpoint de resposta ainda, então
   isso é garantido por construção, mas fica registrado explicitamente para
   quando esse módulo futuro existir.

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDA

Implementado exatamente conforme o plano abaixo (1.1–1.6), sem desvios de
escopo. Resumo:

- **Tipos/services (1.1)**: `frontend/src/types/ciclo.ts` (novo);
  `frontend/src/services/ciclosService.ts` (novo, `listarCiclos`,
  `buscarCiclo`, `criarCiclo`, `atualizarCiclo`, `removerCiclo`,
  `atualizarStatusCiclo`, `listarRelacionamentos`);
  `frontend/src/services/participantesCicloService.ts` (novo,
  `listarParticipantes`, `adicionarParticipantesIndividual`,
  `adicionarParticipantesPorEquipe`, `removerParticipante`);
  `frontend/src/services/pesquisasService.ts` (editado — `cicloId?: string |
  null` adicionado a `AtualizarPesquisaPayload`, com comentário explicando
  que é o único caminho de escrita para vincular/desvincular pesquisa↔ciclo).
- **Navegação (1.2)**: `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`
  (link "Ciclos" adicionado a `LINKS`); `frontend/src/App.tsx` (rotas
  `/ciclos`, `/ciclos/novo`, `/ciclos/:id` adicionadas dentro do bloco
  `RotaProtegida papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` já
  existente — nenhum bloco novo sem guard).
- **Componentes reaproveitáveis (1.3)**:
  `frontend/src/components/ciclos/StatusCicloChip/StatusCicloChip.tsx` (novo);
  `frontend/src/components/ciclos/rotulosTipoRelacionamento.ts` (novo).
- **`CiclosListPage` (1.4)**: `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`
  (novo) — grid de cards, busca com debounce 400ms + filtro de status
  client-side, ações "Ver detalhes"/"Excluir" (excluir só em rascunho, via
  `ConfirmDialog`), estados carregando/vazio/erro.
- **`CicloFormPage` (1.5)**: `frontend/src/pages/CicloFormPage/CicloFormPage.tsx`
  (novo) — só criação, validação client-side espelhando as regras do
  backend, navega para `/ciclos/:id` após criar.
- **`CicloDetalhePage` (1.6)**: `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`
  (novo, tela central) + `frontend/src/pages/CicloDetalhePage/CicloDadosForm.tsx`
  (subcomponente local, não exportado fora da pasta, mesmo critério de
  `PaginaEditor`) — seções "Dados do ciclo" (editável só em rascunho, trava
  real no backend), "Participantes" (tabela + adicionar por pessoa/por
  equipe, ambas via endpoints separados, ações ocultas fora de rascunho),
  "Pesquisa vinculada" (via `atualizarPesquisa`, trava de rascunho
  documentada em comentário como 100% client-side), "Ativação" (`ConfirmDialog`
  com aviso de irreversibilidade) e "Relacionamentos gerados" (só quando
  `status !== 'rascunho'`, dado identificado avaliador→avaliado→tipo — vive
  exclusivamente nesta página, atrás do guard admin/gestor_rh, nunca extraída
  para componente genérico).

Nada do escopo 1.7 ("fora de escopo explícito") foi implementado: sem
geração automática de ciclo, sem exibição de resposta/nota, sem cálculo de
"atingiu o mínimo de respostas pares" no frontend (`minimoRespostasPares` é
tratado só como `number` de formulário em `CicloFormPage`/`CicloDadosForm`),
sem motor de envios, sem edição de participantes fora de rascunho.

Nenhum desvio do plano. `npm run build` (`tsc -b && vite build`) e
`npm run lint` (`eslint .`) rodados dentro de `frontend/` sem erros.

Observação: durante a implementação constatei que
`frontend/src/pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx` e
`frontend/src/services/paginasService.ts` já estavam com alterações não
commitadas no working tree antes desta task começar (remoção do campo
`logoUrl` do formulário, correção de `criarPagina` para preencher
`perguntas: []` na resposta) — não fazem parte desta task, não foram
tocados/revertidos por mim.

#### 1.1 Tipos e services (base para todo o resto)

- `frontend/src/types/ciclo.ts` (novo):
  ```ts
  export type StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'

  export type TipoRelacionamento = 'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'

  export interface Ciclo {
    id: string
    nome: string
    descricao: string | null
    dataInicio: string // 'YYYY-MM-DD'
    dataFim: string // 'YYYY-MM-DD'
    status: StatusCiclo
    anonimizarRespostasPares: boolean
    minimoRespostasPares: number
    criadoPor: string | null
    criadoEm: string
    atualizadoEm: string
  }

  export interface Participante {
    id: string
    colaboradorId: string
    nomeCompleto: string
    email: string
    cargo: string | null
    equipe: { id: string; nome: string } | null
  }

  export interface Relacionamento {
    id: string
    avaliadorId: string
    avaliadorNome: string
    avaliadoId: string
    avaliadoNome: string
    tipoRelacionamento: TipoRelacionamento
    criadoEm: string
  }
  ```
- `frontend/src/services/ciclosService.ts` (novo): `listarCiclos`,
  `buscarCiclo(id)`, `criarCiclo(payload)`, `atualizarCiclo(id, payload)`,
  `removerCiclo(id)`, `atualizarStatusCiclo(id, status)`,
  `listarRelacionamentos(id)`. Payloads (`CriarCicloPayload`,
  `AtualizarCicloPayload`) com os mesmos campos de `CicloResposta` menos os
  gerados pelo servidor (`id`, `status`, `criadoPor`, `criadoEm`,
  `atualizadoEm`).
- `frontend/src/services/participantesCicloService.ts` (novo, sub-recurso —
  nome de arquivo segue o padrão já usado por `paginasService.ts`/
  `perguntasService.ts` para sub-recursos aninhados): `listarParticipantes
  (cicloId)`, `adicionarParticipantesIndividual(cicloId, colaboradorIds:
  string[])`, `adicionarParticipantesPorEquipe(cicloId, equipeId: string)`,
  `removerParticipante(cicloId, colaboradorId)`. As duas funções de
  "adicionar" retornam a **lista completa atualizada** de participantes
  (não um delta) — a página deve usar o retorno diretamente para atualizar o
  estado local, nunca fazer um `GET` extra logo em seguida.
- `frontend/src/services/pesquisasService.ts` (**editado**): estender
  `AtualizarPesquisaPayload` com `cicloId?: string | null` (campo já
  suportado pelo DTO real do backend, só ausente do tipo do frontend até
  agora). Nenhuma mudança de assinatura de `atualizarPesquisa` — só o tipo
  do payload ganha o campo novo. Comentário no código explicando que este é
  o único caminho de escrita para vincular/desvincular pesquisa↔ciclo (não
  existe rota equivalente em `ciclos-avaliacao`).
- Todos os services novos seguem o padrão fino de `equipesService.ts`/
  `pesquisasService.ts` — sem lógica de negócio, `apiFetch` faz o transporte.
  Nenhum service desta task deve importar nada relacionado a
  `itens_resposta`.

#### 1.2 Navegação

- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (editado):
  adicionar `{ to: '/ciclos', label: 'Ciclos' }` ao array `LINKS` existente.
  Não duplicar o layout.
- `frontend/src/App.tsx` (editado): dentro do mesmo bloco `RotaProtegida
  papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` que já envolve
  `/colaboradores`/`/equipes`/`/pesquisas`, adicionar:
  ```
  <Route path="/ciclos" element={<CiclosListPage />} />
  <Route path="/ciclos/novo" element={<CicloFormPage />} />
  <Route path="/ciclos/:id" element={<CicloDetalhePage />} />
  ```
  Sem rota alcançável por `colaborador` em nenhum caso (requisito 6).

#### 1.3 Componentes reaproveitáveis novos

- `frontend/src/components/ciclos/StatusCicloChip/StatusCicloChip.tsx`:
  mesmo formato de `StatusPesquisaChip` — `Chip` pequeno mapeando
  `rascunho → cor default "Rascunho"`, `ativo → cor success "Ativo"`,
  `encerrado → cor warning "Encerrado"`. Reaproveitado na listagem e no
  cabeçalho da tela de detalhe.
- `frontend/src/components/ciclos/rotulosTipoRelacionamento.ts`: mapa puro
  `Record<TipoRelacionamento, string>` (`autoavaliacao → "Autoavaliação"`,
  `gestor → "Gestor"`, `pares → "Pares"`, `subordinado → "Subordinado"`,
  `externo → "Externo"`), usado só para exibir a coluna "Tipo" da tabela de
  relacionamentos de forma legível. Arquivo separado (não componente) por já
  ser o padrão adotado em `validacaoPergunta.ts` para não misturar
  exportação de função/constante utilitária dentro de um arquivo de
  componente (`react-refresh/only-export-components`).

#### 1.4 Tela 1: `CiclosListPage`

- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (novo), rota
  `/ciclos`.
- **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
  comportamento entre os dois (nada no pedido distingue os dois papéis para
  esta feature). `colaborador` nunca alcança esta rota.
- Layout: grid de `Card`s, mesmo padrão visual de `PesquisasListPage`
  (reaproveitando a mesma composição Tailwind para o grid +
  `Card`/`CardContent`/`CardActions` do MUI), com busca por nome (debounce
  ~400ms) e filtro de status (Rascunho/Ativo/Encerrado + "Todas", default
  "Todas") 100% client-side sobre o array completo de `GET /api/ciclos` —
  sem paginação/filtro no servidor, mesmo padrão de `pesquisas`.
- Card: nome (`Typography variant="h6"`, `Tooltip` se truncado),
  `StatusCicloChip`, período formatado
  (`{dataInicio} — {dataFim}` via `Intl.DateTimeFormat('pt-BR')`, tratando o
  `'YYYY-MM-DD'` como data local para não deslocar um dia por fuso —
  `new Date(`${data}T00:00:00`)`, nunca `new Date(data)` puro), descrição
  (se houver, truncada) e `minimoRespostasPares`/`anonimizarRespostasPares`
  como dois `Chip`/`Typography` pequenos de metadado (ex.: "Mínimo: 3
  respondentes", "Pares anonimizados: Sim") — só exibição do valor
  configurado, nenhum cálculo.
- Ações: "Ver detalhes" (sempre visível, navega para `/ciclos/:id`);
  "Excluir" (visível **só quando `status === 'rascunho'`**, mesmo critério
  já usado para "Deletar" em `PesquisasListPage` — o backend só permite
  `DELETE` em rascunho, `409 CICLO_NAO_REMOVIVEL` caso contrário) via
  `ConfirmDialog` com o nome do ciclo, erro da API exibido literalmente
  dentro do dialog como rede de segurança.
- Botão "Novo ciclo" no topo → navega para `/ciclos/novo`.
- Estados: carregando (skeleton de cards), vazio ("Nenhum ciclo encontrado"
  + texto que muda se há filtro ativo, CTA "Novo ciclo" só na base
  realmente vazia sem filtro), erro (`Alert severity="error"` + "Tentar
  novamente").
- **Endpoints consumidos**: `GET /api/ciclos`, `DELETE /api/ciclos/:id`.

#### 1.5 Tela 2: `CicloFormPage` (criação)

- `frontend/src/pages/CicloFormPage/CicloFormPage.tsx` (novo), rota
  `/ciclos/novo`. **Só criação** — a edição de um ciclo em rascunho vive em
  `CicloDetalhePage` (1.6), não aqui (requisito 2 pede "formulário de
  criação" e requisito 5 pede "tela de detalhe" como coisas separadas; não
  há necessidade de duplicar o formulário em duas telas).
- **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
  comportamento.
- Campos, validação client-side espelhando exatamente as regras do backend
  (para evitar um `422` previsível, mas sempre exibindo o erro literal da
  API se mesmo assim ocorrer):
  - `nome` (`TextField` obrigatório, 2–255 caracteres).
  - `descricao` (`TextField multiline`, opcional, até 2000 caracteres).
  - `dataInicio`/`dataFim` (`TextField type="date"`, ambos obrigatórios;
    validação client-side `dataFim >= dataInicio`, mensagem inline se
    violado, espelhando `422 DATAS_CICLO_INVALIDAS`).
  - `minimoRespostasPares` (`TextField type="number"`, inteiro `>= 1`,
    default `3` — mesmo default do backend quando omitido).
  - `anonimizarRespostasPares` (`Switch`, default `true` — mesmo default do
    backend quando omitido). Rótulo explícito no formulário deixando claro
    que essa opção é sobre a política de exposição de respostas do ciclo (só
    texto informativo — nenhuma lógica de anonimização vive aqui).
- Botão "Criar ciclo" → `criarCiclo(payload)` → em sucesso, `navigate
  ('/ciclos/:id', { replace: true })` com o `id` retornado (ciclo nasce em
  `rascunho`, sem participantes/pesquisa vinculada — essas ações só existem
  na tela de detalhe, já que dependem de `cicloId` existir). Erro de
  validação (client-side ou da API) via `Alert` no topo, mantendo os dados
  digitados.
- Estados: enviando (botão desabilitado + "Salvando...", guarda contra duplo
  submit).
- **Endpoints consumidos**: `POST /api/ciclos`.

#### 1.6 Tela 3: `CicloDetalhePage`

- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` (novo), rota
  `/ciclos/:id`. Tela central desta feature — cobre os requisitos 3, 4 e 5.
- **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
  comportamento.
- Ao montar: `buscarCiclo(id)` + `listarParticipantes(id)` +
  `listarPesquisas()` em paralelo; `listarRelacionamentos(id)` só é chamado
  quando `ciclo.status !== 'rascunho'` (a rota existe e não daria erro em
  rascunho — mas a lista sempre estaria vazia antes da ativação, então
  evita-se a chamada). Estado geral: carregando (spinner de página cheia),
  erro de carregamento (mensagem + "Tentar novamente", sem renderizar as
  seções abaixo).

  ##### Seção "Dados do ciclo" (cabeçalho)

  - Mesmos campos de `CicloFormPage` (1.5), reaproveitando os mesmos
    `TextField`/`Switch` e a mesma validação client-side — mas como
    subcomponente local desta página (`CicloDadosForm` interno ou inline,
    não precisa ser genérico/exportado fora daqui, mesmo critério já usado
    para `PaginaEditor` em `PesquisaConstrutorPage`).
  - `StatusCicloChip` ao lado do nome.
  - **Editável apenas quando `ciclo.status === 'rascunho'`** — fora disso,
    campos em modo leitura (`disabled`, sem botão "Salvar"), com um `Alert
    severity="info"` explicando "Este ciclo está ativo/encerrado e não pode
    mais ser editado.". Isso replica uma restrição **real** do backend
    (`PUT /api/ciclos/:id` → `409 CICLO_NAO_EDITAVEL` fora de rascunho, ao
    contrário do `PUT /api/pesquisas/:id`, que não tem essa trava) — então,
    diferente do aviso equivalente em `PesquisaConstrutorPage`, aqui não é
    preciso documentar a trava como "só client-side": ela é reforçada pela
    API.
  - Botão "Salvar alterações" (só em rascunho) → `atualizarCiclo(id,
    payload)` → atualiza o estado local com a resposta.

  ##### Seção "Participantes" (requisito 3)

  - Tabela (`Table` MUI + `TabelaEstado` para carregando/vazio/erro):
    colunas nome, e-mail, cargo, equipe (`participante.equipe?.nome ??
    '—'`), ação "Remover" por linha.
  - "Remover" (só visível quando `ciclo.status === 'rascunho'`) abre
    `ConfirmDialog` → `removerParticipante(cicloId, colaboradorId)` →
    atualiza a lista local (filtra o id removido, sem novo `GET`).
  - Bloco "Adicionar participantes" (visível **só quando `ciclo.status ===
    'rascunho'`**, oculto — não só desabilitado — fora disso), com duas
    modalidades lado a lado (requisito 3 exige as duas, como endpoints
    separados):
    - **Por pessoa**: `Autocomplete multiple` do MUI sobre
      `listarColaboradores()` (reaproveitado, filtrado no cliente por
      `ativo === true` e `colaboradorId` ainda não presente em
      `participantes`), botão "Adicionar selecionados" →
      `adicionarParticipantesIndividual(cicloId, ids)` → substitui
      `participantes` pelo retorno completo da API, limpa a seleção.
    - **Por equipe**: `Select` sobre `listarEquipes()` (reaproveitado), botão
      "Adicionar equipe inteira" → `adicionarParticipantesPorEquipe(cicloId,
      equipeId)` → substitui `participantes` pelo retorno completo. Se o
      tamanho da lista não mudar (equipe sem colaboradores ativos ou todos
      já participantes — não é erro pelo contrato), mostrar um
      `Snackbar severity="info"` "Nenhum colaborador novo foi adicionado
      desta equipe." em vez de silêncio total.
  - Estado "salvando" local nos botões de adicionar/remover (não bloqueia a
    tela inteira); erro da API (`404`/`422`/`409`) em `Alert` inline na
    seção, mantendo a lista anterior.

  ##### Seção "Pesquisa vinculada" (requisito 4)

  - Calcula `pesquisaVinculada = pesquisas.find(p => p.cicloId === ciclo.id)
    ?? null` a partir do array já buscado por `listarPesquisas()` — nenhuma
    chamada extra.
  - **Se houver `pesquisaVinculada`**: exibe título + `StatusPesquisaChip` +
    link "Editar pesquisa" (`navigate('/pesquisas/:id/editar')`, reaproveita
    a tela existente) + botão "Desvincular" (visível só quando `ciclo.status
    === 'rascunho'`, ver decisão abaixo) → `atualizarPesquisa(pesquisaId, {
    cicloId: null })` → atualiza `pesquisaVinculada` local para `null`.
  - **Se não houver**: `Select` das candidatas —
    `pesquisas.filter(p => p.status === 'publicada' && p.cicloId === null)`
    — mais botão "Vincular" (desabilitado sem seleção e quando `ciclo.status
    !== 'rascunho'`) → `atualizarPesquisa(selecionadaId, { cicloId:
    ciclo.id })` → atualiza `pesquisaVinculada` local. Se a lista de
    candidatas estiver vazia, mensagem "Nenhuma pesquisa publicada
    disponível para vincular." em vez de um `Select` vazio confuso.
  - **Decisão assumida, registrada também em "Perguntas em aberto" item 2**:
    a restrição "só vincular/desvincular quando `ciclo.status ===
    'rascunho'`" é imposta **só pelo frontend** — o backend
    (`PUT /api/pesquisas/:id`) não checa o status do ciclo, só o da
    pesquisa. Comentário explícito no código sobre isso, mesmo padrão já
    usado para a trave de cabeçalho de `PesquisaConstrutorPage`.
  - Erro da API (ex. `409 PESQUISA_NAO_PUBLICADA` se a pesquisa deixou de
    ser `publicada` entre o carregamento e o clique) em `Alert` inline
    nesta seção.

  ##### Seção "Ativação" (requisito 5)

  - Botão **"Ativar ciclo"**, visível só quando `ciclo.status ===
    'rascunho'`; desabilitado com `Tooltip` "Adicione ao menos um
    participante antes de ativar." quando `participantes.length === 0`
    (espelha `422 CICLO_SEM_PARTICIPANTES`, mas o erro real da API ainda é
    exibido se o clique passar da validação client-side e falhar mesmo
    assim — ex. corrida). Ao clicar (com participantes), abre `ConfirmDialog`
    com texto explícito sobre a irreversibilidade: "Ativar este ciclo? Os
    relacionamentos de avaliação (quem avalia quem) serão gerados
    automaticamente a partir dos participantes atuais, e não será mais
    possível editar o ciclo, seus participantes ou a pesquisa vinculada
    depois disso." → `atualizarStatusCiclo(id, 'ativo')` → em sucesso,
    atualiza `ciclo.status` local e dispara `listarRelacionamentos(id)`
    (agora relevante).
  - Botão **"Encerrar ciclo"**, visível só quando `ciclo.status === 'ativo'`
    → `ConfirmDialog` ("Encerrar este ciclo?") →
    `atualizarStatusCiclo(id, 'encerrado')`.
  - Erro da API em qualquer uma das transições exibido literalmente dentro
    do `ConfirmDialog` (mesmo padrão de `erro` do `ConfirmDialog`
    reaproveitado nas outras tasks), sem fechar o dialog silenciosamente.

  ##### Seção "Relacionamentos gerados" (requisito 5, só quando `status !== 'rascunho'`)

  - Tabela (`Table` MUI + `TabelaEstado`): colunas Avaliador, Avaliado, Tipo
    (via `rotulosTipoRelacionamento`, 1.3), Data (`criadoEm` formatada).
    Sem paginação a menos que o volume se mostre um problema real (fora de
    escopo antecipar isso agora — mesmo critério conservador das outras
    tasks).
  - **Nunca renderizada quando `ciclo.status === 'rascunho'`** (a lista
    estaria vazia mesmo, mas a seção inteira fica oculta, não só "tabela
    vazia", para não sugerir uma ação incompleta).
  - Ver aviso de anonimização acima — esta é a única tabela desta task que
    expõe um vínculo avaliador→avaliado identificado, e só pode existir
    aqui.
  - **Endpoints consumidos por esta página inteira**: `GET /api/ciclos/:id`,
    `PUT /api/ciclos/:id`, `PATCH /api/ciclos/:id/status`,
    `GET /api/ciclos/:id/relacionamentos`,
    `GET|POST /api/ciclos/:cicloId/participantes`,
    `POST /api/ciclos/:cicloId/participantes/por-equipe`,
    `DELETE /api/ciclos/:cicloId/participantes/:colaboradorId`,
    `GET /api/colaboradores`, `GET /api/equipes`, `GET /api/pesquisas`,
    `PUT /api/pesquisas/:id`.

#### 1.7 Fora de escopo explícito (não implementar nesta task)

- Qualquer geração automática/atalho de criação de ciclo — criação é sempre
  manual, campo a campo (regra central do projeto).
- Qualquer exibição de resposta/nota/contagem de respondentes real — esta
  task só gera e lista o vínculo estrutural avaliador↔avaliado↔tipo, nunca
  uma resposta. Se algo nesse sentido parecer necessário, é sinal de scope
  creep — parar e perguntar, não implementar.
- Qualquer cálculo de "atingiu o mínimo de respostas pares" no frontend —
  `minimoRespostasPares` é só um valor de configuração exibido/editado, a
  decisão de liberar dados agregados é 100% backend (skill
  `backend-anonimizacao-respostas`, fora do escopo desta task, que nem
  implementa respostas).
- Motor de envios (`envios_pesquisa`) — não existe ainda; nenhuma ação
  "Enviar pesquisa aos participantes" nesta task.
- Edição de `equipeId`/lista de participantes fora de `rascunho` — a UI
  esconde as ações, não apenas desabilita.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Controle de acesso**: `/ciclos`, `/ciclos/novo` e `/ciclos/:id` estão
   de fato dentro do bloco `RotaProtegida papeis={['admin', 'gestor_rh']}`
   existente em `App.tsx` (nenhum bloco novo sem guard), e nenhuma chamada a
   `GET /api/ciclos`/`GET /api/ciclos/:id`/`GET /api/ciclos/:id/relacionamentos`
   dispara antes de `useAuth().status === 'autenticado'` com papel
   confirmado.
2. **Tabela de relacionamentos é dado identificado e só pode viver em
   `CicloDetalhePage`**: confirmar que `Relacionamento`/
   `listarRelacionamentos` não foi extraído para nenhum componente
   genérico reaproveitável fora desta página, e que nenhuma tela alcançável
   por `colaborador` importa esse service ou tipo.
3. **Nenhum cálculo de anonimização/mínimo de respostas no frontend**: grep
   por qualquer lógica que compare `minimoRespostasPares` com uma contagem
   de respostas (não deveria existir nada — não há endpoint de resposta
   ainda, mas vale confirmar que `minimoRespostasPares` é tratado só como
   `number` de formulário, nunca usado em um `if` de liberação de dado).
4. **Vínculo pesquisa↔ciclo usa exclusivamente `PUT /api/pesquisas/:id`**:
   confirmar que não foi inventada nenhuma rota nova em `ciclosService.ts`
   para isso (ex. um fictício `POST /api/ciclos/:id/pesquisa`) — o único
   caminho de escrita é `atualizarPesquisa(pesquisaId, { cicloId })`.
5. **Trava "vincular/desvincular pesquisa só em rascunho" documentada como
   client-side**: o código deixa explícito (comentário) que essa trava não
   tem correspondência no backend para este `PUT` específico — mesmo
   critério já usado em `PesquisaConstrutorPage` para a trava de cabeçalho.
6. **Participantes/dados do ciclo só editáveis em rascunho, e a trava aqui
   é real no backend**: `PUT /api/ciclos/:id` e as 3 rotas de
   `ciclo-participantes` retornam `409 CICLO_NAO_EDITAVEL` fora de
   rascunho — os botões correspondentes ficam **ocultos** (não só
   desabilitados) fora de rascunho, mas o revisor deve confirmar que isso
   não é tratado como "proteção suficiente" para pular o tratamento de erro
   — um 409 inesperado (ex. corrida com outra aba ativando o ciclo) ainda
   precisa aparecer como `Alert`/erro no `ConfirmDialog`, nunca falhar
   silenciosamente.
7. **Ativar ciclo é irreversível e tem `ConfirmDialog` com texto que deixa
   isso claro** (gera relacionamentos, trava edição) — não é um botão de
   ação trivial sem confirmação.
8. **Participantes: as duas modalidades (individual e por equipe) usam os
   dois endpoints separados corretos**, nunca simulando "por equipe"
   client-side chamando o endpoint individual várias vezes (o backend já
   resolve isso do lado dele, incluindo o filtro de `ativo`).
9. **`equipe sem colaboradores ativos` não é tratado como erro** — só um
   aviso informativo quando a lista não muda de tamanho.
10. **`CicloFormPage` só cria** — nenhuma lógica de edição foi duplicada
    lá; edição vive inteiramente em `CicloDetalhePage`.
11. **Datas tratadas como `'YYYY-MM-DD'` sem conversão de fuso horário**:
    `TextField type="date"` lê/escreve o formato nativo diretamente: ao
    formatar para exibição, usa `new Date(`${data}T00:00:00`)` (nunca
    `new Date(data)` puro, que pode deslocar um dia dependendo do fuso do
    navegador).
12. **Estados tratados** (carregando/vazio/erro) presentes nas 3 telas,
    incluindo o caso "ciclo novo sem nenhum participante ainda" e falha
    pontual de ações granulares (indicador local, não loading global
    bloqueante).
13. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
    `style={{}}` extenso; nenhuma dependência nova instalada (em particular,
    nenhuma lib de date-picker ou `@mui/icons-material` — datas via
    `TextField type="date"` nativo).
14. **Reaproveitamento confirmado**: `ConfirmDialog`, `TabelaEstado`,
    `RotaProtegida`, `PainelAdminLayout` (só `LINKS` editado),
    `colaboradoresService.listarColaboradores`, `equipesService.listarEquipes`,
    `pesquisasService.listarPesquisas`/`atualizarPesquisa` (tipo estendido)
    — nenhum desses recriado do zero.

## Perguntas em aberto

Decisões de UX/produto que os requisitos não cobriram literalmente e que
valem confirmação explícita do usuário — a implementação segue as decisões
assumidas acima, mas sinalizando aqui para não passar despercebido (mesmo
critério do `task-backend.md` desta feature, que já registra 4 pendências
equivalentes do lado backend):

1. **Ativar um ciclo sem nenhuma pesquisa vinculada não é bloqueado nesta
   proposta** — o backend também não bloqueia isso (`task-backend.md`,
   pendência 4), e este plano segue o mesmo critério no frontend (botão
   "Ativar" só checa participantes, nunca pesquisa vinculada). Se o usuário
   quiser exigir uma pesquisa publicada vinculada antes de ativar, isso muda
   tanto este plano quanto o backend.
2. **Vincular/desvincular pesquisa a um ciclo fica restrito a `ciclo.status
   === 'rascunho'` nesta proposta, mas essa restrição é 100% client-side**
   — `PUT /api/pesquisas/:id` não valida o status do ciclo, só o da
   pesquisa. Se o usuário quiser permitir trocar a pesquisa vinculada de um
   ciclo já ativo (por exemplo, corrigir um vínculo errado sem poder editar
   mais nada do ciclo), isso é tecnicamente possível hoje via API mesmo sem
   essa trava de UI — vale confirmar se o comportamento pretendido é
   bloquear (como este plano assume) ou permitir.
3. **Nenhuma tela impede a mesma pesquisa de ser reaproveitada em múltiplos
   ciclos ao longo do tempo, nem impede (por acidente futuro de outra
   task) que duas pesquisas apontem para o mesmo `cicloId` simultaneamente**
   — o contrato de backend não modela essa relação como 1:1 explícita. Este
   plano assume que na prática só existe 0 ou 1 pesquisa com
   `cicloId === ciclo.id` em um dado momento (decorrência natural do fluxo
   de UI: só se vincula uma pesquisa `publicada` sem `cicloId`), mas se essa
   invariante for violada por fora da UI (ex. chamada direta à API), a seção
   "Pesquisa vinculada" mostraria só a primeira encontrada — sinalizado, não
   tratado como erro nesta task.
4. **`CicloDetalhePage` permite editar `nome`/`descricao`/datas/
   `minimoRespostasPares`/`anonimizarRespostasPares` depois da criação**
   (via `PUT /api/ciclos/:id`, quando em rascunho) — o pedido original só
   menciona "formulário de criação" e "tela de detalhe com botão Ativar",
   sem pedir explicitamente edição pós-criação. Este plano inclui essa
   edição por ser um complemento natural já suportado pelo backend (mesmo
   padrão do cabeçalho editável de `PesquisaConstrutorPage`), mas é uma
   extensão não pedida literalmente — confirmar se é desejada.
5. **Ação "Excluir ciclo" na listagem** (`DELETE /api/ciclos/:id`, só em
   rascunho) foi incluída por analogia direta com "Deletar pesquisa" em
   `PesquisasListPage` e por já existir no contrato de backend, mas também
   não foi pedida explicitamente nos requisitos funcionais — confirmar se
   deve mesmo aparecer na UI desta task ou se deveria ficar para uma
   iteração futura.

## Revisão

Revisão feita lendo todos os arquivos criados/modificados listados no
resumo da etapa 1 (tipos, services, navegação, componentes reaproveitáveis
e as 3 páginas) e comparando contra o plano acima e o contrato de
`task-backend.md`.

### Crítico

Nenhum achado crítico.

- **Controle de acesso**: `/ciclos`, `/ciclos/novo` e `/ciclos/:id` estão de
  fato dentro do bloco `<Route element={<RotaProtegida papeis={['admin',
  'gestor_rh']} />}>` + `<PainelAdminLayout />` já existente em `App.tsx`
  (linhas 27–40) — nenhum bloco novo, nenhuma rota fora do guard. O link
  "Ciclos" foi adicionado ao array `LINKS` já existente em
  `PainelAdminLayout.tsx`, sem novo layout. `RotaProtegida` só monta
  `<Outlet/>` (e portanto as páginas filhas, que disparam as chamadas de
  dados no `useEffect`) depois de `status === 'autenticado'` com papel
  confirmado — nenhuma chamada a `GET /api/ciclos*` dispara antes disso.
- **Tabela de relacionamentos (dado identificado)**: `Relacionamento`
  (`types/ciclo.ts`) e `listarRelacionamentos` (`ciclosService.ts`) só são
  importados por `CicloDetalhePage.tsx` — confirmado via grep, nenhum outro
  arquivo do frontend referencia esse tipo/service. A seção "Relacionamentos
  gerados" só renderiza quando `ciclo.status !== 'rascunho'` e vive
  inteiramente dentro dessa página, atrás do guard de papel. Não foi extraída
  para nenhum componente genérico.
- **Nenhum cálculo de anonimização no frontend**: `minimoRespostasPares` é
  tratado só como `string`/`number` de formulário em `CicloFormPage` e
  `CicloDadosForm` (validação `>= 1` inteiro, mesmo espelhamento do backend)
  — nunca comparado com uma contagem de respostas/respondentes. Nenhum
  `if`/lógica de "liberar dado agregado" existe no cliente.
- **Vínculo pesquisa↔ciclo usa exclusivamente `PUT /api/pesquisas/:id`**:
  `ciclosService.ts` não tem nenhuma rota de pesquisa; `CicloDetalhePage`
  chama só `atualizarPesquisa(pesquisaId, { cicloId })`/`atualizarPesquisa
  (pesquisaId, { cicloId: null })`. A trava "só em rascunho" está documentada
  como 100% client-side tanto em `pesquisasService.ts` (comentário no tipo
  `AtualizarPesquisaPayload`) quanto inline em `CicloDetalhePage`
  (`handleVincularPesquisa`).
- **Contrato de API**: `CriarCicloPayload`/`AtualizarCicloPayload` e os
  services de `ciclos-avaliacao`/`ciclo-participantes` batem exatamente com
  os paths, métodos e shapes descritos em `task-backend.md` (`GET/POST/PUT
  /api/ciclos`, `DELETE /api/ciclos/:id`, `PATCH /api/ciclos/:id/status`,
  `GET /api/ciclos/:id/relacionamentos`, as 3 rotas de
  `.../participantes...`). Confirmado por grep: `criarPesquisa`/
  `CriarPesquisaPayload` (`pesquisasService.ts`) **não** enviam `cicloId` —
  o ponto específico apontado no pedido de revisão está OK, o frontend não
  tenta mandar `cicloId` na criação de pesquisa.
- **Single-tenant**: nenhuma ocorrência de `organization_id`/`organizationId`
  em nenhum arquivo tocado (grep vazio).
- **Stack de estilização**: nenhum arquivo `.css` novo (só o
  `index.css` pré-existente, não tocado por esta task); nenhum `style={{}}`
  nas páginas/componentes novos; tudo via Tailwind (layout/espaçamento) + MUI
  (controles). Nenhuma dependência nova em `package.json` (sem
  `@mui/icons-material`, sem `@mui/x-date-pickers`) — datas via `TextField
  type="date"` nativo, exatamente como planejado.
- **Datas**: `formatarData` em `CiclosListPage`/`CicloDetalhePage` usa
  `new Date(`${data}T00:00:00`)`, nunca `new Date(data)` puro — sem risco de
  deslocamento de fuso.

### Deveria corrigir

Nenhum achado nesta categoria — ver observações abaixo, classificadas como
sugestão por não afetarem corretude/segurança.

### Sugestão

1. **Validação duplicada entre `CicloFormPage` e `CicloDadosForm`**: as
   funções `validar()` (nome 2–255, descrição ≤2000, datas, `minimoRespostasPares
   >= 1`) e os campos do formulário são praticamente idênticos nos dois
   arquivos. O plano já sancionava essa duplicação (mesmo critério de
   `PaginaEditor` em vez de um componente genérico), então não é um achado
   bloqueante — mas se o formulário de ciclo ganhar mais campos no futuro,
   vale extrair a validação para um helper compartilhado (`validacaoCiclo.ts`,
   mesmo padrão de `validacaoPergunta.ts`) para evitar as duas cópias
   divergirem silenciosamente.
2. **Botão "Vincular" desabilitado sem explicação visível**: em
   `CicloDetalhePage`, quando `ciclo.status !== 'rascunho'` e ainda não há
   pesquisa vinculada mas existem candidatas, o `Select` + botão "Vincular"
   continuam visíveis, só com o botão desabilitado (comportamento intencional
   documentado no plano) — mas, ao contrário da seção "Dados do ciclo" (que
   tem um `Alert severity="info"` explícito), não há nenhuma pista textual
   do motivo do botão estar desabilitado nesse estado. Um `Tooltip`/`Alert`
   curto ("Só é possível vincular uma pesquisa com o ciclo em rascunho.")
   deixaria o motivo óbvio, mesmo padrão já usado no botão "Ativar ciclo".
3. **Nota informativa, não um achado desta task**: `pesquisasService.ts`
   (editado nesta task só para adicionar `cicloId`) ainda declara `logoUrl`
   em `CriarPesquisaPayload`/`AtualizarPesquisaPayload`, mas
   `PesquisaConstrutorPage.tsx` (alterado fora desta task, conforme já
   sinalizado no resumo da etapa 1) não usa mais `logoUrl` em lugar nenhum.
   Isso não colide com nada implementado aqui (o campo simplesmente fica sem
   uso ativo) — só registrando para quem for revisar/limpar aquela mudança
   não relacionada.

### Conclusão

Nenhum achado crítico e nenhum achado "Deveria corrigir". A etapa pode
prosseguir para o `test-engineer`.
