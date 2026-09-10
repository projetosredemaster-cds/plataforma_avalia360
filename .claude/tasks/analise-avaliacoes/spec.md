# Spec: Módulo Análise — tela "Avaliações"

## 1. Resumo do pedido

Implementar a segunda tela do módulo Análise (`apps/api`/`apps/web` na
nomenclatura dos agentes = `backend/`/`frontend/` neste repo), chamada
"Avaliações". A primeira tela do módulo ("Visão Geral") já está
implementada, revisada e testada (`.claude/tasks/analise-visao-geral/`,
`backend/src/modules/analise/analise.service.ts`) e serve de precedente de
padrão de código para esta spec — mas os dados que "Avaliações" expõe são de
natureza diferente (respostas individuais, não contagens/médias), então o
guard rail de anonimização não é o mesmo (ver seção 3).

"Avaliações" é uma lista de respostas individuais de perguntas do tipo
`texto_aberto`, cobrindo tanto pesquisas de avaliação 360 quanto de clima
organizacional (`clima_geral`), filtrável por período e opcionalmente por
ciclo (deep link a partir do card de ciclo em `CiclosListPage`, mesmo padrão
já usado por "Visão Geral"). Cada tipo de relacionamento (`autoavaliacao`,
`gestor`, `pares`, `subordinado`, além de `externo` para 360; sem
relacionamento algum para `clima_geral`) é exibido com uma regra de
identidade diferente — detalhado nas seções 2 e 3.

## 2. DECISÃO CRÍTICA — anonimato total, sem bypass, para ninguém, em nenhuma circunstância

Esta é a decisão mais sensível de toda a feature e recebe destaque próprio
porque é a mais fácil de ser corrompida silenciosamente em uma etapa
posterior do pipeline (planejamento-backend, backend-developer, code
review) se não for repetida aqui, fora do meio de uma lista de itens.

> **RH/admin NÃO têm nenhum bypass do limiar `minimo_respostas_pares` para
> relacionamentos `pares`/`subordinado`. Ficam sujeitos exatamente à mesma
> regra que qualquer outro cenário: abaixo do mínimo de respondentes,
> bloqueio completo — mesmo sendo os ÚNICOS papéis com acesso a esta tela.
> Não existe modo "transparência total" para ninguém, em nenhuma
> circunstância.**

Consequências diretas desta decisão, para deixar claro que não é uma
afirmação abstrata:

- Um `admin` olhando a tela "Avaliações" de um ciclo onde um avaliado
  específico teve só 2 respondentes `pares` (abaixo do
  `minimo_respostas_pares = 3` padrão) **não vê os textos desses 2
  respondentes de jeito nenhum** — nem agregados, nem identificados, nem
  atrás de um toggle/flag "ver mesmo assim". A resposta da API para aquele
  recorte é o estado explícito de bloqueio (`{ liberado: false, motivo:
  "aguardando_minimo_respondentes" }`), igual ao já usado em outras partes
  do projeto — nunca um array vazio ou parcial.
- Não existe, em nenhum endpoint desta feature, nenhum parâmetro, papel,
  flag de configuração ou header que reverta esse bloqueio. Se um pedido
  futuro pedir isso, é motivo de nova spec/confirmação explícita do
  usuário — não deve ser implementado por inferência de "afinal é admin,
  faz sentido ele ver tudo".

### 2.1 A coluna `anonimizar_respostas_pares` NÃO é lida por esta feature — decisão explícita, não pergunta em aberto

`ciclos_avaliacao.anonimizar_respostas_pares` (boolean, default `true`,
migration `1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`,
já mapeada na entity `CicloAvaliacao` e já exibida como informação read-only
em `CiclosListPage.tsx`, linha ~272: `Pares anonimizados: {ciclo.anonimizarRespostasPares
? 'Sim' : 'Não'}`) **não deve ser implementada, em nenhuma query, em nenhuma
decisão de exibição desta feature, como um interruptor de bypass da regra de
anonimização.**

