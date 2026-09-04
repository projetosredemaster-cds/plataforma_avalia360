# Task: Filtro "Todos os gestores" na pergunta tipo `pessoa` (Backend)

Demanda 100% backend, restrita a `backend/src/common/enums.ts`,
`backend/src/modules/perguntas/perguntas.service.ts` e
`backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`.
Não toca `frontend/`. Pedido já esclarecido diretamente pelo usuário, com
decisão arquitetural já tomada (reproduzida abaixo) — sem etapa de `spec`. Sem
etapa de `test-engineer` nesta task (pedido explícito do usuário) — se algum
teste existente quebrar, o item 1 abaixo deve sinalizar e aplicar o ajuste
mínimo necessário, mas não escrever teste novo.

**Papéis:** nenhuma rota nova é criada e nenhuma rota muda seus papéis
permitidos. As 4 rotas de `coleta-respostas-publica.module.ts` continuam
públicas (sem `autenticar`, autorização por posse de `token`/`sessaoToken` +
CPF validada manualmente na camada de service — nenhuma mudança neste
comportamento). `POST /api/perguntas` e `PUT /api/perguntas/:id` continuam
exigindo `garantirPapel(ator, ['admin', 'gestor_rh'])`, sem mudança.

**Regra de anonimização — aplicável, ver seção dedicada abaixo.** Esta
demanda toca a resolução de opções de pergunta tipo `pessoa`, que depende de
`relacionamentos_avaliacao`/`ciclo_participantes` (estrutural, dado de grafo
avaliador↔avaliado, já exposto a admin/gestor_rh via
`GET /api/ciclos/:id/relacionamentos`) — nunca de `respostas`/`itens_resposta`
(conteúdo). A nova branch de `'todos_gestores'` mantém exatamente essa mesma
garantia: só lê `colaboradores` e `ciclo_participantes`.

## Estado atual verificado (confirmado por leitura direta antes deste plano)

- `backend/src/common/enums.ts`, linhas 41–69: `TipoRelacionamento` (5 valores
  reais do enum Postgres `tipo_relacionamento`: `autoavaliacao`, `gestor`,
  `pares`, `subordinado`, `externo`) + `TIPO_RELACIONAMENTO_VALORES` (mesmos 5
  valores, docstring hoje diz "Também usada para validar
  `configuracao.filtroRelacionamento` de perguntas tipo `pessoa`" — **essa
  frase fica desatualizada** com esta task e precisa ser removida/ajustada,
  porque `filtroRelacionamento` passa a aceitar um token que não pertence a
  este enum). Logo abaixo, `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES:
  TipoRelacionamento[] = ['pares', 'subordinado', 'externo']` — allowlist
  específica de `configuracao.filtroRelacionamento`, hoje tipada como
  subconjunto de `TipoRelacionamento`.
