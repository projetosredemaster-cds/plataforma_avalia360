# Task: Módulo Análise — tela "Nuvem de Palavras" (visualização LISTA) — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória: `.claude/tasks/analise-nuvem-palavras/spec.md`
(lida por completo antes deste plano) — este plano traduz em passos de
implementação as decisões já fechadas nas seções 2–8 da spec, **sem
reabri-las**. Os "detalhes menores" da seção 9 da spec são resolvidos abaixo,
em "Decisões de modelagem".

Módulo **só leitura** — sem entidade própria, sem migration, sem DTOs de
criação/atualização. Estende `backend/src/modules/analise/`, já existente
(Visão Geral + Avaliações + Ranking) — não cria módulo novo. Esta é a
**quarta** tela do módulo; a spec já confirma que nenhuma tabela/coluna nova é
necessária (seção 5).

---

## LEMBRETE DA REGRA MAIS SENSÍVEL DO PROJETO — leia isto antes de qualquer linha de código

Respostas de avaliadores do tipo `pares` e `subordinado` **NUNCA** podem ser
expostas identificadas — apenas agregadas, e só quando atingirem
`ciclos_avaliacao.minimo_respostas_pares`. Nesta feature especificamente
(spec, seção 2):

- Mesmo a saída sendo **frequência de palavras** (não texto corrido), o gate
  se aplica **integralmente, sem exceção "já que é só contagem de
  palavras"**.
- **RH/admin (únicos papéis com acesso) NÃO têm bypass do limiar.** Sem modo
  "transparência total" para ninguém, em nenhuma circunstância.
- **Nunca buscar-depois-filtrar**: para grupos `pares`/`subordinado` abaixo do
  mínimo, o texto **nem é buscado no banco** — mesmo padrão já implementado em
  `buscarTextosParesSubordinado`/`buscarTextosClima` de
  `analise-avaliacoes.service.ts` (reaproveitados aqui, ver decisão 1).
- **`clima_geral`**: gate por ciclo inteiro (mesma granularidade de
  "Avaliações" — `respostas_clima`, não `ciclo_participantes`, mesmo
  raciocínio já documentado em `analise-avaliacoes/task-backend.md`, decisão
  de modelagem 4).
- **A saída não distingue "bloqueado" de "sem dado"**: diferente de
  "Avaliações" (que expõe `liberado: false` por grupo), aqui todos os textos
  liberados de todos os grupos são fundidos numa única lista de palavras
  antes de sair — não existe item de payload por avaliado/grupo. Se nenhum
  grupo estiver liberado, `palavras: []` — não é um estado de erro nem de
  bloqueio explícito (spec, seção 2, último parágrafo).

## GUARD RAIL CRÍTICO Nº 1 — `anonimizar_respostas_pares` nunca é lida por esta feature

- Nenhuma query de `analise-nuvem-palavras.service.ts` nem de
  `analise-comum.ts` seleciona, filtra por, ou faz `CASE`/branch condicional
  sobre `ciclos_avaliacao.anonimizar_respostas_pares`
  (`CicloAvaliacao.anonimizarRespostasPares`). A única coluna de
  `ciclos_avaliacao` lida é `minimo_respostas_pares`
  (`CicloAvaliacao.minimoRespostasPares`, via `buscarMinimosPorCiclo` com
  `select` explícito na forma de objeto — mesma adaptação já registrada nos
  status de "Avaliações"/"Ranking").
- `BuscarNuvemPalavrasDto` tem exatamente 3 campos (`de`, `ate`, `cicloId?`)
  — nenhum `ignorarLimiar`/`forcarExibir`/`modoTransparencia`/`verComoAdmin`
  ou equivalente.
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é a **única** checagem de
  papel dentro de `buscarNuvemPalavras` — nenhum `if (ator.papel ===
  'admin') {...}` em nenhuma função deste service que mude o resultado do
  gate.
- Comentário no código explicando a omissão deliberada é permitido e
  recomendado (mesmo estilo de "Avaliações"/"Ranking").

## GUARD RAIL CRÍTICO Nº 2 — nenhuma identidade chega perto do tokenizador

Mais estrito que "Avaliações" aqui: nesta feature **nenhum** texto de
**nenhum** tipo de relacionamento precisa sair identificado (diferente de
"Avaliações", onde `autoavaliacao`/`gestor`/`externo` saem com nome). A
Nuvem de Palavras só processa o **conteúdo textual**, nunca quem escreveu.

- `buscarTextosIdentificados360` (novo, seção "Decisões de modelagem" nº 3)
  **não faz nenhum `innerJoin` com `Colaborador`** — mais enxuta que
  `buscarIdentificadas360` de "Avaliações" (que junta `Colaborador` duas
  vezes para expor `avaliadoNome`/`avaliadorNome`, propósito que não existe
  aqui). Único `.select()` dessa query é `item.valor ->> 'texto'`.
- No caminho `pares`/`subordinado`, o único uso permitido de
  `avaliador_id`/`rel.avaliador_id` é **dentro de `COUNT(DISTINCT
  rel.avaliador_id)`** (gate compartilhado, `calcularGateParesSubordinado`).
  `buscarTextosParesSubordinado` (reaproveitada de "Avaliações", ver decisão
  1) seleciona `avaliadoId`/`cicloId`/`tipoRelacionamento` só como **chave de
  agrupamento interna** (`Map`), nunca `avaliadorId`/nome — e esta função
  nunca é chamada aqui para grupos que não passaram no gate.
- `clima_geral`: `respostas_clima`/`itens_resposta_clima` não têm nenhuma
  coluna de identidade por design (estrutural) — nada a excluir além do
  texto em si.
- **O array final `palavras` não carrega, em nenhum item, nenhum campo de
  origem** (nem `avaliadoId`, nem `cicloId` por palavra, nem
  `tipoRelacionamento`) — só `{ palavra, frequencia }`. Isso é mais forte que
  qualquer guard rail de projeção de coluna: mesmo que uma coluna de
  identidade fosse acidentalmente trazida de alguma query intermediária, o
  contrato de saída (`PalavraFrequencia`) estruturalmente não tem onde
  colocá-la.
- Checklist para o `backend-codereviewer` (seção "2." abaixo): grep em
  `analise-nuvem-palavras.service.ts` por `avaliadorId`/`avaliador_id`/
  `avaliadoNome`/`avaliadorNome`/`nome_completo` — toda ocorrência fora de um
  comentário é achado crítico. `buscarTextosIdentificados360` não deve
  importar/referenciar a entidade `Colaborador` em nenhuma linha.

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `backend/src/modules/analise/analise-comum.ts` (existente): `PAPEIS_COM_ACESSO`,
  `REGEX_DATA`, `validarDataQuery`, tipo `PeriodoConsulta`,
  `buscarUniversoCiclos`, `classificarPorTipo`,
  `calcularGateParesSubordinado`/`GateParesSubordinadoLinha` (`periodo`
  opcional), `arredondar1`. **Não** tem hoje nenhuma peça de "métricas
  complementares" nem de "gate/textos de clima"/"textos pares-subordinado" —
  essas continuam vivendo em `analise.service.ts` e
  `analise-avaliacoes.service.ts` respectivamente (ver abaixo). Esta task
  extrai as que ganham um segundo consumidor real (decisão 1).
