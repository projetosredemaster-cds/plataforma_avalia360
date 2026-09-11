# Task: Módulo Análise — tela "Ranking" — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória: `.claude/tasks/analise-ranking/spec.md`
(lida por completo antes deste plano) — este plano traduz em passos de
implementação as decisões já fechadas nas seções 2–6 e 8 da spec, **sem
reabri-las**. Os "detalhes menores" da seção 9 da spec são resolvidos abaixo,
em "Decisões de modelagem".

Módulo **só leitura** — sem entidade própria, sem migration, sem DTOs de
criação/atualização. Estende `backend/src/modules/analise/`, já existente
(Visão Geral + Avaliações) — não cria módulo novo.

---

## LEMBRETE DA REGRA MAIS SENSÍVEL DO PROJETO — leia isto antes de qualquer linha de código

Respostas de avaliadores do tipo `pares` e `subordinado` **NUNCA** podem ser
expostas identificadas — apenas agregadas, e só quando atingirem
`ciclos_avaliacao.minimo_respostas_pares`. Nesta feature especificamente:

- **RH/admin (únicos papéis com acesso) NÃO têm bypass do limiar.** Sem modo
  "transparência total" para ninguém, em nenhuma circunstância, mesmo sendo
  os únicos com acesso à tela.
- **A coluna `anonimizar_respostas_pares` NÃO pode ser lida por esta feature**
  em nenhuma query nem decisão de exibição — mesma proibição já aplicada em
  "Avaliações" (`analise-avaliacoes.service.ts`).
- **A API NÃO pode expor o `COUNT` exato de respondentes** por tipo de
  relacionamento em nenhum payload — apenas booleanos
  (`paresInsuficiente`/`subordinadoInsuficiente` no modo avaliado). O shape
  `GrupoParesSubordinado` de `analise-avaliacoes.service.ts` expõe
  `totalRespondentes` mesmo quando `liberado === false` e por isso **NÃO é
  reaproveitável aqui** — Ranking precisa de shapes de resposta próprios, sem
  nenhum campo numérico de contagem de respondentes, em nenhuma condição.
- **Nenhuma query pode selecionar `avaliador_id` como valor bruto** — só
  `COUNT(DISTINCT avaliador_id)` como gate. Isso vale também para a query
  compartilhada extraída no passo 1 abaixo.
- **No modo equipe existe um SEGUNDO controle cumulativo**: mínimo de 5
  membros com nota calculável naquela métrica, aplicado SEPARADAMENTE por
  métrica (likert e matriz), sem expor quantos membros compõem a média (nem
  o total de membros da equipe, nem quantos têm nota calculável). Este
  limiar é DIFERENTE do `minimo_respostas_pares` e mitiga um risco diferente
  (inferência da nota de um membro por subtração a partir da média de
  equipe já calculada) — os dois controles se somam, não se substituem.

---

## GUARD RAIL CRÍTICO Nº 1 — `anonimizar_respostas_pares` nunca é lida por esta feature

- Nenhuma query de `analise-ranking.service.ts` nem de `analise-comum.ts`
  seleciona, filtra por, ou faz `CASE`/branch condicional sobre
  `ciclos_avaliacao.anonimizar_respostas_pares`
  (entity `CicloAvaliacao.anonimizarRespostasPares`). A única coluna de
  `ciclos_avaliacao` lida é `minimo_respostas_pares`
  (`CicloAvaliacao.minimoRespostasPares`) — usar sempre `select` explícito
  (`{ id: true, minimoRespostasPares: true }`, forma de objeto — mesma
  adaptação já registrada no status de "Avaliações" por causa da tipagem de
  `FindOptionsSelect` da versão de `typeorm` instalada), nunca `.find({
  where: {...} })` sem `select`.
- Não existe, em nenhum ponto de `BuscarRankingDto`, nenhum parâmetro que
  reverta, ignore ou "veja mesmo assim" o bloqueio por limiar (nenhum
  `ignorarLimiar`, `forcarExibir`, `modoTransparencia`, `verComoAdmin`).
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é a **única** checagem de
  papel dentro de `buscarRanking` — nenhum `if (ator.papel === 'admin') {...}`
  em nenhuma função deste service que mude o resultado do gate de
  `pares`/`subordinado` ou do limiar de 5 membros.
- Comentário no código explicando a omissão deliberada é permitido e
  recomendado (mesmo estilo de "Avaliações") — o que é proibido é o
  `SELECT`/uso em condicional, não a menção em texto.

## GUARD RAIL CRÍTICO Nº 2 — nenhum `COUNT` exato de respondentes/membros sai no payload

- `RankingAvaliadoLinha`/`RankingEquipeLinha` (shapes definidos na seção
  "Contrato do endpoint" abaixo) não têm **nenhum** campo numérico de
  contagem — nem `totalRespondentes`, nem `totalMembros`,
  `membrosComNotaCalculavel`, ou qualquer variação. Só os booleanos
  `paresInsuficiente`/`subordinadoInsuficiente` (avaliado) e
  `dadosInsuficientesLikert`/`dadosInsuficientesMatriz` (equipe).
- `avaliadorId`/`avaliador_id`/`avaliador.nome_completo` não aparecem em
  `.select()`/`.addSelect()` de nenhuma query deste service — o único lugar
  onde a coluna é tocada é dentro de `COUNT(DISTINCT rel.avaliador_id)` na
  função de gate compartilhada (passo 1).
- Checklist para o `backend-codereviewer` (ver seção "2." abaixo): grep em
  `analise-ranking.service.ts` por `avaliadorId`/`avaliador_id`/
  `totalRespondentes`/`totalMembros` — toda ocorrência fora de um comentário
  ou de dentro de `COUNT(DISTINCT ...)` é achado crítico.

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `backend/src/modules/analise/analise-comum.ts` (existente): `PAPEIS_COM_ACESSO`,
  `REGEX_DATA`, `validarDataQuery`, tipo `PeriodoConsulta`, `buscarUniversoCiclos`,
  `classificarPorTipo`. `classificarPorTipo(idsUniverso)` **não depende de
  período internamente** — só precisa da lista de ids, o que permite chamá-la
  com `[cicloId]` diretamente, sem passar por `buscarUniversoCiclos` (que é
  quem de fato usa período/vigência). Ranking usa esse atalho — ver decisão 3.
- `backend/src/modules/analise/analise-avaliacoes.service.ts` (existente):
  `calcularGateParesSubordinado` (hoje privada, ~linha 138) é **exatamente**
  a lógica de gate que Ranking também precisa — `COUNT(DISTINCT
  rel.avaliador_id)` agrupado por `avaliado_id, ciclo_id, tipo_relacionamento`,
  com filtro de período aplicado via `.andWhere('resposta.respondido_em::date
  BETWEEN :de::date AND :ate::date', periodo)`. Chamada hoje só com `periodo`
  obrigatório (`PeriodoConsulta`). O teste `analise-avaliacoes.service.spec.ts`
  importa só `import * as analiseAvaliacoesService from
  './analise-avaliacoes.service'` (namespace, via `buscarAvaliacoes`/HTTP) —
  **não importa `calcularGateParesSubordinado` diretamente** em nenhum
  arquivo do repo (confirmado por grep), então mover a função para
  `analise-comum.ts` não quebra nenhum import existente.
