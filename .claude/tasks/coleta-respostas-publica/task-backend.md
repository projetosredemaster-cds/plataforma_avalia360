# Task: Coleta pública de respostas via `/responder/:token` — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Base obrigatória: `.claude/tasks/coleta-respostas-publica/spec.md`
(lida por completo antes deste plano) — este plano segue o fluxo, contrato de
API e modelo de dados ali descritos, resolvendo as "perguntas em aberto" da
seção 9 conforme decisão do orquestrador (reproduzida abaixo em "Decisões de
modelagem").

Esta é a funcionalidade que fecha o item 6 do roadmap
(`docs/brief_avaliacao360_v4.md`, seção 7) e desbloqueia o item 7 (Análise
básica por avaliado). Esta task cobre **só a coleta (escrita)** — nenhum
endpoint de leitura/análise agregada de respostas já coletadas.

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

### `app.ts`

```ts
app.use('/api/auth', authRouter)
app.use('/api/equipes', equipesRouter)
app.use('/api/colaboradores', colaboradoresRouter)
app.use('/api/pesquisas', pesquisasRouter)
app.use('/api/competencias', competenciasRouter)
app.use('/api/ciclos', ciclosAvaliacaoRouter)
app.use(tratadorErros) // último
```

Todos os routers hoje montados chamam `router.use(autenticar)` dentro do
próprio `*.module.ts` (nunca em `app.ts`). Este plano adiciona
`app.use('/api/publico', coletaRespostasPublicaRouter)` — o único router desta
API que **nunca** chama `autenticar`, visivelmente isolado por prefixo.

### `envios-pesquisa/envio-pesquisa.entity.ts` (hoje)

Já tem, sem nenhuma rota escrevendo ainda: `status: StatusEnvio` (`'pendente' |
'enviado' | 'em_andamento' | 'concluido' | 'expirado'`), `concluidoEm: Date |
null`, `cpfConfirmadoEm: Date | null`, `tentativasCpfInvalidas: number`
(default `0`). `relacionamentoId`/`cicloId` são mutuamente exclusivos (CHECK
`chk_envios_pesquisa_origem_exclusiva` no banco) — `relacionamentoId`
preenchido = `avaliacao_360`; `cicloId` preenchido = `clima_geral` (1 envio de
campanha por ciclo, ver `.claude/tasks/envios-clima-link-unico/`). **Esta task
é a primeira a escrever `concluidoEm`, `cpfConfirmadoEm` e
`tentativasCpfInvalidas`**, e a primeira a usar os valores `'em_andamento'`/
`'concluido'` de `status`.

Comentário já existente no enum `StatusEnvio`
(`backend/src/common/enums.ts`) confirma que `em_andamento`/`concluido` foram
"reservados para a futura página pública `/responder`" — ou seja, esta task.
**Decisão explícita (ver "Decisões de modelagem" nº 6): esta task só escreve
`concluido` (nunca `em_andamento`)** — a spec não pede nenhuma transição
intermediária ao confirmar CPF ou abrir o formulário, só a transição final no
envio de 360. `em_andamento` continua reservado/não escrito também depois
desta task.

Nenhuma rota hoje verifica `status === 'enviado'` como pré-condição para
responder — e este plano também não introduz essa checagem (não pedida pela
spec; a distinção pendente/enviado é só controle administrativo de RH, não um
gate de acesso do colaborador).

### `envios-pesquisa/envios-pesquisa.service.ts` (hoje)

`listarPorCiclo`/`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio` — só
`admin`/`gestor_rh`, via `garantirPapel`, `autenticar` montado em
`envios-pesquisa.module.ts`. `montarLinkPublico(tokenAcesso)` já monta
`${env.frontendUrl}/responder/${tokenAcesso}` — o link que este backend vai
finalmente atender. **Nenhuma mudança neste arquivo/módulo nesta task** — a
task só consome `EnvioPesquisa` para leitura/escrita pontual a partir de um
módulo novo e público.

### `ciclo-participantes/ciclo-participante.entity.ts` (hoje)

Já tem `respondeuEm: Date | null` (coluna criada pela task
`envios-clima-link-unico`, **nunca escrita por nenhuma rota até agora** —
comentário na entidade já diz "escrito só pela futura rota pública
`/responder`"). **Esta task é a primeira a escrever esta coluna**, e só no
branch `clima_geral`.

### `ciclos-avaliacao.service.ts`, `atualizarStatus` (hoje)

Confirma que `clima_geral` nunca gera `relacionamentos_avaliacao` (branch
`else` só chama `gerarEnviosClima`). `pesquisas.cicloId` fica travado (não
pode ser desvinculado/trocado) enquanto o ciclo estiver `ativo`/`encerrado`
(`pesquisas.service.ts`, `atualizar`, checagem `CICLO_VINCULADO_NAO_EDITAVEL`)
— **consequência usada neste plano**: para qualquer `envios_pesquisa` já
gerado (ciclo ativado), `pesquisa.cicloId` é uma forma confiável e
**origem-agnóstica** de achar o ciclo (sem precisar branch por
`avaliacao_360`/`clima_geral`), evitando duplicar a lógica de "achar o ciclo"
nos dois braços dos endpoints públicos.

### `pesquisas/pesquisa.entity.ts` + `pesquisas.service.ts` (hoje)

`tipo: TipoPesquisa` imutável após criação. `perguntas.service.ts` já bloqueia
(`422 TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA`) criar/atualizar pergunta tipo
`pessoa` numa pesquisa `clima_geral` — **confirma a premissa da spec**: só
`avaliacao_360` pode ter pergunta tipo `pessoa`, então a resolução de
`opcoesPessoa` só precisa existir para esse tipo.

### `paginas-pesquisa/pagina-pesquisa.entity.ts` + `perguntas/pergunta.entity.ts` (hoje)

`PaginaPesquisa`: `pesquisaId`, `titulo: string | null`, `ordem: number`.
`Pergunta`: `paginaId`, `tipo: TipoPergunta`, `enunciado: string`,
`obrigatoria: boolean`, `configuracao: jsonb` (`Record<string, unknown>`),
`ordem: number`. `perguntas.service.ts`, `validarConfiguracaoPergunta`
confirma o shape exato de `configuracao` por tipo, usado literalmente neste
plano para resolver o formulário e validar o envio final:

- `likert`/`matriz`: `{ niveis: number (2–10), rotulos: string[] (length ===
  niveis) }`.
- `texto_aberto`: `{}` (nenhuma chave).
- `pessoa`: `{ filtroRelacionamento: TipoRelacionamento[] (não vazio) }`.

`PerguntaCompetencia` (`perguntas_competencias`, `backend/src/modules/perguntas/
pergunta-competencia.entity.ts`): PK composta `(perguntaId, competenciaId)`,
sem colunas próprias — vínculo matriz↔competência (divergência conhecida do
projeto em relação ao doc de schema, já registrada no `CLAUDE.md`, não
revisitada aqui).

### `backend/src/common/cpf.ts` (hoje, já existe — achado importante desta leitura)

Já existe **`normalizarCpf(valor: unknown): string`** (remove tudo que não é
dígito, tolera `unknown`) e **`validarCpf(cpfDigitos: string): boolean`**
(checksum mod 11) — exatamente o "equivalente em TS puro sem depender do
pacote do frontend" que a spec pedia (seção 6.2). **Reaproveitado tal qual
neste plano, nenhum utilitário novo de CPF.** `colaboradores.entity.ts` guarda
`cpf` como `char(11)` — sempre dígitos puros, sem máscara (confirmado em
`colaboradores.service.ts`, que sempre grava `cpfDigitos = normalizarCpf(...)`
antes de persistir). Comparação de CPF nesta task é **igualdade de dígitos
normalizados**, sem exigir `validarCpf` (checksum) no CPF recebido do
formulário público — ver decisão de modelagem nº 8.

### `middlewares/autenticacao.ts` (hoje)

Comentário no topo do arquivo já é explícito: "O fluxo público de resposta a
pesquisa (link + CPF, sem login) é de outra task e não deve reutilizar este
middleware." **Esta é essa task.** `autenticar` não é importado em nenhum
arquivo novo deste plano.

### `middlewares/tratadorErros.ts` / `common/erro-http.ts` / `common/autorizacao.ts` / `common/http-async.ts` / `common/http-params.ts` (hoje)

Lidos por completo. `MAPA_CONSTRAINT_PARA_CODIGO` mapeia `err.constraint` (só
para `err.code === '23505'`, violação de `UNIQUE`) para um código de erro
`409`. **Esta task adiciona 1 entrada nova** (ver decisão nº 9).
`garantirPapel`/`ColaboradorAutenticado` não são usados em nenhum arquivo
desta task — não há `ator` (ninguém autenticado). `asyncHandler` e
`obterParametroRota` são reaproveitados tal qual.

### `config/env.ts` (hoje)

Padrão `variavelComPadrao(nome, padrao)` para variável opcional
string-com-default, usado por `corsOrigin`/`frontendUrl`. **Esta task adiciona
uma variável opcional numérica** (`SESSAO_RESPOSTA_TTL_MINUTOS`), seguindo o
mesmo espírito mas com parsing numérico (ver decisão nº 5).

### `data-source.ts` (hoje)

`entities: [path.join(__dirname, 'modules/**/*.entity.{ts,js}')]` — glob
automático. **Nenhuma entidade nova precisa ser registrada manualmente**,
basta o arquivo existir em `src/modules/**/*.entity.ts`.

### `docs/schema_avaliacao360_pt_v2.sql` (referência para `respostas`/`itens_resposta`, greenfield)

Confirma literalmente o shape de `respostas`/`itens_resposta` usado na seção
7.2 da spec (reproduzido nas entidades abaixo) e os shapes de `valor` por
tipo de pergunta (`{ nota }`, `{ texto }`, `{ notas: { <competenciaId>: nota
} }`, `{ colaboradorId }`) — usados literalmente na validação do envio final
(ver `valorValidoParaTipo`).

## Decisões de modelagem (com justificativa)

1. **Estrutura de 3 módulos, não 1.** Reaproveitando a sugestão da spec seção
   5, mas decidindo o ponto em aberto de organização: `Resposta`/`ItemResposta`
   (360) vivem em `backend/src/modules/respostas/`, e
   `RespostaClima`/`ItemRespostaClima` vivem em
   `backend/src/modules/respostas-clima/` — **cada um só com entidades**, sem
   `service.ts`/`controller.ts`/`module.ts` próprios (nenhum dos dois tem rota
   HTTP dedicada nesta task; a escrita acontece a partir do service público, a
   leitura fica para a futura task "Análise básica por avaliado"). Isso segue
   o mesmo precedente já usado no projeto para `RelacionamentoAvaliacao`
   (entidade dentro de `ciclos-avaliacao/`, sem módulo próprio, porque não tem
   rota HTTP dedicada — é lida/escrita a partir do service de quem a usa). O
   módulo `backend/src/modules/coleta-respostas-publica/` concentra a
   ORQUESTRAÇÃO pública (as 4 rotas + `SessaoResposta`, que é exclusiva desse
   fluxo e não faz sentido em outro lugar).
2. **`SessaoResposta` vive em `coleta-respostas-publica/`, não em
   `respostas/`** — é uma tabela de controle de acesso (capability token +
   TTL), não de conteúdo de resposta; não tem por que ser reaproveitada pela
   futura "Análise básica".
3. **Nomes finais das tabelas: `respostas_clima`/`itens_resposta_clima`**
   (resolvendo a pergunta em aberto nº 4 da spec, conforme decisão do
   orquestrador) — mantido literalmente como no rascunho da spec seção 7.3.
4. **`envios_pesquisa.status`/`concluido_em` no fluxo de clima: NUNCA
   escritos por esta task** (resolvendo a pergunta em aberto nº 1). Only o
   branch `avaliacao_360` do envio final escreve `status = 'concluido'` +
   `concluidoEm = now()`. O progresso de quem respondeu no clima fica
   inteiramente em `ciclo_participantes.respondeuEm`.
5. **TTL da sessão: 45 minutos**, constante `SESSAO_RESPOSTA_TTL_MINUTOS` em
   `env.ts` com fallback `45`, parsing defensivo (`Number.isFinite` +
   `> 0`, senão cai no default) — resolvendo a pergunta em aberto nº 5.
6. **`cpf_confirmado_em`: gravado só na primeira confirmação bem-sucedida**
   (`UPDATE ... WHERE cpf_confirmado_em IS NULL`), nos dois fluxos —
   resolvendo a pergunta em aberto nº 2. Implementado com um `UPDATE`
   condicional (não um `if` em JS lendo o valor antes), para ser
   correto mesmo sob concorrência razoável (dois participantes de clima
   confirmando CPF quase ao mesmo tempo).
7. **Resolução de `opcoesPessoa` (pergunta tipo `pessoa`): em relação ao
   AVALIADO do relacionamento do envio atual**, filtrando
   `relacionamentos_avaliacao` do mesmo ciclo com
   `avaliado_id = <avaliado do envio>` e `tipo_relacionamento IN
   configuracao.filtroRelacionamento`, retornando `avaliador_id`/nome como
   opção — resolvendo a pergunta em aberto nº 3, EXATAMENTE como recomendado
   na spec ("escolha entre os pares/subordinados/etc. da pessoa que você está
   avaliando"). Só executado quando `pergunta.tipo === 'pessoa'` **e**
   `envio.relacionamentoId` não é nulo (nunca roda para `clima_geral`, que já
   não pode ter pergunta `pessoa` — bloqueado em `perguntas.service.ts`).
   **Nota para o revisor** (não é uma violação de anonimização, mas registrar
   por transparência): esta query expõe a lista de nomes de pares/subordinados
   de um avaliado a um avaliador — é dado ESTRUTURAL (grafo
   avaliador↔avaliado↔tipo, já visível a admin/gestor_rh via `GET
   /api/ciclos/:id/relacionamentos`), nunca conteúdo de `itens_resposta` — não
   é a mesma coisa que a regra de anonimização de `pares`/`subordinado`
   (que é só sobre RESPOSTAS, não sobre a existência do relacionamento em si).
   Essa exposição é uma consequência direta e já esperada da spec (seção 9,
   pergunta 3), não uma decisão nova deste plano.
8. **Comparação de CPF: só igualdade de dígitos normalizados
   (`normalizarCpf`), sem exigir `validarCpf` (checksum) no valor recebido.**
   Um CPF malformado simplesmente não vai bater com nenhum
   `colaboradores.cpf` real e cai no fluxo normal de "CPF não confere"
   (incrementa tentativa) — checar o checksum antes não muda o resultado
   (nunca haveria colisão com um CPF real inválido), só adicionaria uma
   ramificação sem efeito prático. `validarCpf` fica reservado ao cadastro de
   colaborador (onde o CPF É a fonte da verdade sendo criada), não à
   comparação contra um CPF já existente.
9. **`MAPA_CONSTRAINT_PARA_CODIGO` ganha 1 entrada nova:
   `uq_respostas_envio_id: 'JA_RESPONDIDO'`.** Diferente das duas tasks
   anteriores (que nunca precisaram de entrada nova porque só usavam
   `.orIgnore()`), aqui existe um caminho HTTP real e concorrente que pode
   violar `respostas.envio_id UNIQUE`: duplo clique/reenvio da mesma sessão
   antes de `sessoes_resposta.usada_em` ser gravado (ver guard rail de
   corrida abaixo). Mapeado para o MESMO código (`JA_RESPONDIDO`, `409`) já
   usado pela checagem síncrona equivalente, para o frontend tratar os dois
   casos de forma idêntica.
10. **Nenhuma proteção equivalente para `respostas_clima`** — por design, essa
    tabela não tem NENHUMA FK de identidade, então não há (nem pode haver) um
    `UNIQUE` "por participante" ali. Uma corrida de duplo-submit na mesma
    sessão de clima pode, em tese, gravar 2 `respostas_clima` (uma succeeds,
    a atualização de `ciclo_participantes.respondeuEm` acontece 2x de forma
    idempotente). **Risco aceito e documentado, não corrigido nesta task**
    (ver guard rail de anonimização abaixo) — é uma consequência estrutural
    inerente ao anonimato do clima, não um bug a corrigir com um campo de
    identidade.
11. **Obrigatoriedade validada só no envio final, para TODAS as perguntas
    obrigatórias de uma vez** — resolvendo a pergunta em aberto nº 6, literal.
    **Itens NÃO obrigatórios também são validados quanto ao FORMATO quando
    presentes no payload** (decisão nova deste plano, não pedida
    explicitamente pela spec, mas necessária como defesa contra payload
    forjado — ver `valorValidoParaTipo`): um item opcional com `valor`
    malformado ainda é rejeitado com `422 RESPOSTA_INCOMPLETA` (mesmo código
    de erro; o formulário nunca deveria gerar isso organicamente, só um
    cliente HTTP manual/forjado chegaria nesse caso).
12. **Sem salvamento parcial/rascunho** — resolvendo a pergunta em aberto
    nº 7, literal: um único `POST .../respostas` fecha a sessão
    (`usada_em`).
13. **Desbloqueio manual de `tentativas_cpf_invalidas >= 5`: confirmado que
    NÃO existe hoje nenhum caminho** (grep em todo `backend/` por
    `tentativasCpfInvalidas`/`tentativas_cpf_invalidas` só retorna a própria
    entidade e a migration que a criou — nenhuma rota jamais zera esse
    campo). **Deliberadamente sem solução nesta task** (Fase 2, se
    necessário) — nenhuma rota nova de desbloqueio é criada aqui, conforme
    instrução explícita do orquestrador.
14. **Dedupe de itens do payload por `perguntaId`: a última ocorrência no
    array vence, sem erro por duplicata.** Simplificação deliberada — o
    `UNIQUE (resposta_id, pergunta_id)`/`UNIQUE (resposta_clima_id,
    pergunta_id)` protege a gravação (um só INSERT por pergunta, construído a
    partir de um `Map` já deduplicado antes do INSERT), então não há risco de
    violação de constraint por duplicata dentro do mesmo payload.
15. **`buscarEnvioValidoOuFalhar` usa `pesquisa.cicloId` (não um branch por
    tipo) para achar o ciclo e checar `status === 'ativo'`** — ver "Estado
    atual verificado" acima sobre por que isso é seguro (o vínculo
    `pesquisas.cicloId` fica travado assim que o ciclo é ativado). Um único
    código serve `avaliacao_360` e `clima_geral`.
16. **Nenhuma função deste plano chama `garantirPapel`.** Não há
    `ColaboradorAutenticado` neste fluxo — autorização é inteiramente por
    posse de `token`/`sessaoToken` (capability tokens) + CPF, validada
    manualmente. Isso não é uma omissão: é a ausência mesma do conceito de
    papel para quem não tem conta (ver guard rail abaixo, para o revisor não
    marcar como achado crítico por engano).

## Guard rails de anonimização

- **360 (`avaliacao_360`)**: a escrita desta task é SEMPRE identificada.
  `Resposta.envioId` aponta para `envios_pesquisa`, que aponta para
  `relacionamentos_avaliacao` (`avaliador_id`/`avaliado_id`/
  `tipo_relacionamento` preservados intactos). **Nenhuma linha de código desta
  task tenta ocultar, mascarar ou omitir `avaliador_id` na escrita** — a
  anonimização de `pares`/`subordinado` é uma regra de LEITURA que pertence à
  futura "Análise básica por avaliado" (views `respostas_identificadas`/
  `respostas_pares_agregadas` de `docs/schema_avaliacao360_pt_v2.sql`, ou
  equivalente TypeScript). **Nenhum endpoint desta task lê `itens_resposta`
  de volta para ninguém** — os 4 endpoints só criam `Resposta`/`ItemResposta`
  ou leem metadados estruturais (pesquisa/páginas/perguntas/relacionamentos),
  nunca resposta já gravada.
- **Clima (`clima_geral`)**: o anonimato é ESTRUTURAL, garantido pela
  ausência de FK de identidade em `respostas_clima`/`itens_resposta_clima`
  (colunas: só `id`, `pesquisa_id`, `ciclo_id`, `respondido_em` —
  **explicitamente SEM `colaborador_id`, SEM `sessao_id`, SEM `envio_id`**).
  `sessoes_resposta` é a ÚNICA ponte identidade↔intenção-de-responder
  (`envio_id` + `ciclo_participante_id` para clima) e **nunca** é referenciada
  por `respostas_clima`/`itens_resposta_clima`, nem o inverso — confira isso
  literalmente nos imports das entidades (`resposta-clima.entity.ts`,
  `item-resposta-clima.entity.ts` NÃO importam `SessaoResposta` nem
  `EnvioPesquisa`). Nenhuma rota, presente ou futura, deve adicionar uma
  coluna de identidade a essas duas tabelas "para facilitar auditoria" — isso
  quebraria a garantia de design pedida pelo usuário (reafirmado explicitamente
  na entidade via comentário, mesmo padrão de `RelacionamentoAvaliacao`/
  `EnvioPesquisa` "nunca ganha coluna de resposta/nota/valor").
- **Risco de corrida aceito no clima (documentado, não corrigido aqui)**: como
  não há FK de identidade em `respostas_clima`, não é possível (nem seria
  desejável) um `UNIQUE` "1 resposta por participante" nessa tabela — a
  proteção contra resposta duplicada do MESMO participante é (a) o gate em
  `confirmar-cpf` (`ciclo_participantes.respondeu_em != null` → `409
  JA_RESPONDIDO`, checado ANTES de emitir uma nova sessão) e (b) `usada_em`
  de uso único da sessão. Uma corrida genuína (duplo-clique/duas abas com a
  MESMA sessão, ambas passando o check de `usada_em` antes de qualquer
  commit) pode, em tese, gravar 2 respostas anônimas — aceito como o preço do
  anonimato estrutural, mesma classe de trade-off já assumida
  explicitamente pelo usuário para o contador `tentativas_cpf_invalidas`
  compartilhado (spec, seção 2.1).
- **Nenhuma rota desta task passa por `autenticar`.** Todas as 4 rotas de
  `coleta-respostas-publica.module.ts` são públicas — autorização por posse de
  `token`/`sessaoToken` + CPF, validada manualmente na camada de service
  (`buscarEnvioValidoOuFalhar`/`buscarSessaoValidaOuFalhar`), usando
  `AppDataSource` diretamente (TypeORM) — não há necessidade de
  `supabaseAdmin`/service role key nesta task, porque nenhuma leitura/escrita
  passa pelo cliente Supabase com RLS (tudo via TypeORM, que já usa a
  connection string direta do Postgres, contornando RLS por natureza — mesma
  observação já registrada na task anterior). **Nenhuma função exportada de
  `coleta-respostas-publica.service.ts` recebe ou usa `ColaboradorAutenticado`
  /`garantirPapel`** — isso é esperado e correto para este módulo, não uma
  omissão (avisar o `backend-codereviewer` para não sinalizar como achado
  crítico).
- **Single-tenant**: nenhuma coluna/parâmetro `organization_id` introduzido em
  nenhum lugar desta task.
- **`opcoesPessoa` (guard rail informativo, não uma violação)**: ver decisão
  de modelagem nº 7 — a resolução de opções para pergunta tipo `pessoa` lê
  `relacionamentos_avaliacao` (estrutural), nunca `itens_resposta`
  (conteúdo). Confirme no code review que `resolverOpcoesPessoa` nunca
  seleciona colunas de `respostas`/`itens_resposta`.

## Plano — Backend

### 1. backend-developer

**Status: CONCLUÍDO.**

Resumo da implementação (todos os subitens 1.1–1.7 seguidos literalmente, sem
desvio do plano):

- **1.1** Migration `backend/src/migrations/1788500000000-CriarColetaRespostasPublica.ts`
  criada exatamente como especificado (`sessoes_resposta`, `respostas`,
  `itens_resposta`, `respostas_clima`, `itens_resposta_clima`). **NÃO
  executada** contra nenhum banco real — precisa de `npm run migration:run`
  dentro de `backend/`, só mediante confirmação explícita do usuário.
- **1.2** 5 entidades novas criadas: `respostas/resposta.entity.ts`,
  `respostas/item-resposta.entity.ts`, `respostas-clima/resposta-clima.entity.ts`,
  `respostas-clima/item-resposta-clima.entity.ts`,
  `coleta-respostas-publica/sessao-resposta.entity.ts` — registradas
  automaticamente pelo glob de `data-source.ts`, sem alteração manual
  necessária.
- **1.3** `config/env.ts`: `sessaoRespostaTtlMinutos` (via `numeroComPadrao`,
  default 45) adicionado; `backend/.env.example` ganhou
  `# SESSAO_RESPOSTA_TTL_MINUTOS=45` comentado.
- **1.4** `middlewares/tratadorErros.ts`: entrada
  `uq_respostas_envio_id: 'JA_RESPONDIDO'` adicionada ao
  `MAPA_CONSTRAINT_PARA_CODIGO`.
- **1.5** Módulo `backend/src/modules/coleta-respostas-publica/` criado por
  completo: 2 DTOs, `coleta-respostas-publica.service.ts` (4 endpoints +
  helpers, nomes de função idênticos aos do plano),
  `coleta-respostas-publica.controller.ts`, `coleta-respostas-publica.module.ts`
  (sem `router.use(autenticar)`, conforme exigido).
- **1.6** `app.ts` atualizado: import + `app.use('/api/publico',
  coletaRespostasPublicaRouter)` adicionado após `/api/ciclos`, antes do
  `tratadorErros`.
- **1.7** Contrato de API implementado tal como a tabela final do plano.

**Único desvio do plano (cosmético, comportamento idêntico)**: em
`confirmarCpf`, os dois branches que chamam `registrarTentativaInvalida`
(360 e clima) foram reescritos com um `throw new ErroHttp(...)` explícito
logo após o `await`, em vez do `return montarRespostaConfirmacao(await
criarSessao(...))` sugerido no plano — o próprio plano já antecipava essa
liberdade de estilo ("nota sobre confirmarCpf, branch clima_geral"). Efeito
observável idêntico: 0 sessões criadas quando o CPF não bate, já que
`registrarTentativaInvalida` sempre lança antes do `throw` explícito ser
alcançado; a mudança só existe para dar ao `tsc` um ponto de saída explícito
sem depender de inferência de `never` através de `await`, e evita usar
`participante`/`avaliador` depois do bloco `if` sem essa garantia sintática.

**Build/testes**: `npm run build` roda sem nenhum erro novo introduzido por
esta task — o único erro de `tsc` remanescente
(`src/test/fakeRepository.ts:30`, `exactOptionalPropertyTypes`) é
pré-existente e não relacionado (arquivo não tocado por esta task, confirmado
via `git status`). `npm test` (Vitest): 141/141 testes existentes passando,
nenhuma regressão. Nenhum teste novo foi escrito (fase `test-engineer`
explicitamente pulada nesta rodada).

**Migrations pendentes de execução**: só
`1788500000000-CriarColetaRespostasPublica.ts` — não rodada, aguardando
confirmação explícita do usuário antes de `npm run migration:run`.

**Correção pontual (2026-09-03)**: bug real reportado — depois de confirmar
CPF, a próxima chamada do frontend ia para
`/api/publico/sessoes/undefined/formulario`. Causa: `SessaoResposta.token` é
`@Column({ type: 'uuid', unique: true })` sem `@Generated`/`default`
(intencional — valor gerado pelo `DEFAULT gen_random_uuid()` do Postgres,
nunca pela aplicação, mesmo padrão de `envios_pesquisa.tokenAcesso`), então o
TypeORM não inclui essa coluna no `RETURNING` do `INSERT` feito por
`repo.save()` em `criarSessao` — o objeto retornado tinha `token: undefined`
em memória (já persistido corretamente no banco), e
`montarRespostaConfirmacao` montava `sessaoToken: undefined`, removido pelo
`JSON.stringify` do corpo da resposta HTTP. Corrigido em `criarSessao`
(`coleta-respostas-publica.service.ts`) fazendo um `repo.findOneByOrFail({ id:
salva.id })` logo após o `save()`, para reler o `token` real gerado pelo
banco — mesmo padrão de re-fetch já usado por `buscarEnvioValidoOuFalhar`/
`buscarSessaoValidaOuFalhar` neste arquivo. Nenhuma mudança na entidade
`SessaoResposta` nem na migration. Verificado por leitura que
`enviarRespostas`/`buscarFormulario` não têm o mesmo padrão de bug (os únicos
valores default-gerados-pelo-banco lidos de objetos recém-criados/salvos são
sempre `id`/`*_em` via `@PrimaryGeneratedColumn`/`@CreateDateColumn`, ambos
corretamente incluídos no `RETURNING` pelo TypeORM). Nenhuma migration nova
necessária. `npm run build` (sem erros novos; o único erro remanescente de
`tsc`, em `src/test/fakeRepository.ts`, é pré-existente e não relacionado —
confirmado reproduzindo o mesmo erro com a mudança stashed) e `npm test`
(141/141 passando) rodados após a correção.

---

Antes de codar: invocar a skill `backend-modulo-crud` e reler por completo a
skill `backend-anonimizacao-respostas` — esta é a task mais sensível do
projeto para essa skill (primeira vez que `itens_resposta`/`respostas_clima`
passam a existir de fato). Reler também a seção "Guard rails de anonimização"
acima antes de escrever qualquer query.

#### 1.1 Migration (`backend/src/migrations/1788500000000-CriarColetaRespostasPublica.ts`)

Timestamp `1788500000000` (maior que `1788450000000`; ajustar se outra
migration tiver sido criada nesse intervalo — nunca reutilizar um timestamp já
usado). **Não rodar esta migration contra nenhum banco real sem confirmação
explícita do usuário.**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Coleta pública de respostas (`/responder/:token`). Cria:
 * - `sessoes_resposta`: capability token temporário emitido após confirmação
 *   de CPF, ponte ÚNICA entre identidade e intenção de responder. Nunca
 *   referenciada por `respostas`/`itens_resposta`/`respostas_clima`/
 *   `itens_resposta_clima`, nem o inverso.
 * - `respostas`/`itens_resposta` (avaliação 360, greenfield): escrita SEMPRE
 *   identificada via `envio_id -> relacionamento_id -> avaliador_id`. A
 *   anonimização de pares/subordinado é regra de LEITURA de uma task futura,
 *   nunca aplicada aqui.
 * - `respostas_clima`/`itens_resposta_clima` (clima_geral): anonimato
 *   ESTRUTURAL — nenhuma FK de identidade (sem colaborador_id, sem
 *   sessao_id, sem envio_id). Nunca adicionar uma nessas duas tabelas.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada a todas as migrations
 * anteriores (nenhuma delas rodou ainda contra um banco real).
 */
export class CriarColetaRespostasPublica1788500000000 implements MigrationInterface {
  name = 'CriarColetaRespostasPublica1788500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sessoes_resposta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        envio_id uuid NOT NULL REFERENCES envios_pesquisa(id) ON DELETE CASCADE,
        ciclo_participante_id uuid REFERENCES ciclo_participantes(id) ON DELETE CASCADE,
        tipo_pesquisa tipo_pesquisa NOT NULL,
        expira_em timestamptz NOT NULL,
        usada_em timestamptz,
        criada_em timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_sessoes_resposta_envio ON sessoes_resposta (envio_id)`)

    await queryRunner.query(`
      CREATE TABLE respostas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        envio_id uuid NOT NULL REFERENCES envios_pesquisa(id) ON DELETE CASCADE,
        respondido_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_respostas_envio_id UNIQUE (envio_id)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE itens_resposta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        resposta_id uuid NOT NULL REFERENCES respostas(id) ON DELETE CASCADE,
        pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
        valor jsonb NOT NULL DEFAULT '{}'::jsonb,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_itens_resposta_resposta_pergunta UNIQUE (resposta_id, pergunta_id)
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_itens_resposta ON itens_resposta (resposta_id)`)
    await queryRunner.query(`CREATE INDEX idx_itens_pergunta ON itens_resposta (pergunta_id)`)

    // SEM colaborador_id, SEM sessao_id, SEM envio_id — guard rail de
    // anonimização estrutural (ver comentário do cabeçalho). NUNCA adicionar
    // nenhuma dessas colunas aqui, em nenhuma migration futura.
    await queryRunner.query(`
      CREATE TABLE respostas_clima (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
        ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
        respondido_em timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_respostas_clima_pesquisa ON respostas_clima (pesquisa_id)`)
    await queryRunner.query(`CREATE INDEX idx_respostas_clima_ciclo ON respostas_clima (ciclo_id)`)

    await queryRunner.query(`
      CREATE TABLE itens_resposta_clima (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        resposta_clima_id uuid NOT NULL REFERENCES respostas_clima(id) ON DELETE CASCADE,
        pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
        valor jsonb NOT NULL DEFAULT '{}'::jsonb,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_itens_resposta_clima_resposta_pergunta UNIQUE (resposta_clima_id, pergunta_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX idx_itens_resposta_clima_resposta ON itens_resposta_clima (resposta_clima_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_itens_resposta_clima_pergunta ON itens_resposta_clima (pergunta_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_itens_resposta_clima_pergunta`)
    await queryRunner.query(`DROP INDEX idx_itens_resposta_clima_resposta`)
    await queryRunner.query(`DROP TABLE itens_resposta_clima`)

    await queryRunner.query(`DROP INDEX idx_respostas_clima_ciclo`)
    await queryRunner.query(`DROP INDEX idx_respostas_clima_pesquisa`)
    await queryRunner.query(`DROP TABLE respostas_clima`)

    await queryRunner.query(`DROP INDEX idx_itens_pergunta`)
    await queryRunner.query(`DROP INDEX idx_itens_resposta`)
    await queryRunner.query(`DROP TABLE itens_resposta`)

    await queryRunner.query(`DROP TABLE respostas`)

    await queryRunner.query(`DROP INDEX idx_sessoes_resposta_envio`)
    await queryRunner.query(`DROP TABLE sessoes_resposta`)
  }
}
```

**Nomes a usar exatamente**: tabelas `sessoes_resposta`, `respostas`,
`itens_resposta`, `respostas_clima`, `itens_resposta_clima`; constraints
`uq_respostas_envio_id`, `uq_itens_resposta_resposta_pergunta`,
`uq_itens_resposta_clima_resposta_pergunta`; índices conforme acima.

#### 1.2 Entidades novas (5 arquivos)

**`backend/src/modules/respostas/resposta.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'

/**
 * Avaliação 360 — greenfield, nome/colunas batendo literalmente com
 * docs/schema_avaliacao360_pt_v2.sql (`respostas`), sem divergência
 * conhecida. `avaliador_id`/`relacionamento_id` ficam preservados na cadeia
 * respostas -> envios_pesquisa -> relacionamentos_avaliacao — a anonimização
 * de pares/subordinado é regra de LEITURA (futura), nunca de escrita (ver
 * skill backend-anonimizacao-respostas). Vive em módulo próprio (`respostas/`,
 * não dentro de `coleta-respostas-publica/`) para ser reaproveitável pela
 * futura "Análise básica por avaliado" sem sugerir "só escrita pública".
 */
@Entity('respostas')
export class Resposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'envio_id', type: 'uuid', unique: true })
  envioId!: string

  @ManyToOne(() => EnvioPesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio!: EnvioPesquisa

  @CreateDateColumn({ name: 'respondido_em' })
  respondidoEm!: Date
}
```

**`backend/src/modules/respostas/item-resposta.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Resposta } from './resposta.entity'

@Entity('itens_resposta')
export class ItemResposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'resposta_id', type: 'uuid' })
  respostaId!: string

  @ManyToOne(() => Resposta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resposta_id' })
  resposta!: Resposta

  @Column({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @ManyToOne(() => Pergunta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pergunta_id' })
  pergunta!: Pergunta

  // Shape por tipo de pergunta, ver docs/schema_avaliacao360_pt_v2.sql:
  // likert { nota }, texto_aberto { texto }, matriz { notas: { <competenciaId>: nota } },
  // pessoa { colaboradorId }.
  @Column({ type: 'jsonb', default: {} })
  valor!: Record<string, unknown>

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

**`backend/src/modules/respostas-clima/resposta-clima.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

/**
 * Anonimato ESTRUTURAL (não regra de leitura): SEM colaborador_id, SEM
 * sessao_id, SEM envio_id — nenhuma FK de identidade. `sessoes_resposta` é a
 * única ponte identidade -> intenção de responder e NUNCA referencia nem é
 * referenciada por esta tabela. NENHUMA rota, presente ou futura, deve
 * adicionar uma coluna de identidade aqui — quebraria a garantia de design
 * pedida explicitamente pelo usuário (ver task-backend.md, "Guard rails de
 * anonimização").
 */
@Entity('respostas_clima')
export class RespostaClima {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' })
  pesquisaId!: string

  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  // Redundante com pesquisa_id (uma pesquisa pertence a 1 só ciclo), incluído
  // por conveniência para agregação futura sem join extra — decisão de
  // conveniência, não estrutural (ver spec, seção 7.3).
  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId!: string

  @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao

  @CreateDateColumn({ name: 'respondido_em' })
  respondidoEm!: Date
}
```

**`backend/src/modules/respostas-clima/item-resposta-clima.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Pergunta } from '../perguntas/pergunta.entity'
import { RespostaClima } from './resposta-clima.entity'

@Entity('itens_resposta_clima')
export class ItemRespostaClima {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'resposta_clima_id', type: 'uuid' })
  respostaClimaId!: string

  @ManyToOne(() => RespostaClima, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resposta_clima_id' })
  respostaClima!: RespostaClima

  @Column({ name: 'pergunta_id', type: 'uuid' })
  perguntaId!: string

  @ManyToOne(() => Pergunta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pergunta_id' })
  pergunta!: Pergunta

  @Column({ type: 'jsonb', default: {} })
  valor!: Record<string, unknown>

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

**`backend/src/modules/coleta-respostas-publica/sessao-resposta.entity.ts`**

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { TIPO_PESQUISA_VALORES, type TipoPesquisa } from '../../common/enums'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'

/**
 * Ponte temporária IDENTIDADE -> INTENÇÃO DE RESPONDER. NUNCA referenciada
 * por `respostas`/`itens_resposta` nem por `respostas_clima`/
 * `itens_resposta_clima` (nem o inverso) — essa ausência de referência
 * cruzada é o que garante o anonimato estrutural do clima. Uso único:
 * `usadaEm` marca consumo (resposta já enviada), nunca reutilizável depois.
 */
@Entity('sessoes_resposta')
export class SessaoResposta {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // Preenchido pelo DEFAULT do Postgres (gen_random_uuid()) — a aplicação
  // NUNCA gera nem reatribui este valor (mesmo padrão de
  // envios_pesquisa.tokenAcesso).
  @Column({ type: 'uuid', unique: true })
  token!: string

  @Column({ name: 'envio_id', type: 'uuid' })
  envioId!: string

  @ManyToOne(() => EnvioPesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'envio_id' })
  envio!: EnvioPesquisa

  // Preenchido SÓ para clima_geral (única ponte identidade -> intenção de
  // responder, usada para saber qual ciclo_participantes marcar). NULL para
  // avaliacao_360.
  @Column({ name: 'ciclo_participante_id', type: 'uuid', nullable: true })
  cicloParticipanteId!: string | null

  @ManyToOne(() => CicloParticipante, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_participante_id' })
  cicloParticipante!: CicloParticipante | null

  // Denormalizado — evita 1 join extra para decidir o branch de gravação no
  // envio final.
  @Column({
    name: 'tipo_pesquisa',
    type: 'enum',
    enum: TIPO_PESQUISA_VALORES,
    enumName: 'tipo_pesquisa',
  })
  tipoPesquisa!: TipoPesquisa

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date

  @Column({ name: 'usada_em', type: 'timestamptz', nullable: true })
  usadaEm!: Date | null

  @CreateDateColumn({ name: 'criada_em' })
  criadaEm!: Date
}
```

#### 1.3 `config/env.ts` — TTL da sessão

Adicionar `sessaoRespostaTtlMinutos: number` seguindo o mesmo espírito de
`variavelComPadrao`, mas com parsing numérico defensivo:

```ts
interface Env {
  // ...campos existentes
  sessaoRespostaTtlMinutos: number
}

// Igual a variavelComPadrao, mas faz parsing numérico com fallback seguro
// para valor ausente/vazio/não numérico/<= 0.
function numeroComPadrao(nome: string, padrao: number): number {
  const bruto = process.env[nome]
  if (!bruto || bruto.trim().length === 0) return padrao
  const numero = Number(bruto)
  return Number.isFinite(numero) && numero > 0 ? numero : padrao
}

export const env: Env = {
  // ...campos existentes, sem alteração
  sessaoRespostaTtlMinutos: numeroComPadrao('SESSAO_RESPOSTA_TTL_MINUTOS', 45),
}
```

Opcional (não bloqueante): adicionar `SESSAO_RESPOSTA_TTL_MINUTOS=` comentado
em `backend/.env.example`.

#### 1.4 `middlewares/tratadorErros.ts` — 1 entrada nova

```ts
const MAPA_CONSTRAINT_PARA_CODIGO: Record<string, string> = {
  // ...entradas existentes, sem alteração
  uq_respostas_envio_id: 'JA_RESPONDIDO',
}
```

Justificativa (ver decisão de modelagem nº 9): diferente de `.orIgnore()` já
usado em `gerarEnviosPesquisa`/`gerarEnviosClima`, o `INSERT` em `respostas`
dentro de `enviarRespostas` é um `.save()` direto — uma corrida real de
duplo-envio (mesma sessão, duas requisições quase simultâneas) pode violar
essa constraint, e o cliente precisa de um `409 JA_RESPONDIDO` (não um `500`).

#### 1.5 Módulo `backend/src/modules/coleta-respostas-publica/`

##### 1.5.1 DTOs

**`dto/confirmar-cpf.dto.ts`**

```ts
/** Validação real (normalização + comparação) acontece no service — o DTO só
 * documenta o formato de entrada esperado (body cru, não tipado pelo Express). */
export interface ConfirmarCpfDto {
  cpf: unknown
}
```

**`dto/enviar-respostas.dto.ts`**

```ts
export interface EnviarRespostasDto {
  // Formato/obrigatoriedade validados manualmente no service — o shape de
  // `valor` varia por tipo de pergunta (ver valorValidoParaTipo).
  itens: unknown
}
```

##### 1.5.2 `coleta-respostas-publica.service.ts`

Este é o arquivo central da task. Estrutura obrigatória (nomes de função
exatos, para o code review comparar 1:1):

```ts
import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { normalizarCpf } from '../../common/cpf'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import type { TipoPergunta, TipoPesquisa, TipoRelacionamento } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Competencia } from '../competencias/competencia.entity'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'
import { PerguntaCompetencia } from '../perguntas/pergunta-competencia.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemRespostaClima } from '../respostas-clima/item-resposta-clima.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import type { ConfirmarCpfDto } from './dto/confirmar-cpf.dto'
import type { EnviarRespostasDto } from './dto/enviar-respostas.dto'
import { SessaoResposta } from './sessao-resposta.entity'

const LIMITE_TENTATIVAS_CPF = 5

// --- Tipos de resposta HTTP (contrato literal da spec, seção 6) ----------

export interface StatusEnvioResposta {
  estado: 'aguardando_cpf'
}

export interface ConfirmarCpfResposta {
  sessaoToken: string
  expiraEm: string
  tipoPesquisa: TipoPesquisa
}

export interface CompetenciaResumoFormulario {
  id: string
  nome: string
}

export interface OpcaoPessoaFormulario {
  id: string
  nomeCompleto: string
}

export interface PerguntaFormulario {
  id: string
  tipo: TipoPergunta
  enunciado: string
  obrigatoria: boolean
  ordem: number
  configuracao: Record<string, unknown>
  competencias?: CompetenciaResumoFormulario[]
  opcoesPessoa?: OpcaoPessoaFormulario[]
}

export interface PaginaFormulario {
  id: string
  ordem: number
  titulo: string | null
  perguntas: PerguntaFormulario[]
}

export interface FormularioResposta {
  pesquisa: { titulo: string; mensagemBoasVindas: string | null; logoUrl: string | null }
  paginas: PaginaFormulario[]
}

export interface EnviarRespostasResposta {
  sucesso: true
}

// --- Helpers internos compartilhados --------------------------------------

/**
 * Checagem de estado do envio, na ORDEM exigida pela spec (seção 4): token
 * existe -> bloqueado por tentativas -> ciclo/pesquisa ativos -> envio
 * expirado -> (só avaliacao_360) já respondido. Reaproveitada por
 * `obterStatusEnvio` e `confirmarCpf`, para os dois nunca divergirem.
 * `pesquisa.cicloId` é usado para achar o ciclo em AMBOS os tipos de
 * pesquisa (ver "Decisões de modelagem" nº 15 do plano) — nunca precisa de
 * um branch por tipo aqui.
 */
async function buscarEnvioValidoOuFalhar(
  token: string,
): Promise<{ envio: EnvioPesquisa; pesquisa: Pesquisa }> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ tokenAcesso: token })
  if (!envio) {
    throw new ErroHttp(404, 'LINK_INVALIDO', 'Link de acesso inválido.')
  }

  if (envio.tentativasCpfInvalidas >= LIMITE_TENTATIVAS_CPF) {
    throw new ErroHttp(
      403,
      'BLOQUEADO_TENTATIVAS_CPF',
      'Não foi possível confirmar seus dados. Procure o RH.',
    )
  }

  const pesquisa = await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
  const ciclo = pesquisa?.cicloId
    ? await AppDataSource.getRepository(CicloAvaliacao).findOneBy({ id: pesquisa.cicloId })
    : null

  if (!pesquisa || pesquisa.status !== 'publicada' || !ciclo || ciclo.status !== 'ativo') {
    throw new ErroHttp(
      409,
      'CICLO_OU_PESQUISA_INATIVOS',
      'Este ciclo ou pesquisa não está mais ativo.',
    )
  }

  if (envio.status === 'expirado') {
    throw new ErroHttp(410, 'ENVIO_EXPIRADO', 'Este link de acesso expirou.')
  }

  // Só verificável aqui para avaliacao_360 (o envio já identifica 1 pessoa).
  // clima_geral: adiado para depois do match de CPF (ver confirmarCpf).
  if (envio.relacionamentoId && envio.status === 'concluido') {
    throw new ErroHttp(409, 'JA_RESPONDIDO', 'Você já respondeu esta pesquisa.')
  }

  return { envio, pesquisa }
}

/** Grava cpf_confirmado_em SÓ na primeira confirmação (WHERE ... IS NULL) —
 * correto mesmo sob concorrência, nos dois fluxos (ver decisão nº 6). */
async function marcarPrimeiraConfirmacaoCpf(envioId: string): Promise<void> {
  await AppDataSource.createQueryBuilder()
    .update(EnvioPesquisa)
    .set({ cpfConfirmadoEm: () => 'now()' })
    .where('id = :envioId', { envioId })
    .andWhere('cpf_confirmado_em IS NULL')
    .execute()
}

/** Incrementa a tentativa inválida e lança o erro apropriado — nunca retorna
 * normalmente. Se atingir o limite, responde já com BLOQUEADO_TENTATIVAS_CPF
 * (spec, seção 6.2) em vez de CPF_NAO_CONFERE. */
async function registrarTentativaInvalida(envio: EnvioPesquisa): Promise<never> {
  envio.tentativasCpfInvalidas += 1
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  if (envio.tentativasCpfInvalidas >= LIMITE_TENTATIVAS_CPF) {
    throw new ErroHttp(
      403,
      'BLOQUEADO_TENTATIVAS_CPF',
      'Não foi possível confirmar seus dados. Procure o RH.',
    )
  }
  throw new ErroHttp(422, 'CPF_NAO_CONFERE', 'CPF não confere.')
}

async function criarSessao(
  envioId: string,
  cicloParticipanteId: string | null,
  tipoPesquisa: TipoPesquisa,
): Promise<SessaoResposta> {
  const expiraEm = new Date(Date.now() + env.sessaoRespostaTtlMinutos * 60_000)
  const repo = AppDataSource.getRepository(SessaoResposta)
  return repo.save(repo.create({ envioId, cicloParticipanteId, tipoPesquisa, expiraEm }))
}

function montarRespostaConfirmacao(sessao: SessaoResposta): ConfirmarCpfResposta {
  return {
    sessaoToken: sessao.token,
    expiraEm: sessao.expiraEm.toISOString(),
    tipoPesquisa: sessao.tipoPesquisa,
  }
}

/** Checagem de sessão, reaproveitada por buscarFormulario e enviarRespostas. */
async function buscarSessaoValidaOuFalhar(sessaoToken: string): Promise<SessaoResposta> {
  const sessao = await AppDataSource.getRepository(SessaoResposta).findOneBy({ token: sessaoToken })
  if (!sessao) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }
  if (sessao.usadaEm) {
    throw new ErroHttp(409, 'SESSAO_JA_UTILIZADA', 'Esta sessão já foi utilizada.')
  }
  if (sessao.expiraEm.getTime() < Date.now()) {
    throw new ErroHttp(410, 'SESSAO_EXPIRADA', 'Sessão expirada.')
  }
  return sessao
}

/**
 * Resolve as opções de uma pergunta tipo `pessoa`: colaboradores que têm,
 * no MESMO ciclo, um relacionamento com `avaliado_id` igual ao avaliado do
 * relacionamento atual e `tipo_relacionamento` presente em
 * `configuracao.filtroRelacionamento` (ver decisão de modelagem nº 7). Lê só
 * `relacionamentos_avaliacao` (estrutural) — NUNCA `itens_resposta`.
 */
async function resolverOpcoesPessoa(
  relacionamento: RelacionamentoAvaliacao,
  configuracao: Record<string, unknown>,
): Promise<OpcaoPessoaFormulario[]> {
  const filtro = Array.isArray(configuracao.filtroRelacionamento)
    ? (configuracao.filtroRelacionamento as TipoRelacionamento[])
    : []
  if (filtro.length === 0) return []

  return AppDataSource.getRepository(RelacionamentoAvaliacao)
    .createQueryBuilder('r')
    .innerJoin(Colaborador, 'c', 'c.id = r.avaliador_id')
    .select('r.avaliador_id', 'id')
    .addSelect('c.nome_completo', 'nomeCompleto')
    .where('r.ciclo_id = :cicloId', { cicloId: relacionamento.cicloId })
    .andWhere('r.avaliado_id = :avaliadoId', { avaliadoId: relacionamento.avaliadoId })
    .andWhere('r.tipo_relacionamento IN (:...tipos)', { tipos: filtro })
    .getRawMany<OpcaoPessoaFormulario>()
}

/**
 * Valida o `valor` de um item de resposta contra o shape esperado do tipo de
 * pergunta (docs/schema_avaliacao360_pt_v2.sql). Usada tanto para perguntas
 * obrigatórias (item precisa existir E ser válido) quanto opcionais (se
 * existir, precisa ser válido — defesa contra payload forjado).
 */
function valorValidoParaTipo(
  tipo: TipoPergunta,
  valor: unknown,
  contexto: { niveis?: number; competenciaIds: string[]; opcoesPessoaIds?: Set<string> },
): boolean {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false
  const objeto = valor as Record<string, unknown>
  const niveis = contexto.niveis ?? 0

  if (tipo === 'likert') {
    const nota = objeto.nota
    return typeof nota === 'number' && Number.isInteger(nota) && nota >= 1 && nota <= niveis
  }

  if (tipo === 'texto_aberto') {
    return typeof objeto.texto === 'string' && objeto.texto.trim().length > 0
  }

  if (tipo === 'matriz') {
    const notas = objeto.notas
    if (typeof notas !== 'object' || notas === null || Array.isArray(notas)) return false
    const notasObjeto = notas as Record<string, unknown>
    return contexto.competenciaIds.every((competenciaId) => {
      const nota = notasObjeto[competenciaId]
      return typeof nota === 'number' && Number.isInteger(nota) && nota >= 1 && nota <= niveis
    })
  }

  // tipo === 'pessoa'
  const colaboradorId = objeto.colaboradorId
  return typeof colaboradorId === 'string' && (contexto.opcoesPessoaIds?.has(colaboradorId) ?? false)
}

// --- Endpoint 1: GET /api/publico/envios/:token/status --------------------

export async function obterStatusEnvio(token: string): Promise<StatusEnvioResposta> {
  await buscarEnvioValidoOuFalhar(token)
  return { estado: 'aguardando_cpf' }
}

// --- Endpoint 2: POST /api/publico/envios/:token/confirmar-cpf ------------

export async function confirmarCpf(
  token: string,
  dto: ConfirmarCpfDto,
): Promise<ConfirmarCpfResposta> {
  const { envio } = await buscarEnvioValidoOuFalhar(token)
  const cpfDigitos = normalizarCpf(dto.cpf)

  if (envio.relacionamentoId) {
    // avaliacao_360: CPF deve bater com o AVALIADOR do relacionamento.
    const relacionamento = await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({
      id: envio.relacionamentoId,
    })
    const avaliador = relacionamento
      ? await AppDataSource.getRepository(Colaborador).findOneBy({ id: relacionamento.avaliadorId })
      : null

    if (!avaliador || avaliador.cpf !== cpfDigitos) {
      await registrarTentativaInvalida(envio)
    }

    await marcarPrimeiraConfirmacaoCpf(envio.id)
    const sessao = await criarSessao(envio.id, null, 'avaliacao_360')
    return montarRespostaConfirmacao(sessao)
  }

  // clima_geral: CPF deve bater com algum ciclo_participantes do ciclo do envio.
  const participantes = await AppDataSource.getRepository(CicloParticipante).find({
    where: { cicloId: envio.cicloId! },
    relations: { colaborador: true },
  })
  const participante = participantes.find((p) => p.colaborador.cpf === cpfDigitos)

  if (!participante) {
    await registrarTentativaInvalida(envio)
    // registrarTentativaInvalida sempre lança — linha seguinte é inalcançável,
    // só existe para o TypeScript não reclamar de "participante possivelmente undefined".
    return montarRespostaConfirmacao(await criarSessao(envio.id, null, 'clima_geral'))
  }

  if (participante.respondeuEm) {
    throw new ErroHttp(409, 'JA_RESPONDIDO', 'Você já respondeu esta pesquisa.')
  }

  await marcarPrimeiraConfirmacaoCpf(envio.id)
  const sessao = await criarSessao(envio.id, participante.id, 'clima_geral')
  return montarRespostaConfirmacao(sessao)
}

// --- Endpoint 3: GET /api/publico/sessoes/:sessaoToken/formulario ---------

export async function buscarFormulario(sessaoToken: string): Promise<FormularioResposta> {
  const sessao = await buscarSessaoValidaOuFalhar(sessaoToken)

  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ id: sessao.envioId })
  const pesquisa = envio
    ? await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
    : null
  if (!envio || !pesquisa) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }

  const paginas = await AppDataSource.getRepository(PaginaPesquisa).find({
    where: { pesquisaId: pesquisa.id },
    order: { ordem: 'ASC' },
  })
  const paginaIds = paginas.map((p) => p.id)

  const perguntas =
    paginaIds.length === 0
      ? []
      : await AppDataSource.getRepository(Pergunta).find({
          where: { paginaId: In(paginaIds) },
          order: { ordem: 'ASC' },
        })
  const perguntaIds = perguntas.map((p) => p.id)

  const vinculos =
    perguntaIds.length === 0
      ? []
      : await AppDataSource.getRepository(PerguntaCompetencia)
          .createQueryBuilder('pc')
          .innerJoin(Competencia, 'c', 'c.id = pc.competencia_id')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('c.id', 'id')
          .addSelect('c.nome', 'nome')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; id: string; nome: string }>()

  const competenciasPorPergunta = new Map<string, CompetenciaResumoFormulario[]>()
  for (const v of vinculos) {
    const lista = competenciasPorPergunta.get(v.perguntaId) ?? []
    lista.push({ id: v.id, nome: v.nome })
    competenciasPorPergunta.set(v.perguntaId, lista)
  }

  // Só carregado quando avaliacao_360 (relacionamentoId presente) — pergunta
  // tipo `pessoa` nunca existe em clima_geral (bloqueado em perguntas.service.ts).
  const relacionamento = envio.relacionamentoId
    ? await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({ id: envio.relacionamentoId })
    : null

  const perguntasPorPagina = new Map<string, PerguntaFormulario[]>()
  for (const pergunta of perguntas) {
    const item: PerguntaFormulario = {
      id: pergunta.id,
      tipo: pergunta.tipo,
      enunciado: pergunta.enunciado,
      obrigatoria: pergunta.obrigatoria,
      ordem: pergunta.ordem,
      configuracao: pergunta.configuracao,
    }
    if (pergunta.tipo === 'matriz') {
      item.competencias = competenciasPorPergunta.get(pergunta.id) ?? []
    }
    if (pergunta.tipo === 'pessoa' && relacionamento) {
      item.opcoesPessoa = await resolverOpcoesPessoa(relacionamento, pergunta.configuracao)
    }
    const lista = perguntasPorPagina.get(pergunta.paginaId) ?? []
    lista.push(item)
    perguntasPorPagina.set(pergunta.paginaId, lista)
  }

  return {
    pesquisa: {
      titulo: pesquisa.titulo,
      mensagemBoasVindas: pesquisa.mensagemBoasVindas,
      logoUrl: pesquisa.logoUrl,
    },
    paginas: paginas.map((pagina) => ({
      id: pagina.id,
      ordem: pagina.ordem,
      titulo: pagina.titulo,
      perguntas: perguntasPorPagina.get(pagina.id) ?? [],
    })),
  }
}