- `backend/src/modules/analise/analise.service.ts` (existente, "Visão
  Geral"): única função exportada `buscarVisaoGeral`. Funções privadas de
  interesse direto desta task (candidatas a extração, decisão 1):
  `contarRespostas360NoPeriodo`, `contarRespostasClimaNoPeriodo`,
  `contarTotal360`, `contarTotalParticipantesClima`, `calcularTempoMedio360`,
  `calcularTempoMedioClima`, tipo `TempoMedioComponente`. Nenhuma delas é
  referenciada em teste por import direto (só via `buscarVisaoGeral`,
  confirmado por grep) — seguro mover.
- `backend/src/modules/analise/analise-avaliacoes.service.ts` (existente,
  "Avaliações"): função exportada `buscarAvaliacoes`. Funções/tipos privados
  de interesse direto desta task (candidatos a extração, decisão 1):
  `TextoAbertoItem` (interface), `calcularGateClima`/`GateClimaLinha`
  (interface local, hoje não exportada), `buscarTextosClima`,
  `buscarTextosParesSubordinado`, `buscarMinimosPorCiclo`. Nenhuma delas é
  importada diretamente por nenhum outro arquivo do repo (confirmado por
  grep — só `buscarAvaliacoes`/HTTP são exercitados pelo teste existente) —
  seguro mover. **`buscarIdentificadas360` NÃO é candidata a reaproveitamento
  literal** — ela junta `Colaborador` duas vezes para expor nomes, propósito
  que esta feature não tem (guard rail crítico nº 2); esta task escreve uma
  versão própria mais enxuta (`buscarTextosIdentificados360`, decisão 3), sem
  tocar a função existente.
- `backend/src/modules/analise/analise-ranking.service.ts` (existente,
  "Ranking" — **ainda sem code review/test-engineer concluídos**, ver nota no
  CLAUDE.md): tem sua **própria cópia privada** de `buscarMinimosPorCiclo`
  (não importa de `analise-comum.ts` — o `backend-developer` de Ranking
  registrou a extração como opcional e optou por não fazer). **Este plano
  delibera não tocar `analise-ranking.service.ts`** para não introduzir
  mudança em um arquivo ainda não revisado por um pipeline que não é o dele —
  ver decisão de modelagem 1 (nota final). Resultado aceito: após esta task,
  `buscarMinimosPorCiclo` existe em 2 lugares (`analise-comum.ts`,
  reaproveitada por "Avaliações" e "Nuvem de Palavras", e
  `analise-ranking.service.ts`, cópia local de "Ranking") — duplicação
  preexistente, não amplificada por esta task.
- `analise.controller.ts`/`analise.module.ts` (existentes): 3 handlers + 3
  rotas hoje (`/visao-geral`, `/avaliacoes`, `/ranking`), todas atrás de
  `router.use(autenticar)`. Esta task adiciona 1 handler + 1 rota
  (`GET /nuvem-palavras`) nos mesmos dois arquivos.
- Entidades relevantes já existentes (nomes de coluna confirmados por leitura
  direta, nenhum inventado — mesmas já documentadas em
  `analise-avaliacoes/task-backend.md`/`analise-ranking/task-backend.md`):
  `RelacionamentoAvaliacao` (`relacionamentos_avaliacao`), `EnvioPesquisa`
  (`envios_pesquisa`), `Resposta` (`respostas`, só entidade), `ItemResposta`
  (`itens_resposta`, `valor` jsonb `{ "texto": "..." }` para `texto_aberto`),
  `RespostaClima` (`respostas_clima`, só entidade, sem FK de identidade),
  `ItemRespostaClima` (`itens_resposta_clima`), `Pergunta` (`perguntas`,
  `tipo`/`enunciado`), `Colaborador` (`colaboradores`) — **não referenciada
  por esta feature, ver guard rail nº 2**, `CicloAvaliacao`
  (`ciclos_avaliacao`, `minimoRespostasPares` lida, `anonimizarRespostasPares`
  nunca lida).
- `backend/src/common/uuid.ts` (`ehUuidValido`), `common/autorizacao.ts`
  (`garantirPapel`), `common/erro-http.ts` (`ErroHttp`),
  `common/http-async.ts` (`asyncHandler`), `middlewares/autenticacao.ts`
  (`autenticar`), `modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`
  (`buscarCicloOuFalhar`, exportada) — todos reaproveitados tal qual.
- Views `respostas_identificadas`/`respostas_pares_agregadas`: **não
  existem** em nenhuma migration (confirmado por leitura) — não usar.
- **Nenhuma migration é necessária** — feature de leitura pura sobre tabelas
  já existentes (spec, seção 5). Se, na prática, algo exigir uma migration,
  isso é desvio da spec e deve ser sinalizado como pergunta ao usuário, não
  implementado.

---

## Decisões de modelagem

### 1. Extração para `analise-comum.ts` — reaproveitamento sem mudança de comportamento

Mover, **sem alterar nenhuma query/valor de retorno**:

**De `analise.service.ts` para `analise-comum.ts`** (exportadas):
`TempoMedioComponente` (tipo), `contarRespostas360NoPeriodo`,
`contarRespostasClimaNoPeriodo`, `contarTotal360`,
`contarTotalParticipantesClima`, `calcularTempoMedio360`,
`calcularTempoMedioClima`. `analise.service.ts` passa a importar essas 7
peças de `./analise-comum` em vez de defini-las localmente.

**De `analise-avaliacoes.service.ts` para `analise-comum.ts`** (exportadas):
`TextoAbertoItem` (interface), `GateClimaLinha` (interface, hoje só local,
vira exportada), `calcularGateClima`, `buscarTextosClima`,
`buscarTextosParesSubordinado`, `buscarMinimosPorCiclo`.
`analise-avaliacoes.service.ts` passa a importar essas 6 peças de
`./analise-comum` em vez de defini-las localmente.

**Novo em `analise-comum.ts`** (só aqui, sem equivalente anterior):
`MetricasComplementares` (interface) e `calcularMetricasComplementares`
(função) — composição das 6 funções acima, usada só por "Nuvem de Palavras"
por enquanto, mas vive em `analise-comum.ts` porque é construída inteiramente
a partir de peças já compartilhadas (ver decisão 4).

**Nota sobre `analise-ranking.service.ts`**: **não é tocado por esta task**
(ver "Estado atual verificado" acima) — sua cópia local de
`buscarMinimosPorCiclo` permanece como está. Não é um requisito desta spec
unificar as duas cópias; se o usuário quiser esse cleanup, é uma task própria
(possivelmente junto do code review pendente de "Ranking"), fora do escopo
aqui.

**Validação obrigatória depois da extração, antes de escrever qualquer linha
de "Nuvem de Palavras"**: rodar `analise.service.spec.ts` e
`analise-avaliacoes.service.spec.ts` (suítes existentes) para confirmar 0
regressão — mesmo procedimento já seguido nas extrações de "Avaliações"
(passo 1.1) e "Ranking" (decisão 1).

### 2. Novo arquivo `analise-nuvem-palavras.service.ts` — só função exportada `buscarNuvemPalavras`

Mesmo módulo `analise/`, arquivo novo dedicado (mesmo motivo já registrado em
"Avaliações"/"Ranking": guard rails diferentes por arquivo, risco de um
`backend-developer`/revisor futuro copiar o padrão errado por proximidade
visual se tudo estivesse no mesmo arquivo — aqui o risco é ainda mais
específico, ver guard rail nº 2 sobre nunca projetar identidade).

### 3. `buscarTextosIdentificados360` — versão enxuta, sem `Colaborador`, sem gate (resolve seção 2/seção 6 item 3 da spec)

```ts
// Identidade NUNCA é necessária aqui (diferente de buscarIdentificadas360 de
// "Avaliações") — só o texto é extraído. autoavaliacao/gestor/externo não
// têm terceiro a proteger (spec seção 2), então nenhum gate se aplica, mas a
// query nem sequer junta Colaborador (guard rail crítico nº 2).
async function buscarTextosIdentificados360(
  ids: string[],
  periodo: PeriodoConsulta,
): Promise<string[]> {
  if (ids.length === 0) return []

  const linhas = await AppDataSource.getRepository(ItemResposta)
    .createQueryBuilder('item')
    .innerJoin(Pergunta, 'pergunta', 'pergunta.id = item.pergunta_id AND pergunta.tipo = :tipoPergunta', {
      tipoPergunta: 'texto_aberto',
    })
    .innerJoin(Resposta, 'resposta', 'resposta.id = item.resposta_id')
    .innerJoin(EnvioPesquisa, 'envio', 'envio.id = resposta.envio_id')
    .innerJoin(RelacionamentoAvaliacao, 'rel', 'rel.id = envio.relacionamento_id')
    .select("item.valor ->> 'texto'", 'texto')
    .where('rel.ciclo_id IN (:...ids)', { ids })
    .andWhere('rel.tipo_relacionamento IN (:...tipos)', { tipos: ['autoavaliacao', 'gestor', 'externo'] })
    .andWhere('resposta.respondido_em::date BETWEEN :de::date AND :ate::date', periodo)
    .andWhere("item.valor ->> 'texto' IS NOT NULL AND item.valor ->> 'texto' <> ''")
    .getRawMany<{ texto: string }>()

  return linhas.map((l) => l.texto)
}
```

### 4. `calcularMetricasComplementares` (novo, em `analise-comum.ts`) — resolve seção 3.4/seção 9 item 1 e 5 da spec

Composição das 6 funções já existentes (decisão 1), mesma fórmula de média
ponderada já usada em `buscarVisaoGeral` para o bloco `geral` de
`tempoMedioResposta` — **não recalcula lógica nova, só reexecuta as mesmas
consultas** para o universo de ciclos específico desta chamada (que pode ter
período/`cicloId` diferentes da última chamada de "Visão Geral" — não há como
reaproveitar um resultado já computado sem cache, e a spec não pede cache).

```ts
export interface MetricasComplementares {
  totalEnvios: number
  totalRespostas: number
  tempoMedioResposta: { horas: number; amostras: number }
}

export async function calcularMetricasComplementares(
  idsAval360: string[],
  idsClima: string[],
  periodo: PeriodoConsulta,
): Promise<MetricasComplementares> {
  const [respostas360, respostasClima, total360, totalClimaParticipantes, tempo360, tempoClima] = await Promise.all([
    contarRespostas360NoPeriodo(idsAval360, periodo),
    contarRespostasClimaNoPeriodo(idsClima, periodo),
    contarTotal360(idsAval360),
    contarTotalParticipantesClima(idsClima),
    calcularTempoMedio360(idsAval360, periodo),
    calcularTempoMedioClima(idsClima, periodo),
  ])

  const amostrasGeral = tempo360.amostras + tempoClima.amostras
  const horasGeral =
    amostrasGeral === 0
      ? 0
      : (tempo360.horas * tempo360.amostras + tempoClima.horas * tempoClima.amostras) / amostrasGeral

  return {
    totalEnvios: total360 + totalClimaParticipantes, // mesmo "totalGeral" (denominador de taxaRespostaMedia) de Visão Geral — renomeado no contrato desta feature, ver decisão 6
    totalRespostas: respostas360 + respostasClima,
    tempoMedioResposta: { horas: arredondar1(horasGeral), amostras: amostrasGeral },
  }
}
```

**Nomes exatos confirmados** (resolve spec seção 9, item 1): `totalEnvios`
mapeia para o que "Visão Geral" chama internamente de `totalGeral`
(`total360 + totalClimaParticipantes`); `totalRespostas` é a soma direta de
`respostas360 + respostasClima`, mesmo campo já público
`VisaoGeralAnalise.totalRespostas`. `taxaRespostaMedia` e
`distribuicaoPorTipo` de "Visão Geral" **não** fazem parte do contrato desta
feature (spec, seção 7 — só `totalEnvios`/`totalRespostas`/
`tempoMedioResposta`) — não computar nem retornar.

### 5. Tokenização — stopwords, tamanho mínimo, acentuação (resolve spec seção 4 e seção 9, itens 2 e 3)

Constantes privadas de `analise-nuvem-palavras.service.ts`:

```ts
/** Piso de caracteres — abaixo disso a palavra é descartada mesmo que não
 * seja stopword (fragmentos/conectores curtos que escapam da lista, ex.
 * "tô", "vc", "né", siglas de 1-2 letras). Confirmado: 3+ caracteres. */
const TAMANHO_MINIMO_PALAVRA = 3

/** Top N por frequência — spec seção 3.5, decisão de produto fechada. */
const LIMITE_PALAVRAS = 50

/**
 * Lista estática de stopwords em português — sem dependência externa (o
 * projeto não usa nenhuma lib de NLP hoje, spec seção 4). Cobre artigos,
 * preposições (+ contrações), conjunções, pronomes (pessoais, possessivos,
 * demonstrativos), formas comuns de ser/estar/ter/haver e advérbios/
 * indefinidos de altíssima frequência em português — não é uma lista
 * linguisticamente exaustiva, é dimensionada para o caso de uso (respostas
 * curtas de pesquisa de avaliação/clima), revisável em iteração futura sem
 * exigir nova spec (é detalhe de implementação, não decisão de produto).
 */
const STOPWORDS_PT = new Set<string>([
  // artigos
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  // preposições e contrações
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'num', 'numa', 'nuns', 'numas', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'até', 'após', 'ante',
  'perante', 'contra', 'desde', 'durante', 'mediante', 'trás',
  // conjunções e conectores
  'e', 'ou', 'mas', 'porém', 'contudo', 'todavia', 'entretanto',
  'portanto', 'logo', 'pois', 'porque', 'que', 'se', 'quando', 'enquanto',
  'embora', 'conforme', 'como', 'nem', 'senão', 'então', 'assim', 'caso',
  // pronomes pessoais, possessivos, demonstrativos
  'eu', 'tu', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas', 'me', 'te',
  'lhe', 'lhes', 'vos', 'mim', 'comigo', 'contigo', 'consigo', 'conosco',
  'convosco', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus',
  'tuas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos',
  'nossas', 'vosso', 'vossa', 'vossos', 'vossas', 'este', 'esta', 'estes',
  'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  // formas comuns de ser / estar / ter / haver
  'é', 'são', 'era', 'eram', 'foi', 'foram', 'ser', 'sendo', 'sido',
  'está', 'estão', 'estava', 'estavam', 'esteve', 'estive', 'estar',
  'estando', 'estado', 'tem', 'têm', 'tinha', 'tinham', 'teve',
  'tiveram', 'ter', 'tendo', 'tido', 'há', 'havia', 'houve',
  // advérbios, indefinidos e outros de altíssima frequência
  'não', 'sim', 'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca',
  'poucos', 'poucas', 'mais', 'menos', 'tão', 'tanto', 'tanta', 'tantos',
  'tantas', 'todo', 'toda', 'todos', 'todas', 'algum', 'alguma',
  'alguns', 'algumas', 'nenhum', 'nenhuma', 'nenhuns', 'nenhumas',
  'outro', 'outra', 'outros', 'outras', 'mesmo', 'mesma', 'mesmos',
  'mesmas', 'próprio', 'própria', 'próprios', 'próprias', 'cada',
  'qualquer', 'quaisquer', 'qual', 'quais', 'quem', 'onde', 'aonde',
  'aqui', 'ali', 'lá', 'cá', 'hoje', 'ontem', 'amanhã', 'agora',
  'sempre', 'nunca', 'talvez', 'apenas', 'só', 'somente', 'também',
  'ainda', 'já', 'bem', 'mal', 'aí',
])
```

**Acentuação (resolve spec seção 9, item 2)**: **não normalizar** nesta v1
— confirma a recomendação da spec. Motivo adicional identificado neste
planejamento: normalizar exigiria uma tabela de equivalência
acentuada↔sem-acento mantida à mão (o projeto não tem lib de
normalização), e o risco apontado pela spec ("otimo" vs "ótimo" fragmentando
a contagem) é mitigado o suficiente pelo fato de que respostas de pesquisa
corporativa tendem a ter ortografia consistente por usuário/organização — se
a fragmentação se mostrar um problema real em uso, é ajuste pontual e
localizado (função `tokenizarTexto` abaixo), não uma mudança de contrato de
API, e pode ser feito sem nova spec.

**Tokenização e pontuação**: usar `\p{L}+` (Unicode property escape, requer
flag `u`) para extrair sequências de letras — isso descarta pontuação,
dígitos e símbolos automaticamente como separadores (ex. "ótimo!" → `ótimo`;
"2026" não gera nenhum token, pois dígitos não são `\p{L}`; "auto-avaliação"
→ dois tokens, `auto` e `avaliação`). `\p{L}` inclui letras acentuadas e `ç`
— não precisa de tratamento especial para português.

```ts
function tokenizarTexto(texto: string): string[] {
  const tokens = texto.toLowerCase().match(/\p{L}+/gu) ?? []
  return tokens.filter((palavra) => palavra.length >= TAMANHO_MINIMO_PALAVRA && !STOPWORDS_PT.has(palavra))
}

function contarFrequencia(textos: string[]): PalavraFrequencia[] {
  const contagem = new Map<string, number>()
  for (const texto of textos) {
    for (const palavra of tokenizarTexto(texto)) {
      contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1)
    }
  }
  return [...contagem.entries()]
    .map(([palavra, frequencia]) => ({ palavra, frequencia }))
    .sort((a, b) => b.frequencia - a.frequencia || a.palavra.localeCompare(b.palavra, 'pt-BR'))
    .slice(0, LIMITE_PALAVRAS)
}
```

Empate de frequência é desempatado por ordem alfabética (`localeCompare` com
locale `pt-BR` para colação correta de acentos) — critério objetivo e
determinístico, sem necessidade de reembaralhamento (diferente de
"Avaliações": a saída aqui é contagem agregada, não texto individual, então
não existe o risco de "posição fixa entre poucos respondentes" que motivou o
Fisher-Yates de "Avaliações" — nenhuma palavra do resultado é atribuível a um
único respondente específico depois de agregada, mesmo que a lista de
`textos` de origem tivesse poucos itens).

### 6. Contrato final do endpoint

`GET /api/analise/nuvem-palavras` — mesmo prefixo `/api/analise`, mesma
proteção (`router.use(autenticar)` em `analise.module.ts`,
`garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha de
`buscarNuvemPalavras`).

Query params (idênticos em validação a "Avaliações", reaproveitando
`validarDataQuery`/`ehUuidValido`/`buscarCicloOuFalhar` de
`analise-comum.ts`/`ciclos-avaliacao.service.ts`):
- `de` (string `YYYY-MM-DD`, **obrigatório**).
- `ate` (string `YYYY-MM-DD`, **obrigatório**).
- `cicloId` (uuid, opcional) — **diferente de "Ranking"**: qualquer tipo de
  ciclo é aceito aqui (avaliação 360 ou clima geral contribuem palavras), não
  há checagem `CICLO_NAO_E_AVALIACAO_360` nesta feature.

Shape final (interfaces exportadas de `analise-nuvem-palavras.service.ts`,
`MetricasComplementares` importada de `analise-comum.ts`):

```ts
export interface PalavraFrequencia {
  palavra: string
  frequencia: number
}

export interface NuvemPalavrasAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  palavras: PalavraFrequencia[]
  metricas: MetricasComplementares
}

export interface BuscarNuvemPalavrasDto {
  de: unknown
  ate: unknown
  cicloId?: unknown
}
```

Quando `idsUniverso` (universo de ciclos do corte de período, mesma função de
"Visão Geral"/"Avaliações") é vazio: retornar imediatamente `{ periodo,
cicloId, palavras: [], metricas: { totalEnvios: 0, totalRespostas: 0,
tempoMedioResposta: { horas: 0, amostras: 0 } } }` — mesmo padrão de payload
zerado já usado por `payloadZerado` de "Visão Geral" (aqui não vale a pena
extrair uma função compartilhada só para este objeto pequeno e de shape
diferente).

Nenhum campo do payload expõe `avaliador_id`, `avaliado_id`, `cicloId` por
palavra, `tipoRelacionamento`, texto original de resposta, nem contagem de
respondentes por avaliado/grupo/tipo de relacionamento — guard rail crítico
nº 2.

### 7. Fluxo completo de `buscarNuvemPalavras`

```ts
export async function buscarNuvemPalavras(
  ator: ColaboradorAutenticado,
  dto: BuscarNuvemPalavrasDto,
): Promise<NuvemPalavrasAnalise> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO]) // única checagem de papel de toda a função

  const de = validarDataQuery(dto.de, 'de')
  const ate = validarDataQuery(dto.ate, 'ate')
  if (ate < de) {
    throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser maior ou igual a "de".')
  }

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
    return {
      periodo,
      cicloId,
      palavras: [],
      metricas: { totalEnvios: 0, totalRespostas: 0, tempoMedioResposta: { horas: 0, amostras: 0 } },
    }
  }

  const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)

  const [textosIdentificados, gateParesSubordinado, gateClima, minimosPorCiclo, metricas] = await Promise.all([
    buscarTextosIdentificados360(idsAval360, periodo),
    calcularGateParesSubordinado(idsAval360, periodo),
    calcularGateClima(idsClima, periodo),
    buscarMinimosPorCiclo(idsUniverso),
    calcularMetricasComplementares(idsAval360, idsClima, periodo),
  ])

  // GATE primeiro, busca de texto só para os grupos JÁ liberados — nunca
  // buscar-depois-filtrar (regra mais sensível do projeto, ver topo deste doc).
  const gruposLiberados360 = gateParesSubordinado.filter(
    (g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3),
  )
  const textosPorGrupo360 = await buscarTextosParesSubordinado(gruposLiberados360, periodo)
  const textosParesSubordinado = [...textosPorGrupo360.values()].flat().map((item) => item.texto)

  const idsClimaLiberados = gateClima
    .filter((g) => g.totalRespondentes >= (minimosPorCiclo.get(g.cicloId) ?? 3))
    .map((g) => g.cicloId)
  const textosPorCicloClima = await buscarTextosClima(idsClimaLiberados, periodo)
  const textosClima = [...textosPorCicloClima.values()].flat().map((item) => item.texto)

  // Fusão deliberada numa única lista (spec seção 3.6) — sem segmentação por
  // pergunta, sem distinção de origem no resultado final (guard rail nº 2).
  const todosOsTextos = [...textosIdentificados, ...textosParesSubordinado, ...textosClima]
  const palavras = contarFrequencia(todosOsTextos)

  return { periodo, cicloId, palavras, metricas }
}
```

Consultas independentes (`buscarTextosIdentificados360`,
`calcularGateParesSubordinado`, `calcularGateClima`, `buscarMinimosPorCiclo`,
`calcularMetricasComplementares`) disparadas em paralelo via `Promise.all` —
só `buscarTextosParesSubordinado`/`buscarTextosClima` dependem do resultado
do gate correspondente (mesmo padrão de "Avaliações").

### 8. Erros

| # | Situação | Status | Código |
|---|---|---|---|
| 1 | Papel do ator não é `admin`/`gestor_rh` | 403 | `PAPEL_NAO_AUTORIZADO` (via `garantirPapel`) |
| 2 | `de` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| 3 | `ate` ausente ou não bate com `YYYY-MM-DD`/data de calendário inválida | 422 | `CAMPO_INVALIDO` |
| 4 | `ate < de` | 422 | `PERIODO_INVALIDO` |
| 5 | `cicloId` presente mas não é um uuid válido | 422 | `CAMPO_INVALIDO` |
| 6 | `cicloId` presente, formato válido, mas ciclo não existe | 404 | `CICLO_NAO_ENCONTRADO` (via `buscarCicloOuFalhar`) |

Nenhum erro novo em `MAPA_CONSTRAINT_PARA_CODIGO` — módulo só leitura, sem
`INSERT`/`UNIQUE` a violar. `palavras: []` nunca é um erro HTTP — sempre
`200` (mesmo princípio de "Avaliações"/"Visão Geral").

### 9. Contrato pensado para reaproveitamento futuro (Bolhas/TV Dash) — não implementar agora

`palavras: PalavraFrequencia[]` já ordenado por `frequencia` decrescente é o
único dado que uma visualização de Bolhas (tamanho proporcional à
frequência) ou um modo TV Dash (rotação da mesma lista) precisariam — nenhum
parâmetro/endpoint novo seria necessário para eles, só uma prop de
apresentação diferente no frontend (spec, seção 7). **Não implementar
nenhum componente/rota relacionado a Bolhas/TV Dash nesta task** (spec,
seção 8) — este item existe só para confirmar que o shape escolhido não
precisa de retrabalho quando essas telas forem pedidas.

---

## Plano — Backend

### 1. backend-developer

Antes de codar: reler o "LEMBRETE DA REGRA MAIS SENSÍVEL" e os dois "GUARD
RAIL CRÍTICO" no topo deste documento, e a skill
`backend-anonimizacao-respostas`. Nenhuma migration é necessária — confirmar
isso no início (não rodar `migration:generate`/`migration:run`).

1. **`analise-comum.ts`** (extração, decisão 1): mover de
   `analise.service.ts` (`TempoMedioComponente`,
   `contarRespostas360NoPeriodo`, `contarRespostasClimaNoPeriodo`,
   `contarTotal360`, `contarTotalParticipantesClima`,
   `calcularTempoMedio360`, `calcularTempoMedioClima`) e de
   `analise-avaliacoes.service.ts` (`TextoAbertoItem`, `GateClimaLinha`,
   `calcularGateClima`, `buscarTextosClima`, `buscarTextosParesSubordinado`,
   `buscarMinimosPorCiclo`) para `analise-comum.ts`, todas exportadas.
   Atualizar os dois arquivos de origem para importar em vez de definir
   localmente. **Nenhuma mudança de comportamento/SQL para o código já
   existente.** Adicionar em `analise-comum.ts` as peças novas
   `MetricasComplementares`/`calcularMetricasComplementares` (decisão 4). Não
   tocar `analise-ranking.service.ts` (ver "Estado atual verificado" —
   duplicação preexistente de `buscarMinimosPorCiclo` ali é aceita, fora de
   escopo). Rodar `analise.service.spec.ts` e
   `analise-avaliacoes.service.spec.ts` logo depois, **antes** de escrever
   qualquer linha de "Nuvem de Palavras", para confirmar 0 regressão.
2. **`analise-nuvem-palavras.service.ts`** (novo): implementar
   `buscarTextosIdentificados360` (decisão 3), `TAMANHO_MINIMO_PALAVRA` /
   `LIMITE_PALAVRAS` / `STOPWORDS_PT` / `tokenizarTexto` / `contarFrequencia`
   (decisão 5), tipos `PalavraFrequencia`/`NuvemPalavrasAnalise`/
   `BuscarNuvemPalavrasDto` (decisão 6) e a função exportada
   `buscarNuvemPalavras`, seguindo literalmente o pseudocódigo da decisão 7.
   Import de `analise-comum.ts` (`PAPEIS_COM_ACESSO`, `validarDataQuery`,
   `buscarUniversoCiclos`, `classificarPorTipo`,
   `calcularGateParesSubordinado`, `calcularGateClima`,
   `buscarTextosParesSubordinado`, `buscarTextosClima`,
   `buscarMinimosPorCiclo`, `calcularMetricasComplementares`,
   `MetricasComplementares`, `PeriodoConsulta`), de `common/autorizacao.ts`
   (`garantirPapel`), `common/erro-http.ts` (`ErroHttp`), `common/uuid.ts`
   (`ehUuidValido`), `ciclos-avaliacao/ciclos-avaliacao.service.ts`
   (`buscarCicloOuFalhar`), e das entidades `ItemResposta`, `Pergunta`,
   `Resposta`, `EnvioPesquisa`, `RelacionamentoAvaliacao` (para
   `buscarTextosIdentificados360`). **Não importar `Colaborador`** neste
   arquivo (guard rail crítico nº 2).
3. **`analise.controller.ts`**: adicionar handler
   `buscarNuvemPalavrasAnalise(req, res)` que lê `de`, `ate`, `cicloId` de
   `req.query` e chama
   `analiseNuvemPalavrasService.buscarNuvemPalavras(req.colaboradorAutenticado!,
   {...})`, `res.status(200).json(resposta)` — mesmo padrão de
   `buscarAvaliacoesAnalise`.
4. **`analise.module.ts`**: adicionar `router.get('/nuvem-palavras',
   asyncHandler(buscarNuvemPalavrasAnalise))`, logo abaixo de `/ranking`, sob
   o mesmo `router.use(autenticar)`. `app.ts` **não muda** — `/api/analise`
   já está montado.
5. **Wiring final**: nenhuma migration, nenhuma variável de ambiente nova,
   nenhuma entrada nova em `common/enums.ts`, nenhum código novo em
   `MAPA_CONSTRAINT_PARA_CODIGO`. `npm run build` (tsc) e `npm test`
   (Vitest) devem rodar sem novos erros introduzidos por esta task, e as
   suítes existentes (`analise.service.spec.ts`,
   `analise-avaliacoes.service.spec.ts`, `analise-ranking.service.spec.ts`
   se existir) devem continuar 100% passando após a extração do passo 1.
6. **Atenção ao regex `\p{L}` (decisão 5)**: confirmar que o `target`/`lib`
   do `tsconfig.json` do projeto suporta Unicode property escapes (`flag
   u`, ES2018+) antes de assumir — se não suportar, é bloqueador a reportar
   antes de prosseguir, não uma decisão a contornar por conta própria (ex.
   trocando silenciosamente por uma classe de caracteres acentuados
   enumerada à mão, que seria menos robusta e divergiria deste plano).

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **`anonimizar_respostas_pares` (guard rail crítico nº 1)**: grep em
   `analise-nuvem-palavras.service.ts` e em `analise-comum.ts` por
   `anonimizarRespostasPares`/`anonimizar_respostas_pares` — qualquer
   ocorrência fora de um comentário explicativo é achado **crítico
   obrigatório**. Confirmar que `buscarMinimosPorCiclo` (agora em
   `analise-comum.ts`) usa `select` explícito na forma de objeto.
2. **Nenhuma identidade chega ao tokenizador (guard rail crítico nº 2)**:
   grep em `analise-nuvem-palavras.service.ts` por
   `avaliadorId`/`avaliador_id`/`avaliadoNome`/`avaliadorNome`/
   `nome_completo`/`Colaborador` — qualquer ocorrência é achado **crítico
   obrigatório** (este arquivo não deve ter nenhum motivo legítimo para
   tocar essas strings/entidade, diferente de "Avaliações"). Confirmar que
   `buscarTextosIdentificados360` não faz `innerJoin`/`leftJoin` com
   `Colaborador`. Confirmar que `PalavraFrequencia`/`NuvemPalavrasAnalise`
   não têm nenhum campo de origem (`cicloId`/`avaliadoId`/
   `tipoRelacionamento`) por palavra.
3. **Nunca buscar-depois-filtrar**: confirmar que
   `buscarTextosParesSubordinado`/`buscarTextosClima` só são chamadas com a
   lista **já filtrada** de grupos/ciclos liberados
   (`gruposLiberados360`/`idsClimaLiberados`), nunca com a lista bruta do
   gate seguida de um filtro em JS **depois** da busca de texto.
4. **Extração sem regressão (decisão 1)**: confirmar que
   `analise.service.spec.ts` e `analise-avaliacoes.service.spec.ts`
   continuam 100% passando sem nenhuma alteração de asserção (só de import,
   se algum teste importar um helper que mudou de arquivo). Confirmar que
   `analise-ranking.service.ts` **não foi alterado** por esta task (fora de
   escopo, ver "Estado atual verificado").
5. **Tokenização (decisão 5)**: confirmar `TAMANHO_MINIMO_PALAVRA = 3`,
   `LIMITE_PALAVRAS = 50`, `STOPWORDS_PT` como `Set` (não array — evita
   `O(n)` por lookup), regex `\p{L}+` com flag `u`, lowercase aplicado antes
   do match, resultado final sempre `.slice(0, LIMITE_PALAVRAS)` depois do
   `.sort()` (nunca o inverso). Confirmar que nenhuma normalização de
   acentuação foi introduzida (decisão explícita de não normalizar nesta
   v1) — se o `backend-developer` decidir por conta própria normalizar
   acentuação, é achado a reportar (mudança de comportamento não
   documentada neste plano, mesmo que pareça uma melhoria).
6. **Métricas complementares (decisão 4)**: confirmar que
   `calcularMetricasComplementares` não duplica a fórmula de média ponderada
   já existente em `buscarVisaoGeral` com valores diferentes (mesma
   expressão matemática, copiada exatamente) — divergência aqui seria bug
   silencioso (os dois endpoints mostrando números diferentes para o mesmo
   universo de ciclos).
7. **Contrato do endpoint**: confirmar `GET /api/analise/nuvem-palavras`,
   `cicloId` aceita qualquer tipo de ciclo (sem checagem
   `CICLO_NAO_E_AVALIACAO_360`, diferente de "Ranking" — checar que esse
   erro **não** foi copiado por engano do arquivo de Ranking), payload
   zerado (`palavras: []`, `metricas` toda zerada) quando `idsUniverso` é
   vazio, nunca lançado como erro.

---

## Status

### 1. backend-developer — CONCLUÍDO

Implementado literalmente conforme o plano acima, sem reabrir nenhuma
decisão.

**Arquivos alterados:**
- `backend/src/modules/analise/analise-comum.ts` — extração (decisão 1): de
  `analise.service.ts` migraram `TempoMedioComponente`,
  `contarRespostas360NoPeriodo`, `contarRespostasClimaNoPeriodo`,
  `contarTotal360`, `contarTotalParticipantesClima`, `calcularTempoMedio360`,
  `calcularTempoMedioClima`; de `analise-avaliacoes.service.ts` migraram
  `TextoAbertoItem`, `GateClimaLinha`, `calcularGateClima`,
  `buscarTextosClima`, `buscarTextosParesSubordinado`,
  `buscarMinimosPorCiclo` — todas exportadas, sem nenhuma mudança de
  SQL/comportamento (copy-paste literal). Adicionadas as peças novas
  `MetricasComplementares`/`calcularMetricasComplementares` (decisão 4).
- `backend/src/modules/analise/analise.service.ts` — passou a importar as 7
  peças de `./analise-comum` em vez de defini-las localmente; manteve local
  só `contarConcluidosClimaNoPeriodo` (não extraída, sem segundo consumidor).
- `backend/src/modules/analise/analise-avaliacoes.service.ts` — passou a
  importar as 6 peças de `./analise-comum`; `buscarIdentificadas360` (com
  join em `Colaborador`) permaneceu intocada, como determinado (não é
  candidata a reaproveitamento).
- `backend/src/modules/analise/analise-nuvem-palavras.service.ts` (novo) —
  `buscarTextosIdentificados360` (sem join em `Colaborador`), constantes
  `TAMANHO_MINIMO_PALAVRA`/`LIMITE_PALAVRAS`/`STOPWORDS_PT`,
  `tokenizarTexto`/`contarFrequencia`, tipos `PalavraFrequencia`/
  `NuvemPalavrasAnalise`/`BuscarNuvemPalavrasDto`, e `buscarNuvemPalavras`
  (única função exportada) seguindo literalmente o pseudocódigo da decisão 7
  — gate primeiro, busca de texto só para grupos liberados, fusão numa
  única lista antes da tokenização.
- `backend/src/modules/analise/analise.controller.ts` — novo handler
  `buscarNuvemPalavrasAnalise`.
- `backend/src/modules/analise/analise.module.ts` — nova rota
  `GET /nuvem-palavras`, sob o `router.use(autenticar)` já existente.
- `backend/src/modules/analise/analise-ranking.service.ts` — **não tocado**
  (confirmado, fora de escopo).

**Migrations**: nenhuma criada/rodada — feature de leitura pura, confirmado
antes de codar (nenhum `migration:generate`/`migration:run` executado).

**Regex `\p{L}` (item 6 do plano)**: `tsconfig.json` do backend usa
`"target": "esnext"` — Unicode property escapes com flag `u` totalmente
suportados, sem bloqueio.

**Guard rails**: confirmado por grep que `anonimizarRespostasPares`/
`anonimizar_respostas_pares` só aparecem em comentários explicativos (nunca
em código) em `analise-nuvem-palavras.service.ts`/`analise-comum.ts`; que
`avaliadorId`/`avaliador_id`/`avaliadoNome`/`avaliadorNome`/`nome_completo`/
`Colaborador` só aparecem em comentários/tipo `ColaboradorAutenticado` em
`analise-nuvem-palavras.service.ts` (nenhum join com a entidade
`Colaborador`, nenhuma identidade projetada).

**Testes**: `npx vitest run src/modules/analise` → 2 suítes, 51 testes, 100%
passando (`analise.service.spec.ts`: 25, `analise-avaliacoes.service.spec.ts`:
26) — confirma 0 regressão da extração antes de escrever "Nuvem de
Palavras". `npm test` (suíte completa) → 9 arquivos, 216 testes, 100%
passando, incluindo `rotas-acesso.spec.ts` (46 testes). `npm run build` (tsc)
→ sem erros novos; o único erro reportado (`src/test/fakeRepository.ts:46`,
`TS2352`) é pré-existente e não relacionado a esta task (confirmado
comparando build antes/depois das mudanças via `git stash`).

Nenhum teste automatizado foi escrito para o endpoint novo nesta etapa —
isso é responsabilidade do `test-engineer` (etapa posterior do pipeline),
não deste passo.

Pendente: `backend-codereviewer` (etapa 2) e `test-engineer`.

## Revisão

Revisão feita lendo por completo `spec.md`, este `task-backend.md` (incluindo
"Status") e o conteúdo atual de `analise-comum.ts`,
`analise-nuvem-palavras.service.ts`, `analise.service.ts`,
`analise-avaliacoes.service.ts`, `analise.controller.ts` e
`analise.module.ts`.

### Sem achados críticos

Checklist de foco especial, um a um:

1. **Gate antes da busca de texto**: confirmado em `buscarNuvemPalavras`
   (`analise-nuvem-palavras.service.ts`, linhas ~210–230). `textosIdentificados`
   (sem gate, correto — `autoavaliacao`/`gestor`/`externo` não têm terceiro a
   proteger) sai no `Promise.all` inicial junto com `gateParesSubordinado`/
   `gateClima`/`minimosPorCiclo` (que só calculam contagens, nunca buscam
   texto). Só depois disso `gruposLiberados360`/`idsClimaLiberados` são
   filtrados e só então `buscarTextosParesSubordinado`/`buscarTextosClima`
   são chamadas — exatamente com a lista já filtrada, nunca com a lista bruta
   do gate seguida de filtro pós-busca. Sem buscar-depois-filtrar.
2. **`garantirPapel` como primeira linha**: `buscarNuvemPalavras` chama
   `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira instrução,
   única checagem de papel do arquivo. `buscarTextosIdentificados360` (a
   única outra função do arquivo, privada) não checa papel — correto, não é
   chamada diretamente pelo controller.