- `backend/src/modules/analise/analise.service.ts` (existente): `arredondar1`
  (privada, não exportada, não referenciada em nenhum teste diretamente) —
  seguro mover para `analise-comum.ts`.
- `analise.controller.ts`/`analise.module.ts` (existentes): 2 handlers + 2
  rotas hoje (`/visao-geral`, `/avaliacoes`), ambas atrás de
  `router.use(autenticar)`. Esta task adiciona 1 handler + 1 rota
  (`GET /ranking`) nos mesmos dois arquivos.
- Entidades relevantes já existentes (nomes de coluna confirmados por leitura
  direta, nenhum inventado):
  - `RelacionamentoAvaliacao` (`relacionamentos_avaliacao`): `id`, `cicloId`→
    `ciclo_id`, `avaliadorId`→`avaliador_id`, `avaliadoId`→`avaliado_id`,
    `tipoRelacionamento`→`tipo_relacionamento`
    (`'autoavaliacao'|'gestor'|'pares'|'subordinado'|'externo'`). **Nunca**
    ganha coluna de resposta (comentário na própria entity).
  - `EnvioPesquisa` (`envios_pesquisa`): `id`, `relacionamentoId`→
    `relacionamento_id`.
  - `Resposta` (`respostas`, `respostas/resposta.entity.ts`, só entidade):
    `id`, `envioId`→`envio_id` (**UNIQUE**), `respondidoEm`→`respondido_em`.
  - `ItemResposta` (`itens_resposta`, `respostas/item-resposta.entity.ts`):
    `id`, `respostaId`→`resposta_id`, `perguntaId`→`pergunta_id`, `valor`
    (`jsonb`; `likert` = `{ "nota": n }`; `matriz` = `{ "notas": {
    "<competenciaId>": n } }`).
  - `Pergunta` (`perguntas`): `id`, `tipo` (`'likert'|'texto_aberto'|'matriz'|'pessoa'`),
    `enunciado` (**não** `titulo`/`descricao`), `configuracao` (`jsonb`, `{
    niveis, rotulos }`, `niveis` inteiro `2..10`).
  - `PerguntaCompetencia` (`perguntas_competencias`): `perguntaId`,
    `competenciaId` — **não é necessário** juntar com esta tabela para
    normalizar (a normalização só depende de `niveis`/`notas`, não da
    competência em si — spec seção 6).
  - `Colaborador` (`colaboradores`): `id`, `nomeCompleto`→`nome_completo`,
    `cargo` (`varchar` nullable), `equipeId`→`equipe_id` (`uuid` nullable).
  - `Equipe` (`equipes`): `id`, `nome`.
  - `CicloAvaliacao` (`ciclos_avaliacao`): `id`, `minimoRespostasPares`→
    `minimo_respostas_pares` (lida); `anonimizarRespostasPares` — **nunca
    lida** (guard rail nº 1).
- `backend/src/common/uuid.ts` (`ehUuidValido`), `common/autorizacao.ts`
  (`garantirPapel`), `common/erro-http.ts` (`ErroHttp`),
  `common/http-async.ts` (`asyncHandler`), `common/enums.ts`
  (`CARGO_COLABORADOR_VALORES`, `TipoRelacionamento`),
  `middlewares/autenticacao.ts` (`autenticar`),
  `modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`
  (`buscarCicloOuFalhar`, exportada) — todos reaproveitados tal qual.
- Views `respostas_identificadas`/`respostas_pares_agregadas`: **não
  existem** em nenhuma migration (confirmado por leitura) — não usar.
- **Nenhuma migration é necessária** — feature de leitura pura sobre tabelas
  já existentes. Se, na prática, algo exigir uma migration, isso é desvio da
  spec e deve ser sinalizado como pergunta ao usuário, não implementado.

---

## Decisões de modelagem

### 1. Extração de `calcularGateParesSubordinado` para `analise-comum.ts` (sem quebrar "Avaliações")

Mover a função de `analise-avaliacoes.service.ts` para `analise-comum.ts`,
junto com o tipo de retorno (renomeado para export público
`GateParesSubordinadoLinha`), com **período agora opcional**:

```ts
// analise-comum.ts

export interface GateParesSubordinadoLinha {
  avaliadoId: string
  cicloId: string
  tipoRelacionamento: 'pares' | 'subordinado'
  totalRespondentes: number
}

/**
 * GATE compartilhado por "Avaliações" e "Ranking": único uso permitido de
 * avaliador_id no caminho pares/subordinado é DENTRO de
 * COUNT(DISTINCT ...) — nunca projetado bruto (guard rail de anonimização).
 * `periodo` é OPCIONAL: "Avaliações" sempre passa `{ de, ate }` (filtra
 * resposta.respondido_em, mesmo comportamento de hoje, sem mudança); Ranking
 * chama com `ids: [cicloId]` e SEM período (gate sobre o ciclo inteiro, já
 * que Ranking não tem filtro de data — spec, seção 7).
 */
export async function calcularGateParesSubordinado(
  ids: string[],
  periodo?: PeriodoConsulta,
): Promise<GateParesSubordinadoLinha[]> {
  if (ids.length === 0) return []

  const qb = AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('COUNT(DISTINCT rel.avaliador_id)', 'totalRespondentes')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['pares', 'subordinado'] })
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')

  if (periodo) {
    qb.andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
  }

  const linhas = await qb.getRawMany<{
    avaliadoId: string; cicloId: string; tipoRelacionamento: 'pares' | 'subordinado'; totalRespondentes: string
  }>()
  return linhas.map((l) => ({ ...l, totalRespondentes: Number(l.totalRespondentes) }))
}
```

Precisa importar `RelacionamentoAvaliacao`, `EnvioPesquisa`, `Resposta` em
`analise-comum.ts` (hoje não importadas lá).

`analise-avaliacoes.service.ts` passa a **importar** `calcularGateParesSubordinado`
e `GateParesSubordinadoLinha` de `./analise-comum` em vez de defini-los
localmente, e chama a função exatamente como hoje (`calcularGateParesSubordinado(idsAval360,
periodo)`, sempre com `periodo` preenchido) — **nenhuma mudança de SQL gerado
nem de valor de retorno** para "Avaliações". Rodar
`analise-avaliacoes.service.spec.ts` logo depois da extração, **antes** de
escrever qualquer código novo de Ranking, para confirmar 0 regressão.

Ranking chama a mesma função assim: `calcularGateParesSubordinado([cicloId])`
— sem segundo argumento, gate sobre o ciclo inteiro.

### 2. `arredondar1` compartilhada

Mover `arredondar1` de `analise.service.ts` para `analise-comum.ts` (função
pura, sem dependência de nada do módulo), exportada. `analise.service.ts`
passa a importá-la de `./analise-comum` em vez de defini-la localmente —
mesmo padrão da decisão 1, sem mudança de comportamento. `analise-ranking.service.ts`
importa a mesma função.

### 3. `classificarPorTipo` chamada direto com `[cicloId]`, sem `buscarUniversoCiclos`

Diferente de "Visão Geral"/"Avaliações" (que usam `buscarUniversoCiclos(periodo,
cicloId?)` para achar o universo de ciclos elegíveis por vigência), Ranking
**não tem período** — o ciclo já é dado obrigatório e único. Fluxo de
validação:

```
buscarCicloOuFalhar(cicloId)                 // 404 CICLO_NAO_ENCONTRADO se não existir
{ idsAval360 } = await classificarPorTipo([cicloId])
if (!idsAval360.includes(cicloId)) throw 422 CICLO_NAO_E_AVALIACAO_360
```

Não é necessário chamar `buscarUniversoCiclos` em nenhum momento desta
feature.

### 4. Novo arquivo `analise-ranking.service.ts` — só função exportada `buscarRanking`

Mesmo módulo `analise/`, arquivo novo dedicado (mesmo motivo já registrado em
"Avaliações": guard rails diferentes por arquivo, risco de um
`backend-developer`/revisor futuro copiar o padrão errado por proximidade
visual se tudo estivesse no mesmo arquivo).

### 5. Contrato do endpoint

`GET /api/analise/ranking?cicloId=&modo=avaliado|equipe&cargo=&equipeId=&ordenarPor=likert|matriz&ordem=desc|asc`

Query params:
- `cicloId` (uuid, **obrigatório**).
- `modo` (`'avaliado' | 'equipe'`, opcional, default `'avaliado'`).
- `cargo` (string, opcional, deve ser um dos `CARGO_COLABORADOR_VALORES` de
  `common/enums.ts`) — **incompatível com `modo=equipe`**.
- `equipeId` (uuid, opcional) — combinável com `cargo` (AND) e válido em
  **ambos** os modos: no modo `avaliado`, filtra quais avaliados aparecem no
  ranking (`avaliado.equipe_id = :equipeId`); no modo `equipe`, o mesmo
  filtro se aplica à população-base de avaliados antes do agrupamento por
  equipe — na prática restringe a saída a 1 equipe (comportamento válido,
  não um erro, e não proibido pela spec seção 8). **Sem checagem de
  existência** — se `equipeId` não corresponder a nenhuma equipe real, o
  filtro simplesmente não casa com nenhum colaborador e o resultado é uma
  lista vazia (mesmo espírito de filtro opcional sem validação de
  referência, mais simples que `buscarCicloOuFalhar`, que é sobre o
  identificador central e obrigatório da consulta).
- `ordenarPor` (`'likert' | 'matriz'`, opcional, default `'likert'` — seção 9,
  item 3 da spec).
- `ordem` (`'desc' | 'asc'`, opcional, default `'desc'`).

Validações e erros (ordem de checagem):

| # | Situação | Status | Código |
|---|---|---|---|
| 1 | Papel do ator não é `admin`/`gestor_rh` | 403 | `PAPEL_NAO_AUTORIZADO` (via `garantirPapel`) |
| 2 | `cicloId` ausente ou não é uuid válido | 422 | `CAMPO_INVALIDO` |
| 3 | `cicloId` válido mas ciclo não existe | 404 | `CICLO_NAO_ENCONTRADO` (via `buscarCicloOuFalhar`) |
| 4 | Ciclo existe mas não é classificado como `avaliacao_360` (via `classificarPorTipo`) | 422 | `CICLO_NAO_E_AVALIACAO_360` (código **novo**) |
| 5 | `modo` presente mas não é `'avaliado'`/`'equipe'` | 422 | `CAMPO_INVALIDO` |
| 6 | `cargo` presente e `modo === 'equipe'` | 422 | `FILTRO_INCOMPATIVEL_COM_MODO` (código **novo**) |
| 7 | `cargo` presente mas não é um `CARGO_COLABORADOR_VALORES` válido | 422 | `CAMPO_INVALIDO` |
| 8 | `equipeId` presente mas não é uuid válido | 422 | `CAMPO_INVALIDO` |
| 9 | `ordenarPor` presente mas não é `'likert'`/`'matriz'` | 422 | `CAMPO_INVALIDO` |
| 10 | `ordem` presente mas não é `'desc'`/`'asc'` | 422 | `CAMPO_INVALIDO` |

Checar item 6 (incompatibilidade) **antes** de validar o valor de `cargo`
(item 7) — um `cargo` inválido junto de `modo=equipe` deve retornar
`FILTRO_INCOMPATIVEL_COM_MODO`, não `CAMPO_INVALIDO`, porque a incompatibilidade
de modo é o problema mais específico/intencional a sinalizar primeiro.

Nenhum erro novo em `MAPA_CONSTRAINT_PARA_CODIGO` — módulo só leitura, sem
`INSERT`/`UNIQUE` a violar. Nenhum estado de bloqueio de anonimização é erro
HTTP — sempre `200`, o bloqueio é modelado nos booleanos do corpo da
resposta.

### 6. Shapes de resposta (exportados de `analise-ranking.service.ts`)

```ts
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

export interface BuscarRankingDto {
  cicloId: unknown
  modo?: unknown
  cargo?: unknown
  equipeId?: unknown
  ordenarPor?: unknown
  ordem?: unknown
}
```

Nenhum campo numérico de contagem em nenhum dos dois shapes (guard rail
crítico nº 2). `avaliadoId`/`equipeId`/`cicloId` não são segredo — só a
posição/composição de nota de avaliadores pares/subordinado é protegida.

**Estado vazio (universo de avaliados vazio para o ciclo/filtro)**: retornar
`{ cicloId, modo, ordenarPor, ordem, linhas: [] }` — nunca lançar erro por
"nenhum avaliado encontrado" (mesmo espírito de "Visão Geral"/"Avaliações":
array vazio é resultado válido, não erro).

### 7. Universo de avaliados — query própria, dirige a composição (inclui avaliados sem resposta ainda)

Diferente das duas queries agregadas (passo 8), esta query define **quem**
aparece no ranking, independente de já ter resposta computável ou não —
importante para ciclos em andamento, onde um avaliado pode ainda não ter
`mediaLikert`/`mediaMatriz` calculável mas já deve aparecer com `null` (spec,
seção 2, distinção "sem fatia elegível"). Fonte: `DISTINCT avaliado_id` de
`relacionamentos_avaliacao` do ciclo, já trazendo os campos de exibição
(evita uma segunda query de nomes):

```ts
interface LinhaUniversoAvaliado {
  avaliadoId: string
  avaliadoNome: string
  cargo: string | null
  equipeId: string | null
  equipeNome: string | null
}

async function buscarUniversoAvaliados(
  cicloId: string,
  filtros: { cargo?: string; equipeId?: string },
): Promise<LinhaUniversoAvaliado[]> {
  const qb = AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .leftJoin(Equipe, 'equipe', 'equipe.id = avaliado.equipe_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('avaliado.cargo', 'cargo')
    .addSelect('avaliado.equipe_id', 'equipeId')
    .addSelect('equipe.nome', 'equipeNome')
    .where('rel.ciclo_id = :cicloId', { cicloId })
    .distinct(true)

  if (filtros.cargo) qb.andWhere('avaliado.cargo = :cargo', { cargo: filtros.cargo })
  if (filtros.equipeId) qb.andWhere('avaliado.equipe_id = :equipeId', { equipeId: filtros.equipeId })

  return qb.getRawMany<LinhaUniversoAvaliado>()
}
```