- `backend/src/modules/perguntas/perguntas.service.ts`, linha 6 (import) e
  linhas 129–145 (`validarConfiguracaoPergunta`, branch `tipo === 'pessoa'`):
  valida `filtroRelacionamento` como array não vazio de strings, cada uma
  pertencente a `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (`.includes(item
  as never)` — não depende de tipagem estrita do array, só do conteúdo em
  runtime). Nenhuma outra lógica no arquivo depende do tipo de
  `filtroRelacionamento`; a allowlist é a ÚNICA linha de validação.
- `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`:
  - Linha 8: `import type { TipoPergunta, TipoPesquisa, TipoRelacionamento }
    from '../../common/enums'` — `TipoRelacionamento` só é usado na linha 258
    (nenhum outro uso no arquivo).
  - Linhas 229–310: `resolverOpcoesPessoa(relacionamento: RelacionamentoAvaliacao,
    configuracao)`, docstring completa descrevendo o comportamento atual por
    tipo (`pares`/`gestor`/`subordinado` contribuem condições SQL sobre
    `relacionamentos_avaliacao`; `autoavaliacao`/`externo` nunca contribuem).
    Linha 257–259: `filtro = ... as TipoRelacionamento[]`. Linha 261:
    `respondenteId = relacionamento.avaliadorId`. Linhas 263–277: monta
    `condicoes: string[]`; **linha 277: `if (condicoes.length === 0) return
    []`** — é exatamente o early return que precisa parar de abortar sozinho
    quando só `'todos_gestores'` estiver marcado. Linhas 285–299: uma única
    query via `createQueryBuilder('r')` sobre `RelacionamentoAvaliacao`
    join `Colaborador`, filtrando `r.ciclo_id`, as `condicoes` OR, `c.ativo =
    true` e excluindo o próprio respondente. Linhas 301–309: dedupe por id via
    `Map<string, OpcaoPessoaFormulario>`, retorna `Array.from(porId.values())`.
  - `CicloParticipante` já está importado (linha 12), usado em outras partes
    do arquivo (fluxo `clima_geral`) — **nenhum import novo necessário** para
    a nova branch, só reaproveitar a entidade já importada.
  - `Colaborador` já está importado (linha 9), com `ehGestor`/`ativo` já
    presentes na entidade (`backend/src/modules/colaboradores/colaborador.entity.ts`,
    linhas 53–56: `ativo` e `@Column({ name: 'eh_gestor', type: 'boolean',
    default: false }) ehGestor!: boolean`).
  - `resolverOpcoesPessoa` é chamada em exatamente 2 lugares: linha 490
    (`buscarFormulario`, monta `item.opcoesPessoa` para o formulário público) e
    linha 586 (`enviarRespostas`, deriva `opcoesPessoaPorPergunta` para validar
    o `colaboradorId` enviado no payload contra o conjunto ofertado). **Ambos
    ganham o novo comportamento automaticamente** ao alterar a função — nenhuma
    mudança adicional necessária nesses dois call sites, e a validação de
    envio continua aceitando exatamente o mesmo conjunto que foi ofertado no
    formulário (mesma função, mesmos parâmetros).
- `backend/src/modules/ciclo-participantes/ciclo-participante.entity.ts`:
  `@Entity('ciclo_participantes')`, colunas `cicloId` (`ciclo_id`) e
  `colaboradorId` (`colaborador_id`) — confirmado.
- Nenhum teste (Vitest) referencia `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`,
  `resolverOpcoesPessoa` ou `filtroRelacionamento` hoje (grep em todo
  `backend/src` só retorna os 3 arquivos de produção acima + a migration
  antiga que criou o enum `tipo_relacionamento`, nenhum arquivo `*.test.ts`).
  **Nenhum teste existente deve quebrar** com esta mudança — sinalizar ao
  final se algo inesperado aparecer.
- **Nenhuma migration nesta task** — `'todos_gestores'` não é gravado em
  nenhuma coluna de banco; `configuracao` é `jsonb` livre, já validado só em
  aplicação; o enum Postgres `tipo_relacionamento` permanece com seus 5
  valores reais, intocado.

## Decisão de nomenclatura da constante (mantida, não renomeada)

`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` **não será renomeada** — avaliado
o custo/benefício: o nome ainda descreve corretamente seu propósito ("valores
aceitos pelo filtro de relacionamento da pergunta tipo pessoa"), que continua
sendo majoritariamente composto por `TipoRelacionamento` reais (`pares`,
`subordinado`, `externo`) mais uma única extensão de escopo
(`'todos_gestores'`). Renomear exigiria tocar o import em
`perguntas.service.ts` sem nenhum ganho de clareza proporcional ao risco de
diff desnecessário. O **tipo** da constante muda (de `TipoRelacionamento[]`
para o novo `FiltroRelacionamentoPessoa[]`), o que já comunica a mudança de
escopo para quem ler `enums.ts`.

## Guard rails de anonimização

- **`resolverOpcoesPessoa` nunca lê `respostas`/`itens_resposta`, em nenhuma
  branch, antes ou depois desta task.** A nova branch de `'todos_gestores'`
  consulta exclusivamente `ciclo_participantes` (join `colaboradores`) — as
  mesmas duas tabelas estruturais já usadas pelas branches existentes
  (`relacionamentos_avaliacao` join `colaboradores`). Confirmar isso
  literalmente no code review: nenhum `SELECT`/`createQueryBuilder` novo desta
  task referencia `Resposta`/`ItemResposta`/`RespostaClima`/`ItemRespostaClima`.
- A garantia de anonimização de `pares`/`subordinado` (nunca expor
  `itens_resposta` identificado sem atingir `minimo_respostas_pares`) **não é
  tocada por esta task** — não há exibição de respostas em jogo aqui, é lista
  de opções de resposta (dado estrutural), mesma natureza já registrada na
  task anterior (`coleta-respostas-publica`, decisão de modelagem nº 7).
- `'todos_gestores'` é explicitamente **independente de relação** — não
  filtra por `avaliador_id`/`avaliado_id` nem por `tipo_relacionamento`
  nenhum. Isso é intencional (requisito 2 da demanda), não uma falha da regra
  de anonimização: continua sendo dado estrutural (grafo "quem é gestor + está
  no ciclo"), nunca conteúdo de resposta.
- Single-tenant: nenhuma coluna/parâmetro `organization_id` introduzido.
- Nenhuma migration nesta task — o enum Postgres `tipo_relacionamento`
  permanece com seus 5 valores reais.

## Plano — Backend

### 1. backend-developer

**Status: concluído.**

Resumo do que foi feito (seguindo exatamente o plano acima):

- `backend/src/common/enums.ts`: adicionado `FiltroRelacionamentoPessoa =
  TipoRelacionamento | 'todos_gestores'`; `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`
  retipada para `FiltroRelacionamentoPessoa[]` com os 4 valores (`pares`,
  `subordinado`, `externo`, `todos_gestores`); docstrings de
  `TIPO_RELACIONAMENTO_VALORES` e da nova constante atualizadas conforme
  texto sugerido no plano. `TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES`
  permanecem com exatamente os 5 valores reais do enum Postgres — nenhuma
  mudança neles.
- `backend/src/modules/perguntas/perguntas.service.ts`: nenhuma mudança —
  confirmado que `validarConfiguracaoPergunta` já valida contra
  `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (import por valor, não por
  tipo), e passa a aceitar `'todos_gestores'` automaticamente.
