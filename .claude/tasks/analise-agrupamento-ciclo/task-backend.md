# Task: Módulo Análise — incluir `nomeCiclo` em `GET /api/analise/avaliacoes` — Backend

Extensão pequena e fechada sobre a feature já implementada e revisada em
`.claude/tasks/analise-avaliacoes/` (`backend/src/modules/analise/`). Não
reabre nenhuma decisão daquela task — só adiciona um campo de leitura
(`nomeCiclo`) que não existe hoje. Demanda 100% backend
(`backend/`, equivalente a `apps/api` na nomenclatura dos agentes/skills —
usar sempre os caminhos reais `backend/**` neste plano). Não toca
`frontend/`.

## Estado atual verificado (leitura direta de `analise-avaliacoes.service.ts`, antes deste plano)

Confirmado por leitura completa do arquivo hoje — a premissa do pedido bate
com o código:

- `AvaliacaoIdentificada` (bloco `identificadas`, tipos `autoavaliacao` /
  `gestor` / `externo`) já tem `cicloId: string` (linha ~52). **Falta**
  `nomeCiclo`.
- `GrupoParesSubordinado` (bloco `paresSubordinado`, tipos `pares` /
  `subordinado`) já tem `cicloId: string` (linha ~63), presente tanto no
  estado `liberado: true` quanto `liberado: false` (o campo é montado antes
  do `if` de liberação em `montarGruposParesSubordinado`). **Falta**
  `nomeCiclo`.
- `GrupoClimaGeral` (bloco `climaGeral`, sem relacionamento — estruturalmente
  anônimo) já tem `cicloId: string` (linha ~75), mesmo padrão do item
  anterior — presente em liberado e bloqueado. **Falta** `nomeCiclo`.
- Não existe hoje, em nenhum ponto do arquivo, nenhuma leitura de
  `CicloAvaliacao.nome` — a única leitura de `ciclos_avaliacao` é
  `buscarMinimosPorCiclo`, com `select: { id: true, minimoRespostasPares:
  true }` explícito (guard rail crítico nº 1 da task original: nunca trazer
  `anonimizarRespostasPares`).
- `analise.controller.ts`/`analise.module.ts`: nenhuma mudança necessária —
  o contrato do endpoint (método, path, query params, papéis) não muda, só o
  corpo da resposta ganha um campo a mais em itens/grupos já existentes.

Se, ao codar, o `backend-developer` encontrar qualquer divergência em relação
a este estado (ex.: um dos três já tiver `nomeCiclo`, ou `cicloId` estiver
ausente em algum deles), **parar e registrar a divergência na seção
"Status" deste arquivo antes de prosseguir**, em vez de seguir o plano como
se a divergência não existisse.

## GUARD RAIL — nenhuma mudança de gate/anonimização (repetido aqui, não é opcional)

- `cicloId`/`nomeCiclo` não identificam avaliador nem avaliado — é a única
  razão pela qual esta adição é permitida sem nova spec/confirmação. Isso
  **não** abre precedente para adicionar mais campos de identidade nesta
  task.
- **Nenhuma mudança de comportamento** em `calcularGateParesSubordinado`,
  `calcularGateClima`, `buscarTextosParesSubordinado`, `buscarTextosClima`,
  `embaralhar`, ou no par `liberado: false` / `motivo:
  'aguardando_minimo_respondentes'`. Essas funções continuam com a mesma
  assinatura e o mesmo corpo de query — a única mudança nelas é **zero**.
- `buscarMinimosPorCiclo` continua existindo tal como está hoje (`select: {
  id: true, minimoRespostasPares: true }`) — **não** adicionar `nome: true`
  a esse `select` (ver decisão de modelagem abaixo sobre por que uma função
  nova é preferível a estender essa). Se o `backend-developer` avaliar que
  estender `buscarMinimosPorCiclo` é melhor mesmo assim, o `select` dessa
  função, estendido, deve continuar **sem** `anonimizarRespostasPares` —
  listar explicitamente `id`, `minimoRespostasPares` e `nome`, nunca um
  `find` sem `select`.
- Nenhuma migration, nenhuma mudança de rota, nenhuma mudança de
  `garantirPapel`.

## Decisão de modelagem — como resolver `nomeCiclo`