3. **Rota nunca pública**: `GET /nuvem-palavras` está registrada em
   `analise.module.ts` abaixo de `router.use(autenticar)`, mesmo router das
   outras 3 rotas de análise. `app.ts` não foi tocado.
4. **`buscarTextosIdentificados360` sem identidade**: não importa `Colaborador`,
   não faz `innerJoin`/`leftJoin` com ela, único `.select()` é
   `item.valor ->> 'texto'`. Grep confirmou que `avaliadorId`/`avaliador_id`/
   `avaliadoNome`/`avaliadorNome`/`nome_completo`/`Colaborador` só aparecem em
   comentários explicativos ou no tipo `ColaboradorAutenticado` (identidade do
   ator autenticado, não do respondente) — nenhuma ocorrência em código
   funcional.
5. **Extração mecânica**: as 7 peças movidas de `analise.service.ts`
   (`TempoMedioComponente` + 6 funções) e as 6 peças movidas de
   `analise-avaliacoes.service.ts` (`TextoAbertoItem`, `GateClimaLinha`,
   `calcularGateClima`, `buscarTextosClima`, `buscarTextosParesSubordinado`,
   `buscarMinimosPorCiclo`) para `analise-comum.ts` preservam exatamente a
   mesma SQL/lógica — comparado linha a linha com o corpo de cada função nos
   dois arquivos de origem, nenhuma divergência. Os dois arquivos de origem
   agora só importam essas peças; `analise.service.ts` manteve local
   `contarConcluidosClimaNoPeriodo` (não extraída, sem segundo consumidor,
   correto) e `payloadZerado`; `analise-avaliacoes.service.ts` manteve
   `buscarIdentificadas360` intocada (com join duplo em `Colaborador`), como
   determinado. `analise-ranking.service.ts` não foi tocado — confirmado por
   grep, ainda tem sua própria cópia privada de `buscarMinimosPorCiclo`
   (linha 241), duplicação preexistente aceita e não amplificada.