O nome da coluna sugere, à primeira leitura, um "desligar a anonimização
por ciclo" — essa leitura foi explicitamente descartada pelo usuário para
esta feature. `buscarAvaliacoes`/qualquer função de serviço desta feature
**nunca deve fazer `SELECT` nem referenciar
`ciclos_avaliacao.anonimizar_respostas_pares`** em nenhum `WHERE`/`CASE`/
condicional de exibição. Hoje (confirmado por leitura direta) nenhum
service do projeto lê essa coluna — este documento existe para que
continue assim dentro do escopo desta feature. Se o planejamento-backend,
o backend-developer ou o code reviewer considerarem reintroduzir essa
coluna como bypass, isso é um desvio desta spec e deve ser barrado — não é
uma decisão de implementação em aberto, é uma decisão de produto já
fechada pelo usuário.

## 3. Demais decisões já fechadas pelo usuário (não reabrir)

Esta spec foi precedida por uma rodada de esclarecimento (`AskUserQuestion`)
já concluída em plan mode. As decisões abaixo estão fechadas — não devem
ser reperguntadas; qualquer detalhe remanescente não coberto por elas vai
para a seção "Perguntas em aberto" (nº 9), como sugestão a validar no
planejamento, não como bloqueio.

### 3.1 Escopo da tela

Lista de respostas individuais de perguntas `texto_aberto`, cobrindo tanto
avaliação 360 (`relacionamentos_avaliacao` → `envios_pesquisa` →
`respostas` → `itens_resposta`) quanto `clima_geral`
(`respostas_clima` → `itens_resposta_clima`).

### 3.2 Relações 1:1 (`autoavaliacao`, `gestor`) — sempre identificadas

Não há terceiro a proteger nessas relações: `autoavaliacao` é a própria
pessoa respondendo sobre si mesma, `gestor` é uma relação hierárquica
direta e já esperada como identificada. Mesmo princípio já usado na skill
`backend-anonimizacao-respostas` para leituras de RH/admin. `externo`
(quinto valor de `TipoRelacionamento`, `backend/src/common/enums.ts`)
segue a mesma regra — identificado, sem gate de mínimo — por não estar
listado entre `pares`/`subordinado` na regra central do projeto.

### 3.3 Relações `pares`/`subordinado` (avaliação 360) — agregado com gate por avaliado+ciclo+tipo

Só exibidas ao usuário (mesmo sendo admin/gestor_rh — ver seção 2) se
`COUNT(DISTINCT avaliador_id)` para aquele avaliado + ciclo +
`tipo_relacionamento` atingir `ciclos_avaliacao.minimo_respostas_pares`
(default 3). Essa é a granularidade correta desta tela — por avaliado +
ciclo + tipo de relacionamento — diferente da granularidade usada para
`clima_geral` (ver 3.4). Abaixo do mínimo: bloqueio completo, retornando um
estado explícito (`{ liberado: false, motivo: "aguardando_minimo_respondentes"
}`), nunca um array vazio ou parcial ambíguo — mesmo padrão já usado no
projeto para `progresso` em `ciclos-avaliacao.service.ts`.

### 3.4 `clima_geral` — gate por ciclo inteiro, sem nenhuma atribuição

`minimo_respostas_pares` é reaproveitado (dívida técnica conhecida e já
documentada no brief — não corrigir nesta feature), mas avaliado **por
ciclo inteiro**, não por pergunta, não por segmento, não por pessoa — não
há pessoa a identificar, já que `respostas_clima`/`itens_resposta_clima`
não têm nenhuma FK de identidade (estruturalmente anônimas por design,
comentário na entity: "NENHUMA rota, presente ou futura, deve adicionar uma
coluna de identidade aqui"). Se o ciclo inteiro não atingir o mínimo (ex.:
`COUNT(DISTINCT ciclo_participantes respondidos)` ou contagem equivalente de
respostas de clima do ciclo abaixo do limiar), bloqueio completo do ciclo
inteiro para clima. Se atingir, os textos são exibidos como lista solta,
**sem nenhuma atribuição, nem agregada por pessoa** — nunca rotulado "por
respondente", porque não há identidade nenhuma nessas tabelas para agrupar.

### 3.5 Ordem de exibição dos textos `pares`/`subordinado` liberados — reembaralhada a cada carregamento, no backend

Para reduzir o risco de uma posição consistente na lista virar, ao longo de
múltiplas visualizações, um padrão implicitamente rastreável entre poucos
respondentes, a ordem dos textos `pares`/`subordinado` liberados (acima do
mínimo) é reembaralhada a cada carregamento (ex.: algoritmo Fisher-Yates),
**aplicada no backend**, antes de a resposta ser serializada — nunca conte
com o frontend para isso, e a UI não deve exibir nenhuma numeração/rótulo de
posição fixo (ex.: "Resposta 1 de 3") que reintroduza uma referência estável
entre carregamentos.