**Função nova e aditiva, não extensão de `buscarMinimosPorCiclo`:**
`buscarNomesCiclos(ids)`, mesmo padrão já usado por `buscarNomesColaboradores`
no mesmo arquivo (linhas ~353-361):

```ts
// select explícito — NUNCA trazer anonimizarRespostasPares (mesmo guard rail
// de buscarMinimosPorCiclo). Função aditiva e independente: cicloId/nomeCiclo
// não são dado sensível, mas a leitura de ciclos_avaliacao continua restrita
// a colunas explicitamente inofensivas.
async function buscarNomesCiclos(ids: string[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(ids)]
  if (idsUnicos.length === 0) return new Map()
  const ciclos = await AppDataSource.getRepository(CicloAvaliacao).find({
    where: { id: In(idsUnicos) },
    select: { id: true, nome: true },
  })
  return new Map(ciclos.map((c) => [c.id, c.nome]))
}
```

Motivo de não estender `buscarMinimosPorCiclo` em vez de criar uma função
nova: `buscarMinimosPorCiclo` já é citada nominalmente como guard rail
crítico nº 1 na task original e no code review já aprovado daquela task
(grep esperado por `select: { id: true, minimoRespostasPares: true }`
exatamente naquela forma). Mudar sua assinatura/retorno (de `Map<string,
number>` para algo como `Map<string, { minimo: number; nome: string }>`)
obrigaria a tocar em todos os call-sites que hoje fazem
`minimosPorCiclo.get(cicloId) ?? 3`, aumentando a superfície de diff em uma
função que já passou por revisão crítica, para um ganho pequeno (uma query a
menos). Uma função nova e paralela, chamada no mesmo `Promise.all`, é a
mudança estritamente menor e mais fácil de revisar linha a linha.

`buscarNomesCiclos` é chamada com `idsUniverso` (o mesmo array já usado por
`buscarMinimosPorCiclo`, cobre tanto ciclos de avaliação 360 quanto de
clima), dentro do `Promise.all` já existente em `buscarAvaliacoes`:

```ts
const [identificadas, gateParesSubordinado, gateClima, minimosPorCiclo, nomesCiclos] = await Promise.all([
  buscarIdentificadas360(idsAval360, periodo),
  calcularGateParesSubordinado(idsAval360, periodo),
  calcularGateClima(idsClima, periodo),
  buscarMinimosPorCiclo(idsUniverso),
  buscarNomesCiclos(idsUniverso),
])
```

### Preenchimento em memória (não em query) nos três locais

1. **`identificadas` (`buscarIdentificadas360`)**: a query em si **não muda**
   (nenhum join novo a `ciclos_avaliacao` — a query já projeta identidade de
   avaliador/avaliado para `autoavaliacao`/`gestor`/`externo`, não há guard
   rail de anonimização em jogo aqui, mas ainda assim mantemos a regra geral
   do pedido de preencher em memória, não via join, para os três locais por
   consistência e para não tocar em queries já revisadas). `buscarIdentificadas360`
   passa a retornar `Omit<AvaliacaoIdentificada, 'nomeCiclo'>[]`
   internamente; em `buscarAvaliacoes`, mapear o resultado:
   ```ts
   const identificadasComNome = identificadas.map((item) => ({
     ...item,
     nomeCiclo: nomesCiclos.get(item.cicloId) ?? '',
   }))
   ```
2. **`paresSubordinado` (`montarGruposParesSubordinado`)**: adicionar
   parâmetro `nomesCiclos: Map<string, string>` à função; incluir
   `nomeCiclo: nomesCiclos.get(g.cicloId) ?? ''` no objeto base retornado
   (fora do `...(liberado ? {...} : {...})`, já que `cicloId`/`nomeCiclo` são
   dado de grupo, presente em ambos os estados — **não** condicionar
   `nomeCiclo` a `liberado`).
3. **`climaGeral` (`montarGruposClima`)**: mesmo tratamento — parâmetro
   `nomesCiclos: Map<string, string>`, `nomeCiclo: nomesCiclos.get(g.cicloId)
   ?? ''` no objeto base, presente em liberado e bloqueado.

### Interfaces exportadas — adicionar `nomeCiclo: string`