// --- Endpoint 4: POST /api/publico/sessoes/:sessaoToken/respostas ---------

export async function enviarRespostas(
  sessaoToken: string,
  dto: EnviarRespostasDto,
): Promise<EnviarRespostasResposta> {
  const sessao = await buscarSessaoValidaOuFalhar(sessaoToken)

  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ id: sessao.envioId })
  if (!envio) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }
  const pesquisa = await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
  if (!pesquisa) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }

  const itensBrutos = Array.isArray(dto.itens) ? dto.itens : null
  if (!itensBrutos) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "itens" deve ser um array.')
  }

  const paginas = await AppDataSource.getRepository(PaginaPesquisa).find({
    where: { pesquisaId: pesquisa.id },
  })
  const paginaIds = paginas.map((p) => p.id)
  const perguntas =
    paginaIds.length === 0
      ? []
      : await AppDataSource.getRepository(Pergunta).find({ where: { paginaId: In(paginaIds) } })
  const perguntasPorId = new Map(perguntas.map((p) => [p.id, p]))

  // Dedupe por perguntaId — a ÚLTIMA ocorrência do array vence (decisão nº 14).
  const itensPorPergunta = new Map<string, unknown>()
  for (const item of itensBrutos) {
    if (typeof item !== 'object' || item === null) {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Cada item de "itens" deve ser um objeto.')
    }
    const perguntaId = (item as Record<string, unknown>).perguntaId
    if (typeof perguntaId !== 'string' || !perguntasPorId.has(perguntaId)) {
      throw new ErroHttp(
        422,
        'PERGUNTA_FORA_DA_PESQUISA',
        'Uma ou mais perguntas informadas não pertencem a esta pesquisa.',
      )
    }
    itensPorPergunta.set(perguntaId, (item as Record<string, unknown>).valor)
  }

  const perguntaIds = perguntas.map((p) => p.id)
  const vinculos =
    perguntaIds.length === 0
      ? []
      : await AppDataSource.getRepository(PerguntaCompetencia)
          .createQueryBuilder('pc')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('pc.competencia_id', 'competenciaId')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; competenciaId: string }>()

  const competenciaIdsPorPergunta = new Map<string, string[]>()
  for (const v of vinculos) {
    const lista = competenciaIdsPorPergunta.get(v.perguntaId) ?? []
    lista.push(v.competenciaId)
    competenciaIdsPorPergunta.set(v.perguntaId, lista)
  }

  const relacionamento = envio.relacionamentoId
    ? await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({ id: envio.relacionamentoId })
    : null

  const opcoesPessoaPorPergunta = new Map<string, Set<string>>()
  for (const pergunta of perguntas) {
    if (pergunta.tipo === 'pessoa' && relacionamento) {
      const opcoes = await resolverOpcoesPessoa(relacionamento, pergunta.configuracao)
      opcoesPessoaPorPergunta.set(pergunta.id, new Set(opcoes.map((o) => o.id)))
    }
  }

  // Validação AUTORITATIVA de obrigatoriedade — roda sobre TODAS as
  // perguntas da pesquisa de uma vez (decisão nº 11). Itens não obrigatórios
  // presentes no payload também são validados quanto ao formato.
  for (const pergunta of perguntas) {
    const valor = itensPorPergunta.get(pergunta.id)
    if (valor === undefined) {
      if (pergunta.obrigatoria) {
        throw new ErroHttp(
          422,
          'RESPOSTA_INCOMPLETA',
          'Uma ou mais perguntas obrigatórias não foram respondidas.',
        )
      }
      continue
    }

    const configuracao = pergunta.configuracao as Record<string, unknown>
    const valido = valorValidoParaTipo(pergunta.tipo, valor, {
      niveis: typeof configuracao.niveis === 'number' ? configuracao.niveis : undefined,
      competenciaIds: competenciaIdsPorPergunta.get(pergunta.id) ?? [],
      opcoesPessoaIds: opcoesPessoaPorPergunta.get(pergunta.id),
    })
    if (!valido) {
      throw new ErroHttp(
        422,
        'RESPOSTA_INCOMPLETA',
        'Uma ou mais respostas têm formato inválido para o tipo de pergunta.',
      )
    }
  }

  await AppDataSource.transaction(async (manager) => {
    if (envio.relacionamentoId) {
      // avaliacao_360: escrita SEMPRE identificada via envio_id (guard rail —
      // nenhuma tentativa de ocultar avaliador_id aqui, ver "Guard rails de
      // anonimização").
      const respostaRepo = manager.getRepository(Resposta)
      const resposta = await respostaRepo.save(respostaRepo.create({ envioId: envio.id }))

      const itemRepo = manager.getRepository(ItemResposta)
      for (const [perguntaId, valor] of itensPorPergunta) {
        await itemRepo.save(
          itemRepo.create({ respostaId: resposta.id, perguntaId, valor: valor as Record<string, unknown> }),
        )
      }

      await manager
        .getRepository(EnvioPesquisa)
        .update({ id: envio.id }, { status: 'concluido', concluidoEm: new Date() })
    } else {
      // clima_geral: anonimato ESTRUTURAL — nenhuma coluna de identidade
      // gravada aqui (ver comentário da entidade RespostaClima).
      const respostaClimaRepo = manager.getRepository(RespostaClima)
      const respostaClima = await respostaClimaRepo.save(
        respostaClimaRepo.create({ pesquisaId: pesquisa.id, cicloId: envio.cicloId! }),
      )

      const itemClimaRepo = manager.getRepository(ItemRespostaClima)
      for (const [perguntaId, valor] of itensPorPergunta) {
        await itemClimaRepo.save(
          itemClimaRepo.create({
            respostaClimaId: respostaClima.id,
            perguntaId,
            valor: valor as Record<string, unknown>,
          }),
        )
      }

      // sessao.cicloParticipanteId é a ÚNICA fonte usada para marcar quem
      // respondeu — NUNCA derivado de algo dentro da resposta em si.
      await manager
        .getRepository(CicloParticipante)
        .update({ id: sessao.cicloParticipanteId! }, { respondeuEm: new Date() })
    }

    // Uso único — impede reenviar com a mesma sessão (os dois fluxos).
    await manager.getRepository(SessaoResposta).update({ id: sessao.id }, { usadaEm: new Date() })
  })

  return { sucesso: true }
}
```

**Nota sobre `confirmarCpf`, branch clima_geral**: `registrarTentativaInvalida`
sempre lança (`Promise<never>`) — a linha `return
montarRespostaConfirmacao(await criarSessao(...))` logo depois dela é
inalcançável em runtime, existe só para satisfazer o *type checker* do
TypeScript (que não consegue inferir "unreachable" a partir de uma função
`async` que lança). Se o `backend-developer` preferir uma forma mais limpa
(ex.: `if (!participante) { await registrarTentativaInvalida(envio); throw
new Error('inalcançável') }` ou reestruturar com early-return antes de
qualquer `await`), é uma escolha de estilo — o comportamento observável tem
que ser idêntico: 0 sessões criadas quando o CPF não bate.

##### 1.5.3 `coleta-respostas-publica.controller.ts`

```ts
import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as coletaRespostasPublicaService from './coleta-respostas-publica.service'

