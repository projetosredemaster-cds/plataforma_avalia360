## Plano — Backend

Contexto obrigatório já lido: `.claude/tasks/analise-envios/spec.md` (fechada — todas as
decisões abaixo já foram tomadas lá; este plano só as traduz em passos de arquivo).
Nenhuma decisão da spec é reaberta aqui.

Referência de padrão de arquivo já confirmada no código real:
`backend/src/modules/analise/analise.service.ts` + `analise.controller.ts` +
`analise-comum.ts` + `analise.module.ts` (ver também `analise-avaliacoes.service.ts` para
o mesmo padrão de service dedicado por tela).

**Nota de convenção (desvio deliberado da literalidade da spec/pedido):** a spec (seção 4)
e o pedido original mencionam um arquivo `analise-envios.controller.ts` separado. Isso não
corresponde ao padrão real já em uso no módulo: hoje existe **um único**
`analise.controller.ts` compartilhado por todas as cinco telas (`buscarVisaoGeralAnalise`,
`buscarAvaliacoesAnalise`, `buscarRankingAnalise`, `buscarNuvemPalavrasAnalise`,
`buscarResultadosPerguntaAnalise` vivem todas nesse único arquivo, cada uma delegando para
o `*.service.ts` da sua tela) — não existe `analise-avaliacoes.controller.ts`,
`analise-ranking.controller.ts` etc. Para não introduzir uma inconsistência estrutural
nova dentro do mesmo módulo (o que o `backend-codereviewer` provavelmente marcaria como
achado "Deveria corrigir"), o passo 3 abaixo instrui adicionar a função de controller
**dentro do `analise.controller.ts` já existente**, não em um arquivo novo. O arquivo de
**service** dedicado (`analise-envios.service.ts`) segue exatamente o padrão pedido — cada
tela tem seu próprio `*.service.ts`.

---