```ts
export interface AvaliacaoIdentificada {
  tipoRelacionamento: 'autoavaliacao' | 'gestor' | 'externo'
  cicloId: string
  nomeCiclo: string          // NOVO
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
  nomeCiclo: string          // NOVO
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
  nomeCiclo: string          // NOVO
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}
```

Posicionar `nomeCiclo` logo após `cicloId` em cada interface (só legibilidade,
não obrigatório para o TS, mas mantém o campo novo próximo do campo
relacionado no JSON de saída).

### Caso de universo vazio — sem mudança

O `return` antecipado quando `idsUniverso.length === 0` (`{ periodo, cicloId,
avaliacao360: { identificadas: [], paresSubordinado: [] }, climaGeral: [] }`)
continua exatamente igual — arrays vazios não têm itens, então não há
`nomeCiclo` a preencher.

---

## Plano — Backend

### 1. backend-developer

Antes de codar: reler o guard rail acima e confirmar (grep rápido) que
`anonimizarRespostasPares`/`anonimizar_respostas_pares` continua aparecendo
só em comentários no arquivo após a mudança — o diff desta task não deve
adicionar nenhuma nova ocorrência fora de comentário. Nenhuma migration é
necessária — confirmar isso no início (não rodar
`migration:generate`/`migration:run`).

Arquivo tocado: só `backend/src/modules/analise/analise-avaliacoes.service.ts`.
`analise.controller.ts`/`analise.module.ts`/`analise-comum.ts` **não mudam**
(contrato de rota e papéis idêntico ao já existente).

1.1. Adicionar `nomeCiclo: string` às três interfaces exportadas
     (`AvaliacaoIdentificada`, `GrupoParesSubordinado`, `GrupoClimaGeral`),
     posição logo após `cicloId`, conforme o bloco de interfaces acima.

1.2. Adicionar a função privada `buscarNomesCiclos(ids: string[]):
     Promise<Map<string, string>>`, exatamente como no pseudocódigo da seção
     "Decisão de modelagem" (select explícito `{ id: true, nome: true }`,
     dedup de `ids` via `Set`, mesmo padrão de `buscarNomesColaboradores` já
     existente logo abaixo dela no arquivo — pode ficar posicionada ao lado
     dessa função irmã).

1.3. Em `buscarAvaliacoes`: adicionar `buscarNomesCiclos(idsUniverso)` ao
     `Promise.all` já existente (junto de `identificadas`,
     `gateParesSubordinado`, `gateClima`, `minimosPorCiclo`), capturando o
     resultado em `nomesCiclos`.

1.4. Logo após o `Promise.all`, mapear `identificadas` para incluir
     `nomeCiclo` (`identificadas.map((item) => ({ ...item, nomeCiclo:
     nomesCiclos.get(item.cicloId) ?? '' }))`) — usar esse array mapeado (não
     o original) no `return` final do bloco `avaliacao360.identificadas`.
     Ajustar o tipo de retorno interno de `buscarIdentificadas360` para
     `Omit<AvaliacaoIdentificada, 'nomeCiclo'>[]` (ou equivalente) para o TS
     não reclamar de campo faltante antes do mapeamento.

1.5. Passar `nomesCiclos` como novo parâmetro para
     `montarGruposParesSubordinado` e `montarGruposClima` (atualizar as duas
     assinaturas e os dois call-sites dentro de `buscarAvaliacoes`), incluindo
     `nomeCiclo: nomesCiclos.get(g.cicloId) ?? ''` no objeto base retornado
     por cada uma — **fora** do `...(liberado ? {...} : {...})`, presente
     tanto quando `liberado: true` quanto `liberado: false`.

1.6. Não tocar em `calcularGateParesSubordinado`, `calcularGateClima`,
     `buscarTextosParesSubordinado`, `buscarTextosClima`, `embaralhar`,
     `buscarMinimosPorCiclo`, `buscarNomesColaboradores`, nem em
     `analise.controller.ts`/`analise.module.ts`/`analise-comum.ts`.

1.7. Ao final: `npm run build` (tsc) e `npm test` (Vitest) em `backend/`,
     confirmando 0 erro novo de compilação e a suíte existente do módulo
     `analise` (`analise.service.spec.ts` + `analise-avaliacoes.service.spec.ts`)
     100% passando antes de considerar o passo concluído. Reportar o total de
     testes passando na seção "Status" abaixo, como já é padrão neste
     projeto.

