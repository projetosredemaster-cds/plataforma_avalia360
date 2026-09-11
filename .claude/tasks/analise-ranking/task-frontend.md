# Task: Módulo Análise — tela "Ranking" — Frontend

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano). Não
toca `backend/`. Base obrigatória, lida por completo antes deste plano:
`.claude/tasks/analise-ranking/spec.md` (todas as decisões, FECHADAS) e
`.claude/tasks/analise-ranking/task-backend.md` (contrato definitivo de
`GET /api/analise/ranking`, shapes `RankingAvaliadoLinha`/`RankingEquipeLinha`,
códigos de erro). **O contrato de API está FECHADO — este plano só o consome,
não o reabre.** Precedente direto de padrão de código (Ranking é a terceira
tela do mesmo módulo): `AnaliseVisaoGeralPage`, `AnaliseAvaliacoesPage` e todo
`frontend/src/components/analise/`.

---

## LEMBRETE CRÍTICO — nenhuma regra de negócio sensível vive no frontend

> Agregação, anonimização, cálculo de nota, decisão de "dados insuficientes" e
> cálculo de posição/empate **já chegam prontos da API**. O frontend só
> formata e exibe. Isso é ainda mais importante em Ranking do que nas duas
> telas anteriores do módulo, porque o risco aqui é sutil: uma nota agregada
> ordenada convida a "completar a conta" (ex.: comparar a média de uma equipe
> com a de outra e tentar inferir a nota de um membro por subtração).

Consequências práticas, aplicadas neste plano:

- **Nenhum componente recebe ou exibe contagem exata de respondentes/membros.**
  A API só manda booleanos (`paresInsuficiente`/`subordinadoInsuficiente` no
  modo avaliado; `dadosInsuficientesLikert`/`dadosInsuficientesMatriz` no modo
  equipe). Se, durante a implementação, parecer que "seria mais claro com um
  número", isso é sinal de erro de design — vira pergunta ao usuário, nunca um
  campo novo inventado ou pedido informalmente à API.
- **`EstadoAguardandoMinimo` (`frontend/src/components/analise/
  EstadoAguardandoMinimo/EstadoAguardandoMinimo.tsx`) NÃO é reaproveitável
  aqui** — sua própria assinatura de props (`totalRespondentes`,
  `minimoNecessario`) violaria a regra acima. Ranking usa um componente novo,
  `RankingDadosInsuficientesTag`, sem nenhuma prop numérica.
- **Nenhuma ordenação é recalculada no cliente.** Trocar coluna/direção de
  ordenação sempre reenvia `ordenarPor`/`ordem` como query param e refaz a
  busca no backend — nunca um `.sort()` local sobre uma lista já carregada.
- **Nenhum `.sort()`/`.reverse()` em nenhum arquivo desta feature**, nem sobre
  `linhas` (já vem ordenada e com posição calculada) nem sobre nenhum array
  derivado.
- **Fonte dos dados (identificado vs. agregado) — declaração explícita**:
  `RankingAvaliadoLinha` identifica o **avaliado** (`avaliadoId`/
  `avaliadoNome`) — isso é esperado e correto, o ranking é sobre quem está
  sendo avaliado. O que nunca é identificado é o **avaliador** de relações
  `pares`/`subordinado`: nenhum campo de nenhum shape desta feature contém
  `avaliadorId`/nome de avaliador. `RankingEquipeLinha` não identifica nem
  indivíduo nenhum (é por equipe). Nenhuma tela desta feature tenta combinar
  `avaliadoNome` com posição/nota para "completar" a identidade de quem
  respondeu como pares/subordinado — essas duas coisas são estruturalmente
  independentes no payload.

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `frontend/src/types/analise.ts` (existente): hoje tem `VisaoGeralAnalise` (100%
  agregado) e o bloco de "Avaliações" (payload misto identificado/agregado).
  Ranking ganha um terceiro bloco, com comentário de topo próprio (o payload
  de Ranking não é nem "100% agregado sem identidade" nem "misto por
  pergunta" — é "identidade do avaliado + nota agregada com gate próprio",
  um terceiro formato que merece sua própria explicação).
- `frontend/src/services/analiseService.ts` (existente): duas funções soltas
  (`buscarVisaoGeralAnalise`, `buscarAvaliacoesAnalise`) sobre `apiFetch<T>`,
  `URLSearchParams` montado a mão, parâmetros opcionais via `query.set`
  condicional. `buscarRankingAnalise` entra no mesmo arquivo, mesmo estilo —
  não há razão para um arquivo de service dedicado (o frontend não tem o
  argumento de "guard rail por arquivo" que separa `analise-ranking.service.ts`
  no backend; aqui é só transporte HTTP).
- `frontend/src/components/analise/` (existente): `SeletorCiclo` (dropdown com
  opção "Todos os ciclos", `value=""` → `null`), `MetricaCard` (stat tile, não
  serve para tabela), `EstadoAguardandoMinimo` (não reaproveitável, ver
  "Lembrete crítico"), `AvisoLimitacaoAnonimizacao`, `rotulosRelacionamento.ts`
  e mais três componentes de "Avaliações" — nenhum é uma tabela, nenhum serve
  para Ranking sem modificação. `RankingTabela` e
  `RankingDadosInsuficientesTag` são genuinamente novos.
