# Task: Diferenciação de tipo de pesquisa (Avaliação 360 vs Clima/Geral) — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Requisitos já decididos diretamente pelo usuário — etapa
`spec` pulada a pedido explícito, nada abaixo deve ser tratado como pergunta
em aberto (as únicas perguntas em aberto legítimas estão na seção final,
sinalizadas como tal).

Escopo explícito: só a diferenciação de tipo de pesquisa + a geração de
envios para os dois tipos. A tela pública de resposta (`/responder`) continua
FORA de escopo — nenhuma rota pública é tocada aqui.

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano. Módulos
`pesquisas`, `perguntas`, `ciclos-avaliacao`, `ciclo-participantes` e
`envios-pesquisa` já existem, implementados e revisados sem achados críticos
(`.claude/tasks/pesquisas/`, `.claude/tasks/ciclos-avaliacao/`,
`.claude/tasks/envios-pesquisa/task-backend.md`).

### `pesquisas.pesquisa.entity.ts` (hoje, sem `tipo`)

```ts
@Entity('pesquisas')
export class Pesquisa {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar', length: 255 }) titulo!: string
  @Column({ name: 'mensagem_boas_vindas', type: 'text', nullable: true }) mensagemBoasVindas!: string | null
  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true }) logoUrl!: string | null
  @Column({ type: 'enum', enum: STATUS_PESQUISA_VALORES, enumName: 'status_pesquisa', default: 'rascunho' })
  status!: StatusPesquisa
  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true }) cicloId!: string | null
  // ...ManyToOne ciclo, criadoPor, criadoEm, atualizadoEm
}
```

`CriarPesquisaDto` (`titulo`, `mensagemBoasVindas?`, `logoUrl?`) e
`AtualizarPesquisaDto` (`titulo?`, `mensagemBoasVindas?`, `logoUrl?`,
`cicloId?`) não têm `status` nem nenhum campo estrutural travado — o
precedente já existente no projeto para "campo só editável por um endpoint
dedicado" é exatamente `status`: `AtualizarPesquisaDto` não declara `status`,
`pesquisas.service.atualizar()` nunca lê `dto.status`, e a única forma de
mudar `status` é `PATCH /api/pesquisas/:id/status`
(`atualizarStatus`, com `TRANSICOES_VALIDAS` e sem regressão). **Esta task
segue exatamente esse mesmo precedente para `tipo`** (ver decisão 1).

### `perguntas.service.ts` — cadeia de FK real confirmada

`criar()`/`atualizar()` de pergunta já recebem `pesquisaId` como parâmetro
(vindo da URL via `mergeParams: true`, herdado de
`pesquisas.module.ts → paginas-pesquisa.module.ts → perguntas.module.ts`) e
**já buscam a entidade `Pesquisa` completa antes de qualquer outra
validação**:

```ts
export async function criar(ator, pesquisaId: string, paginaId: string, dto: CriarPerguntaDto) {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])
  await buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)
  const pesquisa = await pesquisasService.buscarEntidadeOuFalhar(pesquisaId)
  pesquisasService.garantirEditavel(pesquisa)
  const tipo = validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo')
  // ...
}
```

Mesmo padrão em `atualizar()`. Ou seja: **a cadeia `pergunta → paginaId →
pagina_pesquisa.pesquisaId → pesquisa` já está resolvida no código antes de
qualquer linha desta task rodar** — a validação nova só precisa ler
`pesquisa.tipo` da variável `pesquisa` já existente, **sem nenhuma query
nova**. `buscarPaginaDaPesquisaOuFalhar(pesquisaId, paginaId)` já garante que
`paginaId` pertence a `pesquisaId` (WHERE composto), então não há brecha de
"pergunta apontando pra pesquisa errada" a considerar aqui.

### `ciclos-avaliacao.service.ts`, `atualizarStatus` (transição `rascunho → ativo`)

```ts
if (ciclo.status === 'rascunho' && novoStatus === 'ativo') {
  const totalParticipantes = await AppDataSource.getRepository(CicloParticipante).count({ where: { cicloId: ciclo.id } })
  if (totalParticipantes === 0) throw new ErroHttp(422, 'CICLO_SEM_PARTICIPANTES', '...')

  const pesquisaPublicada = await AppDataSource.getRepository(Pesquisa).findOneBy({
    cicloId: ciclo.id,
    status: 'publicada',
  })
  if (!pesquisaPublicada) throw new ErroHttp(422, 'CICLO_SEM_PESQUISA_PUBLICADA', '...')

  const salvo = await AppDataSource.transaction(async (manager) => {
    await gerarRelacionamentos(manager, ciclo.id)
    await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)
    ciclo.status = novoStatus
    return manager.getRepository(CicloAvaliacao).save(ciclo)
  })
  return mapearCiclo(salvo)
}
```

`pesquisaPublicada` já é resolvida **fora** da transação (janela de corrida
pré-existente, já registrada como "Deveria corrigir" não-crítico nas duas
tasks anteriores — esta task não fecha essa janela, só reaproveita o valor
lido, exatamente como `gerarEnviosPesquisa` já faz hoje). Esta task troca o
corpo do `if` por um branch em `pesquisaPublicada.tipo` (ver decisão 7) —
**nenhuma mudança na checagem `CICLO_SEM_PARTICIPANTES`/
`CICLO_SEM_PESQUISA_PUBLICADA` em si**.

`gerarRelacionamentos` (interna, não exportada) usa
`ciclo_participantes` + `colaboradores.gestorId` para derivar
`autoavaliacao`/`gestor`/`subordinado`/`pares` e insere em
`relacionamentos_avaliacao` com `.orIgnore()`. **Nunca gera `'externo'`**
(fora deste motor). Não precisa de nenhuma mudança nesta task — só deixa de
ser chamada quando `pesquisaPublicada.tipo === 'clima_geral'`.

### `envios-pesquisa.service.ts` (versão atual completa já lida)

```ts
export async function gerarEnviosPesquisa(manager: EntityManager, cicloId: string, pesquisaId: string): Promise<void> {
  const relacionamentos = await manager.getRepository(RelacionamentoAvaliacao).find({ where: { cicloId } })
  if (relacionamentos.length === 0) return
  await manager.createQueryBuilder().insert().into(EnvioPesquisa)
    .values(relacionamentos.map((r) => ({ pesquisaId, relacionamentoId: r.id, status: 'pendente' as const })))
    .orIgnore().execute()
}

async function buscarEnvioDoCicloOuFalhar(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .where('e.id = :envioId', { envioId })
    .andWhere('r.ciclo_id = :cicloId', { cicloId })
    .getOne()
  // ...
}
```

`listarPorCiclo`/`buscarEnvioComNomes` seguem o mesmo padrão: **sempre**
`INNER JOIN relacionamentos_avaliacao` para filtrar "envios deste ciclo".
**Isso quebra para `clima_geral`**: envios gerados sem relacionamento
(`relacionamento_id = NULL`) seriam excluídos por um `INNER JOIN`. Esta task
precisa trocar esse padrão de filtro (ver decisão 5) — impacta
`buscarEnvioDoCicloOuFalhar`, `buscarEnvioComNomes`, `listarPorCiclo`, e por
consequência `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio` (que só
chamam essas duas funções, sem lógica própria de filtro).

`EnvioPesquisa` entity hoje: `relacionamentoId` é `uuid` **não-nulo**
(`@Column({ name: 'relacionamento_id', type: 'uuid' })`, sem `nullable`).
Migration `1788350000000-CriarEnviosPesquisa.ts` (não rodada contra nenhum
banco real): `relacionamento_id uuid NOT NULL REFERENCES
relacionamentos_avaliacao(id) ON DELETE CASCADE`, `UNIQUE (pesquisa_id,
relacionamento_id)` sem nome explícito. **Não editar esse arquivo in-place**
(pertence a uma task já fechada) — esta task cria uma migration nova
(`ALTER TABLE`) com timestamp maior.

### `ciclo-participantes.ciclo-participante.entity.ts`

```ts
@Entity('ciclo_participantes')
export class CicloParticipante {
  id, cicloId, ciclo (ManyToOne CASCADE), colaboradorId, colaborador (ManyToOne CASCADE), criadoEm
}
```

Já existe e já é populada antes da ativação do ciclo (rota
`POST /api/ciclos/:cicloId/participantes`, fora de escopo desta task) —
`gerarEnviosClima` (nova, ver 1.6) só faz `find({ where: { cicloId } })` e
mapeia `colaboradorId`.

### `MAPA_CONSTRAINT_PARA_CODIGO` (`tratadorErros.ts`), lido por completo

```ts
const MAPA_CONSTRAINT_PARA_CODIGO: Record<string, string> = {
  uq_colaboradores_cpf: 'CPF_DUPLICADO',
  uq_colaboradores_email: 'EMAIL_DUPLICADO',
  uq_colaboradores_usuario_auth_id: 'USUARIO_AUTH_DUPLICADO',
  uq_competencias_nome: 'COMPETENCIA_NOME_DUPLICADO',
  uq_paginas_pesquisa_pesquisa_ordem: 'PAGINA_ORDEM_DUPLICADA',
  uq_perguntas_pagina_ordem: 'PERGUNTA_ORDEM_DUPLICADA',
  uq_ciclo_participantes_ciclo_colaborador: 'CICLO_PARTICIPANTE_DUPLICADO',
}
```

Nenhuma entrada para `envios_pesquisa` hoje (decisão já tomada: o único
`INSERT` é o motor de ativação, que usa `.orIgnore()`). Esta task mantém essa
lógica (ver decisão 10).

### `common/enums.ts` (trecho relevante já existente)

`TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES`,
`StatusEnvio`/`STATUS_ENVIO_VALORES` já existem, reaproveitados tal qual.
Nenhum enum `TipoPesquisa` existe ainda — criado por esta task.

### Frontend já consome o endpoint que muda de shape (fora de escopo, só um aviso)

`frontend/src/services/enviosPesquisaService.ts` e
`frontend/src/types/envio.ts` já consomem `GET /api/ciclos/:cicloId/envios`
como `EnvioPesquisa[]` (array plano, sem wrapper, sem `origem`/`destinatario`).
**Esta task muda esse contrato** (ver decisão 8) — o shape novo é uma
mudança que quebra esse consumo atual. Isso é esperado e **fora do escopo
desta task** (só backend), mas precisa ser sinalizado explicitamente: uma
`task-frontend.md` futura precisa atualizar esses três arquivos (o
service, o type e `CicloDetalhePage.tsx`) para o novo contrato documentado
na seção 1.10 abaixo. Não é uma "Pergunta em aberto" no sentido de dúvida —
é uma consequência direta e já esperada da decisão de shape, só registrada
aqui para não ser descoberta tarde.