- `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`:
  - Import trocado: `TipoRelacionamento` removido (confirmado por grep, era o
    único uso no arquivo), `FiltroRelacionamentoPessoa` importado no lugar.
  - `resolverOpcoesPessoa` reescrita: `filtro` agora tipado como
    `FiltroRelacionamentoPessoa[]`; early return trocado para
    `if (condicoes.length === 0 && !incluirTodosGestores) return []`; corpo
    final dividido em duas queries independentes (`linhasRelacao` sobre
    `RelacionamentoAvaliacao` join `Colaborador`, só executada se
    `condicoes.length > 0`; `linhasGestores` sobre `CicloParticipante` join
    `Colaborador`, só executada se `incluirTodosGestores`), unidas no mesmo
    `Map<string, OpcaoPessoaFormulario>` (`porId`). Nomes exatos usados:
    `incluirTodosGestores`, `porId`, `linhasRelacao`, `linhasGestores`.
    Docstring atualizada com a explicação de `todos_gestores`, preservando o
    texto existente sobre os demais tipos.
  - Nenhuma edição nos dois call sites (`buscarFormulario` e
    `enviarRespostas`) — ambos herdam o novo comportamento automaticamente,
    incluindo a validação de envio (`opcoesPessoaPorPergunta`), que continua
    aceitando exatamente o mesmo conjunto ofertado no formulário.
  - Invariante de anonimização confirmado: a branch de `todos_gestores` só
    faz `SELECT` sobre `ciclo_participantes` join `colaboradores` — nenhuma
    referência a `Resposta`/`ItemResposta`/`RespostaClima`/`ItemRespostaClima`
    em nenhum lugar da função.
- **Nenhuma migration criada nem executada** — o enum Postgres
  `tipo_relacionamento` permanece intocado com seus 5 valores reais.
- `npm run build` (tsc): 1 erro pré-existente e não relacionado em
  `src/test/fakeRepository.ts` (confirmado via `git stash` que o erro já
  existia antes desta task, em código não tocado por ela) — nenhum erro novo
  introduzido pelas mudanças desta task.
- `npm test` (Vitest): suíte completa passou sem regressão — 141 testes, 6
  arquivos, todos verdes.

Arquivos alterados: `backend/src/common/enums.ts`,
`backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`.
`backend/src/modules/perguntas/perguntas.service.ts` não precisou de edição.

#### 1.1 `backend/src/common/enums.ts`

Adicionar, logo após `TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES`
(antes de `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`), um novo tipo de
aplicação mais amplo que `TipoRelacionamento`:

