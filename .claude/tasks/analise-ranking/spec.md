# Spec: Módulo Análise — tela "Ranking"

## 1. Resumo do pedido

Implementar a terceira tela do módulo Análise (`apps/api`/`apps/web` na
nomenclatura dos agentes = `backend/`/`frontend/` neste repo), chamada
"Ranking", acessível pelo menu lateral em Análises → Quantitativa (mesmo
submenu de "Visão Geral"). "Avaliações" (segunda tela, `.claude/tasks/
analise-avaliacoes/spec.md`) e "Visão Geral" (primeira tela, `.claude/tasks/
analise-visao-geral/spec.md`) já estão implementadas e servem de precedente
de padrão de código — mas o guard rail de anonimização do Ranking é
estruturalmente diferente dos dois: em vez de agregar globalmente (Visão
Geral) ou expor texto identificado/bloqueado por grupo (Avaliações), Ranking
calcula e ORDENA uma **nota agregada por avaliado/equipe**, o que introduz um
risco novo — inferência da nota de um indivíduo por diferença/exclusão a
partir da posição/nota de uma equipe (ver seção 3).

Ranking classifica, dentro de um único ciclo de avaliação 360 (obrigatório),
tanto **avaliados individuais** quanto **equipes**, com alternância na mesma
tela (não duas telas separadas), exibindo duas notas por linha — média
`likert` e média `matriz` (competências) — sempre lado a lado, nunca
combinadas em um score único. Suporta filtro por `cargo` e/ou `equipe_id`
(atributos já existentes do colaborador, combináveis em AND) e ordenação
configurável (por `likert` ou `matriz`, ascendente ou descendente, padrão
maior nota primeiro).

Esta spec foi precedida por uma rodada de esclarecimento já concluída nesta
sessão. Todas as decisões abaixo estão fechadas — não devem ser
reperguntadas. Only recomendações de detalhe menor de implementação (nome
exato de arquivo/path) ficam registradas na seção 7, no mesmo espírito da
seção 7 de `analise-avaliacoes/spec.md`.

## 2. REGRA DE CÁLCULO DO RANKING (a mais importante da feature)

Esta seção recebe destaque próprio, fora do meio de uma lista de itens,
porque é a peça de lógica mais fácil de ser simplificada incorretamente em
uma etapa posterior do pipeline (planejamento-backend, backend-developer,
code review) se não for repetida aqui.

> **O cálculo separa por tipo de relacionamento ANTES de agregar — nunca
> aplicar o filtro de mínimo sobre a nota final já consolidada.**

- **Relações 1:1 (`autoavaliacao`, `gestor` avalia liderado)**: SEMPRE entram
  na composição da nota do avaliado, independente de qualquer mínimo — não
  há terceiro a proteger nessas relações (mesmo princípio já usado na seção
  3.2 de `analise-avaliacoes/spec.md`).
- **Relações agregáveis (`pares`, `subordinado`)**: só entram na composição
  da nota do avaliado se `COUNT(DISTINCT avaliador_id)` para aquele
  avaliado + ciclo + tipo atingir `ciclos_avaliacao.minimo_respostas_pares`.
  Se não atingir, essa fatia específica fica FORA da composição — mas isso
  **não bloqueia o restante**: o avaliado continua aparecendo no ranking com
  a nota calculada a partir das fatias que entraram (1:1 sempre, mais
  pares/subordinado que passaram no gate). Sinalizar como "dados
  insuficientes" **para aquela fatia especificamente**, nunca esconder o
  avaliado inteiro do ranking.
- A composição final por avaliado pondera por quantidade de respostas (soma
  ponderada, não média simples de médias de grupo) — mesmo padrão já
  implementado em `montarGruposParesSubordinado`/composição de
  `analise-avaliacoes.service.ts`: cada query agregada retorna `SUM(pct)` +
  `COUNT(*)` por grupo, e a composição pondera em JS.
- `media = null` (nenhuma fatia elegível existiu — ex. avaliado só teve
  `pares` e não atingiu o mínimo, sem nenhuma `autoavaliacao`/`gestor` para
  aquela métrica) é um estado DISTINTO de "existiu uma fatia mas não passou
  no gate" — o primeiro é ausência de dado, o segundo é dado bloqueado por
  anonimização. Ambos resultam em "sem nota exibível" nesta versão (não há
  distinção visual entre os dois na v1 — ver seção 7), mas o cálculo interno
  não pode confundir os dois estados.