### 2. backend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **Guard rail crítico nº 1 (herdado, não reaberto)**: grep em
   `analise-avaliacoes.service.ts` por `anonimizarRespostasPares`/
   `anonimizar_respostas_pares` — deve continuar aparecendo só em
   comentários, nenhuma nova ocorrência em `.select()`/`where`/condicional
   introduzida por este diff. Confirmar que `buscarNomesCiclos` usa `select:
   { id: true, nome: true }` explícito (não um `find` sem `select`), e que,
   se o `backend-developer` optou por estender `buscarMinimosPorCiclo` em vez
   de criar `buscarNomesCiclos`, o `select` estendido continua sem
   `anonimizarRespostasPares`.
2. **Zero mudança de comportamento em gate/anonimização**: diff de
   `calcularGateParesSubordinado`, `calcularGateClima`,
   `buscarTextosParesSubordinado`, `buscarTextosClima`, `embaralhar` deve ser
   vazio. Qualquer alteração nessas funções (mesmo cosmética) é achado a
   registrar — se funcional, é achado **crítico**.
3. **`nomeCiclo` presente nos dois estados de `liberado`**: em
   `paresSubordinado`/`climaGeral`, `nomeCiclo` deve aparecer tanto quando
   `liberado: true` quanto `liberado: false` (é campo de grupo, não de
   conteúdo liberado) — se o `backend-developer` colocou `nomeCiclo` dentro
   do branch condicional de `liberado`, é achado "Deveria corrigir".
4. **Sem join novo a `ciclos_avaliacao` dentro de
   `buscarIdentificadas360`/`buscarTextosParesSubordinado`/`buscarTextosClima`**
   — `nomeCiclo` deve ser preenchido em memória via `nomesCiclos.get(...)`,
   nunca via `.innerJoin(CicloAvaliacao, ...)` dentro dessas queries. Grep
   por `CicloAvaliacao` fora de `buscarNomesCiclos`/`buscarMinimosPorCiclo`
   não deve aparecer.
5. **Contrato de rota inalterado**: `analise.controller.ts`,
   `analise.module.ts`, `analise-comum.ts` devem ter diff vazio. Se algum dos
   três foi tocado, perguntar o motivo antes de aprovar.
6. Achados críticos devolvem a task para a etapa de desenvolvimento, seguindo
   o pipeline padrão do projeto.

### 3. test-engineer

1. Rodar a suíte existente do módulo `analise` primeiro
   (`npm test -- analise` ou `npm test` completo em `backend/`) e confirmar
   que os testes que garantem ausência de `avaliadorId`/identidade nos
   grupos `pares`/`subordinado` (`describe('GUARD RAIL CRÍTICO Nº 2 ...')`,
   `analise-avaliacoes.service.spec.ts`) e os testes de gate/liberação
   (`describe('GUARD RAIL CRÍTICO Nº 1 ...')`, `describe('GUARD RAIL —
   clima_geral ...')`) continuam passando intactos, sem precisar de nenhuma
   alteração de asserção — esses testes não dependem de `nomeCiclo`.
2. Ajustar/acrescentar asserções para o campo novo:
   - Em pelo menos um teste do bloco `identificadas`, `nomeCiclo` bate com o
     `nome` do `CicloAvaliacao` semeado via `criarCicloAvaliacaoFixture`
     (fixture já tem default `nome: 'Ciclo Teste'`, ver
     `backend/src/test/analiseFixtures.ts`).
   - Em pelo menos um teste de `paresSubordinado` com `liberado: true` e em
     pelo menos um com `liberado: false`, `nomeCiclo` está presente e correto
     nos dois — asserção explícita de que `nomeCiclo` **não** desaparece
     junto com `textos` no estado bloqueado (é o comportamento decidido nesta
     task: `cicloId`/`nomeCiclo` sempre presentes, independente de
     `liberado`).
   - Mesma asserção dupla (liberado e bloqueado) para `climaGeral`.
   - Se algum teste existente usa `Object.keys(...)` para checar o shape
     exato de um grupo/item afetado (ex.: linha ~475 do spec atual, que hoje
     só cobre `TextoAbertoItem`, não os grupos — confirmar que nenhum outro
     `Object.keys` cobre `GrupoParesSubordinado`/`GrupoClimaGeral`/
     `AvaliacaoIdentificada` por completo), atualizar a lista esperada de
     chaves para incluir `nomeCiclo`.
