# Spec: Nuvem de Palavras — visualização em Bolhas + Modo TV Dash

## 1. Resumo do pedido

Completar a tela `AnaliseNuvemPalavrasPage` (módulo Análise) com as duas
visualizações deliberadamente deixadas fora de escopo na rodada anterior
(`.claude/tasks/analise-nuvem-palavras/spec.md`, seção 8): **Bolhas**
(nuvem de palavras propriamente dita, tamanho proporcional à frequência) e
**Modo TV Dash** (exibição em tela cheia, tipografia grande, pensada para
telão/painel de escritório).

Esta rodada é **puramente frontend** (`frontend/`, chamado `apps/web` na
nomenclatura dos agentes/skills deste repo — não existe em disco). Nenhum
arquivo de `backend/` (`apps/api`) é tocado.

## 2. Confirmação obrigatória: o backend NÃO precisa mudar

Lido antes de qualquer outra coisa, conforme exigido:

- `backend/src/modules/analise/analise-nuvem-palavras.service.ts` —
  `buscarNuvemPalavras` retorna `NuvemPalavrasAnalise`:
  ```ts
  export interface PalavraFrequencia { palavra: string; frequencia: number }
  export interface NuvemPalavrasAnalise {
    periodo: { de: string; ate: string }
    cicloId: string | null
    palavras: PalavraFrequencia[]
    metricas: MetricasComplementares // { totalEnvios, totalRespostas, tempoMedioResposta: { horas, amostras } }
  }
  ```
  `palavras` já é cortado em `LIMITE_PALAVRAS = 50` e ordenado por
  `frequencia` decrescente dentro de `contarFrequencia` (`.sort((a, b) =>
  b.frequencia - a.frequencia || a.palavra.localeCompare(...))`,
  `analise-nuvem-palavras.service.ts` linhas 162-166) — exatamente o dado
  necessário para dimensionar bolhas (tamanho ∝ `frequencia`) e para o Modo
  TV (mesma lista, só muda a apresentação).
- `backend/src/modules/analise/analise.controller.ts` /
  `analise.module.ts` — a rota `GET /api/analise/nuvem-palavras` não tem
  nenhum parâmetro de "modo de visualização"; o controller só repassa
  `de`/`ate`/`cicloId` ao service. Nenhuma mudança de contrato é necessária
  para as duas visualizações novas, porque ambas consomem o mesmo array.
- `frontend/src/types/analise.ts` (linhas 160-187) já documenta isso
  explicitamente no comentário do bloco "Nuvem de Palavras": `palavras` "já
  vem ordenada por `frequencia` decrescente (top 50) pelo backend — NUNCA
  reordenar/filtrar no frontend".
- `frontend/src/services/analiseService.ts` (`buscarNuvemPalavrasAnalise`)
  já transporta esse payload sem transformação.
- `frontend/src/pages/AnaliseNuvemPalavrasPage/AnaliseNuvemPalavrasPage.tsx`
  já busca e guarda `dados: NuvemPalavrasAnalise` em estado, hoje renderizado
  só via `ListaFrequenciaPalavras` (`components/analise/ListaFrequenciaPalavras/`)
  e dois `MetricaCard` (`components/analise/MetricaCard/`).
- Isso confirma, com evidência de campo real, o que a spec anterior já
  antecipava na sua seção 7: *"uma visualização de Bolhas futura consumiria
  o mesmo array (`palavra` + `frequencia`) para dimensionar o tamanho de
  cada bolha; um modo TV Dash futuro consumiria a mesma lista (...) —
  nenhuma das duas precisaria de um endpoint/parâmetro novo, só uma prop de
  apresentação diferente no frontend"*.

**Conclusão**: `planejamento-backend` não é acionado nesta rodada. Não foi
encontrada nenhuma necessidade de dado genuinamente nova — nem para Bolhas
(usa `palavra`+`frequencia`, já existentes) nem para o Modo TV (usa o mesmo
array + `metricas`, já existentes, sem nenhum campo adicional de
apresentação exigido do backend, já que tamanho/cor/layout são cálculo de
apresentação local no frontend).

## 3. Decisões já fechadas pelo usuário (registradas aqui, não reabrir)

1. **Biblioteca nova permitida** para as Bolhas — exceção deliberada ao
   padrão de evitar dependências novas, por qualidade visual. Escolha e
   justificativa na seção 5.
