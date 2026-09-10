# Task: Módulo Análise — tela "Avaliações" — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória: `.claude/tasks/analise-avaliacoes/spec.md`
(lida por completo antes deste plano) — este plano traduz em passos de
implementação as decisões já fechadas nas seções 2–6 da spec, **sem
reabri-las**. As "Perguntas em aberto" da spec (seção 7) relevantes ao
backend são resolvidas abaixo, em "Decisões de modelagem".

Módulo **só leitura** — sem entidade própria, sem migration, sem DTOs de
criação/atualização. Estende `backend/src/modules/analise/`, já existente
(implementado para "Visão Geral", `.claude/tasks/analise-visao-geral/`) — não
cria módulo novo.

---

## GUARD RAIL CRÍTICO Nº 1 — `anonimizar_respostas_pares` NUNCA é lida por esta feature (seção 2 da spec, decisão de produto já fechada)

Esta seção existe sozinha, fora de qualquer lista diluída, porque é a decisão
mais sensível de toda a task.

- **Nenhuma query desta feature seleciona, filtra por, ou faz `CASE`/branch
  condicional sobre `ciclos_avaliacao.anonimizar_respostas_pares`
  (entity `CicloAvaliacao.anonimizarRespostasPares`).** A única coluna de
  `ciclos_avaliacao` lida por esta feature é `minimo_respostas_pares`
  (`CicloAvaliacao.minimoRespostasPares`, ver `buscarMinimosPorCiclo` na
  seção 4 abaixo) — as duas colunas são vizinhas na mesma entity, então é
  fácil confundir uma com a outra por engano de autocomplete; **usar sempre
  `.find({ where: { id: In(ids) }, select: ['id', 'minimoRespostasPares'] })`
  com `select` explícito** (nunca `.find({ where: { id: In(ids) } })` sem
  `select`, que traria `anonimizarRespostasPares` junto por padrão do
  TypeORM, mesmo que não seja usado depois — o objetivo é nem sequer trazer a
  coluna do banco).
- **Não existe, em nenhum ponto do DTO de entrada
  (`BuscarAvaliacoesDto: { de, ate, cicloId? }`), nenhum parâmetro que
  reverta, ignore ou "veja mesmo assim" o bloqueio por limiar** — nenhum
  `ignorarLimiar`, `forcarExibir`, `modoTransparencia`, `verComoAdmin` ou
  equivalente. O DTO desta feature tem exatamente os 3 campos citados, ponto.
- **RH/admin não têm nenhum branch de papel dentro de
  `buscarAvaliacoes`/das funções privadas além do `garantirPapel` inicial**
  (que só decide "pode entrar na tela", não "quanto vê dentro dela"). Não
  deve existir nenhum `if (ator.papel === 'admin') { ... }` em nenhuma função
  deste service que mude o resultado do gate de `pares`/`subordinado` ou de
  `clima_geral`. O mesmo `buscarAvaliacoes` é chamado exatamente da mesma
  forma para `admin` e para `gestor_rh` — a única diferença entre os dois
  papéis nesta feature é que ambos passam no `garantirPapel`, nada mais.
- É permitido (e recomendado, seguindo o próprio estilo da spec, seção 2.1)
  um **comentário** no código explicando que `anonimizarRespostasPares` foi
  deliberadamente não lida — o que é proibido é o `SELECT`/uso em
  condicional, não a menção em texto/comentário.
- **Instrução explícita para a checklist do `backend-codereviewer` (ver
  seção "2. backend-codereviewer" abaixo, item 1): qualquer tentativa de
  bypass do limiar `minimo_respostas_pares` — para QUALQUER papel, inclusive
  `admin`/`gestor_rh`, inclusive "só para depuração", inclusive atrás de uma
  env var — é achado CRÍTICO obrigatório, sem exceção, e devolve a task para
  a etapa de desenvolvimento.**

---

## GUARD RAIL CRÍTICO Nº 2 — identidade do avaliador nunca junto de texto `pares`/`subordinado` (seção 3.8 da spec)