export async function obterStatusEnvioController(req: Request, res: Response): Promise<void> {
  const token = obterParametroRota(req, 'token')
  const resposta = await coletaRespostasPublicaService.obterStatusEnvio(token)
  res.status(200).json(resposta)
}

export async function confirmarCpfController(req: Request, res: Response): Promise<void> {
  const token = obterParametroRota(req, 'token')
  const resposta = await coletaRespostasPublicaService.confirmarCpf(token, req.body ?? {})
  res.status(200).json(resposta)
}

export async function buscarFormularioController(req: Request, res: Response): Promise<void> {
  const sessaoToken = obterParametroRota(req, 'sessaoToken')
  const resposta = await coletaRespostasPublicaService.buscarFormulario(sessaoToken)
  res.status(200).json(resposta)
}

export async function enviarRespostasController(req: Request, res: Response): Promise<void> {
  const sessaoToken = obterParametroRota(req, 'sessaoToken')
  const resposta = await coletaRespostasPublicaService.enviarRespostas(sessaoToken, req.body ?? {})
  res.status(200).json(resposta)
}
```

##### 1.5.4 `coleta-respostas-publica.module.ts`

```ts
import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import {
  buscarFormularioController,
  confirmarCpfController,
  enviarRespostasController,
  obterStatusEnvioController,
} from './coleta-respostas-publica.controller'