2. **Modo TV Dash é um botão "Modo TV" na própria `AnaliseNuvemPalavrasPage`**,
   não uma rota/URL separada. Usa a Fullscreen API nativa
   (`requestFullscreen`/`exitFullscreen`), ocultando menu lateral e
   navegação enquanto ativo. Precisa de saída clara (botão visível e/ou
   Esc, já suportado nativamente pelo navegador).
3. **Sem auto-atualização**: o Modo TV NÃO refaz fetch em segundo plano.
   Nada de `setInterval`/polling. Dados só mudam com recarga manual da
   página (F5) ou reaplicação manual do filtro.

## 4. Regra de negócio crítica do projeto — confirmação, não mudança de escopo

> Respostas de avaliadores `pares`/`subordinado` nunca podem ser expostas
> identificadas ao avaliado — só agregadas, e só acima de
> `ciclos_avaliacao.minimo_respostas_pares`. RH/admin não têm bypass.

Esta demanda **não toca** `ciclos_avaliacao`/`relacionamentos_avaliacao`/
`envios_pesquisa`/`respostas`/`itens_resposta` em nenhum ponto — é
apresentação pura de um dado que o backend já entrega agregado (seção 2).
Confirmado, por leitura do payload real (`NuvemPalavrasAnalise`, seção 2) e
dos componentes envolvidos:

- Nem a visualização de Bolhas nem o Modo TV exibem, em nenhum momento,
  texto original de resposta (`itens_resposta.valor->>'texto'`), nome ou
  identificador de avaliador/avaliado, `cicloId` por palavra, ou qualquer
  contagem de respondentes por avaliado/grupo/tipo de relacionamento.
- O único texto exibido por palavra é a própria `palavra` (string já
  tokenizada/normalizada pelo backend) + sua `frequencia` (número
  agregado). As `metricas` exibidas em destaque no Modo TV
  (`totalEnvios`, `totalRespostas`, `tempoMedioResposta`) são as mesmas já
  expostas hoje pela Lista — contagens/médias globais, sem quebra por
  pessoa (mesmo guard rail já documentado na spec de "Visão Geral" e
  repetido na rodada anterior desta feature, seção 3.4).
- Nenhum novo dado é buscado do backend para estas duas visualizações
  (seção 2) — logo não há nenhum novo ponto de risco de
  buscar-depois-filtrar ou de vazamento de identidade a introduzir. O risco
  de anonimização desta rodada é, por construção, nulo: é reapresentação
  local de um array já 100% agregado.
- Guard rail para o desenvolvimento: nenhum componente novo (`NuvemBolhas`,
  wrapper de Modo TV) deve receber como prop nada além de
  `palavras: PalavraFrequencia[]` e `metricas: MetricasComplementaresNuvem`
  (mesmos tipos já existentes em `types/analise.ts`) — se o
  `frontend-developer` sentir necessidade de passar qualquer campo além
  desses dois, isso é sinal de que algo saiu do escopo desta spec e deve
  parar para confirmar, não assumir.

## 5. Escolha de biblioteca para Bolhas

### Contexto verificado em `frontend/package.json`

React 19.2, MUI 9.4, Tailwind 4.3, Vite 8.2, TypeScript ~6.0. **Nenhuma**
lib de d3/charting/wordcloud instalada hoje.

### Opções avaliadas

| Opção | Bundle | Manutenção | Licença | Risco React 19 |
|---|---|---|---|---|
| `react-wordcloud` | pequeno (wrapper) | **abandonada há anos** | MIT | **Alto** — peer deps declaradas em React 16/17, exigiria `overrides`/`--legacy-peer-deps` |
| `d3-cloud` + `@types/d3-cloud` | pequeno (~15-20kb, sem dependência de React) | estável/parada, mas é só algoritmo de layout (spiral packing), sem acoplamento a nenhuma versão de React | BSD-3 (mesma licença da família d3) | **Nulo** — não declara `react` como dependência/peer dependency em nenhum lugar |
| `@visx/wordcloud` | médio (traz `@visx/text`, `@visx/scale`, `@visx/group`, `d3-cloud` internamente) | ativa (monorepo `visx`, mantido pela Airbnb/comunidade, releases frequentes) | MIT | Baixo-médio — historicamente declara peer dep ampla (`react: >=16`), mas precisa confirmação da versão publicada exata no momento da instalação |
| Layout próprio (grid/flow, sem lib) | zero | N/A (código próprio) | N/A | Nulo |

### Recomendação primária: `d3-cloud` + `@types/d3-cloud`

Justificativa:

