# Task: Pergunta tipo Pessoa — filtro "Externo"

Baseado em `.claude/tasks/pessoa-filtro-externo/spec.md`. Só a Frente A vira
implementação; a Frente B não tem passo de código (ver seção dedicada abaixo).

## Frente B — sem ação de código

Conclusão da spec: o filtro "Subordinado" não listar ninguém para "Gestor 3"
**não é bug de código** — é resultado esperado de como o ciclo de teste foi
configurado. `resolverOpcoesPessoa` e `gerarRelacionamentos` foram lidos e
estão consistentes com o design pretendido. Duas causas de dados/config
explicam o sintoma, isoladas ou combinadas:

- (a) `'subordinado'` ausente em `ciclos_avaliacao.tipos_relacionamento_gerados`
  para este ciclo;
- (b) os subordinados de "Gestor 3" (`colaboradores.gestor_id = Gestor3.id`)
  não foram adicionados como `ciclo_participantes` deste ciclo.

Nenhum passo de correção de código nesta task. Se o usuário quiser confirmar
antes de encerrar o assunto, as verificações de dados (sem alterar nada) são:

1. `SELECT tipos_relacionamento_gerados FROM ciclos_avaliacao WHERE id = '<id do ciclo>'`
2. `SELECT * FROM ciclo_participantes WHERE ciclo_id = '<id do ciclo>' AND colaborador_id IN (<ids dos subordinados de Gestor 3>)`
3. `SELECT * FROM relacionamentos_avaliacao WHERE ciclo_id = '<id do ciclo>' AND tipo_relacionamento = 'subordinado' AND avaliado_id = '<id do Gestor 3>'`

Se (1)-(3) mostrarem o array com `'subordinado'`, os participantes corretos e
ainda assim nenhuma linha gerada, isso reabre a hipótese de bug em
`gerarRelacionamentos` — nova spec/investigação, fora desta task.

## Plano — Backend (Frente A)

