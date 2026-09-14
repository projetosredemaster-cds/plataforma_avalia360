# Spec: Módulo Análise — tela "Resultados por Pergunta"

## 1. Resumo do pedido

Implementar a quinta tela do módulo Análise (`apps/api`/`apps/web` na
nomenclatura dos agentes = `backend/`/`frontend/` neste repo), chamada
"Resultados por Pergunta", acessível pelo menu lateral em **Análises →
Quantitativa** (mesmo submenu de "Visão Geral" e "Ranking" — os três tipos de
pergunta cobertos aqui, `likert`/`matriz`/`caixa_selecao`, são todos
numéricos/estruturados, nenhum é texto livre, então não se enquadra em
"Qualitativa" junto de "Avaliações"/"Nuvem de Palavras").

Diferente de "Ranking" (que calcula uma **média** agregada por avaliado/
equipe), esta tela mostra **distribuição** — contagem de respostas por
nível (likert/matriz) ou por opção marcada (caixa_selecao) — por **pergunta
individual**, sem seletor de pesquisa/pergunta dedicado: o filtro já
existente de período (`de`/`ate`, obrigatório) + `cicloId` (opcional,
múltiplos ciclos combináveis — mesmo padrão de "Visão Geral"/"Avaliações"/
"Nuvem de Palavras", diferente do `cicloId` único obrigatório de "Ranking")
já define o universo; a resposta lista todas as perguntas elegíveis desse
universo, cada uma com sua distribuição, e o frontend agrupa/rola a lista
(seção 7). `texto_aberto` (já coberto por "Avaliações"/"Nuvem de Palavras")
e `pessoa` (reservado para uma futura tela "Análise de Menções") ficam
**fora de escopo** — confirmado, não reabrir.

`caixa_selecao` já é um tipo de pergunta real e implementado no código (5º
tipo, adicionado depois dos 4 originais do MVP — `backend/src/common/
enums.ts:23-35`, comentário explícito "adicionado depois dos 4 originais");
não é uma reintrodução de tipo fora de escopo, é reaproveitamento de um tipo
já existente ponta a ponta (construtor de pesquisa, coleta pública).

Esta spec foi precedida por uma rodada de esclarecimento já concluída nesta
sessão. Todas as decisões da seção 4 estão fechadas pelo usuário — não devem
ser reperguntadas. As decisões A–E (pedidas explicitamente ao agente de spec
para investigar e resolver) estão registradas nas seções 2, 3 e 6, com
justificativa técnica.

## 2. REGRA DE CÁLCULO DA DISTRIBUIÇÃO (a mais importante da feature — decisões A e B)

Esta seção recebe destaque próprio, fora do meio de uma lista de itens,
pelo mesmo motivo que a seção 2 de `analise-ranking/spec.md`: é a peça de
lógica mais fácil de simplificar incorretamente numa etapa posterior do
pipeline se não for repetida aqui.

### 2.1 Decisão A — desenho do gate aplicado à distribuição agregada

> **Mesmo padrão de duas fases já usado em `comporMediasPorAvaliado`
> (`analise-ranking.service.ts`): agregar por avaliado+tipo primeiro (sem
> nunca selecionar `avaliador_id`), aplicar o gate depois, somar ao total
> final só o que passou.** A diferença para Ranking é só o que se acumula
> em cada célula do mapa: em vez de `{ soma, qtd }` para calcular uma
> média, é um contador por nível/opção (`Map<nivel|opcao, contagem>`) para
> formar uma distribuição.

**Para `avaliacao_360`** (avaliado + `ciclo_id` + `tipo_relacionamento`
vindos de `relacionamentos_avaliacao`, mesma cadeia de JOIN já usada em
`agregarLikertPorAvaliado`/`agregarMatrizPorAvaliado` do Ranking):