## 3. REGRA DE ANONIMIZAÇÃO (a mais sensível do projeto — seção dedicada)

> RH/admin (únicos papéis com acesso a esta tela) **NÃO têm bypass** do
> limiar `minimo_respostas_pares`. Mesma regra que qualquer outro consumidor
> do projeto — mesmo sendo os únicos com acesso. Não existe modo
> "transparência total" para ninguém, em nenhuma circunstância. Mesmo
> princípio já registrado com destaque na seção 2 de `analise-avaliacoes/
> spec.md` — repetido aqui porque cada feature nova é um ponto de risco
> independente de reintrodução do bypass por inferência ("afinal é admin,
> faz sentido ele ver tudo").

- A coluna `ciclos_avaliacao.anonimizar_respostas_pares` **não deve ser
  lida por esta feature**, em nenhuma query, em nenhuma decisão de exibição
  — já não é mais editável em lugar nenhum do sistema (ver histórico de
  commits recentes removendo o toggle de criação de ciclo). Mesma decisão já
  fechada na seção 2.1 de `analise-avaliacoes/spec.md`.
- O ranking nunca pode permitir inferir identidade individual de quem
  respondeu como `pares`/`subordinado`. **Decisão fechada de mitigação**: a
  API **não expõe o `COUNT` exato de respondentes** por tipo de
  relacionamento em nenhum payload desta feature — expõe apenas um
  **booleano** (`paresInsuficiente`/`subordinadoInsuficiente` no modo
  avaliado; `dadosInsuficientesLikert`/`dadosInsuficientesMatriz` no modo
  equipe). Isso adapta, de "texto bloqueado" (Avaliações) para "nota
  agregada bloqueada" (Ranking), o mesmo princípio já implementado em
  `analise-avaliacoes.service.ts`.
  - **Atenção, achado técnico já levantado**: o shape atual de
    `GrupoParesSubordinado` em `analise-avaliacoes.service.ts` expõe
    `totalRespondentes` mesmo quando `liberado === false` — isso **não é
    reaproveitável como está** para Ranking. Ranking precisa de um shape de
    resposta próprio, só com booleano, sem nenhum campo numérico de
    contagem de respondentes em nenhuma condição (nem liberado, nem
    bloqueado).
- **Segundo controle, específico do modo equipe — cumulativo e DIFERENTE do
  limiar de pares/subordinado**: uma equipe só exibe nota numa métrica
  (likert ou matriz) se tiver **no mínimo 5 membros com nota calculável**
  naquela métrica (nota calculável = `media !== null` para aquele membro
  naquela métrica, após o gate de pares/subordinado já ter sido aplicado
  individualmente). Este limiar de 5 é deliberadamente maior que
  `minimo_respostas_pares` (default 3) e mitiga um risco DIFERENTE: não a
  identificação de um avaliador individual (isso já é papel do limiar de
  pares/subordinado, aplicado por avaliado), mas a **inferência da nota de
  um membro por subtração** a partir da média já calculada da equipe (ex.:
  equipe de 3 membros com médias conhecidas de 2 deles permite calcular a
  do terceiro por álgebra simples). Equipe abaixo de 5 membros com nota
  calculável numa métrica → `dadosInsuficientes` **só para aquela métrica**,
  **sem expor quantos membros compõem a média** (nem o total de membros da
  equipe, nem quantos têm nota calculável).
- **O limiar de 5 membros é aplicado SEPARADAMENTE por métrica** — uma
  equipe pode ter, no mesmo ciclo, `likert` liberado (≥5 membros com nota
  likert calculável) e `matriz` insuficiente (<5 membros com nota matriz
  calculável) simultaneamente, ou o inverso. O payload de uma linha de
  equipe sempre carrega os dois booleanos de forma independente.
- Guard rail geral, reforçado com comentário no código do service (mesmo
  padrão já usado em `calcularProgressoCiclo`/`buscarVisaoGeral`): nenhuma
  query desta feature seleciona `avaliador_id` (nem qualquer coluna que
  identifique o avaliador) em nenhuma condição — o gate usa
  `COUNT(DISTINCT avaliador_id)`, nunca o valor bruto.

## 4. Decisões de produto fechadas (não reabrir)

1. **Ranking classifica AMBOS avaliados individuais e equipes**, com
   alternância (toggle/tabs) na MESMA tela — não são duas telas, não é
   navegação separada.
2. **Duas notas separadas exibidas lado a lado**: média de perguntas
   `likert` e média de perguntas `matriz` (competências, via
   `perguntas_competencias`). NUNCA combinar as duas num score único — nem
   internamente no cálculo, nem na UI.
3. Os "campos agrupáveis personalizados" da concepção original do produto
   correspondem, nesta versão, a **filtros pelos atributos já existentes do
   colaborador** (`cargo` e `equipe_id`) — não é um construtor de campos
   novos, não introduz nenhum campo de segmentação inédito.
4. **Sem atalho no card de Ciclo** (`CiclosListPage.tsx`) — diferente de
   "Visão Geral" e "Avaliações", que têm deep link a partir do card. Ranking
   só é acessado pelo menu lateral. Ainda assim, a própria tela aceita
   `cicloId` como filtro, via `SeletorCiclo` já existente
   (`frontend/src/components/analise/SeletorCiclo/SeletorCiclo.tsx`).
5. **Ordenação padrão**: maior nota primeiro (1º lugar = melhor avaliado/
   melhor equipe), com opção de inverter (ascendente) na própria tela.

## 5. Decisões de esclarecimento fechadas pelo usuário

### 5.1 Escala — normalização por percentual, por pergunta, usando o `niveis` daquela pergunta

**Fato verificado no código**: a escala de likert/matriz **não é fixa em
5**. `perguntas.configuracao` guarda `{ niveis, rotulos }`
(`backend/src/modules/perguntas/perguntas.service.ts:97`, validação
`niveis` inteiro entre 2 e 10 — o "5" é só o default de UI em
`PerguntaRascunhoCard.tsx:23`, não uma regra de negócio). `matriz` usa o
mesmo shape `{ niveis, rotulos }` por competência
(`itens_resposta.valor` = `{ "notas": { "<competenciaId>": n } }`, `1 <= n
<= niveis`, ver `coleta-respostas-publica.service.ts:367-383`). Por isso
**média bruta de notas seria aritmeticamente sem sentido** ao misturar
perguntas com escalas diferentes (ex. uma pergunta de 5 níveis e outra de 10
níveis não podem ser somadas/divididas como se fossem a mesma unidade).

**Decisão fechada**: normalizar cada resposta individual para
**percentual**, por pergunta, usando o `niveis` daquela pergunta
específica: `pct = (nota - 1) / (niveis - 1) * 100`. Toda agregação
(soma/média/composição por avaliado, por equipe) trabalha sobre esse
percentual, nunca sobre a nota bruta.

### 5.2 Desempate — mesma nota = mesma posição, semântica `RANK()` do Postgres

Empate explícito: avaliados/equipes com a mesma nota (arredondada, mesma
casa decimal de exibição) recebem a **mesma posição** exibida — semântica
`RANK()` (1º, 1º, 3º — pula a posição seguinte ao empate, não a
renumera sequencialmente). Sem critério de desempate artificial (ex. nome
alfabético, data de cadastro) para separar notas iguais.

### 5.3 Filtros `cargo`/`equipe_id` — combináveis (AND)

Cargo e equipe podem ser aplicados **simultaneamente** — semântica AND, não
OR, não mutuamente exclusivos.

### 5.4 Nota de equipe — média simples das notas já calculadas dos membros, sem fonte de dado própria

**Fato verificado no código**: não existe fonte de dado própria para "nota
de equipe". `relacionamentos_avaliacao` só liga colaborador↔colaborador via
`avaliador_id`/`avaliado_id`; não existe `equipe_id` em
`relacionamentos_avaliacao`, `respostas`, `itens_resposta` nem `perguntas`.
Equipes existem só como `colaboradores.equipe_id`
(`backend/src/modules/colaboradores/colaborador.entity.ts:38-39`).

**Decisão fechada**: a nota da equipe (por métrica) é a **média simples**
das notas já calculadas dos membros daquela equipe (que tiveram nota
calculável naquela métrica) — **não ponderada** por número de respostas de
cada membro. O agrupamento é feito em JS por `colaborador.equipeId`, sobre
as notas de avaliado já calculadas — não é uma query SQL nova, não há
`GROUP BY equipe_id` em nenhuma tabela de resposta.

### 5.5 Peso da matriz — cada competência respondida conta como 1 unidade individual, sem normalização de peso por pergunta

**Decisão fechada, assunção confirmada explicitamente pelo usuário**: na
média `matriz`, cada competência respondida (dentro de `item.valor->'notas'`
de uma pergunta matriz) conta como **1 unidade individual** na composição —
não há normalização para que cada *pergunta* matriz pese igual
independente do número de competências que ela contém. Uma pergunta matriz
com mais competências pesa mais no resultado final do que uma com menos
competências. Isso é intencional para esta versão, não uma simplificação a
corrigir — se um pedido futuro quiser peso igual por pergunta, é mudança de
produto que exige nova spec.

### 5.6 Limiar mínimo de equipe — 5 membros com nota calculável, por métrica, cumulativo com `minimo_respostas_pares`

Ver seção 3 (regra de anonimização) para o racional completo e a separação
por métrica — resumo: 5 membros com nota calculável naquela métrica
(likert ou matriz, avaliados separadamente), deliberadamente maior que
`minimo_respostas_pares` (default 3) porque são controles que mitigam riscos
diferentes e se somam (cumulativos), não se substituem.

## 6. Modelo de dados envolvido (leitura only — nenhuma tabela/coluna nova, nenhuma migration)

- **Avaliação 360**: `relacionamentos_avaliacao` (`id`, `ciclo_id`,
  `avaliador_id`, `avaliado_id`, `tipo_relacionamento`) →
  `envios_pesquisa.relacionamento_id` → `respostas.envio_id` (UNIQUE) →
  `itens_resposta.resposta_id` + `itens_resposta.pergunta_id` →
  `perguntas` (filtrar `tipo IN ('likert', 'matriz')`, usar
  `perguntas.configuracao->>'niveis'` para normalizar; `matriz` usa
  `perguntas_competencias` para o vínculo pergunta↔competência, mas a
  normalização em si só depende de `niveis`/`notas`, não da competência em
  si).
- `itens_resposta.valor` jsonb: `likert` = `{ "nota": n }`; `matriz` = `{
  "notas": { "<competenciaId>": n } }`, com `1 <= n <= niveis` — matriz
  expande via `jsonb_each_text`/LATERAL antes de normalizar (uma linha por
  competência dentro do jsonb).
- `tipo_relacionamento` (`backend/src/common/enums.ts`, `TipoRelacionamento`):
  `'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'`. Nesta
  feature, `externo` não foi mencionado explicitamente nas decisões
  fechadas — tratamento a confirmar no planejamento (ver seção 7, item de
  detalhe menor: recomendação é tratá-lo como relação 1:1 sem gate, mesmo
  critério já usado em `analise-avaliacoes` seção 3.2, mas isso é uma
  recomendação, não uma decisão já fechada pelo usuário para Ranking
  especificamente).
- `ciclos_avaliacao.minimo_respostas_pares`: smallint, default 3. Coluna
  irmã `anonimizar_respostas_pares` existe mas NÃO é lida (seção 3).
- `colaboradores.cargo` (varchar nullable) e `colaboradores.equipe_id` (uuid
  nullable, FK para `equipes`) — filtros do modo avaliado; `equipe_id` só
  (agrupamento) no modo equipe, `cargo` incompatível com modo equipe (ver
  contrato de API, seção 8).
- Nenhuma tabela nova, nenhuma coluna nova, **nenhuma migration necessária**
  — feature de leitura pura, mesmo padrão de "Visão Geral"/"Avaliações".

## 7. Recorte backend vs frontend

### Backend (`backend/`)

- Estende o módulo já existente `backend/src/modules/analise/` (mesmo
  módulo de "Visão Geral"/"Avaliações" — não criar módulo novo separado).
  Recomendação de nome de arquivo (detalhe menor, a validar no
  planejamento): `analise-ranking.service.ts`, seguindo o padrão já
  estabelecido de um arquivo de service por tela dentro do mesmo módulo
  (`analise.service.ts` para Visão Geral, `analise-avaliacoes.service.ts`
  para Avaliações).
- Sem entidade própria — reaproveita entidades existentes só para leitura
  (`RelacionamentoAvaliacao`, `EnvioPesquisa`, `Resposta`, `ItemResposta`,
  `Pergunta`, `PerguntaCompetencia`, `Colaborador`, `Equipe`,
  `CicloAvaliacao`), via `QueryBuilder`/`AppDataSource`.
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` (`analise-comum.ts`) como
  primeira linha da função de serviço exportada — sem bypass de papel para
  o gate de mínimo (seção 3), mesmo padrão de `buscarVisaoGeral`/
  `buscarAvaliacoes`.
- **`cicloId` é obrigatório** nesta tela — diferente de Visão Geral/
  Avaliações, que usam período `de`/`ate`. Ausente ou inválido → 422
  `CAMPO_INVALIDO`. O ciclo referenciado precisa ser classificado como
  avaliação 360 via `classificarPorTipo` (`analise-comum.ts`) — ciclo
  `clima_geral` ou sem pesquisa vinculada → 422 (código novo,
  `CICLO_NAO_E_AVALIACAO_360`), já que Ranking não tem significado para
  clima (sem `avaliador_id`/`avaliado_id` em `respostas_clima`).
- `calcularGateParesSubordinado` (hoje função privada em
  `analise-avaliacoes.service.ts`, ~linha 138) deve ser **extraída para
  `analise-comum.ts`** como função compartilhada, reaproveitada por Ranking
  (chamada com `ids: [cicloId]`, sem filtro de período — Ranking não tem
  filtro de período, só de ciclo).
- `montarGruposParesSubordinado` (backend) e `EstadoAguardandoMinimo`
  (frontend) **não são reaproveitáveis como estão** — expõem
  `totalRespondentes` (violaria a decisão da seção 3). Ranking precisa de
  shape de resposta próprio e de um componente novo no frontend
  (`RankingDadosInsuficientesTag` — Chip/Tooltip sem nenhum número).
- Estrutura de cálculo sugerida (dois blocos de query agregada — likert e
  matriz — mais o gate, mais a composição em JS):
  1. Query agregada `likert`: `GROUP BY avaliado_id, tipo_relacionamento`,
     `SUM(pct)` + `COUNT(*)`, com JOIN em `colaboradores` para aplicar
     filtro `cargo`/`equipe_id` na própria query (WHERE, não pós-filtro em
     JS).
  2. Query agregada `matriz`: mesma forma, mas expandindo
     `item.valor->'notas'` via `jsonb_each_text`/LATERAL antes de normalizar
     cada competência individualmente (seção 5.5 — cada competência é 1
     linha antes da agregação).
  3. Gate de pares/subordinado (função compartilhada de `analise-comum.ts`,
     ver acima) para decidir, por avaliado + tipo, se a fatia
     pares/subordinado entra na composição.
  4. Composição em JS, por avaliado: soma sempre as fatias
     `autoavaliacao`/`gestor`(/`externo`, ver nota da seção 6) de cada
     métrica; soma a fatia `pares`/`subordinado` só se o gate liberar;
     `media = SUM(pct) / COUNT(*)` sobre as fatias que entraram; `media =
     null` se nenhuma fatia elegível existiu para aquele avaliado naquela
     métrica.
  5. Modo equipe: agrupamento em JS por `colaborador.equipeId` sobre as
     notas de avaliado já calculadas (passo 4) — média simples (seção 5.4),
     com o limiar de 5 membros com nota calculável aplicado por métrica
     (seção 3) antes de expor a nota da equipe.
  6. Ordenação/posição: calculada **em memória no Node** (não `RANK()` SQL),
     já que a lista final só existe depois da composição em JS (gate +
     agrupamento). Empate = mesma semântica de `RANK()` (seção 5.2). Linhas
     sem nota (`media === null` na métrica usada para ordenar) vão para o
     fim da lista, sem número de posição atribuído.
- Reembaralhamento (Fisher-Yates, usado em Avaliações para textos) **não se
  aplica aqui** — Ranking expõe notas agregadas, não textos individuais; não
  há risco de posição estável identificar conteúdo de um respondente
  específico da mesma forma que em Avaliações. Ordem da lista é sempre pela
  ordenação escolhida (`ordenarPor`/`ordem`), estável e determinística.
- Guard rail de anonimização (seção 3) reforçado com comentário no código do
  service, mesmo padrão já existente em `calcularProgressoCiclo`/
  `buscarVisaoGeral`/`buscarAvaliacoes`.

### Frontend (`frontend/`)

- Nova página `AnaliseRankingPage` (mesmo esqueleto de
  `AnaliseVisaoGeralPage`/`AnaliseAvaliacoesPage`: `useSearchParams`,
  `Skeleton`, `Alert`), dentro do mesmo grupo protegido de rotas
  (`RotaProtegida papeis={['admin', 'gestor_rh']}`, `App.tsx`, bloco que já
  envolve `/analise/visao-geral` e `/analise/avaliacoes`, linhas ~31-46).
  Rota nova, ex. `/analise/ranking` (path exato a confirmar no
  planejamento).
- Novo componente `RankingTabela` (tabela MUI, colunas clicáveis para
  alternar `ordenarPor`/`ordem`), novo componente `RankingDadosInsuficientesTag`
  (Chip/Tooltip sem nenhum número, para as células de nota bloqueada).
- Alternância avaliado/equipe: tabs ou toggle (MUI `Tabs`/`ToggleButtonGroup`)
  na mesma página, controlando o parâmetro `modo` (seção 4, item 1) — troca
  de modo reseta filtros incompatíveis (ex. `cargo` ao entrar em modo
  equipe, ver seção 8).
- Reaproveitar: `SeletorCiclo` (`frontend/src/components/analise/
  SeletorCiclo/SeletorCiclo.tsx`) — **atenção**: hoje esse componente tem
  uma opção "Todos os ciclos" (`value=""`) porque Visão Geral/Avaliações
  usam `cicloId` opcional; Ranking exige `cicloId` obrigatório, então a
  página Ranking precisa tratar o estado "nenhum ciclo selecionado" como
  "não buscar ainda" (não como "buscar todos"), em vez de estender o
  componente — detalhe de implementação a confirmar no planejamento
  (recomendação: não alterar `SeletorCiclo`, só a página não dispara a
  busca enquanto `cicloId` for `null`).
- `CARGO_OPCOES` (`frontend/src/constants/colaborador.ts`) para o filtro de
  cargo; `listarEquipes` (`frontend/src/services/equipesService.ts`) para o
  filtro/seletor de equipe.
- Rota nova em `App.tsx` (bloco `RotaProtegida papeis={['admin',
  'gestor_rh']}`, ao lado das rotas `/analise/visao-geral` e
  `/analise/avaliacoes`, linhas ~43-44 hoje).
- Menu em `PainelAdminLayout.tsx`: grupo "Análises" → submenu
  "Quantitativa" (`submenus`, array `opcoes`, linha ~64 hoje — já contém
  "Visão Geral"; "Ranking" entra como segunda opção nesse mesmo submenu,
  não em "Qualitativa", já que trabalha só com notas numéricas, não texto).
  Sem botão/atalho novo em `CiclosListPage.tsx` (decisão 4 da seção 4 — ao
  contrário de Visão Geral/Avaliações).
- Nenhuma regra de agregação/anonimização calculada no frontend — tudo
  pré-computado pela API (booleanos de dados insuficientes, notas já
  normalizadas em percentual, posição/ordenação já calculada... exceto a
  troca de coluna de ordenação/direção, que é reenviada como query param e
  recalculada no backend a cada troca, não recalculada localmente no
  frontend a partir de uma lista já carregada).

## 8. Contrato de API sugerido (ponto de partida, não mandato — nomes exatos a confirmar no planejamento-backend)

`GET /api/analise/ranking?cicloId=&modo=avaliado|equipe&cargo=&equipeId=&ordenarPor=likert|matriz&ordem=desc|asc`

- `cicloId` (uuid, **obrigatório**): 422 `CAMPO_INVALIDO` se ausente/mal
  formatado; 404 `CICLO_NAO_ENCONTRADO` se não existir (mesmo código já
  usado em `buscarCicloOuFalhar`); 422 `CICLO_NAO_E_AVALIACAO_360` (código
  novo) se o ciclo não for classificado como avaliação 360.
- `modo` (`'avaliado' | 'equipe'`, default `'avaliado'`).
- `cargo` (string, um dos `CARGO_OPCOES`, opcional) e `equipeId` (uuid,
  opcional) — combináveis (AND, seção 5.3). 422 `FILTRO_INCOMPATIVEL_COM_MODO`
  (código novo) se `cargo` for enviado junto de `modo=equipe` (cargo é
  atributo de colaborador individual, sem significado direto no modo
  equipe).
- `ordenarPor` (`'likert' | 'matriz'`, default a definir no planejamento —
  recomendação: `'likert'`) e `ordem` (`'desc' | 'asc'`, default `'desc'`,
  seção 4 item 5).
- 200 (esboço de shape, nomes exatos a confirmar no planejamento):

  Modo `avaliado` → `RankingAvaliadoLinha[]`:
  ```json
  {
    "cicloId": "uuid",
    "modo": "avaliado",
    "ordenarPor": "likert",
    "ordem": "desc",
    "linhas": [
      {
        "posicao": 1,
        "avaliadoId": "uuid",
        "avaliadoNome": "...",
        "cargo": "Coordenador",
        "equipeNome": "Comercial",
        "mediaLikert": 82.4,
        "mediaMatriz": 76.0,
        "paresInsuficiente": false,
        "subordinadoInsuficiente": true
      }
    ]
  }
  ```

  Modo `equipe` → `RankingEquipeLinha[]`:
  ```json
  {
    "cicloId": "uuid",
    "modo": "equipe",
    "ordenarPor": "likert",
    "ordem": "desc",
    "linhas": [
      {
        "posicao": 1,
        "equipeId": "uuid",
        "equipeNome": "Comercial",
        "mediaLikert": 79.1,
        "mediaMatriz": null,
        "dadosInsuficientesLikert": false,
        "dadosInsuficientesMatriz": true
      }
    ]
  }
  ```

- Nenhum campo de nenhum dos dois shapes expõe `avaliador_id`,
  `totalRespondentes`/contagem exata de respondentes, ou quantidade de
  membros da equipe — conforme guard rail da seção 3.
- `mediaLikert`/`mediaMatriz` = `null` quando não há nenhuma fatia elegível
  (seção 2, distinção interna entre "sem dado" e "bloqueado por gate" não é
  exposta na v1 — ambos resultam em ausência de nota no payload, mas os
  booleanos `paresInsuficiente`/`subordinadoInsuficiente`/
  `dadosInsuficientes*` sinalizam especificamente o caso de bloqueio por
  anonimização quando aplicável).
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira linha do
  service, sem bypass de papel para o gate de mínimo (seção 3).

## 9. Detalhes menores de implementação a validar no planejamento (não bloqueiam, recomendação registrada para cada um)

1. **Nome exato do arquivo/service** (`analise-ranking.service.ts` vs
   alternativa) — recomendação já registrada na seção 7.
2. **Tratamento do tipo `externo`** (seção 6) — recomendação: mesmo
   tratamento de relação 1:1 sem gate, já usado em `analise-avaliacoes`
   seção 3.2, mas confirmar no planejamento-backend se há algum caso real
   de `externo` em ciclos de avaliação 360 hoje.
3. **Default de `ordenarPor`** quando ausente — recomendação: `'likert'`
   (métrica mais genérica/sempre presente, já que nem toda pesquisa tem
   perguntas `matriz`).
4. **Como a UI trata `cicloId` ainda não selecionado** (`SeletorCiclo` tem
   opção "Todos os ciclos") — recomendação já registrada na seção 7
   (frontend): não buscar enquanto `cicloId` for `null`, sem alterar o
   componente compartilhado.
5. **Se a resposta 200 deve incluir algum contador não sensível** (ex. total
   de linhas retornadas, para paginação futura) — recomendação: sem
   paginação nem contador extra nesta primeira versão, mesmo espírito de
   "Visão Geral"/"Avaliações", que também não paginam.
6. **Arredondamento de `mediaLikert`/`mediaMatriz`** — recomendação: 1 casa
   decimal, mesmo padrão de `arredondar1` já usado em `analise.service.ts`
   (Visão Geral), reaproveitável como utilitário compartilhado em
   `analise-comum.ts` se ainda não estiver lá.