```ts
/**
 * Allowlist de `configuracao.filtroRelacionamento` (pergunta tipo `pessoa`).
 * Estende `TipoRelacionamento` com `'todos_gestores'`, que NÃO é um tipo de
 * relacionamento real — não existe nem existirá linha em
 * `relacionamentos_avaliacao` com esse valor, e o enum Postgres
 * `tipo_relacionamento` NUNCA deve ganhar esse valor. É uma opção de ESCOPO
 * ("liste todo mundo marcado como gestor no ciclo, independente de relação
 * com quem responde"), não de relação — validada só em aplicação, sobre uma
 * coluna `jsonb` livre.
 */
export type FiltroRelacionamentoPessoa = TipoRelacionamento | 'todos_gestores'
```

Trocar a assinatura de `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` de
`TipoRelacionamento[]` para `FiltroRelacionamentoPessoa[]`, e o array de
`['pares', 'subordinado', 'externo']` para
`['pares', 'subordinado', 'externo', 'todos_gestores']`. Atualizar a
docstring da constante para mencionar a nova opção:

```ts
/**
 * Subconjunto de tipos/opções selecionáveis como filtro de pergunta tipo
 * `pessoa` (`configuracao.filtroRelacionamento`) — mais restrito que o enum
 * completo de `TipoRelacionamento` porque `autoavaliacao` nunca contribui
 * nenhuma opção e `gestor` nunca contribui mais de 1 (não agregam como
 * filtro), e estendido com `'todos_gestores'`, que não é um
 * `TipoRelacionamento` real (ver `FiltroRelacionamentoPessoa`) — lista todos
 * os colaboradores marcados como gestor e participantes do ciclo,
 * independente de relação com quem responde. `gestor`/`autoavaliacao`
 * continuam válidos em `relacionamentos_avaliacao.tipo_relacionamento` (motor
 * de ciclos) — só não são mais oferecidos como filtro nesta pergunta.
 */
export const TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES: FiltroRelacionamentoPessoa[] = [
  'pares',
  'subordinado',
  'externo',
  'todos_gestores',
]
```

Ajustar a docstring de `TIPO_RELACIONAMENTO_VALORES` (linhas 34–40 hoje):
remover/reescrever a frase "Também usada para validar
`configuracao.filtroRelacionamento` de perguntas tipo `pessoa`" — isso não é
mais verdade (a validação de `filtroRelacionamento` passa a usar
`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`/`FiltroRelacionamentoPessoa`,
nunca mais `TIPO_RELACIONAMENTO_VALORES`/`TipoRelacionamento` sozinho).
Sugestão de nova docstring:

```ts
/**
 * Reflete o enum Postgres `tipo_relacionamento`, criado pela migration do
 * módulo `ciclos-avaliacao` (`relacionamentos_avaliacao.tipo_relacionamento`).
 * Para a allowlist de `configuracao.filtroRelacionamento` de perguntas tipo
 * `pessoa` (que inclui a opção adicional `'todos_gestores'`, não um valor
 * deste enum), ver `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`/
 * `FiltroRelacionamentoPessoa` abaixo.
 */
```

Nenhuma outra mudança em `enums.ts`. Nenhum valor novo em
`TIPO_RELACIONAMENTO_VALORES`/`TipoRelacionamento` (mantém exatamente os 5
valores reais do enum Postgres).

#### 1.2 `backend/src/modules/perguntas/perguntas.service.ts`

Nenhuma mudança de lógica necessária — `validarConfiguracaoPergunta` (linhas
129–145) já valida contra `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` via
`.includes(item as never)`, que passa a aceitar `'todos_gestores'`
automaticamente assim que a constante for atualizada no item 1.1. Confirmar
apenas que o import (linha 6) continua compilando sem erro — não referencia
`TipoRelacionamento` diretamente, só a constante, então não precisa de
mudança de import.

#### 1.3 `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`

**Import (linha 8):** trocar `TipoRelacionamento` por
`FiltroRelacionamentoPessoa` na lista de tipos importados de
`'../../common/enums'` (`TipoRelacionamento` deixa de ser usado no arquivo
depois da mudança abaixo — confirmar com grep antes de remover o import, para
não deixar um import não utilizado).

**`resolverOpcoesPessoa` (linhas 229–310):** reescrever mantendo a estrutura
de `condicoes`/dedupe já existente, adicionando uma segunda fonte de dados
(query sobre `ciclo_participantes` ⨝ `colaboradores`) unida no mesmo `Map`.
Pontos obrigatórios:

