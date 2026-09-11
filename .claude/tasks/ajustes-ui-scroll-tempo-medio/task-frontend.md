# Task: Ajustes de UI — scroll nas listas do detalhe do ciclo + tempo médio legível

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` neste repo). Não toca
`backend/`. Dois ajustes pontuais e bem delimitados, pedido já é a especificação
completa — sem etapa de `spec`. Sem etapa de testes automatizados: `frontend/package.json`
não tem test runner configurado (scripts: `dev`/`build`/`lint`/`preview` apenas).

## Descoberta importante (verificada antes deste plano — leia antes de implementar)

`frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` tem **quatro** listas em
`TableContainer`, não duas soltas. Três delas **já têm scroll interno implementado**
(`sx={{ maxHeight: 440, overflowY: 'auto' }}` no `TableContainer` + `stickyHeader` no
`Table`) — só uma está faltando:

| Seção | Linhas aprox. | Estado atual |
|---|---|---|
| "Participantes" (colaboradores incluídos no ciclo) | `TableContainer` ~581, `Table` ~582 | **SEM scroll** — falta `sx`/`stickyHeader` |
| "Relacionamentos gerados" (avaliação_360) | `TableContainer` ~756, `Table` ~757 | já tem `maxHeight: 440` + `stickyHeader` |
| "Envios" (avaliação_360) | `TableContainer` ~817, `Table` ~818 | já tem `maxHeight: 440` + `stickyHeader` |
| "Participantes e envios" (clima_geral) | `TableContainer` ~1053, `Table` ~1054 | já tem `maxHeight: 440` + `stickyHeader` |

Ou seja: o único gap real é a tabela "Participantes" — as outras três descritas no pedido
do usuário como "listagem de envios" e parte de "relacionamentos gerados" já seguem o
padrão desejado. Não duplique `sx`/`stickyHeader` nas três que já têm; apenas confirme
que ainda estão assim no momento da implementação (o arquivo pode ter mudado entre o
levantamento e a implementação) e alinhe a que falta ao mesmo padrão.

`Table`, `TableContainer`, `TableHead`, `TableBody`, `TableRow`, `TableCell`, `Paper` já
estão importados de `@mui/material` no topo do arquivo — nenhum import novo necessário
para a Parte 1.

## Plano — Frontend

### 1. frontend-developer — ✅ concluído

**Resumo da implementação**

- **Parte 1** (`frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`, ~linha
  581-582): adicionado `sx={{ maxHeight: 440, overflowY: 'auto' }}` ao
  `TableContainer` e `stickyHeader` ao `Table` da seção "Participantes" — mesmo
  padrão já usado nas outras três tabelas da página (Relacionamentos gerados,
  Envios, Participantes e envios clima_geral), que foram relidas e confirmadas
  sem alteração/regressão. Nenhuma outra seção da página foi tocada. Conferido
  que a tabela "Participantes" só lista colaboradores incluídos no ciclo (nome,
  e-mail, cargo, equipe) — não expõe nenhum vínculo avaliador↔avaliado nem dado
  de resposta, então a regra de anonimização de pares/subordinado não se aplica
  aqui.
- **Parte 2**: em `frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts`,
  `formatarHoras` foi substituída por `formatarTempoMedio(horas: number)`, que
  converte para minutos inteiros (`Math.round(horas * 60)`) e retorna duração
  composta abreviada e uniforme (`min`/`h`/`d`) nas três faixas (`< 1h`,
  `1h`–`1d`, `>= 1d`), omitindo partes zeradas exceto o `d` quando `>= 1d`;
  `horas <= 0` continua retornando `'—'`. Em
  `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`, os três
  call sites do card "Tempo médio de resposta" (`valor` + os dois `detalhes`)
  foram migrados para `formatarTempoMedio`, e o `tooltip` foi atualizado para
  descrever as três faixas de formato. `formatarHoras` não é mais referenciada
  em nenhum lugar do repo.
- `npm run build` e `npm run lint` (`frontend/`) rodados: build sem erros; lint
  reporta 8 erros/3 avisos, todos pré-existentes em `AnaliseAvaliacoesPage.tsx`,
  `AnaliseRankingPage.tsx`, `CicloDetalhePage.tsx` (linhas 98/242/284, fora do
  trecho tocado) e `CiclosListPage.tsx` (regra `react-hooks/set-state-in-effect`
  e `no-empty`, todas alheias a esta task) — confirmado comparando a contagem
  de erros antes/depois das edições via `git stash`.

**Parte 1 — Scroll na tabela "Participantes" de `CicloDetalhePage.tsx`**

- Arquivo: `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`.
- Seção "Participantes" (`<Typography variant="subtitle1">Participantes</Typography>`,
  por volta da linha 579, dentro do primeiro `Card`/`CardContent` da página, logo após
  `<CicloDadosForm ... />`).
- No `TableContainer` dessa seção (~linha 581, hoje
  `<TableContainer component={Paper} variant="outlined">`): adicionar
  `sx={{ maxHeight: 440, overflowY: 'auto' }}` — mesmo valor já usado nas outras três
  tabelas da página, para consistência visual dentro do mesmo arquivo.
- No `Table` dessa seção (~linha 582, hoje `<Table size="small">`): adicionar a prop
  `stickyHeader` (mesma combinação já usada nas outras três: `<Table size="small"
  stickyHeader>`).
- Não alterar `component={Paper}` nem `variant="outlined"` (mantém cantos
  arredondados/cores do tema MUI já existentes) — só adicionar as duas props acima.
- Não alterar nenhuma outra seção da página (dados do ciclo, `ProgressoCicloBar`,
  formulário de adicionar participante por pessoa/equipe, cards de pesquisa vinculada
  etc.) — escopo é estritamente o `TableContainer`/`Table` da lista "Participantes".
- Confirmar (releitura rápida do arquivo antes de editar) que as três tabelas já
  descritas como "já tem scroll" na tabela acima continuam com `maxHeight: 440` +
  `overflowY: 'auto'` + `stickyHeader`. Se por algum motivo alguma delas não estiver mais
  assim, aplicar o mesmo padrão ali também — mas não é esperado nenhum ajuste nelas.
- Resultado esperado: as quatro listas da página (Participantes, Relacionamentos
  gerados, Envios avaliação_360, Participantes e envios clima_geral) passam a ter o
  mesmo comportamento de scroll interno com cabeçalho fixo, sem crescer a página
  indefinidamente conforme a lista cresce.

**Parte 2 — Formatação legível de "Tempo médio de resposta"**

- Arquivo: `frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts`.
- `formatarHoras(horas: number)` hoje (linhas 12-16):
  ```ts
  export function formatarHoras(horas: number): string {
    if (horas <= 0) return '—'
    if (horas < 24) return `${FORMATADOR_NUMERO.format(horas)} h`
    return `${FORMATADOR_NUMERO.format(horas / 24)} d`
  }
  ```
  Confirmado: é o único formatador de tempo médio no arquivo, e
  `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` é o único
  chamador em todo `frontend/src` (3 call sites, todos no mesmo `MetricaCard` "Tempo
  médio de resposta": valor principal `dados.tempoMedioResposta.geral.horas` e os dois
  `detalhes` — `avaliacao_360.horas` e `clima_geral.horas`). Não há nenhum outro
  consumidor a preservar — pode **substituir** a função por completo em vez de manter
  as duas.
- Substituir `formatarHoras` por uma nova função `formatarTempoMedio(horas: number):
  string` (renomear é intencional — o retorno deixa de ser "X h"/"X d" e passa a ser uma
  duração composta, o nome antigo ficaria enganoso). Regras exatas:
  - `horas <= 0` → `'—'` (preservar o mesmo tratamento de valor não disponível/zero já
    existente).
  - Converter para minutos totais inteiros primeiro, arredondando:
    `const totalMinutos = Math.round(horas * 60)`. Trabalhar só com inteiros daí em
    diante (nunca formatar um float com casas decimais soltas).
  - Decompor: `dias = Math.floor(totalMinutos / 1440)`,
    `horasRestantes = Math.floor((totalMinutos % 1440) / 60)`,
    `minutosRestantes = totalMinutos % 60`.
  - **Estilo escolhido: abreviado, uniforme nas três faixas** (`min`, `h`, `d` — a opção
    "abreviado" explicitamente permitida pelo pedido, evitando misturar "dia" por
    extenso com "h"/"min" abreviado como o exemplo ilustrativo do pedido fazia — o
    próprio pedido pede para não misturar estilo entre as faixas):
    - `totalMinutos < 60` (menos de 1 hora): `"${minutosRestantes}min"` (ex.: `"42min"`).
    - `totalMinutos < 1440` (entre 1h e 1 dia): compor `h` + `min`, omitindo a parte de
      minutos só quando for exatamente zero (ex.: `"3h 20min"`, ou `"3h"` se
      `minutosRestantes === 0`).
    - `totalMinutos >= 1440` (1 dia ou mais): compor `d` + `h` + `min`, omitindo cada
      parte individualmente quando for zero, mas sempre mostrando o `d` (ex.:
      `"1d 5h 10min"`, ou `"2d 10min"` se `horasRestantes === 0`, ou `"1d"` se
      `horasRestantes === 0 && minutosRestantes === 0`).
  - Não usar `date-fns`/`dayjs` nem nenhuma nova dependência — só divisão/resto inteiro,
    igual à função atual.
  - Manter `FORMATADOR_INTEIRO`/`FORMATADOR_NUMERO` do topo do arquivo como estão (usados
    por `formatarInteiro`/`formatarPercentual`, que não mudam nesta task) — a nova
    função não precisa deles, já que os números formatados aqui são inteiros pequenos
    sem separador de milhar relevante.
- Não remover `formatarInteiro`, `formatarPercentual`, `inicioAnoCorrenteYMD`, `hojeYMD`
  — só `formatarHoras` é afetada.

- Arquivo: `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`.
  - Linha 9 (import): trocar `formatarHoras` por `formatarTempoMedio` na lista de
    imports de `./formatadores`.
  - Linhas 171-180 (`MetricaCard titulo="Tempo médio de resposta"`): trocar as três
    chamadas de `formatarHoras(...)` por `formatarTempoMedio(...)` nos mesmos três
    pontos (`valor`, e os dois itens de `detalhes` — `avaliacao_360.horas` e
    `clima_geral.horas`). Não alterar `descricao` (contagem de amostras) nem a
    estrutura do card.
  - Atualizar a prop `tooltip` (linha 179), hoje:
    > "Tempo médio entre o momento em que o link da pesquisa foi enviado e o momento em
    > que a pessoa respondeu, calculado com base em todas as respostas do período
    > selecionado. Exibido em horas quando menor que 24 horas, ou em dias quando 24
    > horas ou mais."

    Substituir a segunda frase (a que descreve o formato de exibição) para refletir as
    três faixas reais da nova função, mantendo a primeira frase (explicação do cálculo)
    intacta. Sugestão de texto (pode ajustar levemente a redação, mas precisa cobrir as
    três faixas com precisão):
    > "Tempo médio entre o momento em que o link da pesquisa foi enviado e o momento em
    > que a pessoa respondeu, calculado com base em todas as respostas do período
    > selecionado. Exibido em minutos quando menor que 1 hora, em horas e minutos
    > quando entre 1 hora e 1 dia, e em dias, horas e minutos quando 1 dia ou mais."
  - Não alterar nenhum outro `MetricaCard` da página (Total de ciclos, Taxa de resposta
    média, Distribuição por tipo etc.) nem seus tooltips.

- Ao final, rodar `npm run build` e `npm run lint` dentro de `frontend/` para confirmar
  que não há erro de tipo (import não utilizado de `formatarHoras`, nome renomeado
  consistente nos dois arquivos) nem violação de lint.

### 2. frontend-codereviewer

Revisão apenas (sem corrigir código diretamente, sem etapa de testes automatizados —
projeto não tem test runner de frontend configurado). Pontos de atenção específicos:

- **Parte 1**
  - A tabela "Participantes" (~linha 581-582) recebeu exatamente
    `sx={{ maxHeight: 440, overflowY: 'auto' }}` no `TableContainer` e `stickyHeader` no
    `Table`, igual ao padrão das outras três tabelas do mesmo arquivo — sem valores
    divergentes (ex.: `maxHeight` diferente, `overflow: 'scroll'` em vez de `'auto'`).
  - As outras três tabelas (Relacionamentos gerados, Envios avaliação_360,
    Participantes e envios clima_geral) continuam com o mesmo `maxHeight`/`stickyHeader`
    que já tinham antes desta task — nenhuma regressão introduzida nelas, nenhuma
    duplicação de `sx`.
  - Nenhuma outra seção da página (`CicloDadosForm`, `ProgressoCicloBar`, cards de
    pesquisa vinculada, formulários de adicionar participante) teve altura, cor ou
    borda alteradas.
  - Cantos arredondados/cor de borda das tabelas seguem inalterados (`component={Paper}
    variant="outlined"` preservados, sem `sx` extra que sobreponha o tema MUI com
    Tailwind — conflito MUI vs Tailwind não se aplica aqui pois a mudança é só `sx`
    nativo do MUI).

- **Parte 2**
  - `formatarTempoMedio` (ou nome equivalente escolhido) nunca produz uma string com
    casas decimais soltas (ex.: nada como `"3.5h"`) — toda a decomposição usa inteiros.
  - As três faixas (`< 1h`, `1h`–`1d`, `>= 1d`) usam o mesmo estilo de unidade
    (abreviado `min`/`h`/`d` ou por extenso — mas **um só** dos dois, sem misturar), e a
    omissão de partes zeradas segue uma regra única e previsível (não corta o `d` em
    valores de 1 dia ou mais, mesmo quando `h`/`min` são zero).
  - `horas <= 0` continua retornando `'—'` (não regrediu para `NaN`, string vazia, ou
    `"0min"`).
  - Os três call sites em `AnaliseVisaoGeralPage.tsx` (valor principal + os dois
    `detalhes` de avaliação_360/clima_geral) foram todos migrados — nenhum ficou
    chamando uma função removida (checar que `formatarHoras` não é mais importado nem
    referenciado em lugar nenhum do repo, já que era usada só ali).
  - Tooltip atualizado descreve corretamente as três faixas de formato exibidas e
    preserva a explicação do cálculo (envio do link → resposta, média do período) —
    não introduziu nenhuma alegação sobre origem dos dados que não venha do backend
    (`analise.service.ts` já calcula `tempoMedioResposta.*.horas` em horas, sem mudança
    de backend nesta task).
  - Nenhuma regra de agregação/anonimização foi tocada — esta é uma métrica já agregada
    (`visaoGeral`), sem relação com dado identificado de avaliador/avaliado; não deveria
    haver mudança de comportamento além de formatação de string.
  - `npm run build` e `npm run lint` (`frontend/`) rodados e sem erros.

## Revisão

Revisão da etapa "1. frontend-developer". Nenhum achado crítico. Implementação fiel ao
plano nas duas partes; itens abaixo são refinamentos opcionais.

### Crítico

Nenhum achado crítico — não há vazamento de identidade, quebra de controle de acesso,
CSS puro/Tailwind sobrescrevendo MUI, nem lógica de negócio sensível no frontend. Pode
prosseguir (não há etapa de testes automatizados nesta task, conforme já registrado no
plano — `frontend/package.json` não tem test runner configurado).

### Deveria corrigir

Nenhum item.

### Sugestão

- `formatarTempoMedio` (`frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts:12-33`):
  conferidos os casos de borda pedidos — `0`/negativo → `'—'`; exatamente 60min
  (`horas = 1`) cai corretamente no branch `1h`–`1d` e retorna `"1h"` (não `"60min"`),
  porque o teste `totalMinutos < 60` é feito sobre `totalMinutos` já arredondado, então
  qualquer valor de `horas` cujo arredondamento produza `60` (ex.: `horas ≈ 0.9917`,
  59,5 min brutos) também cai em `"1h"` e não em `"60min"`; o mesmo padrão vale na
  fronteira `1440` min (24h): tanto `horas = 24` quanto um valor que arredonde para
  `1440` (ex.: `horas ≈ 23,9917`) caem no branch `>= 1d` e retornam `"1d"`, não
  `"24h 0min"`. Ou seja, a decomposição acontece só depois do arredondamento para minutos
  inteiros, o que evita exatamente o bug de "60min"/"24h" soltos que o pedido queria
  prevenir. Não há necessidade de correção — só deixando registrado que os casos de
  borda foram checados manualmente e passam.
- Pequena divergência de estilo entre as duas metades da função: no branch `1h`–`1d` a
  omissão de minutos zerados usa um `if`/ternário inline (`minutosRestantes === 0 ? ... :
  ...`), enquanto o branch `>= 1d` usa acumulação em array (`partes.push(...)`) — ambos
  corretos e cobrem os casos pedidos, só não são a mesma técnica. Não é bloqueante, é só
  uma sugestão de uniformizar a forma caso a função seja tocada de novo no futuro (ex.:
  usar `partes.push` nos dois branches).
- O texto de `horas <= 0 → '—'` cobre tanto `0` quanto negativo com o mesmo tratamento,
  como o pedido permitia ("não deveria ocorrer mas confira o que a função faz") — vale
  como documentação implícita de que a API nunca deveria mandar um valor negativo aqui;
  nenhuma ação necessária.

### Checklist conferido

1. **Vazamento de identidade**: tabela "Participantes" de `CicloDetalhePage.tsx` só
   lista colaboradores participantes do ciclo (nome, e-mail, cargo, equipe) — sem
   vínculo avaliador↔avaliado nem dado de resposta; card "Tempo médio de resposta" é
   métrica agregada (`tempoMedioResposta.*.horas`/`.amostras`), sem quebra por
   avaliador/avaliado. Não há regressão de anonimização em nenhum dos dois arquivos.
2. **Controle de acesso na UI**: não alterado por esta task (nenhuma tela/ação nova
   exposta).
3. **Stack de estilização**: só `sx` nativo do MUI foi adicionado (`maxHeight: 440`,
   `overflowY: 'auto'`) + prop `stickyHeader`, sem Tailwind competindo com a mesma
   propriedade; nenhum arquivo `.css` novo, nenhum `style={{}}` inline introduzido.
4. **Consistência**: a tabela "Participantes" agora usa exatamente o mesmo par
   `sx={{ maxHeight: 440, overflowY: 'auto' }}` + `stickyHeader` das outras três tabelas
   do arquivo (`Relacionamentos gerados` linha 756-757, `Envios` linha 817-818,
   `Participantes e envios` linha 1053-1054) — valores idênticos, sem divergência
   (`maxHeight` diferente ou `overflow: 'scroll'`). As três tabelas pré-existentes
   permanecem exatamente como estavam, sem duplicação de `sx` nem regressão. Nenhuma
   outra seção da página (`CicloDadosForm`, `ProgressoCicloBar`, cards de pesquisa
   vinculada, formulários de adicionar participante, diálogos de confirmação) foi
   tocada.
5. **Qualidade geral**: os três call sites em `AnaliseVisaoGeralPage.tsx` (linhas
   173, 176, 177 — `valor` geral + `detalhes` de `avaliacao_360`/`clima_geral`) usam
   `formatarTempoMedio` de forma consistente; `formatarHoras` não é mais referenciada em
   nenhum lugar do repo (confirmado por busca em `frontend/src`). O tooltip (linha 179)
   preserva a explicação do cálculo (envio do link → resposta, média do período) e
   descreve corretamente as três faixas de formato exibidas (minutos / horas+minutos /
   dias+horas+minutos), sem introduzir nenhuma alegação nova sobre origem dos dados.
   Nenhuma lógica de agregação/anonimização foi tocada — mudança é só formatação de
   string em componente já existente.
