# Spec: Módulo Análise — tela "Nuvem de Palavras" (visualização LISTA, v1)

## 1. Resumo do pedido

Implementar a quarta tela do módulo Análise (`apps/api`/`apps/web` na
nomenclatura dos agentes = `backend/`/`frontend/` neste repo), chamada
"Nuvem de Palavras". "Visão Geral" (`.claude/tasks/analise-visao-geral/`),
"Avaliações" (`.claude/tasks/analise-avaliacoes/`) e "Ranking" (`.claude/
tasks/analise-ranking/`, ainda sem code review/testes concluídos — ver nota
no CLAUDE.md) já estão implementadas e servem de precedente de padrão de
código.

Esta rodada cobre **apenas a visualização em LISTA** (palavra + frequência,
ordenada por frequência decrescente). **Bolhas** e **modo TV Dash** são
visualizações futuras, explicitamente fora de escopo (seção 8) — mas o
contrato de API desta rodada é desenhado para que essas visualizações
futuras possam reaproveitar o mesmo endpoint, já que a lista de
palavras+frequência é a base de dado comum às 3 visualizações; muda só a
apresentação (ver seção 7).

A Nuvem de Palavras processa o mesmo conjunto de textos `texto_aberto` já
usado pela tela "Avaliações" — mas a saída é **frequência agregada de
palavras**, nunca o texto original exibido. Filtrável por período
(`de`/`ate`, obrigatório) e opcionalmente por ciclo (`cicloId`), mesmo
padrão de filtro já usado por "Avaliações" (seção 3.1). Métricas
complementares (envios, respostas, tempo médio) reaproveitam os mesmos
números já calculados por "Visão Geral" — sem recalcular (seção 3.4).

## 2. REGRA DE ANONIMIZAÇÃO (a mais sensível do projeto — seção dedicada, mesmo nível de destaque de Avaliações/Ranking)

> Mesmo agregando em frequência de palavras — o que já reduz o risco de
> identificação em comparação a texto corrido —, a regra de gate se aplica
> **integralmente, sem nenhuma exceção "já que é só contagem de palavras"**.
> RH/admin (únicos papéis com acesso a esta tela) **não têm bypass** do
> limiar `minimo_respostas_pares`, mesma regra de qualquer outro consumidor
> do projeto — mesmo sendo os únicos com acesso. Não existe modo
> "transparência total" para ninguém, em nenhuma circunstância. Mesmo
> princípio já registrado com destaque na seção 2 de `analise-avaliacoes/
> spec.md` e na seção 3 de `analise-ranking/spec.md` — repetido aqui porque
> cada feature nova é um ponto de risco independente de reintrodução do
> bypass por inferência.

- **Fonte de dado**: o mesmo conjunto de textos `texto_aberto` já usado por
  "Avaliações" (`itens_resposta.valor ->> 'texto'` para avaliação 360,
  `itens_resposta_clima.valor ->> 'texto'` para clima) — mas a Nuvem de
  Palavras **nunca expõe o texto original**, só a frequência de palavras
  extraídas dele.
- **Gate idêntico ao já implementado em `analise-avaliacoes.service.ts`**,
  reaproveitado via `calcularGateParesSubordinado`/lógica equivalente de
  clima em `analise-comum.ts`, sem reimplementar do zero:
  - Relações 1:1 (`autoavaliacao`, `gestor`, `externo`) — sempre liberadas,
    sem gate (não há terceiro a proteger).
  - Relações `pares`/`subordinado` — só entram no processamento de palavras
    se `COUNT(DISTINCT avaliador_id)` para aquele avaliado + ciclo + tipo
    atingir `ciclos_avaliacao.minimo_respostas_pares` (mesma granularidade
    de "Avaliações", seção 3.3 daquela spec).
  - `clima_geral` — só entra se o ciclo inteiro atingir o mínimo (mesma
    granularidade de "Avaliações", seção 3.4 daquela spec) — sem nenhuma
    atribuição, já que `respostas_clima`/`itens_resposta_clima` não têm FK
    de identidade.
- **Nunca buscar-depois-filtrar**: para grupos bloqueados (abaixo do
  mínimo), o texto **nem é buscado no banco** para efeito de contagem de
  palavras — mesmo princípio já implementado em `buscarTextosParesSubordinado`/
  `buscarTextosClima` de `analise-avaliacoes.service.ts`, que só consultam
  texto para os grupos já identificados como liberados pelo gate. A Nuvem de
  Palavras reaproveita essa mesma sequência (gate primeiro, busca de texto
  só para os grupos liberados, tokenização só sobre o texto já liberado).
