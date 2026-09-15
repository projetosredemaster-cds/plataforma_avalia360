# Spec — Pergunta tipo Pessoa: filtro "Externo" + investigação do bug relatado no filtro "Subordinado"

## Resumo do pedido

Duas frentes relacionadas à pergunta tipo `pessoa` no fluxo público de resposta
(`/api/publico`, módulo `coleta-respostas-publica`, espelhado no frontend por
`ResponderPesquisaPage`):

- **Frente B** (investigação, pré-requisito da Frente A): diagnosticar por que, num
  ciclo real, o filtro "Subordinado" de uma pergunta tipo Pessoa não lista nenhum
  colaborador para um avaliador ("Gestor 3") que tem subordinados cadastrados
  (`colaboradores.gestor_id`), mesmo com um envio ativo do tipo "Gestor avalia
  liderado" nesse ciclo.
- **Frente A** (especificação para implementação futura, decisões já fechadas com o
  usuário): definir o comportamento do filtro "Externo" da pergunta tipo Pessoa, hoje
  sem fonte de dados implementada.

Nenhum código foi alterado nesta tarefa — só investigação e especificação.

## Investigação Frente B — onde a lista de candidatos é montada

Toda a resolução de opções da pergunta tipo `pessoa` vive em uma única função:
`resolverOpcoesPessoa` em
`backend/src/modules/coleta-respostas-publica/coleta-respostas-publica.service.ts:270-350`,
chamada por `buscarFormulario` (linha 546, ao montar o formulário) e por
`enviarRespostas` (linha 642, para revalidar a resposta enviada). Não há nenhum outro
lugar no backend que monte essa lista — é a única fonte de verdade.

Fatos levantados sobre essa função:

1. **A lista NUNCA é montada a partir de `colaboradores.gestor_id` diretamente.** Ela é
   montada a partir de `relacionamentos_avaliacao` **já gerados para o ciclo do envio
   atual** (`relacionamento.cicloId`, linha 311). Ou seja: depende inteiramente do que
   o motor de ciclos já materializou como linha em `relacionamentos_avaliacao` para
   este ciclo específico — não de uma leitura estrutural do cadastro de colaboradores.

2. **Para o filtro "Subordinado" especificamente** (linhas 289-291):
   ```
   if (filtro.includes('subordinado')) {
     condicoes.push("(r.tipo_relacionamento = 'subordinado' AND r.avaliado_id = :respondenteId)")
   }
   ```
   Isso busca linhas de `relacionamentos_avaliacao` com `tipo_relacionamento =
   'subordinado'` onde `avaliado_id` é o respondente atual (`relacionamento.avaliadorId`
   do envio em curso, linha 278). Pelo rótulo de UI em
   `frontend/src/components/ciclos/rotulosTiposRelacionamentoGerados.ts:10`
   (`{ valor: 'subordinado', rotulo: 'Liderado avalia gestor' }`), uma linha
   `tipo_relacionamento = 'subordinado'` tem **o liderado como avaliador e o gestor
   como avaliado** — confirmado também pelo motor de geração (ver item 3 abaixo).
   Logo, para o filtro "Subordinado" listar alguém quando quem responde é o Gestor 3,
   é preciso que já existam linhas `subordinado` em `relacionamentos_avaliacao` **deste
   ciclo** com `avaliado_id = Gestor3.id` (ou seja: os subordinados de Gestor 3
   avaliando-o, na direção "Liderado avalia gestor").