1. Docstring atualizada (acrescentar a explicação de `todos_gestores` ao
   final, preservando o texto existente sobre `pares`/`gestor`/`subordinado`/
   `autoavaliacao`/`externo`):
   ```ts
   /**
    * ... (texto existente sobre pares/gestor/subordinado/autoavaliacao/externo,
    * sem alteração) ...
    * - `todos_gestores`: IGNORA completamente a relação com o respondente —
    *   lista todos os colaboradores com `eh_gestor = true` E `ativo = true`
    *   que sejam `ciclo_participantes` do MESMO ciclo
    *   (`relacionamento.cicloId`), consultando `ciclo_participantes` ⨝
    *   `colaboradores` (NUNCA `relacionamentos_avaliacao` para esta branch).
    *   Combinável com os filtros acima (união dos dois conjuntos de
    *   resultados, sem duplicar — mesmo dedupe por id já usado). Sempre
    *   exclui o próprio respondente, mesmo que ele seja gestor.
    * Lê só `colaboradores`/`ciclo_participantes`/`relacionamentos_avaliacao`
    * (estrutural) — NUNCA `respostas`/`itens_resposta`, em nenhuma branch.
    */
   ```
2. `filtro` tipado como `FiltroRelacionamentoPessoa[]` (troca de cast, linha
   257–259).
3. **O early return da linha 277 (`if (condicoes.length === 0) return []`)
   precisa mudar** para não abortar quando `'todos_gestores'` estiver
   marcado sozinho:
   ```ts
   const incluirTodosGestores = filtro.includes('todos_gestores')
   if (condicoes.length === 0 && !incluirTodosGestores) return []
   ```
4. Trocar o corpo final (linhas 279–309, que hoje monta `linhas` direto de uma
   única query e deduplica) por duas consultas independentes, cada uma só
   executada se tiver o que consultar, unidas no mesmo `Map<string,
   OpcaoPessoaFormulario>`:
   ```ts
   const porId = new Map<string, OpcaoPessoaFormulario>()

   if (condicoes.length > 0) {
     // Id do colega = o lado da linha que NÃO é o respondente (comentário
     // existente preservado).
     const idColegaExpr =
       'CASE WHEN r.avaliador_id = :respondenteId THEN r.avaliado_id ELSE r.avaliador_id END'

     const linhasRelacao = await AppDataSource.getRepository(RelacionamentoAvaliacao)
       .createQueryBuilder('r')
       .innerJoin(Colaborador, 'c', `c.id = (${idColegaExpr})`)
       .select(idColegaExpr, 'id')
       .addSelect('c.nome_completo', 'nomeCompleto')
       .where('r.ciclo_id = :cicloId', { cicloId: relacionamento.cicloId })
       .andWhere(`(${condicoes.join(' OR ')})`)
       .andWhere('c.ativo = true')
       .andWhere(`(${idColegaExpr}) <> :respondenteId`)
       .setParameter('respondenteId', respondenteId)
       .getRawMany<OpcaoPessoaFormulario>()

     for (const linha of linhasRelacao) porId.set(linha.id, linha)
   }

   if (incluirTodosGestores) {
     const linhasGestores = await AppDataSource.getRepository(CicloParticipante)
       .createQueryBuilder('cp')
       .innerJoin(Colaborador, 'c', 'c.id = cp.colaborador_id')
       .select('c.id', 'id')
       .addSelect('c.nome_completo', 'nomeCompleto')
       .where('cp.ciclo_id = :cicloId', { cicloId: relacionamento.cicloId })
       .andWhere('c.eh_gestor = true')
       .andWhere('c.ativo = true')
       .andWhere('c.id <> :respondenteId', { respondenteId })
       .getRawMany<OpcaoPessoaFormulario>()

     for (const linha of linhasGestores) porId.set(linha.id, linha)
   }

   // Deduplica por id — necessário pela simetria de `pares` (mesmo colega via
   // as duas direções), por segurança quando a mesma pessoa aparece via mais
   // de um tipo marcado no filtro, e agora também quando a mesma pessoa é ao
   // mesmo tempo gestor (via `todos_gestores`) e par/subordinado/etc. (via
   // relação) — o `Map` já cobre os 3 casos sem lógica extra.
   return Array.from(porId.values())
   ```
   Nomes exatos a usar: `incluirTodosGestores`, `porId`, `linhasRelacao`,
   `linhasGestores` — para o code review comparar 1:1 com este plano.
