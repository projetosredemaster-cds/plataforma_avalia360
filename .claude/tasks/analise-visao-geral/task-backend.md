# Task: Módulo Análise — tela "Visão Geral" — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória: `.claude/tasks/analise-visao-geral/spec.md`
(lida por completo antes deste plano) — este plano traduz em passos de
implementação as decisões já fechadas nas seções 2–6 da spec, sem reabri-las.
As "Perguntas em aberto" da spec (seção 7) são resolvidas abaixo, em "Decisões
de modelagem", seguindo literalmente a recomendação já registrada em cada uma
(nenhuma delas voltou a ser questionada).

Módulo **só leitura agregada** — sem entidade própria, sem migration, sem
DTOs de criação/atualização. `backend-modulo-crud` é adaptada, não seguida à
risca: nenhum `analise.entity.ts`, nenhuma pasta `dto/` com
`criar-*`/`atualizar-*` (este módulo não cria nem atualiza nada — só expõe
`GET /api/analise/visao-geral`).

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`:
  - `calcularProgressoCiclo`/`buscarPesquisaVinculada` (linhas ~143–191) —
    progresso de UM ciclo, ramificando por `pesquisaVinculada.tipo`
    (`avaliacao_360` usa `RelacionamentoAvaliacao`+`EnvioPesquisa`+`Resposta`;
    `clima_geral` usa `CicloParticipante.respondeuEm`). Comentário-guard-rail
    de anonimização já existente na linha ~154 ("SÓ CONTAGEM, nunca seleciona
    avaliador_id/avaliado_id/tipo_relacionamento") é o padrão literal a
    replicar nesta task.
  - `listar()` (linhas ~346–476) — mesma lógica em LOTE (`GROUP BY` + `Map`
    por ciclo, evitando N+1), usada aqui como referência de abordagem para
    agregar sobre um universo de vários ciclos de uma vez (a Visão Geral
    nunca itera ciclo a ciclo em JS).
  - `buscarCicloOuFalhar` (linha ~271, **exportada**) — reaproveitada tal
    qual para o 404 de `cicloId` (mesmo código `CICLO_NAO_ENCONTRADO`), sem
    duplicar a checagem.
  - `validarData` (linha ~241, função privada do módulo, **não exportada**)
    — não pode ser importada; `analise.service.ts` define seu próprio
    helper local equivalente (mesma regex `^\d{4}-\d{2}-\d{2}$` e mesmo
    código de erro `CAMPO_INVALIDO`), pequena duplicação deliberada em vez
    de exportar uma função de outro domínio só para isto.
- `backend/src/common/uuid.ts`: `ehUuidValido(valor: unknown): valor is
  string` já existe — reaproveitada tal qual para validar `cicloId` antes de
  repassá-lo a `buscarCicloOuFalhar` (evita erro cru de driver do Postgres
  "invalid input syntax for type uuid" virando `500`).
- `backend/src/common/autorizacao.ts` (`garantirPapel`), `common/erro-http.ts`
  (`ErroHttp`), `common/http-async.ts` (`asyncHandler`),
  `middlewares/autenticacao.ts` (`autenticar`) — reaproveitados tal qual,
  mesmo padrão de todo outro módulo protegido.
- Entidades relevantes já existentes (nomes de coluna confirmados por
  leitura direta, nenhum inventado):
  - `CicloAvaliacao` (`ciclos_avaliacao`): `id`, `dataInicio`→`data_inicio`
    (`date`, TypeORM mapeia como `string`), `dataFim`→`data_fim` (idem).
  - `Pesquisa` (`pesquisas`): `id`, `tipo` (`TipoPesquisa`), `cicloId`→
    `ciclo_id` (nullable, sem `UNIQUE`), `criadoEm`→`criado_em`.
  - `RelacionamentoAvaliacao` (`relacionamentos_avaliacao`): `id`, `cicloId`→
    `ciclo_id`. **Nunca selecionar** `avaliadorId`/`avaliadoId`/
    `tipoRelacionamento` nesta task (guard rail).
  - `EnvioPesquisa` (`envios_pesquisa`): `id`, `relacionamentoId`→
    `relacionamento_id` (preenchido só para 360), `cicloId`→`ciclo_id`
    (preenchido só para clima, 1 envio de campanha por ciclo),
    `enviadoEm`→`enviado_em`, `concluidoEm`→`concluido_em`.
  - `Resposta` (`respostas`, módulo `respostas/`, só entidade): `id`,
    `envioId`→`envio_id` (`UNIQUE`), `respondidoEm`→`respondido_em`.
  - `CicloParticipante` (`ciclo_participantes`): `id`, `cicloId`→`ciclo_id`,
    `respondeuEm`→`respondeu_em` (nullable).
  - `RespostaClima` (`respostas_clima`, módulo `respostas-clima/`, só
    entidade): `id`, `pesquisaId`→`pesquisa_id`, `cicloId`→`ciclo_id`,
    `respondidoEm`→`respondido_em`. **Estruturalmente anônima** — sem FK de
    identidade — mas isso não impede `COUNT`/`ciclo_id`/`respondido_em`,
    únicos campos que esta task toca.
- `backend/src/app.ts`: cada router é montado com seu próprio `router.use(
  autenticar)` dentro do `*.module.ts` — nunca `autenticar` global.
  `/api/publico` é a ÚNICA exceção (sem `autenticar`), não relevante aqui:
  `/api/analise` é uma rota protegida comum, no mesmo padrão de `/api/ciclos`.

## Decisões de modelagem (resolvendo a seção 7 da spec, sem reabrir nada)

1. **Nome do módulo/endpoint: `analise` (singular), path `GET
   /api/analise/visao-geral`** — resolve pergunta 1, seguindo a recomendação
   da spec literalmente.
2. **`de`/`ate` obrigatórios, sem default no backend** — resolve pergunta 2.
   Ausência de qualquer um dos dois é `422 CAMPO_INVALIDO`. Nenhuma janela
   "últimos 90 dias" é inventada aqui.
3. **Ciclo com mais de uma `pesquisa` vinculada: pesquisa mais recente por
   `criadoEm DESC` decide o tipo do ciclo** — resolve pergunta 3, mesmo
   critério de `buscarPesquisaVinculada`/`listar()`.
4. **Sem seletor manual de ciclo nesta task** (só `?cicloId=` opcional) —
   resolve pergunta 4; não muda nada no backend, só confirma que o contrato
   já aceita `cicloId` opcional sem exigir mais nada.
5. Pergunta 5 (submenu do frontend) e 9 (validação client-side) não afetam
   este plano — fora do escopo backend.
6. **`tempoMedioResposta` retorna horas cruas (número, sem arredondamento
   agressivo — 1 casa decimal)** — resolve pergunta 6; formatação/unidade de
   exibição (dias vs horas) fica por conta do frontend.
7. **`taxaRespostaMedia` é ponderada por volume, não média simples entre
   ciclos**: `soma(concluidos de todos os ciclos do corte) / soma(total de
   todos os ciclos do corte) * 100`, 1 casa decimal — resolve pergunta 7,
   literal.
8. **Ciclos sem nenhuma pesquisa vinculada entram em `totalCiclos` mas
   contribuem 0 para `distribuicaoPorTipo`, `taxaRespostaMedia` e
   `tempoMedioResposta`** — resolve pergunta 8, mesmo comportamento de
   `calcularProgressoCiclo` quando `pesquisaVinculada` é `null`.
9. **Decisão nova deste plano (não estava em aberto na spec): fonte de dado
   de `totalRespostas`/`distribuicaoPorTipo` para `avaliacao_360` é
   COMPARTILHADA com o numerador de `taxaRespostaMedia`.** Como
   `respostas.envio_id` é `UNIQUE` e cada `envio_pesquisa` de 360 aponta a
   exatamente 1 `relacionamento_avaliacao`, "quantidade de `respostas` no
   período" e "quantidade de `relacionamentos_avaliacao` com resposta no
   período" são o MESMO número por construção — uma única query cobre os
   dois usos, evitando duplicar trabalho (ver "3. Queries de agregação",
   query A).
10. **Decisão nova deste plano: para `clima_geral`, `totalRespostas`/
    `distribuicaoPorTipo` usa `respostas_clima` (COUNT por `ciclo_id` +
    `respondido_em` no período), enquanto o numerador de
    `taxaRespostaMedia` usa `ciclo_participantes.respondeu_em`** — fontes
    DIFERENTES, deliberadamente. `respostas_clima` não tem FK de identidade
    (anonimato estrutural, ver `.claude/tasks/coleta-respostas-publica/
    task-backend.md`), então não pode ser cruzada com
    `ciclo_participantes` para produzir um único número; `taxaRespostaMedia`
    precisa de um DENOMINADOR (total de participantes), que só existe em
    `ciclo_participantes`, então seu numerador (`concluidos`) usa a mesma
    tabela por consistência interna da métrica. Sob operação normal os dois
    números coincidem (cada envio de resposta de clima grava 1 linha em
    cada tabela); podem divergir só sob a MESMA corrida de duplo-submit já
    documentada e aceita em `coleta-respostas-publica/task-backend.md`
    (decisão de modelagem nº 10 daquela task) — risco aceito, não corrigido
    aqui, e não é um bug desta task.

## Guard rail de anonimização (o ponto mais importante para o code review)

Mesmo padrão já comentado em `calcularProgressoCiclo`
(`ciclos-avaliacao.service.ts`, linha ~154): **nenhuma query desta task pode
fazer `SELECT`/`.select()`/mapear para o retorno HTTP** as colunas
`relacionamentos_avaliacao.avaliador_id`, `relacionamentos_avaliacao.
avaliado_id`, `relacionamentos_avaliacao.tipo_relacionamento`,
`itens_resposta.valor` ou `itens_resposta_clima.valor`. Toda query desta
task é `COUNT`/`AVG`/`GROUP BY` sobre carimbos de data
(`respondido_em`/`respondeu_em`/`enviado_em`/`concluido_em`) e chaves de
agrupamento não identificadoras (`ciclo_id`, tipo de pesquisa, período).
`RelacionamentoAvaliacao`/`EnvioPesquisa`/`CicloParticipante` só entram em
`JOIN`/`WHERE`/`GROUP BY` para restringir por `ciclo_id`/checar
`IS NOT NULL`/comparar datas — nunca em `.select()`/`.addSelect()` de colunas
de identidade. Isto vale mesmo estando fora do limiar `minimo_respostas_pares`
(a spec já justifica isso na seção 3 — não é revisitado aqui, só aplicado
tecnicamente). Cada função de query abaixo deve levar um comentário igual ao
de `calcularProgressoCiclo` reafirmando isso — item explícito de checklist
para `backend-codereviewer` (ver seção "2. backend-codereviewer" abaixo).

Papel de acesso: `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira
linha de `buscarVisaoGeral` (única função exportada do service) — nenhuma
rota deste módulo acessível por `colaborador`. Rota protegida por
`router.use(autenticar)` em `analise.module.ts`, nunca sob `/api/publico`.