- `frontend/src/components/analise/SeletorCiclo/SeletorCiclo.tsx`: `cicloId:
  string | null`, `onChange(cicloId: string | null)`, opção fixa "Todos os
  ciclos" (`value=""`). **Não será alterado** — Ranking trata `cicloId ===
  null` como "não buscar ainda" na própria página, não como "buscar todos"
  (ver decisão 4).
- `frontend/src/services/equipesService.ts` (`listarEquipes(): Promise<Equipe[]>`)
  e `frontend/src/types/colaborador.ts` (`Equipe { id, nome, totalColaboradores,
  ... }`) — usados para o filtro de equipe. Nenhum componente
  `SeletorEquipe` reaproveitável existe hoje (confirmado por grep) — o filtro
  de equipe é implementado localmente dentro de `AnaliseRankingPage`, mesmo
  nível de "pequeno duplicado local à página" já aceito no projeto (ver
  `formatadores.ts` de cada página de Análise).
- `frontend/src/constants/colaborador.ts` (`CARGO_OPCOES`, `as const` de 16
  strings) — usado para o filtro de cargo.
- `frontend/src/App.tsx`: bloco `<Route element={<RotaProtegida
  papeis={['admin','gestor_rh']} />}><Route element={<PainelAdminLayout
  />}>...` já contém `/analise/visao-geral` e `/analise/avaliacoes` (linhas
  ~31–45 hoje). Rota nova entra no mesmo nível.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: `GRUPOS`
  (`analises` → `submenus: [quantitativa, qualitativa]`);
  `quantitativa.opcoes` já tem `{ label: 'Visão Geral', to:
  '/analise/visao-geral' }` (linha ~64). `SubmenuOpcao.to?: string` já existe;
  `grupoAtivo(pathname)` já reconhece genericamente qualquer `to` novo dentro
  de um grupo `tipo === 'submenus'` — nenhuma mudança extra nessa função.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: **não é tocado**
  nesta feature — decisão fechada da spec (seção 4, item 4): Ranking, ao
  contrário de "Visão Geral"/"Avaliações", não tem atalho/deep-link a partir
  do card de Ciclo, só é acessado pelo menu lateral.
- `frontend/src/lib/apiClient.ts` (`ApiError`, `apiFetch`): `codigo` tipado
  opcional — mesmo padrão de mapeamento de código de erro já usado nas duas
  telas anteriores.
- `frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts` já tem
  `formatarPercentual(valor: number): string` (`Intl.NumberFormat('pt-BR',
  { maximumFractionDigits: 1 })` + `%`) — Ranking duplica só esta função (e
  acrescenta `formatarPosicao`) em `AnaliseRankingPage/formatadores.ts`,
  mesmo padrão de pequena duplicação local-à-página já aceito no projeto
  (`analise-avaliacoes/task-frontend.md`, decisão 11).

## Contrato de API a consumir (fechado por `task-backend.md` — não reabrir)

`GET /api/analise/ranking?cicloId=&modo=avaliado|equipe&cargo=&equipeId=&ordenarPor=likert|matriz&ordem=desc|asc`

- `cicloId` (uuid, **obrigatório**). `modo` (`'avaliado'|'equipe'`, default
  `'avaliado'`). `cargo` (um de `CARGO_COLABORADOR_VALORES`/`CARGO_OPCOES`,
  **incompatível com `modo=equipe`**). `equipeId` (uuid, combinável com
  `cargo`, válido em ambos os modos). `ordenarPor` (`'likert'|'matriz'`,
  default `'likert'`). `ordem` (`'desc'|'asc'`, default `'desc'`).
- Erros: `422 CAMPO_INVALIDO` (cicloId ausente/inválido, modo/cargo/equipeId/
  ordenarPor/ordem com valor fora do enum), `404 CICLO_NAO_ENCONTRADO`,
  `422 CICLO_NAO_E_AVALIACAO_360` (ciclo existe mas não é avaliação 360),
  `422 FILTRO_INCOMPATIVEL_COM_MODO` (`cargo` + `modo=equipe`),
  `403 PAPEL_NAO_AUTORIZADO`.
- 200, modo `avaliado` → `RankingAvaliadoAnalise { cicloId, modo: 'avaliado',
  ordenarPor, ordem, linhas: RankingAvaliadoLinha[] }`, onde cada linha tem
  `posicao: number | null`, `avaliadoId`, `avaliadoNome`, `cargo: string |
  null`, `equipeNome: string | null`, `mediaLikert: number | null`,
  `mediaMatriz: number | null`, `paresInsuficiente: boolean`,
  `subordinadoInsuficiente: boolean`.
- 200, modo `equipe` → `RankingEquipeAnalise { cicloId, modo: 'equipe',
  ordenarPor, ordem, linhas: RankingEquipeLinha[] }`, onde cada linha tem
  `posicao: number | null`, `equipeId`, `equipeNome`, `mediaLikert: number |
  null`, `mediaMatriz: number | null`, `dadosInsuficientesLikert: boolean`,
  `dadosInsuficientesMatriz: boolean`.
- `linhas: []` é resposta 200 válida (universo vazio) — nunca erro.
- Nenhum estado de bloqueio por anonimização é erro HTTP — sempre `200`, o
  bloqueio é modelado nos booleanos do corpo.
- `posicao: null` (linha sem posição) sempre vem no **fim** do array já
  ordenado — o frontend nunca precisa (e nunca deve) mover essas linhas.

## Papéis com acesso

`admin` e `gestor_rh` — **idênticos**, sem nenhuma renderização condicional
por papel dentro de `AnaliseRankingPage` ou de qualquer componente novo
(mesmo princípio já fechado nas duas telas anteriores do módulo — RH/admin
não têm bypass do limiar de anonimização, então também não há nada que a UI
precise mostrar diferente entre os dois papéis). A única checagem de papel é
`RotaProtegida papeis={['admin', 'gestor_rh']}`, no nível de rota;
`colaborador` nunca alcança `/analise/ranking`.

## Decisões (com justificativa)

1. **Um único arquivo de tipos, um único arquivo de service** — mesmo
   raciocínio já usado em "Avaliações" (decisão 1 de
   `analise-avaliacoes/task-frontend.md`): o frontend não tem lógica de
   gate/anonimização própria, só tipos e uma função de transporte HTTP, então
   não há razão para isolar em arquivos novos.
2. **`cicloId` obrigatório tratado como "não buscar ainda", nunca como "buscar
   todos"** (spec seção 7, detalhe já fechado): `SeletorCiclo` não é alterado
   — continua oferecendo "Todos os ciclos" (`value=""` → `null`) porque é
   compartilhado com as duas telas anteriores, que usam `cicloId` opcional.
   `AnaliseRankingPage` interpreta `cicloId === null` como um estado próprio
   ("selecione um ciclo para ver o ranking"), renderizado no lugar do
   conteúdo, e **não dispara `buscarRankingAnalise`** nesse estado. Alterar
   `SeletorCiclo` para remover a opção "Todos" quebraria as outras duas
   telas — fora de escopo e não pedido.
3. **Alternância avaliado/equipe na MESMA página**, via `ToggleButtonGroup`
   (`avaliado` | `equipe`) dentro do mesmo `Paper` de filtros — não duas
   páginas/rotas, não dois componentes de página. `ToggleButtonGroup` em vez
   de `Tabs`: semanticamente é um filtro (troca o parâmetro `modo` da mesma
   consulta), não uma navegação por abas de conteúdo diferente — `Tabs`
   sugeriria "seções", `ToggleButtonGroup` sugere "modo de exibição", que é
   mais preciso aqui. Ambos eram aceitáveis pela spec (seção 7, item 5);
   `ToggleButtonGroup` é a escolha registrada.
4. **Trocar para `modo=equipe` limpa o filtro `cargo`, sempre, sem exceção**
   — tanto o estado local quanto o query param na URL. Isso é o que evita
   `422 FILTRO_INCOMPATIVEL_COM_MODO` no caminho feliz da UI; o mapeamento de
   erro para esse código (decisão 9) é só uma rede de segurança para um
   estado que a UI não deveria conseguir produzir sozinha (ex. URL editada à
   mão). O `TextField` de cargo fica **desabilitado** (não escondido)
   enquanto `modo === 'equipe'`, para deixar visualmente claro que o filtro
   existe mas não se aplica nesse modo.
5. **Todos os controles de filtro/ordenação buscam imediatamente ao
   `onChange`** (ciclo, modo, cargo, equipe, coluna de ordenação/direção) —
   nenhum botão "Aplicar filtro" nem `<form onSubmit>`. Diferente de
   "Visão Geral"/"Avaliações" (que têm campos de texto livre `de`/`ate` e por
   isso usam submit para não buscar a cada tecla), todo controle de Ranking é
   um select/toggle discreto — o mesmo padrão que `SeletorCiclo` já usa nas
   duas telas anteriores (`handleCicloChange` busca na hora, sem esperar
   submit). Consistente, sem introduzir um padrão de interação novo no
   módulo.
6. **Distinção de três estados por célula de nota** (nota presente / "sem
   dado" / "bloqueada por dados insuficientes"), calculada só por leitura
   direta de campos já prontos da API, nunca por uma nova regra de negócio:
   - Modo **equipe**: `mediaX === null` implica sempre
     `dadosInsuficientes{Likert|Matriz} === true` (o backend só zera a média
     quando o limiar de 5 membros não é atingido — ver task-backend.md,
     decisão 11). Então, no modo equipe, célula nula ⇒ sempre
     `RankingDadosInsuficientesTag`; não existe "sem dado" residual nesse
     modo.
   - Modo **avaliado**: `mediaX === null` pode significar "nenhuma fatia
     elegível existiu" OU "só existiu pares/subordinado e não passou no
     gate" — a spec (seção 2) deixa os dois explicitamente indistintos no
     valor de `mediaX`. Para dar algum sinal sem inventar nada, a página
     usa os booleanos já existentes `paresInsuficiente`/`subordinadoInsuficiente`
     como heurística de exibição: se `mediaX === null` e (`paresInsuficiente
     || subordinadoInsuficiente`), mostra `RankingDadosInsuficientesTag`; se
     `mediaX === null` e nenhum dos dois for `true`, mostra texto neutro "Sem
     dado". **Isso não é uma nova regra de negócio** — é o mesmo tipo de
     branch de apresentação que `GrupoParesSubordinadoCard` já faz hoje ao
     ler `grupo.liberado` para escolher entre `TextoAbertoLista` e
     `EstadoAguardandoMinimo` (nenhum cálculo novo, só leitura direta de
     campos booleanos/nulos já computados pela API). Nunca é exibido nenhum
     número nos dois casos de bloqueio/ausência.
7. **`RankingDadosInsuficientesTag` sem nenhuma prop** — mesmo espírito
   "deliberadamente burro" de `EstadoAguardandoMinimo`, levado ao extremo: nem
   `totalRespondentes`/`minimoNecessario` (que já violariam o guard rail),
   nem nenhuma outra prop, para que uma mudança futura descuidada não tenha
   "onde pendurar" um número. Renderiza sempre o mesmo `Chip` + `Tooltip`
   fixos.
8. **Sincronização de filtros com a URL via `useSearchParams`** (`cicloId`,
   `modo`, `cargo`, `equipeId`, `ordenarPor`, `ordem`) — mesmo padrão de
   "Visão Geral"/"Avaliações" para `cicloId`, estendido aqui a todos os
   parâmetros porque, diferente das duas telas anteriores, aqui não há
   `de`/`ate` (que não fazem sentido persistir/linkar da mesma forma) e todos
   os filtros restantes já são enums pequenos, seguros de colocar na URL.
   Tela linkável/recarregável com o mesmo estado.
9. **Mapeamento de erro por código**: `CICLO_NAO_ENCONTRADO` → "O ciclo
   selecionado não foi encontrado. Selecione outro ciclo."; `CICLO_NAO_E_AVALIACAO_360`
   → "Ranking só está disponível para ciclos de avaliação 360°. Selecione
   outro ciclo."; `FILTRO_INCOMPATIVEL_COM_MODO` → mensagem de fallback
   defensivo (não deveria ocorrer no caminho feliz da UI, ver decisão 4) —
   "O filtro de cargo não é compatível com o modo Equipes. Remova o filtro de
   cargo e tente novamente."; demais códigos/erros de rede → mensagem
   genérica "Não foi possível carregar o ranking.", mesmo padrão das duas
   telas anteriores.
10. **Nenhuma nova dependência** — `@mui/material` (`ToggleButton`,
    `ToggleButtonGroup`, `Table*`, `TableSortLabel`, `Chip`, `Tooltip`,
    `Skeleton`, `Alert`, `TextField`, `Typography`) e `@mui/icons-material`
    (já instalados) bastam.

## Guard rails obrigatórios (frontend-developer e revisor)

- **Nenhum campo numérico de contagem** (`totalRespondentes`, `totalMembros`
  ou qualquer variação) em nenhum tipo/prop/render desta feature — grep por
  esses nomes deve retornar zero ocorrências fora de comentário explicativo.
- **Nenhum `.sort()`/`.reverse()`** sobre `linhas` ou qualquer array derivado
  dela em nenhum arquivo novo.
- **Nenhum recálculo de posição/empate/média** no frontend — `posicao`,
  `mediaLikert`, `mediaMatriz` são sempre lidos diretamente do payload, nunca
  recomputados.
- **Troca de ordenação sempre refaz a chamada à API** com `ordenarPor`/`ordem`
  novos — nunca reordena a lista já carregada em memória.
- **`EstadoAguardandoMinimo` nunca é importado por nenhum arquivo desta
  feature.**
- **`RankingDadosInsuficientesTag` nunca recebe props.**
- **Nenhum `if (colaborador.papel === ...)` em nenhum arquivo novo** — a
  única checagem de papel é `RotaProtegida`, no nível de rota.
- **Nenhuma migração/alteração de `SeletorCiclo`** — a página trata
  `cicloId === null` localmente.
- **Estilo**: Tailwind só para layout/grid/espaçamento; MUI para os
  controles. Nenhum `.css` novo, nenhum `style={{}}` extenso.
- **Import de ícone default por arquivo individual**
  (`import XIcon from '@mui/icons-material/X'`), nunca do barrel.

---

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Implementado literalmente conforme o plano 1.1–1.9, sem nenhum desvio de
design:

- `frontend/src/types/analise.ts`: bloco `RankingAnalise` (1.1) acrescentado
  ao final, nomes de campo idênticos ao contrato fechado em
  `task-backend.md`.
- `frontend/src/services/analiseService.ts`: `buscarRankingAnalise` (1.2)
  acrescentada, mesmo estilo de `buscarVisaoGeralAnalise`/`buscarAvaliacoesAnalise`.
- `frontend/src/components/analise/RankingDadosInsuficientesTag/RankingDadosInsuficientesTag.tsx`
  (novo, 1.3): `Chip`+`Tooltip` fixos, sem nenhuma prop.
- `frontend/src/components/analise/RankingTabela/RankingTabela.tsx` (novo,
  1.4): tabela MUI única, narrowa por `dados.modo`, `formatarPercentual`/
  `formatarPosicao` duplicadas localmente (mesmo padrão já aceito no
  projeto).
- `frontend/src/pages/AnaliseRankingPage/formatadores.ts` (novo, 1.5): não
  chegou a ser importado pela página final (a tabela usa sua própria cópia
  local) — mantido no repo por já estar previsto no plano como utilitário
  local à página; não afeta build/lint (função exportada não usada em
  nenhum import não gera erro).
- `frontend/src/pages/AnaliseRankingPage/AnaliseRankingPage.tsx` (novo, 1.6):
  estado sincronizado com `useSearchParams` (`cicloId`, `modo`, `cargo`,
  `equipeId`, `ordenarPor`, `ordem`), `ToggleButtonGroup` avaliado/equipe,
  `cicloId === null` tratado como "selecione um ciclo" sem chamar a API,
  troca para `modo=equipe` zera `cargo` (estado + URL), mapeamento de erro
  por `codigo` (`CICLO_NAO_ENCONTRADO`/`CICLO_NAO_E_AVALIACAO_360`/
  `FILTRO_INCOMPATIVEL_COM_MODO`/genérico).
- `frontend/src/App.tsx` (1.7): rota `/analise/ranking` adicionada dentro do
  grupo protegido `admin`/`gestor_rh`, ao lado de `/analise/visao-geral` e
  `/analise/avaliacoes`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (1.8):
  submenu `quantitativa.opcoes` ganhou a segunda entrada `{ label:
  'Ranking', to: '/analise/ranking' }` — única mudança no arquivo.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (1.9): intocado,
  confirmado (nenhuma linha no diff).

Guard rails conferidos por leitura + grep antes de finalizar: zero
ocorrências de `totalRespondentes`/`totalMembros`/`membrosComNotaCalculavel`
em qualquer arquivo novo; `RankingDadosInsuficientesTag` sem props (só
mencionado em comentário dentro de si mesmo, explicando por que não
reaproveita `EstadoAguardandoMinimo`); `EstadoAguardandoMinimo` nunca
importado (só citado em comentário); zero `.sort()`/`.reverse()` em
`RankingTabela.tsx`/`AnaliseRankingPage.tsx`; zero checagem de papel
(`colaborador?.papel`/`useAuth()`) fora de `RotaProtegida`;
`components/analise/SeletorCiclo/SeletorCiclo.tsx` não foi tocado.

`npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
rodados dentro de `frontend/` — ambos sem nenhum erro/aviso novo introduzido
por esta task (o build só reporta o aviso pré-existente de chunk > 500kB; o
lint reporta 7 erros/2 avisos pré-existentes em `AnaliseAvaliacoesPage.tsx`,
`AnaliseVisaoGeralPage.tsx`, `CicloDetalhePage.tsx` e `CiclosListPage.tsx` —
nenhum desses arquivos foi tocado por esta task, confirmado antes de
reportar).