- **Zero dependência de React**: `d3-cloud` é puramente um algoritmo de
  posicionamento (recebe uma lista `{ text, size }` e devolve `{ x, y,
  rotate, size }` por palavra, testando colisão via *quadtree* interno);
  quem renderiza é código nosso (SVG `<text>` por palavra). Por não
  declarar `react` em `peerDependencies`, não há nenhum risco de conflito
  de peer-dep com React 19 — o mesmo tipo de risco que descartou
  `react-wordcloud` simplesmente não existe aqui.
- **Mesmo algoritmo por baixo dos panos** das alternativas React-first —
  tanto `react-wordcloud` quanto `@visx/wordcloud` usam `d3-cloud`
  internamente para o posicionamento; ao consumir `d3-cloud` diretamente,
  obtemos a mesma qualidade de layout (evita sobreposição, empacota em
  espiral) sem herdar o risco de peer-dep do wrapper.
- **Bundle menor**: sem as sub-dependências extras do `visx`
  (`@visx/text`/`@visx/scale`/`@visx/group`), que embora individualmente
  pequenas, somam mais peso do que precisamos para este caso de uso único
  (uma nuvem simples, não um dashboard de gráficos).
- **Licença permissiva** (BSD-3, compatível com o restante do projeto).
- Custo assumido: exige escrever um componente wrapper próprio
  (`NuvemBolhas`) que chama `d3.layout.cloud()` e renderiza o resultado em
  SVG — mais código do que usar um componente pronto, mas é código simples
  e sob nosso controle total (facilita o requisito de responsividade da
  seção 6, item 2).

**A verificar no momento da instalação** (não posso confirmar sem acesso à
internet):
- Versão mais recente publicada de `d3-cloud` no npm (última conhecida por
  mim é `1.2.x`; confirmar se há versão mais nova).
- Se `@types/d3-cloud` existe e está com versão compatível com a de
  `d3-cloud` instalada (histórico: `@types/d3-cloud` cobre a API de
  `d3-cloud@1.x`, que é a única major já publicada até onde tenho
  conhecimento).
- Compatibilidade de ESM com Vite 8 (pacotes `d3-*` modernos são ESM-first;
  `d3-cloud` é um pacote antigo — confirmar se o build do Vite consome sem
  necessidade de shim/`optimizeDeps` extra).

### Alternativa de fallback nº 1: `@visx/wordcloud`

Se `d3-cloud` apresentar qualquer atrito de build (ex. problema de
interop CJS/ESM com Vite que não valha a pena depurar), `@visx/wordcloud`
é a alternativa recomendada: componente React pronto (`<Wordcloud
words={[{ text, value }]} />`), mantido ativamente, TypeScript nativo. Meu
conhecimento (corte jan/2026) não confirma se a versão publicada mais
recente já declara suporte explícito a `react: 19` em `peerDependencies` —
**verificar isso no momento da instalação**; se exigir `--legacy-peer-deps`
mesmo sendo ativamente mantida, isso é um sinal amarelo (não um bloqueio
automático, diferente de `react-wordcloud`, que combina abandono +
peer-dep desatualizada) a reportar antes de prosseguir.

### Alternativa de fallback nº 2: layout próprio sem biblioteca

Se **ambas** as opções acima falharem na instalação (conflito de peer-dep
que só se resolve com flags agressivas, ou problema de build não
contornável), um layout de "tag cloud" simples em CSS/flexbox (sem
empacotamento em espiral, palavras fluindo em linhas, tamanho de fonte
proporcional à frequência) é um fallback legítimo — **mas precisa ser
justificado explicitamente contra a permissão de instalar biblioteca dada
pelo usuário** (registrar no `task-frontend.md`/PR o motivo técnico
específico de as duas opções acima terem falhado, não assumir esse caminho
por preferência). Esse layout continua atendendo ao requisito funcional
central (tamanho ∝ frequência), só abre mão da estética de empacotamento
compacto/espiral que dá o efeito visual clássico de "nuvem de palavras".

## 6. As duas perguntas obrigatórias — respondidas com justificativa

### 6.1 Paleta de cores das palavras nas Bolhas

**Decisão recomendada: escala de intensidade sobre UM único matiz
(`primary.main`), não alternância entre primary/secondary/info.**

Justificativa, olhando o precedente já implementado:

- `ListaFrequenciaPalavras` (`components/analise/ListaFrequenciaPalavras/`)
  já usa **uma única cor fixa** (`bgcolor: 'primary.main'`) para a barra de
  destaque de toda palavra, variando só a **largura** (∝ `frequencia`) —
  não há nenhuma alternância categórica de cor por linha. Cor não é usada
  ali para carregar informação por si, só para dar destaque visual
  consistente; o dado (frequência) é comunicado por tamanho.
- `MetricaCard` também não usa cor para codificar valor — tipografia/peso
  fazem esse papel.
- Alternar `primary`/`secondary`/`info` por palavra (uma paleta de 3 cores
  não relacionadas entre si) sugeriria visualmente uma **categorização**
  que não existe no dado (palavras não pertencem a grupos/categorias — é
  uma lista plana de frequência). Isso quebraria a leitura e destoaria do
  padrão de cor já estabelecido nas outras 3 telas de Análise, onde cor
  nunca é usada para distinguir itens de uma mesma lista homogênea.
- **Recomendação concreta**: usar `alpha(theme.palette.primary.main, i)`
  (helper `alpha`, já importado e em uso em `frontend/src/styles/theme.ts`
  para variantes de Chip/Alert), onde `i` é um fator de opacidade/força
  mapeado da frequência relativa da palavra (ex. piso ~0.45 para a menos
  frequente do array recebido até `1.0` para a mais frequente,
  reaproveitando o mesmo padrão de `frequenciaMaxima =
  Math.max(...palavras.map(...))` já usado em `ListaFrequenciaPalavras`).
  Isso faz tamanho E intensidade de cor reforçarem o mesmo sinal
  (frequência), em vez de cor carregar um sinal concorrente/sem sentido.
  Convenção do projeto (MUI vence Tailwind em conflito de estilo) é
  respeitada: a cor vem de `theme.palette` via `sx`/JS (`alpha(...)`),
  nunca de classe Tailwind aplicada sobre um componente MUI.

### 6.2 Redimensionamento/responsividade ao entrar em tela cheia

Com `d3-cloud` (recomendação primária, seção 5), o layout é calculado uma
vez para um `width`/`height` fixos passados na chamada de
`d3.layout.cloud().size([width, height])` — ele **não** recalcula sozinho
quando o container muda de tamanho (isso vale igualmente para
`@visx/wordcloud`, que internamente também depende de `width`/`height`
fixos por render). Entrar/sair do Modo TV muda drasticamente o espaço
disponível (de um card dentro do layout normal para a tela inteira), então
sem tratamento a nuvem ficaria com o layout "antigo" (calculado para um
espaço pequeno) esticado/cortado dentro do novo espaço grande.

**Abordagem recomendada — combinar duas fontes de sinal, não uma só**:

1. **`ResizeObserver`** no elemento contêiner da nuvem (`ref` no `div`/`svg`
   pai) — é a fonte de verdade para as dimensões reais em pixels, cobre
   tanto a transição de Modo TV quanto um resize de janela comum fora do
   Modo TV. Debounce leve (150-250ms) para não recalcular o layout a cada
   frame durante a animação de transição do navegador para tela cheia.
2. **Listener de `fullscreenchange`** (`document.addEventListener`) — usado
   não para pegar dimensão (o `ResizeObserver` já faz isso), mas como
   **sinal semântico de entrada/saída do Modo TV**, necessário de qualquer
   forma para sincronizar o estado React do botão "Modo TV" com saídas que
   não passam pelo nosso `onClick` (usuário aperta Esc nativamente) — sem
   esse listener, o botão ficaria dizendo "Sair do Modo TV" mesmo já fora
   da tela cheia.
3. **Remount controlado via `key`**: em vez de tentar fazer o `d3-cloud`
   "atualizar" posições incrementalmente (o algoritmo de empacotamento em
   espiral não foi pensado para isso e pode produzir artefatos), recalcular
   o layout do zero e remontar o componente `NuvemBolhas` com uma `key`
   derivada das dimensões atuais (ex. `` `${largura}x${altura}` ``,
   arredondadas para o múltiplo de 10px mais próximo para não gerar
   remounts a cada pixel) sempre que o `ResizeObserver` reportar uma
   mudança de dimensão acima de um limiar pequeno (ex. >5%). Isso garante
   um layout limpo a cada mudança relevante de tamanho, ao custo de um
   recálculo (barato — no máximo 50 palavras) em vez de tentar preservar
   posições antigas.