5. **Nada muda** nos dois call sites (`buscarFormulario` linha 490,
   `enviarRespostas` linha 586) — nenhuma edição nessas linhas, ambos herdam o
   novo comportamento automaticamente por já chamarem `resolverOpcoesPessoa`
   com os mesmos parâmetros (`relacionamento`, `pergunta.configuracao`).

#### 1.4 Checklist de fechamento

- `npm run build` (tsc) dentro de `backend/` sem erros novos ao final —
  atenção especial ao import de `TipoRelacionamento` em
  `coleta-respostas-publica.service.ts`: remover da lista importada se, após
  a mudança, não sobrar nenhum outro uso no arquivo (confirmar com grep antes
  de finalizar, para não deixar import não utilizado nem quebrar o `tsc`).
- `npm test` (Vitest): rodar a suíte completa e confirmar que os testes
  existentes continuam passando (nenhum teste referencia hoje os símbolos
  tocados, conforme "Estado atual verificado" acima — se algo quebrar
  inesperadamente, sinalizar no resumo da task e aplicar só o ajuste mínimo
  necessário, sem escrever teste novo).
- Nenhuma migration criada nem executada nesta task.
- Registrar no resumo da task se `TipoRelacionamento` foi de fato removido do
  import de `coleta-respostas-publica.service.ts` (esperado: sim).

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nenhuma migration foi criada/alterada** — o enum Postgres
   `tipo_relacionamento` continua com exatamente 5 valores
   (`autoavaliacao`, `gestor`, `pares`, `subordinado`, `externo`); nenhuma
   linha de `relacionamentos_avaliacao` jamais recebe `'todos_gestores'`
   como `tipo_relacionamento`.
2. **`FiltroRelacionamentoPessoa`** definido exatamente como
   `TipoRelacionamento | 'todos_gestores'` em `common/enums.ts`;
   `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` retipada para
   `FiltroRelacionamentoPessoa[]` com os 4 valores
   (`'pares'`, `'subordinado'`, `'externo'`, `'todos_gestores'`), sem alterar
   `TIPO_RELACIONAMENTO_VALORES`/`TipoRelacionamento` (continuam só com os 5
   valores reais do enum Postgres). Docstrings de ambas as constantes
   atualizadas (a de `TIPO_RELACIONAMENTO_VALORES` não deve mais afirmar que
   valida `filtroRelacionamento`).
3. **`resolverOpcoesPessoa`**: confirmar que o early return
   (`condicoes.length === 0 && !incluirTodosGestores`) não aborta mais
   quando só `'todos_gestores'` está marcado — testar mentalmente o caso
   `filtroRelacionamento: ['todos_gestores']` sozinho (sem `pares`/
   `subordinado`/`externo`) e confirmar que a função efetivamente consulta
   `ciclo_participantes`/`colaboradores` e retorna resultado não vazio quando
   existem gestores participantes.
4. **Consulta de `todos_gestores`**: filtra
   `cp.ciclo_id = relacionamento.cicloId` (mesmo ciclo do envio, não outro),
   `c.eh_gestor = true`, `c.ativo = true`, e exclui explicitamente
   `c.id <> respondenteId` — mesmo respondente sendo gestor não deve aparecer
   na própria lista de opções.
5. **União sem duplicar**: quando `filtroRelacionamento` combina
   `'todos_gestores'` com `'pares'`/`'subordinado'`/`'externo'`, e a mesma
   pessoa é alcançada pelos dois caminhos (ex.: é gestor E também par do
   respondente), o resultado final não deve conter a pessoa duas vezes —
   confirmar que o `Map<string, OpcaoPessoaFormulario>` cobre isso (chave =
   id do colaborador).
6. **Invariante de anonimização (crítico)**: nenhuma query nova desta task
   referencia `Resposta`/`ItemResposta`/`RespostaClima`/`ItemRespostaClima` —
   a branch de `todos_gestores` só faz `SELECT` sobre `ciclo_participantes`
   join `colaboradores`. Qualquer menção a essas 4 entidades dentro da nova
   branch é achado crítico.
7. **Ambos os call sites herdam o comportamento sem edição direta**:
   `buscarFormulario` (linha ~490) e `enviarRespostas` (linha ~586) continuam
   chamando `resolverOpcoesPessoa(relacionamento, pergunta.configuracao)`
   sem parâmetros novos — a validação de envio (`opcoesPessoaPorPergunta` em
   `enviarRespostas`) precisa continuar aceitando exatamente o mesmo conjunto
   de ids ofertado no formulário, já que é a mesma função/mesmos parâmetros.