6. **Payload final**: `PalavraFrequencia` só tem `{ palavra, frequencia }`;
   `NuvemPalavrasAnalise` só tem `{ periodo, cicloId, palavras, metricas }`.
   Nenhum campo de origem por palavra, nenhuma contagem bruta de
   respondentes exposta (`totalRespondentes`/`minimoNecessario`/`liberado`
   do gate nunca chegam ao objeto de retorno, diferente de "Avaliações").
7. **Tokenização/stopwords**: `TAMANHO_MINIMO_PALAVRA = 3`,
   `LIMITE_PALAVRAS = 50`, `STOPWORDS_PT` como `Set`, regex `/\p{L}+/gu` com
   `.toLowerCase()` aplicado antes do `.match()`, `.slice(0, LIMITE_PALAVRAS)`
   aplicado depois do `.sort()` (nunca antes) — ordem correta. Nenhuma
   normalização de acentuação foi introduzida, confirmando a decisão fechada
   de não normalizar nesta v1.
8. **Convenções gerais**: `ErroHttp` usado para os dois erros de validação
   (`CAMPO_INVALIDO`/`PERIODO_INVALIDO`), `asyncHandler` envolvendo o handler
   novo em `analise.module.ts`, `buscarNuvemPalavrasAnalise` seguindo
   literalmente o padrão dos outros 3 handlers de `analise.controller.ts`,
   nenhuma dependência de `synchronize: true`, nenhuma migration criada,
   nomes de coluna/tabela batendo com as migrations existentes (mesmas
   entidades já usadas por "Avaliações"). `calcularMetricasComplementares`
   reproduz exatamente a mesma fórmula de média ponderada de
   `tempoMedioResposta.geral` já usada em `buscarVisaoGeral` (comparação
   lado a lado confirma expressão idêntica) — sem risco de divergência
   silenciosa entre os dois endpoints.