// ROTA PÚBLICA — NUNCA chamar `autenticar` aqui. Colaborador comum não tem
// conta no Supabase Auth (só admin/gestor_rh têm, via
// colaboradores.usuario_auth_id); autorização é inteiramente por posse do
// `token`/`sessaoToken` (capability tokens) + CPF, validada manualmente em
// coleta-respostas-publica.service.ts. Mesmo padrão de arquitetura já
// documentado em docs/schema_avaliacao360_pt_v2.sql (comentário sobre RLS).
const router = Router()

router.get('/envios/:token/status', asyncHandler(obterStatusEnvioController))
router.post('/envios/:token/confirmar-cpf', asyncHandler(confirmarCpfController))
router.get('/sessoes/:sessaoToken/formulario', asyncHandler(buscarFormularioController))
router.post('/sessoes/:sessaoToken/respostas', asyncHandler(enviarRespostasController))

export { router as coletaRespostasPublicaRouter }
```

#### 1.6 `app.ts` — montagem do router público

```ts
import cors from 'cors'
import express from 'express'
import { env } from './config/env'
import { authRouter } from './modules/auth/auth.module'
import { ciclosAvaliacaoRouter } from './modules/ciclos-avaliacao/ciclos-avaliacao.module'
import { coletaRespostasPublicaRouter } from './modules/coleta-respostas-publica/coleta-respostas-publica.module'
import { colaboradoresRouter } from './modules/colaboradores/colaboradores.module'
import { competenciasRouter } from './modules/competencias/competencias.module'
import { equipesRouter } from './modules/equipes/equipes.module'
import { pesquisasRouter } from './modules/pesquisas/pesquisas.module'
import { tratadorErros } from './middlewares/tratadorErros'

