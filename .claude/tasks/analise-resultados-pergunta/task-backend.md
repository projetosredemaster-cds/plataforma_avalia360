# Task: Módulo Análise — tela "Resultados por Pergunta" — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória:
`.claude/tasks/analise-resultados-pergunta/spec.md` (lida por completo antes
deste plano) — este plano traduz em passos de implementação as decisões já
fechadas nas seções 2–7 e 9 da spec, **sem reabri-las**. Os "detalhes menores"
da seção 10 da spec estão resolvidos abaixo.

Módulo **só leitura** — sem entidade própria, sem migration. Estende
`backend/src/modules/analise/`, já existente (Visão Geral, Avaliações,
Ranking, Nuvem de Palavras) — não cria módulo novo. Novo arquivo dedicado:
`analise-resultados-pergunta.service.ts`.

---

## LEMBRETE DA REGRA MAIS SENSÍVEL DO PROJETO — leia isto antes de qualquer linha de código

Respostas de avaliadores do tipo `pares`/`subordinado` **NUNCA** podem ser
expostas identificadas nem por contagem exata de respondentes — só agregadas,
e só quando atingirem `ciclos_avaliacao.minimo_respostas_pares`. Nesta
feature especificamente:

- **RH/admin (únicos papéis com acesso) NÃO têm bypass** do limiar/gate de
  clima. `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é a **única** checagem
  de papel de toda a função `buscarResultadosPergunta` — nenhum
  `if (ator.papel === 'admin')` em nenhuma função deste service que mude o
  resultado de um gate.
- **`ciclos_avaliacao.anonimizar_respostas_pares` NUNCA é lida** — nem em
  query, nem em `select`, nem em condicional. A única coluna de
  `ciclos_avaliacao` tocada é `minimo_respostas_pares`, via
  `buscarMinimosPorCiclo` (`analise-comum.ts`, já com `select` explícito).
- **Esta tela é a MAIS ESTRITA do módulo até aqui**: o payload nunca expõe
  `totalRespondentes`/`minimoNecessario` (diferente de "Avaliações") — só
  `liberado: boolean` + `motivo?: 'aguardando_minimo_respondentes'`. Nenhum
  `DistribuicaoTipoRelacionamento`/`ResultadoPerguntaClima` deste arquivo tem
  campo numérico de contagem de respondentes/membros, em nenhuma condição.
- **Nenhuma query seleciona `avaliador_id` como valor bruto** — o único uso
  permitido é dentro de `COUNT(DISTINCT rel.avaliador_id)`, e isso já está
  encapsulado em `calcularGateParesSubordinado` (`analise-comum.ts`,
  reaproveitada tal qual, chamada **com** período). Nenhuma query nova deste
  arquivo faz `SELECT rel.avaliador_id` nem join com `Colaborador` do lado
  avaliador.
- **Gate-primeiro-depois-busca, sem exceção**: para `clima_geral`, calcular
  `calcularGateClima(idsClima, periodo)`, filtrar `idsClimaLiberados`, **só
  então** rodar as 3 queries agregadas de clima restritas a
  `rc.ciclo_id IN idsClimaLiberados`. Nunca rodar uma query agregada de clima
  sobre um `cicloId` que não passou no gate e descartar o resultado depois.
- Para `avaliacao_360`, o gate é **por avaliado + ciclo + tipo_relacionamento**
  (não por pergunta, não por ciclo inteiro) — aplicado em duas fases (query
  agregada bruta → composição em memória que descarta linhas não elegíveis),
  igual à decisão A da spec (seção 2.1). Nunca simplificar para "soma total
  da pergunta acima do mínimo".

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `analise-comum.ts` (existente, reaproveitado tal qual, **nenhuma mudança
  necessária** nele): `PAPEIS_COM_ACESSO`, `PeriodoConsulta`,
  `validarDataQuery`, `buscarUniversoCiclos`, `classificarPorTipo`,
  `calcularGateParesSubordinado(ids, periodo?)` (aceita período opcional —
  esta tela **sempre** passa período, igual a "Avaliações"),
  `calcularGateClima(ids, periodo)`, `buscarMinimosPorCiclo(ids)` (`select`
  explícito `{ id: true, minimoRespostasPares: true }`). Nenhuma função nova
  precisa ser extraída para cá (confirmado na spec, seção 6) — as queries de
  agregação por nível/opção desta tela não têm segundo consumidor.
- `analise-avaliacoes.service.ts`: padrão de `buscarNomesCiclos`/
  `buscarNomesColaboradores` como funções privadas locais (não exportadas de
  `analise-comum.ts`) — duplicar o mesmo padrão localmente em
  `analise-resultados-pergunta.service.ts` (`buscarNomesCiclos`, mesma
  assinatura `(ids: string[]) => Promise<Map<string, string>>`, mesma query
  `CicloAvaliacao.find({ where: { id: In(ids) }, select: { id: true, nome: true } })`).
- `analise-ranking.service.ts`: padrão de `agregarMatrizPorAvaliado` via
  `AppDataSource.query()` com SQL parametrizado **posicional** (`$1`/`$2`/…)
  para `CROSS JOIN LATERAL jsonb_each_text(...)` — QueryBuilder do TypeORM
  não suporta LATERAL com alias de tabela-função. Mesmo padrão reaproveitado
  aqui para matriz **e** para `caixa_selecao`
  (`jsonb_array_elements_text`), em avaliação 360 **e** em clima (4 queries
  via `AppDataSource.query()` no total).
- Entidades confirmadas por leitura direta (nomes de coluna, nenhum
  inventado):
  - `ItemResposta` (`itens_resposta`): `id`, `respostaId`→`resposta_id`,
    `perguntaId`→`pergunta_id`, `valor` (jsonb).
  - `Resposta` (`respostas`): `id`, `envioId`→`envio_id` (UNIQUE),
    `respondidoEm`→`respondido_em`.
  - `EnvioPesquisa` (`envios_pesquisa`): `id`, `relacionamentoId`→
    `relacionamento_id`.
  - `RelacionamentoAvaliacao` (`relacionamentos_avaliacao`): `id`, `cicloId`→
    `ciclo_id`, `avaliadorId`→`avaliador_id`, `avaliadoId`→`avaliado_id`,
    `tipoRelacionamento`→`tipo_relacionamento`.
  - `ItemRespostaClima` (`itens_resposta_clima`): `id`, `respostaClimaId`→
    `resposta_clima_id`, `perguntaId`→`pergunta_id`, `valor` (jsonb).
  - `RespostaClima` (`respostas_clima`): `id`, `cicloId`→`ciclo_id`,
    `respondidoEm`→`respondido_em` — **estruturalmente anônima** (sem
    nenhuma FK de identidade).
  - `Pergunta` (`perguntas`): `id`, `paginaId`→`pagina_id`, `tipo`
    (`'likert'|'texto_aberto'|'matriz'|'pessoa'|'caixa_selecao'`),
    `enunciado`, `configuracao` (jsonb: `{ niveis, rotulos }` para
    likert/matriz, `{ opcoes: string[] }` para caixa_selecao), `ordem`
    (int).
  - `PaginaPesquisa` (`paginas_pesquisa`): `id`, `pesquisaId`→`pesquisa_id`.
  - `Pesquisa` (`pesquisas`): `id`, `tipo`
    (`'avaliacao_360'|'clima_geral'`), `cicloId`→`ciclo_id` (nullable, sem
    UNIQUE do lado "vários por ciclo" — mesma ambiguidade já tratada por
    `classificarPorTipo`), `criadoEm`→`criado_em`.
  - `Competencia` (`competencias`): `id`, `nome`.
  - `CicloAvaliacao` (`ciclos_avaliacao`): `id`, `nome`,
    `minimoRespostasPares`→`minimo_respostas_pares` (única coluna lida).
- `analise.controller.ts`/`analise.module.ts` (existentes): 4 handlers/rotas
  hoje (`/visao-geral`, `/avaliacoes`, `/ranking`, `/nuvem-palavras`), todas
  atrás de `router.use(autenticar)`. Esta task adiciona 1 handler + 1 rota
  (`GET /resultados-pergunta`) nos mesmos dois arquivos, mesmo padrão.
- `common/uuid.ts` (`ehUuidValido`), `common/autorizacao.ts`
  (`garantirPapel`), `common/erro-http.ts` (`ErroHttp`),
  `common/http-async.ts` (`asyncHandler`), `common/enums.ts`
  (`type TipoRelacionamento`), `middlewares/autenticacao.ts` (`autenticar`),
  `modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`
  (`buscarCicloOuFalhar`) — todos reaproveitados tal qual.
- **Nenhuma migration é necessária** — feature de leitura pura sobre tabelas
  já existentes. Se, na prática, algo exigir migration, isso é desvio da
  spec e deve ser sinalizado como pergunta ao usuário, não implementado.

---

## Decisões de modelagem

### 1. Tipos/interfaces exportados de `analise-resultados-pergunta.service.ts`

```ts
export interface ContagemNivel { nivel: number; contagem: number }
export interface ContagemOpcao { opcao: string; contagem: number }