## Decisões de modelagem (com justificativa)

1. **`pesquisas.tipo`: enum Postgres novo `tipo_pesquisa` (`avaliacao_360`,
   `clima_geral`), coluna `NOT NULL DEFAULT 'avaliacao_360'`, imutável após a
   criação.** Escolhido opcionalmente em `POST /api/pesquisas`
   (`CriarPesquisaDto.tipo?`, default `'avaliacao_360'` se omitido — mesmo
   default do banco, então mesmo se o service não default-asse explicitamente
   o banco resolveria, mas o service default-a de forma explícita para o
   valor de retorno do `POST` já vir correto sem depender de um round-trip).
   **Nunca aceito em `PUT /api/pesquisas/:id`**: `AtualizarPesquisaDto`
   simplesmente **não declara** o campo `tipo` (mesmo critério já usado para
   `status` nesse mesmo DTO — ver "Estado atual verificado"), e
   `pesquisas.service.atualizar()` nunca lê `dto.tipo`. Um cliente que envie
   `{ tipo: '...' }` no `PUT` tem o campo silenciosamente ignorado (mesmo
   comportamento hoje para `status` enviado ali) — **não é um erro 422
   dedicado**, é a mesma ausência estrutural já usada no projeto para
   "isto não é editável por este endpoint". Justificativa de manter o
   default no banco também: qualquer `INSERT` futuro que não passe por
   `pesquisas.service.criar()` (ex.: seed/script) ainda cai em
   `avaliacao_360`, o tipo mais restritivo/mais testado hoje.
2. **Migration nova, só `ALTER TABLE`/`CREATE TYPE`/`CREATE INDEX`, timestamp
   maior que `1788350000000`.** Não edita nenhuma das 3 migrations
   existentes (`CriarPesquisasPaginasPerguntasCompetencias`,
   `CriarCiclosAvaliacaoRelacionamentosEParticipantes`,
   `CriarEnviosPesquisa`) — todas pertencem a tasks já fechadas. **Não
   executar contra nenhum banco real sem confirmação explícita do usuário**
   (mesma regra de todas as migrations anteriores — nenhuma delas rodou
   ainda, então esta é cumulativa sobre um banco que também nunca rodou
   nada).
3. **Validação `pessoa` × `clima_geral`: código novo `422
   TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA`, checado em `criar()` E
   `atualizar()` de `perguntas.service.ts`, reaproveitando a variável
   `pesquisa` (já buscada por essas duas funções antes desta task) — nenhuma
   query nova.** Justificativa da regra em si: pergunta tipo `pessoa`
   pressupõe escolher uma pessoa dentro de um universo
   avaliador↔avaliado (`configuracao.filtroRelacionamento`, valores de
   `TIPO_RELACIONAMENTO_VALORES`), que só existe via
   `relacionamentos_avaliacao` — tabela que pesquisas `clima_geral` **nunca**
   populam (decisão 6). Uma pergunta `pessoa` numa pesquisa `clima_geral`
   nunca teria como ser respondida de forma coerente. Em `atualizar()`, a
   checagem usa `tipoResultante` (o tipo após aplicar `dto.tipo`, se
   enviado, senão o tipo já persistido) — mesmo padrão já usado pelo código
   existente para revalidar `configuracao`/`competenciaIds` contra o tipo
   resultante.
4. **`envios_pesquisa.relacionamento_id` vira nullable; nova coluna
   `colaborador_id uuid nullable REFERENCES colaboradores(id) ON DELETE
   CASCADE`; `CHECK chk_envios_pesquisa_origem_exclusiva ((relacionamento_id
   IS NOT NULL) <> (colaborador_id IS NOT NULL))`.** `ON DELETE CASCADE` em
   `colaborador_id` espelha o mesmo comportamento já usado em
   `relacionamento_id` e em `ciclo_participantes.colaborador_id` — remover um
   colaborador remove os envios de clima endereçados a ele (mesma política
   de integridade referencial já aplicada em todo o domínio).
5. **Índice único novo `uq_envios_pesquisa_colaborador` é um ÍNDICE ÚNICO
   PARCIAL (`CREATE UNIQUE INDEX ... ON envios_pesquisa (pesquisa_id,
   colaborador_id) WHERE colaborador_id IS NOT NULL`), não uma constraint
   `UNIQUE` de tabela.** Justificativa (a análise pedida explicitamente pelo
   usuário): a `UNIQUE (pesquisa_id, relacionamento_id)` existente **já não
   protege nada para linhas de clima**, porque nessas linhas
   `relacionamento_id` é sempre `NULL`, e o Postgres trata cada `NULL` como
   distinto em constraints `UNIQUE` — ou seja, um `UNIQUE (pesquisa_id,
   colaborador_id)` comum (constraint de tabela, não parcial) **também não
   bloquearia** duplicatas de `(pesquisa_id, colaborador_id)` se
   `colaborador_id` pudesse ser `NULL` nessas linhas — mas aqui o caso é o
   oposto: quando `colaborador_id` **é preenchido** (linhas de clima), ele
   nunca é `NULL`, então um índice único parcial restrito a `WHERE
   colaborador_id IS NOT NULL` aplica unicidade real e completa sobre
   exatamente o subconjunto de linhas que importa, sem nenhum efeito sobre as
   linhas de `avaliacao_360` (que têm `colaborador_id IS NULL` e nunca
   entram nesse índice). Alternativa descartada: `ADD CONSTRAINT ... UNIQUE
   NULLS NOT DISTINCT` (sintaxe do Postgres 15+) — descartada por não haver
   confirmação da versão do Postgres do ambiente-alvo (Supabase); o índice
   parcial é sintaxe portável para qualquer versão suportada. A `.orIgnore()`
   do `gerarEnviosClima` (decisão 6) não precisa referenciar esse índice por
   nome — `.orIgnore()` do TypeORM gera `ON CONFLICT DO NOTHING` sem
   `target`, que absorve violação de **qualquer** constraint/índice único,
   mesmo padrão já usado por `gerarRelacionamentos`/`gerarEnviosPesquisa`.
6. **`gerarEnviosClima(manager, cicloId, pesquisaId)`: função interna nova em
   `envios-pesquisa.service.ts`, chamada só quando `pesquisaPublicada.tipo
   === 'clima_geral'`, NUNCA chama `gerarRelacionamentos` nem grava em
   `relacionamentos_avaliacao`.** Itera `ciclo_participantes` do ciclo (1
   `find`, mesmo padrão de `gerarRelacionamentos`) e insere 1
   `envios_pesquisa` por participante com `colaboradorId` preenchido e
   `relacionamentoId: null`, `.orIgnore()` para idempotência (mesmo padrão
   das duas funções irmãs). Guard rail explícito (ver seção própria):
   nenhuma linha desta função nem de nenhuma outra função nova desta task
   grava em `relacionamentos_avaliacao`.
7. **Branch em `ciclos-avaliacao.service.ts`, `atualizarStatus`, por
   `pesquisaPublicada.tipo`** (a mesma variável já resolvida pela checagem
   `CICLO_SEM_PESQUISA_PUBLICADA` existente, sem nova consulta):
   `avaliacao_360` → `gerarRelacionamentos` + `gerarEnviosPesquisa` (fluxo
   atual, intacto); `clima_geral` → só `gerarEnviosClima`. Import novo:
   `gerarEnviosClima` de `../envios-pesquisa/envios-pesquisa.service`
   (mesma direção de import já permitida e documentada na task anterior:
   `ciclos-avaliacao.service.ts → envios-pesquisa.service.ts`, função
   utilitária pura, sem `garantirPapel` de novo).