- **A saída é sempre a lista de palavras já agregada e embaralhada em
  origem** (não há conceito de "grupo bloqueado" na resposta da API desta
  feature, ao contrário de "Avaliações") — como a contagem de palavras já
  funde todos os grupos liberados numa única lista (decisão de produto,
  seção 3.3), não existe um item de payload por avaliado/grupo que precise
  sinalizar bloqueio individualmente. O bloqueio acontece **antes** da
  agregação, nunca é visível no payload final. Se **nenhum** grupo estiver
  liberado no período/ciclo selecionado (situação rara, já que
  `autoavaliacao`/`gestor`/`externo` não têm gate), a lista retorna vazia
  (`palavras: []`) — não é um estado de "bloqueio" per se, é ausência de
  dado elegível, mesma distinção já registrada na seção 2 da spec de
  Ranking (ausência de dado vs. dado bloqueado por gate) aplicada aqui: o
  endpoint não distingue os dois motivos no payload, ambos resultam em lista
  vazia.
- Guard rail geral, reforçado com comentário no código do service (mesmo
  padrão já usado em `calcularProgressoCiclo`/`buscarVisaoGeral`/
  `buscarAvaliacoes`): nenhuma query desta feature seleciona `avaliador_id`
  (nem qualquer coluna que identifique o avaliador/participante) em nenhuma
  condição fora do `COUNT(DISTINCT avaliador_id)` do gate — e o texto/palavra
  processado nunca carrega identidade anexada no resultado final.

## 3. Decisões de produto fechadas (não reabrir)

Esta spec foi precedida por uma rodada de esclarecimento já concluída nesta
sessão. Todas as decisões abaixo estão fechadas — não devem ser
reperguntadas.

### 3.1 Escopo desta rodada — apenas visualização LISTA

Palavra + frequência, ordenada por frequência decrescente. **Bolhas** e
**modo TV Dash** são visualizações futuras, fora de escopo (seção 8) — mas o
contrato de API (seção 7) é desenhado pensando em reaproveitamento por elas.

### 3.2 Acesso — sem atalho no card do Ciclo, só menu lateral

Mesmo padrão de "Ranking" (não de "Visão Geral"/"Avaliações", que têm deep
link a partir do card): **sem botão novo** em `CiclosListPage.tsx`. Acessível
só pelo menu lateral, grupo "Análises" → submenu **"Qualitativa"** (mesmo
submenu de "Avaliações" — `PainelAdminLayout.tsx`, `GRUPOS`, chave
`qualitativa`, já contém `{ label: 'Avaliações', to: '/analise/avaliacoes'
}`; "Nuvem de Palavras" entra como segunda opção desse mesmo array,
`opcoes`), e não em "Quantitativa" — coerente com o racional já registrado
na spec de "Visão Geral" (seção "Perguntas em aberto" nº 5: "Qualitativa"
fica mais natural para telas que lidam com texto aberto). Mesmo sem atalho
de card, a própria tela aceita `cicloId` como filtro opcional (seção 3.3).

### 3.3 Filtros — período obrigatório + `cicloId` opcional (padrão "Avaliações", não "Ranking")

**Decisão confirmada pelo usuário**: a Nuvem de Palavras segue o mesmo
padrão de filtro de "Avaliações" — `de`/`ate` (período, obrigatório) +
`cicloId` (opcional). Diferente de "Ranking", que exige `cicloId` único
obrigatório sem período. Isso permite agregar palavras de **múltiplos
ciclos** dentro do período selecionado, não só de um ciclo isolado — mesma
semântica de universo de ciclos já usada por "Avaliações"
(`buscarUniversoCiclos`/`classificarPorTipo` de `analise-comum.ts`).

### 3.4 Métricas complementares — envios, respostas e tempo médio, reaproveitados de "Visão Geral" (não recalculados)