O mesmo `filtros` (`cargo`/`equipeId`) é aplicado **idêntico** nas 3 queries
(universo, likert, matriz) — nunca pós-filtrado em JS (spec, seção "cobre em
passos numerados", item 4).

### 8. Duas queries agregadas — likert e matriz, `GROUP BY avaliado_id, tipo_relacionamento`

**Likert** (TypeORM `QueryBuilder` padrão, sem necessidade de SQL cru):

```ts
interface LinhaAgregada {
  avaliadoId: string
  tipoRelacionamento: TipoRelacionamento
  somaPct: number
  quantidade: number
}

async function agregarLikertPorAvaliado(
  cicloId: string,
  filtros: { cargo?: string; equipeId?: string },
): Promise<LinhaAgregada[]> {
  const qb = AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'likert',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    // pct = (nota-1)/(niveis-1)*100, niveis da PRÓPRIA pergunta (spec 5.1)
    .addSelect(
      "SUM(((item.valor ->> 'nota')::numeric - 1) / ((pergunta.configuracao ->> 'niveis')::numeric - 1) * 100)",
      'somaPct',
    )
    .addSelect('COUNT(*)', 'quantidade')
    .where('rel.ciclo_id = :cicloId', { cicloId })
    // defesa contra divisão por zero — schema valida niveis 2..10, mas a query se defende sozinha
    .andWhere("(pergunta.configuracao ->> 'niveis')::int > 1")
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.tipo_relacionamento')

  if (filtros.cargo) qb.andWhere('avaliado.cargo = :cargo', { cargo: filtros.cargo })
  if (filtros.equipeId) qb.andWhere('avaliado.equipe_id = :equipeId', { equipeId: filtros.equipeId })

  const linhas = await qb.getRawMany<{ avaliadoId: string; tipoRelacionamento: TipoRelacionamento; somaPct: string; quantidade: string }>()
  return linhas.map((l) => ({ ...l, somaPct: Number(l.somaPct), quantidade: Number(l.quantidade) }))
}
```

**Matriz** — expande `item.valor->'notas'` via `jsonb_each_text`/`LATERAL`
**antes** de normalizar (spec 5.5: cada competência respondida é 1
linha/unidade individual). O `QueryBuilder` do TypeORM não tem suporte de
primeira classe para `CROSS JOIN LATERAL` com alias de tabela-função
(`jsonb_each_text(...)  AS notas(chave, valor)`) — usar `AppDataSource.query()`
com SQL parametrizado (posicional, `$1`/`$2`/...) em vez de `QueryBuilder`
só para esta query. **Nunca interpolar `cargo`/`equipeId`/`cicloId` como
string concatenada** — sempre via parâmetro posicional:

```ts
async function agregarMatrizPorAvaliado(
  cicloId: string,
  filtros: { cargo?: string; equipeId?: string },
): Promise<LinhaAgregada[]> {
  const params: unknown[] = [cicloId]
  let filtroCargoSql = ''
  let filtroEquipeSql = ''
  if (filtros.cargo) {
    params.push(filtros.cargo)
    filtroCargoSql = `AND avaliado.cargo = $${params.length}`
  }
  if (filtros.equipeId) {
    params.push(filtros.equipeId)
    filtroEquipeSql = `AND avaliado.equipe_id = $${params.length}`
  }

  const sql = `
    SELECT rel.avaliado_id AS "avaliadoId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           SUM((notas.valor::numeric - 1) / ((pergunta.configuracao ->> 'niveis')::numeric - 1) * 100) AS "somaPct",
           COUNT(*) AS "quantidade"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    JOIN colaboradores avaliado ON avaliado.id = rel.avaliado_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rel.ciclo_id = $1
      AND (pergunta.configuracao ->> 'niveis')::int > 1
      ${filtroCargoSql}
      ${filtroEquipeSql}
    GROUP BY rel.avaliado_id, rel.tipo_relacionamento
  `

  const linhas = await AppDataSource.query(sql, params)
  return linhas.map((l: { avaliadoId: string; tipoRelacionamento: TipoRelacionamento; somaPct: string; quantidade: string }) => ({
    avaliadoId: l.avaliadoId,
    tipoRelacionamento: l.tipoRelacionamento,
    somaPct: Number(l.somaPct),
    quantidade: Number(l.quantidade),
  }))
}
```

Não é necessário juntar com `perguntas_competencias` (spec seção 6 — a
normalização só depende de `niveis`/`notas`).

`Promise.all([buscarUniversoAvaliados, agregarLikertPorAvaliado,
agregarMatrizPorAvaliado, calcularGateParesSubordinado([cicloId]),
buscarMinimosPorCiclo([cicloId])])` — todas independentes entre si, podem
disparar em paralelo.

### 9. Composição por avaliado (JS) — soma ponderada, `pares`/`subordinado` só se o gate liberar

```ts
type ChaveGate = string // `${avaliadoId}|${tipoRelacionamento}`

function chaveGate(avaliadoId: string, tipo: string): ChaveGate {
  return `${avaliadoId}|${tipo}`
}

/**
 * Guard rail: autoavaliacao/gestor/externo SEMPRE entram (relações 1:1, sem
 * terceiro a proteger — spec seção 2, mesmo critério de "Avaliações" seção
 * 3.2). pares/subordinado só entram se o gate compartilhado liberar. Nunca
 * lê anonimizarRespostasPares, nunca expõe totalRespondentes.
 */
function comporMediasPorAvaliado(
  linhas: LinhaAgregada[],
  gate: Map<ChaveGate, number>, // avaliadoId|tipo -> totalRespondentes (pares/subordinado só)
  minimo: number,
): Map<string, { soma: number; qtd: number }> {
  const acc = new Map<string, { soma: number; qtd: number }>()
  for (const linha of linhas) {
    const elegivel =
      linha.tipoRelacionamento === 'autoavaliacao' ||
      linha.tipoRelacionamento === 'gestor' ||
      linha.tipoRelacionamento === 'externo' ||
      (gate.get(chaveGate(linha.avaliadoId, linha.tipoRelacionamento)) ?? 0) >= minimo
    if (!elegivel) continue
    const atual = acc.get(linha.avaliadoId) ?? { soma: 0, qtd: 0 }
    atual.soma += linha.somaPct
    atual.qtd += linha.quantidade
    acc.set(linha.avaliadoId, atual)
  }
  return acc
}

function mediaDoMapa(acc: Map<string, { soma: number; qtd: number }>, avaliadoId: string): number | null {
  const entrada = acc.get(avaliadoId)
  if (!entrada || entrada.qtd === 0) return null
  return arredondar1(entrada.soma / entrada.qtd)
}
```

`media = null` quando `acc` não tem entrada para aquele avaliado — cobre
tanto "nenhuma fatia elegível existiu" quanto "só existiu `pares`/`subordinado`
e não passou no gate" (spec seção 2 — os dois resultam no mesmo `null`
externamente, mas o código acima nunca confunde os dois internamente: a
segunda entrada de `linhas` simplesmente nunca chega a ser somada quando não
elegível, então não há um "soma parcial incorreta" escondido).

`minimo` vem de `buscarMinimosPorCiclo([cicloId]).get(cicloId) ?? 3` (mesmo
default 3 já usado em "Avaliações").

