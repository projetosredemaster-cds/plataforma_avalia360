# Spec — Tela "Envios" (Análise → Quantitativa)

## 1. Resumo do pedido

Nova tela dentro do módulo `analise` (frontend `frontend/src`, backend `backend/src`),
irmã de "Visão Geral", "Avaliações", "Ranking", "Resultados por Pergunta" e "Nuvem de
Palavras": uma lista **agregada por ciclo** com o status de envio/resposta de cada ciclo
de avaliação — pendentes vs. respondidos —, para dar ao RH/admin uma visão consolidada
de "quantos ciclos estão em aberto e o quanto falta" sem precisar abrir o detalhe de
cada ciclo um por um.

Diferente das outras quatro telas do menu Quantitativa/Qualitativa, esta é a única
pensada como **relatório tabular simples, sem drill-down por pessoa** (isso já existe em
`CicloDetalhePage`) e **sem nenhuma ação** (copiar link, marcar como enviado, expirar,
lembrete — todas continuam exclusivas do detalhe do Ciclo).

## 2. Decisões já fechadas pelo usuário (não reabrir)

1. Nível de detalhe: 1 linha = 1 ciclo, com contagens agregadas (pendentes/respondidos),
   não lista pessoa a pessoa.
2. Somente leitura — nenhum botão de ação nesta tela.
3. Filtros: período (`de`/`ate`) + `cicloId` opcional via `SeletorCiclo` (seleção única,
   combinável com período) — mesmo padrão de "Visão Geral"/"Avaliações".
4. Sem gate de anonimização (ver seção 6 — justificativa registrada).
5. Sem atalho no card do Ciclo — acesso só via menu lateral, Análises → Quantitativa
   (mesmo grupo de "Ranking"/"Resultados por Pergunta"; ver seção 8 sobre a escolha do
   grupo Quantitativa em vez de Qualitativa).

## 3. Decisão de arquitetura — reaproveitamento do cálculo de progresso em lote

### 3.1 O que já existe

- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`:
  - `calcularProgressoCiclo(cicloId, pesquisaVinculada)` — versão single-item, usada por
    `criar`/`atualizar`/`buscarPorId`/`atualizarStatus`/`buscarProgresso`. Não serve
    diretamente aqui: chamá-la ciclo a ciclo para uma lista inteira reintroduziria N+1
    exatamente o problema que a versão em lote de `listar()` já resolve.
  - Dentro de `listar()` (linhas ~372–491): a agregação em lote real — `idsAval360`/
    `idsClima` calculados a partir da pesquisa vinculada mais recente de cada ciclo, e
    duas rodadas de `createQueryBuilder(...).groupBy('r.ciclo_id' | 'cp.ciclo_id')` para
    total/concluídos, com guard rail comentado explicitamente ("SÓ CONTAGEM, nunca
    seleciona avaliador_id/avaliado_id/tipo_relacionamento"). Esse bloco está **inline
    dentro de `listar()`, não extraído/exportado**, e `listar()` também calcula, no mesmo
    laço, `elegibilidadeAtivacao` (participantes/pesquisa publicada de ciclos em
    rascunho) — responsabilidade que não interessa a "Envios".
- `backend/src/modules/analise/analise-comum.ts` já resolve, de forma exportada e
  reaproveitável, duas das três peças que "Envios" precisa:
  - `buscarUniversoCiclos(periodo, cicloId?)` — universo de ciclos cuja vigência
    sobrepõe o período (mesmo critério: `data_inicio <= ate AND data_fim >= de`).
  - `classificarPorTipo(idsUniverso)` — classifica em `idsAval360`/`idsClima` pela
    pesquisa vinculada mais recente (mesmo critério de desempate de
    `buscarPesquisaVinculada`), com ciclos sem pesquisa vinculada não entrando em
    nenhum dos dois grupos (decisão de modelagem 8, já registrada e usada por Visão
    Geral/Nuvem de Palavras).
  - Falta a terceira peça: as contagens de total/concluídos em lote por ciclo
    (equivalente ao bloco inline de `listar()`), hoje não exportada de lugar nenhum.

### 3.2 Decisão: opção (b) — função dedicada em `analise-comum.ts`, sem tocar `ciclos-avaliacao.service.ts`

Não vou extrair/mover o bloco de `listar()` para um lugar compartilhado entre os dois
módulos, nem fazer `ciclos-avaliacao.service.ts::listar()` passar a chamar uma função de
`analise/`. Em vez disso: **nova função `calcularProgressoEmLotePorCiclo(idsAval360,
idsClima)` em `analise-comum.ts`**, que replica o mesmo SQL (mesmo guard rail comentado)
usado hoje dentro de `listar()`, mas devolve um `Map<string, ProgressoCiclo>` reutilizável
por qualquer consumidor de `analise/`.

Motivos:

- **Precedente já registrado no próprio `analise-comum.ts`**, no comentário de
  `validarDataQuery`: "duplicada localmente porque aquela função é privada do módulo de
  ciclos (não exportada); pequena duplicação deliberada em vez de exportar uma função de
  outro domínio só para isto". O bloco de progresso em lote está na mesma situação —
  privado, inline, dentro de uma função (`listar()`) de outro módulo que faz mais coisa
  do que só isso.
- `listar()` corresponde a uma task já fechada (`ciclos-avaliacao`, já em produção de
  fato no fluxo do card do Ciclo). Refatorá-la para extrair um pedaço e passar a chamar
  `analise/` de dentro de `ciclos-avaliacao/` inverteria a direção de dependência do
  módulo mais antigo/estável em favor de um módulo mais novo — risco de regressão sem
  benefício real (mesmo raciocínio geral do CLAUDE.md sobre preferir não tocar em código
  de uma task já fechada quando uma alternativa igualmente boa existe).
- `analise-comum.ts` já tem `buscarUniversoCiclos`/`classificarPorTipo`, que **não**
  espelham exatamente o que `listar()` calcula inline (`listar()` resolve
  `pesquisaVinculadaPorCiclo` manualmente, sem chamar `classificarPorTipo`) — ou seja,
  mesmo se decidíssemos reaproveitar código de `ciclos-avaliacao/`, "Envios" ainda
  precisaria da classificação de `analise-comum.ts` primeiro; a única peça
  genuinamente nova é a contagem de total/concluídos, que fica isolada e pequena o
  suficiente para duplicar com uma linha de comentário apontando a duplicação (mesmo
  padrão de `validarDataQuery`).
- Duplicação de query de contagem em lote já é aceita hoje no próprio
  `ciclos-avaliacao.service.ts`: a versão single-item (`calcularProgressoCiclo`) e a
  versão em lote de `listar()` já duplicam a MESMA lógica de negócio (total/concluídos
  por tipo) por razões de performance (evitar N+1). Este é o mesmo padrão, só que entre
  módulos em vez de dentro do mesmo módulo.

Guard rail (replicado, mesmo comentário): `calcularProgressoEmLotePorCiclo` nunca
seleciona `avaliador_id`/`avaliado_id`/`colaborador_id`/`tipo_relacionamento` — só
`COUNT`/`GROUP BY` por `ciclo_id`, igual ao bloco original.

Assinatura:

```ts
export interface ProgressoCicloLote {
  total: number
  concluidos: number
  percentual: number // Math.round((concluidos/total)*100), 0 se total=0 — mesma fórmula de calcularPercentual em ciclos-avaliacao.service.ts
}