A tela exibe, além da lista de palavras, as mesmas métricas complementares
já calculadas por "Visão Geral" para o mesmo período/ciclo: total de
envios/participações do universo (`totalGeral` — soma de
`contarTotal360`/`contarTotalParticipantesClima` já existentes em
`analise.service.ts`), total de respostas (`totalRespostas`) e tempo médio
de resposta (`tempoMedioResposta`). **Não recalcular** essa lógica —
reaproveitar as funções já existentes (extraídas para reaproveitamento se
ainda não estiverem em `analise-comum.ts`; ver detalhe de implementação na
seção 9, nº 1). Essas métricas são só contagens/médias globais, sem quebra
por avaliador/avaliado/tipo de relacionamento — mesmo guard rail já
documentado na seção 3 de `analise-visao-geral/spec.md`, sem relação com o
gate de pares/subordinado (que só se aplica ao processamento de texto desta
tela, seção 2).

### 3.5 Quantidade de palavras exibidas — top 50 por frequência

**Decisão confirmada pelo usuário**: a lista retorna no máximo as **50**
palavras mais frequentes (ordenadas por frequência decrescente), não a
lista completa de todas as palavras únicas encontradas. Evita lista
infinita/pouco útil para telas com muito texto acumulado.

### 3.6 Unificação — uma nuvem geral por ciclo/período, sem segmentação por pergunta

**Decisão confirmada pelo usuário**: se a mesma palavra aparece em respostas
de perguntas `texto_aberto` diferentes dentro do mesmo ciclo/período, a
contagem é **unificada numa única nuvem geral** — não segmentada por
pergunta nesta v1. Se um pedido futuro quiser segmentação por pergunta
(ex. um seletor de "qual pergunta" dentro da tela), isso é mudança de
produto que exige nova spec — não implementar por inferência.

## 4. Processamento de texto (nível de decisão — limiares exatos ficam para o planejamento-backend propor)

Extraído a partir dos mesmos textos liberados pelo gate da seção 2, antes de
qualquer contagem:

- **Normalização de case**: converter para minúsculas antes de contar (ex.
  "Feedback" e "feedback" contam como a mesma palavra).
- **Remoção de stopwords em português** (artigos, preposições, conjunções,
  pronomes comuns — ex. "de", "a", "o", "que", "para", "com" — lista exata a
  definir no planejamento-backend; recomendação: lista estática embutida no
  código, sem dependência externa nova, dado que o projeto não usa nenhuma
  lib de NLP hoje).
- **Tamanho mínimo de palavra**: um piso de caracteres (ex. 3+) para não
  poluir a lista com fragmentos/conectores curtos que escaparam do filtro de
  stopwords — valor exato a confirmar no planejamento-backend.
- Pontuação/caracteres especiais devem ser removidos/normalizados antes da
  contagem (ex. "ótimo!" e "ótimo" contam como a mesma palavra) — detalhe de
  implementação (regex de tokenização) a definir no planejamento-backend.
- Acentuação: **não** é decisão fechada nesta spec se palavras acentuadas e
  não-acentuadas devem ser normalizadas para a mesma contagem (ex. "otimo" e
  "ótimo") — registrado como pergunta em aberto (seção 9, nº 2), com
  recomendação de NÃO normalizar acentuação nesta v1 (manter a grafia
  exatamente como está no texto após lowercase, simplicidade sobre
  robustez), mas o planejamento-backend deve confirmar.
- Este processamento (tokenização, stopwords, contagem) roda inteiramente no
  **backend**, sobre os textos já liberados pelo gate — nunca no frontend,
  mesmo princípio de "nenhuma regra de negócio sensível no frontend" já
  documentado no CLAUDE.md do projeto.

## 5. Modelo de dados envolvido (leitura only — nenhuma tabela/coluna nova, nenhuma migration)

Mesmo modelo de dados já documentado na seção 4 de `analise-avaliacoes/
spec.md` — reaproveitado integralmente, sem tabela/view nova:

- **Avaliação 360**: `relacionamentos_avaliacao` (`id`, `ciclo_id`,
  `avaliador_id`, `avaliado_id`, `tipo_relacionamento`) →
  `envios_pesquisa.relacionamento_id` → `respostas.envio_id` (UNIQUE) →
  `itens_resposta.resposta_id` + `itens_resposta.pergunta_id` →
  `perguntas` (filtrar `tipo = 'texto_aberto'`). `itens_resposta.valor` é
  `jsonb`, shape `{ "texto": "..." }`.
- **Clima**: `respostas_clima` (`id`, `pesquisa_id`, `ciclo_id`,
  `respondido_em`) → `itens_resposta_clima` (`resposta_clima_id`,
  `pergunta_id`, `valor` jsonb) — sem nenhuma FK de identidade,
  estruturalmente anônima por design.