**Integração com o backend**: `backend/src/modules/analise/analise-ranking.service.ts`
já existe em disco (implementado em paralelo), mas `npm run build` do
backend falha hoje com 3 erros de `tsc` nesse arquivo
(`exactOptionalPropertyTypes`, linhas ~451–453 — `cargo`/`equipeId` como
`undefined` explícito não são assignáveis a props opcionais sem
`| undefined`) — não corrigido aqui por estar fora de `frontend/`/escopo
deste agente. Por causa disso, não foi possível subir os dois servidores e
testar a integração ponta a ponta manualmente nesta etapa; o frontend
consumiu o contrato exatamente como fechado em `task-backend.md` (nomes de
campo, códigos de erro), sem nenhuma suposição além do que está escrito nas
duas tasks. Recomenda-se uma verificação de integração manual assim que o
build do backend estiver limpo.

---

### 1. frontend-developer

#### 1.1 `frontend/src/types/analise.ts` (editado — acréscimo ao final)

```ts
// ---- "Ranking" (GET /api/analise/ranking) ----
// Identifica o AVALIADO (avaliadoId/avaliadoNome) — esperado e correto, o
// ranking é sobre quem está sendo avaliado. NUNCA identifica o AVALIADOR de
// relações pares/subordinado — nenhum campo de nenhuma interface abaixo
// carrega avaliadorId/nome de avaliador, e nenhum campo numérico de contagem
// de respondentes/membros existe em nenhuma condição (só os booleanos abaixo).
// `mediaLikert`/`mediaMatriz` já vêm normalizadas em percentual (0-100) e
// arredondadas pelo backend — nunca recalculadas aqui. `posicao` já vem
// calculada com semântica RANK() (empate = mesma posição) e com as linhas
// sem nota (`media* === null` na métrica de ordenação) já posicionadas no
// fim do array — nunca reordenar `linhas` no frontend.

export type ModoRanking = 'avaliado' | 'equipe'
export type MetricaRanking = 'likert' | 'matriz'
export type OrdemRanking = 'asc' | 'desc'

export interface RankingAvaliadoLinha {
  posicao: number | null
  avaliadoId: string
  avaliadoNome: string
  cargo: string | null
  equipeNome: string | null
  mediaLikert: number | null
  mediaMatriz: number | null
  paresInsuficiente: boolean
  subordinadoInsuficiente: boolean
}

export interface RankingEquipeLinha {
  posicao: number | null
  equipeId: string
  equipeNome: string
  mediaLikert: number | null
  mediaMatriz: number | null
  dadosInsuficientesLikert: boolean
  dadosInsuficientesMatriz: boolean
}

export interface RankingAvaliadoAnalise {
  cicloId: string
  modo: 'avaliado'
  ordenarPor: MetricaRanking
  ordem: OrdemRanking
  linhas: RankingAvaliadoLinha[]
}

export interface RankingEquipeAnalise {
  cicloId: string
  modo: 'equipe'
  ordenarPor: MetricaRanking
  ordem: OrdemRanking
  linhas: RankingEquipeLinha[]
}

export type RankingAnalise = RankingAvaliadoAnalise | RankingEquipeAnalise
```