8. **Shape de resposta: união discriminada por item (`origem: 'relacionamento'
   | 'colaborador'`) + `tipoPesquisa` no nível superior da listagem, não
   repetido por item.** Duas decisões dentro desta, cada uma justificada:
   - **Por que discriminar por item em vez de campos todos opcionais numa
     única interface achatada**: o pedido pede explicitamente para "decidir
     entre união discriminada vs. campos opcionais". Uma união discriminada
     (`EnvioAvaliacao360Resposta | EnvioClimaGeralResposta`, com um campo
     `origem` como *discriminant*) permite ao TypeScript (e ao frontend, ao
     consumir) estreitar o tipo com um simples `if (envio.origem ===
     'relacionamento')` sem nenhum campo "presente mas `undefined`" a
     considerar — mais seguro que campos todos opcionais, onde nada no
     compilador impede acessar `avaliadorNome` num item que na verdade é de
     clima. O nome do campo discriminante é `origem` (não `tipoPesquisa`,
     ver próximo ponto) porque descreve a proveniência estrutural do **envio
     individual** (veio de um `relacionamento_id` ou de um `colaborador_id`
     direto) — irrelevante a `tipoPesquisa`, que é uma propriedade da
     pesquisa/ciclo como um todo.
   - **Por que `tipoPesquisa` só no nível da listagem, não repetido em cada
     item**: uma única ativação de ciclo sempre gera envios para uma única
     pesquisa (`pesquisaPublicada.id`, o mesmo argumento passado tanto a
     `gerarEnviosPesquisa` quanto a `gerarEnviosClima`) — logo todo item de
     uma mesma resposta de `GET /api/ciclos/:cicloId/envios` sempre tem a
     mesma origem estrutural. Repetir `tipoPesquisa` em cada item seria
     redundante (mesmo valor centenas de vezes) sem ganho de segurança de
     tipo (`origem` já discrimina o item). Colocá-lo uma vez no nível do
     envelope (`{ tipoPesquisa, envios: [...] }`) dá ao frontend um único
     `if` para decidir qual seção/colunas de tabela renderizar, antes mesmo
     de iterar o array. **Alternativa descartada**: expor `tipoPesquisa` em
     `GET /api/ciclos/:id` (`CicloResposta`) em vez de (ou além) de aqui —
     descartada para esta task por exigir tocar o módulo já fechado
     `ciclos-avaliacao` com uma nova consulta a `pesquisas` dentro de
     `mapearCiclo`/`listar`/`buscarPorId` (hoje síncrono, viraria
     assíncrono), e por reintroduzir a mesma ambiguidade "qual pesquisa é *a*
     pesquisa do ciclo" já documentada como pergunta em aberto não resolvida
     da task de `envios-pesquisa` (não há constraint de unicidade "no máximo
     uma pesquisa publicada por ciclo"). Manter o campo na resposta de
     `envios` evita essa ambiguidade porque deriva de dados que **já
     existem** por construção (o `pesquisa_id` gravado em cada linha de
     `envios_pesquisa`), não de uma nova busca "qual é a pesquisa deste
     ciclo". Sinalizado como decisão revisitável em "Perguntas em aberto".
   - **`tipoPesquisa` é `null` somente quando `envios` está vazio** (ciclo
     ainda não ativado — nenhum envio foi gerado ainda, já que a geração só
     roda em `atualizarStatus`). Documentado explicitamente no tipo/JSDoc
     para o frontend nunca confundir esse `null` com um erro.
   - Campos comuns aos dois braços da união: `id`, `status`, `link`,
     `quantidadeLembretes`, `cpfConfirmadoEm`, `concluidoEm` — idênticos ao
     shape anterior (sem regressão nenhuma nesses 6 campos).
   - Braço `avaliacao_360` (`origem: 'relacionamento'`): `avaliadorId`,
     `avaliadorNome`, `avaliadoId`, `avaliadoNome`, `tipoRelacionamento` —
     **exatamente os mesmos 5 campos já existentes hoje**, sem renomear
     nada (zero-diff pro braço que já existia).
   - Braço `clima_geral` (`origem: 'colaborador'`): **um único campo
     genérico `destinatario: { id: string; nomeCompleto: string }`**
     (conforme pedido explicitamente pelo usuário) — nunca
     `avaliador`/`avaliado`/`tipoRelacionamento`, que não fazem sentido
     nesse braço.
9. **Anonimização de pares/subordinado permanece exclusiva de
   `avaliacao_360` e não muda nesta task.** `origem: 'colaborador'`
   (clima) nunca passa pela lógica de `minimo_respostas_pares` nem pelas
   views `respostas_identificadas`/`respostas_pares_agregadas` (que ainda
   nem existem — são de uma task futura de respostas). Ver seção "Guard
   rails de anonimização" abaixo para a lista completa de garantias.
10. **Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`
    (`tratadorErros.ts`).** Mesma justificativa já usada na task anterior
    para as duas constraints de `envios_pesquisa`: a nova `CHECK
    chk_envios_pesquisa_origem_exclusiva` só poderia ser violada por um
    `INSERT`/`UPDATE` que a aplicação nunca faz (`gerarEnviosPesquisa`
    sempre popula só `relacionamentoId`; `gerarEnviosClima` sempre popula só
    `colaboradorId`; nenhuma rota HTTP faz `INSERT`/`UPDATE` direto nessas
    colunas) — e o índice único parcial `uq_envios_pesquisa_colaborador` só
    poderia ser violado pelo mesmo único `INSERT` de `gerarEnviosClima`, que
    já usa `.orIgnore()`. Nenhum cliente HTTP jamais aciona essas violações
    de verdade.
11. **`pesquisas.service.duplicar()` copia `tipo` da pesquisa original**
    (`tipo: detalheOriginal.tipo`, ao lado de `titulo`/`mensagemBoasVindas`/
    `logoUrl` já copiados) — sem isso, duplicar uma pesquisa `clima_geral`
    silenciosamente viraria `avaliacao_360` (o default do banco), o que
    contradiz a garantia de "tipo escolhido na criação" — duplicar É uma
    criação nova, e o tipo correto a herdar é o da original, não o default.
12. **Nenhuma rota HTTP nova.** Todas as mudanças desta task são: (a) um
    campo novo em DTOs/entidades/respostas de rotas já existentes de
    `pesquisas`/`perguntas`, (b) uma validação nova (422) em rotas já
    existentes de `perguntas`, (c) uma migration `ALTER TABLE`, (d) uma
    troca do corpo interno de `atualizarStatus` (mesma rota `PATCH
    /api/ciclos/:id/status` já existente) e (e) uma troca do *shape* de
    resposta de `GET /api/ciclos/:cicloId/envios` (mesma rota, mesmo path,
    mesmos papéis). Nenhum arquivo `*.module.ts` precisa de uma linha nova
    de `router.get/post/put/patch/delete`.

## Guard rails de anonimização (aplicam-se a toda a task)

- **`clima_geral` nunca gera `relacionamentos_avaliacao`.** `gerarEnviosClima`
  (1.6) não importa, não referencia e não escreve em
  `RelacionamentoAvaliacao`/`relacionamentos_avaliacao` em nenhuma linha —
  só lê `CicloParticipante` e escreve em `EnvioPesquisa`. O branch em
  `atualizarStatus` (1.7) chama `gerarRelacionamentos` **apenas** dentro do
  `if (pesquisaPublicada.tipo === 'avaliacao_360')` — nunca no branch
  `clima_geral`, nem antes do `if`.
- **A regra de `minimo_respostas_pares`/anonimização de `pares`/`subordinado`
  (`ciclos_avaliacao.minimo_respostas_pares`, views
  `respostas_identificadas`/`respostas_pares_agregadas`) é específica de
  `tipo_relacionamento` — dimensão que **não existe** em envios com
  `origem: 'colaborador'`.** Nenhuma função desta task aplica, simula ou
  referencia essa regra para linhas de clima — não haveria nem
  `tipoRelacionamento` para checar. Nenhuma query desta task junta
  `itens_resposta`/`respostas` (nenhuma das duas tabelas existe ainda) com
  `colaborador_id` nem com `avaliador_id`.
- **`GET /api/ciclos/:cicloId/envios` com `origem: 'colaborador'` expõe
  `destinatario` (colaborador **identificado**) a `admin`/`gestor_rh`.**
  Isso é aceitável e não é uma regressão de anonimização: é dado
  **estrutural de controle de envio** (quem foi convidado a responder a
  pesquisa de clima), não uma **resposta**. Mesma natureza e mesmo nível de
  restrição de acesso que `avaliadorNome`/`avaliadoNome` já expostos hoje
  para `avaliacao_360` (ambos já restritos a `admin`/`gestor_rh` via
  `garantirPapel`, nunca a `colaborador`). Quando a task futura de respostas
  de clima existir, ela precisa manter as **respostas em si** estruturalmente
  anônimas (ver próximo ponto) — mas o registro de "para quem o link foi
  gerado" nunca foi, e continua não sendo, a parte sensível.
- **Preparação (não implementação) para respostas futuras de `clima_geral`
  estruturalmente anônimas** (requisito 6 do pedido, deliberadamente NÃO
  implementado nesta task): nenhuma função nova desta task assume que todo
  `envios_pesquisa` tem um relacionamento identificado por trás —
  `buscarEnvioDoCicloOuFalhar`/`buscarEnvioComNomes`/`listarPorCiclo` (ver
  1.5) usam `LEFT JOIN` (nunca `INNER JOIN`) para
  `relacionamentos_avaliacao`/colaborador-avaliador/colaborador-avaliado, e
  tratam `relacionamento_id/colaborador_id` como mutuamente exclusivos e
  ambos possivelmente ausentes de dado identificado dependendo do branch.
  Uma futura tabela de respostas de clima (nome hipotético
  `respostas_clima`, fora de escopo) deveria referenciar só `envio_id`
  (nunca `colaborador_id`/`relacionamento_id` diretamente) para preservar a
  garantia de "rastreamento só via envio, sem FK de identidade na resposta"
  — texto do pedido, registrado aqui só como intenção de design, não
  implementado.
- **Nenhuma rota nova ou alterada por esta task é acessível por
  `colaborador`.** `garantirPapel(ator, ['admin', 'gestor_rh'])` continua
  sendo a primeira linha de toda função exportada de
  `envios-pesquisa.service.ts`/`pesquisas.service.ts`/`perguntas.service.ts`
  que recebe `ator` — nenhuma mudança nesse padrão. `autenticar` continua
  montado nos mesmos módulos, sem remoção.
- **Single-tenant**: nenhuma coluna/parâmetro `organization_id` introduzido
  em nenhum lugar desta task.

## Plano — Backend

### 1. backend-developer

Antes de codar: invocar a skill `backend-modulo-crud` (mudança em módulo
CRUD existente) e reler a skill `backend-anonimizacao-respostas` (via
`Skill` tool) — esta task não expõe nenhuma resposta, mas introduz um
segundo modelo de envio (clima) ao lado do modelo já sensível de
avaliador↔avaliado, então a skill deve ser conferida linha a linha contra a
seção "Guard rails de anonimização" acima antes de escrever qualquer query.

#### 1.1 Enum (`src/common/enums.ts`)

Adicionar ao final do arquivo:

```ts
/**
 * Reflete o enum Postgres `tipo_pesquisa`, criado pela migration desta task
 * (`ALTER TABLE pesquisas ADD COLUMN tipo ...`). Escolhido em
 * `POST /api/pesquisas` e IMUTÁVEL depois — `AtualizarPesquisaDto` não
 * declara este campo (mesmo critério já usado para `status`, que só muda via
 * `PATCH /api/pesquisas/:id/status`). `avaliacao_360` gera
 * `relacionamentos_avaliacao` + envios ligados a eles na ativação do ciclo;
 * `clima_geral` gera envios ligados diretamente a `ciclo_participantes`,
 * SEM `relacionamentos_avaliacao` (ver `ciclos-avaliacao.service.ts`,
 * `atualizarStatus`, e `envios-pesquisa.service.ts`, `gerarEnviosClima`).
 */
export type TipoPesquisa = 'avaliacao_360' | 'clima_geral'

export const TIPO_PESQUISA_VALORES: TipoPesquisa[] = ['avaliacao_360', 'clima_geral']
```

#### 1.2 Migration nova (`src/migrations/<timestamp>-DiferenciarTipoPesquisaEEnviosClima.ts`)

Timestamp maior que `1788350000000` (usar `1788400000000` se nenhum outro
timestamp maior tiver sido gerado entretanto — não reutilizar nenhum número
já usado; se outra migration tiver sido criada nesse intervalo, escolher um
valor maior que a última existente no momento da implementação).
**Não rodar esta migration contra nenhum banco real sem confirmação
explícita do usuário.**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Diferenciação de tipo de pesquisa (Avaliação 360 vs Clima/Geral) — só
 * ALTER TABLE/CREATE TYPE/CREATE INDEX sobre tabelas já existentes. NÃO edita
 * nenhuma das 3 migrations anteriores (todas de tasks já fechadas):
 * `CriarPesquisasPaginasPerguntasCompetencias`,
 * `CriarCiclosAvaliacaoRelacionamentosEParticipantes`, `CriarEnviosPesquisa`.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class DiferenciarTipoPesquisaEEnviosClima1788400000000 implements MigrationInterface {
  name = 'DiferenciarTipoPesquisaEEnviosClima1788400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE tipo_pesquisa AS ENUM ('avaliacao_360', 'clima_geral')`,
    )

    await queryRunner.query(`
      ALTER TABLE pesquisas
        ADD COLUMN tipo tipo_pesquisa NOT NULL DEFAULT 'avaliacao_360'
    `)

    // relacionamento_id vira opcional — envios de pesquisas `clima_geral`
    // não têm relacionamento avaliador↔avaliado por trás.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ALTER COLUMN relacionamento_id DROP NOT NULL
    `)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE
    `)

    // Exatamente um dos dois preenchido — nunca os dois, nunca nenhum.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (colaborador_id IS NOT NULL))
    `)

    // A UNIQUE (pesquisa_id, relacionamento_id) já existente NÃO cobre o
    // caso clima (relacionamento_id é sempre NULL nessas linhas, e o
    // Postgres trata cada NULL como distinto em UNIQUE) — índice único
    // PARCIAL novo, restrito às linhas onde colaborador_id é preenchido.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_colaborador
        ON envios_pesquisa (pesquisa_id, colaborador_id)
        WHERE colaborador_id IS NOT NULL
    `)

    await queryRunner.query(
      `CREATE INDEX idx_envios_colaborador ON envios_pesquisa (colaborador_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_envios_colaborador`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_colaborador`)
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN colaborador_id`)
    // Nota: só reversível sem erro se não existir nenhuma linha com
    // relacionamento_id NULL no momento do revert (ou seja, nenhum envio de
    // clima_geral foi gerado) — mesma limitação inerente de qualquer
    // ALTER COLUMN ... SET NOT NULL sobre dado pré-existente incompatível.
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa ALTER COLUMN relacionamento_id SET NOT NULL`,
    )
    await queryRunner.query(`ALTER TABLE pesquisas DROP COLUMN tipo`)
    await queryRunner.query(`DROP TYPE tipo_pesquisa`)
  }
}
```