3. Ao final: `npm run build` e `npm test` em `backend/`, reportando o total
   final de testes passando na seção "Status" deste arquivo.

---

## Status

### 1. backend-developer — CONCLUÍDO

Estado inicial verificado igual ao descrito no plano (`cicloId` já presente
nos três, `nomeCiclo` ausente nos três, `buscarMinimosPorCiclo` com `select`
explícito `{ id: true, minimoRespostasPares: true }`) — nenhuma divergência
encontrada, plano seguido sem alterações.

Arquivo tocado: só
`backend/src/modules/analise/analise-avaliacoes.service.ts`.
`analise.controller.ts`/`analise.module.ts`/`analise-comum.ts` não foram
tocados (diff vazio).

Mudanças:
- Adicionado `nomeCiclo: string` (logo após `cicloId`) em
  `AvaliacaoIdentificada`, `GrupoParesSubordinado` e `GrupoClimaGeral`.
- Nova função privada `buscarNomesCiclos(ids)`, paralela e aditiva a
  `buscarMinimosPorCiclo` — `select` explícito `{ id: true, nome: true }`,
  nunca lê `anonimizarRespostasPares`.
- `buscarIdentificadas360` passou a retornar `Omit<AvaliacaoIdentificada,
  'nomeCiclo'>[]`; nenhuma mudança na query (sem join novo a
  `ciclos_avaliacao`).
- `buscarAvaliacoes`: `buscarNomesCiclos(idsUniverso)` adicionada ao
  `Promise.all` já existente; `identificadas` mapeado em memória para
  `identificadasComNome` (preenchendo `nomeCiclo` via
  `nomesCiclos.get(item.cicloId) ?? ''`), usado no `return` final.
- `montarGruposParesSubordinado` e `montarGruposClima` ganharam o parâmetro
  `nomesCiclos: Map<string, string>`; `nomeCiclo` incluído no objeto base
  retornado por ambas, **fora** do branch condicional de `liberado` — presente
  tanto em `liberado: true` quanto `liberado: false`.

Guard rails confirmados após a mudança (grep manual, ver comandos abaixo):
- `anonimizarRespostasPares`/`anonimizar_respostas_pares`: só aparece em
  comentário (linha do bloco de comentário do topo do arquivo) — nenhuma nova
  ocorrência em `.select()`/`where`/condicional.
- `CicloAvaliacao` (a entidade): só usada em `buscarMinimosPorCiclo` (já
  existente) e `buscarNomesCiclos` (nova), ambas com `select` explícito —
  nenhum `find` sem `select`, nenhum join novo a `ciclos_avaliacao` dentro de
  `buscarIdentificadas360`/`buscarTextosParesSubordinado`/`buscarTextosClima`.
- `calcularGateParesSubordinado`, `calcularGateClima`,
  `buscarTextosParesSubordinado`, `buscarTextosClima`, `embaralhar`: diff
  vazio (não tocadas).

Sem migration — nenhuma mudança de schema (não rodado
`migration:generate`/`migration:run`).

Build/testes (`backend/`):
- `npm run build`: falha pré-existente e não relacionada a esta task, em
  `src/test/fakeRepository.ts` (erro de tipagem TS2352, arquivo de
  infraestrutura de teste não tocado por este diff). Confirmado via
  `git stash`/`npm run build`/`git stash pop` que o mesmo erro ocorre
  idêntico sem a mudança desta task — não é uma regressão introduzida aqui.
  Nenhum outro erro de compilação apareceu.
- `npm test` (suíte completa): **190 testes passando, 9 arquivos de teste
  passando, 0 falha**, incluindo `analise.service.spec.ts` (25 testes) e
  `analise-avaliacoes.service.spec.ts` (23 testes) — os testes existentes que
  garantem ausência de `avaliadorId`/identidade nos grupos
  `pares`/`subordinado` (guard rail crítico nº 2) e os testes de
  gate/liberação (guard rail crítico nº 1 e guard rail de `clima_geral`)
  passaram **sem precisar de nenhuma alteração de asserção** — o campo novo
  `nomeCiclo` é aditivo e não quebrou nenhum teste existente (nenhum
  `Object.keys(...)` cobre o shape completo de
  `GrupoParesSubordinado`/`GrupoClimaGeral`/`AvaliacaoIdentificada` hoje).