### 3.6 Aviso de limitação conhecida na UI — conteúdo/estilo de escrita

Mesmo com o mínimo de respondentes atingido e o gate liberado, o texto em
si pode ser identificável por conteúdo/estilo de escrita — isso é uma
limitação conhecida, sem solução automática nesta fase. A tela deve exibir
um aviso visível para admin/gestor_rh alertando sobre isso. Texto do brief
(`docs/brief_avaliacao360_v5.md`, citado literalmente para a UI não
reinventar a redação): a limitação de que "o texto em si pode ser
identificável por conteúdo/estilo de escrita" é reconhecida "sem solução
automática no MVP" — o aviso deve comunicar isso de forma direta ao
usuário admin/gestor_rh, não escondida em tooltip secundário.

### 3.7 Deep link por ciclo

Botão "Avaliações" no card de Ciclo (`CiclosListPage.tsx`), ao lado do
botão "Visão Geral" já existente (`CardActions`, linha ~281-283 hoje: `<Button
size="small" onClick={() => navigate('/analise/visao-geral?cicloId=' +
ciclo.id)}>Visão Geral</Button>`), mesmo padrão de atalho — abre a tela de
Avaliações já filtrada por aquele ciclo específico via query string (ex.
`?cicloId=<id>`). Não filtra por pesquisa — os atalhos vivem no card do
Ciclo, não no card da Pesquisa (decisão já fechada). O usuário pode alterar
o filtro depois de entrar na tela. Não fica restrito ao bloco condicional
`status === 'rascunho'` do `CardActions` — mesmo raciocínio já aplicado a
"Visão Geral" (faz sentido para ciclos em qualquer status).

### 3.8 Reaproveitamento de padrões já estabelecidos por "Visão Geral" — com um guard rail DIFERENTE

Reaproveitar: `analiseService.ts` no frontend (funções soltas sobre
`apiFetch<T>`), estrutura de rota `/analise/*`, `garantirPapel(ator, ['admin',
'gestor_rh'])` como primeira linha de toda função de serviço exportada,
componentes em `frontend/src/components/analise/`.

**NÃO reaproveitar literalmente**: o guard rail de anonimização de "Visão
Geral" (`analise.service.ts`, comentário na função `buscarVisaoGeral`) é
"nunca projetar colunas de identidade (`avaliador_id`/`avaliado_id`/
`tipo_relacionamento`) — só `COUNT`/`AVG`/`GROUP BY`". Esse guard rail **não
se aplica a "Avaliações"**, porque esta feature precisa, estruturalmente:

- juntar `itens_resposta.valor` (o texto) com a identidade do avaliador
  para `autoavaliacao`/`gestor`/`externo` (seção 3.2) — isso é esperado e
  correto, não uma violação;
- usar `COUNT(DISTINCT avaliador_id)` (contagem de identidade, não o texto
  em si, não `avaliador_id` bruto na resposta) como o **gate** que decide
  se os textos de `pares`/`subordinado` daquele avaliado+ciclo+tipo podem
  ser retornados — a contagem toca a coluna de identidade, o retorno ao
  cliente não.

O guard rail correto para esta feature, a documentar e implementar (e
candidato natural a achado crítico de code review se violado): **nunca
retornar `avaliador_id` (nem qualquer coluna que identifique o avaliador)
JUNTO do texto de uma resposta `pares`/`subordinado`, em nenhuma condição —
nem antes do limiar ser atingido (óbvio, está bloqueado) nem depois (o
texto liberado sai sempre sem identidade anexada, ver 3.4/3.5 — a
liberação é do CONTEÚDO agregado/reembaralhado, nunca da identidade)**.

### 3.9 Ajuste visual nos botões do card de Ciclo (fora da regra de negócio, mesma task)

Nos dois botões de atalho do card de Ciclo em `CiclosListPage.tsx`
("Visão Geral" já existente e "Avaliações" novo), adicionar ícone via prop
`startIcon` do `Button` MUI:

- "Visão Geral": `BarChartIcon` (`@mui/icons-material/BarChart`).
- "Avaliações": `ChatBubbleOutlineIcon` ou `ForumIcon`
  (`@mui/icons-material/ChatBubbleOutline` ou
  `@mui/icons-material/Forum`) — escolha final no planejamento-frontend.