**Nomes a usar exatamente**: enum `tipo_pesquisa`; coluna `pesquisas.tipo`;
coluna `envios_pesquisa.colaborador_id`; constraint
`chk_envios_pesquisa_origem_exclusiva`; índice único parcial
`uq_envios_pesquisa_colaborador`; índice `idx_envios_colaborador` (mesmo
padrão sem sufixo `_id` de `idx_envios_pesquisa`/`idx_envios_relacionamento`/
`idx_envios_status`, exceto pelo próprio nome da coluna referenciada, mesmo
estilo do índice irmão `idx_envios_relacionamento`).

#### 1.3 Entidade `Pesquisa` (`pesquisas/pesquisa.entity.ts`)

Adicionar import e coluna:

```ts
import { STATUS_PESQUISA_VALORES, TIPO_PESQUISA_VALORES, type StatusPesquisa, type TipoPesquisa } from '../../common/enums'
// ...
  @Column({
    type: 'enum',
    enum: TIPO_PESQUISA_VALORES,
    enumName: 'tipo_pesquisa',
    default: 'avaliacao_360',
  })
  tipo!: TipoPesquisa
```

(Posicionar logo após `status`, antes de `cicloId` — ordem não é
funcionalmente relevante, só legibilidade, espelhando a ordem de colunas da
migration.)

#### 1.4 Entidade `EnvioPesquisa` (`envios-pesquisa/envio-pesquisa.entity.ts`)

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { STATUS_ENVIO_VALORES, type StatusEnvio } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