1. Query agregada por **pergunta + avaliado + tipo_relacionamento + nível**
   (ou + opção, ou + competência + nível para matriz — ver 2.2), com
   `COUNT(*)` — nunca seleciona `avaliador_id`. Exemplo (likert):
   ```sql
   SELECT pergunta.id AS "perguntaId", rel.avaliado_id AS "avaliadoId",
          rel.ciclo_id AS "cicloId", rel.tipo_relacionamento AS "tipoRelacionamento",
          (item.valor ->> 'nota')::int AS "nivel", COUNT(*) AS "contagem"
   FROM itens_resposta item
   JOIN perguntas pergunta ON pergunta.id = item.pergunta_id AND pergunta.tipo = 'likert'
   JOIN respostas resposta ON resposta.id = item.resposta_id
   JOIN envios_pesquisa envio ON envio.id = resposta.envio_id
   JOIN relacionamentos_avaliacao rel ON rel.id = envio.relacionamento_id
   WHERE rel.ciclo_id IN (...)
     AND resposta.respondido_em::date BETWEEN :de::date AND :ate::date
   GROUP BY pergunta.id, rel.avaliado_id, rel.ciclo_id, rel.tipo_relacionamento, "nivel"
   ```
   Note que esta query roda com filtro de **período**, não de ciclo único —
   mesmo padrão de `analise-avaliacoes.service.ts`, não o `cicloId` único
   de Ranking (decisão 3, fechada pelo usuário).
2. `calcularGateParesSubordinado(idsAval360, periodo)` (já existe em
   `analise-comum.ts`, chamado **com** período — mesma chamada que
   "Avaliações" já faz, diferente da chamada sem período do Ranking) +
   `buscarMinimosPorCiclo(idsUniverso)`.
3. Composição em memória: para cada linha agregada (pergunta+avaliado+tipo+
   nível+contagem), `autoavaliacao`/`gestor`/`externo` sempre elegíveis;
   `pares`/`subordinado` elegíveis só se
   `gate.get(avaliadoId|cicloId|tipoRelacionamento) >= minimo`. Linhas
   elegíveis incrementam o contador final `distribuicaoPorPergunta[perguntaId][tipoRelacionamento][nivel] += contagem`
   — nunca por avaliado individual no resultado final (o avaliado só existe
   como chave intermediária do gate, nunca aparece no payload desta tela,
   diferente de Ranking, que expõe `avaliadoId`/`avaliadoNome` de propósito).
   Linhas não elegíveis são descartadas do total, mas o **tipo em si** ainda
   precisa aparecer no resultado com `liberado: false` (ver seção 3) —
   controlado separadamente rastreando quais combinações
   `(perguntaId, tipoRelacionamento)` existiram na query bruta, independente
   de terem passado no gate.

**Para `clima_geral`**: `respostas_clima`/`itens_resposta_clima` são
estruturalmente anônimas (sem `avaliador_id`/`avaliado_id` — nenhuma FK de
identidade existe nessas tabelas), então não há necessidade de uma fase de
"agregar por avaliado" — o gate já é por **ciclo inteiro**
(`calcularGateClima`, decisão 6, fechada). Mesmo padrão gate-primeiro-depois-
busca já usado em "Avaliações"/"Nuvem de Palavras" para clima: calcular
`calcularGateClima(idsClima, periodo)`, filtrar `idsClimaLiberados` (>=
mínimo), **só então** rodar a query de distribuição restrita a
`rc.ciclo_id IN idsClimaLiberados` — nunca buscar contagem de um ciclo
bloqueado e descartar depois.

**Por que este desenho é o correto e não uma simplificação incorreta**: a
alternativa mais simples (aplicar o mínimo sobre a soma total de
respondentes da pergunta, ignorando de qual avaliado cada resposta pares/
subordinado veio) romperia a regra central do projeto — o mínimo é **por
avaliado + ciclo + tipo**, não um piso único para a pergunta inteira (mesmo
princípio já estabelecido em Ranking/Avaliações: um avaliado com poucos
respondentes pares não pode ter sua fatia "disfarçada" dentro do total
agregado de outros avaliados com mais respondentes pares).

### 2.2 Decisão B — matriz: distribuição SEPARADA por competência (não agregada)

**Decisão**: cada competência de uma pergunta `matriz` mantém sua **própria**
contagem por nível, dentro da mesma pergunta — não soma todas as
competências da pergunta numa única distribuição.