export async function calcularProgressoEmLotePorCiclo(
  idsAval360: string[],
  idsClima: string[],
): Promise<Map<string, ProgressoCicloLote>>
```

`analise-envios.service.ts` então compõe, na mesma ordem já usada por
`buscarVisaoGeral`: `buscarUniversoCiclos` → `classificarPorTipo` →
`calcularProgressoEmLotePorCiclo`, mais uma busca dos dados descritivos do ciclo
(nome/datas — ver seção 4) via `AppDataSource.getRepository(CicloAvaliacao).find({ where:
{ id: In(idsUniverso) } })`.

## 4. Contrato da API

`GET /api/analise/envios` — novo endpoint, mesmo módulo (`analise.module.ts`, dentro de
`router.use(autenticar)`), nova função `buscarEnviosAnalise` em
`analise-envios.service.ts` + `analise-envios.controller.ts`, seguindo exatamente a
mesma estrutura de arquivo de `analise.service.ts`/`analise-avaliacoes.service.ts`.
`garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha (`PAPEIS_COM_ACESSO` já
exportado de `analise-comum.ts`, reaproveitar).

Query params: `de` (obrigatório, `YYYY-MM-DD`), `ate` (obrigatório, `YYYY-MM-DD`),
`cicloId` (opcional, uuid) — validados com `validarDataQuery`/`ehUuidValido`, mesmo
padrão de `buscarVisaoGeral`. Mesma checagem `ate < de → 422 PERIODO_INVALIDO`.

Resposta:

```ts
export interface LinhaEnvioAnalise {
  cicloId: string
  nome: string
  tipoPesquisa: 'avaliacao_360' | 'clima_geral' | null // null = sem pesquisa vinculada, ver seção 7
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
```

Notas de campo:

- **Campos confirmados** da lista proposta pelo pedido: nome do ciclo (`nome`), tipo de
  pesquisa vinculada (`tipoPesquisa`), datas de vigência (`dataInicio`/`dataFim`), total
  de envios/participantes (`totalEnvios` — mesma semântica de "total" de
  `calcularProgressoCiclo`: para `avaliacao_360`, `COUNT(relacionamentos_avaliacao)`;
  para `clima_geral`, `COUNT(ciclo_participantes)`), total pendente (`totalPendente`,
  derivado em memória como `totalEnvios - totalRespondido` — não é uma quarta query),
  total respondido (`totalRespondido`, mesma semântica de "concluídos"), percentual
  (`percentualRespondido`, reaproveita `calcularPercentual`, replicada localmente por já
  ser uma função de 1 linha e privada de `ciclos-avaliacao.service.ts` — mesmo padrão de
  duplicação deliberada da seção 3.2).
- **Campo adicionado nesta spec, além dos listados no pedido**: `status` (rascunho/
  ativo/encerrado) do ciclo. Justificativa: sem ele, um ciclo em `rascunho` (que ainda
  não gerou `relacionamentos_avaliacao`/`ciclo_participantes` — só passa a gerar ao
  ativar, ver `atualizarStatus`) aparece com `totalEnvios: 0` e nenhuma forma de o
  usuário distinguir "0 porque ainda não foi ativado" de "0 porque não tem pesquisa
  vinculada" (`tipoPesquisa: null`) só olhando números. `status` já é um campo público de
  `CicloAvaliacao` (mesma entidade, sem custo extra de query) e o frontend pode usar isso
  para uma tag textual ("Rascunho — envios ainda não gerados").
- `cicloId` (identificador da linha) é necessário para a `key` de React da tabela e não
  estava na lista original — adicionado por ser óbvio/implícito.
- Nenhum campo de identidade (nome de pessoa, e-mail, CPF) em nenhum nível — reforça a
  seção 6.

## 5. Ordenação padrão

**Decisão: `dataInicio` decrescente (ciclo com vigência mais recente primeiro), com
desempate por `criadoEm` decrescente.**