export interface DistribuicaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamento
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface DistribuicaoOpcaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamento
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemOpcao[]
}

export interface CompetenciaDistribuicao {
  competenciaId: string
  competenciaNome: string
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

interface ResultadoPerguntaBase360 {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
}

export interface ResultadoPerguntaLikert360 extends ResultadoPerguntaBase360 {
  tipo: 'likert'
  niveis: number
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

export interface ResultadoPerguntaMatriz360 extends ResultadoPerguntaBase360 {
  tipo: 'matriz'
  niveis: number
  competencias: CompetenciaDistribuicao[] // ordenadas por competenciaNome (pt-BR)
}

export interface ResultadoPerguntaCaixaSelecao360 extends ResultadoPerguntaBase360 {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  porTipoRelacionamento: DistribuicaoOpcaoTipoRelacionamento[]
}

export type ResultadoPergunta360 =
  | ResultadoPerguntaLikert360
  | ResultadoPerguntaMatriz360
  | ResultadoPerguntaCaixaSelecao360

interface ResultadoPerguntaBaseClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
}

export interface ResultadoPerguntaLikertClima extends ResultadoPerguntaBaseClima {
  tipo: 'likert'
  niveis: number
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface ResultadoPerguntaMatrizClima extends ResultadoPerguntaBaseClima {
  tipo: 'matriz'
  niveis: number
  competencias?: Array<{ competenciaId: string; competenciaNome: string; distribuicao: ContagemNivel[] }>
}

export interface ResultadoPerguntaCaixaSelecaoClima extends ResultadoPerguntaBaseClima {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  distribuicao?: ContagemOpcao[]
}

export type ResultadoPerguntaClima =
  | ResultadoPerguntaLikertClima
  | ResultadoPerguntaMatrizClima
  | ResultadoPerguntaCaixaSelecaoClima

export interface ResultadosPerguntaAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}

export interface BuscarResultadosPerguntaDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}
```

Ordem fixa e determinística de `tipoRelacionamento` dentro de
`porTipoRelacionamento`/`DistribuicaoOpcaoTipoRelacionamento` (nunca ordem de
inserção do Map, que depende da ordem de chegada das linhas do banco):

```ts
const ORDEM_TIPOS_RELACIONAMENTO: TipoRelacionamento[] = [
  'autoavaliacao', 'gestor', 'pares', 'subordinado', 'externo',
]
```

### 2. DTO de query — mesmo padrão de período das 3 telas anteriores

`GET /api/analise/resultados-pergunta?de=YYYY-MM-DD&ate=YYYY-MM-DD&cicloId=`

Validação idêntica a `buscarAvaliacoes`/`buscarNuvemPalavras`
(`analise-avaliacoes.service.ts`/`analise-nuvem-palavras.service.ts`):

```ts
garantirPapel(ator, [...PAPEIS_COM_ACESSO])

const de = validarDataQuery(dto.de, 'de')
const ate = validarDataQuery(dto.ate, 'ate')
if (ate < de) throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser maior ou igual a "de".')

let cicloId: string | null = null
if (dto.cicloId !== undefined && dto.cicloId !== null && dto.cicloId !== '') {
  const cicloIdNormalizado = typeof dto.cicloId === 'string' ? dto.cicloId.trim() : dto.cicloId
  if (!ehUuidValido(cicloIdNormalizado)) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" deve ser um uuid válido.')
  }
  await buscarCicloOuFalhar(cicloIdNormalizado) // 404 CICLO_NAO_ENCONTRADO
  cicloId = cicloIdNormalizado
}
```

`cicloId` é **singular e opcional** (não um array — "múltiplos ciclos
combináveis" na spec se refere a "quando ausente, o período pode cobrir mais
de um ciclo simultaneamente", não a um filtro multi-valor), mesmo contrato
de `de`/`ate`/`cicloId` de "Avaliações"/"Nuvem de Palavras".

### 3. Funções auxiliares privadas de metadado (sem tocar em conteúdo de resposta)

```ts
async function buscarNomesCiclos(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nome: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.nome]))
}

async function buscarNomesCompetencias(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const competencias = await AppDataSource.getRepository(Competencia).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nome: true },
  })
  return new Map(competencias.map((c) => [c.id, c.nome]))
}

interface MetadadosPergunta { ordem: number; configuracao: Record<string, unknown> }

async function buscarMetadadosPerguntas(ids: string[]): Promise<Map<string, MetadadosPergunta>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const perguntas = await AppDataSource.getRepository(Pergunta).find({
    where: { id: In(idsUnicos) },
    select: { id: true, ordem: true, configuracao: true },
  })
  return new Map(perguntas.map((p) => [p.id, { ordem: p.ordem, configuracao: p.configuracao }]))
}

function extrairNiveis(configuracao: Record<string, unknown>): number {
  return Number((configuracao as { niveis?: unknown }).niveis ?? 0)
}

function extrairOpcoesConfiguradas(configuracao: Record<string, unknown>): string[] {
  return ((configuracao as { opcoes?: unknown }).opcoes as string[] | undefined) ?? []
}
```

Nenhuma dessas queries toca `itens_resposta`/`itens_resposta_clima`/
`avaliador_id` — só metadado estrutural (nome de ciclo/competência,
configuração de pergunta).

### 4. Queries de agregação — `avaliacao_360` (3 queries, `GROUP BY` inclui `avaliado_id` — nunca `avaliador_id`)

Todas filtradas por `rel.ciclo_id IN idsAval360` + `resposta.respondido_em`
dentro do período — mesmo filtro de período de `calcularGateParesSubordinado`
chamada com período (decisão A da spec). `avaliado_id` é chave intermediária
do gate, **nunca sai no payload final** (só `avaliadoId` interno, descartado
na composição do passo 6).

**Likert** (QueryBuilder padrão, sem LATERAL):

```ts
interface LinhaNivel360 {
  perguntaId: string; perguntaEnunciado: string; avaliadoId: string
  cicloId: string; tipoRelacionamento: TipoRelacionamento; nivel: number; contagem: number
}