8. **Import não utilizado**: confirmar que `TipoRelacionamento` foi removido
   do import de `coleta-respostas-publica.service.ts` (linha 8) se não sobrar
   nenhum outro uso no arquivo, e que `FiltroRelacionamentoPessoa` foi
   importado no lugar.
9. **Build/testes**: `npm run build` sem erros novos; `npm test` sem
   regressão na suíte existente (nenhum teste deveria quebrar, conforme
   "Estado atual verificado" do plano — se algo quebrou, o ajuste mínimo
   aplicado deve estar registrado no resumo da task, não uma reescrita ampla
   de teste).
10. **`perguntas.service.ts` inalterado em lógica** — só se beneficia
    automaticamente da allowlist estendida via a constante já importada;
    confirmar que nenhuma lógica nova/duplicada foi adicionada ali
    desnecessariamente.

## Revisão

Leitura completa realizada: `backend/src/common/enums.ts`,
`backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`
(arquivo inteiro), `backend/src/modules/perguntas/perguntas.service.ts`
(arquivo inteiro), `backend/src/modules/ciclo-participantes/ciclo-participante.entity.ts`,
colunas relevantes de `backend/src/modules/colaboradores/colaborador.entity.ts`,
listagem de `backend/src/migrations/*.ts` e grep por
`resolverOpcoesPessoa`/`FiltroRelacionamentoPessoa`/`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`/
`TipoRelacionamento` em todo `backend/src`.

### Sem achados críticos

Verificação item a item dos 10 pontos do plano:

1. **Migration**: confirmado por listagem de `backend/src/migrations/` — o
   arquivo mais recente continua sendo
   `1788600000000-EmailColaboradorOpcional.ts`, nenhum arquivo novo. Nenhuma
   migration criada/alterada nesta task.
2. **`FiltroRelacionamentoPessoa`/`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`**:
   definidos exatamente como especificado
   (`TipoRelacionamento | 'todos_gestores'`; array com os 4 valores
   `'pares'`, `'subordinado'`, `'externo'`, `'todos_gestores'`).
   `TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES` inalterados (5 valores
   reais). Docstrings de ambas as constantes atualizadas conforme o texto
   sugerido pelo plano; a de `TIPO_RELACIONAMENTO_VALORES` não afirma mais
   validar `filtroRelacionamento`.
3. **Early return**: `if (condicoes.length === 0 && !incluirTodosGestores) return []`
   (linha 290). Simulação mental confirma os dois casos exigidos:
   `filtroRelacionamento: ['todos_gestores']` sozinho → `condicoes.length === 0`
   mas `incluirTodosGestores === true` → não retorna cedo, consulta
   `ciclo_participantes`/`colaboradores` normalmente. Filtro vazio ou só com
   valores que nunca contribuem (`[]`, ou hipoteticamente `['autoavaliacao']`)
   → `condicoes.length === 0 && !incluirTodosGestores === true` → retorna
   `[]` sem tocar o banco.
4. **Exclusão do próprio respondente na branch de gestores**:
   `.andWhere('c.id <> :respondenteId', { respondenteId })` presente na query
   `linhasGestores` — confirmado.
5. **`ativo`/`eh_gestor`/escopo por ciclo**: `c.eh_gestor = true`,
   `c.ativo = true` e `cp.ciclo_id = :cicloId` com
   `cicloId: relacionamento.cicloId` (o ciclo do envio, não outro) — todos
   presentes na query `linhasGestores`.
6. **Consistência entre call sites**: `buscarFormulario` (linha 525) e
   `enviarRespostas` (linha 621) continuam chamando
   `resolverOpcoesPessoa(relacionamento, pergunta.configuracao)` sem nenhuma
   edição, com os mesmos parâmetros — grep confirma que são as únicas 2
   chamadas da função em todo `backend/src`. Nenhuma divergência entre o
   conjunto ofertado no formulário e o conjunto aceito na validação de envio.