3. **Como essas linhas `subordinado` são geradas** — `gerarRelacionamentos` em
   `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts:606-680`:
   - Linha 611: `participantes = manager.getRepository(CicloParticipante).find({ where: { cicloId } })`
     — só os `ciclo_participantes` **deste ciclo**, não todos os colaboradores da
     empresa.
   - Linhas 616-618: `colaboradores = ... find({ where: { id: In(participanteIds) } })`
     — só os dados desses mesmos participantes.
   - Linhas 620-627: `participantesPorGestor` é um mapa construído **só a partir desses
     `colaboradores` (= participantes do ciclo)**, agrupando por `gestorId`.
   - Linhas 654-658: para cada participante `p`, se `'subordinado'` estiver em
     `tiposHabilitados` (= `ciclo.tiposRelacionamentoGerados`), gera uma linha
     `subordinado` para cada item de `participantesPorGestor.get(p.id)` — ou seja, **só
     para participantes cujo `gestor_id` aponta para outro participante do MESMO
     ciclo**.
   - Confirma-se então: mesmo que um colaborador tenha `gestor_id = Gestor3.id`
     corretamente no cadastro (`colaboradores`), se esse colaborador **não foi
     adicionado como `ciclo_participantes` deste ciclo específico**, nenhuma linha
     `relacionamentos_avaliacao` do tipo `subordinado` com `avaliado_id = Gestor3.id`
     é criada — e portanto `resolverOpcoesPessoa` não tem o que listar.
   - Alternativa igualmente suficiente para o mesmo sintoma: se `'subordinado'` não
     estiver presente em `ciclo.tiposRelacionamentoGerados` para este ciclo (campo
     validado em `ciclos-avaliacao.service.ts:336-343`/`571-577` contra
     `TIPO_RELACIONAMENTO_GERACAO_VALORES`), a branch da linha 654 nunca roda, para
     nenhum participante — mesmo resultado (lista vazia).

4. **Confirmação de que participantes de ciclo são sempre seleção manual, nunca
   automática**: `backend/src/modules/ciclo-participantes/ciclo-participantes.service.ts`
   só expõe `adicionarIndividual` (linhas 57-108, recebe `colaboradorIds` explícitos no
   payload) e `adicionarPorEquipe` (linhas 110-147, recebe um `equipeId` explícito).
   Não existe nenhum caminho que adicione "todos os colaboradores" ou "todos os
   subordinados de X" automaticamente como participantes de um ciclo — é sempre ação
   manual do admin/gestor_rh ao montar o ciclo.

### Diagnóstico Frente B — bug de código vs. configuração/dados

**Não foi encontrado bug de código.** A leitura de `resolverOpcoesPessoa` (com o
`respondenteId` correto — o `avaliadorId` do relacionamento do envio atual, linha 278 —
e a condição de `subordinado` na direção certa, linha 290) e de `gerarRelacionamentos`
(agrupamento por `gestorId` restrito a participantes do ciclo, linhas 620-627/654-658)
está consistente com o comentário de design em
`coleta-respostas-publica.service.ts:240-241`: *"subordinado: só linhas em que o
respondente é o AVALIADO (são os subordinados DO respondente)"* — e essas linhas só
existem se tiverem sido geradas para este ciclo.

O sintoma relatado (lista vazia mesmo com `gestor_id` correto no cadastro) é totalmente
explicado por qualquer uma destas duas condições de configuração/dados do ciclo de
teste, sem precisar de nenhum defeito de código:

- **(a)** `'subordinado'` não está em `ciclos_avaliacao.tipos_relacionamento_gerados`
  para este ciclo, OU
- **(b)** os subordinados de Gestor 3 (colaboradores com `gestor_id = Gestor3.id`) não
  foram adicionados como `ciclo_participantes` deste ciclo específico.

Não tenho acesso a um banco real para confirmar qual das duas (ou ambas) é o caso
efetivo neste ciclo de teste. Verificações de dados que resolveriam a dúvida:

1. `SELECT tipos_relacionamento_gerados FROM ciclos_avaliacao WHERE id = '<id do ciclo>'`
   — confirmar se `'subordinado'` está no array.
2. `SELECT * FROM ciclo_participantes WHERE ciclo_id = '<id do ciclo>' AND colaborador_id IN (<ids dos subordinados de Gestor 3>)`
   — confirmar se eles estão cadastrados como participantes deste ciclo.
3. Como reforço, `SELECT * FROM relacionamentos_avaliacao WHERE ciclo_id = '<id do ciclo>' AND tipo_relacionamento = 'subordinado' AND avaliado_id = '<id do Gestor 3>'`
   — se vier vazio, confirma que nenhuma linha foi gerada (consequência de (a) e/ou
   (b)); se vier com linhas, o problema estaria em outro lugar (o que a leitura de
   código não indica ser o caso).