@Entity('envios_pesquisa')
export class EnvioPesquisa {
  @PrimaryGeneratedColumn('uuid') id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' }) pesquisaId!: string
  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  // Nullable a partir desta task — NULL para envios de pesquisas
  // `clima_geral` (ver `colaboradorId` abaixo). Exatamente um dos dois é
  // preenchido, garantido pelo CHECK `chk_envios_pesquisa_origem_exclusiva`
  // no banco — a aplicação nunca deve gravar os dois ou nenhum.
  @Column({ name: 'relacionamento_id', type: 'uuid', nullable: true })
  relacionamentoId!: string | null
  @ManyToOne(() => RelacionamentoAvaliacao, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relacionamento_id' })
  relacionamento!: RelacionamentoAvaliacao | null

  // Novo nesta task — preenchido SÓ para envios de pesquisas `clima_geral`
  // (1 por `ciclo_participantes`, sem relacionamento avaliador↔avaliado).
  // Nunca gerado/lido junto de `relacionamentoId` na mesma linha.
  @Column({ name: 'colaborador_id', type: 'uuid', nullable: true })
  colaboradorId!: string | null
  @ManyToOne(() => Colaborador, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colaborador_id' })
  colaborador!: Colaborador | null

  @Column({ type: 'enum', enum: STATUS_ENVIO_VALORES, enumName: 'status_envio', default: 'pendente' })
  status!: StatusEnvio

  @Column({ name: 'token_acesso', type: 'uuid', unique: true })
  tokenAcesso!: string

  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm!: Date | null

  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null

  @Column({ name: 'quantidade_lembretes', type: 'smallint', default: 0 })
  quantidadeLembretes!: number

  @Column({ name: 'cpf_confirmado_em', type: 'timestamptz', nullable: true })
  cpfConfirmadoEm!: Date | null

  @Column({ name: 'tentativas_cpf_invalidas', type: 'smallint', default: 0 })
  tentativasCpfInvalidas!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

(Colunas de `enviadoEm` até `criadoEm` sem nenhuma mudança de valor — só
reproduzidas aqui por completude do arquivo. A única mudança de fato é
`relacionamentoId`/`relacionamento` ganharem `nullable`/`| null` e o bloco
novo `colaboradorId`/`colaborador`.)

#### 1.5 DTOs de `pesquisas`

`dto/criar-pesquisa.dto.ts`:

```ts
import type { TipoPesquisa } from '../../../common/enums'

/**
 * `tipo` é opcional (default `'avaliacao_360'`, resolvido em
 * `pesquisas.service.criar()`) e IMUTÁVEL depois de criada — nunca aceito
 * por `AtualizarPesquisaDto` (ver esse arquivo, mesmo critério já usado
 * para `status`).
 */
export interface CriarPesquisaDto {
  titulo: string
  mensagemBoasVindas?: string
  logoUrl?: string
  tipo?: TipoPesquisa
}
```

`dto/atualizar-pesquisa.dto.ts`: **sem mudança de campos** — só adicionar um
comentário explícito (evita que uma pessoa lendo o arquivo isolado ache que
`tipo` foi esquecido):

```ts
/**
 * `tipo` (enum `tipo_pesquisa`) é IMUTÁVEL após a criação — deliberadamente
 * NÃO declarado aqui. `pesquisas.service.atualizar()` nunca lê `dto.tipo`;
 * um cliente que o envie neste PUT tem o campo silenciosamente ignorado
 * (mesmo critério já usado para `status`, que só muda via
 * `PATCH /api/pesquisas/:id/status`).
 */
export interface AtualizarPesquisaDto {
  titulo?: string
  mensagemBoasVindas?: string | null
  logoUrl?: string | null
  cicloId?: string | null
}
```

#### 1.6 `pesquisas.service.ts`

Import novo: `TIPO_PESQUISA_VALORES`, `type TipoPesquisa` de
`../../common/enums` (adicionar aos imports já existentes de
`common/enums`).

`PesquisaRespostaLista`/`PesquisaRespostaDetalhe`: adicionar `tipo:
TipoPesquisa` a ambas as interfaces (logo após `status`).

`mapearPesquisaLista`: adicionar `tipo: pesquisa.tipo,` ao objeto retornado
(logo após `status: pesquisa.status,`).

`montarDetalhe`: adicionar `tipo: pesquisa.tipo,` ao objeto retornado (logo
após `status: pesquisa.status,`).

`criar()`:

```ts
export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarPesquisaDto,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const titulo = validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 2, max: 255 })
  // ...mensagemBoasVindas, logoUrl inalterados...

  const tipo =
    dto.tipo !== undefined ? validarEnum(dto.tipo, TIPO_PESQUISA_VALORES, 'tipo') : 'avaliacao_360'

  const nova = repositorio().create({
    titulo,
    mensagemBoasVindas,
    logoUrl,
    cicloId: null,
    status: 'rascunho',
    tipo,
  })

  const salva = await repositorio().save(nova)
  return montarDetalhe(ator, salva)
}
```

`atualizar()`: **nenhuma linha nova relacionada a `tipo`** — `dto.tipo` não
existe no tipo `AtualizarPesquisaDto`, então não há nada a ler nem a
bloquear explicitamente (a ausência estrutural já é o bloqueio, ver decisão
1). Adicionar só um comentário de uma linha no topo da função:

```ts
export async function atualizar(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarPesquisaDto,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  // `tipo` é imutável após a criação — `AtualizarPesquisaDto` não declara
  // esse campo (ver dto/atualizar-pesquisa.dto.ts), então não há nada a
  // ler/bloquear aqui além de nunca reintroduzir o campo neste DTO.

  if (dto.titulo !== undefined) {
    // ...resto da função sem nenhuma outra mudança...
```

`duplicar()`: dentro do `AppDataSource.transaction`, no `pesquisaRepo.save(pesquisaRepo.create({ ... }))`, adicionar `tipo: detalheOriginal.tipo,`:

```ts
    const novaPesquisa = await pesquisaRepo.save(
      pesquisaRepo.create({
        titulo: `${detalheOriginal.titulo} (cópia)`,
        mensagemBoasVindas: detalheOriginal.mensagemBoasVindas,
        logoUrl: detalheOriginal.logoUrl,
        status: 'rascunho',
        cicloId: null,
        tipo: detalheOriginal.tipo,
      }),
    )
```

`listar()`, `buscarPorId()`, `atualizarStatus()`, `remover()`: **nenhuma
mudança** além de herdarem `tipo` automaticamente via
`mapearPesquisaLista`/`montarDetalhe` (já ajustados acima).

#### 1.7 `perguntas.service.ts`

Nenhum import novo necessário (`pesquisasService` e `ErroHttp` já
importados). Duas inserções pontuais:

Em `criar()`, logo após `const tipo = validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo')`:

```ts
  const tipo = validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo')

  // Nova nesta task: pergunta `pessoa` pressupõe um universo
  // avaliador↔avaliado (relacionamentos_avaliacao), que só existe para
  // pesquisas `avaliacao_360` — `clima_geral` nunca gera
  // relacionamentos_avaliacao (ver ciclos-avaliacao.service.ts,
  // atualizarStatus). `pesquisa` já foi buscada acima, nenhuma query nova.
  if (tipo === 'pessoa' && pesquisa.tipo === 'clima_geral') {
    throw new ErroHttp(
      422,
      'TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA',
      'Pergunta do tipo "pessoa" não é permitida em pesquisas do tipo "clima_geral".',
    )
  }

  const enunciado = validarTextoObrigatorio(dto.enunciado, { campo: 'enunciado', min: 2 })
```

Em `atualizar()`, logo após `const tipoResultante = ...`:

```ts
  const tipoResultante =
    dto.tipo !== undefined ? validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo') : pergunta.tipo

  // Mesma regra de criar() — revalidada mesmo quando `dto.tipo` não é
  // reenviado, para o caso (hoje inatingível pela própria checagem de
  // criar(), mas defendido aqui por consistência/defesa em profundidade) de
  // uma pergunta `pessoa` já existente numa pesquisa que de alguma forma
  // seja `clima_geral`.
  if (tipoResultante === 'pessoa' && pesquisa.tipo === 'clima_geral') {
    throw new ErroHttp(
      422,
      'TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA',
      'Pergunta do tipo "pessoa" não é permitida em pesquisas do tipo "clima_geral".',
    )
  }

  if (dto.enunciado !== undefined) {
```

Nenhuma outra função de `perguntas.service.ts` (`remover`, `reordenar`)
muda — nenhuma das duas altera `tipo`.

#### 1.8 `ciclos-avaliacao.service.ts` — branch em `atualizarStatus`

Import trocado (adicionar `gerarEnviosClima` ao lado de
`gerarEnviosPesquisa`, já importado):

```ts
import { gerarEnviosClima, gerarEnviosPesquisa } from '../envios-pesquisa/envios-pesquisa.service'
```

Dentro do `if (ciclo.status === 'rascunho' && novoStatus === 'ativo')`, o
corpo da transação passa a ser:

```ts
    const salvo = await AppDataSource.transaction(async (manager) => {
      if (pesquisaPublicada.tipo === 'avaliacao_360') {
        await gerarRelacionamentos(manager, ciclo.id)
        await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)
      } else {
        // clima_geral: NUNCA gera relacionamentos_avaliacao — guard rail de
        // anonimização (essa tabela é exclusiva do motor de avaliacao_360 e
        // da regra de pares/subordinado, que não existe para clima).
        await gerarEnviosClima(manager, ciclo.id, pesquisaPublicada.id)
      }

      ciclo.status = novoStatus
      return manager.getRepository(CicloAvaliacao).save(ciclo)
    })

    return mapearCiclo(salvo)
```

Nenhuma outra linha de `ciclos-avaliacao.service.ts` muda — em particular,
`CICLO_SEM_PARTICIPANTES`/`CICLO_SEM_PESQUISA_PUBLICADA`,
`gerarRelacionamentos` em si, `listarRelacionamentos`,
`garantirCicloEditavel` e o branch `ativo → encerrado` ficam intocados.

#### 1.9 `envios-pesquisa.service.ts` — reescrita das funções afetadas

Imports (trocar o bloco de imports do topo do arquivo):

```ts
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import type { ColaboradorAutenticado } from '../../types/express'
import type { TipoPesquisa, TipoRelacionamento } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { EnvioPesquisa } from './envio-pesquisa.entity'
```

Tipos de resposta (substituindo a interface única `EnvioCicloResposta`
anterior por uma união discriminada, ver decisão 8):

```ts
const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

interface EnvioComumResposta {
  id: string
  status: string // StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/** Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa `avaliacao_360`). */
export interface EnvioAvaliacao360Resposta extends EnvioComumResposta {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * Envio gerado a partir de `ciclo_participantes` (pesquisa `clima_geral`) —
 * sem avaliador/avaliado, só o destinatário do link. `destinatario` é
 * IDENTIFICADO (nome completo) mas isso é dado estrutural de controle de
 * envio, não resposta — ver "Guard rails de anonimização" no plano.
 */
export interface EnvioClimaGeralResposta extends EnvioComumResposta {
  origem: 'colaborador'
  destinatario: { id: string; nomeCompleto: string }
}

export type EnvioCicloResposta = EnvioAvaliacao360Resposta | EnvioClimaGeralResposta

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa` não é
 * repetido por item porque uma ativação de ciclo sempre gera envios para
 * UMA ÚNICA pesquisa (mesmo `pesquisaId` passado a
 * `gerarEnviosPesquisa`/`gerarEnviosClima`) — permite ao frontend decidir a
 * seção/colunas certas com um único `if`. `null` SOMENTE quando `envios`
 * está vazio (ciclo ainda não ativado, nenhum envio gerado ainda) — nunca
 * interpretar como erro.
 */
export interface ListarEnviosCicloResposta {
  tipoPesquisa: TipoPesquisa | null
  envios: EnvioCicloResposta[]
}
```

`montarLinkPublico`: sem mudanças.

`gerarEnviosPesquisa`: **sem mudanças de lógica** (reproduzida aqui só por
completude do arquivo final):

```ts
export async function gerarEnviosPesquisa(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  const relacionamentos = await manager
    .getRepository(RelacionamentoAvaliacao)
    .find({ where: { cicloId } })

  if (relacionamentos.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values(
      relacionamentos.map((r) => ({
        pesquisaId,
        relacionamentoId: r.id,
        status: 'pendente' as const,
      })),
    )
    .orIgnore()
    .execute()
}
```

`gerarEnviosClima` — **função nova**:

```ts
/**
 * Gera `envios_pesquisa` a partir de `ciclo_participantes` — 1 envio por
 * participante, `colaboradorId` preenchido e `relacionamentoId` NULL.
 * Usada EXCLUSIVAMENTE para pesquisas `clima_geral` (ver
 * `ciclos-avaliacao.service.ts`, `atualizarStatus`) — NUNCA gera
 * `relacionamentos_avaliacao` (guard rail de anonimização: essa tabela e a
 * regra de pares/subordinado são exclusivas do motor de `avaliacao_360`).
 * Função interna, chamada só dentro da MESMA transação de ativação do
 * ciclo. Idempotente via `.orIgnore()` sobre o índice único parcial
 * `uq_envios_pesquisa_colaborador (pesquisa_id, colaborador_id) WHERE
 * colaborador_id IS NOT NULL`.
 */
export async function gerarEnviosClima(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  const participantes = await manager.getRepository(CicloParticipante).find({ where: { cicloId } })

  if (participantes.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values(
      participantes.map((p) => ({
        pesquisaId,
        relacionamentoId: null,
        colaboradorId: p.colaboradorId,
        status: 'pendente' as const,
      })),
    )
    .orIgnore()
    .execute()
}
```

`buscarEnvioDoCicloOuFalhar` — **filtro trocado** (de
`INNER JOIN relacionamentos_avaliacao` para `INNER JOIN pesquisas`):

```ts
/**
 * Busca um envio garantindo que pertence ao ciclo informado. Filtro trocado
 * nesta task: de `relacionamentos_avaliacao.ciclo_id` (quebrava para
 * envios `clima_geral`, que têm `relacionamento_id = NULL` e por isso
 * nunca combinavam com um INNER JOIN nessa tabela) para
 * `pesquisas.ciclo_id` — funciona uniformemente para as duas origens,
 * porque TODO envio (de qualquer origem) tem `pesquisa_id` preenchido, e
 * essa é a MESMA pesquisa (`pesquisaPublicada`) já resolvida e vinculada ao
 * ciclo pela checagem `CICLO_SEM_PESQUISA_PUBLICADA` existente antes da
 * geração.
 */
async function buscarEnvioDoCicloOuFalhar(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .where('e.id = :envioId', { envioId })
    .andWhere('pesquisa.ciclo_id = :cicloId', { cicloId })
    .getOne()

  if (!envio) {
    throw new ErroHttp(404, 'ENVIO_NAO_ENCONTRADO', 'Envio de pesquisa não encontrado para este ciclo.')
  }

  return envio
}
```

`baseQuery`/`buscarEnvioComNomes`/`mapearLinha` — **substituem o antigo par
`buscarEnvioComNomes`/`mapearLinha`** (mesma responsabilidade, agora com
`LEFT JOIN` para as duas origens em vez de `INNER JOIN` fixo em
relacionamento):

```ts
/**
 * Query base com LEFT JOIN para as duas origens possíveis — reaproveitada
 * por `listarPorCiclo` e por `buscarEnvioComNomes` (usada pelas 3 ações).
 * `LEFT JOIN` (nunca `INNER JOIN`) em `relacionamentos_avaliacao`/
 * avaliador/avaliado/destinatário: cada linha de `envios_pesquisa` só
 * preenche um dos dois lados (garantido pelo CHECK do banco), então os
 * campos do lado que não se aplica vêm `NULL` do banco — tratado em
 * `mapearLinha`.
 */
function baseQuery() {
  return AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .leftJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .leftJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .leftJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .leftJoin(Colaborador, 'destinatario', 'destinatario.id = e.colaborador_id')
    .select('e.id', 'id')
    .addSelect('pesquisa.tipo', 'pesquisaTipo')
    .addSelect('e.relacionamento_id', 'relacionamentoId')
    .addSelect('r.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('r.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('r.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('e.colaborador_id', 'destinatarioId')
    .addSelect('destinatario.nome_completo', 'destinatarioNome')
    .addSelect('e.status', 'status')
    .addSelect('e.token_acesso', 'tokenAcesso')
    .addSelect('e.quantidade_lembretes', 'quantidadeLembretes')
    .addSelect('e.cpf_confirmado_em', 'cpfConfirmadoEm')
    .addSelect('e.concluido_em', 'concluidoEm')
}

async function buscarEnvioComNomes(envioId: string): Promise<EnvioCicloResposta> {
  const linha = await baseQuery().where('e.id = :envioId', { envioId }).getRawOne()
  return mapearLinha(linha)
}

function mapearLinha(linha: any): EnvioCicloResposta {
  const comum: EnvioComumResposta = {
    id: linha.id,
    status: linha.status,
    link: montarLinkPublico(linha.tokenAcesso),
    quantidadeLembretes: linha.quantidadeLembretes,
    cpfConfirmadoEm: linha.cpfConfirmadoEm ? new Date(linha.cpfConfirmadoEm).toISOString() : null,
    concluidoEm: linha.concluidoEm ? new Date(linha.concluidoEm).toISOString() : null,
  }

  // Discriminante: presença de relacionamentoId (nunca ambos/nenhum,
  // garantido pelo CHECK chk_envios_pesquisa_origem_exclusiva no banco).
  if (linha.relacionamentoId) {
    return {
      ...comum,
      origem: 'relacionamento',
      avaliadorId: linha.avaliadorId,
      avaliadorNome: linha.avaliadorNome,
      avaliadoId: linha.avaliadoId,
      avaliadoNome: linha.avaliadoNome,
      tipoRelacionamento: linha.tipoRelacionamento,
    }
  }

  return {
    ...comum,
    origem: 'colaborador',
    destinatario: { id: linha.destinatarioId, nomeCompleto: linha.destinatarioNome },
  }
}
```

`listarPorCiclo` — **filtro e retorno trocados**:

```ts
export async function listarPorCiclo(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<ListarEnviosCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // Visão IDENTIFICADA de controle de envio (quem-avalia-quem para
  // avaliacao_360, destinatário para clima_geral) — restrita a
  // admin/gestor_rh, mesma natureza de GET /api/ciclos/:id/relacionamentos.
  // Nunca junction com dado de resposta (itens_resposta/respostas ainda não
  // existem) — só vínculo estrutural + metadados de controle de envio.
  await buscarCicloOuFalhar(cicloId)

  const linhas = await baseQuery()
    .where('pesquisa.ciclo_id = :cicloId', { cicloId })
    .orderBy('COALESCE(avaliado.nome_completo, destinatario.nome_completo)', 'ASC')
    .addOrderBy('r.tipo_relacionamento', 'ASC')
    .getRawMany()

  const envios = linhas.map(mapearLinha)
  const tipoPesquisa = linhas.length > 0 ? (linhas[0].pesquisaTipo as TipoPesquisa) : null

  return { tipoPesquisa, envios }
}
```

`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`: **nenhuma mudança de
lógica** — continuam chamando `buscarCicloOuFalhar` +
`buscarEnvioDoCicloOuFalhar` (agora com o filtro novo) + salvando a entidade
+ devolvendo `buscarEnvioComNomes(envioId)` (agora retornando a união
discriminada). Reproduzidas aqui só por completude:

```ts
export async function marcarComoEnviado(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'pendente') {
    throw new ErroHttp(409, 'TRANSICAO_ENVIO_INVALIDA', 'Só é possível marcar como enviado um envio em status "pendente".')
  }

  envio.status = 'enviado'
  envio.enviadoEm = new Date()
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function registrarLembrete(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'enviado') {
    throw new ErroHttp(409, 'TRANSICAO_ENVIO_INVALIDA', 'Só é possível registrar lembrete para um envio em status "enviado".')
  }

  envio.quantidadeLembretes += 1
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function expirarEnvio(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  envio.status = 'expirado'
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}
```

#### 1.10 Controller/módulo de `envios-pesquisa`

**Nenhuma mudança** em `envios-pesquisa.controller.ts` nem em
`envios-pesquisa.module.ts` — os 4 handlers já fazem só
`res.status(200/...).json(resposta)`, e `resposta` já muda de tipo
automaticamente por inferência (o `service` agora devolve
`ListarEnviosCicloResposta`/`EnvioCicloResposta`, o controller não precisa
saber disso explicitamente). Confirmar isso ao codar — se o
`backend-developer` sentir necessidade de anotar tipo explícito em algum
`Response`, é só documentação, não uma mudança funcional.

#### 1.11 Shape de resposta — contrato completo (com JSON de exemplo)

**`GET /api/ciclos/:cicloId/envios`** — `200 ListarEnviosCicloResposta`.

Exemplo para um ciclo cuja pesquisa é `avaliacao_360` (shape idêntico ao já
existente hoje, só envelopado em `{ tipoPesquisa, envios }`):

```json
{
  "tipoPesquisa": "avaliacao_360",
  "envios": [
    {
      "id": "5f1e2a10-...-000000000001",
      "origem": "relacionamento",
      "avaliadorId": "a1b2c3d4-...",
      "avaliadorNome": "Maria Silva",
      "avaliadoId": "e5f6a7b8-...",
      "avaliadoNome": "João Souza",
      "tipoRelacionamento": "pares",
      "status": "pendente",
      "link": "http://localhost:5173/responder/9f2c4b7a-...",
      "quantidadeLembretes": 0,
      "cpfConfirmadoEm": null,
      "concluidoEm": null
    }
  ]
}
```

Exemplo para um ciclo cuja pesquisa é `clima_geral`:

```json
{
  "tipoPesquisa": "clima_geral",
  "envios": [
    {
      "id": "7c3d1e20-...-000000000002",
      "origem": "colaborador",
      "destinatario": { "id": "b2c3d4e5-...", "nomeCompleto": "Ana Pereira" },
      "status": "pendente",
      "link": "http://localhost:5173/responder/1a2b3c4d-...",
      "quantidadeLembretes": 0,
      "cpfConfirmadoEm": null,
      "concluidoEm": null
    }
  ]
}
```

Ciclo ainda não ativado (nenhum envio gerado ainda):

```json
{ "tipoPesquisa": null, "envios": [] }
```

**`PATCH /api/ciclos/:cicloId/envios/:id/marcar-enviado|registrar-lembrete|expirar`**
— `200 EnvioCicloResposta` (item único, **sem** o envelope `tipoPesquisa`,
só a união discriminada por `origem`, mesmo shape de item da listagem
acima). Ex.: resposta de `marcar-enviado` para um envio de clima:

```json
{
  "id": "7c3d1e20-...-000000000002",
  "origem": "colaborador",
  "destinatario": { "id": "b2c3d4e5-...", "nomeCompleto": "Ana Pereira" },
  "status": "enviado",
  "link": "http://localhost:5173/responder/1a2b3c4d-...",
  "quantidadeLembretes": 0,
  "cpfConfirmadoEm": null,
  "concluidoEm": null
}
```

As 3 ações continuam funcionando identicamente para os dois tipos de
pesquisa — nenhuma pré-condição de transição de status (`pendente →
enviado`, `enviado → enviado` com incremento de lembrete,
`qualquer-status → expirado`) depende de `origem`.

#### 1.12 Tabela de rotas — contrato de API afetado por esta task

Nenhuma rota nova. Tabela das rotas cujo contrato (body aceito e/ou shape de
resposta) muda:

| Método | Rota | Papéis | O que muda |
|---|---|---|---|
| POST | `/api/pesquisas` | admin, gestor_rh | Body aceita `tipo?` (default `avaliacao_360`); resposta ganha `tipo` |
| GET | `/api/pesquisas` | admin, gestor_rh | Cada item da lista ganha `tipo` |
| GET | `/api/pesquisas/:id` | admin, gestor_rh | Resposta ganha `tipo` |
| PUT | `/api/pesquisas/:id` | admin, gestor_rh | Body NÃO aceita `tipo` (silenciosamente ignorado se enviado); resposta ganha `tipo` (refletindo o valor já existente, nunca alterado por este endpoint) |
| POST | `/api/pesquisas/:id/duplicar` | admin, gestor_rh | Pesquisa duplicada herda `tipo` da original; resposta ganha `tipo` |
| POST | `/api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas` | admin, gestor_rh | Novo erro `422 TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA` quando `tipo === 'pessoa'` e a pesquisa dona é `clima_geral` |
| PUT | `/api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas/:id` | admin, gestor_rh | Mesmo erro novo acima, avaliado sobre o `tipoResultante` |
| PATCH | `/api/ciclos/:id/status` | admin, gestor_rh | Nenhuma mudança de contrato HTTP — só o comportamento interno de geração de envios (branch por `pesquisaPublicada.tipo`) |
| GET | `/api/ciclos/:cicloId/envios` | admin, gestor_rh | **Shape de resposta muda**: de `EnvioCicloResposta[]` para `{ tipoPesquisa, envios: EnvioCicloResposta[] }`, e cada item vira união discriminada por `origem` (ver 1.11) |
| PATCH | `/api/ciclos/:cicloId/envios/:id/marcar-enviado` | admin, gestor_rh | Resposta (item único) vira união discriminada por `origem` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/registrar-lembrete` | admin, gestor_rh | Idem |
| PATCH | `/api/ciclos/:cicloId/envios/:id/expirar` | admin, gestor_rh | Idem |

Nenhuma dessas rotas é acessível por `colaborador` — sem mudança nenhuma
nesse ponto em relação ao estado atual.

Ao terminar: rodar `npm run build` (tsc) dentro de `backend/` e confirmar
que compila sem erros antes de marcar a etapa concluída (o único erro
pré-existente já conhecido, `src/test/fakeRepository.ts:30`, não relacionado
a esta task, pode continuar aparecendo — não corrigir, já registrado como
tech debt não-crítico pela task anterior). Registrar no resumo da task que a
migration desta seção **não deve ser executada** contra um banco real sem
confirmação explícita do usuário.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **`pesquisas.tipo` é realmente imutável**: `AtualizarPesquisaDto` não
   declara `tipo`, e `pesquisas.service.atualizar()` não lê `dto.tipo` em
   nenhuma linha (mesmo depois da alteração desta task) — confirmar
   literalmente, não só por inferência de tipo (um `(dto as any).tipo`
   escondido em algum lugar seria um jeito de burlar isso).
2. **Coluna/enum batendo exatamente com a migration**: `tipo_pesquisa`
   (`avaliacao_360`, `clima_geral`), `pesquisas.tipo NOT NULL DEFAULT
   'avaliacao_360'`, na entidade e na migration, mesmos nomes/valores.
3. **`chk_envios_pesquisa_origem_exclusiva` é realmente respeitado pela
   aplicação**: `gerarEnviosPesquisa` só popula `relacionamentoId` (nunca
   `colaboradorId`); `gerarEnviosClima` só popula `colaboradorId` (nunca
   `relacionamentoId`, deve setar explicitamente `null`, não omitir o
   campo). Nenhuma outra função grava `INSERT`/`UPDATE` nessas duas colunas.
4. **Índice único parcial `uq_envios_pesquisa_colaborador` criado
   corretamente** (`CREATE UNIQUE INDEX ... WHERE colaborador_id IS NOT
   NULL`, não uma constraint `UNIQUE` de tabela sem `WHERE` — uma constraint
   sem `WHERE` teria o mesmo problema já documentado de não bloquear nada
   quando a coluna é `NULL` na maioria das linhas, mas SIM bloquearia
   corretamente quando preenchida, então o risco real a checar é
   "esqueceram o `WHERE`" resultando numa constraint tecnicamente
   inofensiva mas não é o que foi pedido/decidido — confirmar que o `WHERE
   colaborador_id IS NOT NULL` está literalmente presente).
5. **`gerarEnviosClima` NUNCA grava em `relacionamentos_avaliacao`** —
   confirmar por leitura direta do corpo da função (nenhuma referência à
   entidade `RelacionamentoAvaliacao` dentro dela) e por leitura do branch
   em `ciclos-avaliacao.service.ts` (`gerarRelacionamentos` só é chamada
   dentro do `if (pesquisaPublicada.tipo === 'avaliacao_360')`, nunca antes
   do `if`, nunca no branch `else`). Achado crítico se violado — é
   exatamente o guard rail central desta task.
6. **`buscarEnvioDoCicloOuFalhar`/`listarPorCiclo` usam `pesquisa.ciclo_id`
   como filtro (não mais `relacionamentos_avaliacao.ciclo_id`)** — um envio
   de clima de um ciclo diferente, acessado com um `:cicloId` errado na
   URL, deve continuar retornando `404 ENVIO_NAO_ENCONTRADO` (testar
   mentalmente o caso de borda: `colaborador_id` de um clima pode
   coincidir com um `avaliado_id`/`avaliador_id` de outro ciclo
   `avaliacao_360` só por serem a mesma pessoa — o filtro correto por
   `pesquisa.ciclo_id` não deve deixar isso vazar).
7. **`mapearLinha` discrimina corretamente por `relacionamentoId` presente/
   ausente** — nenhum caso em que os dois braços da união se misturam (ex.:
   um item de clima acidentalmente com `avaliadorNome: undefined` em vez de
   simplesmente não ter a chave — TypeScript não impede isso em runtime já
   que `mapearLinha` usa `any`; conferir visualmente que o `return` de cada
   branch só inclui as chaves do braço correspondente).
8. **`tipoPesquisa` no nível do envelope está correto e nunca inventado**:
   deve vir de `linhas[0].pesquisaTipo` (dado real, join com `pesquisas`),
   nunca de uma suposição/hardcode; `null` só quando `linhas.length === 0`.
9. **`TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA` cobre `criar` E `atualizar` de
   perguntas**, usando `pesquisa.tipo` (já buscada, sem query nova) e
   `tipo`/`tipoResultante` (o tipo já resolvido, não `dto.tipo` cru — que
   pode ser `undefined` em `atualizar`).
10. **Nenhuma rota nova é acessível por `colaborador`** — `garantirPapel`
    continua como primeira linha de toda função de serviço tocada por esta
    task, sem exceção nova além da já documentada (`gerarEnviosPesquisa`/
    `gerarEnviosClima`, helpers internos sem `ator`).
11. **Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`** — confirmar
    que a decisão 10 foi seguida (nenhuma linha adicionada a
    `tratadorErros.ts`).
12. **`pesquisas.service.duplicar()` copia `tipo` da original** — testar
    mentalmente: duplicar uma pesquisa `clima_geral` deve produzir uma nova
    pesquisa também `clima_geral`, não `avaliacao_360`.
13. **`down()` da migration reverte na ordem inversa correta** (índices →
    constraint → coluna nova → `relacionamento_id` volta a `NOT NULL` →
    coluna `tipo` → tipo `tipo_pesquisa`) e nenhuma das 3 migrations
    anteriores foi editada in-place (`git diff` deve mostrar só um arquivo
    novo de migration, mais os arquivos de entidade/service/dto listados
    acima — nunca um diff dentro de
    `1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`,
    `1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
    ou `1788350000000-CriarEnviosPesquisa.ts`).
14. **Migration não foi executada contra nenhum banco real.**

## Perguntas em aberto

Decisões de negócio/design que valem confirmação explícita do usuário
antes/depois da implementação (a implementação segue as decisões assumidas
acima, mas sinalizando aqui para não passar despercebido):

1. **`tipoPesquisa` só é exposto no envelope de `GET
   /api/ciclos/:cicloId/envios`, não em `GET /api/ciclos/:id`
   (`CicloResposta`) nem em `GET /api/ciclos` (listagem).** Um frontend que
   precise saber o tipo da pesquisa vinculada a um ciclo **antes** dele ser
   ativado (quando `envios` ainda está vazio, logo `tipoPesquisa` vem
   `null`) não tem hoje nenhuma rota de `ciclos-avaliacao` que informe isso
   diretamente — precisaria olhar para `GET /api/pesquisas/:id` da pesquisa
   vinculada (`pesquisa.cicloId === ciclo.id`), que já expõe `tipo`
   corretamente por esta task, mas exige uma segunda chamada/join no
   frontend. Confirmar se isso é aceitável ou se vale adicionar
   `tipoPesquisaVinculada` a `CicloResposta` numa iteração futura (fora de
   escopo aqui, pelas razões detalhadas na decisão de modelagem 8).
2. **Nome do campo discriminante escolhido: `origem` (`'relacionamento' |
   'colaborador'`), não `tipoPesquisa` repetido por item nem um nome mais
   "de negócio" como `tipoEnvio`.** Confirmar se o nome comunica bem a
   intenção para quem for consumir no frontend, ou se um nome diferente
   (ex.: `modeloEnvio`, `origemAvaliado`) seria mais claro.
3. **Contrato de `GET /api/ciclos/:cicloId/envios` muda de array plano para
   objeto `{ tipoPesquisa, envios }`, quebrando o consumo atual do
   frontend** (`frontend/src/services/enviosPesquisaService.ts`,
   `frontend/src/types/envio.ts`, `CicloDetalhePage.tsx`, já implementados
   pela task `envios-pesquisa`). Esta task não atualiza o frontend (fora de
   escopo, só backend) — uma `task-frontend.md` dedicada precisa ser
   planejada em seguida para consumir o novo contrato. Confirmar que essa
   ordem (backend primeiro, frontend depois, com uma janela em que o
   frontend fica desalinhado com o backend) é aceitável, ou se o usuário
   prefere que o planejamento de frontend seja disparado imediatamente após
   este plano ser implementado.
4. **`gerarEnviosClima` gera exatamente 1 envio por `ciclo_participantes`,
   sem nenhuma opção de excluir participantes específicos da pesquisa de
   clima** (ex.: um admin poderia querer que só parte dos participantes do
   ciclo recebam a pesquisa de clima) — não pedido explicitamente, mantido
   simétrico a `gerarEnviosPesquisa` (que também não tem opt-out por
   participante). Confirmar se isso é o comportamento desejado a longo
   prazo.
5. **Validação `TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA` não impede que uma
   pesquisa `clima_geral` fique com ZERO perguntas de qualquer tipo além de
   `pessoa`** (ela só bloqueia `pessoa` especificamente) — nenhuma outra
   restrição de composição por tipo de pesquisa foi pedida (ex.: exigir ao
   menos 1 pergunta `likert` numa pesquisa de clima), e este plano não
   introduz nenhuma. Confirmar se isso é intencional (regra mínima, só o
   que foi pedido) ou se há uma regra de composição futura a considerar.
6. **A pré-existente ambiguidade "qual é *a* pesquisa publicada de um
   ciclo" (sem constraint de unicidade, já registrada como pergunta em
   aberto não resolvida na task `envios-pesquisa`) agora também determina
   se o motor de ativação gera `relacionamentos_avaliacao`+envios de
   avaliação OU envios de clima** — se essa ambiguidade um dia se
   concretizar (mais de uma pesquisa `publicada` vinculada ao mesmo ciclo,
   uma `avaliacao_360` e outra `clima_geral`), o branch escolhido depende
   de qual `Pesquisa.findOneBy({ cicloId, status: 'publicada' })` o
   Postgres devolver primeiro (sem `ORDER BY`) — um resultado
   arbitrário/não determinístico. Esta task não resolve essa ambiguidade
   (fora de escopo, decisão já herdada da task anterior), só sinalizando de
   novo porque agora o impacto é maior (determina o *tipo* do fluxo, não só
   qual pesquisa recebe os envios).

Ao terminar a implementação: rodar `npm run build` (tsc) dentro de
`backend/` e confirmar compilação limpa (à exceção do erro pré-existente já
conhecido em `src/test/fakeRepository.ts`, não relacionado a esta task).
**Não rodar `npm run migration:run` contra nenhum banco real sem
confirmação explícita do usuário** — nem esta migration nem nenhuma das 3
anteriores rodaram ainda contra qualquer ambiente.

## Status — 1. backend-developer

**Concluído.** Implementação seguiu o plano literalmente, sem desvios —
nenhuma divergência do plano foi identificada durante a execução.

### Arquivos criados

- `backend/src/migrations/1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`
  — migration nova (`CREATE TYPE tipo_pesquisa`, `ALTER TABLE pesquisas ADD
  COLUMN tipo`, `ALTER TABLE envios_pesquisa` para tornar `relacionamento_id`
  nullable + `ADD COLUMN colaborador_id` + `CHECK
  chk_envios_pesquisa_origem_exclusiva` + índice único parcial
  `uq_envios_pesquisa_colaborador` + índice `idx_envios_colaborador`).
  Timestamp `1788400000000`, maior que o último existente
  (`1788350000000-CriarEnviosPesquisa.ts`). **NÃO executada contra nenhum
  banco real** — só o arquivo foi escrito, conforme instruído.

### Arquivos alterados

- `backend/src/common/enums.ts` — `TipoPesquisa`/`TIPO_PESQUISA_VALORES`
  novos, ao final do arquivo.
- `backend/src/modules/pesquisas/pesquisa.entity.ts` — coluna `tipo` nova
  (enum `tipo_pesquisa`, default `avaliacao_360`), posicionada logo após
  `status`.
- `backend/src/modules/pesquisas/dto/criar-pesquisa.dto.ts` — `tipo?:
  TipoPesquisa` adicionado.
- `backend/src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts` — sem novo
  campo, só comentário explicando a imutabilidade deliberada de `tipo`.
- `backend/src/modules/pesquisas/pesquisas.service.ts` — `tipo` adicionado a
  `PesquisaRespostaLista`/`PesquisaRespostaDetalhe`, `mapearPesquisaLista`,
  `montarDetalhe`; `criar()` resolve `dto.tipo` (default `avaliacao_360`);
  `atualizar()` ganhou só um comentário (nenhuma leitura de `dto.tipo`,
  campo ausente do DTO); `duplicar()` copia `tipo` da pesquisa original.
- `backend/src/modules/perguntas/perguntas.service.ts` — checagem nova `422
  TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA` em `criar()` (contra `tipo` recém
  validado) e `atualizar()` (contra `tipoResultante`), usando a variável
  `pesquisa` já buscada — nenhuma query nova.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` —
  import de `gerarEnviosClima` ao lado de `gerarEnviosPesquisa`; corpo da
  transação de ativação (`atualizarStatus`, `rascunho → ativo`) ramificado
  por `pesquisaPublicada.tipo`: `avaliacao_360` mantém
  `gerarRelacionamentos` + `gerarEnviosPesquisa` intactos; `clima_geral`
  chama só `gerarEnviosClima` (nunca `gerarRelacionamentos`).
- `backend/src/modules/envios-pesquisa/envio-pesquisa.entity.ts` —
  `relacionamentoId`/`relacionamento` viram `nullable`/`| null`; coluna e
  relação novas `colaboradorId`/`colaborador` (nullable, `ManyToOne` para
  `Colaborador`).
- `backend/src/modules/envios-pesquisa/envios-pesquisa.service.ts` —
  reescrito: tipos de resposta viram união discriminada
  (`EnvioAvaliacao360Resposta | EnvioClimaGeralResposta`, discriminante
  `origem`), `ListarEnviosCicloResposta` (`{ tipoPesquisa, envios }`) nova;
  `gerarEnviosClima` nova (1 envio por `ciclo_participantes`, nunca toca
  `relacionamentos_avaliacao`); `buscarEnvioDoCicloOuFalhar` trocou o filtro
  de `INNER JOIN relacionamentos_avaliacao` para `INNER JOIN pesquisas` (via
  `pesquisa.ciclo_id`); `baseQuery`/`mapearLinha` novos, com `LEFT JOIN`
  para as duas origens; `listarPorCiclo` usa o filtro/retorno novos;
  `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio` sem mudança de
  lógica (só herdam o retorno/filtro novos via as funções que chamam).
- `backend/src/modules/envios-pesquisa/envios-pesquisa.controller.ts` e
  `envios-pesquisa.module.ts` — **nenhuma mudança** (confirmado: os handlers
  já repassam o retorno do service por inferência de tipo, sem anotação
  explícita a atualizar).

### Migration a rodar (quando o usuário confirmar)

`1788400000000-DiferenciarTipoPesquisaEEnviosClima` — depende de
`1788350000000-CriarEnviosPesquisa` já ter rodado antes (referencia
`envios_pesquisa`). Nenhuma das duas rodou ainda contra qualquer banco.

### Desvios do plano

Nenhum. O plano foi seguido literalmente em todos os pontos verificados
(nomes de enum/coluna/constraint/índice, shape de resposta, guard rails de
anonimização, ausência de `organization_id`, `garantirPapel` como primeira
linha de toda função de serviço tocada).

### Build

`npm run build` (tsc) dentro de `backend/` compila com sucesso. Único erro
reportado: `src/test/fakeRepository.ts(30,12): error TS2352` — **erro
pré-existente conhecido, não relacionado a esta task**, não corrigido
(fora de escopo).

### Observações

- Confirmado por leitura direta: `gerarEnviosClima` não referencia
  `RelacionamentoAvaliacao`/`relacionamentos_avaliacao` em nenhuma linha; o
  branch `clima_geral` de `atualizarStatus` nunca chama
  `gerarRelacionamentos`.
- Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`
  (`tratadorErros.ts`) — arquivo não tocado, conforme decisão 10 do plano.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts`
  aparece como modificado no `git status`, mas essa alteração é
  **pré-existente**, de uma task anterior (`envios-pesquisa`) ainda não
  commitada — não foi tocada por esta implementação.

## Revisão

Todos os 9 arquivos (1 migration nova + 8 alterados) foram lidos por
completo e comparados linha a linha com o plano da seção "1.
backend-developer". A implementação segue o plano **literalmente** em
todos os pontos verificáveis: nomes de enum/coluna/constraint/índice,
shape de resposta (`ListarEnviosCicloResposta`/união discriminada por
`origem`), imutabilidade de `pesquisas.tipo` (confirmado por leitura
direta: `AtualizarPesquisaDto` não declara `tipo`, e `atualizar()` não lê
`dto.tipo` em nenhuma linha), `gerarEnviosClima` nunca referenciando
`RelacionamentoAvaliacao`, branch de `atualizarStatus` chamando
`gerarRelacionamentos` só dentro do `if (pesquisaPublicada.tipo ===
'avaliacao_360')`, nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`,
nenhuma edição in-place das 3 migrations anteriores, e `garantirPapel(ator,
['admin', 'gestor_rh'])` como primeira linha de toda função exportada de
serviço tocada (nenhuma rota acessível por `colaborador`).

### Crítico

Nenhum achado crítico. Nenhuma violação do guard rail de anonimização:
`gerarEnviosClima` não grava em `relacionamentos_avaliacao` em nenhuma
linha, `clima_geral` nunca é ramificada para `gerarRelacionamentos`, e
nenhuma query nova acessível por `colaborador` junta dado de resposta com
`avaliador_id`/`avaliado_id`. **O orquestrador pode prosseguir para a
etapa de testes.**

### Deveria corrigir

1. **Regressão em `buscarEnvioDoCicloOuFalhar`/`listarPorCiclo`: o filtro
   trocado de `relacionamentos_avaliacao.ciclo_id` (imutável por linha)
   para `pesquisa.ciclo_id` (mutável) torna os envios de um ciclo já
   ativado invisíveis se a pesquisa vinculada for desvinculada depois.**
   `pesquisas.service.ts`, `atualizar()`:
   ```ts
   if ('cicloId' in dto) {
     if (dto.cicloId === null) {
       // Desvincular é sempre permitido, independentemente do status da
       // pesquisa ou do ciclo (decisão assumida 10 do plano da task de ciclos).
       pesquisa.cicloId = null
     } else { ... }
   }
   ```
   Essa desvinculação incondicional é uma decisão **pré-existente**, de
   antes desta task, e não foi alterada aqui — mas antes desta task ela
   era inofensiva para `envios_pesquisa`, porque o filtro antigo
   (`INNER JOIN relacionamentos_avaliacao` + `r.ciclo_id = :cicloId`)
   dependia da coluna `relacionamentos_avaliacao.ciclo_id`, gravada uma
   vez na criação do relacionamento e nunca mais alterada — imune a
   qualquer mudança posterior em `pesquisa.cicloId`. O novo filtro
   (`INNER JOIN pesquisas` + `pesquisa.ciclo_id = :cicloId`,
   `envios-pesquisa.service.ts`, `buscarEnvioDoCicloOuFalhar` e
   `listarPorCiclo`) depende diretamente de `pesquisa.cicloId`, que pode
   ser zerado a qualquer momento por um admin via `PUT /api/pesquisas/:id`
   com `{ "cicloId": null }`, **mesmo com o ciclo já `ativo` e envios já
   gerados**. Cenário concreto: ciclo ativado com pesquisa `avaliacao_360`
   ou `clima_geral` publicada e envios gerados → admin desvincula a
   pesquisa do ciclo (ação hoje sem nenhuma restrição de status) → `GET
   /api/ciclos/:cicloId/envios` passa a devolver `{ tipoPesquisa: null,
   envios: [] }` (lista vazia, não um erro) e as 3 ações `PATCH
   .../envios/:id/*` passam a devolver `404 ENVIO_NAO_ENCONTRADO` para
   envios que continuam existindo e válidos no banco — para
   `clima_geral` isso é ainda mais grave, porque não existe nenhuma outra
   rota (`listarRelacionamentos` é exclusiva de `relacionamentos_avaliacao`)
   por onde recuperar esses envios; eles ficam órfãos até a pesquisa ser
   revinculada ao mesmo ciclo (ou para sempre, se o `cicloId` do ciclo for
   reaproveitado por outra pesquisa antes). Isso é uma regressão real
   introduzida por esta task (item 3 do foco de revisão pedido:
   "nenhuma regressão... para `avaliacao_360`") sob essa condição de
   borda específica, não coberta pelos guard rails de anonimização (não é
   um achado crítico), mas é um problema funcional/de disponibilidade de
   dados que vale corrigir antes ou logo depois da etapa de testes —
   opções possíveis para uma iteração futura: (a) impedir
   `PUT /api/pesquisas/:id` com `cicloId: null` quando o ciclo vinculado
   não estiver mais em `rascunho`, ou (b) manter o filtro de envios
   ancorado em algo imutável por linha (ex.: gravar `cicloId` diretamente
   em `envios_pesquisa` no momento da geração, em vez de derivá-lo via
   `pesquisa.ciclo_id`). Nenhuma das duas foi pedida/decidida nesta task —
   só reportando o achado, não corrigindo.

### Sugestão

1. **`EnvioComumResposta.status: string // StatusEnvio`**
   (`envios-pesquisa.service.ts`) usa `string` em vez do tipo `StatusEnvio`
   já existente em `common/enums.ts` — perde checagem de tipo em tempo de
   compilação para um campo que sempre é um dos 5 valores do enum. Cosmético,
   sem risco funcional atual (o valor sempre vem de `e.status`, uma coluna
   `enum` no banco).
2. **`mapearLinha(linha: any)`** (`envios-pesquisa.service.ts`) usa `any`
   para o resultado bruto de `getRawOne()`/`getRawMany()`, então nada no
   compilador impede que um `return` futuro misture campos dos dois braços
   da união discriminada (ex.: incluir `avaliadorNome` no branch
   `origem: 'colaborador'`) — hoje o código está correto (confirmado por
   leitura visual, cada `return` só inclui as chaves do seu braço), mas uma
   interface explícita para o shape da linha bruta (`{ id: string;
   relacionamentoId: string | null; avaliadorId: string | null; ... }`)
   tornaria esse tipo de regressão futura detectável em tempo de
   compilação.
3. **Recomendação para a etapa de testes**: cobrir explicitamente o cenário
   descrito no achado "Deveria corrigir" acima (ciclo ativado → pesquisa
   desvinculada via `PUT /api/pesquisas/:id { cicloId: null }` → `GET
   /api/ciclos/:cicloId/envios` e as 3 ações `PATCH .../envios/:id/*`) para
   que o comportamento atual (perda de acesso aos envios) fique
   documentado por um teste, ainda que não seja corrigido nesta iteração.