Motivo: mantém consistência com o resto do produto — `ciclos-avaliacao.service.ts::listar()`
já ordena por `criadoEm DESC` como padrão da listagem "canônica" de ciclos, e o card do
Ciclo (fora do módulo `analise`) segue a mesma lógica de "mais recente no topo". Ordenar
por maior percentual pendente primeiro foi considerado e descartado: essa tela não tem
paginação nem ação nenhuma associada a "resolver" o pendente (diferente de, por exemplo,
uma fila de tarefas), então priorizar urgência não tem o mesmo valor de UX que teria numa
tela acionável — e ordenar por urgência tornaria a posição de cada ciclo instável conforme
respostas chegam, dificultando comparação entre visitas. Fica como decisão fechada:
ordenar por `dataInicio DESC` no backend (SQL `ORDER BY`, não pós-processamento em
memória).

## 6. Por que não há gate de anonimização aqui

A regra de anonimização (`analise-comum.ts::calcularGateParesSubordinado`/
`calcularGateClima`, skill `backend-anonimizacao-respostas`) existe para impedir que
respostas de `pares`/`subordinado` sejam expostas de forma identificada (ligadas a um
`avaliador_id` específico) para o avaliado, abaixo de `ciclos_avaliacao.minimo_respostas_pares`.

Esta tela nunca projeta `avaliador_id`, `avaliado_id`, `colaborador_id` nem
`tipo_relacionamento` em nenhum nível — nem agregado por avaliado, nem bruto. Toda
contagem é `COUNT(*)`/`GROUP BY ciclo_id` sobre `relacionamentos_avaliacao`/
`ciclo_participantes`, o mesmo nível de agregação (por ciclo inteiro, não por
avaliado/tipo de relacionamento) já usado e validado em "Visão Geral"
(`analise.service.ts`), que também não tem gate de mínimo de respondentes. Não existe,
portanto, um "avaliado individual" identificável no payload — a menor unidade exposta é
o ciclo inteiro, então o cenário que o gate de `minimo_respostas_pares` protege (reidentificar
quem respondeu, ou inferir uma resposta individual a partir de um grupo pequeno) não se
aplica. Isso replica o mesmo raciocínio já registrado nos comentários de guard rail de
`calcularProgressoCiclo`/`contarTotal360`/`contarRespostas360NoPeriodo`.

## 7. Ciclos sem pesquisa vinculada

**Decisão: mostrar na lista, não excluir**, com `tipoPesquisa: null` e
`totalEnvios`/`totalPendente`/`totalRespondido`/`percentualRespondido` todos `0`.

Motivo: `classificarPorTipo` já documenta que "ciclos sem pesquisa vinculada não entram
em nenhum dos dois grupos" — e "Visão Geral" já lida com esse caso contando esses ciclos
em `totalCiclos` mas com `0` em `distribuicaoPorTipo` (nenhuma linha é descartada do
universo, só não ganha uma classificação de tipo). "Envios" replica o mesmo tratamento
por consistência entre as telas irmãs, e porque excluir da lista esconderia exatamente o
tipo de ciclo que mais precisa de atenção de um RH/admin (um ciclo criado, com vigência
ativa no período filtrado, mas sem nenhuma pesquisa vinculada — logo travado, sem
nenhuma chance de gerar envio algum até que uma pesquisa seja vinculada e publicada).
`status` (seção 4) ajuda a diferenciar esse caso de "vinculado mas ainda em rascunho".

## 8. Frontend

- `frontend/src/pages/AnaliseEnviosPage/AnaliseEnviosPage.tsx` — nova página, mesma
  estrutura de filtro (período + `SeletorCiclo`) de `AnaliseVisaoGeralPage`/
  `AnaliseAvaliacoesPage`, tabela MUI (`TableContainer`/`Table`) em vez de cards de
  métrica — mais próxima do formato de `AnaliseResultadosPerguntaPage`. Segue a regra de
  altura máxima + rolagem interna para listas de tamanho variável (convenção de frontend
  do CLAUDE.md) já que o número de ciclos no período pode crescer.