### Deveria corrigir

Nenhum.

### Sugestão

- `minimosPorCiclo.get(g.cicloId) ?? 3` aparece como fallback hardcoded em
  `analise-nuvem-palavras.service.ts` (2 ocorrências) além de já existir em
  `analise-avaliacoes.service.ts` (2 ocorrências) e `analise-ranking.service.ts`
  — o valor `3` é o default de `ciclos_avaliacao.minimo_respostas_pares` na
  migration, então não é um bug, mas é mais uma cópia do mesmo "magic number"
  espalhado por 3 arquivos. Não bloqueia esta task (segue o padrão já
  estabelecido pelas features anteriores, sem amplificar o problema
  isoladamente), mas seria um bom candidato a uma constante compartilhada
  (`MINIMO_RESPOSTAS_PARES_PADRAO`, em `analise-comum.ts`) numa limpeza
  futura, junto do cleanup de `buscarMinimosPorCiclo` já registrado como
  dívida técnica na "Nota sobre `analise-ranking.service.ts`" da seção
  "Decisões de modelagem".

### Conclusão

Implementação fiel ao plano, ponto a ponto, sem nenhum desvio identificado.
A ordem gate-antes-de-buscar-texto está correta, nenhuma identidade de
avaliador/avaliado chega ao tokenizador ou ao payload final, a rota está
protegida por `autenticar` + `garantirPapel(ator, ['admin', 'gestor_rh'])`
sem bypass, e a extração para `analise-comum.ts` não alterou nenhuma
query/comportamento existente. Liberado para seguir ao `test-engineer`.