async function agregarLikert360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaNivel360[]> {
  if (ids.length === 0) return []
  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', { tipoPergunta: 'likert' })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect("(item.valor ->> 'nota')::int", 'nivel')
    .addSelect('COUNT(*)', 'contagem')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('pergunta.id')
    .addGroupBy('pergunta.enunciado')
    .addGroupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')
    .addGroupBy("(item.valor ->> 'nota')::int")
    .getRawMany<{ perguntaId: string; perguntaEnunciado: string; avaliadoId: string; cicloId: string; tipoRelacionamento: TipoRelacionamento; nivel: number; contagem: string }>()

  return linhas.map((l) => ({ ...l, contagem: Number(l.contagem) }))
}
```

**Matriz** (LATERAL, `AppDataSource.query()`, parâmetro posicional `$1` como
array — `= ANY($1::uuid[])`):

```ts
interface LinhaCompetenciaNivel360 extends LinhaNivel360 { competenciaId: string }

async function agregarMatriz360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaCompetenciaNivel360[]> {
  if (ids.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rel.avaliado_id AS "avaliadoId",
           rel.ciclo_id AS "cicloId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           notas.chave AS "competenciaId",
           notas.valor::int AS "nivel",
           COUNT(*) AS "contagem"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rel.ciclo_id = ANY($1::uuid[])
      AND resposta.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rel.avaliado_id, rel.ciclo_id,
             rel.tipo_relacionamento, notas.chave, notas.valor
  `
  const linhas = await AppDataSource.query(sql, [ids, periodo.de, periodo.ate])
  return linhas.map((l: LinhaCompetenciaNivel360 & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}
```

**Caixa_selecao** (LATERAL sobre array jsonb, `jsonb_array_elements_text` —
diferente de `jsonb_each_text`, que é para objeto):

```ts
interface LinhaOpcao360 {
  perguntaId: string; perguntaEnunciado: string; avaliadoId: string
  cicloId: string; tipoRelacionamento: TipoRelacionamento; opcao: string; contagem: number
}

async function agregarCaixaSelecao360(ids: string[], periodo: PeriodoConsulta): Promise<LinhaOpcao360[]> {
  if (ids.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rel.avaliado_id AS "avaliadoId",
           rel.ciclo_id AS "cicloId",
           rel.tipo_relacionamento AS "tipoRelacionamento",
           opcoes.valor AS "opcao",
           COUNT(*) AS "contagem"
    FROM itens_resposta item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'caixa_selecao'
    JOIN respostas resposta ON resposta.id = item.resposta_id
    JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
    JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
    CROSS JOIN LATERAL jsonb_array_elements_text(item.valor -> 'opcoes') AS opcoes(valor)
    WHERE rel.ciclo_id = ANY($1::uuid[])
      AND resposta.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rel.avaliado_id, rel.ciclo_id,
             rel.tipo_relacionamento, opcoes.valor
  `
  const linhas = await AppDataSource.query(sql, [ids, periodo.de, periodo.ate])
  return linhas.map((l: LinhaOpcao360 & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}
```

Lembrete: **nenhuma dessas 3 queries seleciona `rel.avaliador_id`** — só
`avaliado_id` (que é chave intermediária do gate, nunca sai no payload
final).

### 5. Queries de agregação — `clima_geral` (restritas a `idsClimaLiberados`, gate-primeiro-depois-busca)

Estruturalmente anônimas (`respostas_clima`/`itens_resposta_clima` não têm
FK de identidade) — sem `avaliado_id`/`tipo_relacionamento`. **Só chamadas
com `idsClimaLiberados`** (já filtrados pelo gate no passo 6), nunca com
`idsClima` bruto.

**Likert:**

```ts
interface LinhaNivelClima { perguntaId: string; perguntaEnunciado: string; cicloId: string; nivel: number; contagem: number }

async function agregarLikertClima(idsLiberados: string[], periodo: PeriodoConsulta): Promise<LinhaNivelClima[]> {
  if (idsLiberados.length === 0) return []
  const linhas = await AppDataSource.getRepository(ItemRespostaClima)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', { tipoPergunta: 'likert' })
    .innerJoin(RespostaClima, 'rc', 'rc.id = item.resposta_clima_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('rc.ciclo_id', 'cicloId')
    .addSelect("(item.valor ->> 'nota')::int", 'nivel')
    .addSelect('COUNT(*)', 'contagem')
    .where('rc.ciclo_id IN (:...ids)', { ids: idsLiberados })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('pergunta.id')
    .addGroupBy('pergunta.enunciado')
    .addGroupBy('rc.ciclo_id')
    .addGroupBy("(item.valor ->> 'nota')::int")
    .getRawMany<{ perguntaId: string; perguntaEnunciado: string; cicloId: string; nivel: number; contagem: string }>()

  return linhas.map((l) => ({ ...l, contagem: Number(l.contagem) }))
}
```

**Matriz** (LATERAL, `AppDataSource.query()`):

```ts
interface LinhaCompetenciaNivelClima extends LinhaNivelClima { competenciaId: string }

async function agregarMatrizClima(idsLiberados: string[], periodo: PeriodoConsulta): Promise<LinhaCompetenciaNivelClima[]> {
  if (idsLiberados.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rc.ciclo_id AS "cicloId",
           notas.chave AS "competenciaId",
           notas.valor::int AS "nivel",
           COUNT(*) AS "contagem"
    FROM itens_resposta_clima item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'matriz'
    JOIN respostas_clima rc ON rc.id = item.resposta_clima_id
    CROSS JOIN LATERAL jsonb_each_text(item.valor -> 'notas') AS notas(chave, valor)
    WHERE rc.ciclo_id = ANY($1::uuid[])
      AND rc.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rc.ciclo_id, notas.chave, notas.valor
  `
  const linhas = await AppDataSource.query(sql, [idsLiberados, periodo.de, periodo.ate])
  return linhas.map((l: LinhaCompetenciaNivelClima & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}
```

**Caixa_selecao** (LATERAL sobre array jsonb):

```ts
interface LinhaOpcaoClima { perguntaId: string; perguntaEnunciado: string; cicloId: string; opcao: string; contagem: number }

async function agregarCaixaSelecaoClima(idsLiberados: string[], periodo: PeriodoConsulta): Promise<LinhaOpcaoClima[]> {
  if (idsLiberados.length === 0) return []
  const sql = `
    SELECT pergunta.id AS "perguntaId",
           pergunta.enunciado AS "perguntaEnunciado",
           rc.ciclo_id AS "cicloId",
           opcoes.valor AS "opcao",
           COUNT(*) AS "contagem"
    FROM itens_resposta_clima item
    JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'caixa_selecao'
    JOIN respostas_clima rc ON rc.id = item.resposta_clima_id
    CROSS JOIN LATERAL jsonb_array_elements_text(item.valor -> 'opcoes') AS opcoes(valor)
    WHERE rc.ciclo_id = ANY($1::uuid[])
      AND rc.respondido_em::date BETWEEN $2::date AND $3::date
    GROUP BY pergunta.id, pergunta.enunciado, rc.ciclo_id, opcoes.valor
  `
  const linhas = await AppDataSource.query(sql, [idsLiberados, periodo.de, periodo.ate])
  return linhas.map((l: LinhaOpcaoClima & { contagem: string }) => ({ ...l, contagem: Number(l.contagem) }))
}
```

### 6. Ciclos de clima bloqueados — enumeração ESTRUTURAL de perguntas (sem tocar em nenhuma resposta)

Para um `cicloId` de `clima_geral` que **não** passou no gate
(`gateClima` tem linha para ele, mas `totalRespondentes < minimo`), a regra
"gate-primeiro-depois-busca" proíbe rodar as 3 queries do passo 5 sobre ele
— então não há como saber quais perguntas têm resposta sem violar a regra.
Solução: enumerar as perguntas **estruturalmente**, a partir de
`perguntas → paginas_pesquisa → pesquisas` (nunca toca
`itens_resposta_clima`/`respostas_clima`), igual à decisão da spec seção 8,
item 6 ("aparecem no array `climaGeral` com `liberado: false`, sem
distribuição"). É metadado de configuração de pergunta, não conteúdo de
resposta — visível independente do gate.

```ts
async function resolverPesquisaVinculadaPorCiclo(idsCiclos: string[]): Promise<Map<string, string>> {
  if (idsCiclos.length === 0) return new Map()
  // Mesmo critério de desempate de classificarPorTipo (analise-comum.ts):
  // pesquisa mais recente (criadoEm DESC) quando há mais de uma por ciclo.
  const pesquisas = await AppDataSource.getRepository(Pesquisa).find({
    where: { cicloId: In(idsCiclos) },
    order: { criadoEm: 'DESC' },
    select: { id: true, cicloId: true },
  })
  const mapa = new Map<string, string>() // cicloId -> pesquisaId
  for (const p of pesquisas) {
    if (p.cicloId && !mapa.has(p.cicloId)) mapa.set(p.cicloId, p.id)
  }
  return mapa
}

interface PerguntaEstrutural {
  perguntaId: string; perguntaEnunciado: string; tipo: 'likert' | 'matriz' | 'caixa_selecao'
  ordem: number; configuracao: Record<string, unknown>; pesquisaId: string
}

async function buscarPerguntasEstruturaisPorPesquisa(pesquisaIds: string[]): Promise<PerguntaEstrutural[]> {
  if (pesquisaIds.length === 0) return []
  return AppDataSource.getRepository(Pergunta)
    .createQueryBuilder('pergunta')
    .innerJoin(PaginaPesquisa, 'pagina', 'pagina.id = pergunta.pagina_id')
    .select('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect('pergunta.tipo', 'tipo')
    .addSelect('pergunta.ordem', 'ordem')
    .addSelect('pergunta.configuracao', 'configuracao')
    .addSelect('pagina.pesquisa_id', 'pesquisaId')
    .where('pagina.pesquisa_id IN (:...pesquisaIds)', { pesquisaIds })
    .andWhere('pergunta.tipo IN (:...tipos)', { tipos: ['likert', 'matriz', 'caixa_selecao'] })
    .getRawMany<PerguntaEstrutural>()
}
```

Usar só para `idsClimaBloqueados` (ver passo 8) — nunca para
`idsClimaLiberados` (esses já vêm das queries reais do passo 5, que só
retornam perguntas com pelo menos 1 resposta, cumprindo o critério "pergunta
sem resposta não aparece", seção 10 item 3 da spec).

### 7. Zero-fill — função dedicada, aplicada só a entradas `liberado: true`

```ts
function zeroFillNiveis(niveis: number, contagens: Map<number, number>): ContagemNivel[] {
  const resultado: ContagemNivel[] = []
  for (let nivel = 1; nivel <= niveis; nivel++) {
    resultado.push({ nivel, contagem: contagens.get(nivel) ?? 0 })
  }
  return resultado
}

function zeroFillOpcoes(opcoesConfiguradas: string[], contagens: Map<string, number>): ContagemOpcao[] {
  // Preserva a ORDEM configurada em perguntas.configuracao.opcoes — nunca
  // ordenada alfabeticamente nem por contagem.
  return opcoesConfiguradas.map((opcao) => ({ opcao, contagem: contagens.get(opcao) ?? 0 }))
}
```

Nunca aplicado a entradas `liberado: false` (essas não têm `distribuicao`,
ver interfaces do passo 1).

### 8. Composição em memória — `avaliacao_360`

Estruturas intermediárias (chaves só em memória, nunca no payload final):

```ts
type ChaveTipo = string // `${perguntaId}|${tipoRelacionamento}`
type ChaveCompetenciaTipo = string // `${perguntaId}|${competenciaId}|${tipoRelacionamento}`
type ChaveGate = string // `${avaliadoId}|${cicloId}|${tipoRelacionamento}` — mesma forma usada pelo Ranking

function elegivel(tipoRelacionamento: TipoRelacionamento, avaliadoId: string, cicloId: string, gate: Map<ChaveGate, number>, minimo: number): boolean {
  if (tipoRelacionamento === 'autoavaliacao' || tipoRelacionamento === 'gestor' || tipoRelacionamento === 'externo') return true
  return (gate.get(`${avaliadoId}|${cicloId}|${tipoRelacionamento}`) ?? 0) >= minimo
}
```

**Likert** — para cada linha de `agregarLikert360`:
1. `existiuLikert.add(chave = perguntaId|tipoRelacionamento)` — SEMPRE,
   independente de elegibilidade (marca que o tipo apareceu na query bruta).
2. Se `elegivel(...)`: acumular
   `distribLikert.get(perguntaId).get(tipoRelacionamento).get(nivel) += contagem`
   (Maps aninhados, criados sob demanda).
3. Guardar `metaPergunta.set(perguntaId, { perguntaEnunciado, cicloId })` (a
   primeira linha encontrada basta — pergunta pertence a exatamente 1 ciclo,
   decisão D da spec).

Depois de processar todas as linhas, montar
`ResultadoPerguntaLikert360[]`: para cada `perguntaId` em `metaPergunta`,
para cada `tipoRelacionamento` em `ORDEM_TIPOS_RELACIONAMENTO` onde
`existiuLikert.has(perguntaId|tipoRelacionamento)`:
- `total = soma dos valores do Map de níveis elegível (ou 0 se nunca elegível)`
- `liberado = total > 0`
- se liberado: `distribuicao: zeroFillNiveis(niveis, mapaDeNiveis)`
- senão: `motivo: 'aguardando_minimo_respondentes'`, sem `distribuicao`

`niveis = extrairNiveis(metadadosPerguntas.get(perguntaId).configuracao)`.

**Matriz** — mesmo algoritmo, com um nível extra de agrupamento por
`competenciaId` (chaves `existiuMatriz`/`distribMatriz` incluem
`competenciaId`, ver decisão B da spec — cada competência mantém contagem
PRÓPRIA, nunca soma entre competências da mesma pergunta). Depois de montar
`porTipoRelacionamento` por competência, resolver `competenciaNome` via
`buscarNomesCompetencias` (passo 3) e ordenar o array `competencias` por
`competenciaNome.localeCompare(outro, 'pt-BR')`.

**Caixa_selecao** — mesmo algoritmo de `existiu`/acumulação, chave por
`opcao` (string) em vez de `nivel` (number). `liberado`/`motivo` seguem a
mesma regra (`total > 0`). `distribuicao: zeroFillOpcoes(opcoesConfiguradas, mapaDeOpcoes)`,
`opcoesConfiguradas = extrairOpcoesConfiguradas(metadadosPerguntas.get(perguntaId).configuracao)`.
Lembrete (seção 2.2/3 da spec): uma resposta pode contribuir para mais de uma
opção (multiseleção) — soma das contagens pode superar o nº de
respondentes, isso é esperado, não filtrar/normalizar.

Pergunta sem NENHUMA linha elegível ou não-elegível em nenhum dos 3 tipos
agregados simplesmente nunca entra em `metaPergunta` — não aparece no array
final (seção 10, item 3 da spec).

Montar o array final `avaliacao360` concatenando os 3 conjuntos (likert +
matriz + caixa_selecao — nunca há sobreposição de `perguntaId` entre eles,
pergunta tem exatamente 1 `tipo`), ordenado por `nomeCiclo` (localeCompare
pt-BR) e depois por `pergunta.ordem` (asc) — usar o `ordem` de
`buscarMetadadosPerguntas` como chave de ordenação **descartada** do objeto
final (não é um campo do contrato de resposta).

### 9. Composição em memória — `clima_geral`

1. `gateClimaMap = new Map(gateClima.map((g) => [g.cicloId, g.totalRespondentes]))`.
2. `idsClimaLiberados = idsClima.filter((id) => (gateClimaMap.get(id) ?? 0) >= minimo)`.
3. `idsClimaBloqueados = idsClima.filter((id) => { const t = gateClimaMap.get(id) ?? 0; return t > 0 && t < minimo })`
   — **só** ciclos com pelo menos 1 resposta no período mas abaixo do
   mínimo. Ciclos com **zero** respostas no período (`gateClimaMap` não tem
   entrada para eles — `calcularGateClima` só retorna linha para ciclos com
   `COUNT >= 1`) não entram em `idsClimaBloqueados` nem geram nenhuma
   entrada no array final — "ausência de dado" não é "bloqueado" (mesmo
   critério já usado em `analise-nuvem-palavras.service.ts`, variável
   `motivoVazio`).
4. Rodar as 3 queries do passo 5 restritas a `idsClimaLiberados` — cada linha
   retornada já corresponde a um ciclo liberado, então **todo** resultado
   dessas 3 queries vira `liberado: true` direto, com zero-fill aplicado
   (mesmo algoritmo do passo 8, sem a fase de gate por avaliado — aqui basta
   agrupar por `perguntaId`/`competenciaId`/`opcao` e já é tudo elegível).
5. Para `idsClimaBloqueados`: `resolverPesquisaVinculadaPorCiclo(idsClimaBloqueados)`
   → `buscarPerguntasEstruturaisPorPesquisa([...pesquisaIds])` (passo 6) →
   para cada pergunta estrutural retornada, montar uma entrada com
   `liberado: false`, `motivo: 'aguardando_minimo_respondentes'`, sem
   `distribuicao`/`competencias`, mas **com** `niveis`/`opcoesDisponiveis`
   preenchidos a partir de `configuracao` (metadado de configuração, não
   conteúdo de resposta — seguro expor mesmo bloqueado). `cicloId` resolvido
   via o mapa inverso `pesquisaId -> cicloId` (construído a partir do mesmo
   `resolverPesquisaVinculadaPorCiclo`).
6. Concatenar liberados + bloqueados em `climaGeral`, ordenar por
   `nomeCiclo` e depois `pergunta.ordem` — mesmo critério do passo 8.

### 10. Fluxo completo de `buscarResultadosPergunta`

```ts
export async function buscarResultadosPergunta(
  ator: ColaboradorAutenticado,
  dto: BuscarResultadosPerguntaDto,
): Promise<ResultadosPerguntaAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const de = validarDataQuery(dto.de, 'de')
  const ate = validarDataQuery(dto.ate, 'ate')
  if (ate < de) throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser maior ou igual a "de".')

  let cicloId: string | null = null
  if (dto.cicloId !== undefined && dto.cicloId !== null && dto.cicloId !== '') {
    const cicloIdNormalizado = typeof dto.cicloId === 'string' ? dto.cicloId.trim() : dto.cicloId
    if (!ehUuidValido(cicloIdNormalizado)) {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "cicloId" deve ser um uuid válido.')
    }
    await buscarCicloOuFalhar(cicloIdNormalizado)
    cicloId = cicloIdNormalizado
  }

  const periodo: PeriodoConsulta = { de, ate }
  const idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)

  if (idsUniverso.length === 0) {
    return { periodo, cicloId, avaliacao360: [], climaGeral: [] }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [
    linhasLikert360, linhasMatriz360, linhasCaixa360,
    gateParesSubordinado, gateClima, minimosPorCiclo, nomesCiclos,
  ] = await Promise.all([
    agregarLikert360(idsAval360, periodo),
    agregarMatriz360(idsAval360, periodo),
    agregarCaixaSelecao360(idsAval360, periodo),
    calcularGateParesSubordinado(idsAval360, periodo), // COM período
    calcularGateClima(idsClima, periodo),
    buscarMinimosPorCiclo(idsUniverso),
    buscarNomesCiclos(idsUniverso),
  ])

  const gate = new Map(
    gateParesSubordinado.map((g) => [`${g.avaliadoId}|${g.cicloId}|${g.tipoRelacionamento}`, g.totalRespondentes]),
  )
  const minimoDoCiclo = (id: string) => minimosPorCiclo.get(id) ?? 3

  // --- composição avaliacao_360 (passo 8) ---
  const idsPerguntas360 = [...new Set([...linhasLikert360, ...linhasMatriz360, ...linhasCaixa360].map((l) => l.perguntaId))]
  const idsCompetencias = [...new Set(linhasMatriz360.map((l) => l.competenciaId))]
  const [metadadosPerguntas360, nomesCompetencias] = await Promise.all([
    buscarMetadadosPerguntas(idsPerguntas360),
    buscarNomesCompetencias(idsCompetencias),
  ])
  const avaliacao360 = montarAvaliacao360(
    linhasLikert360, linhasMatriz360, linhasCaixa360,
    gate, minimoDoCiclo, metadadosPerguntas360, nomesCiclos, nomesCompetencias,
  )

  // --- composição clima_geral (passo 9) — gate primeiro, busca depois ---
  const gateClimaMap = new Map(gateClima.map((g) => [g.cicloId, g.totalRespondentes]))
  const idsClimaLiberados = idsClima.filter((id) => (gateClimaMap.get(id) ?? 0) >= minimoDoCiclo(id))
  const idsClimaBloqueados = idsClima.filter((id) => {
    const total = gateClimaMap.get(id) ?? 0
    return total > 0 && total < minimoDoCiclo(id)
  })

  const [linhasLikertClima, linhasMatrizClima, linhasCaixaClima] = await Promise.all([
    agregarLikertClima(idsClimaLiberados, periodo),
    agregarMatrizClima(idsClimaLiberados, periodo),
    agregarCaixaSelecaoClima(idsClimaLiberados, periodo),
  ])

  const idsPerguntasClima = [...new Set([...linhasLikertClima, ...linhasMatrizClima, ...linhasCaixaClima].map((l) => l.perguntaId))]
  const idsCompetenciasClima = [...new Set(linhasMatrizClima.map((l) => l.competenciaId))]

  const pesquisaVinculadaBloqueados = await resolverPesquisaVinculadaPorCiclo(idsClimaBloqueados)
  const perguntasEstruturaisBloqueadas = await buscarPerguntasEstruturaisPorPesquisa([...pesquisaVinculadaBloqueados.values()])

  const [metadadosPerguntasClima, nomesCompetenciasClima] = await Promise.all([
    buscarMetadadosPerguntas([...idsPerguntasClima, ...perguntasEstruturaisBloqueadas.map((p) => p.perguntaId)]),
    buscarNomesCompetencias(idsCompetenciasClima),
  ])

  const climaGeral = montarClimaGeral(
    linhasLikertClima, linhasMatrizClima, linhasCaixaClima,
    perguntasEstruturaisBloqueadas, pesquisaVinculadaBloqueados,
    metadadosPerguntasClima, nomesCiclos, nomesCompetenciasClima,
  )

  return { periodo, cicloId, avaliacao360, climaGeral }
}
```

`montarAvaliacao360`/`montarClimaGeral` implementam literalmente os
algoritmos descritos nos passos 8/9 — funções privadas, não exportadas
(mesmo critério de encapsulamento de `comporMediasPorAvaliado` no Ranking).

### 11. Controller + rota

`analise.controller.ts` — novo handler, mesmo padrão dos 4 existentes:

```ts
import * as analiseResultadosPerguntaService from './analise-resultados-pergunta.service'

export async function buscarResultadosPerguntaAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseResultadosPerguntaService.buscarResultadosPergunta(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}
```

`analise.module.ts` — nova rota, sob o mesmo `router.use(autenticar)`:

```ts
import { buscarResultadosPerguntaAnalise } from './analise.controller' // junto dos outros 4 imports

router.get('/resultados-pergunta', asyncHandler(buscarResultadosPerguntaAnalise))
```

`app.ts` não muda — `/api/analise` já está montado.

---

## Plano — Backend

### 1. backend-developer — CONCLUÍDO

Antes de codar: reler o "LEMBRETE DA REGRA MAIS SENSÍVEL" no topo deste
documento e a skill `backend-anonimizacao-respostas`. Confirmar que nenhuma
migration é necessária (não rodar `migration:generate`/`migration:run`).

**Resumo do que foi feito:**

- Criado `backend/src/modules/analise/analise-resultados-pergunta.service.ts`
  implementando literalmente os passos 1–10 da seção "Decisões de
  modelagem": tipos/interfaces exportados, funções auxiliares de metadado
  (`buscarNomesCiclos`, `buscarNomesCompetencias`, `buscarMetadadosPerguntas`,
  `extrairNiveis`, `extrairOpcoesConfiguradas`), as 3 queries de agregação de
  `avaliacao_360` (`agregarLikert360` via QueryBuilder;
  `agregarMatriz360`/`agregarCaixaSelecao360` via `AppDataSource.query()` com
  SQL parametrizado posicional), as 3 queries de `clima_geral`
  (`agregarLikertClima`/`agregarMatrizClima`/`agregarCaixaSelecaoClima`,
  chamadas exclusivamente com `idsClimaLiberados`), a enumeração estrutural de
  perguntas para ciclos de clima bloqueados
  (`resolverPesquisaVinculadaPorCiclo`/`buscarPerguntasEstruturaisPorPesquisa`,
  sem nenhum JOIN com `respostas_clima`/`itens_resposta_clima`), zero-fill
  (`zeroFillNiveis`/`zeroFillOpcoes`), as funções de composição em memória
  privadas `montarAvaliacao360`/`montarClimaGeral` (gate por
  avaliado+ciclo+tipo para 360 via `elegivel`, chave
  `${avaliadoId}|${cicloId}|${tipoRelacionamento}`; matriz com distribuição
  separada por competência; ordenação final por `nomeCiclo` pt-BR e depois
  `pergunta.ordem`, campo `ordem` descartado do contrato de resposta) e a
  função exportada `buscarResultadosPergunta`, com `garantirPapel` como
  única checagem de papel, sem bypass em nenhum gate.
- `analise.controller.ts`: adicionado handler `buscarResultadosPerguntaAnalise`
  (mesmo padrão dos 4 handlers existentes).
- `analise.module.ts`: adicionada rota
  `router.get('/resultados-pergunta', asyncHandler(buscarResultadosPerguntaAnalise))`,
  sob o mesmo `router.use(autenticar)`.
- Nenhuma migration necessária — módulo só leitura sobre tabelas já
  existentes. Nenhuma migration foi gerada nem rodada.
- Guard rails confirmados durante a implementação: `anonimizar_respostas_pares`
  nunca é lida (única coluna de `ciclos_avaliacao` tocada é
  `minimo_respostas_pares`, via `buscarMinimosPorCiclo` de `analise-comum.ts`,
  reaproveitada tal qual); nenhuma query nova deste arquivo seleciona
  `avaliador_id` bruto; nenhuma interface exportada expõe
  `totalRespondentes`/`minimoNecessario` — só `liberado`/`motivo`.
- `npm run build` (tsc): 0 erros novos — só o erro pré-existente e não
  relacionado em `src/test/fakeRepository.ts` (já sinalizado como conhecido).
- `npm test` (vitest): 251/251 testes passando, 0 regressão (nenhum teste
  novo escrito nesta etapa — responsabilidade do `test-engineer`, etapa
  posterior).

1. Criar `backend/src/modules/analise/analise-resultados-pergunta.service.ts`
   com os tipos/interfaces do passo 1 (seção "Decisões de modelagem"),
   importando de `./analise-comum`: `PAPEIS_COM_ACESSO`, `validarDataQuery`,
   `buscarUniversoCiclos`, `classificarPorTipo`, `calcularGateParesSubordinado`,
   `calcularGateClima`, `buscarMinimosPorCiclo`, e o tipo `PeriodoConsulta`.
2. Implementar as funções auxiliares de metadado do passo 3
   (`buscarNomesCiclos`, `buscarNomesCompetencias`, `buscarMetadadosPerguntas`,
   `extrairNiveis`, `extrairOpcoesConfiguradas`).
3. Implementar as 3 queries de `avaliacao_360` do passo 4
   (`agregarLikert360` via QueryBuilder, `agregarMatriz360`/
   `agregarCaixaSelecao360` via `AppDataSource.query()` com SQL literal do
   passo 4, parâmetros sempre posicionais — nunca interpolar `ids`/período
   como string concatenada).
4. Implementar as 3 queries de `clima_geral` do passo 5
   (mesmo padrão QueryBuilder/`AppDataSource.query()`), **só chamadas com
   `idsClimaLiberados`** (nunca com `idsClima` bruto — gate-primeiro-depois-
   busca).
5. Implementar `resolverPesquisaVinculadaPorCiclo` e
   `buscarPerguntasEstruturaisPorPesquisa` do passo 6, usadas exclusivamente
   para `idsClimaBloqueados`.
6. Implementar `zeroFillNiveis`/`zeroFillOpcoes` do passo 7.
7. Implementar `montarAvaliacao360` (passo 8) e `montarClimaGeral` (passo 9)
   seguindo literalmente os algoritmos descritos — usar
   `ORDEM_TIPOS_RELACIONAMENTO` para ordem determinística de
   `porTipoRelacionamento`, ordenar `competencias`/arrays finais por
   `nomeCiclo`/`pergunta.ordem` conforme descrito.
8. Implementar a função exportada `buscarResultadosPergunta` (passo 10),
   `garantirPapel` como primeira linha, orquestrando os passos 2–9 com
   `Promise.all` onde as chamadas forem independentes.
9. `analise.controller.ts`: adicionar handler `buscarResultadosPerguntaAnalise`
   (passo 11) — ler `analise.controller.ts` primeiro para confirmar a
   convenção exata dos 4 handlers existentes antes de escrever o quinto.
10. `analise.module.ts`: adicionar `router.get('/resultados-pergunta', ...)`
    (passo 11) — ler `analise.module.ts` primeiro para confirmar a ordem/
    convenção das 4 rotas existentes.
11. Nenhuma migration, nenhuma variável de ambiente nova, nenhuma entrada
    nova em `common/enums.ts`. Nenhum código novo em
    `MAPA_CONSTRAINT_PARA_CODIGO` (módulo só leitura). `npm run build` (tsc)
    deve rodar sem novos erros; não há suíte de teste a atualizar nesta
    etapa (ver "Nota para test-engineer" ao final).

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **`anonimizar_respostas_pares` nunca lida**: grep em
   `analise-resultados-pergunta.service.ts` por
   `anonimizarRespostasPares`/`anonimizar_respostas_pares` — qualquer
   ocorrência fora de comentário é achado crítico. Confirmar que
   `buscarMinimosPorCiclo` (reaproveitada de `analise-comum.ts`) não foi
   reimplementada localmente com um `select` diferente.
2. **Nenhum `COUNT` exato de respondentes no payload**: confirmar que
   nenhuma interface exportada (`DistribuicaoTipoRelacionamento`,
   `DistribuicaoOpcaoTipoRelacionamento`, `ResultadoPerguntaClima` e
   variantes) tem campo `totalRespondentes`/`minimoNecessario`/qualquer
   contagem de respondentes — só `liberado`/`motivo`. Isso é **mais
   estrito** que "Avaliações" (que expõe `totalRespondentes`) — não copiar
   esse padrão por engano.
3. **`avaliador_id` nunca projetado bruto**: grep por `avaliadorId`/
   `avaliador_id` no arquivo novo — a única ocorrência aceitável é dentro de
   `calcularGateParesSubordinado` (`analise-comum.ts`, já existente, não
   deste arquivo). Nenhuma query nova deste arquivo deve selecionar essa
   coluna.
4. **Gate-primeiro-depois-busca para clima**: confirmar que
   `agregarLikertClima`/`agregarMatrizClima`/`agregarCaixaSelecaoClima` só
   são chamadas com `idsClimaLiberados` (pós-filtro), nunca com `idsClima`
   bruto — buscar a chamada no fluxo principal (passo 10) e verificar o
   argumento literal.
5. **Gate por avaliado+ciclo+tipo para 360, não por pergunta**: confirmar
   que `montarAvaliacao360` usa a chave `${avaliadoId}|${cicloId}|${tipoRelacionamento}`
   para consultar o gate (não uma chave que ignore `avaliadoId`), e que
   `autoavaliacao`/`gestor`/`externo` são sempre elegíveis sem gate.
6. **Matriz não agregada entre competências**: confirmar que a Map de
   acumulação de matriz tem `competenciaId` como parte da chave em TODOS os
   níveis (existência E acumulação elegível) — uma pergunta matriz com 2
   competências deve produzir 2 entradas em `competencias[]`, com
   distribuições independentes.
7. **SQL parametrizado posicional**: nas 4 queries via `AppDataSource.query()`
   (matriz/caixa_selecao × 360/clima), confirmar que `ids`/`periodo.de`/
   `periodo.ate` chegam via array de parâmetros (`[ids, de, ate]`), nunca
   por interpolação de template string dentro do SQL.
8. **Enumeração estrutural de clima bloqueado não vaza conteúdo**: confirmar
   que `buscarPerguntasEstruturaisPorPesquisa` só faz JOIN com
   `paginas_pesquisa`/`pesquisas`/`perguntas` — nenhum JOIN com
   `respostas_clima`/`itens_resposta_clima` nessa função específica.
9. **Zero-fill só em `liberado: true`**: confirmar que nenhuma entrada com
   `liberado: false` carrega `distribuicao`/`competencias` preenchidos.
10. **`garantirPapel` único ponto de checagem de papel**: nenhum
    `if (ator.papel === ...)` alterando o resultado de um gate em nenhuma
    função do arquivo.

---

## Revisão

Revisado `analise-resultados-pergunta.service.ts` (arquivo novo, 945 linhas),
`analise.controller.ts` e `analise.module.ts` (handler/rota novos) contra os
10 pontos do checklist específico desta task e contra o checklist padrão
(anonimização, controle de acesso, consistência de schema, qualidade geral).
Verificação feita por leitura direta do código (grep + leitura completa),
cruzando com `analise-comum.ts` e as entidades tocadas
(`RelacionamentoAvaliacao`, `Pergunta`, `Pesquisa`, `PaginaPesquisa`,
`CicloAvaliacao`, `Competencia`).

**Crítico**: nenhum.

Checklist específico da task, um a um:

1. `anonimizar_respostas_pares`/`anonimizarRespostasPares`: zero ocorrências
   no arquivo (grep confirma). `buscarMinimosPorCiclo` é a versão importada
   de `analise-comum.ts` (`select` explícito `{ id, minimoRespostasPares }`),
   não reimplementada localmente.
2. Nenhuma interface exportada (`DistribuicaoTipoRelacionamento`,
   `DistribuicaoOpcaoTipoRelacionamento`, `ResultadoPerguntaLikert360`,
   `ResultadoPerguntaMatriz360`, `ResultadoPerguntaCaixaSelecao360`,
   `ResultadoPerguntaLikertClima`/`MatrizClima`/`CaixaSelecaoClima`) tem
   campo `totalRespondentes`/`minimoNecessario` — só `liberado`/`motivo`. As
   duas únicas ocorrências de `totalRespondentes` no arquivo são variáveis
   internas (`gateParesSubordinado`/`gateClima`, vindas de
   `analise-comum.ts`), nunca serializadas no payload de retorno.
3. `avaliadorId`/`avaliador_id`: as únicas ocorrências no arquivo são em
   comentários (linhas 39, 42-43, 210) — nenhuma query nova deste arquivo
   projeta essa coluna; `rel.avaliado_id` é o único campo de identidade
   selecionado (chave intermediária de gate, nunca no payload final).
4. Gate-primeiro-depois-busca para clima confirmado no fluxo principal
   (`buscarResultadosPergunta`): `idsClimaLiberados` é calculado a partir de
   `gateClimaMap` **antes** de `agregarLikertClima`/`agregarMatrizClima`/
   `agregarCaixaSelecaoClima` serem chamadas, e as três chamadas usam
   literalmente `idsClimaLiberados` como argumento — nunca `idsClima` bruto.
5. `elegivel()` usa a chave `${avaliadoId}|${cicloId}|${tipoRelacionamento}`
   (variável `ChaveGate`), consistente com a chave de montagem do Map `gate`
   no fluxo principal. `autoavaliacao`/`gestor`/`externo` retornam `true`
   incondicionalmente, sem consultar o gate.
6. Confirmado: `existiuMatriz`/`distribMatriz`/`competenciasPorPergunta`
   (tanto em `montarAvaliacao360` quanto em `montarClimaGeral`) incluem
   `competenciaId` como parte da chave em todos os níveis — cada competência
   de uma pergunta matriz produz uma entrada independente em
   `competencias[]`, com `liberado`/distribuição calculados separadamente
   (inclusive por `tipoRelacionamento` dentro de cada competência, em 360).
7. As 4 queries via `AppDataSource.query()` (`agregarMatriz360`,
   `agregarCaixaSelecao360`, `agregarMatrizClima`, `agregarCaixaSelecaoClima`)
   usam exclusivamente parâmetros posicionais (`$1`/`$2`/`$3`) passados como
   array (`[ids, periodo.de, periodo.ate]`) — nenhuma interpolação de
   template string dentro do SQL.
8. `buscarPerguntasEstruturaisPorPesquisa` só faz `innerJoin` com
   `PaginaPesquisa` (e a tabela `perguntas` como raiz) — nenhum JOIN com
   `RespostaClima`/`ItemRespostaClima`. `resolverPesquisaVinculadaPorCiclo`
   só toca `Pesquisa` (`select: { id, cicloId }`). Nenhuma das duas funções
   é chamada com `idsClimaLiberados`, só com `idsClimaBloqueados`.
9. Entradas `liberado: false` (tanto em `porTipoRelacionamento` de 360
   quanto nos itens bloqueados de `climaGeral`) nunca carregam
   `distribuicao`/`competencias` — confirmado nos objetos literais retornados
   (`{ tipoRelacionamento: tipo, liberado: false, motivo: '...' }` sem chave
   `distribuicao`; bloqueadas de clima só carregam `niveis`/
   `opcoesDisponiveis`, que são metadado de configuração, não conteúdo de
   resposta).
10. `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` (linha 840) é a única
    checagem de papel do arquivo — nenhuma ocorrência de
    `ator.papel === ...` fora do comentário que documenta a regra.

**Deveria corrigir**: nenhum.

**Sugestão**:
- `buscarMetadadosPerguntas` em `montarClimaGeral` recebe também os
  `perguntaId` de `perguntasEstruturaisBloqueadas`
  (`[...idsPerguntasClima, ...perguntasEstruturaisBloqueadas.map(p => p.perguntaId)]`),
  mas essas entradas usam `p.configuracao`/`p.ordem` direto do resultado de
  `buscarPerguntasEstruturaisPorPesquisa`, não o retorno de
  `buscarMetadadosPerguntas` — busca redundante, sem impacto de
  correção/segurança, só uma query um pouco maior que o necessário.

Sem achados críticos — módulo pode seguir para `test-engineer`.

## Nota para `test-engineer` (etapa posterior, fora do escopo desta task)

Cenários de gate/anonimização mais críticos a cobrir depois:

1. Pergunta `likert`/`caixa_selecao` avaliação 360 com `pares` abaixo do
   mínimo e `subordinado` acima — a entrada `pares` deve vir
   `liberado: false` sem `distribuicao`, `subordinado` deve vir
   `liberado: true` com zero-fill completo, no MESMO item de
   `avaliacao360[]`.
2. Pergunta `matriz` com 2 competências, onde `pares` atinge o mínimo na
   competência A mas não na B (avaliados diferentes por competência) —
   confirmar `liberado` independente por competência dentro do mesmo
   `tipoRelacionamento`.
3. Ciclo `clima_geral` abaixo do mínimo — confirmar que as perguntas desse
   ciclo aparecem em `climaGeral[]` com `liberado: false`, sem
   `distribuicao`, e que NENHUMA query do teste (via spy/mock de
   `AppDataSource.query`) chega a rodar as agregações de conteúdo para esse
   `cicloId`.
4. Ciclo `clima_geral` com ZERO respostas no período — confirmar que nenhuma
   entrada aparece em `climaGeral[]` para esse ciclo (nem liberada, nem
   bloqueada).
5. `caixa_selecao` com resposta multiseleção (uma resposta marcando 2+
   opções) — confirmar que a soma das contagens das opções pode exceder o
   nº de respostas da fatia, sem nenhuma normalização indevida.
6. Papel `colaborador` chamando o endpoint — `403 PAPEL_NAO_AUTORIZADO`, sem
   nenhum dado retornado.
7. Grep automatizado (mesmo espírito do checklist do
   `backend-codereviewer`) por `avaliadorId`/`avaliador_id` e
   `totalRespondentes`/`minimoNecessario` no arquivo de service e no shape
   de resposta serializado em teste de integração do endpoint.

## Testes

`backend/src/modules/analise/analise-resultados-pergunta.service.spec.ts`
(novo, 29 testes) — mesmo padrão de setup/seed de
`analise-nuvem-palavras.service.spec.ts` (`construirRepositoriosAnaliseFalsos`,
`criarColaboradorFixture`, `configurarGetUserPorToken`/
`configurarSupabaseAdminPadrao` para o bloco HTTP via `supertest`).

Cobertura:

- **Controle de acesso**: `colaborador` → 403 `PAPEL_NAO_AUTORIZADO` sem
  nenhuma query rodada (nem via chamada direta ao service, nem via HTTP);
  `admin`/`gestor_rh` → 200 com payload idêntico entre os dois papéis, sem
  bypass de gate para nenhum dos dois.
- **Validação de `de`/`ate`/`cicloId`**: mesmos 422/404 das telas anteriores
  do módulo (`CAMPO_INVALIDO`, `PERIODO_INVALIDO`, `CICLO_NAO_ENCONTRADO`).
- **Os 7 cenários críticos da nota do `backend-developer`**, um a um:
  1. Likert avaliação 360 — `pares` abaixo do mínimo (`liberado:false`, sem
     `distribuicao`) e `subordinado` do MESMO avaliado+ciclo acima do
     mínimo (`liberado:true`, zero-fill completo) dentro do MESMO item de
     `avaliacao360[]`.
  2. Matriz com 2 competências na mesma pergunta/tipo — competência A
     atinge o mínimo, competência B (avaliado diferente) não — `liberado`
     independente por competência confirmado.
  3. Ciclo `clima_geral` abaixo do mínimo — aparece em `climaGeral[]` com
     `liberado:false`, sem `distribuicao`; adicionalmente, todas as
     chamadas registradas em `AppDataSource.query` (spy) são inspecionadas
     para confirmar que nenhuma incluiu esse `cicloId` na lista de ids
     agregados (gate-primeiro-depois-busca).
  4. Ciclo `clima_geral` com ZERO respostas no período — nenhuma entrada
     aparece em `climaGeral[]` (nem liberada, nem bloqueada).
  5. `caixa_selecao` com multiseleção — 1 resposta marcando 2 opções produz
     `contagem:1` em AMBAS as opções (soma > nº de respondentes), sem
     nenhuma normalização indevida.
  6. Papel `colaborador` chamando o service diretamente, mesmo com dado
     seedado → 403, nenhum fragmento do payload retornado.
  7. Grep automatizado (`JSON.stringify` + varredura recursiva de chaves)
     por `avaliadorId`/`avaliador_id`/`totalRespondentes`/
     `minimoNecessario`/`minimoRespostasPares` — tanto no cenário misto
     (likert + matriz + caixa_selecao, 360 + clima) quanto no shape HTTP
     serializado do endpoint.
- **Caminho feliz** para os 3 tipos de pergunta × 2 universos (likert/
  matriz/caixa_selecao × avaliação 360/clima_geral), incluindo zero-fill
  (nível/opção sem nenhuma resposta ainda aparece com `contagem: 0`) e o
  caso "no mínimo exato" de clima (limiar inclusivo, `>=`).
- **`cicloId` opcional** restringindo o universo a um único ciclo mesmo
  havendo outro ciclo elegível no mesmo período.
- **Teste HTTP de integração** (`supertest` contra `app`): sem token → 401;
  `colaborador` → 403; `admin`/`gestor_rh` → 200 idêntico; `de`/`ate`
  ausentes → 422; shape serializado sem chaves proibidas mesmo com dado
  seedado.

**Achados**: nenhum crítico. Módulo implementa corretamente o gate
por avaliado+ciclo+tipo (360), o gate por ciclo inteiro com
gate-primeiro-depois-busca (clima) e nunca expõe `totalRespondentes`/
`minimoNecessario`/`avaliadorId` em nenhuma condição testada.

**Infraestrutura de teste estendida** (arquivos de suporte, não specs —
nenhum arquivo de produção alterado):
- `backend/src/test/analiseFixtures.ts`: acrescentados `paginasPesquisaRepo`/
  `competenciasRepo` ao mapa de `construirRepositoriosAnaliseFalsos` (novas
  entidades tocadas por esta tela — `PaginaPesquisa` para a enumeração
  estrutural de perguntas de clima bloqueado, `Competencia` para nomes de
  competência da matriz) e os fixtures `criarPaginaPesquisaFixture`/
  `criarCompetenciaFixture`. Mudança aditiva, sem alterar nenhum fixture
  existente.
- `backend/src/test/fakeQueryBuilder.ts`: `resolverCampoOuJson`/
  `resolverValorSelect` passaram a suportar o padrão
  `(alias.coluna ->> 'chave')::tipo` (extração jsonb com cast entre
  parênteses, ex. `(item.valor ->> 'nota')::int`), usado por
  `agregarLikert360`/`agregarLikertClima` desta tela — padrão que nenhum
  service anterior do módulo `analise` usava. Mudança aditiva (novo `if`
  antes dos padrões já suportados), sem alterar nenhum comportamento
  existente — confirmado por `npm test` completo (280/280, 0 regressão nas
  suítes que já usavam `FakeQueryBuilder`).
- As 4 queries de matriz/caixa_selecao (`agregarMatriz360`/
  `agregarCaixaSelecao360`/`agregarMatrizClima`/`agregarCaixaSelecaoClima`,
  via `AppDataSource.query()` com `CROSS JOIN LATERAL`, fora do alcance do
  `FakeQueryBuilder`) são cobertas por um fake local **só no arquivo de
  spec novo** (`configurarAppDataSourceQueryFake`), que replica em memória
  o mesmo join/filtro/agrupamento das 4 funções de produção a partir dos
  mesmos repositórios fake já seedados pelo teste — nenhum arquivo de
  produção foi alterado para viabilizar isso.

**Resultado final**: `npm test` (backend) — 280/280 testes passando
(251 pré-existentes + 29 novos), 0 regressão.