7. **Nomes de coluna / padrões do projeto**: `cp.ciclo_id`, `cp.colaborador_id`
   batem com `ciclo-participante.entity.ts` (`@Entity('ciclo_participantes')`,
   colunas `ciclo_id`/`colaborador_id`); `c.nome_completo`, `c.eh_gestor`,
   `c.ativo` batem com `colaborador.entity.ts`. Ambas as queries usam
   `createQueryBuilder` com parâmetros nomeados (`:cicloId`, `:respondenteId`)
   — nenhuma interpolação de valor cru na branch nova. Dedupe por
   `Map<string, OpcaoPessoaFormulario>` (`porId`) cobre corretamente os 3
   cenários (simetria de `pares`, múltiplos tipos marcados, pessoa alcançada
   por relação E por `todos_gestores` ao mesmo tempo). `ErroHttp`/`garantirPapel`
   não se aplicam a esta função (rota pública, sem mudança de padrão) — nada
   fora do padrão observado.
8. **Docstring**: atualizada, preserva o texto existente sobre
   `pares`/`gestor`/`subordinado`/`autoavaliacao`/`externo` e acrescenta a
   explicação de `todos_gestores` fielmente ao comportamento implementado.
9. **Invariante de anonimização (crítico, item 6 do plano)**: confirmado por
   leitura direta da função inteira — a branch `todos_gestores` faz
   `SELECT` exclusivamente sobre `CicloParticipante` (`createQueryBuilder('cp')`)
   join `Colaborador`; nenhuma referência a
   `Resposta`/`ItemResposta`/`RespostaClima`/`ItemRespostaClima` em nenhum
   ponto de `resolverOpcoesPessoa` (essas 4 entidades só aparecem, como já
   esperado, dentro de `enviarRespostas`, na transação de escrita de
   respostas — fora do escopo desta função). Nenhuma pergunta tipo `pessoa`
   expõe `avaliador_id`; o retorno é sempre `{ id, nomeCompleto }`.
10. **Import não utilizado**: `TipoRelacionamento` removido do import (grep
    confirma zero ocorrências restantes no arquivo);
    `FiltroRelacionamentoPessoa` importado no lugar e usado no cast de
    `filtro`.
11. **`perguntas.service.ts`**: nenhuma mudança de lógica — só se beneficia
    da allowlist estendida via `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`
    (import por valor, já existente). `POST`/`PUT`/`DELETE`/reordenar
    continuam com `garantirPapel(ator, ['admin', 'gestor_rh'])` inalterado.

### Deveria corrigir

Nenhum item.

### Sugestão

- As duas queries de `resolverOpcoesPessoa` (`linhasRelacao` e
  `linhasGestores`) são independentes entre si mas executadas em sequência
  (`await` uma após a outra). Poderiam rodar em paralelo
  (`Promise.all`) quando ambas se aplicam, reduzindo levemente a latência do
  endpoint público. Impacto baixo (poucas linhas esperadas por consulta),
  não bloqueante.
- Estilo de binding de parâmetro TypeORM inconsistente entre as duas
  queries: `linhasRelacao` usa `.setParameter('respondenteId', respondenteId)`
  ao final, enquanto `linhasGestores` passa `{ respondenteId }` inline no
  próprio `.andWhere(...)`. Ambos funcionalmente corretos e parametrizados
  (sem risco de SQL injection), só uma inconsistência estética dentro da
  mesma função.
- Confirmado por `Glob`: não existe nenhum arquivo `*.test.ts` em
  `backend/src/modules/coleta-respostas-publica/` — `resolverOpcoesPessoa`,
  `buscarFormulario` e `enviarRespostas` seguem sem cobertura automatizada
  (lacuna pré-existente, não introduzida por esta task). A etapa de
  `test-engineer` foi pulada nesta task por pedido explícito do usuário;
  registrando aqui para uma eventual task futura de cobertura, especialmente
  do cenário `todos_gestores` combinado com `pares`/`subordinado` (dedupe) e
  do caso "só `todos_gestores`, sem outros filtros".
- Esta revisão foi feita só com as ferramentas Read/Grep/Glob/Edit
  (sem acesso a shell) — não foi possível executar `npm run build`/`npm test`
  de forma independente para confirmar os números relatados pelo
  `backend-developer` (141 testes, 6 arquivos, sem erro novo de `tsc`). A
  verificação estática (imports resolvidos, sem símbolo não utilizado,
  tipos batendo) não encontrou nenhuma inconsistência que contradiga esse
  relato.

**Conclusão: pode prosseguir** — nenhum achado crítico, nenhum item
"deveria corrigir". A task está pronta para ser considerada concluída
(sem etapa de `test-engineer`, conforme decisão explícita do usuário
registrada no topo do arquivo).