Esse par `ResizeObserver` + `fullscreenchange` (nenhum dos dois sozinho é
suficiente: `fullscreenchange` não dá pixels exatos de forma confiável em
todos os navegadores no mesmo tick, `ResizeObserver` sozinho não avisa
quando sincronizar o estado do botão) é a combinação recomendada.

## 7. Escopo funcional

### Parte A — Bolhas

- Novo componente `frontend/src/components/analise/NuvemBolhas/NuvemBolhas.tsx`.
- Props: `palavras: PalavraFrequencia[]` (mesmo array já recebido pela
  página, tipo já existente em `types/analise.ts`) — **sem** nova chamada
  de API, sem reordenar/filtrar/agrupar no frontend (mesmo guard rail já
  documentado no comentário de `ListaFrequenciaPalavras`).
- Cálculo de apresentação **local, só neste componente**: mapear
  `frequencia` → tamanho de fonte/bolha via escala (ex. linear ou
  `sqrt` — `sqrt` tende a produzir menos distorção visual entre extremos de
  frequência muito díspares; decisão de detalhe fina a validar durante a
  implementação, não bloqueia a spec) usando `frequenciaMaxima`/mínima do
  próprio array recebido, mesmo princípio já usado por
  `ListaFrequenciaPalavras` para a largura da barra (seção 6.1) — e cor via
  `alpha(theme.palette.primary.main, i)` (seção 6.1).
- Alternador de visualização **na tela**: `Tabs`/`ToggleButtonGroup` do
  MUI (ex. "Lista" / "Bolhas") em `AnaliseNuvemPalavrasPage`. A Lista
  (`ListaFrequenciaPalavras`) continua disponível — **não é substituída**,
  é uma segunda opção lado a lado.
- Estado da UI (`'lista' | 'bolhas'`) é local à página (`useState`), sem
  necessidade de refletir em query param (`searchParams`) — decisão de
  detalhe menor a confirmar durante a implementação (recomendação:
  não persistir na URL nesta rodada, mesmo padrão simples de outros toggles
  já existentes na tela, ex. filtro de ciclo é o único estado hoje
  refletido em `searchParams`).
- Container com altura máxima e overflow contido (mesma convenção do
  projeto para listas de tamanho variável, CLAUDE.md) — a nuvem de bolhas
  ocupa uma área fixa (ex. mesma altura de `560px` já usada em
  `ListaFrequenciaPalavras`, `sx={{ maxHeight: 560 }}`) fora do Modo TV;
  dentro do Modo TV, ocupa a tela inteira (seção 7, Parte B).

### Parte B — Modo TV Dash

- Botão "Modo TV" na página (`AnaliseNuvemPalavrasPage`), próximo ao
  cabeçalho/alternador de visualização.
- Ao clicar: chama `elementoContainer.requestFullscreen()` em um `div`
  wrapper dedicado que envolve **só** o conteúdo de resultado (métricas +
  visualização selecionada) — **não** `document.documentElement`. Pedir
  fullscreen num elemento específico é o mecanismo padrão da própria
  Fullscreen API para exibir apenas aquele elemento e seus descendentes em
  tela cheia; como o menu lateral/navegação (`PainelAdminLayout`) fica fora
  desse `div`, ele é ocultado automaticamente pelo navegador, sem precisar
  de nenhuma lógica extra de "esconder sidebar" via estado/CSS condicional.
  **Detalhe a confirmar no planejamento-frontend**: qual exatamente é o
  `div` alvo (recomendação: um wrapper novo dentro da própria página,
  contendo o bloco de métricas + a visualização ativa, para que tudo que
  aparece no Modo TV seja controlado por esse único elemento).
- Dentro do Modo TV: exibe a visualização selecionada (Lista ou Bolhas —
  recomendação: forçar Bolhas como default ao entrar no Modo TV, já que é
  a visualização pensada para leitura a distância; mas manter o alternador
  Lista/Bolhas disponível também dentro do Modo TV, sem reabrir essa
  decisão como bloqueio de produto) em tipografia/tamanho ampliados.
- **Métricas complementares em destaque visual** (`totalEnvios`,
  `totalRespostas`, `tempoMedioResposta`) também aparecem no Modo TV, não
  só a nuvem — reaproveitando `MetricaCard` já existente, ajustado via
  `sx`/variante de tamanho maior (ou um novo componente de exibição maior
  se `MetricaCard` não comportar bem o ajuste de escala — detalhe a
  decidir no planejamento-frontend).