Pronto para a etapa 2 (backend-codereviewer). A etapa 3 (test-engineer) ainda
precisa acrescentar as asserções explícitas de `nomeCiclo` (ex.: valor
correto em `identificadas`, presença em ambos os estados de `liberado` para
`paresSubordinado`/`climaGeral`) — os testes atuais passam por não afirmarem
nada sobre o campo, não porque já o cobrem.

## Revisão

Revisão feita por leitura completa de
`backend/src/modules/analise/analise-avaliacoes.service.ts` (único arquivo
tocado), confrontada linha a linha com o plano acima, mais leitura de
`ciclo-avaliacao.entity.ts` (confirmar que `nome` já existe na entidade, sem
necessidade de migration), `analise-comum.ts` e `analise.controller.ts`
(confirmar diff vazio) e `src/test/fakeRepository.ts` (para avaliar o claim
de falha pré-existente de build).

### Crítico

Sem achados críticos. Pode prosseguir para a etapa 3 (test-engineer).

### Guard rail crítico nº 1 (anonimização por limiar) — OK

- `anonimizarRespostasPares`/`anonimizar_respostas_pares` só aparece em
  comentário (bloco de topo do arquivo, linhas 27-33) — nenhuma nova
  ocorrência em `.select()`/`where`/condicional.
- `buscarMinimosPorCiclo` (linhas 351-358) permanece com `select: { id:
  true, minimoRespostasPares: true }` idêntico ao anterior — diff vazio
  nesta função.
- `buscarNomesCiclos` (linhas 374-382, nova) usa `select: { id: true, nome:
  true }` explícito, nunca um `find` sem `select` — coerente com a decisão
  de modelagem do plano (função nova e paralela, não extensão de
  `buscarMinimosPorCiclo`).
- `CicloAvaliacao.nome` já existe na entidade (`ciclo-avaliacao.entity.ts`,
  linha 20, `@Column({ type: 'text' }) nome!: string`, já mapeada desde a
  migration original do módulo) — confirma que nenhuma migration é
  necessária para esta task, como o plano previa.

### Guard rail crítico nº 2 (identidade em pares/subordinado) — OK

- Nenhum `select`/`addSelect` novo de `rel.avaliador_id` ou nome de
  avaliador em query que projete texto `pares`/`subordinado`:
  `calcularGateParesSubordinado` só usa `avaliador_id` dentro de
  `COUNT(DISTINCT rel.avaliador_id)` (linha 184); `buscarTextosParesSubordinado`
  não seleciona `avaliador_id` nem nome de avaliador (linhas 215-220,
  projeta só `avaliado_id`/`cicloId`/`tipoRelacionamento`/pergunta/texto).
- Nenhum join novo a `CicloAvaliacao`/`ciclos_avaliacao` dentro de
  `buscarIdentificadas360`, `calcularGateParesSubordinado`,
  `buscarTextosParesSubordinado`, `calcularGateClima` ou
  `buscarTextosClima` — `CicloAvaliacao` só é referenciada (via
  `getRepository`, sem join) em `buscarMinimosPorCiclo` e `buscarNomesCiclos`.
  `nomeCiclo` é preenchido em memória via `Map.get(...)` nos três locais
  (`identificadasComNome` em `buscarAvaliacoes`, linhas 431-434;
  `montarGruposParesSubordinado`, linha 264; `montarGruposClima`, linha
  339) — exatamente como o plano exigia.
- `calcularGateParesSubordinado`, `calcularGateClima`,
  `buscarTextosParesSubordinado`, `buscarTextosClima`, `embaralhar`: lidos
  por completo, corpo e assinatura batem exatamente com o comportamento já
  descrito/aprovado na task original de `analise-avaliacoes` — nenhum sinal
  de alteração funcional ou cosmética.

### `nomeCiclo` presente nos dois estados de `liberado` — OK

- `montarGruposParesSubordinado` (linha 262-274): `nomeCiclo` está no
  objeto base (linha 264), fora do spread condicional
  `...(liberado ? { textos: ... } : { motivo: ... })` (linhas 271-273) —
  presente tanto em `liberado: true` quanto `liberado: false`.