**Justificativa** (Ranking agrega todas as competências numa única média
por propósito diferente — perder granularidade por competência é aceitável
quando o objetivo é UM score comparável por avaliado/equipe; aqui o
objetivo é justamente "onde estão as notas altas/baixas", e agregar
competências heterogêneas escondendo exatamente essa informação
contradiria o propósito da tela. Ex.: "nível 5 apareceu muito em
'Comunicação' mas pouco em 'Proatividade'" fica invisível se as duas
competências forem somadas numa única contagem por nível — essa é
provavelmente a pergunta mais comum que um gestor/RH faria de uma tela de
distribuição.). A query de matriz usa a mesma expansão `CROSS JOIN LATERAL
jsonb_each_text(item.valor -> 'notas')` já usada em `agregarMatrizPorAvaliado`
do Ranking (`AppDataSource.query()` com SQL parametrizado posicional —
QueryBuilder do TypeORM não suporta LATERAL com alias de tabela-função),
mas com `GROUP BY` adicional por `competencia_id` (chave do jsonb) além de
pergunta/avaliado/tipo/nível. Nomes de competência resolvidos depois via
`Competencia` (`backend/src/modules/competencias/competencia.entity.ts`,
campo `nome`), `WHERE id IN (...)` sobre os `competencia_id` distintos
retornados.

Para `caixa_selecao`, a expansão equivalente é `jsonb_array_elements_text
(item.valor -> 'opcoes')` (é um **array** jsonb, não um objeto — diferente
de `matriz`, que usa `jsonb_each_text` sobre um objeto `{competenciaId:
nota}`). Uma nuance registrada explicitamente: **uma resposta `caixa_selecao`
pode marcar múltiplas opções** (`valor.opcoes: string[]`), então a soma das
contagens por opção de uma pergunta pode ser **maior** que o número de
respondentes daquela fatia — diferente de `likert`/`matriz`, onde cada
resposta contribui exatamente 1 unidade por nível. Isso é uma propriedade
aceitável do tipo de dado, não um bug a corrigir, e é relevante para a
seção 3 (mitiga, não agrava, o risco de inferência de contagem exata de
respondentes a partir da distribuição).

## 3. REGRA DE ANONIMIZAÇÃO (a mais sensível do projeto — seção dedicada, decisão C)

> RH/admin (únicos papéis com acesso a esta tela) **NÃO têm bypass** do
> limiar `minimo_respostas_pares`/gate de clima. Mesma regra repetida em
> toda tela do módulo `analise` até aqui — repetida de novo porque cada
> feature nova é um ponto de risco independente de reintrodução do bypass
> por inferência.

- `ciclos_avaliacao.anonimizar_respostas_pares` **nunca é lida** por esta
  feature, em nenhuma query, em nenhuma decisão de exibição — mesma decisão
  já fechada em todas as telas anteriores do módulo. A única coluna de
  `ciclos_avaliacao` tocada é `minimo_respostas_pares`, via
  `buscarMinimosPorCiclo` (`analise-comum.ts`, `select` explícito).
- **Decisão C, resolvida com o raciocínio pedido explicitamente registrado**:
  o payload desta tela **nunca expõe nenhum `COUNT` exato de respondentes**
  pares/subordinado (nem por avaliado, nem por ciclo/tipo agregado) — só um
  booleano `liberado` + `motivo?: 'aguardando_minimo_respondentes'` quando
  bloqueado, **sem** os campos `totalRespondentes`/`minimoNecessario` que
  `GrupoParesSubordinado`/`GrupoClimaGeral` de "Avaliações" expõem. Esta
  tela segue o padrão **mais estrito** de Ranking
  (`paresInsuficiente`/`subordinadoInsuficiente`, sem nenhum número), não o
  padrão mais permissivo de Avaliações — por isso o componente de frontend
  a reaproveitar é `RankingDadosInsuficientesTag` (já sem nenhuma prop
  numérica), não `EstadoAguardandoMinimo` (que exige `totalRespondentes`/
  `minimoNecessario` como prop e não é reaproveitável aqui).