1. backend-developer — CONCLUÍDO

   Implementado em
   `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`,
   dentro de `resolverOpcoesPessoa`, exatamente como planejado:

   - Adicionadas duas branches novas após o bloco `incluirTodosGestores`:
     - `incluirExterno && relacionamento.tipoRelacionamento === 'gestor'` →
       consulta `Colaborador` direto (`ativo = true`, sem `eh_gestor`,
       excluindo `respondenteId` e `relacionamento.avaliadoId` via dois
       parâmetros nomeados distintos: `respondenteIdExterno`/
       `avaliadoIdExterno`), sem `WHERE` de ciclo.
     - `incluirExterno && relacionamento.tipoRelacionamento === 'subordinado'`
       → mesma consulta, mais `eh_gestor = true`.
     - `pares`/`autoavaliacao`: nenhuma condição nova (comportamento antigo
       preservado, zero candidatos de "externo").
     - Ambas inserem no mesmo `Map` `porId` (dedupe único, nenhuma estrutura
       paralela).
   - Ajuste necessário não descrito literalmente no plano, mas exigido pela
     correção: o early-return `if (condicoes.length === 0 && !incluirTodosGestores) return []`
     foi estendido para também não retornar cedo quando
     `incluirExterno && tipoRelacionamento IN ('gestor', 'subordinado')` —
     sem isso, uma pergunta com `filtroRelacionamento: ['externo']` sozinho
     (sem `pares`/`gestor`/`subordinado`/`todos_gestores` combinados) nunca
     chegaria a rodar a branch nova.
   - JSDoc da função (comentário de `'externo'`, linhas ~244-260) e comentário
     inline (linha ~306-308) atualizados para refletir o novo comportamento
     condicionado a `tipoRelacionamento`, deixando explícito que
     `pares`/`autoavaliacao` continuam sem contribuir nenhuma condição.
   - Nada tocado em `pares`/`gestor`/`subordinado` (branch de
     `relacionamentos_avaliacao`), `todos_gestores`, `perguntas.service.ts`
     nem no frontend, conforme escopo da task.
   - Nenhuma entidade/migration/rota nova (confirmado — mudança é só lógica
     interna de service já existente). **Nenhuma migration precisa rodar.**
   - Skill `backend-anonimizacao-respostas` consultada antes da implementação;
     a nova branch só lê `colaboradores` (nunca `respostas`/`itens_resposta`),
     mantendo o guard rail de anonimização já documentado no JSDoc.
   - Build (`npm run build` em `backend/`): os erros de `tsc` reportados
     (`analise-envios.service.spec.ts`, `src/test/fakeRepository.ts`) já
     existiam antes desta mudança (confirmado via `git stash`/rebuild) — não
     relacionados a este arquivo. Nenhum erro novo introduzido por esta
     alteração. `coleta-respostas-publica` ainda não tem suite de testes
     própria (`npx vitest run src/modules/coleta-respostas-publica` não
     encontrou arquivos `*.spec.ts`) — a cobertura desta branch fica para a
     etapa `test-engineer`, após `backend-codereviewer`.

   ### Detalhamento original do passo 1 (mantido como referência do revisor)

   - **Arquivo:** `backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`
   - **Função:** `resolverOpcoesPessoa` (linhas ~270-350) — não criar função
     nova, adicionar uma branch dentro dela.
   - **Nada de entidade/migration/rota nesta task** — é lógica interna de uma
     função de service já existente, sem novo endpoint e sem mudança de
     schema.
   - **O que implementar:** logo após a leitura de `incluirTodosGestores`
     (linha 294) e antes/depois do bloco `if (incluirTodosGestores)`
     (estrutura livre, mas seguindo o mesmo padrão de "condição independente
     que só roda se aplicável" já usado por `todos_gestores`), adicionar uma
     branch nova condicionada a `filtro.includes('externo')` **E** a
     `relacionamento.tipoRelacionamento`:
     - Se `filtro.includes('externo') && relacionamento.tipoRelacionamento === 'gestor'`:
       consultar `Colaborador` diretamente (sem join com
       `relacionamentos_avaliacao` nem `ciclo_participantes`) filtrando
       `ativo = true`, excluindo `id <> respondenteId` (=
       `relacionamento.avaliadorId`) e `id <> relacionamento.avaliadoId`.
       Selecionar `id` e `nomeCompleto` (coluna `nome_completo`) no mesmo
       formato raw usado pelas outras branches (`{ id, nomeCompleto }`, ver
       `OpcaoPessoaFormulario`), e inserir cada linha em `porId` (mesmo Map já
       usado para dedupe — não criar um segundo mecanismo de dedupe).
     - Se `filtro.includes('externo') && relacionamento.tipoRelacionamento === 'subordinado'`:
       mesma consulta a `Colaborador`, mas adicionando `eh_gestor = true`
       além de `ativo = true`, com a mesma exclusão de
       `respondenteId`/`relacionamento.avaliadoId`. Também inserir em `porId`.
     - Para `relacionamento.tipoRelacionamento === 'pares'` ou
       `'autoavaliacao'`: **não adicionar nenhuma condição** — comportamento
       atual (zero candidatos de "externo") permanece, mesmo que
       `filtro.includes('externo')` seja `true`. Não é preciso um `else`
       explícito de erro; só não gerar nenhuma linha.
   - **Detalhes de implementação da query** (para não haver ambiguidade de
     nomes):
     - Usar `AppDataSource.getRepository(Colaborador)` (já importado no
       arquivo) com `createQueryBuilder('c')`.
     - `.select('c.id', 'id').addSelect('c.nome_completo', 'nomeCompleto')`
       — mesmo alias `nomeCompleto` usado pelas outras branches, para bater
       com o shape de `OpcaoPessoaFormulario` (não alterar esse tipo).
     - `.where('c.ativo = true')`
     - Caso `'gestor'`: sem filtro adicional de `eh_gestor`.
     - Caso `'subordinado'`: `.andWhere('c.eh_gestor = true')`.
     - `.andWhere('c.id <> :respondenteId', { respondenteId })` e
       `.andWhere('c.id <> :avaliadoId', { avaliadoId: relacionamento.avaliadoId })`
       — usar dois parâmetros nomeados distintos (não reaproveitar
       `respondenteId` para os dois, para não colidir com o `setParameter`
       já usado no bloco de `condicoes` mais acima na mesma função).
     - **Nenhum `WHERE` por `ciclo_id`** nas duas variantes — é a diferença
       deliberada em relação a `todos_gestores` (decisão 2 da spec); não
       copiar o `.where('cp.ciclo_id = :cicloId', ...)` do bloco de
       `todos_gestores` para esta branch nova.
     - `.getRawMany<OpcaoPessoaFormulario>()`, depois
       `for (const linha of linhasExterno) porId.set(linha.id, linha)` — mesmo
       padrão das duas branches existentes.
   - **Não tocar**: nenhuma das branches `pares`/`gestor`/`subordinado`
     (linhas 281-291), a branch `todos_gestores` (linhas 325-342), o array
     `condicoes`/query de `RelacionamentoAvaliacao` (linhas 299-323), nem o
     bloco de dedupe final (linha 344-350). Também não tocar
     `perguntas.service.ts` (validação de `filtroRelacionamento` já cobre
     `'externo'`) nem `PerguntaPessoaEditor.tsx` (frontend, fora do escopo
     desta task de backend).
   - **Comentário JSDoc da função** (linhas 229-264): atualizar o trecho que
     hoje diz que `'externo'` "não contribui nenhuma condição, sem que isso
     seja um erro" (linhas 244-246) e o comentário inline da linha 292-293,
     para refletir o novo comportamento condicionado a
     `relacionamento.tipoRelacionamento` — deixar explícito que, para
     `pares`/`autoavaliacao`, `'externo'` continua sem contribuir nenhuma
     condição (comportamento antigo preservado só para esses dois tipos).
   - **Regras de negócio:**
     - `tipoRelacionamento === 'gestor'` → todos os colaboradores ativos da
       empresa (sem restrição de ciclo/equipe), exceto avaliador e avaliado.
     - `tipoRelacionamento === 'subordinado'` → todos os gestores ativos da
       empresa (`eh_gestor = true`), sem restrição de ciclo, exceto avaliador
       e avaliado.
     - `tipoRelacionamento === 'pares'` ou `'autoavaliacao'` → nenhuma
       condição nova; "externo" continua contribuindo zero candidatos.
   - **Tratamento de anonimização:** a nova branch consulta exclusivamente
     `colaboradores` (nunca `respostas`/`itens_resposta`), sempre com
     `ativo = true`, e sempre exclui `avaliadorId` (respondente) e
     `avaliadoId` (pessoa avaliada no envio atual) — mesmo padrão defensivo
     já usado nas branches existentes (linha 318/338). Não há dado de
     resposta envolvido; o risco de anonimização aqui é baixo e já coberto
     pelo guard rail documentado no comentário de linhas 262-264 (que também
     deve continuar valendo após a edição do JSDoc acima).
   - **Rotas/Endpoints/Papéis:** nenhum endpoint novo. A função roda dentro
     do fluxo público existente (`GET`/`POST` de `/api/publico/...`, módulo
     `coleta-respostas-publica`, sem `autenticar` — acesso por
     `sessaoToken` + CPF, não por papel). Nenhuma mudança de superfície de
     rota ou de controle de acesso.

2. backend-codereviewer

   - Conferir que a nova branch **nunca** adiciona filtro de `ciclo_id`/
     `ciclo_participantes` nas duas variantes de "externo" — é a diferença
     deliberada frente a `todos_gestores`; um `WHERE cp.ciclo_id = ...`
     colado por engano aqui reproduziria o comportamento errado.
   - Conferir que a exclusão usa dois parâmetros distintos
     (`respondenteId` e `avaliadoId`) e que ambos batem com
     `relacionamento.avaliadorId`/`relacionamento.avaliadoId` — não com
     `respondenteId` reaproveitado para os dois (bug fácil de introduzir por
     copiar-colar do padrão de outras branches, que só excluem o
     respondente).
   - Conferir que a branch de `subordinado` filtra `eh_gestor = true` e que a
     de `gestor` **não** filtra `eh_gestor` (a distinção é intencional -
     "avaliador de gestor" vê todos os colaboradores; "avaliador de
     subordinado" vê só gestores).
   - Conferir que `pares`/`autoavaliacao` continuam sem nenhuma condição nova
     para "externo" (nenhum array vazio incorreto, nenhuma branch faltando o
     early-return correto).
   - Conferir que o resultado é inserido no mesmo `Map` `porId` (dedupe
     único), sem introduzir uma segunda estrutura/lista paralela.
   - Conferir que nenhuma consulta nova toca `respostas`/`itens_resposta`
     (só `colaboradores`).
   - Conferir que o JSDoc da função foi atualizado para não continuar
     afirmando que `'externo'` nunca contribui condição nenhuma (isso agora
     só é verdade para `pares`/`autoavaliacao`).

## Revisão

Arquivo revisado:
`backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts`
(função `resolverOpcoesPessoa`, linhas ~229-409).

Conferido item a item contra o checklist do plano e contra as decisões 1-4 da
spec:

- Nenhuma das duas branches novas (`incluirExterno && tipoRelacionamento ===
  'gestor'`, linhas 366-382; `=== 'subordinado'`, linhas 384-401) adiciona
  `WHERE`/`JOIN` de `ciclo_id`/`ciclo_participantes` — consultam só
  `Colaborador` direto, com amplitude de empresa inteira, como exigido pelas
  decisões 1/2 da spec (deliberadamente mais amplo que `todos_gestores`).
- Exclusão de avaliador/avaliado usa parâmetros nomeados distintos
  (`respondenteIdExterno`/`avaliadoIdExterno`, linhas 377-378 e 396-397), sem
  reaproveitar `respondenteId` da query builder de `condicoes` mais acima —
  são instâncias de `createQueryBuilder` completamente separadas, então nem
  haveria colisão real, mas a nomenclatura distinta segue o padrão pedido.
  Valores corretos: `respondenteIdExterno` = `respondenteId` (=
  `relacionamento.avaliadorId`) e `avaliadoIdExterno` =
  `relacionamento.avaliadoId`.
- `eh_gestor = true` (linha 395) só está presente na branch de
  `'subordinado'`; a branch de `'gestor'` (linhas 372-379) não tem esse
  filtro — distinção correta e intencional.
- `pares`/`autoavaliacao`: nenhuma condição nova foi adicionada para esses
  dois tipos; o early-return (linhas 311-317) faz `return []` corretamente
  quando `externo` é o único filtro marcado e `tipoRelacionamento` é `pares`
  ou `autoavaliacao` — verifiquei a álgebra booleana da condição composta e
  ela produz o resultado certo nas 4 combinações relevantes (externo sozinho
  com gestor/subordinado → não retorna cedo; externo sozinho com
  pares/autoavaliacao → retorna `[]`; externo combinado com outro filtro já
  populado → nunca retorna cedo de qualquer forma).
- Ambas as branches inserem em `porId.set(linha.id, linha)` (linhas 381 e
  400) — mesmo `Map` usado por `condicoes` e por `todos_gestores`, sem
  estrutura paralela.
- Nenhuma consulta nova toca `respostas`/`itens_resposta`/`Resposta`/
  `ItemResposta` — só `AppDataSource.getRepository(Colaborador)`.
- O ajuste no early-return foi estendido corretamente (ver análise acima);
  não encontrei combinação de filtros em que ele quebre o comportamento
  anterior (`pares`/`gestor`/`subordinado`/`todos_gestores` isolados ou
  combinados continuam se comportando como antes, já que a nova cláusula só
  é `false` — impedindo o `return []` — quando `incluirExterno` é
  verdadeiro e o tipo é `gestor`/`subordinado`).

### Crítico

Sem achados críticos.

### Deveria corrigir

- **JSDoc parcialmente desatualizado (inconsistência interna do próprio
  comentário).** O bloco de JSDoc da função foi bem atualizado nas linhas
  244-260 (explica claramente o novo comportamento de `'externo'`
  condicionado a `tipoRelacionamento`), mas o parágrafo seguinte, por volta
  da linha 269, não foi ajustado e ainda diz: *"Se, depois de descartar
  `autoavaliacao`/`externo`, nenhum tipo válido sobrar E `todos_gestores`
  não estiver marcado, retorna `[]` sem consultar o banco."* Essa frase
  ficou contraditória com o parágrafo logo acima dela: hoje `'externo'` **não
  é sempre descartado** do cálculo do early-return — ele impede o `return []`
  precisamente quando `tipoRelacionamento` é `'gestor'` ou `'subordinado'`.
  Um leitor futuro que só ler esse segundo parágrafo (sem notar a exceção
  documentada acima) pode concluir erroneamente que "externo sozinho nunca
  consulta o banco", o que não é mais verdade para `gestor`/`subordinado`.
  Sugiro ajustar essa frase para mencionar a exceção (ou removê-la, já que o
  parágrafo das linhas 244-260 já cobre o comportamento atual com mais
  precisão) antes de fechar a task.

### Sugestão

- **Duplicação leve entre as duas branches de "externo".** As branches de
  `'gestor'` (linhas 366-382) e `'subordinado'` (linhas 384-401) são quase
  idênticas — diferem só pela presença de `.andWhere('c.eh_gestor = true')` e
  pelo comentário. Não é um problema de autorização duplicada (o checklist
  do orquestrador foca nisso), mas dá para extrair um helper local (ex.
  `buscarColaboradoresAtivos(excluir: string[], somenteGestores: boolean)`)
  para reduzir a repetição, se uma terceira variante surgir no futuro. Não é
  bloqueante.

Nenhum achado crítico ou de controle de acesso/anonimização: a implementação
não introduz superfície de rota nova, consulta só dados estruturais de
`colaboradores`, sempre filtra `ativo = true` e exclui avaliador/avaliado nas
duas novas branches, e mantém o único ponto de dedupe (`porId`) já existente.

### Pós-revisão

- **"Deveria corrigir" endereçado**: o parágrafo desatualizado por volta da
  linha 269 foi ajustado para refletir que `'externo'` só é descartado do
  cálculo do early-return quando `tipoRelacionamento` NÃO é `gestor`/
  `subordinado` — consistente com o parágrafo das linhas 244-260.
- **Sugestão (duplicação leve entre as duas branches de "externo")**: não
  aplicada — não bloqueante e o plano pediu para não extrair abstração sem
  necessidade real (uma terceira variante ainda não existe).
- Por pedido explícito do usuário, a etapa `test-engineer` foi pulada nesta
  task — nenhum teste automatizado foi escrito para esta mudança.