Padrão de import já dominante no projeto: import default por ícone
individual (`import XIcon from '@mui/icons-material/X'`), nunca o import
nomeado do barrel (`@mui/icons-material` já instalado, `^9.4.0` — sem
dependência nova). `PainelAdminLayout.tsx` já usa `AssessmentOutlinedIcon`
para o item de menu "Análises" — os ícones dos botões do card de Ciclo
devem ser visualmente distintos desse.

## 4. Modelo de dados envolvido (leitura only — nenhuma tabela/coluna nova)

- **Avaliação 360**: `relacionamentos_avaliacao` (`id`, `ciclo_id`,
  `avaliador_id`, `avaliado_id`, `tipo_relacionamento`) →
  `envios_pesquisa.relacionamento_id` → `respostas.envio_id` (UNIQUE) →
  `itens_resposta.resposta_id` + `itens_resposta.pergunta_id` →
  `perguntas` (filtrar `tipo = 'texto_aberto'`, usar `enunciado` como
  rótulo da pergunta — divergência de nomenclatura já documentada no
  CLAUDE.md do projeto, não confundir com `titulo`/`descricao` do doc de
  schema). `itens_resposta.valor` é `jsonb`, shape `{ "texto": "..." }`.
- **Clima**: `respostas_clima` (`id`, `pesquisa_id`, `ciclo_id`,
  `respondido_em`) → `itens_resposta_clima` (`resposta_clima_id`,
  `pergunta_id`, `valor` jsonb) — sem nenhuma FK de identidade,
  estruturalmente anônima por design.
- `tipo_relacionamento` (enum Postgres, `backend/src/common/enums.ts`,
  `TipoRelacionamento`): exatamente `'autoavaliacao' | 'gestor' | 'pares' |
  'subordinado' | 'externo'`.
- `ciclos_avaliacao.minimo_respostas_pares`: smallint, default 3. Coluna
  irmã `ciclos_avaliacao.anonimizar_respostas_pares` existe mas NÃO é lida
  por esta feature (ver seção 2.1).
- Nenhuma lógica pronta existe hoje para `COUNT(DISTINCT avaliador_id)
  GROUP BY avaliado_id, ciclo_id, tipo_relacionamento` — essa agregação de
  gate é implementada do zero por esta feature. As views
  `respostas_identificadas`/`respostas_pares_agregadas` citadas na skill
  `backend-anonimizacao-respostas` não existem fisicamente em nenhuma
  migration — são só referência de design em
  `docs/schema_avaliacao360_pt_v2.sql`; a separação precisa ser replicada
  em TypeScript/QueryBuilder, igual ao já feito para "Visão Geral".
- Nenhuma tabela nova, nenhuma coluna nova, nenhuma migration necessária
  para esta feature.

## 5. Recorte backend vs frontend

### Backend (`backend/`)

- Estende o módulo já existente `backend/src/modules/analise/` (mesmo
  módulo de "Visão Geral" — não criar um módulo novo separado, a menos que
  o planejamento-backend julgue o service grande demais para um único
  arquivo; se dividir, manter o mesmo `analise.module.ts`/prefixo de rota).
- Sem entidade própria — reaproveita entidades existentes só para leitura
  (`RelacionamentoAvaliacao`, `EnvioPesquisa`, `Resposta`, `ItemResposta`,
  `Pergunta`, `RespostaClima`, `ItemRespostaClima`, `CicloAvaliacao`), via
  `QueryBuilder`/`AppDataSource`.