- Botão de saída visível dentro do Modo TV (chama `document.exitFullscreen()`)
  + Esc nativo do navegador já funciona sem código adicional — mas o
  listener de `fullscreenchange` (seção 6.2) é obrigatório para sincronizar
  o estado do botão/UI quando a saída ocorre via Esc (fora do nosso
  `onClick`).
- **Zero chamadas de rede novas** enquanto em tela cheia — nenhum
  `useEffect` de refetch condicionado ao estado de Modo TV, nenhum
  `setInterval`/polling (decisão fechada, seção 3, item 3). Os dados
  exibidos no Modo TV são exatamente os já carregados em `dados` no estado
  da página no momento em que o botão foi clicado.

## 8. Recorte técnico (só frontend)

Arquivos/diretórios previstos a criar ou tocar (confirmação final de nomes
exatos cabe ao `planejamento-frontend`, não a esta spec):

- Novo: `frontend/src/components/analise/NuvemBolhas/NuvemBolhas.tsx`
  (+ teste, se o pipeline chegar até `test-engineer`).
- Novo (possível): componente/hook de suporte a fullscreen + resize (ex.
  `frontend/src/hooks/useFullscreen.ts` ou lógica inline na página —
  decisão de organização de código cabe ao planejamento-frontend).
- Editado: `frontend/src/pages/AnaliseNuvemPalavrasPage/AnaliseNuvemPalavrasPage.tsx`
  — alternador Lista/Bolhas, botão Modo TV, wrapper de fullscreen.
- Editado (possível): `frontend/src/components/analise/MetricaCard/MetricaCard.tsx`
  — só se precisar de uma variante de tamanho maior para o Modo TV; caso
  contrário, um componente novo dedicado ao Modo TV é preferível a
  sobrecarregar o componente existente com uma prop de variante — decisão
  final cabe ao planejamento-frontend.
- `frontend/package.json` — nova dependência (`d3-cloud` + `@types/d3-cloud`,
  seção 5) e eventual dependência de fallback.
- **Nenhum arquivo de `backend/` é tocado** (seção 2).
- **Nenhuma rota nova** em `App.tsx` (decisão fechada, seção 3, item 2 —
  Modo TV não é URL separada).
- Menu (`PainelAdminLayout.tsx`) **não muda** — a entrada "Nuvem de
  Palavras" já existe (rodada anterior); esta rodada só adiciona
  funcionalidade dentro da página já roteada.

## 9. Fora de escopo explícito nesta rodada

- Qualquer mudança de backend / novo endpoint / mudança de contrato de
  `GET /api/analise/nuvem-palavras` (seção 2).
- Rotação automática de palavras, slideshow ou qualquer troca automática de
  conteúdo dentro do Modo TV.
- Polling ou refetch em background no Modo TV (decisão fechada, seção 3).
- Rota/URL dedicada para o Modo TV (decisão fechada, seção 3).
- Segmentação por pergunta e configuração de stopwords pelo usuário — já
  fora de escopo desde a rodada anterior
  (`.claude/tasks/analise-nuvem-palavras/spec.md`, seção 8), não reaberto
  aqui.
- Suporte a navegadores sem Fullscreen API (ex. certas versões de
  iOS Safari têm suporte parcial/limitado à Fullscreen API padrão) — não é
  bloqueio desta spec, mas deve ser tratado com uma degradação graciosa
  simples (ex. esconder o botão "Modo TV" ou mostrar mensagem, se
  `document.fullscreenEnabled === false`) a cargo do
  `planejamento-frontend`/`frontend-developer`, não uma reformulação de
  produto.

## 10. Perguntas em aberto (não bloqueiam, registradas com recomendação)

1. **Escala de mapeamento frequência → tamanho** (linear vs. `sqrt` vs.
   outra) — recomendação registrada na seção 7 (Parte A): `sqrt` para
   suavizar extremos, mas é detalhe de ajuste fino a validar visualmente
   durante a implementação, não uma decisão de produto a fechar aqui.
2. **Default de visualização ao entrar no Modo TV** (Bolhas vs. manter a
   última selecionada) — recomendação registrada na seção 7 (Parte B):
   forçar Bolhas por ser a visualização pensada para leitura a distância;
   se o usuário preferir manter a última selecionada, é uma inversão de
   detalhe de UX, não motivo para nova spec.
3. **Se `MetricaCard` comporta uma variante "grande" via prop/`sx` ou se
   merece um componente irmão dedicado ao Modo TV** — registrado como
   decisão de organização de código a cargo do planejamento-frontend
   (seção 8), sem impacto de produto/dado.