Guard rail **diferente** do usado em "Visão Geral" (que é "nunca projetar
`avaliador_id`/`avaliado_id`/`tipo_relacionamento` — só `COUNT`/`AVG`"). Nesta
feature:

- `autoavaliacao`/`gestor`/`externo`: identidade completa (`avaliadorId` +
  `avaliadorNome`) **junto** do texto é esperado e correto (seção 3.2 da
  spec) — não é uma violação, é o comportamento pedido.
- `pares`/`subordinado`: `rel.avaliador_id`/`avaliador.nome_completo` **nunca
  aparecem em `.select()`/`.addSelect()`** em nenhuma query que também
  projete `item.valor`/texto — nem antes do limiar (óbvio, está bloqueado),
  nem depois (o texto liberado sai sempre sem identidade anexada). O único
  uso permitido de `avaliador_id` no caminho de `pares`/`subordinado` é
  **dentro de `COUNT(DISTINCT rel.avaliador_id)`** na query de gate (seção 4,
  `calcularGateParesSubordinado`) — a contagem toca a coluna, o retorno ao
  cliente não.
- `clima_geral`: nenhuma coluna de identidade existe em
  `respostas_clima`/`itens_resposta_clima` (estrutural, ver entity
  `RespostaClima`) — não há nada a vazar por design, mas o texto ainda sai
  **sem nenhuma atribuição por pessoa**, nem agregada (seção 3.4).
- Instrução para a checklist do `backend-codereviewer` (item 2 abaixo): grep
  em `analise-avaliacoes.service.ts` por `avaliadorId`/`avaliador_id`/
  `avaliador.nome_completo` — toda ocorrência fora de um comentário ou de
  dentro de `COUNT(DISTINCT ...)`/do bloco explícito de
  `autoavaliacao`/`gestor`/`externo` (`buscarIdentificadas360`) é achado
  crítico.

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `backend/src/modules/analise/analise.service.ts` (existente, "Visão
  Geral"): única função exportada `buscarVisaoGeral`; helpers privados não
  exportados hoje — `validarDataQuery`, `buscarUniversoCiclos`,
  `classificarPorTipo`, `arredondar1`, além das 6 funções de agregação
  específicas de Visão Geral. `buscarUniversoCiclos` (sobreposição de
  vigência `data_inicio <= :ate AND data_fim >= :de`, com `cicloId` opcional)
  e `classificarPorTipo` (via `Pesquisa.cicloId`, desempate por
  `criadoEm DESC`) são **exatamente** a lógica de universo de ciclos que esta
  feature também precisa — ver decisão de modelagem 1 (extração para arquivo
  compartilhado).
- `analise.controller.ts`/`analise.module.ts` (existentes): 1 handler + 1
  rota (`GET /api/analise/visao-geral`) atrás de `router.use(autenticar)`.
  Esta task adiciona 1 handler + 1 rota nos mesmos dois arquivos — não cria
  `module.ts`/`controller.ts` novos.
- Entidades relevantes já existentes (nomes de coluna confirmados por leitura
  direta, nenhum inventado):
  - `RelacionamentoAvaliacao` (`relacionamentos_avaliacao`): `id`, `cicloId`→
    `ciclo_id`, `avaliadorId`→`avaliador_id`, `avaliadoId`→`avaliado_id`,
    `tipoRelacionamento`→`tipo_relacionamento` (`TipoRelacionamento`:
    `'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'`).
  - `EnvioPesquisa` (`envios_pesquisa`): `id`, `relacionamentoId`→
    `relacionamento_id` (preenchido só para 360), `cicloId`→`ciclo_id`
    (preenchido só para clima).
  - `Resposta` (`respostas`, módulo `respostas/`, só entidade): `id`,
    `envioId`→`envio_id` (**UNIQUE**), `respondidoEm`→`respondido_em`.
    Representa 1 questionário 360 completo respondido — não 1 por pergunta.
  - `ItemResposta` (`itens_resposta`): `id`, `respostaId`→`resposta_id`,
    `perguntaId`→`pergunta_id`, `valor` (`jsonb`, shape `{ "texto": "..." }`
    para perguntas `texto_aberto`).
  - `RespostaClima` (`respostas_clima`, módulo `respostas-clima/`, só
    entidade): `id`, `pesquisaId`→`pesquisa_id`, `cicloId`→`ciclo_id`,
    `respondidoEm`→`respondido_em`. **Sem nenhuma FK de identidade** —
    comentário na entity: "NENHUMA rota, presente ou futura, deve adicionar
    uma coluna de identidade aqui".
  - `ItemRespostaClima` (`itens_resposta_clima`): `id`, `respostaClimaId`→
    `resposta_clima_id`, `perguntaId`→`pergunta_id`, `valor` (`jsonb`).
  - `Pergunta` (`perguntas`): `id`, `tipo` (`TipoPergunta`, filtrar
    `'texto_aberto'`), `enunciado` (**não** `titulo`/`descricao` — divergência
    já documentada no CLAUDE.md do projeto).
  - `Colaborador` (`colaboradores`): `id`, `nomeCompleto`→`nome_completo`.
  - `CicloAvaliacao` (`ciclos_avaliacao`): `id`, `minimoRespostasPares`→
    `minimo_respostas_pares` (`smallint`, default 3) — **lida**;
    `anonimizarRespostasPares`→`anonimizar_respostas_pares` (`boolean`) —
    **nunca lida por esta feature**, ver Guard rail crítico nº 1.
- `backend/src/common/uuid.ts` (`ehUuidValido`), `common/autorizacao.ts`
  (`garantirPapel`), `common/erro-http.ts` (`ErroHttp`),
  `common/http-async.ts` (`asyncHandler`), `middlewares/autenticacao.ts`
  (`autenticar`), `modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`
  (`buscarCicloOuFalhar`, exportada) — todos reaproveitados tal qual, mesmo
  padrão de "Visão Geral".
- Views `respostas_identificadas`/`respostas_pares_agregadas` (skill
  `backend-anonimizacao-respostas`): **não existem** em nenhuma migration —
  confirmado por leitura; não usar.

---

## Decisões de modelagem

### 1. Onde o código novo entra (resolve a "Pergunta em aberto" nº 1 da spec)

**Novo arquivo de service dedicado, mais um arquivo de helpers
compartilhados extraído do service existente — ambos dentro do módulo
`analise/` já existente:**

- `backend/src/modules/analise/analise-comum.ts` (**novo**): extrai de
  `analise.service.ts`, **sem mudança de comportamento**, as 3 peças que
  "Avaliações" também precisa e que não fazem sentido duplicar (a lógica de
  sobreposição de vigência + desempate de pesquisa vinculada é intrincada o
  suficiente para que duplicá-la seja risco de drift, diferente da pequena
  duplicação de `validarData` já aceita entre módulos *diferentes*
  `ciclos-avaliacao`/`analise`):
  - `REGEX_DATA`, `validarDataQuery(valor, campo)`.
  - `PeriodoConsulta` (tipo `{ de: string; ate: string }`).
  - `buscarUniversoCiclos(periodo, cicloId?)`.
  - `classificarPorTipo(idsUniverso)` → `{ idsAval360, idsClima }`.
  - `PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const`.

  `analise.service.ts` (Visão Geral) passa a **importar** essas peças de
  `analise-comum.ts` em vez de defini-las localmente — refactor puramente
  mecânico, sem alterar nenhuma query/valor retornado. A suíte existente
  `analise.service.spec.ts` (24 testes) deve continuar passando sem
  nenhuma alteração de asserção, só possivelmente de import interno se algum
  teste importar um helper privado (conferir antes de mover).
- `backend/src/modules/analise/analise-avaliacoes.service.ts` (**novo**):
  toda a lógica específica desta feature (gate 360, gate clima, busca de
  textos, reembaralhamento). Único ponto exportado: `buscarAvaliacoes`.

**Motivo de não colocar tudo em `analise.service.ts`**: o guard rail desta
feature é estruturalmente diferente do de "Visão Geral" (spec, seção 3.8 —
aqui identidade PRECISA ser projetada para 3 dos 5 tipos de relacionamento, lá
identidade nunca pode ser projetada em nenhum caso). Misturar os dois no
mesmo arquivo aumentaria o risco de um `backend-codereviewer` (ou um
`backend-developer` futuro copiando um padrão por perto) aplicar o guard
rail errado por proximidade visual. Arquivos separados, guard rails
documentados separadamente (ver seções no topo deste plano), mesmo módulo,
mesmo `analise.module.ts`/prefixo `/api/analise`.

`analise.controller.ts`/`analise.module.ts` (existentes) recebem só uma
adição cada (1 handler, 1 rota) — não são reescritos.

### 2. Contrato final do endpoint

`GET /api/analise/avaliacoes` — mesmo prefixo `/api/analise`, mesma proteção
(`router.use(autenticar)` em `analise.module.ts`, `garantirPapel(ator,
['admin', 'gestor_rh'])` como primeira linha de `buscarAvaliacoes`).

Query params (idênticos em validação a "Visão Geral", reaproveitando
`validarDataQuery`/`ehUuidValido`/`buscarCicloOuFalhar` de
`analise-comum.ts`/`ciclos-avaliacao.service.ts`):
- `de` (string `YYYY-MM-DD`, **obrigatório**).
- `ate` (string `YYYY-MM-DD`, **obrigatório**).
- `cicloId` (uuid, opcional).

**Diferença deliberada em relação ao shape sugerido na seção 6 da spec** (a
spec já autoriza refinar, documentando a diferença):

- `climaGeral` vira um **array** (`GrupoClimaGeral[]`), não um objeto único.
  Motivo: o gate de clima é "por ciclo inteiro" (spec 3.4), e `cicloId` é
  **opcional** neste endpoint — sem ele, o universo de ciclos do período pode
  conter mais de um ciclo `clima_geral`. Um objeto único não tem como
  representar "2 ciclos de clima no período, um liberado e outro não" sem
  overloading de shape. Quando `cicloId` é informado, o array tem no máximo 1
  item (ou 0, se aquele ciclo não for `clima_geral`).
- Cada item de `paresSubordinado` e de `climaGeral` ganha `cicloId` explícito
  (a spec omitiu no exemplo, mas sem `cicloId` no item não dá para
  desambiguar quando o endpoint cobre mais de um ciclo no período).

Shape final (interfaces exportadas de `analise-avaliacoes.service.ts`):

```ts
export interface TextoAbertoItem {
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface AvaliacaoIdentificada {
  tipoRelacionamento: 'autoavaliacao' | 'gestor' | 'externo'
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  avaliadorId: string
  avaliadorNome: string
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface GrupoParesSubordinado {
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: 'pares' | 'subordinado'
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface GrupoClimaGeral {
  cicloId: string
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface AvaliacoesAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: {
    identificadas: AvaliacaoIdentificada[]
    paresSubordinado: GrupoParesSubordinado[]
  }
  climaGeral: GrupoClimaGeral[]
}

export interface BuscarAvaliacoesDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}
```

Quando `idsUniverso` (universo de ciclos do corte de período, mesma função de
"Visão Geral") é vazio: retornar imediatamente `{ periodo, cicloId,
avaliacao360: { identificadas: [], paresSubordinado: [] }, climaGeral: [] }`
— **arrays vazios aqui são o comportamento correto** (não há nenhum
avaliado/ciclo a relatar, diferente do caso "existe um grupo mas está abaixo
do limiar", que é sempre representado por um item com `liberado: false`,
nunca omitido do array).

### 3. Corte de período aplicado também ao GATE, não só aos textos (decisão nova, documentar explicitamente)

Diferente de "Visão Geral" (que só usa o corte de período para contar/somar),
aqui o corte de período (`resposta.respondido_em`/`rc.respondido_em` dentro
de `[de, ate]`) é aplicado **tanto na query de gate quanto na query de
textos**, com o mesmo filtro. Isto é deliberado, não um descuido: os textos
exibidos já são restritos ao período; se o gate contasse respondentes do
CICLO INTEIRO (sem filtro de período) mas os textos exibidos fossem só os do
período filtrado, seria possível alguém estreitar o filtro de data até isolar
o texto de 1 único respondente dentro de um grupo que só passou no limiar
somando respondentes de fora da janela — reidentificação via filtro de data,
o tipo exato de ataque que a regra de anonimização deve prevenir. Contar o
gate sobre o mesmo recorte de dados que é efetivamente exibido garante que o
conjunto de anonimato do gate sempre bate com o conjunto de anonimato real do
que sai na resposta. Efeito colateral aceito: um filtro de período estreito
pode bloquear um grupo que, olhado no ciclo inteiro, teria respondentes
suficientes — comportamento seguro (falha fechada), não um bug.

### 4. Fonte da contagem de gate de clima (resolve a "Pergunta em aberto" nº 3 da spec)

A spec recomendava reaproveitar `ciclo_participantes.respondeu_em` (mesma
base de `calcularProgressoCiclo`), mas pedia para confirmar equivalência com
`respostas_clima` antes de assumir. **Decisão deste plano: usar
`respostas_clima` diretamente (`COUNT(rc.id)` por `ciclo_id`, mesmo filtro de
período), não `ciclo_participantes`.** Motivo: os textos exibidos vêm de
`itens_resposta_clima` → `respostas_clima` — o gate precisa contar
exatamente essa mesma fonte para garantir que o conjunto de anonimato do
gate bata com o conjunto real de respostas de onde os textos saem (mesmo
raciocínio da decisão 3 acima). Usar `ciclo_participantes` como proxy
reintroduziria o mesmo risco de divergência sob corrida de duplo-submit já
documentado como aceito em `coleta-respostas-publica/task-backend.md`
(decisão 10) — aceitável para uma contagem informativa como
`calcularProgressoCiclo`, mas não para um gate de anonimização, onde
divergência pode significar "gate liberado com base em 3 participantes, mas
só 2 respostas de clima existem de fato" (exposição indevida).

### 5. `minimoRespostasPares` por ciclo, lido em lote

`buscarMinimosPorCiclo(idsUniverso)` — uma única query
(`CicloAvaliacao.find({ where: { id: In(ids) }, select: ['id',
'minimoRespostasPares'] } )`, ver Guard rail crítico nº 1 sobre o `select`
explícito) para todos os ciclos do universo (360 e clima juntos), retornando
`Map<cicloId, number>`. Usada tanto pelo gate 360 quanto pelo gate clima.

### 6. Reembaralhamento (Fisher-Yates) — resolve o item 5 do pedido

Função pura em `analise-avaliacoes.service.ts` (não exportada, só usada
internamente):

```ts
function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}
```

Aplicada **só ao array `textos` dentro de cada grupo liberado**
(`GrupoParesSubordinado.textos`/`GrupoClimaGeral.textos`), na montagem final
da resposta, **depois** de buscar os textos do banco e **antes** de retornar
ao controller — nunca no SQL (`ORDER BY random()` seria uma alternativa, mas
fica no service em JS para manter a lógica de anonimização inteiramente do
lado da aplicação, testável sem banco). A ORDEM DOS GRUPOS em si (qual
`avaliadoId`/`cicloId` vem primeiro na lista `paresSubordinado`/
`climaGeral`) **não** precisa ser embaralhada — `avaliadoId`/`cicloId` não
são segredo (é o texto individual dentro do grupo que precisa perder
qualquer posição fixa entre carregamentos, spec 3.5). Não confundir os dois
— só o array `textos` interno é embaralhado.

### 7. `autoavaliacao`/`gestor`/`externo` sem gate (resolve item 3.2 do pedido)

`buscarIdentificadas360` não calcula nenhum limiar — todo texto de
`autoavaliacao`/`gestor`/`externo` no corte de período é retornado
identificado, sempre. Ordenação sugerida (não obrigatória,
não-relacionada a anonimização): `ORDER BY avaliado.nome_completo,
avaliador.nome_completo, pergunta.enunciado` para uma UI estável.

---

## Plano — Backend

### 1. backend-developer

Antes de codar: reler as duas seções "GUARD RAIL CRÍTICO" no topo deste
documento e a skill `backend-anonimizacao-respostas`. Nenhuma migration é
necessária — confirmar isso no início (não rodar
`migration:generate`/`migration:run`).

#### 1.1 `analise-comum.ts` (novo, extração sem mudança de comportamento)

Mover de `analise.service.ts` para `analise-comum.ts`: `REGEX_DATA`,
`validarDataQuery`, tipo `PeriodoConsulta` (`{ de: string; ate: string }`),
`buscarUniversoCiclos`, `classificarPorTipo`, `PAPEIS_COM_ACESSO`. Atualizar
`analise.service.ts` para importar essas peças de `./analise-comum` em vez de
defini-las localmente. **Nenhuma mudança de valor de retorno/SQL gerado** —
é puramente mover código. Rodar `analise.service.spec.ts` (suíte existente)
logo depois dessa extração, antes de escrever qualquer código novo, para
confirmar 0 regressão (os 24 testes de "Visão Geral" continuam passando
exatamente como antes).

#### 1.2 `analise-avaliacoes.service.ts` (novo)

Import de `analise-comum.ts` (`validarDataQuery`, `buscarUniversoCiclos`,
`classificarPorTipo`, `PAPEIS_COM_ACESSO`, `PeriodoConsulta`), de
`common/autorizacao.ts` (`garantirPapel`), `common/erro-http.ts`
(`ErroHttp`), `common/uuid.ts` (`ehUuidValido`),
`ciclos-avaliacao/ciclos-avaliacao.service.ts` (`buscarCicloOuFalhar`), das
entidades `CicloAvaliacao`, `RelacionamentoAvaliacao`, `EnvioPesquisa`,
`Resposta`, `ItemResposta`, `RespostaClima`, `ItemRespostaClima`,
`Pergunta`, `Colaborador`, e `In` de `typeorm`.

**Função exportada única: `buscarAvaliacoes(ator, dto)`.**

```
garantirPapel(ator, [...PAPEIS_COM_ACESSO])                // guard rail crítico nº 1: única checagem de papel de toda a função
de = validarDataQuery(dto.de, 'de')
ate = validarDataQuery(dto.ate, 'ate')
if (ate < de) throw 422 PERIODO_INVALIDO
cicloId = validar/normalizar dto.cicloId (ehUuidValido + buscarCicloOuFalhar), igual a "Visão Geral"
periodo = { de, ate }

idsUniverso = await buscarUniversoCiclos(periodo, cicloId ?? undefined)
if (idsUniverso.length === 0):
  return { periodo, cicloId, avaliacao360: { identificadas: [], paresSubordinado: [] }, climaGeral: [] }

{ idsAval360, idsClima } = await classificarPorTipo(idsUniverso)
minimosPorCiclo = await buscarMinimosPorCiclo(idsUniverso)

identificadas = await buscarIdentificadas360(idsAval360, periodo)

gateParesSubordinado = await calcularGateParesSubordinado(idsAval360, periodo)
nomesAvaliados = await buscarNomesColaboradores(gateParesSubordinado.map(g => g.avaliadoId))
gruposLiberados360 = gateParesSubordinado.filter(g => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3))
textosPorGrupo360 = await buscarTextosParesSubordinado(gruposLiberados360, periodo)
paresSubordinado = montarGruposParesSubordinado(gateParesSubordinado, minimosPorCiclo, nomesAvaliados, textosPorGrupo360)

gateClima = await calcularGateClima(idsClima, periodo)
idsClimaLiberados = gateClima.filter(g => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3)).map(g => g.cicloId)
textosPorCiclo Clima = await buscarTextosClima(idsClimaLiberados, periodo)
climaGeral = montarGruposClima(gateClima, minimosPorCiclo, textosPorCicloClima)

return { periodo, cicloId, avaliacao360: { identificadas, paresSubordinado }, climaGeral }
```

Consultas independentes (`buscarIdentificadas360`, `calcularGateParesSubordinado`,
`calcularGateClima`, `buscarMinimosPorCiclo`) podem ser disparadas com
`Promise.all` — só `buscarTextosParesSubordinado`/`buscarTextosClima`
dependem do resultado do gate correspondente (têm que esperar).

##### 1.2.1 `buscarIdentificadas360` — `autoavaliacao`/`gestor`/`externo` (seção 3.2)

```ts
// Identidade PROJETADA DELIBERADAMENTE — autoavaliacao/gestor/externo não
// têm terceiro a proteger (spec 3.2, guard rail crítico nº 2 do plano).
async function buscarIdentificadas360(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<AvaliacaoIdentificada[]> {
  if (ids.length === 0) return []
  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = rel.avaliado_id')
    .innerJoin(Colaborador, 'avaliador', 'avaliador.id = rel.avaliador_id')
    .select('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('rel.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['autoavaliacao', 'gestor', 'externo'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .orderBy('avaliado.nome_completo')
    .addOrderBy('avaliador.nome_completo')
    .addOrderBy('pergunta.enunciado')
    .getRawMany()

  return linhas.map((l) => ({ ...l /* mapear snake→camel conforme os aliases já usados acima */ }))
}
```

##### 1.2.2 `calcularGateParesSubordinado` — gate 360 (seção 3.3)

```ts
// GATE: único uso permitido de avaliador_id no caminho pares/subordinado é
// DENTRO de COUNT(DISTINCT ...) — nunca projetado bruto (guard rail crítico nº 2).
async function calcularGateParesSubordinado(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<Array<{ avaliadoId: string; cicloId: string; tipoRelacionamento: 'pares' | 'subordinado'; totalRespondentes: number }>> {
  if (ids.length === 0) return []
  const linhas = await AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('rel')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.relacionamento_id = rel.id')
    .innerJoin(Resposta, 'resposta', 'resposta.envio_id = envio.id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('COUNT(DISTINCT rel.avaliador_id)', 'totalRespondentes')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['pares', 'subordinado'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo) // decisão 3: gate usa o MESMO recorte de período dos textos
    .groupBy('rel.avaliado_id')
    .addGroupBy('rel.ciclo_id')
    .addGroupBy('rel.tipo_relacionamento')
    .getRawMany()

  return linhas.map((l) => ({ ...l, totalRespondentes: Number(l.totalRespondentes) }))
}
```

##### 1.2.3 `buscarTextosParesSubordinado` — só para grupos JÁ liberados

```ts
// Recebe só os grupos que JÁ passaram no gate — nunca busca texto de grupo
// abaixo do limiar, nem transitoriamente em memória (defesa em profundidade,
// além do filtro em montarGruposParesSubordinado). NUNCA seleciona
// rel.avaliador_id (guard rail crítico nº 2).
async function buscarTextosParesSubordinado(
  grupos: Array<{ avaliadoId: string; cicloId: string; tipoRelacionamento: string }>,
  periodo: PeriodoConsulta,
): Promise<Map<string, TextoAbertoItem[]>> {
  const mapa = new Map<string, TextoAbertoItem[]>()
  if (grupos.length === 0) return mapa

  const qb = AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select('rel.avaliado_id', 'avaliadoId')
    .addSelect('rel.ciclo_id', 'cicloId')
    .addSelect('rel.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")

  const condicoes: string[] = []
  const params: Record<string, unknown> = { de: periodo.de, ate: periodo.ate }
  grupos.forEach((g, i) => {
    condicoes.push(`(rel.avaliado_id = :avaliadoId${i} AND rel.ciclo_id = :cicloId${i} AND rel.tipo_relacionamento = :tipo${i})`)
    params[`avaliadoId${i}`] = g.avaliadoId
    params[`cicloId${i}`] = g.cicloId
    params[`tipo${i}`] = g.tipoRelacionamento
  })
  qb.andWhere(`(${condicoes.join(' OR ')})`, params)

  const linhas = await qb.getRawMany()
  for (const l of linhas) {
    const chave = `${l.avaliadoId}|${l.cicloId}|${l.tipoRelacionamento}`
    const item: TextoAbertoItem = { perguntaId: l.perguntaId, perguntaEnunciado: l.perguntaEnunciado, texto: l.texto }
    mapa.set(chave, [...(mapa.get(chave) ?? []), item])
  }
  return mapa
}
```

##### 1.2.4 `montarGruposParesSubordinado` (junta gate + nomes + textos + embaralhamento)

```ts
function montarGruposParesSubordinado(
  gate: Array<{ avaliadoId: string; cicloId: string; tipoRelacionamento: 'pares' | 'subordinado'; totalRespondentes: number }>,
  minimosPorCiclo: Map<string, number>,
  nomes: Map<string, string>,
  textosPorGrupo: Map<string, TextoAbertoItem[]>,
): GrupoParesSubordinado[] {
  return gate.map((g) => {
    const minimo = minimosPorCiclo.get(g.cicloId) ?? 3
    const liberado = g.totalRespondentes >= minimo
    const chave = `${g.avaliadoId}|${g.cicloId}|${g.tipoRelacionamento}`
    return {
      cicloId: g.cicloId,
      avaliadoId: g.avaliadoId,
      avaliadoNome: nomes.get(g.avaliadoId) ?? '',
      tipoRelacionamento: g.tipoRelacionamento,
      totalRespondentes: g.totalRespondentes,
      minimoNecessario: minimo,
      liberado,
      ...(liberado
        ? { textos: embaralhar(textosPorGrupo.get(chave) ?? []) }
        : { motivo: 'aguardando_minimo_respondentes' as const }),
    }
  })
}
```

##### 1.2.5 `calcularGateClima` e `buscarTextosClima` (seção 3.4)

```ts
// GATE por CICLO INTEIRO — respostas_clima é estruturalmente anônima, não há
// avaliador_id a contar; a contagem aqui é de LINHAS de respostas_clima
// (decisão de modelagem 4), não de ciclo_participantes.
async function calcularGateClima(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<Array<{ cicloId: string; totalRespondentes: number }>> {
  if (ids.length === 0) return []
  const linhas = await AppDataSource.getRepository(RespostaClima)
    .createQueryBuilder('rc')
    .select('rc.ciclo_id', 'cicloId')
    .addSelect('COUNT(rc.id)', 'totalRespondentes')
    .where('rc.ciclo_id IN (:...ids)', { ids })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .groupBy('rc.ciclo_id')
    .getRawMany()
  return linhas.map((l) => ({ cicloId: l.cicloId, totalRespondentes: Number(l.totalRespondentes) }))
}

// Só para ciclos JÁ liberados. respostas_clima/itens_resposta_clima não têm
// NENHUMA coluna de identidade — nada a excluir aqui além do texto em si.
async function buscarTextosClima(
  idsCiclosLiberados: string[],
  periodo: PeriodoConsulta,
): Promise<Map<string, TextoAbertoItem[]>> {
  const mapa = new Map<string, TextoAbertoItem[]>()
  if (idsCiclosLiberados.length === 0) return mapa

  const linhas = await AppDataSource.getRepository(ItemRespostaClima)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(RespostaClima, 'rc', 'rc.id = item.resposta_clima_id')
    .select('rc.ciclo_id', 'cicloId')
    .addSelect('pergunta.id', 'perguntaId')
    .addSelect('pergunta.enunciado', 'perguntaEnunciado')
    .addSelect("item.valor ->> 'texto'", 'texto')
    .where('rc.ciclo_id IN (:...ids)', { ids: idsCiclosLiberados })
    .andWhere('rc.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .getRawMany()

  for (const l of linhas) {
    const item: TextoAbertoItem = { perguntaId: l.perguntaId, perguntaEnunciado: l.perguntaEnunciado, texto: l.texto }
    mapa.set(l.cicloId, [...(mapa.get(l.cicloId) ?? []), item])
  }
  return mapa
}

function montarGruposClima(
  gate: Array<{ cicloId: string; totalRespondentes: number }>,
  minimosPorCiclo: Map<string, number>,
  textosPorCiclo: Map<string, TextoAbertoItem[]>,
): GrupoClimaGeral[] {
  return gate.map((g) => {
    const minimo = minimosPorCiclo.get(g.cicloId) ?? 3
    const liberado = g.totalRespondentes >= minimo
    return {
      cicloId: g.cicloId,
      totalRespondentes: g.totalRespondentes,
      minimoNecessario: minimo,
      liberado,
      ...(liberado
        ? { textos: embaralhar(textosPorCiclo.get(g.cicloId) ?? []) }
        : { motivo: 'aguardando_minimo_respondentes' as const }),
    }
  })
}
```

##### 1.2.6 `buscarMinimosPorCiclo`/`buscarNomesColaboradores`

```ts
// select explícito — NUNCA trazer anonimizarRespostasPares (guard rail crítico nº 1).
async function buscarMinimosPorCiclo(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(ids) },
    select: ['id', 'minimoRespostasPares'],
  })
  return new Map(ciclos.map((c) => [c.id, c.minimoRespostasPares]))
}

async function buscarNomesColaboradores(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const colaboradores = await AppDataSource.getRepository(Colaborador).find({
    where: { id: In(idsUnicos) },
    select: ['id', 'nomeCompleto'],
  })
  return new Map(colaboradores.map((c) => [c.id, c.nomeCompleto]))
}
```

#### 1.3 `embaralhar` (Fisher-Yates) — ver decisão de modelagem 6

Implementar exatamente como no pseudocódigo da decisão 6, função privada de
`analise-avaliacoes.service.ts`.

#### 1.4 `analise.controller.ts` — adicionar 1 handler

```ts
import * as analiseAvaliacoesService from './analise-avaliacoes.service'
// ... (import já existente de analiseService para buscarVisaoGeralAnalise)

export async function buscarAvaliacoesAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseAvaliacoesService.buscarAvaliacoes(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}
```

#### 1.5 `analise.module.ts` — adicionar 1 rota

```ts
import { buscarAvaliacoesAnalise } from './analise.controller' // junto ao import já existente

router.get('/avaliacoes', asyncHandler(buscarAvaliacoesAnalise)) // logo abaixo de router.get('/visao-geral', ...)
```

`app.ts` **não muda** — `/api/analise` já está montado, esta rota entra sob
o mesmo prefixo.

#### 1.6 Tratamento de erros

| Situação | Status | Código |
|---|---|---|
| `de` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| `ate` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| `ate < de` | 422 | `PERIODO_INVALIDO` |
| `cicloId` presente mas não é um uuid válido | 422 | `CAMPO_INVALIDO` |
| `cicloId` presente, formato válido, mas ciclo não existe | 404 | `CICLO_NAO_ENCONTRADO` (via `buscarCicloOuFalhar`) |
| Papel do ator não é `admin`/`gestor_rh` | 403 | `PAPEL_NAO_AUTORIZADO` (via `garantirPapel`) |

Nenhum erro novo em `MAPA_CONSTRAINT_PARA_CODIGO` — módulo só leitura, sem
`INSERT`/`UNIQUE` a violar. Nenhum estado de bloqueio de anonimização
(`liberado: false`) é um erro HTTP — sempre `200`, o bloqueio é modelado no
corpo da resposta (seção "Contrato final do endpoint" acima), nunca como
`403`/`204`/array vazio ambíguo.

#### 1.7 Wiring final

- Nenhuma migration, nenhuma variável de ambiente nova, nenhuma entrada nova
  em `common/enums.ts`.
- `npm run build` (tsc) e `npm test` (Vitest) devem rodar sem novos erros
  introduzidos por esta task, e a suíte existente `analise.service.spec.ts`
  (24 testes de "Visão Geral") deve continuar 100% passando após a extração
  do passo 1.1, antes de considerar o passo concluído.

---

## Status

### 1. backend-developer — CONCLUÍDO

Implementado exatamente conforme o plano acima (1.1–1.7), sem desvios:

- **1.1** `backend/src/modules/analise/analise-comum.ts` (novo): extraído de
  `analise.service.ts`, sem mudança de comportamento —
  `PAPEIS_COM_ACESSO`, `REGEX_DATA`, `validarDataQuery`, tipo
  `PeriodoConsulta`, `buscarUniversoCiclos`, `classificarPorTipo`.
  `analise.service.ts` agora importa essas 4 peças de `./analise-comum` em
  vez de defini-las localmente; nenhuma query/valor de retorno mudou. Rodei
  `analise.service.spec.ts` logo depois da extração, antes de escrever
  qualquer código novo: 25 testes passando (0 regressão) — o mesmo total já
  citado no status de "Visão Geral" (a task descreve "24 testes" no texto,
  mas a suíte real sempre teve 25, incluindo a suíte HTTP no fim do arquivo;
  confirmado por leitura direta do arquivo antes de rodar).
- **1.2** `backend/src/modules/analise/analise-avaliacoes.service.ts` (novo):
  única função exportada `buscarAvaliacoes`, seguindo literalmente o
  pseudocódigo 1.2–1.2.6 — `buscarIdentificadas360` (autoavaliacao/gestor/
  externo, identidade projetada deliberadamente),
  `calcularGateParesSubordinado` (`COUNT(DISTINCT rel.avaliador_id)` GROUP BY
  avaliado+ciclo+tipo, filtrado pelo MESMO recorte de período usado depois
  nos textos — decisão de modelagem 3), `buscarTextosParesSubordinado` (só
  recebe grupos JÁ liberados, filtrados ANTES de montar a lista passada à
  função — nunca busca texto de grupo abaixo do limiar),
  `montarGruposParesSubordinado` (junta gate + nomes + textos +
  `embaralhar`), `calcularGateClima`/`buscarTextosClima` (`COUNT(rc.id)` por
  `ciclo_id`, mesma fonte `respostas_clima` dos textos — decisão de
  modelagem 4, não `ciclo_participantes`), `montarGruposClima`,
  `buscarMinimosPorCiclo` (`select: { id: true, minimoRespostasPares: true
  }` — ver nota de adaptação abaixo) e `buscarNomesColaboradores`. Queries
  independentes (`buscarIdentificadas360`, `calcularGateParesSubordinado`,
  `calcularGateClima`, `buscarMinimosPorCiclo`) disparadas em paralelo via
  `Promise.all`; `buscarTextosParesSubordinado`/`buscarTextosClima` esperam o
  gate correspondente, como pedido.
- **1.3** `embaralhar` (Fisher-Yates): implementada como função privada não
  exportada, aplicada só ao array `textos` de cada grupo liberado, nunca à
  ordem dos grupos.
- **1.4/1.5** `analise.controller.ts`: handler novo `buscarAvaliacoesAnalise`
  (import de `analise-avaliacoes.service.ts` como `analiseAvaliacoesService`,
  junto ao import já existente de `analiseService`). `analise.module.ts`:
  rota nova `router.get('/avaliacoes', asyncHandler(buscarAvaliacoesAnalise))`
  logo abaixo de `/visao-geral`, mesmo `router.use(autenticar)`. `app.ts` não
  mudou — `/api/analise` já estava montado.
- **Guard rail crítico nº 1**: `anonimizarRespostasPares`/
  `anonimizar_respostas_pares` só aparecem em comentários explicativos em
  `analise-avaliacoes.service.ts` (grep confirmado) — nenhum `SELECT`/
  condicional. Nenhum branch por `ator.papel` além do `garantirPapel` inicial
  (grep por `ignorarLimiar`/`forcarExibir`/`modoTransparencia`/`bypass`/
  `ator.papel ===` sem ocorrências fora de comentário). `BuscarAvaliacoesDto`
  tem exatamente os 3 campos (`de`, `ate`, `cicloId?`), nenhum parâmetro de
  bypass.
- **Guard rail crítico nº 2**: `rel.avaliador_id`/`avaliador.nome_completo`
  só aparecem (a) dentro de `buscarIdentificadas360` (autoavaliacao/gestor/
  externo, permitido), (b) dentro de `COUNT(DISTINCT rel.avaliador_id)` em
  `calcularGateParesSubordinado`, ou (c) em comentário — grep confirmado, sem
  ocorrência em `.select()`/`.addSelect()` de
  `buscarTextosParesSubordinado`/`montarGruposParesSubordinado`. Nenhuma
  função do caminho de clima toca `avaliador_id`/`avaliadorId`.
- **Nota de adaptação em relação ao pseudocódigo literal do plano**: o
  pseudocódigo de `buscarMinimosPorCiclo`/`buscarNomesColaboradores` usa
  `select: ['id', 'minimoRespostasPares']` (forma array). A versão de
  `typeorm` instalada neste projeto só tipa `FindOptionsSelect` na forma de
  objeto (`{ id: true, minimoRespostasPares: true }`) — a forma array não
  compila (`tsc` `TS2559`). Troquei para a forma de objeto, que tem
  exatamente o mesmo efeito de runtime (só essas 2 colunas são trazidas do
  banco — `anonimizarRespostasPares`/demais colunas de `CicloAvaliacao`
  continuam fora do `SELECT` gerado) — sem impacto no guard rail crítico nº
  1. Também precisei adaptar o corpo de `embaralhar` (Fisher-Yates): o
  `tsconfig.json` do projeto tem `noUncheckedIndexedAccess: true`, então o
  swap por desestruturação do pseudocódigo (`[copia[i], copia[j]] =
  [copia[j], copia[i]]`) não compila (`copia[i]` tipado `T | undefined`);
  troquei por swap com variável temporária e `as T` (índices sempre válidos
  dentro do laço, comportamento idêntico).
- Nenhuma migration criada/rodada (confirmado antes de começar — módulo é só
  leitura sobre tabelas já existentes). Nenhuma variável de ambiente nova,
  nenhuma entrada nova em `common/enums.ts`. Nenhuma view
  `respostas_identificadas`/`respostas_pares_agregadas` referenciada (não
  existem em migration nenhuma).
- `npm run build` (tsc): sem novos erros introduzidos por esta task. O único
  erro reportado (`src/test/fakeRepository.ts`, `TS2352`) é pré-existente no
  working tree antes desta task (arquivo nunca tocado por mim; mesmo erro já
  documentado como pré-existente no status de "Visão Geral",
  `.claude/tasks/analise-visao-geral/task-backend.md`).
- `npm test` (Vitest): 167/167 testes passando, incluindo os 25 testes
  existentes de `analise.service.spec.ts` ("Visão Geral") 100% passando sem
  nenhuma alteração de asserção. Nenhum teste novo foi escrito aqui —
  cobertura de `analise-avaliacoes.service.ts` é responsabilidade do
  `test-engineer`, etapa posterior do pipeline.

Migrations a rodar: nenhuma.

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **`anonimizar_respostas_pares` (Guard rail crítico nº 1)**: grep em
   `analise-avaliacoes.service.ts` por `anonimizarRespostasPares`/
   `anonimizar_respostas_pares` — qualquer ocorrência fora de um comentário
   explicativo é achado **crítico obrigatório**, sem exceção de papel. Grep
   também por `ignorarLimiar`/`forcarExibir`/`modoTransparencia`/
   `bypass`/`ator.papel === 'admin'` dentro deste service — qualquer branch
   condicional no resultado do gate baseado em papel além do
   `garantirPapel` inicial é achado **crítico obrigatório**. Confirmar que
   `buscarMinimosPorCiclo` usa `select: ['id', 'minimoRespostasPares']`
   explícito (não um `find` sem `select` que traria a coluna irmã junto).
2. **Identidade do avaliador junto de texto `pares`/`subordinado` (Guard
   rail crítico nº 2)**: grep por `avaliadorId`/`avaliador_id`/
   `avaliador.nome_completo` em `analise-avaliacoes.service.ts` — toda
   ocorrência deve estar (a) dentro de `buscarIdentificadas360` (permitido,
   `autoavaliacao`/`gestor`/`externo`), (b) dentro de
   `COUNT(DISTINCT rel.avaliador_id)` em `calcularGateParesSubordinado`, ou
   (c) em comentário. Qualquer ocorrência em `.select()`/`.addSelect()` de
   `buscarTextosParesSubordinado`/`montarGruposParesSubordinado` é achado
   **crítico**. Confirmar também que nenhuma função toca
   `avaliador_id`/`avaliadorId` no caminho de clima (não deveria nem
   existir, já que `respostas_clima` não tem FK de identidade).
3. **Corte de período aplicado também ao gate (decisão de modelagem 3)**:
   confirmar que `calcularGateParesSubordinado`/`calcularGateClima` filtram
   por `respondido_em` dentro de `[de, ate]`, com o MESMO filtro usado nas
   queries de texto correspondentes (`buscarTextosParesSubordinado`/
   `buscarTextosClima`) — se um filtrar e o outro não, o conjunto de
   anonimato do gate deixa de bater com o conjunto real exposto (achado
   crítico).
4. **`buscarTextosParesSubordinado`/`buscarTextosClima` só recebem grupos
   JÁ liberados** — confirmar que a filtragem por `totalRespondentes >=
   minimo` acontece ANTES de montar a lista de grupos passada a essas duas
   funções (não depois, como um `.filter()` sobre o resultado já buscado do
   banco) — buscar texto de um grupo abaixo do limiar, mesmo que depois
   descartado antes de serializar, é uma violação do espírito do guard rail
   (achado ao menos "Deveria corrigir", crítico se o texto chegar a ser
   projetado de fato no array retornado).
5. **Estado de bloqueio nunca é array vazio nem omissão do grupo**:
   confirmar que todo `avaliadoId`+`cicloId`+`tipoRelacionamento` que
   aparece no resultado de `calcularGateParesSubordinado` também aparece no
   array final `paresSubordinado` (com `liberado: false` + `motivo` quando
   abaixo do limiar) — nenhum grupo deve ser silenciosamente descartado do
   array por estar bloqueado. Mesma checagem para `climaGeral` com
   `calcularGateClima`.
6. **Reembaralhamento (spec 3.5)**: confirmar que `embaralhar` é chamado em
   `montarGruposParesSubordinado`/`montarGruposClima` sobre o array
   `textos`, no backend, não delegado a nenhum parâmetro de
   ordenação/`ORDER BY` fixo repassado ao frontend. Confirmar que a ORDEM
   DOS GRUPOS (não dos textos dentro deles) pode permanecer estável — não é
   erro se `paresSubordinado`/`climaGeral` vierem ordenados de forma
   previsível por `avaliadoNome`/`cicloId`.
7. **`garantirPapel` é a primeira linha de `buscarAvaliacoes`** — nenhuma
   query deve rodar antes dessa checagem.
8. **`de`/`ate` sem default, mesma validação de "Visão Geral"** — ausência
   de qualquer um dos dois é `422 CAMPO_INVALIDO` antes de qualquer query.
9. **Extração para `analise-comum.ts` (passo 1.1) não altera comportamento
   de "Visão Geral"**: confirmar que `analise.service.spec.ts` (suíte
   existente, 24 testes) continua passando sem alteração de asserções, só
   possivelmente de import.
10. **Nenhuma tentativa de importar/usar as views
    `respostas_identificadas`/`respostas_pares_agregadas`** — não existem
    fisicamente em nenhuma migration.
11. Confirmar `npm run build`/`npm test` sem novas falhas antes de aprovar.

## Revisão

Revisão feita por leitura completa de `analise-avaliacoes.service.ts`,
`analise-comum.ts`, `analise.service.ts` (pós-extração),
`analise.controller.ts`, `analise.module.ts`, das entities tocadas
(`RelacionamentoAvaliacao`/`EnvioPesquisa`/`Resposta`/`ItemResposta`/
`RespostaClima`/`ItemRespostaClima`/`CicloAvaliacao`/`Colaborador`) e de
`analise.service.spec.ts` (imports), contra os 11 pontos da checklist acima.
Grep dedicado rodado para os dois guard rails críticos (resultados abaixo).

### Sem achados críticos

**Guard rail crítico nº 1** (`anonimizar_respostas_pares`): grep por
`anonimizarRespostasPares`/`anonimizar_respostas_pares` em
`analise-avaliacoes.service.ts` retorna só 2 ocorrências, ambas em comentário
(linha 27, docstring do guard rail; linha 343, comentário acima de
`buscarMinimosPorCiclo`) — nenhum `SELECT`/condicional. Grep por
`ignorarLimiar`/`forcarExibir`/`modoTransparencia`/`bypass`/`ator.papel ===`
retorna só 1 ocorrência, também em comentário ("têm nenhum bypass do
limiar"). `BuscarAvaliacoesDto` tem exatamente `{ de, ate, cicloId? }`, sem
parâmetro de bypass. `buscarMinimosPorCiclo` usa `select: { id: true,
minimoRespostasPares: true }` (forma objeto, documentada como adaptação do
pseudocódigo por incompatibilidade de tipo do TypeORM instalado) —
confirmado que essa forma é equivalente em efeito de runtime à forma array
do plano: só os campos com `true` explícito entram no `SELECT` gerado pelo
TypeORM, `anonimizarRespostasPares` (e qualquer outra coluna de
`CicloAvaliacao`) fica de fora. O desvio não enfraquece o guard rail.

**Guard rail crítico nº 2** (identidade do avaliador junto de texto
pares/subordinado): grep por `avaliadorId`/`avaliador_id`/
`avaliador.nome_completo` em `analise-avaliacoes.service.ts` retorna
ocorrências só em: (a) `buscarIdentificadas360` — `.innerJoin`, `.addSelect`,
`.addOrderBy`, interface `AvaliacaoIdentificada` (identidade projetada
deliberadamente para autoavaliacao/gestor/externo, permitido); (b)
`COUNT(DISTINCT rel.avaliador_id)` dentro de `calcularGateParesSubordinado`
(permitido, é contagem, não projeção); (c) comentários. Nenhuma ocorrência em
`.select()`/`.addSelect()` de `buscarTextosParesSubordinado` (projeta só
`avaliadoId`, `cicloId`, `tipoRelacionamento`, `perguntaId`,
`perguntaEnunciado`, `texto`) nem de `montarGruposParesSubordinado`. Nenhuma
função do caminho de clima (`calcularGateClima`, `buscarTextosClima`,
`montarGruposClima`) toca `avaliador_id`/`avaliadorId` — coerente com
`RespostaClima`/`ItemRespostaClima` não terem nenhuma FK de identidade
(confirmado por leitura das duas entities).

**Ponto 3 (corte de período no gate, mesmo filtro dos textos)**:
`calcularGateParesSubordinado` e `buscarTextosParesSubordinado` usam
literalmente o mesmo predicado `resposta.respondido_em::date BETWEEN
:de::date AND :ate::date`; `calcularGateClima` e `buscarTextosClima` usam
literalmente o mesmo predicado `rc.respondido_em::date BETWEEN :de::date AND
:ate::date`. Conjunto de anonimato do gate bate com o conjunto real exposto
nos dois caminhos.

**Ponto 4 (textos só de grupos já liberados)**: em `buscarAvaliacoes`,
`gruposLiberados360` é calculado por `.filter(totalRespondentes >= minimo)`
sobre `gateParesSubordinado` **antes** de ser passado a
`buscarTextosParesSubordinado`; o mesmo padrão para `idsClimaLiberados` antes
de `buscarTextosClima`. Nenhuma busca de texto roda para grupo abaixo do
limiar, nem transitoriamente.

**Ponto 5 (nenhum grupo omitido do array final)**: `montarGruposParesSubordinado`
e `montarGruposClima` fazem `.map()` sobre o array `gate` **completo** (não
sobre a versão filtrada `gruposLiberados360`/`idsClimaLiberados`) — todo
`avaliadoId`+`cicloId`+`tipoRelacionamento`/`cicloId` que aparece no gate
aparece no array final, com `liberado: false` + `motivo:
'aguardando_minimo_respondentes'` quando abaixo do limiar. Nenhuma omissão.

**Ponto 6 (reembaralhamento)**: `embaralhar` (Fisher-Yates, cópia não-mutante)
é chamado só dentro de `montarGruposParesSubordinado`/`montarGruposClima`,
aplicado só ao array `textos` de cada grupo liberado — nunca à ordem dos
grupos em si, nunca delegado a `ORDER BY`/parâmetro repassado ao frontend.

**Ponto 7 (`garantirPapel` primeiro)**: confirmado — primeira linha de
`buscarAvaliacoes`, antes de qualquer validação de data/query ao banco.

**Ponto 8 (`de`/`ate` sem default)**: `validarDataQuery` exige `string`
batendo com `YYYY-MM-DD` e data de calendário válida, sem fallback — ausência
de qualquer um dos dois é `422 CAMPO_INVALIDO` antes de qualquer query,
idêntico a "Visão Geral".

**Ponto 9 (extração não altera "Visão Geral")**: `analise.service.ts` agora
importa `PAPEIS_COM_ACESSO`/`buscarUniversoCiclos`/`classificarPorTipo`/
`validarDataQuery` de `./analise-comum` em vez de defini-los localmente — não
há redefinição residual nem duplicação no arquivo. `analise-comum.ts`
reproduz literalmente a mesma lógica/SQL (`data_inicio <= :ate::date AND
data_fim >= :de::date`, classificação por `Pesquisa` mais recente via
`criadoEm DESC`) já usada antes da extração. `analise.service.spec.ts`
importa só `analiseService` (módulo público) e entities — não importa nenhum
helper privado que possa ter mudado de módulo, então a extração não quebra a
suíte por import. Não tenho acesso a `Bash`/execução neste papel (só
Read/Grep/Glob/Edit), então não rodei `npm test` eu mesmo — o relatório do
`backend-developer` ("25/167 passando, 0 regressão de asserção") não foi
re-executado por mim; recomendo ao orquestrador confirmar isso rodando a
suíte antes do merge, já que é o único item da checklist que depende de
execução em vez de leitura estática.

**Ponto 10 (views inexistentes)**: nenhuma referência a
`respostas_identificadas`/`respostas_pares_agregadas` em nenhum arquivo
tocado — confirmado por grep.

**Ponto 11 (build/test)**: ver nota no ponto 9 — não pude re-executar
`npm run build`/`npm test` com as ferramentas disponíveis a este papel; a
análise estática (nomes de coluna, tipos, imports, shape das interfaces)
não encontrou nada que devesse falhar a compilação, mas o orquestrador deve
confirmar antes do merge se isso ainda não foi feito de forma independente.

Checklist geral do módulo (nomes de tabela/coluna, controle de acesso,
qualidade):
- Nomes de coluna/tabela batem exatamente com as migrations existentes em
  todas as queries novas (`relacionamentos_avaliacao`, `envios_pesquisa`,
  `respostas`, `itens_resposta`, `respostas_clima`, `itens_resposta_clima`,
  `ciclos_avaliacao`, `colaboradores`, `perguntas`) — nenhum campo inventado,
  nenhum multi-tenant introduzido.
- Controle de acesso consistente: única checagem de papel é `garantirPapel(ator,
  [...PAPEIS_COM_ACESSO])` como primeira linha, mesmo padrão do resto do
  projeto; rota protegida por `router.use(autenticar)` em `analise.module.ts`
  (já existente, não recriado).
- Tratamento de erro/validação: `de`/`ate`/`ate < de`/`cicloId` seguem
  exatamente a tabela de erros do plano (1.6), reaproveitando
  `validarDataQuery`/`ehUuidValido`/`buscarCicloOuFalhar` — sem duplicação de
  lógica de autorização/validação.
- Nenhuma migration, variável de ambiente ou entrada em `common/enums.ts`
  nova, como declarado.

### Deveria corrigir

Nenhum achado nesta categoria.

### Sugestão

- `buscarNomesColaboradores(gateParesSubordinado.map(...))` roda depois do
  `Promise.all` das 4 queries independentes, em vez de dentro dele — não é um
  bug (ela realmente depende do resultado do gate, então não poderia entrar
  no mesmo `Promise.all`), mas ela poderia rodar em paralelo com
  `buscarTextosParesSubordinado`/o cálculo de `idsClimaLiberados` em vez de
  sequencialmente antes deles, já que não depende de nenhum dos dois.
  Ganho marginal, não bloqueia.
- `buscarTextosParesSubordinado` monta uma condição `OR` dinâmica com 3
  parâmetros por grupo liberado (`avaliadoId{i}`/`cicloId{i}`/`tipo{i}`); em
  um universo com muitos avaliados liberados no mesmo período, isso pode
  gerar uma query com centenas de parâmetros. Não é um problema de
  anonimização nem um bug funcional — só um ponto de atenção de performance
  para um volume de dados bem maior do que o esperado hoje.

### Conclusão

Sem achados críticos nem achados "Deveria corrigir". Os dois guard rails
críticos (anonimização por limiar e separação identidade/texto para
pares-subordinado) foram implementados exatamente como especificado, com a
mesma verificação por grep pedida na checklist confirmando ausência de
violação. A extração para `analise-comum.ts` preserva o comportamento de
"Visão Geral" por inspeção estática (SQL/lógica idêntica, sem import de
helper privado pela suíte de testes). Única ressalva: verificação de
`npm run build`/`npm test` não foi re-executada por este papel (sem acesso a
Bash) — recomendo confirmação independente antes do merge, mas isso não é
motivo para devolver a task à etapa de desenvolvimento. Pode prosseguir para
`test-engineer`.

## Testes

Suíte nova: `backend/src/modules/analise/analise-avaliacoes.service.spec.ts`
(23 testes, Vitest). `npm run build`/`npm test` confirmados manualmente por
este papel (o code reviewer não tinha tido acesso a `Bash`) — `npm run build`
sem novos erros (único erro remanescente é o `TS2352` pré-existente em
`src/test/fakeRepository.ts`, não relacionado a esta task); `npm test`:
**190/190 passando** (167 pré-existentes + 23 novos), incluindo os 25 testes
de `analise.service.spec.ts` ("Visão Geral") sem nenhuma alteração de
asserção — confirma que a extração para `analise-comum.ts` (passo 1.1) não
teve regressão de comportamento.

### Infraestrutura de teste estendida (não duplicada)

Conforme pedido — reaproveitei e estendi a infraestrutura já existente em vez
de duplicá-la:

- `backend/src/test/fakeQueryBuilder.ts`: o `FakeQueryBuilder` anterior só
  cobria o subconjunto de SQL usado por "Visão Geral" (`SELECT` de coluna
  simples ou `COUNT(*)`/`AVG(EXTRACT(...))` sem `GROUP BY`, `WHERE`/`JOIN` só
  com átomos simples ANDed). "Avaliações" precisa de bem mais: `GROUP BY`
  (`calcularGateParesSubordinado`/`calcularGateClima`), `COUNT(DISTINCT
  rel.avaliador_id)`/`COUNT(rc.id)`, extração jsonb (`item.valor ->>
  'texto'`) em `SELECT` e em `WHERE`, condição de `JOIN` composta (`pergunta.id
  = item.pergunta_id AND pergunta.tipo = :tipoPergunta`), e — o caso mais
  delicado — a condição `OR` dinâmica que `buscarTextosParesSubordinado`
  monta em runtime (`(rel.avaliado_id = :avaliadoId0 AND ... ) OR (...)`,
  uma cláusula por grupo já liberado). Reescrevi o arquivo com um avaliador de
  expressão genérico (`AND`/`OR`/parênteses top-level, com um conjunto fixo de
  átomos reconhecidos) em vez de adicionar mais um caso especial a cada query
  nova — qualquer sintaxe fora do subconjunto suportado ainda lança erro
  explícito (mesma filosofia do arquivo original: falhar alto, nunca devolver
  um resultado silenciosamente errado). Os 25 testes existentes de "Visão
  Geral" continuam passando sem alteração de asserção, confirmando que a
  reescrita não mudou o comportamento do subconjunto já usado por lá.
- `backend/src/test/analiseFixtures.ts`: `construirRepositoriosAnaliseFalsos()`
  ganhou 3 repositórios novos (`itensRespostaRepo`, `itensRespostaClimaRepo`,
  `perguntasRepo`) e 3 fixtures novas (`criarPerguntaFixture`,
  `criarItemRespostaFixture`, `criarItemRespostaClimaFixture`) — os
  repositórios/fixtures já existentes (`ciclosRepo`, `pesquisasRepo`,
  `relacionamentosRepo`, `enviosRepo`, `respostasRepo`, `respostasClimaRepo`,
  `colaboradoresRepo`, além de `criarColaboradorFixture` de
  `test/fixtures.ts`) foram reaproveitados tal qual, sem duplicação.

### Cobertura, mapeada nos 2 guard rails críticos + demais prioridades pedidas

1. **DECISÃO CRÍTICA (anonimato total, sem bypass)**:
   - `admin` e `gestor_rh` recebem resultado **estruturalmente idêntico**
     para o mesmo cenário (grupo abaixo do mínimo + grupo liberado +
     identificada) — comparado com `toEqual` após normalizar só a ordem
     (aleatória, por design) de `textos`.
   - Grupo abaixo do mínimo (`2 < minimoRespostasPares=3`) → `liberado:
     false`, `motivo: 'aguardando_minimo_respondentes'`, **sem** a chave
     `textos` (`not.toHaveProperty('textos')`) e sem o texto vazar em
     `JSON.stringify`, mesmo passando campos extras não documentados no DTO
     (`ignorarLimiar`, `forcarExibir`, `modoTransparencia`, `verComoAdmin`,
     `bypass`) — confirmando que são ignorados, não uma brecha.
   - Limiar **inclusivo**: grupo com `totalRespondentes === minimoNecessario
     === 3` → `liberado: true`.
   - **Sanity check de mutação** (não deixado na suíte, só para validar que o
     teste acima não é vácuo): mutei temporariamente
     `montarGruposParesSubordinado` para sempre incluir `textos` mesmo quando
     bloqueado — o teste acima falhou como esperado
     (`expected { …(9) } to not have property "textos"`); revertida a mutação
     em seguida e suíte voltou a 190/190 verde. Confirma que a asserção
     realmente detecta uma violação real do guard rail, não só documenta a
     intenção.
2. **Identidade nunca junto de texto pares/subordinado**: cenário com grupo
   `pares` LIBERADO (4 respondentes) + 3 itens identificados
   (`autoavaliacao`/`gestor`/`externo`) sobre o mesmo avaliado. Varredura
   recursiva de chaves (`coletarChaves`, mesmo padrão de
   `analise.service.spec.ts`) confirma ausência de `avaliadorId`/
   `avaliador_id`/`avaliadorNome`/`avaliador` em qualquer nível do grupo
   `pares`, e `JSON.stringify` não contém a string `'Avaliador'`. Ao mesmo
   tempo, os 3 itens de `identificadas` **têm** `avaliadorId`+`avaliadorNome`
   preenchidos — confirmando que a ausência é uma escolha para
   `pares`/`subordinado`, não um bug geral de serialização.
3. **`clima_geral` — gate por ciclo inteiro, sem nenhuma atribuição**: 2
   ciclos de clima no mesmo período, um com 2 respostas (bloqueado) e outro
   com 3 (liberado, no limiar). Grupo bloqueado sem `textos`; grupo liberado
   com `textos.length === 3`, cada item restrito a exatamente
   `perguntaId`/`perguntaEnunciado`/`texto` (`Object.keys(...).sort()`) e
   varredura recursiva confirmando ausência de `respondenteId`/
   `respondenteIndice`/`indiceRespondente`/`colaboradorId`/
   `respostaClimaId`/`avaliadorId`.
4. **Corte de período aplicado também ao GATE**: grupo com 2 respondentes
   dentro de um período estreito (janeiro) + 2 respondentes fora dele (março)
   do MESMO avaliado/ciclo/tipo. Filtrado só por janeiro: `totalRespondentes:
   2`, `liberado: false` — confirma que o gate usa a contagem do período, não
   do ciclo inteiro (que teria 4, suficiente). Teste de controle no mesmo
   bloco, com período amplo (jan-mar): `totalRespondentes: 4`, `liberado:
   true`, isolando que a diferença é exclusivamente o corte de período.
5. **Reembaralhamento**: grupo liberado com 5 textos — verifica que o array
   recebido tem o mesmo tamanho e o mesmo conjunto de conteúdo do esperado
   (comparação por array ordenado), sem forçar uma ordem específica (o
   próprio Fisher-Yates é nao-determinístico por design).

Cobertura adicional pedida:
- `de`/`ate` ausente ou malformado, data de calendário inexistente → 422
  `CAMPO_INVALIDO`; `ate < de` → 422 `PERIODO_INVALIDO`; `cicloId`
  malformado → 422 `CAMPO_INVALIDO`; `cicloId` válido mas inexistente → 404
  `CICLO_NAO_ENCONTRADO`.
- `colaborador` barrado com 403 `PAPEL_NAO_AUTORIZADO` **antes de qualquer
  query** (`repos.ciclosRepo.todas()` continua vazio após a chamada rejeitada
  — nenhum `semear()` foi lido).
- "Nenhum ciclo no período" → 200 com os três arrays vazios (não erro).
- `cicloId` opcional restringe o universo a 1 ciclo mesmo havendo outro
  ciclo elegível no período.
- Suíte HTTP (`supertest`, mesmo padrão de `analise.service.spec.ts`/
  `rotas-acesso.spec.ts`): sem token → 401; papel `colaborador` → 403; `admin`/
  `gestor_rh` → 200 com payload idêntico; `de`/`ate` ausentes via querystring
  → 422.

### Achados

Nenhum achado crítico. A suíte confirma, por comportamento observável (não só
por leitura estática do código), que os dois guard rails críticos da task
estão corretos: nenhum bypass do limiar de anonimização para nenhum papel
(incluindo tentativa via campos extra no DTO), e nenhuma identidade de
avaliador vaza junto de texto `pares`/`subordinado`/`clima_geral` em nenhum
cenário testado, incluindo o caso mais sutil (corte de período aplicado
também ao gate, não só aos textos exibidos).