**`paresInsuficiente`/`subordinadoInsuficiente` por avaliado** (independente
de métrica — o gate é sobre "respondeu o questionário", não sobre "respondeu
uma pergunta likert ou matriz especificamente"):

```ts
function calcularInsuficiencia(
  avaliadoId: string,
  tipo: 'pares' | 'subordinado',
  gate: Map<ChaveGate, number>,
  minimo: number,
): boolean {
  const total = gate.get(chaveGate(avaliadoId, tipo)) ?? 0
  return total < minimo
}
```

**Decisão explícita a registrar em comentário no código**: se não existe
NENHUM relacionamento `pares`/`subordinado` respondido para aquele avaliado
(0 respondentes, sem linha de gate), `paresInsuficiente`/`subordinadoInsuficiente`
retornam `true` (mesmo valor que "existem respondentes, mas abaixo do
mínimo") — isto é seguro (nunca expõe mais do que "insuficiente" em nenhum
dos dois casos) e mais simples do que introduzir um terceiro estado
`não_aplicável`, que a spec não pede.

### 10. `autoavaliacao`/`gestor`/`externo` sem gate — `externo` tratado como relação 1:1 (resolve item 2 da seção 9 da spec)

Confirmado nesta task: `externo` é tratado exatamente como `autoavaliacao`/
`gestor` — sempre entra na composição, sem limiar, mesmo critério já usado em
`analise-avaliacoes.service.ts` (`buscarIdentificadas360`, tipos
`['autoavaliacao', 'gestor', 'externo']`). Não há necessidade de confirmar
"casos reais de `externo` em ciclos 360 hoje" para fechar esta decisão — o
código trata o tipo de forma genérica (`tipoRelacionamento !== 'pares' &&
tipoRelacionamento !== 'subordinado'` já cobre `externo` automaticamente sem
um terceiro `if` dedicado); se não houver dados de `externo` hoje, o branch
simplesmente nunca é exercitado, sem custo.

### 11. Modo `equipe` — agrupamento em JS, média simples, limiar de 5 por métrica

Só executado quando `dto.modo === 'equipe'`. Reaproveita as médias por
avaliado já calculadas no passo 9 (`mediaDoMapa`), nunca uma query SQL nova
com `GROUP BY equipe_id`:

```ts
const LIMIAR_MINIMO_MEMBROS_EQUIPE = 5

interface NotaAvaliadoParaEquipe {
  equipeId: string | null
  equipeNome: string | null
  mediaLikert: number | null
  mediaMatriz: number | null
}

function agruparPorEquipe(avaliados: NotaAvaliadoParaEquipe[]): RankingEquipeLinha[] {
  const porEquipe = new Map<string, { equipeNome: string; likerts: number[]; matrizes: number[] }>()

  for (const av of avaliados) {
    if (!av.equipeId) continue // colaborador sem equipe não entra em nenhum grupo
    const grupo = porEquipe.get(av.equipeId) ?? { equipeNome: av.equipeNome ?? '', likerts: [], matrizes: [] }
    if (av.mediaLikert !== null) grupo.likerts.push(av.mediaLikert)
    if (av.mediaMatriz !== null) grupo.matrizes.push(av.mediaMatriz)
    porEquipe.set(av.equipeId, grupo)
  }

  return [...porEquipe.entries()].map(([equipeId, grupo]) => {
    const likertLiberado = grupo.likerts.length >= LIMIAR_MINIMO_MEMBROS_EQUIPE
    const matrizLiberado = grupo.matrizes.length >= LIMIAR_MINIMO_MEMBROS_EQUIPE
    return {
      posicao: null, // preenchido depois, no passo 12
      equipeId,
      equipeNome: grupo.equipeNome,
      mediaLikert: likertLiberado ? arredondar1(media(grupo.likerts)) : null,
      mediaMatriz: matrizLiberado ? arredondar1(media(grupo.matrizes)) : null,
      dadosInsuficientesLikert: !likertLiberado,
      dadosInsuficientesMatriz: !matrizLiberado,
    }
  })
}

function media(valores: number[]): number {
  return valores.reduce((soma, v) => soma + v, 0) / valores.length
}
```

**Nunca expor `grupo.likerts.length`/`grupo.matrizes.length`** em nenhum
campo do retorno — só os booleanos (guard rail crítico nº 2). O limiar de 5
é aplicado **depois** do gate de `pares`/`subordinado` já ter zerado/reduzido
a nota de membros individuais no passo 9 — os dois controles são cumulativos,
nunca um substitui o outro.

### 12. Ordenação/posição — semântica `RANK()`, calculada em memória

```ts
function calcularPosicoes<T>(
  linhas: T[],
  obterValor: (linha: T) => number | null,
  ordem: OrdemRanking,
): Array<T & { posicao: number | null }> {
  const comNota = linhas.filter((l) => obterValor(l) !== null)
  const semNota = linhas.filter((l) => obterValor(l) === null)

  comNota.sort((a, b) => {
    const va = obterValor(a) as number
    const vb = obterValor(b) as number
    return ordem === 'desc' ? vb - va : va - vb
  })

  const resultado: Array<T & { posicao: number | null }> = []
  let posicaoAtual = 0
  let valorAnterior: number | null = null
  comNota.forEach((linha, indice) => {
    const valor = obterValor(linha) as number
    if (valorAnterior === null || valor !== valorAnterior) {
      posicaoAtual = indice + 1
    }
    resultado.push({ ...linha, posicao: posicaoAtual })
    valorAnterior = valor
  })

  semNota.forEach((linha) => resultado.push({ ...linha, posicao: null }))
  return resultado
}
```

- Empate = mesma posição, semântica `RANK()` (1º, 1º, 3º — pula a posição
  seguinte, spec 5.2). Comparação de empate feita sobre o valor **já
  arredondado** (`arredondar1`), já que a nota que entra em `mediaLikert`/
  `mediaMatriz` já vem arredondada do passo 9/11 — não há um segundo
  arredondamento aqui, só reaproveita o valor já pronto.
- Linhas com `media === null` na métrica usada para ordenar (`ordenarPor`)
  vão para o fim, `posicao: null`, sem RANK atribuído.
- Chamada: `calcularPosicoes(linhasSemPosicao, (l) => dto.ordenarPor ===
  'likert' ? l.mediaLikert : l.mediaMatriz, dto.ordem)`.
- Sem `RANK()` SQL, sem `ORDER BY` no banco — toda a lista final só existe
  depois da composição em JS (gate + agrupamento), então ordenar em memória é
  necessário, não uma escolha de estilo.

### 13. Fluxo completo de `buscarRanking`

```ts
export async function buscarRanking(
  ator: ColaboradorAutenticado,
  dto: BuscarRankingDto,
): Promise<RankingAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO]) // única checagem de papel de toda a função

  // 1. cicloId obrigatório
  if (typeof dto.cicloId !== 'string' || !ehUuidValido(dto.cicloId.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" é obrigatório e deve ser um uuid válido.')
  }
  const cicloId = dto.cicloId.trim()
  await buscarCicloOuFalhar(cicloId) // 404 CICLO_NAO_ENCONTRADO

  const { idsAval360 } = await classificarPorTipo([cicloId])
  if (!idsAval360.includes(cicloId)) {
    throw new ErroHttp(422, 'CICLO_NAO_E_AVALIACAO_360', 'Ranking só está disponível para ciclos de avaliação 360.')
  }

  // 2. modo
  const modo: ModoRanking = dto.modo === undefined || dto.modo === null || dto.modo === ''
    ? 'avaliado'
    : validarEnum(dto.modo, ['avaliado', 'equipe'], 'modo')

  // 3. cargo (incompatível com modo equipe — checar ANTES de validar o valor)
  const cargoBruto = dto.cargo
  const temCargo = cargoBruto !== undefined && cargoBruto !== null && cargoBruto !== ''
  if (temCargo && modo === 'equipe') {
    throw new ErroHttp(422, 'FILTRO_INCOMPATIVEL_COM_MODO', 'O filtro "cargo" não é aplicável no modo "equipe".')
  }
  const cargo = temCargo ? validarEnum(cargoBruto, CARGO_COLABORADOR_VALORES, 'cargo') : undefined

  // 4. equipeId
  const equipeIdBruto = dto.equipeId
  const temEquipeId = equipeIdBruto !== undefined && equipeIdBruto !== null && equipeIdBruto !== ''
  if (temEquipeId && (typeof equipeIdBruto !== 'string' || !ehUuidValido(equipeIdBruto.trim()))) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "equipeId" deve ser um uuid válido.')
  }
  const equipeId = temEquipeId ? (equipeIdBruto as string).trim() : undefined

  // 5. ordenarPor / ordem
  const ordenarPor: MetricaRanking = dto.ordenarPor === undefined || dto.ordenarPor === null || dto.ordenarPor === ''
    ? 'likert'
    : validarEnum(dto.ordenarPor, ['likert', 'matriz'], 'ordenarPor')
  const ordem: OrdemRanking = dto.ordem === undefined || dto.ordem === null || dto.ordem === ''
    ? 'desc'
    : validarEnum(dto.ordem, ['desc', 'asc'], 'ordem')

  const filtros = { cargo, equipeId }

  const [universo, linhasLikert, linhasMatriz, gateLinhas, minimosPorCiclo] = await Promise.all([
    buscarUniversoAvaliados(cicloId, filtros),
    agregarLikertPorAvaliado(cicloId, filtros),
    agregarMatrizPorAvaliado(cicloId, filtros),
    calcularGateParesSubordinado([cicloId]), // SEM periodo — gate sobre o ciclo inteiro
    buscarMinimosPorCiclo([cicloId]),
  ])

  if (universo.length === 0) {
    return { cicloId, modo, ordenarPor, ordem, linhas: [] } as RankingAnalise
  }

  const minimo = minimosPorCiclo.get(cicloId) ?? 3
  const gate = new Map(gateLinhas.map((g) => [chaveGate(g.avaliadoId, g.tipoRelacionamento), g.totalRespondentes]))

  const accLikert = comporMediasPorAvaliado(linhasLikert, gate, minimo)
  const accMatriz = comporMediasPorAvaliado(linhasMatriz, gate, minimo)

  const linhasAvaliado: RankingAvaliadoLinha[] = universo.map((u) => ({
    posicao: null,
    avaliadoId: u.avaliadoId,
    avaliadoNome: u.avaliadoNome,
    cargo: u.cargo,
    equipeNome: u.equipeNome,
    mediaLikert: mediaDoMapa(accLikert, u.avaliadoId),
    mediaMatriz: mediaDoMapa(accMatriz, u.avaliadoId),
    paresInsuficiente: calcularInsuficiencia(u.avaliadoId, 'pares', gate, minimo),
    subordinadoInsuficiente: calcularInsuficiencia(u.avaliadoId, 'subordinado', gate, minimo),
  }))

  if (modo === 'avaliado') {
    const linhas = calcularPosicoes(linhasAvaliado, (l) => (ordenarPor === 'likert' ? l.mediaLikert : l.mediaMatriz), ordem)
    return { cicloId, modo, ordenarPor, ordem, linhas }
  }

  // modo === 'equipe'
  const paraAgrupar = universo.map((u) => ({
    equipeId: u.equipeId,
    equipeNome: u.equipeNome,
    mediaLikert: mediaDoMapa(accLikert, u.avaliadoId),
    mediaMatriz: mediaDoMapa(accMatriz, u.avaliadoId),
  }))
  const linhasEquipeSemPosicao = agruparPorEquipe(paraAgrupar)
  const linhas = calcularPosicoes(linhasEquipeSemPosicao, (l) => (ordenarPor === 'likert' ? l.mediaLikert : l.mediaMatriz), ordem)
  return { cicloId, modo, ordenarPor, ordem, linhas }
}
```

`validarEnum(valor, opcoes, campo)` **já existe** como utilitário compartilhado
em `backend/src/common/validacao.ts:55`, importado hoje por `colaboradores`,
`pesquisas`, `ciclos-avaliacao` e `perguntas` — `analise-ranking.service.ts`
deve **importar essa função existente**, não criar uma cópia local. Nenhuma
duplicação de helper: mesmo padrão de reaproveitamento já aplicado às
decisões 1 e 2 deste documento (`calcularGateParesSubordinado`/`arredondar1`).

`buscarMinimosPorCiclo` é a mesma função já existente em
`analise-avaliacoes.service.ts` (`select: { id: true, minimoRespostasPares:
true }`) — reaproveitar tal qual (mover para `analise-comum.ts` junto com o
gate no passo 1 é uma opção válida do `backend-developer`, já que agora tem
2 consumidores; não é obrigatório, mas evita duplicação — decidir no
momento da implementação sem precisar voltar a este plano).

---

## Plano — Backend

### 1. backend-developer

Antes de codar: reler o "LEMBRETE DA REGRA MAIS SENSÍVEL" e os dois "GUARD
RAIL CRÍTICO" no topo deste documento, e a skill `backend-anonimizacao-respostas`.
Nenhuma migration é necessária — confirmar isso no início (não rodar
`migration:generate`/`migration:run`).

1. **`analise-comum.ts`** (extração, decisões 1 e 2): mover
   `calcularGateParesSubordinado`/`GateParesSubordinadoLinha` (de
   `analise-avaliacoes.service.ts`) e `arredondar1` (de `analise.service.ts`)
   para `analise-comum.ts`, com `periodo` agora **opcional** em
   `calcularGateParesSubordinado`. Atualizar os dois arquivos de origem para
   importar em vez de definir localmente. **Nenhuma mudança de
   comportamento/SQL para o código já existente.** Rodar
   `analise-avaliacoes.service.spec.ts` e `analise.service.spec.ts` logo
   depois, antes de escrever qualquer linha de Ranking, para confirmar 0
   regressão.
2. **`analise-ranking.service.ts`** (novo): implementar
   `buscarUniversoAvaliados`, `agregarLikertPorAvaliado`,
   `agregarMatrizPorAvaliado` (via `AppDataSource.query()`, parametrizado),
   `comporMediasPorAvaliado`, `mediaDoMapa`, `calcularInsuficiencia`,
   `agruparPorEquipe`, `calcularPosicoes`, `validarEnum` e a função exportada
   `buscarRanking`, seguindo literalmente o pseudocódigo das decisões
   7–13 acima. `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira
   linha de `buscarRanking`.
3. **`analise.controller.ts`**: adicionar handler
   `buscarRankingAnalise(req, res)` que lê `cicloId`, `modo`, `cargo`,
   `equipeId`, `ordenarPor`, `ordem` de `req.query` e chama
   `analiseRankingService.buscarRanking(req.colaboradorAutenticado!, {...})`,
   `res.status(200).json(resposta)` — mesmo padrão de
   `buscarAvaliacoesAnalise`.
4. **`analise.module.ts`**: adicionar `router.get('/ranking',
   asyncHandler(buscarRankingAnalise))`, logo abaixo de `/avaliacoes`, sob o
   mesmo `router.use(autenticar)`. `app.ts` não muda — `/api/analise` já
   está montado.
5. **Erros novos**: `CICLO_NAO_E_AVALIACAO_360` (422) e
   `FILTRO_INCOMPATIVEL_COM_MODO` (422) — só usados dentro de
   `analise-ranking.service.ts`, via `ErroHttp`, sem entrada em
   `MAPA_CONSTRAINT_PARA_CODIGO` (não são violação de constraint de banco).
6. **Wiring final**: nenhuma migration, nenhuma variável de ambiente nova,
   nenhuma entrada nova em `common/enums.ts` (cargo já usa
   `CARGO_COLABORADOR_VALORES`, existente). `npm run build` (tsc) e `npm
   test` (Vitest) devem rodar sem novos erros introduzidos por esta task, e
   as suítes existentes `analise.service.spec.ts`/
   `analise-avaliacoes.service.spec.ts` devem continuar 100% passando após a
   extração do passo 1.

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **`anonimizar_respostas_pares` (guard rail nº 1)**: grep em
   `analise-ranking.service.ts` e em `analise-comum.ts` por
   `anonimizarRespostasPares`/`anonimizar_respostas_pares` — qualquer
   ocorrência fora de um comentário explicativo é achado **crítico
   obrigatório**. Confirmar que a leitura de `minimoRespostasPares` usa
   `select` explícito (forma de objeto), nunca um `find` sem `select`.
2. **Nenhum `COUNT` exposto (guard rail nº 2)**: confirmar que
   `RankingAvaliadoLinha`/`RankingEquipeLinha` não têm nenhum campo numérico
   de contagem (grep por `totalRespondentes`/`totalMembros`/
   `membrosComNotaCalculavel` no arquivo de shapes e no controller). Grep por
   `avaliadorId`/`avaliador_id` em `analise-ranking.service.ts` — toda
   ocorrência deve estar dentro de `COUNT(DISTINCT ...)` (na função de gate
   compartilhada) ou em comentário.
3. **Bypass de papel**: grep por `ignorarLimiar`/`forcarExibir`/
   `modoTransparencia`/`bypass`/`ator.papel ===` dentro de
   `analise-ranking.service.ts` — qualquer branch condicional no resultado
   do gate ou do limiar de 5 membros baseado em papel, além do
   `garantirPapel` inicial, é achado **crítico obrigatório**.
4. **Limiar de 5 membros (modo equipe) aplicado por métrica,
   separadamente**: confirmar que `dadosInsuficientesLikert` e
   `dadosInsuficientesMatriz` são calculados de forma independente (uma
   equipe pode ter um `true` e outro `false` na mesma linha) e que nenhum
   dos dois é derivado do outro por engano.
5. **Gate de pares/subordinado sem filtro de período**: confirmar que
   `calcularGateParesSubordinado([cicloId])` é chamada **sem** segundo
   argumento em `analise-ranking.service.ts` (Ranking não filtra por data) —
   e que a mesma função, chamada por `analise-avaliacoes.service.ts`,
   continua recebendo `periodo` (nenhuma regressão no comportamento de
   "Avaliações").
6. **Composição ponderada, não média de médias**: confirmar que
   `comporMediasPorAvaliado`/`mediaDoMapa` fazem `SUM(pct)/COUNT(*)` sobre as
   fatias elegíveis (soma ponderada), nunca uma média aritmética simples
   das médias de cada tipo de relacionamento.
7. **`null` vs "bloqueado" nunca renderizado como zero**: confirmar que
   `mediaDoMapa` retorna `null` (não `0`) quando não há entrada no
   acumulador, e que `calcularPosicoes` empurra linhas com `null` na métrica
   de ordenação para o fim, sem `posicao` numérica.
8. **SQL cru da query de matriz (`AppDataSource.query`)**: confirmar
   parametrização posicional (`$1`, `$2`, ...) para `cicloId`/`cargo`/
   `equipeId` — nenhuma interpolação de string do valor do usuário
   diretamente na query. Confirmar que a query filtra `pergunta.tipo =
   'matriz'` e defende contra `niveis <= 1`.
9. **Nenhuma migration**: confirmar que a task não criou/rodou nenhuma
   migration.

---

## Status

### 1. backend-developer — CONCLUÍDO

Implementado exatamente conforme o plano acima (passos 1–6), sem desvios de
regra de negócio/anonimização. Reli o "LEMBRETE DA REGRA MAIS SENSÍVEL", os
dois "GUARD RAIL CRÍTICO" e a skill `backend-anonimizacao-respostas` antes de
codar. Nenhuma migration criada/rodada (confirmado antes de começar — módulo
é só leitura sobre tabelas já existentes).

- **1.** `backend/src/modules/analise/analise-comum.ts`: extraídos
  `calcularGateParesSubordinado`/`GateParesSubordinadoLinha` (de
  `analise-avaliacoes.service.ts`) e `arredondar1` (de `analise.service.ts`),
  exatamente como no pseudocódigo da decisão de modelagem 1 e 2 — `periodo`
  agora **opcional** em `calcularGateParesSubordinado` (`if (periodo)
  qb.andWhere(...)`). `analise-avaliacoes.service.ts` e `analise.service.ts`
  passaram a importar de `./analise-comum` em vez de definir localmente —
  nenhuma mudança de SQL gerado/valor de retorno para o código já existente
  (chamada em `analise-avaliacoes.service.ts` continua
  `calcularGateParesSubordinado(idsAval360, periodo)`, sempre com `periodo`
  preenchido). Rodei `analise.service.spec.ts` e
  `analise-avaliacoes.service.spec.ts` logo depois da extração, **antes** de
  escrever qualquer linha de Ranking: 25 + 26 = 51 testes passando, 0
  regressão.
- **2.** `backend/src/modules/analise/analise-ranking.service.ts` (novo):
  única função exportada `buscarRanking`, seguindo literalmente o
  pseudocódigo das decisões de modelagem 3, 5–13 —
  `buscarUniversoAvaliados` (DISTINCT avaliado_id, já traz nome/cargo/equipe,
  define quem aparece no ranking independente de ter nota calculável),
  `agregarLikertPorAvaliado` (QueryBuilder, `SUM(pct)`/`COUNT(*)` GROUP BY
  avaliado+tipo, normalização por `niveis` da própria pergunta),
  `agregarMatrizPorAvaliado` (`AppDataSource.query()` com SQL parametrizado
  posicional `$1`/`$2`/..., `CROSS JOIN LATERAL jsonb_each_text(...)` para
  expandir cada competência antes de normalizar — nenhuma interpolação de
  string de `cargo`/`equipeId`/`cicloId`), `comporMediasPorAvaliado` (soma
  ponderada — autoavaliacao/gestor/externo sempre entram, pares/subordinado
  só se o gate liberar), `mediaDoMapa`, `calcularInsuficiencia`,
  `agruparPorEquipe` (média simples dos membros, limiar de 5 com nota
  calculável aplicado SEPARADAMENTE por métrica), `calcularPosicoes`
  (semântica `RANK()`, linhas com `null` na métrica de ordenação vão para o
  fim). `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é a primeira linha de
  `buscarRanking` — única checagem de papel de toda a função. `validarEnum`
  **importado** de `common/validacao.ts` (não duplicado localmente), como
  pedido na correção registrada no topo deste arquivo. Ordem de validação
  (cicloId → ciclo existe → ciclo é avaliacao_360 → modo → cargo
  incompatível com modo antes de validar valor de cargo → equipeId →
  ordenarPor → ordem) segue exatamente a tabela da seção "Contrato do
  endpoint". `buscarMinimosPorCiclo` **não** foi movida para
  `analise-comum.ts` — mantida como função privada duplicada dentro de
  `analise-ranking.service.ts` (mesmo corpo/`select` explícito de
  `analise-avaliacoes.service.ts`), já que o plano registrava isso como
  opção do `backend-developer`, não obrigação; decidi não mover para manter
  o diff da extração do passo 1 restrito só ao que o plano pedia
  explicitamente (gate + `arredondar1`).
- **3.** `analise.controller.ts`: handler novo `buscarRankingAnalise`
  (import de `analise-ranking.service.ts` como `analiseRankingService`,
  junto aos imports já existentes), lê `cicloId`/`modo`/`cargo`/`equipeId`/
  `ordenarPor`/`ordem` de `req.query`, `res.status(200).json(resposta)` —
  mesmo padrão de `buscarAvaliacoesAnalise`.
- **4.** `analise.module.ts`: rota nova `router.get('/ranking',
  asyncHandler(buscarRankingAnalise))` logo abaixo de `/avaliacoes`, mesmo
  `router.use(autenticar)`. `app.ts` não mudou — `/api/analise` já estava
  montado.
- **5.** Erros novos `CICLO_NAO_E_AVALIACAO_360` (422) e
  `FILTRO_INCOMPATIVEL_COM_MODO` (422), via `ErroHttp`, usados só dentro de
  `analise-ranking.service.ts` — nenhuma entrada nova em
  `MAPA_CONSTRAINT_PARA_CODIGO` (não há violação de constraint de banco
  nesta feature só-leitura).
- **Guard rail crítico nº 1**: grep em `analise-ranking.service.ts` e
  `analise-comum.ts` por `anonimizarRespostasPares`/
  `anonimizar_respostas_pares` — todas as ocorrências são comentário
  explicativo, nenhum `SELECT`/condicional. A única coluna de
  `ciclos_avaliacao` lida é `minimoRespostasPares`, via `select` explícito na
  forma de objeto (`{ id: true, minimoRespostasPares: true }`). Nenhum
  parâmetro de bypass em `BuscarRankingDto` (`cicloId`, `modo?`, `cargo?`,
  `equipeId?`, `ordenarPor?`, `ordem?` — exatamente os 6 campos do contrato).
  Grep por `ignorarLimiar`/`forcarExibir`/`modoTransparencia`/`bypass`/
  `ator.papel ===` em `analise-ranking.service.ts`: sem ocorrências fora de
  comentário — `garantirPapel` é a única checagem de papel.
- **Guard rail crítico nº 2**: grep por `totalRespondentes`/`totalMembros`/
  `membrosComNotaCalculavel` em `analise-ranking.service.ts` e no arquivo de
  shapes: a única ocorrência de `totalRespondentes` fora de comentário é
  `g.totalRespondentes` dentro de `buscarRanking`, lendo o campo interno de
  `GateParesSubordinadoLinha` (retorno de `calcularGateParesSubordinado`) só
  para montar o `Map` interno `gate` — nunca projetado em
  `RankingAvaliadoLinha`/`RankingEquipeLinha`/no payload de resposta. Grep
  por `avaliadorId`/`avaliador_id` em `analise-ranking.service.ts`: zero
  ocorrências (nem em comentário) — o único lugar onde a coluna é tocada é
  dentro de `COUNT(DISTINCT rel.avaliador_id)`, em `analise-comum.ts`, fora
  deste arquivo. `RankingAvaliadoLinha`/`RankingEquipeLinha` têm exatamente
  os campos do contrato — nenhum campo numérico de contagem.
- **Composição ponderada (não média de médias)**: `comporMediasPorAvaliado`
  acumula `soma`/`qtd` por avaliado (`SUM(pct)`/`COUNT(*)` das fatias
  elegíveis); `mediaDoMapa` faz `soma/qtd`, nunca uma média aritmética das
  médias de cada tipo de relacionamento.
- **`null` nunca renderizado como zero**: `mediaDoMapa` retorna `null`
  quando não há entrada no acumulador (nenhuma fatia elegível). No modo
  equipe, `mediaLikert`/`mediaMatriz` só recebem valor quando o limiar de 5
  membros com nota calculável é atingido; abaixo disso, `null` +
  `dadosInsuficientes*: true`. `calcularPosicoes` empurra linhas com `null`
  na métrica de ordenação para o fim, com `posicao: null`.
- **Nenhuma migration criada/rodada.** Nenhuma variável de ambiente nova,
  nenhuma entrada nova em `common/enums.ts` (`cargo` usa
  `CARGO_COLABORADOR_VALORES`, já existente).
- `npm run build` (tsc): sem novos erros introduzidos por esta task. Dois
  ajustes em relação ao pseudocódigo literal do plano, ambos por
  `exactOptionalPropertyTypes: true` do `tsconfig.json` (mesma causa raiz já
  documentada no status de "Avaliações" para outro campo): os parâmetros
  `filtros: { cargo?: string; equipeId?: string }` de
  `buscarUniversoAvaliados`/`agregarLikertPorAvaliado`/
  `agregarMatrizPorAvaliado` foram tipados como `{ cargo?: string |
  undefined; equipeId?: string | undefined }` (mesmo padrão já usado em
  `colaboradores.service.ts`), porque o objeto `filtros` montado em
  `buscarRanking` sempre carrega as duas chaves (possivelmente `undefined`
  quando o filtro não foi informado) em vez de omiti-las — sem mudança de
  comportamento de runtime, só de tipo. O único erro remanescente
  (`src/test/fakeRepository.ts`, `TS2352`) é pré-existente no working tree
  antes desta task (confirmado rodando `npm run build` numa cópia sem
  nenhuma das mudanças desta task) — mesmo erro já documentado como
  pré-existente nos status de "Visão Geral" e "Avaliações".
- `npm test` (Vitest): 216/216 testes passando, incluindo os 51 testes
  existentes de `analise.service.spec.ts`/`analise-avaliacoes.service.spec.ts`
  100% passando sem nenhuma alteração de asserção. Nenhum teste novo foi
  escrito aqui — cobertura de `analise-ranking.service.ts` é
  responsabilidade do `test-engineer`, etapa posterior do pipeline.

Migrations a rodar: nenhuma.

Arquivos criados: `backend/src/modules/analise/analise-ranking.service.ts`.
Arquivos alterados: `backend/src/modules/analise/analise-comum.ts`,
`backend/src/modules/analise/analise-avaliacoes.service.ts`,
`backend/src/modules/analise/analise.service.ts`,
`backend/src/modules/analise/analise.controller.ts`,
`backend/src/modules/analise/analise.module.ts`.