- `montarGruposClima` (linha 337-346): mesmo padrão, `nomeCiclo` na linha
  339, fora do condicional de `liberado` (linhas 343-345).
- Comportamento de `liberado: false` / `motivo: 'aguardando_minimo_respondentes'`
  intacto nos dois — nenhuma mudança de branch além da adição do campo.

### Controle de acesso — OK

- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` continua como primeira
  linha de `buscarAvaliacoes` (linha 394), antes de qualquer validação de
  entrada ou query.
- Nenhuma função privada (`buscarIdentificadas360`,
  `calcularGateParesSubordinado`, `buscarTextosParesSubordinado`,
  `calcularGateClima`, `buscarTextosClima`, `buscarMinimosPorCiclo`,
  `buscarNomesColaboradores`, `buscarNomesCiclos`, `montarGruposParesSubordinado`,
  `montarGruposClima`) chama `garantirPapel` ou faz qualquer checagem de
  papel duplicada — consistente com o padrão do módulo.
- `analise.controller.ts` (lido por completo) segue passthrough puro
  (`req.colaboradorAutenticado!` repassado ao service, sem lógica própria)
  — diff vazio confirmado por leitura direta, contrato de rota inalterado.
  `analise.module.ts`/`analise-comum.ts` (este último também lido por
  completo) não têm nenhum traço de `nomeCiclo`/`buscarNomesCiclos` —
  diff vazio confirmado.

### Consistência com schema — OK

- `buscarNomesCiclos` lê `ciclos_avaliacao.id`/`ciclos_avaliacao.nome`,
  ambas colunas já existentes e mapeadas na entidade `CicloAvaliacao` —
  nenhum nome de coluna inventado, nenhuma tradução para inglês.
- Nenhum campo de multi-tenant introduzido.
- Nenhuma migration criada, consistente com "sem mudança de schema" — o
  campo `nome` já existia desde a migration original do módulo
  `ciclos-avaliacao`.

### Deveria corrigir

Nenhum achado nesta categoria.

### Sugestão

1. **Falha de build em `src/test/fakeRepository.ts` (TS2352) — dívida
   técnica pré-existente, não desta task.** Confirmo a avaliação do
   backend-developer: o arquivo não foi tocado por este diff (só
   `analise-avaliacoes.service.ts` foi alterado), é infraestrutura de teste
   (fake in-memory repository usado via `vi.mock`), e a alegação de que o
   erro é idêntico com/sem a mudança (verificado via `git stash`) é
   plausível dado que o arquivo é completamente alheio ao escopo desta
   task. Registrar como item de dívida técnica separado a ser resolvido em
   sua própria task, fora do escopo de `analise-agrupamento-ciclo` — não
   bloqueia esta revisão. Recomendo que o orquestrador abra um item de
   backlog para corrigir o TS2352 em `fakeRepository.ts` antes que ele
   comece a mascarar erros de tipagem reais em builds futuros de CI.
2. Nenhuma outra sugestão de qualidade — tratamento de erro (`ErroHttp`),
   validação de entrada (`validarDataQuery`, `ehUuidValido`) e tipagem
   (`Omit<AvaliacaoIdentificada, 'nomeCiclo'>[]` no retorno interno de
   `buscarIdentificadas360`) seguem os padrões já estabelecidos pela task
   original do módulo, sem duplicação de lógica.

### Conclusão

Sem achados críticos. A mudança é estritamente aditiva (`nomeCiclo`
preenchido em memória via `Map`), não introduz nenhum join novo a
`ciclos_avaliacao` nas queries sensíveis, não toca em nenhuma das cinco
funções de gate/anonimização, mantém `garantirPapel` como única checagem de
papel e não requer migration. Liberado para a etapa 3 (test-engineer).

## Testes

Etapa 3 (test-engineer) executada sobre
`backend/src/modules/analise/analise-avaliacoes.service.spec.ts`.

### 1. Baseline (antes de qualquer alteração)

`npm test` em `backend/`: **190 testes, 9 arquivos, 0 falha** — confirmado
que os testes de guard rail existentes (`GUARD RAIL CRÍTICO Nº 1`,
`GUARD RAIL CRÍTICO Nº 2`, `GUARD RAIL — clima_geral`) já passavam intactos
antes de qualquer teste novo ser adicionado, exatamente como o
backend-developer/revisor já haviam reportado.

### 2. Testes novos adicionados

Novo describe `'nomeCiclo — metadado de grupo/item novo, presente em
liberado e bloqueado, sem troca entre ciclos'` em
`analise-avaliacoes.service.spec.ts`, com 3 testes novos (190 → 193):