## Plano — Backend

### 1. backend-developer

Antes de codar: reler a skill `backend-anonimizacao-respostas` e a seção
"Guard rail de anonimização" acima. Nenhuma migration é necessária —
confirmar isso no início da implementação (não rodar
`migration:generate`/`migration:run`).

#### 1.1 Estrutura do módulo novo

Criar `backend/src/modules/analise/` com **3 arquivos apenas** (sem
`analise.entity.ts`, sem `dto/`):

- `analise.service.ts` — toda a lógica de validação + agregação.
- `analise.controller.ts` — 1 handler HTTP.
- `analise.module.ts` — 1 rota, atrás de `autenticar`.

Registrar em `backend/src/app.ts`: importar `analiseRouter` de
`./modules/analise/analise.module` e adicionar
`app.use('/api/analise', analiseRouter)` (posicionar depois de
`/api/ciclos` e antes do bloco comentado `/api/publico`, mantendo o padrão
"rotas protegidas primeiro, pública por último, `tratadorErros` sempre
último").

#### 1.2 Contrato do endpoint

`GET /api/analise/visao-geral`

Query params:
- `de` (string `YYYY-MM-DD`, **obrigatório**).
- `ate` (string `YYYY-MM-DD`, **obrigatório**).
- `cicloId` (uuid, opcional).

Validação (em `analise.service.ts`, função `buscarVisaoGeral`, primeira
linha `garantirPapel(ator, ['admin', 'gestor_rh'])`):
1. `de`/`ate` via helper local `validarDataQuery(valor, campo)` — mesmo
   regex/erro `422 CAMPO_INVALIDO` de `validarData` em
   `ciclos-avaliacao.service.ts` (duplicado localmente, não importado — ver
   "Estado atual verificado").
2. `ate < de` (comparação de string, seguro para `YYYY-MM-DD` de tamanho
   fixo, mesmo padrão já usado em `criar()`/`atualizar()` de ciclos) →
   `422 PERIODO_INVALIDO`.
3. `cicloId`, se presente: `ehUuidValido` (de `common/uuid.ts`) → `422
   CAMPO_INVALIDO` se malformado; em seguida `buscarCicloOuFalhar(cicloId)`
   (importado de `../ciclos-avaliacao/ciclos-avaliacao.service`) → `404
   CICLO_NAO_ENCONTRADO` se não existir. Não precisa do objeto `CicloAvaliacao`
   retornado além da checagem de existência (o filtro de universo, passo 1.3,
   refaz o `WHERE id = :cicloId` combinado com o corte de período).

Shape de resposta (200), interfaces exportadas de `analise.service.ts`:

```ts
export interface DistribuicaoTipoMetrica {
  totalCiclos: number
  totalRespostas: number
}

export interface TempoMedioComponente {
  horas: number
  amostras: number
}

export interface VisaoGeralAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  totalCiclos: number
  totalRespostas: number
  distribuicaoPorTipo: {
    avaliacao_360: DistribuicaoTipoMetrica
    clima_geral: DistribuicaoTipoMetrica
  }
  taxaRespostaMedia: number
  tempoMedioResposta: {
    geral: TempoMedioComponente
    avaliacao_360: TempoMedioComponente
    clima_geral: TempoMedioComponente
  }
}
```

Pequena diferença em relação ao exemplo da spec (seção 6): `geral` também
ganha `amostras` (soma de `avaliacao_360.amostras` +
`clima_geral.amostras`), por consistência de shape com os outros dois
componentes — documentar essa diferença aqui, não é uma mudança de
significado.

`analise.controller.ts`:

```ts
import type { Request, Response } from 'express'
import * as analiseService from './analise.service'

export async function buscarVisaoGeralAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseService.buscarVisaoGeral(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}
```

`analise.module.ts`:

```ts
import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { buscarVisaoGeralAnalise } from './analise.controller'

const router = Router()

router.use(autenticar)

router.get('/visao-geral', asyncHandler(buscarVisaoGeralAnalise))

export { router as analiseRouter }
```

#### 1.3 Queries de agregação (4 métricas) — `analise.service.ts`

Estrutura geral de `buscarVisaoGeral`:

```
garantirPapel → validar de/ate/cicloId → buscarUniversoCiclos(periodo, cicloId)
  → se universo vazio: retornar payload zerado (ver 1.3.0)
  → classificarPorTipo(universo) → { idsAval360, idsClima }
  → calcular em paralelo (Promise.all): métrica 1+2 (query A/B),
    métrica 3 (query C/D + total já obtido), métrica 4 (query E/F)
  → montar e retornar VisaoGeralAnalise
```

**1.3.0 — Universo de ciclos (nível a do corte de período, spec 2.3a)**

```ts
async function buscarUniversoCiclos(periodo: { de: string; ate: string }, cicloId?: string) {
  const qb = AppDataSource.getRepository(CicloAvaliacao)
    .createQueryBuilder('c')
    .where('c.data_inicio <= :ate::date', { ate: periodo.ate })
    .andWhere('c.data_fim >= :de::date', { de: periodo.de })

  if (cicloId) qb.andWhere('c.id = :cicloId', { cicloId })

  return qb.select(['c.id']).getMany() // só id — nenhum outro campo de ciclo é necessário aqui
}
```

Se `ciclos.length === 0`: retornar imediatamente
`{ periodo, cicloId: cicloId ?? null, totalCiclos: 0, totalRespostas: 0,
distribuicaoPorTipo: { avaliacao_360: {totalCiclos:0,totalRespostas:0},
clima_geral: {totalCiclos:0,totalRespostas:0} }, taxaRespostaMedia: 0,
tempoMedioResposta: { geral:{horas:0,amostras:0}, avaliacao_360:{horas:0,
amostras:0}, clima_geral:{horas:0,amostras:0} } }` — nunca lançar erro por
"nenhum ciclo no período" (comportamento esperado, não uma falha).

**Classificação por tipo** (mesmo critério de `listar()`, linhas ~393–406):
buscar `Pesquisa` com `cicloId: In(idsUniverso)`, `order: { criadoEm: 'DESC'
}`, popular `Map<cicloId, tipo>` mantendo só a primeira ocorrência (mais
recente) por ciclo. Split em `idsAval360`/`idsClima` (ids sem pesquisa
vinculada ficam de fora dos dois — decisão 8).

**Query A — `respostas`/`distribuicaoPorTipo.avaliacao_360` (e reaproveitada
como numerador de `taxaRespostaMedia` — decisão 9):**

```ts
// SÓ CONTAGEM — nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento
// (guard rail de anonimização, ver skill backend-anonimizacao-respostas).
async function contarRespostas360NoPeriodo(ids: string[], periodo: { de: string; ate: string }) {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}
```

Usado para `distribuicaoPorTipo.avaliacao_360.totalRespostas` E para o
numerador `concluidos360` da métrica 3 (mesmo valor, ver decisão 9 —
chamar a função uma vez, reutilizar o resultado).

**Query B — `respostas_clima`/`distribuicaoPorTipo.clima_geral`:**

```ts
async function contarRespostasClimaNoPeriodo(ids: string[], periodo: { de: string; ate: string }) {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RespostaClima)
    .createQueryBuilder('rc')
    .where('rc.ciclo_id IN (:...ids)', { ids })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}
```

**`totalCiclos`/`totalRespostas` (topo do payload)**: `totalCiclos =
idsUniverso.length` (TODOS os ciclos do corte, inclusive sem pesquisa
vinculada); `totalRespostas = respostas360 + respostasClima` (só os
classificados).

**Query C — denominador de `taxaRespostaMedia` (universo completo, sem
filtro de data — mesma semântica de "total" de `calcularProgressoCiclo`):**

```ts
async function contarTotal360(ids: string[]) {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(RelacionamentoAvaliacao).count({ where: { cicloId: In(ids) } })
}

async function contarTotalParticipantesClima(ids: string[]) {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId: In(ids) } })
}
```

**Query D — numerador `concluidosClima` (nível b do corte, spec 2.3b,
`ciclo_participantes.respondeu_em`):**

```ts
async function contarConcluidosClimaNoPeriodo(ids: string[], periodo: { de: string; ate: string }) {
  if (ids.length === 0) return 0
  return AppDataSource.getRepository(CicloParticipante)
    .createQueryBuilder('cp')
    .where('cp.ciclo_id IN (:...ids)', { ids })
    .andWhere('cp.respondeu_em IS NOT NULL')
    .andWhere('cp.respondeu_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getCount()
}
```

Montagem de `taxaRespostaMedia`:

```ts
const totalGeral = total360 + totalClimaParticipantes
const concluidosGeral = concluidos360 /* = respostas360, decisão 9 */ + concluidosClima
const taxaRespostaMedia = totalGeral === 0 ? 0 : arredondar1((concluidosGeral / totalGeral) * 100)
```

**Query E — tempo médio 360 (spec 2.4, `envios_pesquisa.enviado_em` →
`concluido_em`, por relacionamento com envio concluído, filtrado pelo
carimbo de conclusão dentro do período):**

```ts
async function calcularTempoMedio360(ids: string[], periodo: { de: string; ate: string }) {
  if (ids.length === 0) return { horas: 0, amostras: 0 }
  const linha = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('envio')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('AVG(EXTRACT(EPOCH FROM (envio.concluido_em - envio.enviado_em)) / 3600)', 'horas')
    .addSelect('COUNT(*)', 'amostras')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('envio.enviado_em IS NOT NULL')
    .andWhere('envio.concluido_em IS NOT NULL')
    .andWhere('envio.concluido_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getRawOne<{ horas: string | null; amostras: string }>()

  return { horas: linha?.horas ? Number(linha.horas) : 0, amostras: Number(linha?.amostras ?? 0) }
}
```

**Query F — tempo médio clima (spec 2.4, `enviado_em` da CAMPANHA — 1 linha
`envios_pesquisa` por ciclo com `ciclo_id` preenchido — até
`ciclo_participantes.respondeu_em`, por participante já respondido):**

```ts
async function calcularTempoMedioClima(ids: string[], periodo: { de: string; ate: string }) {
  if (ids.length === 0) return { horas: 0, amostras: 0 }
  const linha = await AppDataSource.getRepository(CicloParticipante)
    .createQueryBuilder('cp')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.ciclo_id = cp.ciclo_id')
    .select('AVG(EXTRACT(EPOCH FROM (cp.respondeu_em - envio.enviado_em)) / 3600)', 'horas')
    .addSelect('COUNT(*)', 'amostras')
    .where('cp.ciclo_id IN (:...ids)', { ids })
    .andWhere('cp.respondeu_em IS NOT NULL')
    .andWhere('envio.enviado_em IS NOT NULL')
    .andWhere('cp.respondeu_em::date BETWEEN :de::date AND :ate::date', {
      de: periodo.de,
      ate: periodo.ate,
    })
    .getRawOne<{ horas: string | null; amostras: string }>()

  return { horas: linha?.horas ? Number(linha.horas) : 0, amostras: Number(linha?.amostras ?? 0) }
}
```

Montagem de `tempoMedioResposta.geral` — média ponderada pelas amostras de
cada componente (soma das durações reais, não média das médias):

```ts
const amostrasGeral = tempo360.amostras + tempoClima.amostras
const horasGeral =
  amostrasGeral === 0
    ? 0
    : (tempo360.horas * tempo360.amostras + tempoClima.horas * tempoClima.amostras) / amostrasGeral
```

Arredondar todos os `horas` finais (`geral`/`avaliacao_360`/`clima_geral`)
para 1 casa decimal (`arredondar1`) só na montagem da resposta — os cálculos
intermediários usam o valor cru.

**Paralelização**: as queries A–F que dependem só de `idsAval360`/
`idsClima`/`periodo` (nenhuma depende do resultado de outra) devem ser
disparadas com `Promise.all`, mesmo espírito de `montarCicloResposta`
paralelizando com `Promise.all` quando não há dependência — não é
obrigatório serializar.

#### 1.4 Guard rail de anonimização — onde aplicar

- Toda função de 1.3 acima leva o MESMO comentário de guard rail já usado em
  `calcularProgressoCiclo` (linha ~154 de `ciclos-avaliacao.service.ts`),
  adaptado: "SÓ CONTAGEM/AVG sobre carimbos de data, nunca seleciona
  avaliador_id/avaliado_id/tipo_relacionamento/valor".
- Nenhuma função de `analise.service.ts` deve ter `.select()`/`.addSelect()`
  apontando para `avaliador_id`/`avaliado_id`/`tipo_relacionamento` (tabela
  `relacionamentos_avaliacao`) nem para `valor` (tabelas `itens_resposta`/
  `itens_resposta_clima` — que, aliás, nem chegam a ser importadas neste
  módulo: confirmar que `ItemResposta`/`ItemRespostaClima` não aparecem em
  nenhum import de `analise.service.ts`, sinal simples de conformidade).
  `RelacionamentoAvaliacao` só aparece em `JOIN`/`WHERE ciclo_id IN (...)`/
  `COUNT` — nunca em `.select()`.
- `garantirPapel(ator, ['admin', 'gestor_rh'])` é a primeira linha (única)
  de `buscarVisaoGeral` — todas as funções internas (`contarRespostas360...`,
  `calcularTempoMedio...` etc.) são privadas (não exportadas), chamadas só
  a partir de `buscarVisaoGeral` já autorizado.

#### 1.5 Tratamento de erros

| Situação | Status | Código |
|---|---|---|
| `de` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| `ate` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| `ate < de` | 422 | `PERIODO_INVALIDO` |
| `cicloId` presente mas não é um uuid válido (`ehUuidValido` falso) | 422 | `CAMPO_INVALIDO` |
| `cicloId` presente, formato válido, mas ciclo não existe | 404 | `CICLO_NAO_ENCONTRADO` (via `buscarCicloOuFalhar` reaproveitado) |
| Papel do ator não é `admin`/`gestor_rh` | 403 | `PAPEL_NAO_AUTORIZADO` (via `garantirPapel`, já centralizado) |

Nenhum erro novo precisa de entrada em `MAPA_CONSTRAINT_PARA_CODIGO`
(`middlewares/tratadorErros.ts`) — este módulo nunca escreve no banco, não
há `UNIQUE`/`INSERT` para violar.

#### 1.6 Wiring final

- `backend/src/app.ts`: import de `analiseRouter` +
  `app.use('/api/analise', analiseRouter)`.
- Nenhuma migration, nenhuma variável de ambiente nova, nenhuma entrada nova
  em `common/enums.ts`.
- `npm run build` (tsc) e `npm test` (Vitest) devem rodar sem novos erros
  introduzidos por esta task antes de considerar o passo concluído.

## Status

### 1. backend-developer — CONCLUÍDO

Implementado exatamente conforme o plano acima (1.1–1.6), sem desvios:

- Módulo novo `backend/src/modules/analise/` com só 3 arquivos
  (`analise.service.ts`, `analise.controller.ts`, `analise.module.ts`) — sem
  `analise.entity.ts`, sem `dto/`.
- `analise.service.ts`: `buscarVisaoGeral` (única função exportada) com
  `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha,
  `validarDataQuery` local (duplicação deliberada de `validarData`, não
  exportada de `ciclos-avaliacao.service.ts`), checagem `ate < de` →
  `422 PERIODO_INVALIDO`, `ehUuidValido` + `buscarCicloOuFalhar` reaproveitado
  para `cicloId` opcional. As 6 funções privadas de agregação (`buscarUniversoCiclos`,
  `classificarPorTipo`, `contarRespostas360NoPeriodo`,
  `contarRespostasClimaNoPeriodo`, `contarTotal360`,
  `contarTotalParticipantesClima`, `contarConcluidosClimaNoPeriodo`,
  `calcularTempoMedio360`, `calcularTempoMedioClima`) seguem literalmente o
  pseudocódigo da seção 1.3, cada uma com o comentário de guard rail de
  anonimização ("SÓ CONTAGEM/AVG ... nunca seleciona avaliador_id/avaliado_id/
  tipo_relacionamento"). `RelacionamentoAvaliacao` só aparece em
  `JOIN`/`WHERE`/`COUNT`, nunca em `.select()`/`.addSelect()`;
  `ItemResposta`/`ItemRespostaClima` não são importados no módulo. Decisão 9
  (reaproveitar `contarRespostas360NoPeriodo` como `concluidos360`, sem
  segunda query) e decisão 7 (`taxaRespostaMedia` ponderada por volume,
  `soma(concluidos)/soma(total)`) implementadas tal qual descrito. Queries A–F
  disparadas em paralelo via `Promise.all`. Payload zerado (sem lançar erro)
  quando o universo de ciclos do corte é vazio.
- `analise.controller.ts`/`analise.module.ts`: idênticos ao pseudocódigo da
  seção 1.2, rota `GET /api/analise/visao-geral` atrás de `router.use(autenticar)`.
- `backend/src/app.ts`: `analiseRouter` importado e montado com
  `app.use('/api/analise', analiseRouter)`, posicionado depois de `/api/ciclos`
  e antes do bloco `/api/publico`, conforme pedido.
- Nenhuma migration criada/rodada (confirmado antes de começar — módulo é só
  leitura sobre tabelas já existentes). Nenhuma variável de ambiente nova,
  nenhuma entrada nova em `common/enums.ts`.
- `npm run build` (tsc): sem novos erros introduzidos — o único erro reportado
  (`src/test/fakeRepository.ts(30,12)`, TS2352) é pré-existente na branch
  `main` antes desta task (confirmado via `git stash`), não relacionado a
  `analise/`.
- `npm test` (Vitest): 141/141 testes passando, mesmo total de antes da task
  (nenhum teste novo foi escrito aqui — cobertura do módulo `analise` é
  responsabilidade do `test-engineer`, etapa posterior do pipeline).

Migrations a rodar: nenhuma.

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **Guard rail de anonimização — o achado crítico mais provável**: grep em
   `analise.service.ts` por `avaliador_id`, `avaliado_id`,
   `tipo_relacionamento`, `.valor` — nenhum deve aparecer em `.select()`/
   `.addSelect()`/no shape de retorno. Confirmar que `RelacionamentoAvaliacao`
   só é usado em `JOIN`/`WHERE`/`COUNT`, nunca projetado. Confirmar que
   `ItemResposta`/`ItemRespostaClima` não são importados neste módulo.
2. **`garantirPapel` é a primeira linha de `buscarVisaoGeral`** (única
   função exportada) — não deve haver caminho de código que rode uma query
   antes dessa checagem.
3. **`de`/`ate` não têm default** — confirmar que a ausência de qualquer um
   dos dois lança `422 CAMPO_INVALIDO` antes de qualquer query ao banco.
4. **Corte de período em dois níveis (spec 2.3) aplicado corretamente**:
   nível ciclo (`data_inicio <= ate AND data_fim >= de`, sobreposição, não
   contenção total) na função de universo; nível resposta (carimbo de data
   dentro de `[de, ate]`) em CADA query de contagem/`AVG` que soma
   respostas/participações (queries A, B, D, E, F) — nenhuma delas deve
   contar algo fora do período só porque o ciclo passou no corte (a).
5. **Decisão 9 (reaproveitar a mesma contagem para
   `distribuicaoPorTipo.avaliacao_360.totalRespostas` e o numerador de
   `taxaRespostaMedia`)**: confirmar que não existe uma SEGUNDA query
   redundante calculando a mesma coisa de forma ligeiramente diferente (ex.:
   uma via `Resposta`, outra via `RelacionamentoAvaliacao`, com potencial de
   divergir por erro de implementação).
6. **`taxaRespostaMedia` é ponderada, não média simples entre ciclos**
   (decisão 7) — conferir a fórmula `soma(concluidos)/soma(total)`, não
   `média(percentual por ciclo)`.
7. **`cicloId` inválido nunca deve chegar como erro cru de driver
   (`invalid input syntax for type uuid`)** — confirmar que `ehUuidValido` é
   checado ANTES de qualquer query usando `cicloId` como parâmetro.
8. **Ciclos sem pesquisa vinculada** contam em `totalCiclos` mas em nenhuma
   outra métrica (decisão 8) — conferir que `idsAval360`/`idsClima` excluem
   corretamente ids sem tipo classificado, sem "vazar" para nenhum dos dois
   grupos por engano (ex.: um `?? 'avaliacao_360'` acidental como default).
9. **Nenhuma tentativa de importar/usar as views `respostas_identificadas`/
   `respostas_pares_agregadas`** — elas não existem fisicamente em nenhuma
   migration (confirmado na spec, seção 4); qualquer referência a elas no
   código é um erro de implementação, não uma otimização válida.
10. Confirmar `npm run build`/`npm test` sem novas falhas antes de aprovar.

## Revisão

Revisão feita lendo por completo `analise.service.ts`, `analise.controller.ts`,
`analise.module.ts` e a alteração em `app.ts`, e comparando cada trecho contra
o plano (seções 1.1–1.6) e contra as entidades reais tocadas
(`CicloAvaliacao`, `RelacionamentoAvaliacao`, `EnvioPesquisa`, `Resposta`,
`RespostaClima`, `CicloParticipante`, `Pesquisa`) e os helpers reaproveitados
(`garantirPapel`, `ErroHttp`, `ehUuidValido`, `buscarCicloOuFalhar`).

### Crítico

Sem achados críticos.

- Guard rail de anonimização (ponto 1 do checklist): grep por
  `avaliador_id`/`avaliado_id`/`tipo_relacionamento` em `analise.service.ts`
  só retorna ocorrências dentro de comentários (linhas ~152, ~202, ~246) —
  nenhuma em `.select()`/`.addSelect()`/`.where()` com projeção de coluna.
  Grep por `.valor`/`ItemResposta`/`itens_resposta` não retorna nada — os
  módulos `respostas`/`respostas-clima` só entram via `envio_id`/`ciclo_id`/
  `respondido_em`. `RelacionamentoAvaliacao` é usado só em
  `.innerJoin(...)`/`.where('rel.ciclo_id IN (...)')`/`.count({ where: {
  cicloId } })` nas 4 funções que o tocam (`contarRespostas360NoPeriodo`,
  `contarTotal360`, `calcularTempoMedio360`), nunca projetado no `SELECT`.
  Este endpoint também não quebra nenhuma métrica por avaliado (é
  totalizador de corte de ciclos, não relatório por pessoa), então o limiar
  `minimo_respostas_pares` legitimamente não se aplica aqui — o comentário em
  `buscarVisaoGeral` já deixa isso explícito.
- Controle de acesso (ponto 2): `garantirPapel(ator, [...PAPEIS_COM_ACESSO])`
  é literalmente a primeira linha executada de `buscarVisaoGeral` — antes de
  qualquer `await`/query, inclusive antes da validação de `de`/`ate`/
  `cicloId`. `analise.module.ts` usa `router.use(autenticar)`, mesmo padrão
  de todo outro módulo protegido; não está sob `/api/publico`.
- Consistência de schema (ponto 3): todas as colunas referenciadas
  (`data_inicio`, `data_fim`, `ciclo_id`, `relacionamento_id`, `envio_id`,
  `respondido_em`, `respondeu_em`, `enviado_em`, `concluido_em`) batem
  exatamente com os `@Column({ name: ... })` das entidades já existentes,
  conferidas por leitura direta. Nenhum campo novo, nenhuma migration,
  nenhum indício de `organization_id`/multi-tenant.

### Deveria corrigir

Nenhum item bloqueante encontrado. Os 10 pontos de atenção específicos da
task foram conferidos individualmente:

- Pontos 3, 4, 5, 6, 7, 8, 9: implementação bate literalmente com o plano —
  `de`/`ate` validados antes de qualquer query; corte em dois níveis (janela
  de ciclo por sobreposição na função de universo, carimbo de data dentro do
  período em cada query de contagem/`AVG`); decisão 9 reaproveita
  `respostas360` como `concluidos360` sem segunda query; `taxaRespostaMedia`
  usa `soma(concluidos)/soma(total)`, não média simples; `ehUuidValido` é
  checado antes de `buscarCicloOuFalhar`/de qualquer uso de `cicloId` em
  query; `idsAval360`/`idsClima` são filtros mutuamente exclusivos por
  `tipoPorCiclo.get(id) === '...'`, sem `??` de fallback que vazaria ciclo
  sem pesquisa vinculada para um dos dois grupos. Ponto 9 (views
  `respostas_identificadas`/`respostas_pares_agregadas`): não aparecem em
  nenhum import.
- Ponto 10 (build/test): este agente de revisão não tem acesso a shell
  (só Read/Grep/Glob/Edit) — não foi possível rodar `npm run build`/`npm
  test` de forma independente. A seção "1. backend-developer" registra
  141/141 testes passando e nenhum erro novo de `tsc`; recomenda-se que o
  `test-engineer` (próxima etapa) sirva como confirmação de fato ao escrever
  os testes automatizados do módulo, já que nenhum teste cobrindo `analise/`
  existe ainda.

### Sugestão

- O comentário da função `contarTotalParticipantesClima` ("Query C (clima)")
  não repete a frase padrão de guard rail ("SÓ CONTAGEM ... nunca seleciona
  avaliador_id/avaliado_id/tipo_relacionamento") presente nas demais funções
  de agregação, enquanto `contarTotal360` (a outra metade da mesma "Query C"
  no plano) repete. Não é um problema de anonimização de fato — `.count({
  where: { cicloId } })` sobre `CicloParticipante` não projeta
  `colaborador_id` nem nenhuma outra coluna —, só uma pequena inconsistência
  de documentação em relação ao padrão pedido explicitamente no plano ("cada
  função de query... deve levar um comentário igual").
- `ehUuidValido`/`validarDataQuery` não fazem `trim()`/normalização de
  espaços além do já feito em `validarDataQuery` para `de`/`ate` (que já
  usa `.trim()`); `cicloId` é comparado cru contra a regex de UUID. Caso o
  frontend algum dia envie um `cicloId` com espaço acidental, o retorno será
  `422 CAMPO_INVALIDO` em vez de tratar como válido — comportamento seguro
  (falha fechada), não um bug, só um detalhe de robustez que não precisa de
  ação agora.

Nenhum achado crítico — task liberada para a etapa de testes
(`test-engineer`).

### 1. backend-developer — Ajustes de sugestão (2026-09-10)

Aplicadas as duas sugestões (não críticas) da seção "## Revisão" acima, em
`backend/src/modules/analise/analise.service.ts`:

1. `contarTotalParticipantesClima` ganhou o mesmo comentário-padrão de guard
   rail de anonimização das demais funções de agregação ("SÓ CONTAGEM —
   nunca seleciona avaliador_id/avaliado_id/tipo_relacionamento") — só
   documentação, nenhuma mudança de comportamento.
2. Validação de `cicloId` em `buscarVisaoGeral` agora aplica `.trim()` no
   valor recebido do query param antes de checar `ehUuidValido`/repassar a
   `buscarCicloOuFalhar` (mesmo padrão já usado em `validarDataQuery` para
   `de`/`ate`), evitando um `422 CAMPO_INVALIDO` desnecessário quando o uuid
   vier com espaço/quebra de linha acidental ao redor.

`npm run build` (tsc): mesmo erro pré-existente já documentado
(`src/test/fakeRepository.ts(30,12)`, TS2352), não relacionado a esta
mudança — nenhum novo erro introduzido. `npm test` (Vitest): 141/141 testes
passando, mesmo total de antes.

Migrations a rodar: nenhuma (nenhuma mudança de schema).

### 1. backend-developer — Correção do achado não crítico de rollover de data (2026-09-10)

Corrigido o achado registrado na seção "## Testes" abaixo (`validarDataQuery`
em `analise.service.ts` e `validarData` em `ciclos-avaliacao.service.ts`
aceitavam datas de calendário inexistentes, ex.: `"2026-02-30"`, por causa do
rollover silencioso do construtor `Date` do JavaScript). Correção idêntica
nos dois lugares (duplicação deliberada mantida — não exportada de um
domínio para o outro): depois de casar a string com
`^\d{4}-\d{2}-\d{2}$`, os componentes ano/mês/dia são extraídos como número
(`texto.slice(0,4)/(5,7)/(8,10)`) e a data é reconstruída com
`new Date(Date.UTC(ano, mes - 1, dia))`; se `getUTCFullYear()`/
`getUTCMonth()`/`getUTCDate()` do resultado não baterem exatamente com
ano/mês/dia informados, é tratado como o mesmo erro já existente
(`422 CAMPO_INVALIDO`, mesma mensagem "não é uma data de calendário
válida."). Nenhuma outra validação, assinatura ou mensagem das duas funções
foi alterada.

Testes novos (um em cada módulo, cobrindo `"2026-02-30"` → `422
CAMPO_INVALIDO`):
- `backend/src/modules/analise/analise.service.spec.ts` — novo `it` dentro
  do `describe('validação de "de"/"ate"')` já existente.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.spec.ts`
  (arquivo novo — o módulo `ciclos-avaliacao` não tinha suíte de teste
  própria ainda; criado minimalmente, só com este caso, já que `criar()`
  lança o erro de validação antes de qualquer acesso a repositório, sem
  precisar de fakes de repositório).

`npm run build` (tsc): mesmo erro pré-existente já documentado
(`src/test/fakeRepository.ts(46,12)`, TS2352, linha deslocada por edições
anteriores), não relacionado a esta mudança — nenhum novo erro introduzido.
`npm test` (Vitest): 167/167 testes passando (165 pré-existentes + 2 novos),
nenhuma regressão.

Migrations a rodar: nenhuma (nenhuma mudança de schema).

## Testes

`test-engineer`. Como nenhum módulo existente ainda testava um service
baseado em `createQueryBuilder` (`equipes`/`colaboradores`, os únicos com
spec hoje, só usam `find`/`count`/`findOneBy` simples), foi necessário
estender a infraestrutura de teste compartilhada antes de escrever os testes
do módulo `analise`:

- `backend/src/test/fakeQueryBuilder.ts` (novo): `FakeQueryBuilder` em
  memória, interpretando só o subconjunto de sintaxe efetivamente usado por
  `analise.service.ts` (`select`/`addSelect` de coluna simples ou de
  `COUNT(*)`/`AVG(EXTRACT(EPOCH FROM (a - b)) / 3600)`; `where`/`andWhere`
  com `<=`/`>=`/`=`/`IN (:...x)`/`BETWEEN ... AND ...`/`IS [NOT] NULL`, com
  ou sem cast `::date`; `innerJoin` por igualdade simples de coluna). Não é
  um interpretador SQL genérico — qualquer expressão fora desse subconjunto
  lança erro explícito em vez de devolver um resultado incorreto
  silenciosamente. `getRawOne` sobre agregação sem `GROUP BY` replica a
  semântica real do Postgres (0 linhas → `AVG` `null`, `COUNT(*)` `'0'`, como
  string, igual ao driver `pg`).
- `backend/src/test/fakeRepository.ts` (editado, aditivo): `combina()` passou
  a reconhecer o operador `In()` do TypeORM (`FindOperator` com
  `type === 'in'`), `find()` passou a aceitar `where` (antes era ignorado —
  usado por `classificarPorTipo`), e foi adicionado `createQueryBuilder(alias)`
  delegando para `FakeQueryBuilder`, resolvendo `innerJoin` contra outros
  repositórios fake via um `resolverEntidade` setado externamente. Nenhuma
  mudança de comportamento para os specs existentes (`equipes`/`colaboradores`
  não usam `In()` nem `find({ where })`).
- `backend/src/test/analiseFixtures.ts` (novo): `construirRepositoriosAnaliseFalsos()`
  (mesmo padrão de `construirRepositoriosFalsos()` de `test/fixtures.ts`, mas
  para o grafo de 8 entidades tocado por `analise`/`autenticar`:
  `CicloAvaliacao`, `Pesquisa`, `RelacionamentoAvaliacao`, `EnvioPesquisa`,
  `Resposta`, `RespostaClima`, `CicloParticipante`, `Colaborador`) + fixtures
  (`criarCicloAvaliacaoFixture`, `criarPesquisaFixture`,
  `criarRelacionamentoFixture`, `criarEnvioPesquisaFixture`,
  `criarRespostaFixture`, `criarRespostaClimaFixture`,
  `criarCicloParticipanteFixture`).

Suíte nova: `backend/src/modules/analise/analise.service.spec.ts` (24 testes).
Cobertura:

- **Controle de acesso (prioridade máxima)**: `colaborador` bloqueado com
  `403 PAPEL_NAO_AUTORIZADO` antes de qualquer query (nenhuma linha lida dos
  repositórios fake); `admin`/`gestor_rh` com acesso — no service diretamente
  E via HTTP real (`supertest` contra `app`, mesmo padrão de
  `rotas-acesso.spec.ts`): 401 sem token, 403 para papel `colaborador`, 200
  para `admin`/`gestor_rh`.
- **Validação de `de`/`ate`**: ausentes, não-string, fora do formato
  `YYYY-MM-DD` → `422 CAMPO_INVALIDO`; `ate < de` → `422 PERIODO_INVALIDO`;
  `ate === de` (janela de 1 dia) aceito.
- **`cicloId`**: malformado (não-uuid) → `422 CAMPO_INVALIDO`; uuid válido
  mas inexistente → `404 CICLO_NAO_ENCONTRADO`; informado e existente
  restringe corretamente o universo a 1 ciclo mesmo havendo outros no
  período.
- **Zero ciclos no período**: retorna `200` com payload inteiramente zerado
  (`toEqual` estrutural completo), não lança erro; caso do ciclo cuja
  vigência não sobrepõe o período (corte de nível a) confirmado
  separadamente.
- **Ciclo sem pesquisa vinculada** (decisão de modelagem 8): conta em
  `totalCiclos`, contribui 0 para todas as outras métricas.
- **Corte de período em dois níveis (o teste mais importante de regra de
  negócio desta feature)**: ciclo cuja vigência sobrepõe o período de
  consulta, com duas respostas — uma com carimbo de data FORA do período,
  outra DENTRO — confirma que só a resposta dentro do período é contada,
  mesmo o ciclo tendo passado no corte de nível (a).
- **`taxaRespostaMedia` ponderada**: cenário com um ciclo pequeno (2/2 =
  100%) e um grande (4/8 = 50%) confirma o resultado ponderado (60%,
  `(2+4)/(2+8)*100`) e explicitamente rejeita o valor que uma média simples
  entre percentuais produziria (75%).
- **Cenário completo (shape do contrato + guard rail de anonimização)**: 1
  ciclo de avaliação 360 (2 respostas contabilizadas + 1 relacionamento
  pendente) e 1 ciclo de clima (3 de 4 participantes respondidos), com
  valores de tempo médio calculados à mão (`78h`/`336h`/`232.8h` ponderado) —
  `toEqual` estrutural do payload inteiro contra o contrato de
  `VisaoGeralAnalise`. Guard rail verificado explicitamente no SHAPE da
  resposta (não só confiando na implementação): varredura recursiva de todas
  as chaves do objeto retornado confirmando ausência de
  `avaliadorId`/`avaliadoId`/`tipoRelacionamento`
  (camelCase e snake_case) em qualquer nível, mais checagem do JSON
  serializado inteiro não conter as substrings `"avaliador"`/`"avaliado"`/
  `"pares"`/`"subordinado"` em lugar nenhum (nem chave, nem valor).

**Resultado**: `npm test` — 165/165 testes passando (141 pré-existentes + 24
novos), nenhuma regressão nos specs existentes. `npm run build` — nenhum erro
novo (só o TS2352 pré-existente e já documentado de `fakeRepository.ts`,
deslocado de linha pela edição aditiva, mesma causa raiz).

**Achado não crítico (reportado, não corrigido — fora do escopo de
`test-engineer`)**: `validarDataQuery` (`analise.service.ts`, mesma forma já
usada em `validarData` de `ciclos-avaliacao.service.ts`, duplicação
deliberada) valida o FORMATO `YYYY-MM-DD` via regex e depois checa
"calendário válido" via `Number.isNaN(new Date(\`${texto}T00:00:00Z\`).getTime())`
— mas essa checagem não captura dias de calendário inexistentes (ex.:
`"2026-02-30"`): o construtor `Date` do JavaScript normaliza silenciosamente
(rola para `2026-03-02`) em vez de produzir `NaN`, então a checagem nunca
lança para esse caso e a string original (`"2026-02-30"`) segue adiante como
se fosse uma data válida. Isso não é uma falha de anonimização/controle de
acesso (a data segue sendo tratada como string opaca nas comparações
subsequentes, nunca reconstruída a partir do `Date` normalizado), mas é uma
inconsistência real entre a validação da aplicação (permissiva demais) e o
cast `::date` do Postgres real (estrito — rejeitaria `"2026-02-30"` com
erro de sintaxe, o que viraria `500` em vez do `422 CAMPO_INVALIDO` que a
API pretende garantir). Mesmo padrão pré-existe em `ciclos-avaliacao.service.ts`
(`validarData`) — não é uma regressão desta task, mas vale corrigir (ex.:
comparar os componentes ano/mês/dia extraídos de volta contra o `Date`
normalizado, ou usar uma biblioteca de parsing estrito) num ajuste pontual
futuro, nas duas ocorrências.

**Frontend**: sem suíte de testes de componente/página no projeto hoje
(nenhum framework configurado — sem `vitest`/`jest`/`@testing-library/*` em
`frontend/package.json`, sem script `test`, nenhum arquivo `*.test.tsx`
existente em nenhuma tela, incluindo as mais antigas como `CiclosListPage`/
`PesquisasListPage`). Confirmado antes de decidir: sem precedente estabelecido,
não foi introduzido um framework de teste novo só para esta feature (fora do
escopo pedido) — cobertura desta task ficou 100% no backend. Ver nota
equivalente em `task-frontend.md`.