const app = express()

app.use(
  cors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/equipes', equipesRouter)
app.use('/api/colaboradores', colaboradoresRouter)
app.use('/api/pesquisas', pesquisasRouter)
app.use('/api/competencias', competenciasRouter)
app.use('/api/ciclos', ciclosAvaliacaoRouter)

// ROTA PÚBLICA (sem `autenticar`) — colaborador comum responde pesquisas via
// link + CPF, sem conta no Supabase Auth. Autorização por posse de
// token/sessaoToken + CPF, validada manualmente dentro do service. NUNCA
// adicionar `autenticar` a este router (ver
// coleta-respostas-publica.module.ts).
app.use('/api/publico', coletaRespostasPublicaRouter)

// Middleware de erro (4 args) precisa ser o último app.use.
app.use(tratadorErros)

export { app }
```

#### 1.7 Contrato de API — tabela final

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| GET | `/api/publico/envios/:token/status` | nenhum (público, token) | — | `200 { estado: 'aguardando_cpf' }` | `404 LINK_INVALIDO`, `403 BLOQUEADO_TENTATIVAS_CPF`, `409 CICLO_OU_PESQUISA_INATIVOS`, `410 ENVIO_EXPIRADO`, `409 JA_RESPONDIDO` (só 360) |
| POST | `/api/publico/envios/:token/confirmar-cpf` | nenhum (público, token + CPF) | `{ cpf: string }` | `200 { sessaoToken, expiraEm, tipoPesquisa }` | mesmos de status + `422 CPF_NAO_CONFERE`, `403 BLOQUEADO_TENTATIVAS_CPF` (se atingir 5 nesta chamada), `409 JA_RESPONDIDO` (pós-CPF, clima ou 360) |
| GET | `/api/publico/sessoes/:sessaoToken/formulario` | nenhum (público, sessaoToken) | — | `200 FormularioResposta` | `404 SESSAO_INVALIDA`, `410 SESSAO_EXPIRADA`, `409 SESSAO_JA_UTILIZADA` |
| POST | `/api/publico/sessoes/:sessaoToken/respostas` | nenhum (público, sessaoToken) | `{ itens: [{ perguntaId, valor }] }` | `200 { sucesso: true }` | `404 SESSAO_INVALIDA`, `410 SESSAO_EXPIRADA`, `409 SESSAO_JA_UTILIZADA`, `422 CAMPO_INVALIDO`, `422 PERGUNTA_FORA_DA_PESQUISA`, `422 RESPOSTA_INCOMPLETA`, `409 JA_RESPONDIDO` (corrida de duplo-envio, via `uq_respostas_envio_id`) |

Nenhuma rota desta tabela passa por `autenticar`; nenhuma chama
`garantirPapel` (não há `ator` autenticado neste fluxo).

Ao terminar: rodar `npm run build` (tsc) e `npm test` dentro de `backend/` e
confirmar que compilam/passam antes de marcar a etapa concluída. Registrar no
resumo da task que a migration desta seção **não deve ser executada** contra
um banco real sem confirmação explícita do usuário.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Guard rail estrutural do clima**: `resposta-clima.entity.ts` e
   `item-resposta-clima.entity.ts` NÃO devem ter nenhuma coluna/FK
   `colaborador_id`/`sessao_id`/`envio_id` — confira tanto a entidade quanto
   a migration. Nenhuma query em `coleta-respostas-publica.service.ts` deve
   juntar `respostas_clima`/`itens_resposta_clima` com `sessoes_resposta` ou
   `envios_pesquisa`.
2. **Guard rail de identidade no 360**: `enviarRespostas`, branch
   `avaliacao_360`, deve gravar `Resposta.envioId` sem nenhuma tentativa de
   omitir/mascarar a cadeia até `avaliador_id`. Nenhum endpoint desta task
   deve LER `itens_resposta`/`respostas_clima` de volta (os 4 endpoints só
   escrevem ou leem metadados estruturais — pesquisa/páginas/perguntas/
   relacionamentos).
3. **Nenhuma rota desta task chama `autenticar`**: conferir
   `coleta-respostas-publica.module.ts` (sem `router.use(autenticar)`) e
   `app.ts` (o `app.use('/api/publico', ...)` está fora de qualquer bloco que
   monte `autenticar`). Isso é intencional (autorização por
   token/sessaoToken + CPF), não um achado crítico de "rota sem proteção".
4. **Ordem de checagem em `buscarEnvioValidoOuFalhar`**: token existe →
   bloqueado por tentativas → ciclo/pesquisa ativos → envio expirado → (só
   360) já respondido — nessa ordem exata, igual à tabela da spec (seção 4).
   Usada sem alteração tanto por `obterStatusEnvio` quanto por
   `confirmarCpf`.
5. **`cpf_confirmado_em` só na primeira confirmação**: `UPDATE ... WHERE
   cpf_confirmado_em IS NULL`, nunca um `if` em JS que primeiro lê o valor e
   depois decide escrever (haveria uma janela de corrida).
6. **`envios_pesquisa.status`/`concluido_em` no branch clima_geral de
   `enviarRespostas`: NUNCA escritos.** Só o branch `avaliacao_360` escreve
   `status = 'concluido'`/`concluidoEm`. `ciclo_participantes.respondeuEm` é
   escrito só a partir de `sessao.cicloParticipanteId` (nunca de algo dentro
   do payload de resposta).
7. **`resolverOpcoesPessoa` só é chamada quando `pergunta.tipo === 'pessoa'
   && relacionamento` não é nulo** — nunca para `clima_geral`. Confirmar que
   a query lê só `relacionamentos_avaliacao`/`colaboradores` (estrutural),
   nunca `itens_resposta`.
8. **Validação de obrigatoriedade em `enviarRespostas`**: roda sobre TODAS as
   perguntas da pesquisa vinculada à sessão, não só as do payload — uma
   pergunta obrigatória ausente do payload deve gerar `422
   RESPOSTA_INCOMPLETA`, nunca ser silenciosamente ignorada.
   `PERGUNTA_FORA_DA_PESQUISA` deve disparar para qualquer `perguntaId` que
   não pertença à pesquisa da sessão (defesa contra payload forjado).
9. **`uq_respostas_envio_id` mapeado em `tratadorErros.ts` para
   `JA_RESPONDIDO` (409)** — conferir que o nome da constraint na migration
   bate exatamente com a entrada do mapa.
10. **Migration**: `up()`/`down()` na ordem certa de dependência (drop
    índices/tabelas dependentes antes das tabelas referenciadas, na ordem
    inversa da criação). Nomes de tabela/coluna/constraint/índice batendo
    exatamente com as entidades TypeORM.
11. **`SessaoResposta`**: confirmar que nenhuma entidade de
    `respostas`/`respostas-clima` importa `SessaoResposta` (nem o inverso) —
    a ausência de import já é um sinal forte de que a referência cruzada
    proibida não existe.
12. **TTL da sessão**: `criarSessao` usa `env.sessaoRespostaTtlMinutos` (não
    um número mágico hardcoded no service). `buscarSessaoValidaOuFalhar`
    compara `expiraEm` com `Date.now()` corretamente (não inverte a
    comparação).
13. **Nenhuma função de `coleta-respostas-publica.service.ts` importa ou usa
    `garantirPapel`/`ColaboradorAutenticado`** — confirmar que isso é
    deliberado (ver "Guard rails de anonimização" do plano), não sinalizar
    como achado crítico de autorização ausente.
14. **CPF**: `confirmarCpf` usa `normalizarCpf` de `backend/src/common/cpf.ts`
    (reaproveitado, não reimplementado). Nenhuma comparação de CPF usa
    `===` contra um valor não normalizado.
15. **Build/testes**: `npm run build` e `npm test` (dentro de `backend/`) sem
    erros novos introduzidos por esta task.

## Perguntas em aberto (herdadas da spec, não resolvidas por este plano)

1. **Desbloqueio manual de `tentativas_cpf_invalidas >= 5`** — confirmado que
   não existe hoje (ver "Decisões de modelagem" nº 13); fica para uma Fase 2
   explícita, fora de escopo desta task.
2. **Corrida de duplo-submit no clima** (ver "Guard rails de anonimização") —
   aceita como risco estrutural inerente ao anonimato, não corrigida aqui.

## Revisão

Revisão feita comparando literalmente o código implementado
(`backend/src/migrations/1788500000000-CriarColetaRespostasPublica.ts`, as 5
entidades novas, os 2 DTOs, `coleta-respostas-publica.service.ts`,
`.controller.ts`, `.module.ts`, e os 4 arquivos editados) com o plano acima —
o `backend-developer` seguiu o plano literalmente, sem desvios além do já
declarado. Também foram lidas as entidades reaproveitadas
(`EnvioPesquisa`, `CicloParticipante`, `Colaborador`, `RelacionamentoAvaliacao`,
`Pesquisa`, `PaginaPesquisa`, `Pergunta`, `PerguntaCompetencia`, `Competencia`,
`CicloAvaliacao`) e `common/cpf.ts` para conferir nomes de coluna e
comportamento assumido pelo service.

### Crítico

Nenhum achado crítico. Especificamente, confirmado:

- `resposta-clima.entity.ts`/`item-resposta-clima.entity.ts` não têm nenhuma
  coluna/FK `colaborador_id`/`sessao_id`/`envio_id`, na entidade nem na
  migration; nenhum dos dois importa `SessaoResposta`/`EnvioPesquisa`.
  Nenhuma query em `coleta-respostas-publica.service.ts` junta
  `respostas_clima`/`itens_resposta_clima` com `sessoes_resposta` ou
  `envios_pesquisa`.
- O branch `avaliacao_360` de `enviarRespostas`
  (`coleta-respostas-publica.service.ts:511-528`) grava `Resposta.envioId`
  sem qualquer tentativa de mascarar a cadeia até `avaliador_id`; nenhum dos 4
  endpoints lê `itens_resposta`/`respostas_clima`/`respostas` de volta — só
  escrevem ou leem metadados estruturais.
- `envios_pesquisa.status`/`concluido_em` nunca são escritos no branch
  `clima_geral` (linhas 529-553); `ciclo_participantes.respondeuEm` é escrito
  só a partir de `sessao.cicloParticipanteId` (nunca de algo do payload).
- `coleta-respostas-publica.module.ts` é o único `*.module.ts` do projeto sem
  `router.use(autenticar)` (conferido via grep em todos os 14
  `modules/**/*.module.ts` — os outros 10 que importam `autenticar` de fato
  chamam `router.use(autenticar)`; os 3 restantes sem match, além deste, não
  são routers HTTP). `app.ts` monta `/api/publico` com comentário explícito
  de "nunca adicionar autenticar" — a natureza pública é evidente na leitura.
  Isso está corretamente fora do escopo de achado crítico, conforme já
  antecipado pelo plano.
- `resolverOpcoesPessoa` só lê `relacionamentos_avaliacao`/`colaboradores`
  (estrutural), nunca `itens_resposta`, e só roda para `pergunta.tipo ===
  'pessoa' && relacionamento` não nulo (nunca para `clima_geral`).
- `uq_respostas_envio_id` na migration bate exatamente com a entrada nova em
  `tratadorErros.ts` (`MAPA_CONSTRAINT_PARA_CODIGO`).
- `cpf_confirmado_em` é gravado via `UPDATE ... WHERE cpf_confirmado_em IS
  NULL` (`marcarPrimeiraConfirmacaoCpf`), atômico, correto sob concorrência.
- `normalizarCpf` (reaproveitado de `common/cpf.ts`, não reimplementado) é
  usado em toda comparação de CPF; nenhuma comparação usa um valor não
  normalizado.
- **Sobre o desvio declarado em `confirmarCpf`** (branches 360 e clima com
  `throw` explícito logo após `registrarTentativaInvalida`): confirmado que o
  comportamento observável é idêntico ao do plano —
  `registrarTentativaInvalida` sempre lança (`Promise<never>`), então o
  `throw` seguinte é de fato inalcançável; 0 sessões são criadas em qualquer
  dos dois branches quando o CPF não bate. Sem objeção.
- **Sobre o ajuste de tipo em `valorValidoParaTipo`** (`contexto.niveis:
  number | undefined` em vez de `niveis?: number`, idem para
  `opcoesPessoaIds`): também confirmado sem mudança comportamental — os
  call-sites já passavam `undefined` explicitamente nesses casos
  (`configuracao.niveis` quando não numérico, `opcoesPessoaPorPergunta.get(...)`
  quando ausente do Map), então o tipo mais estrito só documenta o que já
  acontecia em runtime.

### Deveria corrigir

1. **`registrarTentativaInvalida` usa `save()` de entidade completa
   carregada anteriormente, em vez de um `UPDATE` atômico do único campo**
   (`coleta-respostas-publica.service.ts:143-155`, especificamente as linhas
   144-145: `envio.tentativasCpfInvalidas += 1` seguido de
   `AppDataSource.getRepository(EnvioPesquisa).save(envio)`). Esse padrão já
   existe no projeto (`envios-pesquisa.service.ts`, `marcarComoEnviado`/
   `registrarLembrete`/`expirarEnvio`), mas sempre em rotas autenticadas de
   baixa frequência (RH clicando um botão, um ator por vez). Aqui é a
   primeira vez que esse padrão roda numa rota **pública, sem autenticação,
   sujeita a chamadas concorrentes** — e, no braço `clima_geral`, contra a
   **mesma linha única de `envios_pesquisa`** compartilhada por todos os
   participantes do ciclo. Sob concorrência real, esse `.save()` reescreve
   TODAS as colunas do objeto `envio` carregado no início da request,
   podendo sobrescrever com valores "congelados" qualquer coluna alterada
   por outra requisição concorrente na janela entre o load e o save — em
   particular `cpf_confirmado_em` (pode reverter para `null` um valor
   setado por `marcarPrimeiraConfirmacaoCpf` de outra requisição concorrente)
   e, em tese, `status`/`concluido_em` (reverter uma conclusão recém-gravada
   para o mesmo `envio_id`, embora a janela seja mais estreita nesse caso). O
   próprio arquivo já usa corretamente um `UPDATE` condicional atômico para
   exatamente este tipo de risco em `marcarPrimeiraConfirmacaoCpf`
   (linhas 131-138) — o mesmo padrão (`UPDATE envios_pesquisa SET
   tentativas_cpf_invalidas = tentativas_cpf_invalidas + 1 WHERE id =
   :envioId`, com o `SELECT` de bloqueio/limite feito a partir do valor
   retornado ou de uma leitura pós-update) deveria ser aplicado aqui.
   Observação: a spec (seção 2.1) já aceita explicitamente o risco de
   incrementos perdidos no contador compartilhado do clima — mas gravar de
   volta colunas não relacionadas (`cpf_confirmado_em`, `status`,
   `concluido_em`) com valores obsoletos é um efeito colateral adicional, não
   coberto por essa aceitação explícita.

2. **Nenhuma checagem de `colaborador.ativo` em `confirmarCpf`**, nem para o
   avaliador do relacionamento (`avaliacao_360`,
   `coleta-respostas-publica.service.ts:272-289`) nem para o colaborador do
   participante (`clima_geral`, linhas 291-309). O middleware `autenticar`
   usado no resto do projeto exige `ativo = true`; este fluxo público não
   replica essa regra — um colaborador desativado/desligado cujo
   `envios_pesquisa`/`ciclo_participantes` ainda esteja pendente continua
   conseguindo confirmar CPF e responder normalmente. Não é um achado de
   anonimização (não expõe identidade de terceiros) nem estritamente de
   controle de acesso por papel (não há papel aqui), mas é uma inconsistência
   de regra de negócio que vale confirmar com o usuário antes de fechar a
   task — pode ser intencional (quem responde não tem conta/login mesmo), mas
   não está declarado como decisão consciente em nenhum lugar do plano/spec.

### Sugestão

1. **`token`/`sessaoToken` não são validados como UUID antes da query**
   (`obterParametroRota` + `findOneBy({ tokenAcesso: token })` /
   `findOneBy({ token: sessaoToken })`, usado nos 4 endpoints). Um valor de
   rota malformado (não-UUID) tende a gerar um erro de formato do driver
   Postgres, que cai no branch genérico de `tratadorErros` como `500
   ERRO_INTERNO` (com `console.error` no servidor) em vez de um `404
   LINK_INVALIDO`/`SESSAO_INVALIDA` mais apropriado. Esse padrão já existe em
   outras rotas do projeto (`obterParametroRota` + `findOneBy` em
   `colaboradores`, `equipes`, etc.), mas nesta task é a primeira vez que ele
   fica exposto a tráfego 100% público e não autenticado, mais sujeito a
   input malformado/automatizado. Considerar validar o formato (regex UUID)
   antes da query, só neste módulo, já que é o mais exposto.
2. **`resolverOpcoesPessoa` não filtra `colaborador.ativo = true`**
   (`coleta-respostas-publica.service.ts:197-215`) — colaboradores
   desligados/inativos podem aparecer como opção de pergunta tipo `pessoa`.
   Consistente com a mesma ausência de checagem de `ativo` do item 2 acima;
   mesma recomendação de confirmar se é intencional.
3. **Comparação de CPF não é "constant-time"** (`avaliador.cpf !==
   cpfDigitos`, `p.colaborador.cpf === cpfDigitos`) — risco teórico de
   side-channel por timing, mas dado o espaço de CPFs válidos e o limite de 5
   tentativas por envio, o risco prático é desprezível. Mencionado só por
   completude, não bloqueia.

**Conclusão**: nenhum achado crítico de anonimização ou de controle de
acesso — a task pode seguir para `test-engineer`. Os 2 itens "Deveria
corrigir" (save não-atômico do contador de tentativas; ausência de checagem
de `ativo`) são recomendados para correção antes ou logo depois da escrita
dos testes, mas não bloqueiam o pipeline nem envolvem exposição de dados de
resposta ou identidade.

## Follow-up — correção pontual dos 2 achados "Deveria corrigir"

Correção aplicada em `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`, sem tocar em mais nada além do exigido pelos dois achados.

1. **`registrarTentativaInvalida` agora usa `UPDATE` atômico.** Assinatura
   mudou de `(envio: EnvioPesquisa)` para `(envioId: string)`. Implementação:
   `AppDataSource.createQueryBuilder().update(EnvioPesquisa).set({
   tentativasCpfInvalidas: () => 'tentativas_cpf_invalidas + 1' }).where('id =
   :envioId', ...).returning('tentativas_cpf_invalidas').execute()` — toca só
   essa coluna (mesmo padrão de `marcarPrimeiraConfirmacaoCpf`) e a decisão
   `BLOQUEADO_TENTATIVAS_CPF` vs `CPF_NAO_CONFERE` usa
   `resultado.raw[0].tentativas_cpf_invalidas` (valor pós-incremento vindo do
   próprio `UPDATE`/`RETURNING`), nunca uma releitura da entidade nem o valor
   pré-incremento carregado antes. Os 2 call-sites em `confirmarCpf` foram
   ajustados de `registrarTentativaInvalida(envio)` para
   `registrarTentativaInvalida(envio.id)`.
2. **`confirmarCpf` agora checa `colaborador.ativo` nos dois braços.**
   - `avaliacao_360`: condição do CPF virou `if (!avaliador ||
     avaliador.cpf !== cpfDigitos || !avaliador.ativo)` — inativo cai no
     mesmo branch/mesmo erro de "CPF não confere".
   - `clima_geral`: o predicado de busca virou `participantes.find((p) =>
     p.colaborador.cpf === cpfDigitos && p.colaborador.ativo)` — participante
     com CPF batendo porém inativo cai no mesmo `!participante` de "CPF não
     confere".
   - **Decisão documentada em comentário no código**: colaborador
     encontrado-mas-inativo é tratado EXATAMENTE como CPF não confere (mesma
     resposta HTTP, mesmo código `422 CPF_NAO_CONFERE`), para não permitir
     enumeração de CPFs válidos via diferença de resposta. Consequência
     consciente e assumida: essa tentativa CONTA para o limite de 5
     (`LIMITE_TENTATIVAS_CPF`), como qualquer outra tentativa malsucedida —
     não foi aberta exceção para não incrementar, porque isso também
     vazaria sinal (ausência de incremento delataria "CPF existe mas está
     inativo").

**Nenhuma migration nova, nenhuma mudança de schema.** Nenhuma query nova
tocou `respostas_clima`/`itens_resposta_clima` nem juntou-as com
`sessoes_resposta`/`envios_pesquisa`/`ciclo_participantes`. Rotas continuam
sem `autenticar`/`garantirPapel`.

**Build/testes após a correção**: `npm run build` — mesmo único erro
pré-existente e não relacionado em `src/test/fakeRepository.ts:30`, nenhum
erro novo. `npm test` (Vitest): 141/141 passando, nenhuma regressão. Nenhum
teste novo escrito (fase `test-engineer` explicitamente pulada nesta rodada,
por decisão do usuário).

## Re-revisão — follow-up dos 2 achados "Deveria corrigir"

Escopo desta rodada: só
`coleta-respostas-publica.service.ts`, focando em `registrarTentativaInvalida`
e nos dois braços de `confirmarCpf` alterados pelo follow-up acima. Nada do
restante do arquivo (`buscarEnvioValidoOuFalhar`, `buscarFormulario`,
`enviarRespostas`, `resolverOpcoesPessoa`, etc.) foi re-revisado — permanece
válido o veredito da rodada anterior.

### Crítico

Nenhum achado crítico nesta rodada.

### Verificações feitas (achado 1 — `registrarTentativaInvalida`)

- O `UPDATE` via `createQueryBuilder().update(EnvioPesquisa).set({
  tentativasCpfInvalidas: () => 'tentativas_cpf_invalidas + 1' })` toca
  **somente** essa coluna — confirmado que não há mais nenhum `.save()` de
  entidade completa neste caminho; `cpf_confirmado_em`/`status`/`concluido_em`
  não podem mais ser sobrescritos por esta função. Resolve o achado 1 da
  rodada anterior por completo.
- `.returning('tentativas_cpf_invalidas')` é o padrão correto de TypeORM para
  Postgres em `UpdateQueryBuilder` — `execute()` retorna `UpdateResult.raw`
  como array de linhas com exatamente o nome de coluna passado ao
  `.returning()` (string SQL literal, não a propriedade da entidade), então
  `resultado.raw?.[0]?.tentativas_cpf_invalidas` lê a chave certa
  (snake_case, batendo com o nome de coluna real — não há descompasso
  camelCase/snake_case aqui porque a string passada já é o nome de coluna).
  Consistente com `marcarPrimeiraConfirmacaoCpf`, que já usa nomes de coluna
  crus em `.where('cpf_confirmado_em IS NULL')` no mesmo arquivo.
- Limite aplicado sobre o valor **pós-incremento** (`tentativasAtualizadas =
  Number(resultado.raw?.[0]?.tentativas_cpf_invalidas ?? ...)`), com `>=
  LIMITE_TENTATIVAS_CPF` (5). Rastreei a sequência: tentativa nº 4 inválida
  incrementa de 3→4, `4 >= 5` falso → `422 CPF_NAO_CONFERE` (não bloqueia,
  correto). Tentativa nº 5 inválida incrementa de 4→5, `5 >= 5` verdadeiro →
  `403 BLOQUEADO_TENTATIVAS_CPF` já nesta mesma resposta (em vez de
  `CPF_NAO_CONFERE`), exatamente como documentado na decisão de modelagem nº
  13/comentário do código e no contrato da spec (seção 6.2). Uma 6ª tentativa
  sequer chega a esta função — é barrada antes, em `buscarEnvioValidoOuFalhar`
  (`envio.tentativasCpfInvalidas >= LIMITE_TENTATIVAS_CPF`). Sem off-by-one em
  nenhuma das duas pontas.
- `registrarTentativaInvalida` continua `Promise<never>` de fato: os dois
  caminhos (`if` e o `throw` final) sempre lançam; não há `return` implícito.
  Os dois call-sites em `confirmarCpf` (`avaliacao_360` e `clima_geral`)
  passam `envio.id` (não mais a entidade `envio` inteira) e o `throw`
  logo após o `await registrarTentativaInvalida(envio.id)` é inalcançável em
  ambos — nenhuma sessão (`criarSessao`) é criada em nenhum dos dois branches
  quando o CPF não bate, confirmado lendo o fluxo completo de cima a baixo.
- Fallback defensivo `?? LIMITE_TENTATIVAS_CPF` quando `raw` viesse vazio
  (cenário que não deveria ocorrer, já que `envio.id` foi validado antes) é
  fail-safe (trata como bloqueado), não fail-open — não é um risco de
  segurança, só uma nota de robustez.

### Verificações feitas (achado 2 — `colaborador.ativo`)

- Braço `avaliacao_360`: `avaliador` é buscado diretamente no repositório de
  `Colaborador` (`findOneBy({ id: relacionamento.avaliadorId })`), então
  `avaliador.ativo` está sempre presente quando `avaliador` não é `null` —
  sem risco de relação não carregada.
- Braço `clima_geral`: confirmado em
  `ciclo-participante.entity.ts` que a propriedade se chama `colaborador`
  (`@ManyToOne(() => Colaborador) colaborador!: Colaborador`) e que o `find()`
  em `confirmarCpf` usa `relations: { colaborador: true }` — a relação É
  carregada antes do `.find()` no array rodar `p.colaborador.ativo`, então não
  há o `TypeError` de acesso a propriedade de relação não carregada que era o
  risco mais provável apontado no pedido de re-revisão. Confirmado também que
  `Colaborador.ativo` existe como `boolean` na entidade.
- Nos dois braços, colaborador "encontrado mas inativo" cai exatamente no
  mesmo branch/mesmo código (`422 CPF_NAO_CONFERE`) que "CPF não confere" —
  resposta HTTP idêntica (status, código, mensagem), sem diferença observável
  que permita enumerar CPFs válidos-porém-inativos.
- A decisão de contar (ou não) essa tentativa para o limite de 5 está
  documentada em comentário no próprio código, nos dois branches
  (`coleta-respostas-publica.service.ts`, comentários acima do `if
  (!avaliador || ...)` e acima do `.find(...)`): a tentativa CONTA para o
  limite, deliberadamente, para não vazar sinal via ausência de incremento.

### Regressão de anonimização (checagem rápida)

- Nenhuma query nova ou alterada nesta rodada toca `respostas_clima`/
  `itens_resposta_clima` — as únicas funções alteradas
  (`registrarTentativaInvalida`, `confirmarCpf`) operam só sobre
  `EnvioPesquisa`/`RelacionamentoAvaliacao`/`Colaborador`/`CicloParticipante`.
  `enviarRespostas` (onde `respostas_clima`/`itens_resposta_clima` são
  gravadas) não foi tocado pelo follow-up — confirmado lendo o arquivo
  completo, não só o diff descrito.
- Braço `clima_geral` de `confirmarCpf` continua sem escrever
  `envios_pesquisa.status`/`concluido_em` — só `marcarPrimeiraConfirmacaoCpf`
  (coluna `cpf_confirmado_em`) e `registrarTentativaInvalida` (coluna
  `tentativas_cpf_invalidas`, agora ainda mais isolada que antes).
- Braço `avaliacao_360` continua sem qualquer tentativa de ocultar
  `avaliador_id`/`relacionamento_id` — nenhuma mudança nesta rodada afeta essa
  cadeia (a gravação de `Resposta`/`ItemResposta` está em `enviarRespostas`,
  não tocado).

### Controle de acesso / escopo

- `coleta-respostas-publica.module.ts` continua sem `router.use(autenticar)`
  e sem `garantirPapel` em qualquer lugar do service — confirmado que o
  follow-up não introduziu nenhuma checagem de papel nem quebrou a natureza
  pública das 4 rotas.
- Nenhuma migration nova, nenhuma mudança de schema — confirmado por
  listagem de `backend/src/migrations/`: o arquivo mais recente continua
  sendo `1788500000000-CriarColetaRespostasPublica.ts`, sem entrada posterior.

### Deveria corrigir

Nenhum item novo nesta rodada — os 2 achados anteriores foram corrigidos sem
introduzir efeito colateral observável.

### Sugestão

Sem itens novos além dos 3 já registrados na rodada anterior (validação de
formato UUID antes da query; `resolverOpcoesPessoa` sem filtro de `ativo`;
comparação de CPF não constant-time) — nenhum deles foi tocado por este
follow-up, permanecem como estavam.

**Conclusão desta re-revisão**: sem achados críticos. Os 2 itens "Deveria
corrigir" da rodada anterior foram corrigidos corretamente, sem regressão de
anonimização, controle de acesso ou consistência de schema. **Task liberada
para `test-engineer`.**

## Ajuste pontual adicional (pedido direto do usuário, sem planejamento/code review)

4 correções independentes, implementadas pelo `backend-developer` sem passar
pelo pipeline completo (pedido explícito do usuário). Sem mudança de schema —
nenhuma migration nova.

1. **Ação manual "desbloquear tentativas" em `envios-pesquisa`.** Resolve a
   decisão de modelagem nº 13 (deliberadamente adiada) e a "Sugestão" da
   rodada de revisão anterior — hoje era impossível recuperar um envio
   bloqueado (`tentativas_cpf_invalidas >= 5`) sem `UPDATE` manual no banco,
   especialmente grave no link único de `clima_geral` (bloqueia a pesquisa
   inteira do ciclo).
   - `envios-pesquisa.service.ts`: nova função `desbloquearTentativas(ator,
     cicloId, envioId)` — `garantirPapel(admin/gestor_rh)` → `buscarCicloOuFalhar`
     → `buscarEnvioDoCicloOuFalhar` → exige `tentativasCpfInvalidas >=
     LIMITE_TENTATIVAS_CPF_INVALIDAS` (senão `409 TRANSICAO_ENVIO_INVALIDA`,
     mesmo estilo de `marcarComoEnviado`/`registrarLembrete`) → zera o
     contador.
   - `EnvioComumResposta`/`baseQuery()`/`mapearLinha` ganharam
     `tentativasCpfInvalidas: number` e `bloqueadoPorTentativas: boolean`
     (`>= LIMITE_TENTATIVAS_CPF_INVALIDAS`), expostos tanto em
     `listarPorCiclo` (`avaliacao_360` e a campanha única de `clima_geral`)
     quanto nas 4 ações.
   - Novo `backend/src/common/limites.ts` com
     `LIMITE_TENTATIVAS_CPF_INVALIDAS = 5`, para não duplicar o número mágico
     entre `envios-pesquisa.service.ts` e
     `coleta-respostas-publica.service.ts` (que passou a importar de lá em
     vez de manter a constante local).
   - `envios-pesquisa.controller.ts`: `desbloquearTentativasEnvio`.
     `envios-pesquisa.module.ts`: `PATCH /:id/desbloquear-tentativas`
     (autenticado, mesmo `router.use(autenticar)` já montado).
2. **Validação de formato UUID antes de consultar o banco**, em
   `coleta-respostas-publica.service.ts` — novo `backend/src/common/uuid.ts`
   (`ehUuidValido`), chamado no início de `buscarEnvioValidoOuFalhar`
   (`token`) e `buscarSessaoValidaOuFalhar` (`sessaoToken`), lançando os
   MESMOS `404 LINK_INVALIDO`/`404 SESSAO_INVALIDA` já usados para "não
   encontrado" — token malformado não chega mais ao driver do Postgres nem
   vira `500`.
3. **`resolverOpcoesPessoa` agora filtra `c.ativo = true`** — consistente com
   a checagem de `ativo` já aplicada em `confirmarCpf`. Colaborador desativado
   não aparece mais como opção da pergunta tipo `pessoa`.
4. **Comparação de CPF constant-time.** Novo helper
   `compararCpfConstantTime(cpfArmazenado, cpfInformado)` em
   `backend/src/common/cpf.ts` (usa `crypto.timingSafeEqual`, trata tamanhos
   diferentes retornando `false` em vez de lançar). Substituídas as duas
   comparações `===`/`!==` de `coleta-respostas-publica.service.ts`
   (`confirmarCpf`, branches `avaliacao_360` e `clima_geral`).

**Guard rails de anonimização**: nenhuma das 4 correções toca
`itens_resposta`/`respostas_pares_agregadas`/junções avaliador↔pares —
`resolverOpcoesPessoa` continua lendo só `relacionamentos_avaliacao`
(estrutural), e a nova ação de desbloqueio só zera um contador de controle de
acesso, sem ler/expor nenhum dado de resposta.

**Build/testes**: `npm run build` sem erros novos (o único erro de `tsc`
remanescente, `src/test/fakeRepository.ts:30`, é pré-existente e não
relacionado — arquivo não tocado). `npm test`: 141/141 testes existentes
passando, nenhuma regressão. Nenhum teste novo escrito (fora do escopo deste
ajuste pontual, conforme pedido do usuário).

**Migrations pendentes**: nenhuma nova — este ajuste não altera schema. A
migration `1788500000000-CriarColetaRespostasPublica.ts` continua sendo a
única pendente de execução (aguardando confirmação explícita do usuário).