## Testes

Suíte nova: `backend/src/modules/analise/analise-nuvem-palavras.service.spec.ts`
(29 testes, mesmo padrão/fixtures de `analise-avaliacoes.service.spec.ts` —
`construirRepositoriosAnaliseFalsos`, `criarCicloAvaliacaoFixture`,
`criarPesquisaFixture`, `criarRelacionamentoFixture`,
`criarItemRespostaFixture`, `criarItemRespostaClimaFixture`,
`criarColaboradorFixture`/`configurarGetUserPorToken` para o bloco HTTP).
Cobertura:

1. **Controle de acesso (`garantirPapel`)**: `colaborador` → 403
   `PAPEL_NAO_AUTORIZADO` antes de qualquer query (`ciclosRepo` permanece
   vazio); `admin`/`gestor_rh` recebem exatamente o mesmo payload zerado sem
   ciclos seedados.
2. **Validação de `de`/`ate`/`cicloId`**: ausente/mal formatado/data de
   calendário inexistente → 422 `CAMPO_INVALIDO`; `ate < de` → 422
   `PERIODO_INVALIDO`; `cicloId` não-uuid → 422 `CAMPO_INVALIDO`; `cicloId`
   uuid válido mas inexistente → 404 `CICLO_NAO_ENCONTRADO`.