- Colunas da tabela, na ordem: Nome do ciclo, Tipo de pesquisa (badge/tag —
  "Avaliação 360"/"Clima Organizacional"/"Sem pesquisa vinculada" quando `null`), Status
  (tag rascunho/ativo/encerrado), Vigência (`dataInicio` – `dataFim`), Total, Pendente,
  Respondido, % Respondido (barra de progresso, reaproveitando o mesmo padrão visual já
  usado no card do Ciclo, se houver um componente compartilhado — senão, texto simples
  "NN%").
- `frontend/src/services/analiseService.ts` — nova função `buscarEnviosAnalise(params)`
  chamando `GET /api/analise/envios`, mesmo padrão de `buscarVisaoGeralAnalise`.
- `frontend/src/types/analise.ts` — novos tipos `LinhaEnvioAnalise`/`EnviosAnalise`,
  espelhando exatamente a seção 4.
- Rota: `/analise/envios`, registrada em `frontend/src/App.tsx` junto das outras rotas de
  `/analise/*`.
- Menu lateral: `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`, novo item
  em `submenus[0]` (grupo **Quantitativa**, não Qualitativa) — decisão registrada porque
  a tela é 100% numérica/contagem (sem nenhum texto de resposta aberta), mesmo critério
  que já separa Visão Geral/Ranking/Resultados por Pergunta (Quantitativa) de
  Avaliações/Nuvem de Palavras (Qualitativa, ambas centradas em `texto_aberto`). Rótulo
  proposto: **"Envios"**. Sem entrada em `Qualitativa`. Nenhum atalho é adicionado ao
  card do Ciclo (`CicloDetalhePage`/listagem de ciclos) — decisão 5 do pedido, já
  fechada.
- Sem nenhuma ação/botão na tela (decisão 2 do pedido) — nem link para
  `CicloDetalhePage` a partir da linha, para não confundir com um atalho implícito
  (decisão 5). Se o usuário quiser navegar até o detalhe de um ciclo específico, usa o
  filtro `cicloId` desta tela só para consulta, e vai ao menu de Ciclos separadamente.

## 9. Fora de escopo

- Qualquer ação (copiar link, marcar como enviado, expirar convite, reenviar/lembrete) —
  permanece exclusiva de `CicloDetalhePage`.
- Lista pessoa a pessoa (quem já respondeu, quem está pendente) — já existe em
  `CicloDetalhePage`; esta tela nunca desce a esse nível.
- Atalho no card do Ciclo.
- Exportação (CSV/PDF) — não mencionada no pedido, não incluir nesta rodada.
- Qualquer alteração em `ciclos-avaliacao.service.ts`/`listar()` — decisão da seção 3.2
  é explicitamente não tocar nesse arquivo.
- Paginação — mesmo padrão das telas irmãs (que não paginam, e usam rolagem interna com
  altura máxima); não introduzir paginação de servidor nesta rodada.

## 10. Riscos e guard rails a preservar na implementação

- Nunca projetar `avaliador_id`/`avaliado_id`/`colaborador_id`/`tipo_relacionamento` em
  `calcularProgressoEmLotePorCiclo` nem em nenhuma query nova desta feature — só
  `COUNT`/`GROUP BY ciclo_id` (ver seção 6).
- `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha de
  `buscarEnviosAnalise`, sem bypass — mesmo padrão de todo outro endpoint de `analise/`.
- Rota `GET /api/analise/envios` só dentro de `router.use(autenticar)` em
  `analise.module.ts` — nunca pública.
- `calcularProgressoEmLotePorCiclo` deve produzir exatamente os mesmos números que
  `calcularProgressoCiclo`/a versão em lote de `listar()` produziriam para o mesmo ciclo
  (mesma fórmula de `percentual`, mesmo critério de "concluído") — qualquer divergência é
  bug, não uma escolha de produto; `test-engineer` deve comparar contra
  `GET /api/ciclos/:id` (campo `progresso`) para os mesmos ciclos como parte da suíte,
  além dos testes de papel e de filtro de período/cicloId.