- `tipo_relacionamento` (`backend/src/common/enums.ts`, `TipoRelacionamento`):
  `'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'`.
- `ciclos_avaliacao.minimo_respostas_pares`: smallint, default 3.
  `anonimizar_respostas_pares` existe mas NÃO é lida (mesma decisão já
  fechada nas specs de "Avaliações" seção 2.1 e "Ranking" seção 3).
- Funções já existentes e reaproveitáveis sem mudança de comportamento
  (`backend/src/modules/analise/analise-comum.ts`): `buscarUniversoCiclos`,
  `classificarPorTipo`, `calcularGateParesSubordinado`, `validarDataQuery`,
  `arredondar1`.
- Nenhuma tabela nova, nenhuma coluna nova, nenhuma migration necessária —
  feature de leitura pura, mesmo padrão das 3 telas já implementadas.

## 6. Recorte backend vs frontend

### Backend (`backend/`)

- Estende o módulo já existente `backend/src/modules/analise/` (mesmo
  módulo das outras 3 telas). Recomendação de nome de arquivo (detalhe
  menor, a validar no planejamento): `analise-nuvem-palavras.service.ts`,
  seguindo o padrão de um arquivo de service por tela.
- Sem entidade própria — reaproveita entidades existentes só para leitura
  (`RelacionamentoAvaliacao`, `EnvioPesquisa`, `Resposta`, `ItemResposta`,
  `RespostaClima`, `ItemRespostaClima`, `Pergunta`, `CicloAvaliacao`), via
  `QueryBuilder`/`AppDataSource`.
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` (`analise-comum.ts`) como
  primeira linha da função de serviço exportada — sem bypass de papel para
  o gate (seção 2), mesmo padrão de `buscarVisaoGeral`/`buscarAvaliacoes`/
  `buscarRanking`.
- Sequência de cálculo, espelhando a já implementada em
  `buscarAvaliacoes`:
  1. Validar `de`/`ate` (`validarDataQuery`) e `cicloId` opcional (uuid,
     `buscarCicloOuFalhar` se informado).
  2. `buscarUniversoCiclos` + `classificarPorTipo` para separar ciclos
     `avaliacao_360`/`clima_geral` do período/filtro.
  3. Buscar textos identificados (`autoavaliacao`/`gestor`/`externo`) sem
     gate — mesma query-base de `buscarIdentificadas360`, mas selecionando
     só o texto (sem identidade do avaliador/avaliado no resultado
     retornado ao tokenizador — a identidade não é necessária para contar
     palavras, mesmo que a query de origem faça join com `Colaborador`
     para outros propósitos; aqui não há motivo para esse join).
  4. `calcularGateParesSubordinado` para decidir quais grupos
     avaliado+ciclo+tipo estão liberados; buscar texto só para os grupos
     liberados (mesmo padrão de `buscarTextosParesSubordinado`, adaptado
     para não precisar de nome de avaliado).
  5. Gate de clima por ciclo inteiro (mesmo padrão de `calcularGateClima`);
     buscar texto só para os ciclos liberados (mesmo padrão de
     `buscarTextosClima`).
  6. Concatenar todos os textos liberados (passos 3+4+5) numa única lista,
     tokenizar (seção 4), contar frequência, ordenar decrescente, cortar em
     top 50 (seção 3.5).
  7. Buscar métricas complementares (seção 3.4) reaproveitando as funções já
     existentes de `analise.service.ts` para o mesmo universo de ciclos —
     recomendação: extrair para `analise-comum.ts` se ainda não estiverem
     lá (ver seção 9, nº 1), para não importar diretamente funções privadas
     de outro arquivo de service.
- Guard rail de anonimização (seção 2) reforçado com comentário no código do
  service, mesmo padrão já existente em `calcularProgressoCiclo`/
  `buscarVisaoGeral`/`buscarAvaliacoes`/`buscarRanking`.
- Sem reembaralhamento de posição aplicável aqui (diferente de
  "Avaliações") — a lista final é sempre ordenada por frequência
  decrescente (critério objetivo, não há "posição estável entre poucos
  respondentes" a mitigar, já que o dado exposto é a palavra agregada, não
  o texto individual).

### Frontend (`frontend/`)

- Nova página `AnaliseNuvemPalavrasPage` (mesmo esqueleto de
  `AnaliseAvaliacoesPage`/`AnaliseVisaoGeralPage`: `useSearchParams`,
  `Skeleton`, `Alert`), dentro do mesmo grupo protegido de rotas
  (`RotaProtegida papeis={['admin', 'gestor_rh']}`, `App.tsx`). Rota nova,
  ex. `/analise/nuvem-palavras` (path exato a confirmar no planejamento).
- Filtro de período: reaproveitar o mesmo padrão de dois `TextField
  type="date"` do MUI já usado em "Visão Geral"/"Avaliações". Filtro de
  `cicloId`: `SeletorCiclo` já existente (`frontend/src/components/analise/
  SeletorCiclo/SeletorCiclo.tsx`), com a opção "Todos os ciclos" fazendo
  sentido aqui (diferente de "Ranking") — coerente com `cicloId` opcional
  (seção 3.3).
- Componente novo de lista (ex. `ListaFrequenciaPalavras` em
  `frontend/src/components/analise/`) — tabela/lista MUI simples com duas
  colunas (palavra, frequência), ordenada por frequência decrescente,
  reaproveitável mais tarde como base de dado para os componentes futuros
  de Bolhas/TV Dash (que consumiriam o mesmo endpoint, apenas renderizando
  diferente — não é escopo desta rodada implementar esse reaproveitamento
  de componente, só não desenhar a API de um jeito que o impeça).
- Métricas complementares (seção 3.4): reaproveitar o componente de
  "MetricaCard"/tile já criado para "Visão Geral", se existir e for
  genérico o suficiente (a confirmar no planejamento-frontend), em vez de
  duplicar UI de card de métrica.
- Menu em `PainelAdminLayout.tsx`: grupo "Análises" → submenu "Qualitativa"
  (`GRUPOS`, chave `qualitativa`, `opcoes` — hoje só `Avaliações`; "Nuvem de
  Palavras" entra como segunda opção desse array). Sem botão/atalho novo em
  `CiclosListPage.tsx` (seção 3.2).
- Nenhuma regra de tokenização/stopwords/contagem calculada no frontend —
  a lista de palavras+frequência já vem pronta e ordenada da API; a tela só
  formata/exibe (mesmo princípio já documentado no CLAUDE.md do projeto).

## 7. Contrato de API sugerido (desenhado para reaproveitamento futuro por Bolhas/TV Dash — ponto de partida, não mandato)

`GET /api/analise/nuvem-palavras?de=&ate=&cicloId=`

- `de`/`ate` (string `YYYY-MM-DD`, **obrigatórios**, mesma validação de
  "Visão Geral"/"Avaliações" via `validarDataQuery`): 422 `CAMPO_INVALIDO`
  se ausentes/mal formatados; 422 `PERIODO_INVALIDO` se `ate < de`.
- `cicloId` (uuid, **opcional**): 422 `CAMPO_INVALIDO` se mal formatado;
  404 `CICLO_NAO_ENCONTRADO` se não existir (mesmo código já usado em
  `buscarCicloOuFalhar`).
- 200 (esboço de shape, nomes exatos a confirmar no planejamento):
  ```json
  {
    "periodo": { "de": "2026-01-01", "ate": "2026-09-10" },
    "cicloId": "uuid-ou-null",
    "palavras": [
      { "palavra": "feedback", "frequencia": 128 },
      { "palavra": "comunicação", "frequencia": 94 }
    ],
    "metricas": {
      "totalEnvios": 340,
      "totalRespostas": 268,
      "tempoMedioResposta": { "horas": 36.2, "amostras": 268 }
    }
  }
  ```
  - `palavras`: array de no máximo 50 itens (seção 3.5), **já ordenado por
    `frequencia` decrescente** pelo backend — o frontend não deve
    reordenar. Este é o shape-base pensado para reaproveitamento: uma
    visualização de Bolhas futura consumiria o mesmo array (`palavra` +
    `frequencia`) para dimensionar o tamanho de cada bolha; um modo TV Dash
    futuro consumiria a mesma lista para rotação automática — nenhuma das
    duas precisaria de um endpoint/parâmetro novo, só uma prop de
    apresentação diferente no frontend.
  - `metricas`: subconjunto dos números já calculados por "Visão Geral"
    para o mesmo universo de ciclos (seção 3.4) — nomes exatos
    (`totalEnvios` vs `totalParticipacoes` etc.) a confirmar no
    planejamento-backend, mantendo consistência com os nomes já usados em
    `VisaoGeralAnalise`.
  - Vazio (`palavras: []`) é uma resposta válida (nenhum grupo liberado
    contribuiu palavras no período/ciclo selecionado, ou todo texto
    liberado ficou abaixo do piso de tamanho mínimo de palavra) — não é
    tratado como erro nem como estado de "bloqueio" (seção 2, distinção já
    registrada).
- Nenhum campo do payload expõe `avaliador_id`, `avaliado_id`, texto
  original de resposta, nem contagem de respondentes por
  avaliado/grupo/tipo de relacionamento — conforme guard rail da seção 2.
- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira linha do
  service, sem bypass de papel para o gate (seção 2).

## 8. Fora de escopo explícito nesta rodada

- **Visualização em Bolhas** (nuvem de palavras propriamente dita, com
  tamanho de fonte/bolha proporcional à frequência) — não implementar
  nenhum componente visual de bolha nesta rodada; o contrato de API (seção
  7) já foi desenhado para que essa visualização futura reaproveite o
  mesmo endpoint sem mudança de contrato, mas a UI de bolha em si não faz
  parte desta task.
- **Modo TV Dash** (exibição em tela cheia/rotativa, tipicamente para
  telões/painéis) — não implementar nenhum layout, rota ou modo de exibição
  específico para TV nesta rodada, pela mesma razão acima.
- **Segmentação por pergunta** (seção 3.6) — a nuvem é sempre unificada
  nesta v1; um seletor de pergunta específica é mudança de produto futura,
  fora de escopo.
- **Configuração de stopwords pelo usuário** (ex. tela de administração de
  lista de palavras ignoradas) — a lista de stopwords é fixa no código
  nesta v1 (seção 4), sem UI de configuração.
- **Nenhuma tabela/coluna nova, nenhuma migration** — feature de leitura
  pura sobre dados já existentes (seção 5).

## 9. Detalhes menores de implementação a validar no planejamento (não bloqueiam, recomendação registrada para cada um)

1. **Onde vivem as funções de métricas complementares (seção 3.4)** — hoje
   `contarTotal360`/`contarTotalParticipantesClima`/
   `contarRespostas360NoPeriodo`/`contarRespostasClimaNoPeriodo`/
   `calcularTempoMedio360`/`calcularTempoMedioClima` são funções privadas
   de `analise.service.ts`. Recomendação: extrair as que forem reaproveitadas
   para `analise-comum.ts` (mesmo padrão já usado para
   `calcularGateParesSubordinado`, movida de `analise-avaliacoes.service.ts`
   para lá quando "Ranking" precisou dela) — decisão final e escopo exato
   da extração cabem ao planejamento-backend.
2. **Normalização de acentuação** (seção 4) — recomendação: não normalizar
   nesta v1 (manter grafia após lowercase), mas confirmar no
   planejamento-backend se isso gera fragmentação indesejada da mesma
   palavra em variações (ex. "otimo" escrito sem acento por alguns
   respondentes vs "ótimo" por outros) que valha a pena tratar já na v1.
3. **Lista exata de stopwords em português e piso de tamanho mínimo de
   palavra** (seção 4) — não bloqueiam a spec, mas devem ser decididos e
   documentados no arquivo de task de planejamento-backend antes da
   implementação, já que afetam diretamente a qualidade da lista exibida.
4. **Nome exato do arquivo/service e do endpoint** — recomendações já
   registradas nas seções 6 e 7, confirmação final cabe ao
   planejamento-backend.
5. **Se `metricas` deve ficar dentro do mesmo payload do endpoint de
   palavras ou é melhor reaproveitar diretamente `GET
   /api/analise/visao-geral` no frontend (duas chamadas)** — recomendação:
   um único payload combinado (seção 7), para a tela não precisar de duas
   chamadas de rede síncronas nem duplicar lógica de filtro no frontend;
   mas se o planejamento-backend julgar mais simples reaproveitar o
   endpoint de "Visão Geral" diretamente do frontend (chamando os dois
   endpoints em paralelo), isso é uma alternativa válida que não muda a
   regra de anonimização nem o contrato de `palavras`.
6. **Arredondamento de `tempoMedioResposta.horas`** — recomendação: mesmo
   padrão de `arredondar1` já usado em "Visão Geral"/"Ranking".