1. backend-developer — CONCLUÍDO

   **Resumo da implementação:**
   - `backend/src/modules/analise/analise-comum.ts`: adicionada a interface
     `ProgressoCicloLote` e a função `calcularProgressoEmLotePorCiclo(idsAval360,
     idsClima)`, replicando exatamente o bloco inline de
     `ciclos-avaliacao.service.ts::listar()` (mesmas duas queries agrupadas por
     `ciclo_id` para avaliação 360, mesma query única para clima, mesmo
     `calcularPercentual` duplicado localmente como `calcularPercentualLote` —
     `ciclos-avaliacao.service.ts` não foi tocado). Guard rail de anonimização
     (comentário "SÓ CONTAGEM...") replicado acima de cada query nova.
   - Novo `backend/src/modules/analise/analise-envios.service.ts`: função
     `buscarEnviosAnalise(ator, dto)` seguindo exatamente a mesma sequência de
     `buscarVisaoGeral` (garantirPapel → validarDataQuery → checagem
     ate<de → validação opcional de cicloId → buscarUniversoCiclos →
     classificarPorTipo → calcularProgressoEmLotePorCiclo → find de
     `CicloAvaliacao` com `select` explícito e `order: { dataInicio: 'DESC',
     criadoEm: 'DESC' }` → composição em memória de `LinhaEnvioAnalise`, com
     `totalPendente` derivado em memória e `tipoPesquisa: null` + zeros para
     ciclos sem pesquisa vinculada).
   - `backend/src/modules/analise/analise.controller.ts`: adicionada a função
     `buscarEnviosAnalise` dentro do arquivo já existente (sem criar
     `analise-envios.controller.ts` separado, conforme nota de convenção do
     plano).
   - `backend/src/modules/analise/analise.module.ts`: registrada a rota
     `router.get('/envios', asyncHandler(buscarEnviosAnalise))` dentro do
     bloco já protegido por `router.use(autenticar)`.
   - `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`: não
     tocado, conforme decisão da spec.
   - Nenhuma migration necessária — feature é só leitura de tabelas já
     existentes, sem mudança de schema.
   - `npm run build` executado: nenhum erro novo introduzido; o único erro
     reportado (`src/test/fakeRepository.ts(46,12)`) é pré-existente na branch
     `main` antes desta mudança (confirmado via `git stash`), não relacionado a
     esta implementação.

   ### 1.1 `backend/src/modules/analise/analise-comum.ts` — nova função `calcularProgressoEmLotePorCiclo`

   - Adicionar ao final do arquivo (após `calcularMetricasComplementares`) a interface e a
     função com a assinatura exata da spec, seção 3.2:
     ```ts
     export interface ProgressoCicloLote {
       total: number
       concluidos: number
       percentual: number
     }

     export async function calcularProgressoEmLotePorCiclo(
       idsAval360: string[],
       idsClima: string[],
     ): Promise<Map<string, ProgressoCicloLote>>
     ```
   - Corpo: replicar **exatamente** o SQL/agregação hoje inline em
     `ciclos-avaliacao.service.ts::listar()` (linhas ~426–481, já lidas — ver bloco
     `if (idsAval360.length > 0) { ... }` / `if (idsClima.length > 0) { ... }`), adaptado
     para receber os ids já classificados como parâmetro em vez de calculá-los
     internamente (essa classificação já é responsabilidade de `classificarPorTipo`,
     chamada por quem consome esta função):
     - **avaliacao_360**: duas queries agrupadas por `r.ciclo_id` sobre
       `RelacionamentoAvaliacao` — (a) `COUNT(*)` como total, `groupBy('r.ciclo_id')`; (b)
       mesmo `innerJoin(EnvioPesquisa, ...).innerJoin(Resposta, ...)` do bloco original,
       `COUNT(*)` como concluídos, `groupBy('r.ciclo_id')`. Combinar os dois resultados em
       um `Map` intermediário por `cicloId` antes de calcular o percentual.
     - **clima_geral**: uma única query agrupada por `cp.ciclo_id` sobre
       `CicloParticipante` — `COUNT(*)` como total, `COUNT(cp.respondeu_em)` como
       concluídos (mesmo truque de `COUNT` sobre coluna nullable já usado no bloco
       original — não precisa de `WHERE respondeu_em IS NOT NULL` porque `COUNT` de coluna
       já ignora `NULL`).
     - Percentual: **não** importar `calcularPercentual` de `ciclos-avaliacao.service.ts`
       (é uma função privada, não exportada — mesma restrição já documentada no comentário
       de `validarDataQuery` em `analise-comum.ts`). Duplicar localmente como função de 1
       linha dentro deste mesmo arquivo (`total === 0 ? 0 : Math.round((concluidos / total)
       * 100)`), com um comentário apontando a duplicação deliberada, mesmo padrão já usado
       por `validarDataQuery`.
     - Montar e devolver um único `Map<string, ProgressoCicloLote>` combinando os
       resultados de avaliacao_360 e clima_geral (chaves não se sobrepõem, já que
       `idsAval360`/`idsClima` são disjuntos por construção de `classificarPorTipo`). Ciclos
       cujo id não aparecer no map (sem linha em `relacionamentos_avaliacao`/
       `ciclo_participantes` ainda, ex.: ciclo em rascunho) ficam simplesmente ausentes do
       Map — quem consome decide o fallback (`{ total: 0, concluidos: 0, percentual: 0 }`).
     - Se `idsAval360.length === 0 && idsClima.length === 0`, retornar `new Map()` sem
       disparar nenhuma query (mesmo guard de "early return" já usado por
       `contarTotal360`/`contarTotalParticipantesClima`/etc. neste arquivo).
     - **Guard rail obrigatório, com o MESMO comentário já usado no bloco original**: nunca
       selecionar/projetar `avaliador_id`, `avaliado_id`, `colaborador_id` nem
       `tipo_relacionamento` em nenhuma das queries desta função — só `COUNT`/`GROUP BY`
       por `ciclo_id`. Reproduzir o comentário existente ("SÓ CONTAGEM, nunca seleciona
       avaliador_id/avaliado_id/tipo_relacionamento — guard rail de anonimização, ver skill
       backend-anonimizacao-respostas") acima de cada bloco de query nova, como já é o
       padrão em toda `analise-comum.ts`.

   ### 1.2 Novo arquivo `backend/src/modules/analise/analise-envios.service.ts`

   - Imports: `AppDataSource`, `In` de `typeorm`, `garantirPapel`, `ErroHttp`,
     `ehUuidValido`, `ColaboradorAutenticado`, `buscarCicloOuFalhar` (de
     `../ciclos-avaliacao/ciclos-avaliacao.service`, mesmo import já usado por
     `analise.service.ts`), `CicloAvaliacao` (de
     `../ciclos-avaliacao/ciclo-avaliacao.entity`), e de `./analise-comum`:
     `PAPEIS_COM_ACESSO`, `buscarUniversoCiclos`, `classificarPorTipo`,
     `calcularProgressoEmLotePorCiclo`, `validarDataQuery`, mais o tipo
     `ProgressoCicloLote`.
   - Tipos exportados, exatamente como na spec seção 4:
     ```ts
     export interface LinhaEnvioAnalise {
       cicloId: string
       nome: string
       tipoPesquisa: 'avaliacao_360' | 'clima_geral' | null
       status: 'rascunho' | 'ativo' | 'encerrado'
       dataInicio: string
       dataFim: string
       totalEnvios: number
       totalPendente: number
       totalRespondido: number
       percentualRespondido: number
     }

     export interface EnviosAnalise {
       periodo: { de: string; ate: string }
       cicloId: string | null
       ciclos: LinhaEnvioAnalise[]
     }

     export interface BuscarEnviosAnaliseDto {
       de: unknown
       ate: unknown
       cicloId?: unknown
     }
     ```
   - `export async function buscarEnviosAnalise(ator: ColaboradorAutenticado, dto:
     BuscarEnviosAnaliseDto): Promise<EnviosAnalise>`, seguindo **exatamente** a mesma
     sequência de validação de `buscarVisaoGeral` em `analise.service.ts`:
     1. `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` — primeira linha, sem exceção.
     2. `de = validarDataQuery(dto.de, 'de')`, `ate = validarDataQuery(dto.ate, 'ate')`.
     3. `if (ate < de) throw new ErroHttp(422, 'PERIODO_INVALIDO', 'Campo "ate" deve ser
        maior ou igual a "de".')`.
     4. Validação de `cicloId` opcional: mesmo bloco de `buscarVisaoGeral` (trim, checa
        `ehUuidValido`, `422 CAMPO_INVALIDO` se inválido, `await buscarCicloOuFalhar(...)`
        para garantir 404 se o ciclo não existir).
     5. `periodo = { de, ate }`; `idsUniverso = await buscarUniversoCiclos(periodo,
        cicloId ?? undefined)`.
     6. Se `idsUniverso.length === 0`, retornar `{ periodo, cicloId, ciclos: [] }`
        diretamente (mesmo padrão de early-return de `payloadZerado` em
        `analise.service.ts`, adaptado ao shape desta tela — não precisa de função
        auxiliar separada, é um único objeto literal).
     7. `const { idsAval360, idsClima } = await classificarPorTipo(idsUniverso)`.
     8. `const progressoPorCiclo = await calcularProgressoEmLotePorCiclo(idsAval360,
        idsClima)`.
     9. Buscar os dados descritivos dos ciclos do universo, **com `select` explícito**
        (nunca `find()` sem `select` — evita trazer `minimoRespostasPares`/
        `anonimizarRespostasPares`/`criadoPor`/`tiposRelacionamentoGerados`, que esta tela
        não usa e não deve expor):
        ```ts
        AppDataSource.getRepository(CicloAvaliacao).find({
          where: { id: In(idsUniverso) },
          select: { id: true, nome: true, dataInicio: true, dataFim: true, status: true, criadoEm: true },
          order: { dataInicio: 'DESC', criadoEm: 'DESC' },
        })
        ```
        Esse `order` no próprio `find()` é o que implementa a ordenação da seção 5 da spec
        (`dataInicio DESC`, desempate `criadoEm DESC`) via SQL `ORDER BY` — **não** ordenar
        em memória depois.
     10. Montar um `Set<string>` para `idsAval360` e outro para `idsClima` (conversão de
         array para Set só para o teste de pertencimento O(1) usado no passo seguinte — não
         reabre a classificação, só reaproveita o resultado já calculado no passo 7).
     11. Mapear cada ciclo retornado no passo 9 para `LinhaEnvioAnalise`:
         - `cicloId: ciclo.id`, `nome: ciclo.nome`, `status: ciclo.status`,
           `dataInicio: ciclo.dataInicio`, `dataFim: ciclo.dataFim`.
         - `tipoPesquisa`: `'avaliacao_360'` se `ciclo.id` está no Set de `idsAval360`,
           `'clima_geral'` se está no Set de `idsClima`, senão `null` (ciclo sem pesquisa
           vinculada — seção 7 da spec).
         - `const progresso = progressoPorCiclo.get(ciclo.id) ?? { total: 0, concluidos: 0,
           percentual: 0 }` (fallback também cobre ciclos com `tipoPesquisa: null`, que
           nunca entram em `idsAval360`/`idsClima` logo nunca aparecem no Map retornado por
           `calcularProgressoEmLotePorCiclo` — resultado: todos os quatro campos numéricos
           zerados, exatamente como pede a seção 7).
         - `totalEnvios: progresso.total`, `totalRespondido: progresso.concluidos`,
           `totalPendente: progresso.total - progresso.concluidos` (subtração em memória,
           não uma quarta query — seção 4 da spec), `percentualRespondido:
           progresso.percentual`.
     12. Retornar `{ periodo, cicloId, ciclos: <lista mapeada> }`.
   - **Guard rail obrigatório**: nenhuma query nova neste arquivo pode selecionar
     `avaliador_id`/`avaliado_id`/`colaborador_id`/`tipo_relacionamento` — a única leitura
     de dado além de `calcularProgressoEmLotePorCiclo` é o `find()` de `CicloAvaliacao` do
     passo 9, que já usa `select` explícito e não toca nenhuma dessas colunas.
   - Comentário de topo do arquivo (mesmo padrão de todo outro `*.service.ts` de
     `analise/`): explicar que esta é a única função exportada, sempre restrita a
     `admin`/`gestor_rh`, e que a tela é agregada por ciclo inteiro (nunca por
     avaliado/tipo de relacionamento), por isso não há gate de
     `minimo_respostas_pares` — referenciar a seção 6 da spec e a skill
     `backend-anonimizacao-respostas` no comentário, mesmo raciocínio já registrado nos
     comentários de guard rail de `calcularProgressoCiclo`/`contarTotal360` em
     `analise-comum.ts`.

   ### 1.3 `backend/src/modules/analise/analise.controller.ts` — nova função no arquivo já existente

   - **Não criar um arquivo `analise-envios.controller.ts` separado** (ver nota de
     convenção no topo deste plano).
   - Adicionar `import * as analiseEnviosService from './analise-envios.service'` ao topo,
     ao lado dos outros quatro imports de `*Service`.
   - Adicionar a função, no mesmo formato das demais:
     ```ts
     export async function buscarEnviosAnalise(req: Request, res: Response): Promise<void> {
       const resposta = await analiseEnviosService.buscarEnviosAnalise(req.colaboradorAutenticado!, {
         de: req.query.de,
         ate: req.query.ate,
         cicloId: req.query.cicloId,
       })
       res.status(200).json(resposta)
     }
     ```

   ### 1.4 `backend/src/modules/analise/analise.module.ts` — registrar a rota

   - Adicionar `buscarEnviosAnalise` à lista de imports de `./analise.controller`.
   - Adicionar `router.get('/envios', asyncHandler(buscarEnviosAnalise))` dentro do bloco
     já protegido por `router.use(autenticar)` (linha 14 do arquivo atual) — nunca antes
     dela, nunca como rota separada fora deste módulo. Resultado: `GET /api/analise/envios`
     exige JWT válido + `garantirPapel(['admin','gestor_rh'])` dentro do service, mesmo
     padrão das outras cinco rotas do módulo.

   ### 1.5 Explicitamente fora do escopo desta implementação

   - **Não tocar** `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` — nem
     `listar()`, nem `calcularProgressoCiclo`, nem `calcularPercentual`. Nenhuma
     extração/exportação de função desse arquivo é necessária ou permitida (decisão de
     arquitetura da spec, seção 3.2 — a duplicação do bloco de progresso em lote dentro de
     `analise-comum.ts` é deliberada).
   - Não criar nenhuma migration nem alterar nenhuma entidade — esta feature só lê dados já
     existentes (`ciclos_avaliacao`, `relacionamentos_avaliacao`, `envios_pesquisa`,
     `respostas`, `ciclo_participantes`, `pesquisas` via `classificarPorTipo`), nenhum
     schema novo.
   - Não criar `dto/` (não é um módulo CRUD — é uma extensão de leitura do módulo `analise`
     já existente, mesmo padrão das outras quatro telas, que também não têm pasta `dto/`).
   - Não implementar nenhuma ação (copiar link, marcar enviado, expirar, lembrete) — tela
     é somente leitura (decisão 2 da spec).
   - Não adicionar paginação de servidor nem filtro além de `de`/`ate`/`cicloId`.

2. backend-codereviewer
   - Conferir que `calcularProgressoEmLotePorCiclo` produz os MESMOS números que
     `calcularProgressoCiclo`/o bloco inline de `listar()` produziriam para o mesmo ciclo
     — mesma fórmula de `percentual` (`Math.round`, não `Math.floor`/truncamento), mesmo
     critério de "concluído" (join até `respostas`/`respondeu_em IS NOT NULL`). Qualquer
     divergência de número é bug, não escolha de implementação (spec, seção 10).
   - Conferir que nenhuma query nova (em `analise-comum.ts` ou
     `analise-envios.service.ts`) seleciona `avaliador_id`/`avaliado_id`/`colaborador_id`/
     `tipo_relacionamento` — grep literal por esses quatro nomes nos dois arquivos deve
     retornar zero ocorrências fora de comentários.
   - Conferir que o `find()` de `CicloAvaliacao` em `analise-envios.service.ts` usa
     `select` explícito (não trazendo `minimoRespostasPares`/`anonimizarRespostasPares`/
     `criadoPor`/`tiposRelacionamentoGerados`).
   - Conferir que `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é a primeira linha de
     `buscarEnviosAnalise` (service), sem nenhum caminho de retorno antecipado antes dela.
   - Conferir que a rota `/envios` está registrada dentro do bloco `router.use(autenticar)`
     em `analise.module.ts`, nunca antes/fora dele, e que `analise.controller.ts` não foi
     duplicado em um arquivo `analise-envios.controller.ts` à parte (ver nota de convenção
     no topo deste plano — se o `backend-developer` criou o arquivo separado mesmo assim,
     isso é achado "Deveria corrigir": consolidar no `analise.controller.ts` único).
   - Conferir que ciclos sem pesquisa vinculada aparecem na lista com `tipoPesquisa: null`
     e as quatro contagens zeradas (não excluídos do array) — seção 7 da spec.
   - Conferir que `totalPendente` é derivado em memória (`total - concluidos`), não uma
     query adicional.
   - Conferir que a ordenação (`dataInicio DESC`, `criadoEm DESC`) está no `order` do
     `find()`/`ORDER BY` SQL, não em `.sort()` pós-query em memória.
   - Conferir zero alteração em qualquer arquivo dentro de
     `backend/src/modules/ciclos-avaliacao/`.

## Revisão

Arquivos revisados: `backend/src/modules/analise/analise-comum.ts` (nova interface
`ProgressoCicloLote` + função `calcularProgressoEmLotePorCiclo`),
`backend/src/modules/analise/analise-envios.service.ts` (novo),
`backend/src/modules/analise/analise.controller.ts` (nova `buscarEnviosAnalise`),
`backend/src/modules/analise/analise.module.ts` (nova rota `GET /envios`). Confirmado
por leitura de diretório que `backend/src/modules/ciclos-avaliacao/` não foi tocado e
que nenhum arquivo `analise-envios.controller.ts` separado foi criado.

### Verificações realizadas (evidência, não achados)

- **Anonimização**: confirmado por `grep` literal em `analise-envios.service.ts` e nas
  linhas novas de `analise-comum.ts` (a função `calcularProgressoEmLotePorCiclo`, linhas
  ~503–577) que nenhuma query nova seleciona `avaliador_id`/`avaliado_id`/
  `colaborador_id`/`tipo_relacionamento` — só `COUNT(*)`/`COUNT(cp.respondeu_em)`
  agrupados por `ciclo_id`. As únicas ocorrências desses termos no arquivo pertencem a
  funções pré-existentes (`calcularGateParesSubordinado`,
  `buscarTextosParesSubordinado`), não tocadas por esta task. O `find()` de
  `CicloAvaliacao` usa `select` explícito (`id, nome, dataInicio, dataFim, status,
  criadoEm`), sem trazer `minimoRespostasPares`/`anonimizarRespostasPares`/`criadoPor`/
  `tiposRelacionamentoGerados`. A justificativa da spec (seção 6) para a ausência do gate
  de `minimo_respostas_pares` está correta: a menor unidade exposta é o ciclo inteiro,
  nunca um avaliado individual.
- **Controle de acesso**: `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é de fato a
  primeira linha de `buscarEnviosAnalise` (service), sem nenhum caminho de retorno
  antecipado antes dela. A rota `GET /envios` está registrada em `analise.module.ts`
  depois de `router.use(autenticar)` (linha 15), junto das outras cinco rotas do módulo
  — nunca pública.
- **Paridade numérica**: comparei linha a linha `calcularProgressoEmLotePorCiclo` contra
  o bloco inline de `ciclos-avaliacao.service.ts::listar()` (linhas ~421–481) e contra
  `calcularProgressoCiclo` (linhas 143–176). Fórmula de percentual idêntica
  (`Math.round((concluidos/total)*100)`, 0 se total=0). Critério de "concluído" idêntico:
  para avaliação 360, `innerJoin(EnvioPesquisa, 'envio.relacionamento_id = r.id')` +
  `innerJoin(Resposta, 'resposta.envio_id = envio.id')`, mesma condição de junção,
  mesmo `groupBy('r.ciclo_id')`; para clima, `COUNT(cp.respondeu_em)` sobre
  `CicloParticipante` agrupado por `cp.ciclo_id`, mesmo truque de `COUNT` de coluna
  nullable. Nenhuma divergência encontrada.
- **Schema/consistência**: nomes de tabela/coluna usados (`relacionamentos_avaliacao`,
  `envios_pesquisa`, `respostas`, `ciclo_participantes`) batem com as entidades já
  existentes; nenhum campo multi-tenant introduzido.

### Crítico

Sem achados críticos.

### Deveria corrigir

Nenhum item.

### Sugestão

- Nenhuma.

Conclusão: implementação fiel à spec e ao plano, sem achados críticos. Pode prosseguir
para `test-engineer`.

## Testes

**3. test-engineer (2026-09-15):**

Novo arquivo `backend/src/modules/analise/analise-envios.service.spec.ts` (27 testes),
mesmo padrão/fixtures de `analise.service.spec.ts`/`analise-avaliacoes.service.spec.ts`
(`construirRepositoriosAnaliseFalsos`, `test/analiseFixtures.ts`). Cobertura, na ordem de
prioridade do agente:

1. **Controle de acesso (`garantirPapel`)**: `colaborador` → 403 `PAPEL_NAO_AUTORIZADO`
   sem nenhuma query disparada (`repos.ciclosRepo.todas()` vazio); `admin`/`gestor_rh` →
   200 com `ciclos: []`. Replicado também no nível HTTP (`GET /api/analise/envios` via
   `supertest`): sem token → 401 `TOKEN_AUSENTE`; token de `colaborador` → 403
   `PAPEL_NAO_AUTORIZADO`; token de `admin`/`gestor_rh` → 200.
2. **Ausência de exposição de identidade**: dois cenários explícitos pedidos pelo
   orquestrador — "abaixo do mínimo" (1 respondente `pares`, `minimoRespostasPares: 3`) e
   "no mínimo exato" (3 respondentes `subordinado`) — em ambos, os totais agregados são
   expostos (`totalRespondido`/`totalEnvios`/`percentualRespondido` corretos, já que esta
   tela não tem gate de `minimo_respostas_pares`, spec seção 6), mas varredura recursiva de
   chaves do payload confirma ausência de `avaliadorId`/`avaliadoId`/`colaboradorId`/
   `tipoRelacionamento` (e variantes `snake_case`) em qualquer nível, mais checagem de
   substring no JSON serializado (`'avaliador'`, `'avaliado'`, `'"pares"'`, `'subordinado'`
   ausentes). Teste adicional confirma que o shape de cada linha contém exatamente os 10
   campos da spec (seção 4), nada além disso — cobre indiretamente o guard rail de
   `select` explícito do `find()` de `CicloAvaliacao` (mesmo que o `FakeRepository` não
   force `select` em runtime, o mapeamento da service só projeta os campos definidos).
3. **Paridade numérica (guard rail explícito da spec seção 10)**: dois testes que chamam
   `analiseEnviosService.buscarEnviosAnalise` e `ciclosAvaliacaoService.buscarPorId` para o
   MESMO ciclo/mesmos dados seedados (um cenário `avaliacao_360` com 3
   concluídos/2 pendentes, um cenário `clima_geral` com 4 concluídos/3 pendentes) e afirmam
   igualdade exata entre `totalEnvios`/`totalRespondido`/`percentualRespondido` do payload
   de "Envios" e `progresso.total`/`progresso.concluidos`/`progresso.percentual` do payload
   de `GET /api/ciclos/:id` — nenhuma divergência encontrada (percentual de clima
   `Math.round(4/7*100) = 57` bate nos dois lados).
4. **Filtros**: `de`/`ate` ausentes/malformados → 422 `CAMPO_INVALIDO` (`it.each`);
   `ate < de` → 422 `PERIODO_INVALIDO` (service e HTTP); `ate === de` aceito; `cicloId`
   malformado → 422 `CAMPO_INVALIDO`; `cicloId` válido mas inexistente → 404
   `CICLO_NAO_ENCONTRADO`; `cicloId` válido restringe a 1 linha mesmo havendo outro ciclo
   no período; ciclo cuja vigência não sobrepõe o período fica de fora; ciclo com
   sobreposição parcial aparece.
5. **Casos de borda**: ciclo sem pesquisa vinculada → `tipoPesquisa: null`, as 4 contagens
   zeradas, `ciclos.length === 1` (não excluído); ciclo em `rascunho` com pesquisa
   vinculada mas sem `relacionamentos_avaliacao` gerados ainda → `totalEnvios: 0` e
   `status: 'rascunho'`, diferenciado do caso anterior por `tipoPesquisa` não-nulo;
   ordenação por `dataInicio DESC` verificada semeando 3 ciclos fora de ordem e conferindo
   a ordem de saída (nota: o `FakeRepository.find()` só ordena pelo PRIMEIRO campo do
   objeto `order`, então o desempate por `criadoEm DESC` do código de produção não é
   verificável de forma independente por este harness de teste — limitação da infra de
   teste, não do código; o `backend-codereviewer` já confirmou por leitura que o `order`
   está no `find()`/SQL, não em `.sort()` pós-query).
6. **Frontend**: nenhum arquivo `*.test.tsx` existe hoje em `frontend/src/pages/Analise*`
   nem em nenhuma outra página do projeto (confirmado por `Glob`) — sem convenção de teste
   de frontend estabelecida a replicar. Conforme instrução do orquestrador, priorizado só o
   backend (onde vive a regra sensível) nesta rodada.

**Resultado**: `npm test` em `backend/` → **307/307 testes passando** (12 arquivos), sendo
27 novos em `analise-envios.service.spec.ts`. Nenhuma falha, nenhum achado crítico de
anonimização ou controle de acesso.