Nomes de campo idênticos ao contrato fechado em `task-backend.md` — nenhuma
tradução, nenhum campo renomeado, nenhum campo novo além do que a API expõe.

#### 1.2 `frontend/src/services/analiseService.ts` (editado — acréscimo)

```ts
import type { AvaliacoesAnalise, RankingAnalise, VisaoGeralAnalise } from '../types/analise'

// ... (buscarVisaoGeralAnalise / buscarAvaliacoesAnalise já existentes, inalterados)

export interface BuscarRankingAnaliseParams {
  cicloId: string // obrigatório — a página nunca chama esta função com cicloId vazio
  modo?: 'avaliado' | 'equipe'
  cargo?: string
  equipeId?: string
  ordenarPor?: 'likert' | 'matriz'
  ordem?: 'asc' | 'desc'
}

/**
 * `GET /api/analise/ranking` — identifica o avaliado (nome/id), NUNCA o
 * avaliador de pares/subordinado; nota agregada com gate próprio, sinalizado
 * só por booleanos (`paresInsuficiente`/`subordinadoInsuficiente`/
 * `dadosInsuficientes*`), nunca por contagem. `cicloId` é obrigatório na API
 * — quem garante que só é chamada com um ciclo selecionado é a página.
 */
export function buscarRankingAnalise(params: BuscarRankingAnaliseParams): Promise<RankingAnalise> {
  const query = new URLSearchParams({ cicloId: params.cicloId })
  if (params.modo) query.set('modo', params.modo)
  if (params.cargo) query.set('cargo', params.cargo)
  if (params.equipeId) query.set('equipeId', params.equipeId)
  if (params.ordenarPor) query.set('ordenarPor', params.ordenarPor)
  if (params.ordem) query.set('ordem', params.ordem)
  return apiFetch<RankingAnalise>(`/api/analise/ranking?${query.toString()}`)
}
```