- `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha da
  função de serviço exportada — mesmo padrão já usado em
  `buscarVisaoGeral`. Nenhuma rota desta feature é acessível por
  `colaborador`.
- Duas fases de query por bloco de dados (360 e clima), refletindo os
  guard rails distintos da seção 3.8/3.4:
  1. Para 360 `autoavaliacao`/`gestor`/`externo`: join direto
     `itens_resposta` → `respostas` → `envios_pesquisa` →
     `relacionamentos_avaliacao` (com `avaliador_id`/`avaliado_id`) →
     `perguntas` (`tipo = 'texto_aberto'`), filtrado por ciclo/período,
     retornando texto + identidade do avaliador.
  2. Para 360 `pares`/`subordinado`: primeiro calcular o gate
     (`COUNT(DISTINCT avaliador_id)` agrupado por `avaliado_id`,
     `ciclo_id`, `tipo_relacionamento`, comparado a
     `ciclos_avaliacao.minimo_respostas_pares`); só para os grupos que
     atingem o mínimo, buscar os textos (sem `avaliador_id` no
     `SELECT` final retornado ao cliente), reembaralhar (3.5) e retornar
     junto com o agregado; para os grupos abaixo do mínimo, retornar o
     estado de bloqueio explícito por avaliado (ver contrato, seção 6).
  3. Para clima: primeiro calcular o gate do ciclo inteiro (contagem de
     respostas/participantes de clima do ciclo comparada ao mínimo); se
     atingido, buscar todos os textos de `itens_resposta_clima` do ciclo
     (sem nenhuma coluna de identidade a selecionar — não existe) e
     reembaralhar; se não atingido, bloqueio completo do ciclo para
     clima.
- Guard rail de anonimização (seção 3.8) reforçado com comentário no
  código do service, mesmo padrão já existente em
  `calcularProgressoCiclo`/`buscarVisaoGeral`.
- Reembaralhamento (Fisher-Yates ou equivalente) aplicado no backend,
  nunca delegado ao frontend.

### Frontend (`frontend/`)

- Nova página em `frontend/src/pages/` (nome a definir no planejamento,
  ex. `AnaliseAvaliacoesPage`), dentro do mesmo grupo protegido de rotas
  já usado por "Visão Geral" (`RotaProtegida papeis={['admin',
  'gestor_rh']}`), rota nova ex. `/analise/avaliacoes`.
- Entrada no menu lateral: grupo "Análises" já existe em
  `PainelAdminLayout.tsx`; o submenu "Qualitativa" hoje é placeholder
  (`opcoes: [{ label: 'Em breve', disabled: true }]`) — "Avaliações" entra
  aí como opção navegável real, usando o mecanismo `SubmenuOpcao.to` já
  existente e já em uso por "Visão Geral" em "Quantitativa" (não precisa
  estender o tipo `SubmenuOpcao`, ele já suporta `to`).
- Filtro de período: reaproveitar o mesmo padrão de dois `TextField
  type="date"` do MUI já usado em "Visão Geral" (sem nova dependência de
  date-picker). Filtro de `cicloId`: populado via query string quando a
  navegação vem do botão "Avaliações" do card de ciclo (3.7); alterável
  depois de entrar na tela.
- Botão novo "Avaliações" no `CardActions` de cada card de
  `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`, ao lado de
  "Visão Geral" (linha ~281-283 hoje), navegando para a rota nova com
  `?cicloId=<id>`. Ícones em ambos os botões — ver 3.9.
- Componente(s) novo(s) de lista de textos em
  `frontend/src/components/analise/` (ex. `ListaRespostasTextoAberto` ou
  equivalente a definir no planejamento), capazes de renderizar tanto o
  estado liberado (lista de textos) quanto o estado bloqueado (mensagem
  explícita "aguardando mínimo de respondentes", nunca uma lista vazia
  silenciosa).
- Aviso de limitação de anonimização por conteúdo/estilo (3.6) como
  componente de alerta visível (ex. MUI `Alert severity="warning"`) no
  topo da tela ou por bloco de `pares`/`subordinado`/clima liberado — a
  definir no planejamento-frontend, mas sempre visível, nunca opcional.
- Nenhuma regra de agregação/gate/anonimização calculada no frontend — o
  estado liberado/bloqueado, a ordem dos textos e a presença/ausência de
  identidade já vêm prontos da API; a tela só formata/exibe.

## 6. Contrato de API sugerido

Prefixo sugerido: `/api/analise` (mesmo módulo de "Visão Geral", atrás de
`autenticar`, papéis `admin`/`gestor_rh`). Path exato a confirmar no
planejamento-backend — sugestão abaixo é ponto de partida, não mandato.

### `GET /api/analise/avaliacoes`

Query params: `de` (string `YYYY-MM-DD`, mesma validação de "Visão Geral"),
`ate` (idem), `cicloId` (uuid, opcional).

- 200 (esboço de shape, nomes exatos a confirmar no planejamento):
  ```json
  {
    "periodo": { "de": "2026-01-01", "ate": "2026-09-10" },
    "cicloId": "uuid-ou-null",
    "avaliacao360": {
      "identificadas": [
        {
          "tipoRelacionamento": "autoavaliacao",
          "avaliadoId": "uuid",
          "avaliadoNome": "...",
          "avaliadorId": "uuid",
          "avaliadorNome": "...",
          "perguntaId": "uuid",
          "perguntaEnunciado": "...",
          "texto": "..."
        }
      ],
      "paresSubordinado": [
        {
          "avaliadoId": "uuid",
          "avaliadoNome": "...",
          "tipoRelacionamento": "pares",
          "liberado": true,
          "totalRespondentes": 4,
          "minimoNecessario": 3,
          "textos": [
            { "perguntaId": "uuid", "perguntaEnunciado": "...", "texto": "..." }
          ]
        },
        {
          "avaliadoId": "uuid-2",
          "tipoRelacionamento": "subordinado",
          "liberado": false,
          "motivo": "aguardando_minimo_respondentes",
          "totalRespondentes": 2,
          "minimoNecessario": 3
        }
      ]
    },
    "climaGeral": {
      "liberado": true,
      "totalRespondentes": 12,
      "minimoNecessario": 3,
      "textos": [
        { "perguntaId": "uuid", "perguntaEnunciado": "...", "texto": "..." }
      ]
    }
  }
  ```
  Quando `climaGeral.liberado === false`: `textos` ausente, `motivo:
  "aguardando_minimo_respondentes"` presente — nunca lista vazia como
  substituto de bloqueio.
- 422 (nomes de código a confirmar): `de`/`ate` ausentes/mal formatados ou
  `ate < de` — mesmo padrão de "Visão Geral".
- 404 `CICLO_NAO_ENCONTRADO`: `cicloId` informado não existe — mesmo
  código já usado no módulo.
- Nenhum campo do bloco `paresSubordinado`/`climaGeral` inclui
  `avaliadorId` (ou qualquer coluna de identidade do avaliador) junto de
  `texto` quando `tipoRelacionamento` é `pares`/`subordinado`, ou em
  qualquer item de `climaGeral` — conforme guard rail da seção 3.8. Ordem
  de `textos` dentro de cada grupo liberado é reembaralhada a cada
  chamada (3.5).

## 7. Perguntas em aberto (não bloqueiam o planejamento — recomendação registrada para cada uma)

1. **Nome exato do endpoint/path** (`/api/analise/avaliacoes` vs
   alternativa, e se cabe no mesmo `analise.service.ts`/`analise.controller.ts`
   de "Visão Geral" ou em arquivos próprios dentro do mesmo módulo).
   Recomendação: mesmo módulo `analise`, arquivo de service separado (ex.
   `analise-avaliacoes.service.ts`) se o `analise.service.ts` atual já
   estiver grande, mantendo um único `analise.controller.ts`/
   `analise.module.ts` — decisão final cabe ao planejamento-backend.
2. **Paginação da lista de textos.** O contrato sugerido na seção 6 não
   pagina. Recomendação: sem paginação nesta primeira versão (mesmo
   espírito de "Visão Geral", que também não pagina), mas o
   planejamento-backend deve avaliar se o volume esperado de textos por
   ciclo/período justifica paginação desde já — se sim, é mudança de
   contrato a decidir ali, não nesta spec.
3. **Contagem exata usada como gate de clima (`clima_geral`, seção 3.4).**
   Recomendação: reaproveitar a mesma base já usada em
   `calcularProgressoCiclo` para clima (`ciclo_participantes.respondeu_em
   IS NOT NULL`, contagem por ciclo) como o `totalRespondentes` do gate,
   por já ser a fonte de verdade de "quem respondeu" hoje no projeto —
   confirmar no planejamento-backend que essa contagem é equivalente à
   contagem de respostas em `respostas_clima` (deveria ser 1:1, mas vale
   checar antes de assumir).
4. **Se a tela também precisa de um seletor manual de ciclo** (além do
   deep link vindo do card), mesma pergunta já registrada e resolvida como
   "não, só deep link nesta primeira versão" na spec de "Visão Geral" —
   recomendação: manter a mesma decisão aqui por consistência, a menos que
   o planejamento julgue diferente.
5. **Nome definitivo do componente de aviso de limitação (3.6) e onde ele
   aparece exatamente** (topo único da tela vs por bloco liberado).
   Recomendação: um único `Alert` fixo no topo da tela, sempre visível
   quando existe pelo menos um bloco liberado de `pares`/`subordinado`/
   `clima_geral` na resposta — mais simples que repetir por bloco, sem
   perder a visibilidade.