3. **Gate pares/subordinado — nunca buscar-depois-filtrar (prioridade
   máxima)**: grupo `pares` com 2 respondentes (abaixo do mínimo de 3) e uma
   palavra-marcadora exclusiva (`xicara123`) → a palavra **nunca** aparece em
   `palavras` nem em `JSON.stringify(resultado)`, mesmo com campos de
   tentativa de bypass (`ignorarLimiar`/`forcarExibir`/`modoTransparencia`/
   `verComoAdmin`) injetados no DTO — `palavras` fica `[]`. Grupo `pares` no
   limiar exato (3 === mínimo) e grupo `subordinado` acima do mínimo (5)
   contribuem normalmente (frequência bate com o número de respostas
   seedadas).
4. **Gate clima_geral por ciclo inteiro**: ciclo com 2 respostas (abaixo do
   mínimo) → palavra-marcadora (`climabloqueadomarcador`) nunca aparece;
   ciclo com 3 respostas (no mínimo) → palavra contribui com a frequência
   esperada.
5. **`autoavaliacao`/`gestor`/`externo` sempre liberados (1:1)**:
   parametrizado nos 3 tipos, cada um com uma única resposta — a palavra
   identificadora contribui mesmo sem atingir nenhum "mínimo de
   respondentes" (não há gate para esses tipos).