- **Raciocínio explícito sobre por que a contagem por nível/opção em si NÃO
  é o mesmo tipo de dado sensível que contagem de respondentes** (pedido
  explícito do item C, registrado sem assumir silenciosamente): a
  distribuição exposta (`{ nivel: 3, contagem: 7 }`) é uma contagem
  agregada de **respostas de conteúdo** (quantas vezes aquele nível foi
  escolhido, por todos os respondentes elegíveis somados), não uma
  contagem de **identidades/quantidade de respondentes**. A API nunca
  seleciona `avaliador_id`, nem projeta quantos avaliadores distintos
  compõem aquele total.
  - **Limitação registrada, não uma falha nova**: para `likert`/`matriz`
    (cada resposta = exatamente 1 unidade por nível), a **soma** de todas
    as contagens de uma pergunta+avaliado+tipo é matematicamente igual (ou
    muito próxima, se a pergunta não for obrigatória) ao número de
    respondentes daquela fatia específica — ou seja, um usuário
    suficientemente atento **poderia** somar a distribuição exposta e
    inferir uma aproximação do número de respondentes. Esta mesma
    propriedade **já existe hoje** em "Avaliações" (o número de textos
    exibidos num grupo liberado já revela quantos responderam, e ali o
    `totalRespondentes` nem é escondido) — não é um risco introduzido por
    esta feature, é o mesmo nível de exposição já aceito pelo projeto para
    dado agregado pós-gate. Para `caixa_selecao`, essa equivalência **não**
    vale (multiseleção, seção 2.2) — a soma das opções pode superestimar o
    número de respondentes, o que é estritamente mais seguro.
  - Esta limitação não exige nova mitigação nesta versão (ex. supressão de
    contagens muito pequenas) — registrar e aceitar, mesmo espírito da nota
    de Ranking sobre `dadosInsuficientes` não ter distinção visual entre
    "sem dado" e "bloqueado" na v1.
- Nenhuma query desta feature seleciona `avaliador_id` (nem qualquer coluna
  que identifique o avaliador) fora de `COUNT(DISTINCT avaliador_id)` dentro
  de `calcularGateParesSubordinado` — reforçar com comentário no código do
  service, mesmo padrão já usado em `analise-ranking.service.ts`/
  `analise-nuvem-palavras.service.ts`.
- `respostas_clima`/`itens_resposta_clima` continuam estruturalmente
  anônimas (sem FK de identidade) — nenhuma query desta feature tenta
  reidentificar um respondente de clima por nenhum meio indireto.

## 4. Decisões de produto já fechadas pelo usuário (não reabrir)

1. Tipos de pergunta cobertos: `likert`, `matriz` (competências) e
   `caixa_selecao`. Fora de escopo: `texto_aberto` (Avaliações/Nuvem de
   Palavras) e `pessoa` (futura "Análise de Menções").
2. Mostra **distribuição** (contagem por nível/opção), não média. Likert:
   contagem por nível (1..`niveis`). Matriz: contagem por nível, por
   competência (decisão B, seção 2.2). Caixa_selecao: contagem de quantas
   vezes cada opção da lista foi marcada.
3. Filtros: período (`de`/`ate`, obrigatório) + `cicloId` (opcional,
   múltiplos ciclos combináveis) — mesmo padrão de Visão Geral/Avaliações/
   Nuvem de Palavras, diferente de Ranking (`cicloId` único obrigatório).
4. Disponível em **ambos** `avaliacao_360` e `clima_geral` — nenhum dos 3
   tipos de pergunta é bloqueado em `clima_geral`.
5. Para `avaliacao_360`: distribuição **separada por tipo de
   relacionamento** (`autoavaliacao`, `gestor`, `pares`, `subordinado`).
   `autoavaliacao`/`gestor` sempre incluídos sem gate; `pares`/`subordinado`
   só incluídos se `COUNT(DISTINCT avaliador_id)` para aquele avaliado+
   ciclo+tipo atingir `minimo_respostas_pares` — gate aplicado **por
   avaliado**, cada avaliado só contribui sua fatia de pares/subordinado ao
   agregado se atingir o mínimo (ver desenho técnico completo, decisão A,
   seção 2.1). `externo` tratado com o mesmo critério de relação 1:1 sem
   gate já usado em "Avaliações"/"Ranking" (sem terceiro a proteger) —
   incluído automaticamente na mesma lista de tipos sempre-elegíveis.
6. Para `clima_geral`: gate por **ciclo inteiro** (mesma granularidade de
   Avaliações/Nuvem de Palavras) — sem separação por tipo de
   relacionamento.
7. RH/admin não têm bypass do gate. `anonimizar_respostas_pares` nunca é
   lida.
8. Formato de exibição desta primeira rodada: **tabela simples de
   contagens** (mesmo padrão de "Nuvem de Palavras — Lista") — gráfico fica
   para rodada futura.

## 5. Decisão D — granularidade de saída (sem seletor de pesquisa/pergunta)