1. **`identificadas`**: dois ciclos (`Ciclo Alpha 2026.1` / `Ciclo Beta
   2026.1`) no mesmo resultado, cada um com uma resposta `autoavaliacao` —
   confirma `nomeCiclo` correto por item, sem troca entre ciclos, mais
   `Object.keys(...)` do shape completo de `AvaliacaoIdentificada` (10
   campos, incluindo `nomeCiclo`).
2. **`paresSubordinado`**: dois ciclos, um com grupo `pares` abaixo do
   mínimo (`liberado:false`) e outro acima (`liberado:true`) — confirma
   `nomeCiclo` correto e presente nos dois estados, sem troca entre ciclos,
   `Object.keys(...)` do shape completo em ambos os estados (com `motivo` no
   bloqueado, com `textos` no liberado, `nomeCiclo` presente nos dois), **e
   reforço explícito do guard rail crítico nº 2**: para os dois grupos
   (bloqueado e liberado), nenhuma chave `avaliadorId`/`avaliador_id`/
   `avaliadorNome`/`avaliador` aparece em nenhum nível do objeto, mesmo com
   `nomeCiclo` adicionado.
3. **`climaGeral`**: mesmo padrão do item 2 (dois ciclos, um bloqueado/um
   liberado), confirmando `nomeCiclo` correto e presente nos dois estados,
   com `Object.keys(...)` do shape completo em ambos.

Todos os três cobrem explicitamente o caso "CRÍTICO" apontado na instrução:
`nomeCiclo` não ficou preso ao branch condicional de `liberado` — está
presente e correto tanto no estado liberado quanto no bloqueado, nos dois
grupos (`paresSubordinado` e `climaGeral`).

### 3. Guard rails existentes — confirmados intactos, sem alteração de asserção

Os testes que garantem ausência de `avaliadorId`/`avaliadorNome`/identidade
de avaliador nos grupos `pares`/`subordinado`
(`describe('GUARD RAIL CRÍTICO Nº 2 ...')`) e os testes de gate/liberação
(`describe('GUARD RAIL CRÍTICO Nº 1 ...')`,
`describe('GUARD RAIL — clima_geral ...')`) **continuam passando exatamente
como estavam, sem nenhuma alteração de asserção** — o campo `nomeCiclo` é
aditivo e não exigiu nenhum ajuste neles. Nenhuma asserção de anonimização
foi relaxada.

Controle de acesso também coberto (já existia, confirmado intacto):
`buscarAvaliacoes` continua exigindo `garantirPapel([...PAPEIS_COM_ACESSO])`
como primeira linha — `colaborador` rejeitado com 403
`PAPEL_NAO_AUTORIZADO` (tanto via chamada direta ao service quanto via HTTP,
`describe('GET /api/analise/avaliacoes — controle de acesso por papel
(HTTP)')`), `admin`/`gestor_rh` recebem o mesmo payload.

### 4. Resultado final

- `npm test` em `backend/`: **193 testes passando, 9 arquivos de teste
  passando, 0 falha** (190 pré-existentes + 3 novos de `nomeCiclo`).
- `npm run build` em `backend/`: mesma falha única e pré-existente TS2352 em
  `src/test/fakeRepository.ts:46` (`Conversion of type '{ id: ...;
  criadoEm: Date; atualizadoEm: Date; } & Partial<T>' to type 'T' may be a
  mistake...`), idêntica em linha e mensagem à já reportada pelo
  backend-developer e confirmada pelo backend-codereviewer via `git stash` —
  não piorou, nenhum erro novo de compilação introduzido pelos testes
  adicionados nesta etapa. Continua registrada como dívida técnica de
  backlog, fora do escopo desta task.

Nenhum achado crítico de anonimização ou controle de acesso nesta etapa.
Task `analise-agrupamento-ciclo` concluída ponta a ponta (backend-developer
→ backend-codereviewer → test-engineer).