6. **Payload nunca expõe identidade/origem**: cada item de `palavras` tem
   exatamente as chaves `{ palavra, frequencia }` (checado via
   `Object.keys(item).sort()`); varredura recursiva de chaves do payload
   inteiro confirma ausência de `avaliadorId`/`avaliador_id`/`avaliadoId`/
   `avaliadorNome`/`avaliadoNome`/`tipoRelacionamento`/`texto`; shape de topo
   do payload é exatamente `{ cicloId, metricas, palavras, periodo }`.
7. **Tokenização**: lowercase ("Feedback"/"feedback" contam juntos);
   stopwords (`de`, `a`, `o`, `que`, `para`, `com`, `essa`) removidas sem
   remover palavras de conteúdo (`pessoa`, `comunicacao`); palavras < 3
   caracteres excluídas mesmo não sendo stopword (`vc`, `tá`, `ok`, `né`);
   pontuação removida ("ótimo!"/"ótimo," contam juntos); ordenação
   decrescente + corte em exatamente 50 confirmados com 51 palavras únicas
   de frequência crescente (a de menor frequência é cortada, a de maior fica
   em primeiro).
8. **`cicloId` opcional restringe o universo**: com dois ciclos elegíveis no
   período, filtrar por `cicloId` exclui a palavra-marcadora do outro ciclo.
9. **Métricas complementares**: `totalRespostas`/`totalEnvios`/
   `tempoMedioResposta` refletem o universo sem nenhuma quebra por
   avaliador/avaliado/grupo; shape de `metricas` confirmado.
10. **HTTP (`GET /api/analise/nuvem-palavras`)**: sem token → 401
    `TOKEN_AUSENTE`; token `colaborador` → 403 `PAPEL_NAO_AUTORIZADO`; token
    `admin`/`gestor_rh` → 200 com payload idêntico entre os dois papéis;
    query sem `de`/`ate` → 422 `CAMPO_INVALIDO`.

**Resultado**: `npx vitest run src/modules/analise/analise-nuvem-palavras.service.spec.ts`
→ 29/29 passando. Suíte completa (`npm test`) → 10 arquivos, **245 testes,
100% passando** (216 pré-existentes + 29 novos), incluindo
`analise.service.spec.ts` e `analise-avaliacoes.service.spec.ts` sem
regressão. `npm run build` (tsc) → nenhum erro novo; o único erro reportado
(`src/test/fakeRepository.ts:46`, `TS2352`) é pré-existente, já documentado
no "Status" acima como não relacionado a esta task.

Nenhum achado crítico de anonimização/controle de acesso — todos os testes
de prioridade máxima (gate pares/subordinado, gate clima, ausência de
identidade no payload) passaram de primeira, sem necessidade de reportar bug
ao `backend-developer`.

**Frontend**: não foi possível escrever um teste automatizado para
`AnaliseNuvemPalavrasPage`/`ListaFrequenciaPalavras` — `frontend/` não tem
nenhuma infraestrutura de teste configurada hoje (sem `vitest`, sem
`@testing-library/react`, sem `jsdom`, nenhum arquivo `*.test.tsx` em todo o
projeto, `package.json` sem script `test`). Introduzir esse tooling do zero
está fora do escopo desta rodada (não é um "padrão já usado no projeto" a
seguir, seria decisão de infraestrutura nova) — sinalizado aqui para decisão
do usuário/orquestrador se testes de frontend passarem a ser um requisito
recorrente.