**Fato verificado no código**: uma `pergunta` pertence a exatamente 1
`pagina_pesquisa`, que pertence a exatamente 1 `pesquisa`, que pertence a
exatamente 1 `ciclo_id` (`pesquisas.cicloId`, coluna sem `UNIQUE` do lado
"vários por ciclo", mas cada linha de `pesquisas` só aponta para 1 ciclo).
Ou seja, dentro do universo de ciclos definido pelo filtro de período (+
`cicloId` opcional), cada `perguntaId` aparece em **exatamente um** ciclo —
não há risco de dupla contagem ao combinar múltiplos ciclos no mesmo
filtro.

**Como "Avaliações" resolve o mesmo problema** ("múltiplas perguntas de
múltiplas pesquisas/ciclos no mesmo filtro de período"): não usa nenhum
seletor — cada linha do array `identificadas` já carrega `perguntaId`/
`perguntaEnunciado`/`cicloId`/`nomeCiclo`, e o frontend agrupa
visualmente (Accordion por ciclo, hoje). "Nuvem de Palavras" resolve
diferente — funde tudo numa lista única sem segmentar por pergunta
(decisão de produto explícita daquela feature, não aplicável aqui, já que
esta tela precisa justamente da granularidade por pergunta).

**Decisão adotada**: seguir o padrão de "Avaliações", não introduzir
seletor novo. A API retorna um **array plano** por classificação
(`avaliacao360: ResultadoPergunta360[]` / `climaGeral: ResultadoPerguntaClima[]`),
cada item já carregando `perguntaId`, `perguntaEnunciado`, `cicloId`,
`nomeCiclo` — todas as perguntas elegíveis (`likert`/`matriz`/
`caixa_selecao`) do universo de ciclos filtrado aparecem de uma vez, sem
paginação (mesmo padrão de "não paginar nesta v1" já registrado em
`analise-ranking/spec.md`, seção 9, item 5). O frontend agrupa por ciclo
(Accordion, mesmo padrão visual de "Avaliações") e aplica a convenção já
estabelecida no `CLAUDE.md` raiz para listas de tamanho variável
(`overflow-y: auto` + `maxHeight` ~500–600px) em vez de paginação ou
seletor — esta tela tem potencial de crescer mais que as anteriores
(perguntas × tipos de relacionamento × níveis/competências/opções), então
a rolagem interna é mais necessária aqui do que em qualquer tela anterior
do módulo, mas não é uma decisão de produto nova, é aplicação direta de
uma convenção já registrada no repositório.

## 6. Decisão E — endpoint e service novos

- Rota: `GET /api/analise/resultados-pergunta?de=&ate=&cicloId=` — mesmos
  nomes de query param de "Avaliações"/"Nuvem de Palavras"
  (`validarDataQuery`/`ehUuidValido`/`buscarCicloOuFalhar` reaproveitados de
  `analise-comum.ts`/`ciclos-avaliacao.service.ts`).
- Novo arquivo `backend/src/modules/analise/analise-resultados-pergunta.service.ts`
  (mesmo padrão de 1 arquivo de service dedicado por tela dentro do módulo
  `analise` já existente — não cria módulo novo).
- Função exportada única `buscarResultadosPergunta(ator, dto)`, com
  `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira linha, sem
  bypass (mesmo padrão das 4 telas anteriores).
- Novo handler `buscarResultadosPerguntaAnalise` em `analise.controller.ts`,
  nova linha `router.get('/resultados-pergunta', ...)` em
  `analise.module.ts` (mesmo padrão das 4 rotas existentes, já sob
  `router.use(autenticar)`).
- Reaproveita de `analise-comum.ts`: `PAPEIS_COM_ACESSO`,
  `validarDataQuery`, `buscarUniversoCiclos`, `classificarPorTipo`,
  `calcularGateParesSubordinado` (**com** período), `calcularGateClima`,
  `buscarMinimosPorCiclo`. Nenhuma função nova precisa ser extraída para
  `analise-comum.ts` — as três queries de agregação por nível/opção
  (seção 2) são específicas desta tela, sem segundo consumidor até aqui, e
  ficam privadas em `analise-resultados-pergunta.service.ts` (mesmo
  critério já usado para `agregarLikertPorAvaliado`/`agregarMatrizPorAvaliado`
  do Ranking, que também não foram extraídas por não terem segundo
  consumidor).
- Sem entidade própria, sem migration — leitura pura sobre entidades já
  existentes (`ItemResposta`, `ItemRespostaClima`, `Resposta`,
  `RespostaClima`, `EnvioPesquisa`, `RelacionamentoAvaliacao`, `Pergunta`,
  `PerguntaCompetencia`/expansão via `jsonb_each_text`, `Competencia`,
  `CicloAvaliacao`).

## 7. Modelo de dados envolvido (leitura only)

- `itens_resposta.valor` jsonb: `likert` = `{ "nota": n }`; `matriz` =
  `{ "notas": { "<competenciaId>": n } }`; `caixa_selecao` =
  `{ "opcoes": ["...", "..."] }` (array de strings, **múltipla seleção
  possível** — seção 2.2). Mesmo shape usado em `itens_resposta_clima.valor`
  (mesma função de validação `validarValorResposta` em
  `coleta-respostas-publica.service.ts` serve os dois fluxos).
- `perguntas.configuracao` jsonb: `{ niveis, rotulos }` para
  `likert`/`matriz` (níveis 2..10, não fixo em 5 — mesmo fato já registrado
  em `analise-ranking/spec.md` seção 5.1); `{ opcoes: string[] }` para
  `caixa_selecao` (`perguntas.service.ts:129-143`, validado não-vazio).
- `perguntas_competencias` (`pergunta_id`, `competencia_id`) não é
  necessária para resolver nomes de competência da matriz — os
  `competencia_id` já vêm como chave do jsonb `notas` expandido via
  `jsonb_each_text`; `perguntas_competencias` só seria necessária para
  listar competências configuradas SEM nenhuma resposta ainda (fora de
  escopo — esta tela só mostra distribuição de respostas existentes, não
  um "molde vazio" da pergunta).
- `relacionamentos_avaliacao` (`id`, `ciclo_id`, `avaliador_id`,
  `avaliado_id`, `tipo_relacionamento`) → `envios_pesquisa.relacionamento_id`
  → `respostas.envio_id` (UNIQUE) → `itens_resposta` — mesma cadeia já
  usada por Ranking/Avaliações para `avaliacao_360`.
- `respostas_clima` (`id`, `ciclo_id`, `respondido_em`, sem nenhuma FK de
  identidade) → `itens_resposta_clima.resposta_clima_id` — mesma cadeia já
  usada por Avaliações/Nuvem de Palavras para `clima_geral`.
- `ciclos_avaliacao.minimo_respostas_pares`: smallint, default 3. Coluna
  irmã `anonimizar_respostas_pares` existe mas **nunca é lida** (seção 3).
- Nenhuma tabela nova, nenhuma coluna nova, **nenhuma migration
  necessária** — feature de leitura pura, mesmo padrão das 4 telas
  anteriores.

## 8. Recorte backend vs frontend

### Backend (`backend/`)

- Estende o módulo já existente `backend/src/modules/analise/`.
- Estrutura de cálculo (três blocos de query agregada — likert, matriz,
  caixa_selecao — × dois universos — avaliação 360, clima — mais o gate,
  mais a composição em JS, ver seção 2):
  1. Para `avaliacao_360`: 3 queries agregadas (likert/matriz/
     caixa_selecao), cada uma `GROUP BY pergunta_id, avaliado_id, ciclo_id,
     tipo_relacionamento, <nivel|competencia_id+nivel|opcao>`, `COUNT(*)`,
     filtradas por `rel.ciclo_id IN idsAval360 AND resposta.respondido_em
     BETWEEN periodo`. Matriz e caixa_selecao via `AppDataSource.query()`
     com SQL parametrizado posicional (LATERAL não suportado pelo
     QueryBuilder, mesmo padrão de `agregarMatrizPorAvaliado` do Ranking).
  2. `calcularGateParesSubordinado(idsAval360, periodo)` +
     `buscarMinimosPorCiclo(idsUniverso)`.
  3. Composição em JS: para cada linha agregada, elegibilidade igual à
     seção 2.1; contador final por
     `perguntaId → tipoRelacionamento → nivel|opcao`, mais um registro
     separado (Set) de quais `(perguntaId, tipoRelacionamento)` existiram
     na query bruta (para montar entradas `liberado: false` sem
     distribuição, quando bloqueadas).
  4. Zero-fill: para cada pergunta liberada, preencher todos os níveis
     `1..niveis` (lidos de `perguntas.configuracao`, query leve separada
     `SELECT id, configuracao FROM perguntas WHERE id IN (...)`) ou todas
     as `opcoes` configuradas (mesmo campo) com contagem 0 quando ausentes
     — tabela sempre mostra a escala completa, não só os níveis/opções que
     tiveram pelo menos 1 resposta.
  5. Nomes de competência: `SELECT id, nome FROM competencias WHERE id IN
     (...)` sobre os `competencia_id` distintos retornados pela expansão
     LATERAL de matriz.
  6. Para `clima_geral`: `calcularGateClima(idsClima, periodo)` primeiro,
     filtrar `idsClimaLiberados`, **só então** rodar as 3 queries agregadas
     equivalentes restritas a `rc.ciclo_id IN idsClimaLiberados` (sem
     `avaliado_id`/`tipo_relacionamento` — tabela estruturalmente
     anônima). Ciclos de clima não liberados aparecem no array
     `climaGeral` com `liberado: false`, sem distribuição.
- Guard rail de anonimização (seção 3) reforçado com comentário no código
  do service, mesmo padrão já existente nas 4 telas anteriores.
- Sem reembaralhamento (Fisher-Yates) — não se aplica, mesma razão já
  registrada em Ranking: esta tela expõe contagens agregadas, não textos
  individuais, nenhuma ordem de exibição identifica um respondente.

### Frontend (`frontend/`)

- Nova página `AnaliseResultadosPerguntaPage` (mesmo esqueleto de
  `AnaliseAvaliacoesPage`: `useSearchParams`, período + `SeletorCiclo`,
  `Skeleton`, `Alert`), dentro do mesmo grupo protegido de rotas
  (`RotaProtegida papeis={['admin', 'gestor_rh']}`, `App.tsx`). Rota nova,
  ex. `/analise/resultados-pergunta` (path exato a confirmar no
  planejamento).
- Menu em `PainelAdminLayout.tsx`: grupo "Análises" → submenu
  "Quantitativa" (`GRUPOS`, linha ~71 hoje — já contém "Visão Geral" e
  "Ranking"; "Resultados por Pergunta" entra como terceira opção nesse
  mesmo submenu).
- Reaproveitar: `SeletorCiclo` (filtro de ciclo opcional, mesmo componente
  de Visão Geral/Avaliações/Nuvem de Palavras — **não** o tratamento
  "obrigatório" que Ranking dá ao componente), `rotulosRelacionamento.ts`
  (rótulos de `autoavaliacao`/`gestor`/`pares`/`subordinado`/`externo`),
  `RankingDadosInsuficientesTag` (Chip sem números, para tipos/ciclos
  bloqueados — **não** `EstadoAguardandoMinimo`, que exige
  `totalRespondentes`/`minimoNecessario` como prop, incompatível com a
  decisão C desta tela).
- Novos componentes recomendados (nomes a confirmar no planejamento):
  `DistribuicaoNivelTabela` (linhas = nível, colunas ou linha única de
  contagem — likert e, dentro de matriz, uma instância por competência) e
  `DistribuicaoOpcaoTabela` (linhas = opção configurada, contagem) — ambos
  tabela MUI simples (decisão de produto 8, sem gráfico nesta rodada).
- Lista de perguntas com `overflow-y: auto` + `maxHeight` (convenção já
  registrada no `CLAUDE.md` raiz para listas de tamanho variável, seção 5)
  — agrupada por ciclo (Accordion, mesmo padrão visual de
  `AnaliseAvaliacoesPage`), dentro de cada ciclo uma sub-lista por pergunta.
- Nenhuma regra de agregação/anonimização calculada no frontend — tudo
  pré-computado pela API (contagens já zero-preenchidas, `liberado`/
  `motivo` já decididos pelo backend).

## 9. Contrato de API sugerido (ponto de partida, não mandato — nomes exatos a confirmar no planejamento-backend)

`GET /api/analise/resultados-pergunta?de=YYYY-MM-DD&ate=YYYY-MM-DD&cicloId=`

- `de`/`ate` obrigatórios (`validarDataQuery`, mesmo erro `CAMPO_INVALIDO`/
  `PERIODO_INVALIDO` já usado nas 3 telas de período). `cicloId` opcional
  (uuid, `404 CICLO_NAO_ENCONTRADO` se não existir).
- 200 (esboço de shape):
  ```json
  {
    "periodo": { "de": "2026-01-01", "ate": "2026-06-30" },
    "cicloId": null,
    "avaliacao360": [
      {
        "perguntaId": "uuid",
        "perguntaEnunciado": "O quanto você concorda que...",
        "tipo": "likert",
        "cicloId": "uuid",
        "nomeCiclo": "Ciclo 2026.1",
        "niveis": 5,
        "porTipoRelacionamento": [
          { "tipoRelacionamento": "autoavaliacao", "liberado": true,
            "distribuicao": [ { "nivel": 1, "contagem": 0 }, { "nivel": 2, "contagem": 1 }, "..." ] },
          { "tipoRelacionamento": "gestor", "liberado": true, "distribuicao": [ "..." ] },
          { "tipoRelacionamento": "pares", "liberado": false, "motivo": "aguardando_minimo_respondentes" },
          { "tipoRelacionamento": "subordinado", "liberado": true, "distribuicao": [ "..." ] }
        ]
      },
      {
        "perguntaId": "uuid",
        "perguntaEnunciado": "Avalie as competências abaixo",
        "tipo": "matriz",
        "cicloId": "uuid",
        "nomeCiclo": "Ciclo 2026.1",
        "niveis": 5,
        "competencias": [
          { "competenciaId": "uuid", "competenciaNome": "Comunicação",
            "porTipoRelacionamento": [ "..." ] },
          { "competenciaId": "uuid", "competenciaNome": "Proatividade",
            "porTipoRelacionamento": [ "..." ] }
        ]
      },
      {
        "perguntaId": "uuid",
        "perguntaEnunciado": "Quais benefícios você mais utiliza?",
        "tipo": "caixa_selecao",
        "cicloId": "uuid",
        "nomeCiclo": "Ciclo 2026.1",
        "opcoesDisponiveis": ["Vale-refeição", "Plano de saúde", "Home office"],
        "porTipoRelacionamento": [ "..." ]
      }
    ],
    "climaGeral": [
      {
        "perguntaId": "uuid",
        "perguntaEnunciado": "O quanto você está satisfeito com...",
        "tipo": "likert",
        "cicloId": "uuid",
        "nomeCiclo": "Pesquisa de Clima 2026.1",
        "niveis": 5,
        "liberado": true,
        "distribuicao": [ "..." ]
      }
    ]
  }
  ```
- Nenhum campo de nenhum item expõe `avaliador_id`, `avaliadoId`,
  `totalRespondentes`/contagem exata de respondentes ou membros — só
  `liberado` (booleano) + `motivo` (enum) quando bloqueado (guard rail da
  seção 3).
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira linha do
  service, sem bypass de papel para nenhum dos dois gates.

## 10. Detalhes menores de implementação a validar no planejamento (não bloqueiam, recomendação registrada para cada um)

1. **Nome exato do arquivo/service** — recomendação já registrada na seção
   6 (`analise-resultados-pergunta.service.ts`).
2. **Ordenação da lista de perguntas** dentro de cada array — recomendação:
   `cicloId` (ou `nomeCiclo`) e depois `pergunta.ordem` (ordem natural
   dentro da página da pesquisa), sem critério de "mais respostas primeiro"
   ou qualquer ordenação que dependa de contagem.
3. **Tratamento de pergunta sem nenhuma resposta no período** (ex. pergunta
   existe mas ninguém respondeu ainda) — recomendação: não aparece no
   array (mesmo critério já usado pelas queries `GROUP BY` das telas
   anteriores, que só retornam grupos com pelo menos 1 linha agregada) —
   diferente de "aparecer com distribuição zerada", que só se aplica a
   NÍVEIS/OPÇÕES dentro de uma pergunta que já teve pelo menos 1 resposta
   elegível (zero-fill da seção 8, item 4).
4. **Ícone do menu lateral** para "Resultados por Pergunta" — detalhe
   visual, a definir no planejamento-frontend.
5. **Nome exato dos componentes de tabela de distribuição** — recomendação
   já registrada na seção 8 (`DistribuicaoNivelTabela`/
   `DistribuicaoOpcaoTabela`), path exato dentro de
   `frontend/src/components/analise/` a confirmar no planejamento.