#### 1.3 `frontend/src/components/analise/RankingDadosInsuficientesTag/RankingDadosInsuficientesTag.tsx` (novo)

```tsx
import { Chip, Tooltip } from '@mui/material'

/**
 * Célula de nota bloqueada por anonimização (gate de pares/subordinado no
 * modo avaliado; limiar de 5 membros com nota calculável, por métrica, no
 * modo equipe). Deliberadamente SEM NENHUMA PROP — nem número de
 * respondentes, nem de membros, nem de nenhuma outra contagem — para que
 * nenhuma mudança futura descuidada tenha "onde pendurar" um valor sensível.
 * Não reaproveita `EstadoAguardandoMinimo` (esse exige `totalRespondentes`/
 * `minimoNecessario`, que a API de Ranking nunca expõe).
 */
export function RankingDadosInsuficientesTag() {
  return (
    <Tooltip title="Dados insuficientes para exibir essa nota sem risco de identificar quem respondeu.">
      <Chip size="small" variant="outlined" label="Dados insuficientes" />
    </Tooltip>
  )
}
```

#### 1.4 `frontend/src/components/analise/RankingTabela/RankingTabela.tsx` (novo)

Tabela MUI única, que recebe o `RankingAnalise` inteiro (discriminado por
`modo`) e narrowa internamente — evita duplicar a tabela em dois componentes
quase iguais.

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import type { MetricaRanking, OrdemRanking, RankingAnalise, RankingAvaliadoLinha, RankingEquipeLinha } from '../../../types/analise'
import { RankingDadosInsuficientesTag } from '../RankingDadosInsuficientesTag/RankingDadosInsuficientesTag'

const FORMATADOR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatarPercentual(valor: number): string {
  return `${FORMATADOR.format(valor)}%`
}

function formatarPosicao(posicao: number | null): string {
  return posicao === null ? '—' : `${posicao}º`
}

interface RankingTabelaProps {
  dados: RankingAnalise
  onOrdenarPorChange: (metrica: MetricaRanking) => void
}

/**
 * Componente "burro": `posicao`, `mediaLikert`, `mediaMatriz` e os booleanos
 * de insuficiência já vêm prontos da API. Este componente só decide QUAL
 * sub-elemento renderizar (número / "Sem dado" / `RankingDadosInsuficientesTag`)
 * a partir desses campos já computados — nunca recalcula gate, média ou
 * posição. `linhas` é renderizado na ordem recebida, nunca reordenado aqui.
 */