**Conclusão: (ii) comportamento esperado dado como o ciclo de teste foi configurado**,
condicionado à confirmação de dados acima — não (i) bug de código. Se as verificações
1-3 mostrarem o oposto (tipo presente, participantes corretos, mas ainda assim nenhuma
linha `subordinado` gerada), isso reabriria a hipótese de bug em `gerarRelacionamentos`
e exigiria nova investigação.

## Frente A — Filtro "Externo" da pergunta tipo Pessoa

### Estado atual confirmado no código

- `'externo'` já é uma opção válida de `configuracao.filtroRelacionamento` na allowlist
  `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (`backend/src/common/enums.ts:100-105`) e
  já é aceita/validada por `perguntas.service.ts:145-161` (bloco de validação de config
  para tipo `pessoa`) — não é preciso alterar o enum nem a validação de configuração.
- O editor da pergunta no frontend (`PerguntaPessoaEditor.tsx:26-31`) já oferece
  "Externo" como opção selecionável de filtro, junto com Pares/Subordinado/Todos os
  gestores, **sem nenhuma restrição por tipo de relacionamento do envio** — ou seja, o
  filtro é uma configuração da pergunta/pesquisa como um todo, não amarrada a um
  `tipo_relacionamento` específico do envio em que a pergunta aparecerá.
- Porém, em `resolverOpcoesPessoa` (`coleta-respostas-publica.service.ts:270-350`), o
  filtro `'externo'` **nunca contribui nenhuma condição de busca** — comentário
  explícito nas linhas 244-246 e 292-293: *"'externo' nunca tem linhas geradas hoje
  pelo motor de ciclos [...] não contribui nenhuma condição, sem que isso seja um
  erro"*. Isso é consistente com o fato (confirmado por grep) de que
  `tipo_relacionamento = 'externo'` nunca é gravado por nenhum código do backend hoje —
  nem `gerarRelacionamentos` (que explicitamente o exclui, comentário
  `ciclos-avaliacao.service.ts:603-605`) nem nenhum outro fluxo de criação manual (não
  existe nenhum endpoint de "adicionar avaliador externo" no repositório atual).
- **Resultado prático hoje**: se uma pergunta tipo Pessoa tiver `filtroRelacionamento`
  contendo `'externo'` (sozinho ou combinado com outros filtros), a fatia "externo"
  sempre contribui zero candidatos, para **qualquer** tipo de relacionamento do envio em
  que a pergunta aparece (`autoavaliacao`, `gestor`, `pares` ou `subordinado`) — porque a
  função não faz nenhum branch por `relacionamento.tipoRelacionamento` hoje, só por
  filtro selecionado.

### Decisões fechadas (já confirmadas com o usuário — não reabrir)

1. Quando o respondente do envio é o **avaliador de uma relação `gestor`** (rótulo
   "Gestor avalia liderado" — `relacionamento.tipoRelacionamento === 'gestor'`,
   confirmado em `frontend/src/components/ciclos/rotulosTiposRelacionamentoGerados.ts:8`),
   o filtro "Externo" deve listar **todos os colaboradores ATIVOS da empresa inteira**
   — sem restrição a equipe, a pares/subordinado do avaliado, nem aos
   `ciclo_participantes` deste ciclo.
2. Quando o respondente é o **avaliador de uma relação `subordinado`** (rótulo
   "Liderado avalia gestor" — `relacionamento.tipoRelacionamento === 'subordinado'`),
   o filtro "Externo" deve listar **todos os gestores ativos da empresa**
   (`colaboradores.eh_gestor = true AND colaboradores.ativo = true`), com a mesma
   amplitude de empresa inteira (não restrito a este ciclo). Nota: isso é
   deliberadamente mais amplo que o filtro já existente `'todos_gestores'`
   (`resolverOpcoesPessoa`, linhas 325-342), que restringe a gestores que também são
   `ciclo_participantes` deste ciclo — "Externo" para este caso NÃO tem essa restrição.
3. Em ambos os casos (1) e (2): sempre excluir da lista o próprio avaliador
   (`relacionamento.avaliadorId`, o respondente) e o avaliado
   (`relacionamento.avaliadoId`, a pessoa sendo avaliada neste envio) — mesmo padrão
   defensivo já aplicado às outras branches de `resolverOpcoesPessoa` (ex.: linha 318,
   `(idColegaExpr) <> :respondenteId`).
4. **Fora de escopo nesta rodada**: comportamento de "Externo" para
   `tipo_relacionamento = 'pares'` ("Pares avaliam entre si") e
   `'autoavaliacao'`. A investigação mostra que, hoje, "Externo" já é oferecido pelo
   editor de pergunta (`PerguntaPessoaEditor.tsx`) sem nenhuma restrição por tipo de
   relacionamento — ou seja, nada impede um admin de marcar `filtroRelacionamento:
   ['externo']` numa pergunta que também aparecerá em envios `autoavaliacao`/`pares`
   hoje. Nesses dois casos, o comportamento atual (zero candidatos, filtro
   ignorado silenciosamente) permanece inalterado até uma decisão futura — não
   implementar nenhuma lógica nova para `autoavaliacao`/`pares` nesta rodada.

### Ambiguidades remanescentes não cobertas pelas decisões acima

Nenhuma identificada que bloqueie o planejamento: as 4 decisões fechadas, combinadas
com os fatos de código levantados (formato de `OpcaoPessoaFormulario`, ponto único de
resolução em `resolverOpcoesPessoa`, exclusão do próprio avaliador/avaliado já
padronizada), são suficientes para a etapa de planejamento de backend definir a
implementação (nova branch condicionada a `relacionamento.tipoRelacionamento` dentro de
`resolverOpcoesPessoa`, sem tocar nas branches de `pares`/`gestor`/`subordinado`/
`todos_gestores` já existentes).

## Fora de escopo (ambas as frentes)

- Qualquer correção de código para a Frente B — esta spec só diagnostica; se as
  verificações de dados confirmarem bug real, isso exige nova investigação/spec.
- Implementação de código da Frente A — esta spec só especifica o comportamento
  esperado; passa a ser trabalho de `planejamento-backend`/`backend-developer`.
- Comportamento de "Externo" para `autoavaliacao` e `pares` (decisão 4 acima).
- Qualquer fluxo de criação manual de `tipo_relacionamento = 'externo'` em
  `relacionamentos_avaliacao` (avaliador convidado externo à empresa) — o "Externo" da
  Frente A é só o filtro de candidatos da pergunta tipo Pessoa, não a criação de novos
  relacionamentos/envios do tipo `externo`.

## Riscos de anonimização / controle de acesso

- Baixo risco de anonimização: `resolverOpcoesPessoa` já lê só dados estruturais
  (`colaboradores`, `ciclo_participantes`, `relacionamentos_avaliacao`) — nunca
  `respostas`/`itens_resposta` — e a nova branch de "Externo" da Frente A deve manter
  essa mesma restrição (consultar só `colaboradores.ativo`/`eh_gestor`, nunca dado de
  resposta). Isso já está registrado no comentário de guard rail existente
  (`coleta-respostas-publica.service.ts:262-264`) e deve continuar valendo após a
  mudança.
- Atenção ao converter a Frente A em implementação: "todos os colaboradores ativos da
  empresa" (decisão 1) é uma consulta sem filtro de ciclo — precisa continuar excluindo
  só avaliador/avaliado (decisão 3), nunca vazar colaboradores inativos (mesmo padrão já
  usado em outras branches, ex. `c.ativo = true` na linha 315).
- Nenhum impacto em controle de acesso por papel: esta função roda inteiramente dentro
  do fluxo público autenticado por sessão de resposta (`sessaoToken`), sem envolver
  `admin`/`gestor_rh`/`colaborador` — mantém-se assim.