export function RankingTabela({ dados, onOrdenarPorChange }: RankingTabelaProps) {
  function celulaAvaliado(linha: RankingAvaliadoLinha, metrica: MetricaRanking) {
    const valor = metrica === 'likert' ? linha.mediaLikert : linha.mediaMatriz
    if (valor !== null) return <Typography variant="body2">{formatarPercentual(valor)}</Typography>
    if (linha.paresInsuficiente || linha.subordinadoInsuficiente) return <RankingDadosInsuficientesTag />
    return (
      <Typography variant="body2" color="text.secondary">
        Sem dado
      </Typography>
    )
  }

  function celulaEquipe(linha: RankingEquipeLinha, metrica: MetricaRanking) {
    const valor = metrica === 'likert' ? linha.mediaLikert : linha.mediaMatriz
    const insuficiente = metrica === 'likert' ? linha.dadosInsuficientesLikert : linha.dadosInsuficientesMatriz
    if (valor !== null) return <Typography variant="body2">{formatarPercentual(valor)}</Typography>
    if (insuficiente) return <RankingDadosInsuficientesTag />
    return (
      <Typography variant="body2" color="text.secondary">
        Sem dado
      </Typography>
    )
  }

  function cabecalhoMetrica(metrica: MetricaRanking, rotulo: string) {
    const ativo = dados.ordenarPor === metrica
    return (
      <TableCell align="right">
        <TableSortLabel
          active={ativo}
          direction={ativo ? dados.ordem : 'desc'}
          onClick={() => onOrdenarPorChange(metrica)}
        >
          {rotulo}
        </TableSortLabel>
      </TableCell>
    )
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Posição</TableCell>
            <TableCell>{dados.modo === 'avaliado' ? 'Avaliado' : 'Equipe'}</TableCell>
            {dados.modo === 'avaliado' && (
              <>
                <TableCell>Cargo</TableCell>
                <TableCell>Equipe</TableCell>
              </>
            )}
            {cabecalhoMetrica('likert', 'Média Likert')}
            {cabecalhoMetrica('matriz', 'Média Matriz')}
          </TableRow>
        </TableHead>
        <TableBody>
          {dados.modo === 'avaliado'
            ? dados.linhas.map((linha) => (
                <TableRow key={linha.avaliadoId}>
                  <TableCell>{formatarPosicao(linha.posicao)}</TableCell>
                  <TableCell>{linha.avaliadoNome}</TableCell>
                  <TableCell>{linha.cargo ?? '—'}</TableCell>
                  <TableCell>{linha.equipeNome ?? '—'}</TableCell>
                  <TableCell align="right">{celulaAvaliado(linha, 'likert')}</TableCell>
                  <TableCell align="right">{celulaAvaliado(linha, 'matriz')}</TableCell>
                </TableRow>
              ))
            : dados.linhas.map((linha) => (
                <TableRow key={linha.equipeId}>
                  <TableCell>{formatarPosicao(linha.posicao)}</TableCell>
                  <TableCell>{linha.equipeNome}</TableCell>
                  <TableCell align="right">{celulaEquipe(linha, 'likert')}</TableCell>
                  <TableCell align="right">{celulaEquipe(linha, 'matriz')}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
```

Nota: `formatarPercentual`/`formatarPosicao` duplicadas localmente (idem
decisão 10 — mesma pequena duplicação já aceita no projeto, evita um
componente importar de dentro de `pages/`).

#### 1.5 `frontend/src/pages/AnaliseRankingPage/formatadores.ts` (novo, local à página)

```ts
const FORMATADOR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Duplicado deliberado de `AnaliseVisaoGeralPage/formatadores.ts` — só o que esta tela usa. */
export function formatarPercentual(valor: number): string {
  return `${FORMATADOR.format(valor)}%`
}
```

(Usado só na mensagem de resumo/estado da página, se necessário — a tabela
tem sua própria cópia local, ver 1.4, para não depender de um import
cruzando de `components/` para `pages/`.)

#### 1.6 `frontend/src/pages/AnaliseRankingPage/AnaliseRankingPage.tsx` (novo)

Rota `/analise/ranking`, dentro do grupo protegido existente (`admin`/
`gestor_rh`, `PainelAdminLayout`).

**Estado local**, todo sincronizado com `useSearchParams` (decisão 8):

```tsx
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { RankingTabela } from '../../components/analise/RankingTabela/RankingTabela'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { CARGO_OPCOES } from '../../constants/colaborador'
import { ApiError } from '../../lib/apiClient'
import { buscarRankingAnalise } from '../../services/analiseService'
import { listarEquipes } from '../../services/equipesService'
import type { Equipe } from '../../types/colaborador'
import type { MetricaRanking, ModoRanking, OrdemRanking, RankingAnalise } from '../../types/analise'

function lerModo(valor: string | null): ModoRanking {
  return valor === 'equipe' ? 'equipe' : 'avaliado'
}
function lerMetrica(valor: string | null): MetricaRanking {
  return valor === 'matriz' ? 'matriz' : 'likert'
}
function lerOrdem(valor: string | null): OrdemRanking {
  return valor === 'asc' ? 'asc' : 'desc'
}

/**
 * Ranking de avaliados/equipes de um único ciclo de avaliação 360.
 * `mediaLikert`/`mediaMatriz`, `posicao` e os booleanos de dados
 * insuficientes já vêm prontos da API — esta página só formata/exibe e
 * reenvia filtros/ordenação como query params a cada mudança (nunca
 * recalcula nada localmente). RH/admin veem exatamente a mesma coisa, sem
 * bypass do limiar de anonimização para nenhum dos dois papéis.
 */
export function AnaliseRankingPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))
  const [modo, setModo] = useState<ModoRanking>(() => lerModo(searchParams.get('modo')))
  const [cargo, setCargo] = useState<string | null>(() => searchParams.get('cargo'))
  const [equipeId, setEquipeId] = useState<string | null>(() => searchParams.get('equipeId'))
  const [ordenarPor, setOrdenarPor] = useState<MetricaRanking>(() => lerMetrica(searchParams.get('ordenarPor')))
  const [ordem, setOrdem] = useState<OrdemRanking>(() => lerOrdem(searchParams.get('ordem')))

  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [dados, setDados] = useState<RankingAnalise | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarEquipes().then(setEquipes).catch(() => {})
  }, [])

  function sincronizarUrl(next: {
    cicloId: string | null
    modo: ModoRanking
    cargo: string | null
    equipeId: string | null
    ordenarPor: MetricaRanking
    ordem: OrdemRanking
  }) {
    const params: Record<string, string> = {}
    if (next.cicloId) params.cicloId = next.cicloId
    if (next.modo !== 'avaliado') params.modo = next.modo
    if (next.cargo && next.modo === 'avaliado') params.cargo = next.cargo
    if (next.equipeId) params.equipeId = next.equipeId
    if (next.ordenarPor !== 'likert') params.ordenarPor = next.ordenarPor
    if (next.ordem !== 'desc') params.ordem = next.ordem
    setSearchParams(params, { replace: true })
  }

  const executarBusca = useCallback(
    async (overrides?: {
      cicloId?: string | null
      modo?: ModoRanking
      cargo?: string | null
      equipeId?: string | null
      ordenarPor?: MetricaRanking
      ordem?: OrdemRanking
    }) => {
      const atual = {
        cicloId: overrides?.cicloId !== undefined ? overrides.cicloId : cicloId,
        modo: overrides?.modo ?? modo,
        cargo: overrides?.cargo !== undefined ? overrides.cargo : cargo,
        equipeId: overrides?.equipeId !== undefined ? overrides.equipeId : equipeId,
        ordenarPor: overrides?.ordenarPor ?? ordenarPor,
        ordem: overrides?.ordem ?? ordem,
      }

      // cicloId é obrigatório na API — enquanto não houver um selecionado,
      // a página fica no estado "selecione um ciclo", sem chamar a API.
      if (!atual.cicloId) {
        setDados(null)
        setErro(null)
        setCarregando(false)
        return
      }

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarRankingAnalise({
          cicloId: atual.cicloId,
          modo: atual.modo,
          cargo: atual.modo === 'avaliado' && atual.cargo ? atual.cargo : undefined,
          equipeId: atual.equipeId ?? undefined,
          ordenarPor: atual.ordenarPor,
          ordem: atual.ordem,
        })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo selecionado não foi encontrado. Selecione outro ciclo.')
        } else if (err instanceof ApiError && err.codigo === 'CICLO_NAO_E_AVALIACAO_360') {
          setErro('Ranking só está disponível para ciclos de avaliação 360°. Selecione outro ciclo.')
        } else if (err instanceof ApiError && err.codigo === 'FILTRO_INCOMPATIVEL_COM_MODO') {
          setErro('O filtro de cargo não é compatível com o modo Equipes. Remova o filtro de cargo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar o ranking.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [cicloId, modo, cargo, equipeId, ordenarPor, ordem],
  )

  useEffect(() => {
    // Carga inicial (só busca se já houver cicloId na URL) — não é dado
    // derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executarBusca()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCicloChange(novoCicloId: string | null) {
    setCicloId(novoCicloId)
    sincronizarUrl({ cicloId: novoCicloId, modo, cargo, equipeId, ordenarPor, ordem })
    executarBusca({ cicloId: novoCicloId })
  }

  function handleModoChange(novoModo: ModoRanking) {
    // Trocar para "equipe" limpa o filtro de cargo sempre (decisão 4) — sem
    // essa limpeza, a próxima busca cairia em FILTRO_INCOMPATIVEL_COM_MODO.
    const novoCargo = novoModo === 'equipe' ? null : cargo
    setModo(novoModo)
    setCargo(novoCargo)
    sincronizarUrl({ cicloId, modo: novoModo, cargo: novoCargo, equipeId, ordenarPor, ordem })
    executarBusca({ modo: novoModo, cargo: novoCargo })
  }

  function handleCargoChange(novoCargo: string | null) {
    setCargo(novoCargo)
    sincronizarUrl({ cicloId, modo, cargo: novoCargo, equipeId, ordenarPor, ordem })
    executarBusca({ cargo: novoCargo })
  }

  function handleEquipeChange(novoEquipeId: string | null) {
    setEquipeId(novoEquipeId)
    sincronizarUrl({ cicloId, modo, cargo, equipeId: novoEquipeId, ordenarPor, ordem })
    executarBusca({ equipeId: novoEquipeId })
  }

  function handleOrdenarPorChange(metrica: MetricaRanking) {
    const novoOrdem: OrdemRanking = ordenarPor === metrica ? (ordem === 'desc' ? 'asc' : 'desc') : 'desc'
    setOrdenarPor(metrica)
    setOrdem(novoOrdem)
    sincronizarUrl({ cicloId, modo, cargo, equipeId, ordenarPor: metrica, ordem: novoOrdem })
    executarBusca({ ordenarPor: metrica, ordem: novoOrdem })
  }

  return (
    <div className="flex flex-col gap-4">
      <Typography variant="h5" component="h1">
        Ranking
      </Typography>

      <Paper className="flex flex-wrap items-center gap-3 p-4">
        <SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={modo}
          onChange={(_, valor) => valor && handleModoChange(valor as ModoRanking)}
        >
          <ToggleButton value="avaliado">Avaliados</ToggleButton>
          <ToggleButton value="equipe">Equipes</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          select
          label="Cargo"
          size="small"
          disabled={modo === 'equipe'}
          value={cargo ?? ''}
          onChange={(e) => handleCargoChange(e.target.value === '' ? null : e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todos os cargos</MenuItem>
          {CARGO_OPCOES.map((opcao) => (
            <MenuItem key={opcao} value={opcao}>
              {opcao}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Equipe"
          size="small"
          value={equipeId ?? ''}
          onChange={(e) => handleEquipeChange(e.target.value === '' ? null : e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Todas as equipes</MenuItem>
          {equipes.map((equipe) => (
            <MenuItem key={equipe.id} value={equipe.id}>
              {equipe.nome}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {!cicloId && !carregando && (
        <Alert severity="info">Selecione um ciclo para ver o ranking.</Alert>
      )}

      {cicloId && carregando && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={40} />
          ))}
        </div>
      )}

      {cicloId && !carregando && erro && (
        <Alert severity="error">{erro}</Alert>
      )}

      {cicloId && !carregando && !erro && dados && dados.linhas.length === 0 && (
        <Alert severity="info">Nenhum {modo === 'avaliado' ? 'avaliado' : 'equipe'} encontrado para o ciclo/filtro selecionado.</Alert>
      )}

      {cicloId && !carregando && !erro && dados && dados.linhas.length > 0 && (
        <RankingTabela dados={dados} onOrdenarPorChange={handleOrdenarPorChange} />
      )}
    </div>
  )
}
```

**Papéis com acesso**: `admin`, `gestor_rh` — idênticos (ver seção "Papéis com
acesso" acima).

**Endpoints consumidos**: `GET /api/analise/ranking` (dados do ranking,
identifica o avaliado, nunca o avaliador de pares/subordinado — ver "Lembrete
crítico"); `GET /api/equipes` (via `listarEquipes`, só para popular o filtro
de equipe — metadado administrativo, sem relação com anonimização); `GET
/api/ciclos` (indiretamente, via `SeletorCiclo`).

**Estados tratados**: (1) sem ciclo selecionado → `Alert` "Selecione um ciclo
para ver o ranking.", sem chamar a API; (2) carregando → `Skeleton`s no lugar
da tabela; (3) erro → `Alert severity="error"` com mensagem mapeada por
`codigo` (decisão 9); (4) vazio (`linhas.length === 0`, com ciclo selecionado
e sem erro) → `Alert severity="info"`; (5) sucesso com linhas →
`RankingTabela`.

#### 1.7 `frontend/src/App.tsx` (editado)

Import de `AnaliseRankingPage` +
`<Route path="/analise/ranking" element={<AnaliseRankingPage />} />` dentro do
`<Route element={<PainelAdminLayout />}>` já existente, mesmo nível de
`/analise/visao-geral` e `/analise/avaliacoes`. Nenhuma outra linha muda.

#### 1.8 `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (editado)

Única mudança: `quantitativa.opcoes` ganha uma segunda entrada, mesmo
mecanismo já usado por "Visão Geral" (`SubmenuOpcao.to`, sem nenhuma mudança
de tipo):

```ts
{
  key: 'quantitativa',
  label: 'Quantitativa',
  opcoes: [
    { label: 'Visão Geral', to: '/analise/visao-geral' },
    { label: 'Ranking', to: '/analise/ranking' },
  ],
},
```

Nenhuma outra linha do arquivo muda — `grupoAtivo` já reconhece `opcoes[].to`
de qualquer grupo `tipo === 'submenus'` genericamente (ver "Estado atual
verificado").

#### 1.9 `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` — SEM MUDANÇA

Confirmação explícita (spec seção 4, item 4; task-backend.md não menciona
nenhum ajuste aqui): Ranking não ganha botão/atalho no card de Ciclo,
diferente de "Visão Geral"/"Avaliações". Nenhuma linha deste arquivo é
tocada por esta feature.

---

### 2. frontend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **Nenhum campo/prop numérico de contagem**: grep em todo o diff por
   `totalRespondentes`/`totalMembros`/`membrosComNotaCalculavel` — qualquer
   ocorrência fora de comentário é achado **crítico**. Confirmar que
   `RankingDadosInsuficientesTag` não recebe nenhuma prop.
2. **`EstadoAguardandoMinimo` não é importado** em nenhum arquivo novo desta
   feature (grep por `EstadoAguardandoMinimo` fora de
   `components/analise/EstadoAguardandoMinimo/`).
3. **Nenhum `.sort()`/`.reverse()`** sobre `dados.linhas` ou qualquer array
   derivado, em `RankingTabela.tsx` ou `AnaliseRankingPage.tsx`.
4. **Troca de ordenação sempre refaz a chamada à API**: confirmar que
   `handleOrdenarPorChange` chama `executarBusca({ ordenarPor, ordem })` e
   que `RankingTabela` não reordena `linhas` localmente antes de renderizar
   (a tabela mapeia o array na ordem recebida, `TableSortLabel` só dispara o
   callback do pai).
5. **`cargo` sempre limpo ao entrar em `modo=equipe`**: confirmar
   `handleModoChange` zera `cargo` tanto no estado local quanto na URL
   (`sincronizarUrl`) antes/junto da nova busca — nenhum caminho da UI deveria
   conseguir produzir `422 FILTRO_INCOMPATIVEL_COM_MODO` no uso normal.
6. **`SeletorCiclo` não foi modificado**: diff não deve tocar
   `components/analise/SeletorCiclo/SeletorCiclo.tsx`. Confirmar que
   `AnaliseRankingPage` não busca com `cicloId` nulo (early return em
   `executarBusca`) e que o estado "selecione um ciclo" é distinto de
   "carregando"/"vazio"/"erro".
7. **Distinção de célula (decisão 6)**: confirmar que, no modo `equipe`,
   célula nula sempre usa `dadosInsuficientes{Likert|Matriz}` correspondente
   à métrica certa (nunca cruzar likert com o booleano de matriz e
   vice-versa); no modo `avaliado`, confirmar que a heurística usa
   `paresInsuficiente || subordinadoInsuficiente` só como sinal de exibição,
   nunca alterando `mediaLikert`/`mediaMatriz` em si.
8. **Nenhuma checagem de papel fora de `RotaProtegida`**: grep por
   `colaborador?.papel`/`useAuth()` dentro de `AnaliseRankingPage.tsx` e
   `RankingTabela.tsx` — não deve haver nenhuma.
9. **Sincronização de URL**: confirmar que `cicloId`, `modo`, `cargo`,
   `equipeId`, `ordenarPor`, `ordem` ficam consistentes entre estado local e
   `searchParams` após cada ação (recarregar a página com a URL resultante
   deveria reproduzir o mesmo filtro/ordenação).
10. **Mensagens de erro por código** (`CICLO_NAO_ENCONTRADO`,
    `CICLO_NAO_E_AVALIACAO_360`, `FILTRO_INCOMPATIVEL_COM_MODO`) mapeadas
    corretamente, sem depender de string bruta da API para o texto exibido.
11. **`CiclosListPage.tsx` intocado** — confirmar que o diff não inclui esse
    arquivo.
12. **Build/lint**: `npm run build` (`tsc -b && vite build`) e `npm run lint`
    dentro de `frontend/` sem novos erros/avisos.
