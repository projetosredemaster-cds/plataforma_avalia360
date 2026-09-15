# Spec — Inativar/Ativar em Pesquisas e Ciclos

## Resumo do pedido

Adicionar uma máquina de estados de visibilidade ("soft-hide") sobre o estado
operacional já existente de `Pesquisa` e `CicloAvaliacao`, aplicada igualmente às
duas entidades (mesma regra, em paralelo):

1. Item **não encerrado**: nenhuma mudança de comportamento.
2. Item **encerrado + ativo** (`ativo = true`, default): listagem mostra só
   "Duplicar" e "Ver detalhes"; nenhuma outra ação. Ganha um botão "Inativar".
3. Item **encerrado + inativo** (`ativo = false`): nenhuma ação na listagem padrão;
   some da listagem padrão (só aparece com filtro explícito "Inativas"/"Inativos");
   único controle é "Ativar", que volta para o estado 2. Dado 100% preservado no
   banco (soft-hide, nunca soft-delete de conteúdo).

Coluna nova: `ativo boolean NOT NULL DEFAULT true` em `pesquisas` e em
`ciclos_avaliacao`.

Esta seção documenta as decisões já fechadas com o usuário (não reabertas aqui),
os fatos levantados no código real que orientam o planejamento, e as ambiguidades
que precisei resolver por conta própria para poder escrever esta spec de forma
acionável.

## Decisões já fechadas (registradas, não reabertas)

- Máquina de estados de 3 estágios acima, idêntica para `pesquisas` e
  `ciclos_avaliacao`.
- `ativo boolean NOT NULL DEFAULT true` como desenho de coluna nas duas tabelas.
- Só é possível inativar um item que já esteja **encerrado**; reativar
  (`ativo: false → true`) não exige que o item continue encerrado (ele já é,
  porque só chega a `ativo = false` vindo do estado 2).
- Soft-hide de visibilidade apenas — nunca toca `respostas`, `itens_resposta`,
  `relacionamentos_avaliacao` nem nenhuma tela do módulo `analise`.

## Fatos levantados no código (com arquivo + linha)

### Nomes de tabela e enums de status

- Tabela `pesquisas`, coluna `status`, enum Postgres `status_pesquisa` com
  valores `('rascunho', 'publicada', 'encerrada')` — criado em
  `backend/src/migrations/1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts:22`.
  Union type espelho: `StatusPesquisa = 'rascunho' | 'publicada' | 'encerrada'`
  em `backend/src/common/enums.ts:11`. **O literal de "encerrado" para pesquisa é
  `'encerrada'`** (feminino, concorda com "pesquisa").
- Tabela `ciclos_avaliacao`, coluna `status`, enum Postgres `status_ciclo` com
  valores `('rascunho', 'ativo', 'encerrado')` — criado em
  `backend/src/migrations/1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts:23`.
  Union type espelho: `StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'` em
  `backend/src/common/enums.ts:19`. **O literal de "encerrado" para ciclo é
  `'encerrado'`** (masculino, concorda com "ciclo").
- Entidades confirmam os nomes de coluna: `Pesquisa.status` em
  `backend/src/modules/pesquisas/pesquisa.entity.ts:27-33`;
  `CicloAvaliacao.status` em
  `backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts:32-38`.

### Precedente de coluna `ativo` já existente (`colaboradores`)

- `colaboradores.ativo boolean NOT NULL DEFAULT true` já existe, criado em
  `backend/src/migrations/1788268503083-CriarEquipesEColaboradores.ts:31`. Mesmo
  nome/tipo/default propostos aqui — sem colisão de nome em `pesquisas`/
  `ciclos_avaliacao` (nenhuma das duas tem hoje uma coluna `ativo`).
- Padrão de service já usado para essa coluna em `colaboradores`:
  `atualizarStatus(ator, id, dto)` com `AtualizarStatusColaboradorDto { ativo: boolean }`
  — `backend/src/modules/colaboradores/colaboradores.service.ts:505-516` — e rota
  única `PATCH /:id/status` (não `/ativar` + `/inativar` separados) em
  `backend/src/modules/colaboradores/colaboradores.module.ts:20`. Ver seção
  "Ambiguidade resolvida" abaixo sobre por que a spec segue mesmo assim o par de
  rotas `/inativar` + `/ativar` pedido explicitamente pelo usuário.
- Filtro de listagem por `ativo` já existe em `colaboradores`: query param
  `?ativo=` lido via `obterQueryBooleanoOpcional(req, 'ativo')` em
  `backend/src/modules/colaboradores/colaboradores.controller.ts:12`, repassado a
  `listar(ator, { ehGestor, ativo })`, aplicado como `where.ativo = filtros.ativo`
  em `backend/src/modules/colaboradores/colaboradores.service.ts:319`. Este é o
  padrão a reaproveitar (mesmo helper `obterQueryBooleanoOpcional`,
  `backend/src/common/http-params.ts:23`) para o filtro "Inativas"/"Inativos" das
  duas novas listagens.

### Listagens atuais de `pesquisas` e `ciclos_avaliacao` — 100% sem filtro no servidor

- `GET /api/pesquisas` → `listar(ator)` em
  `backend/src/modules/pesquisas/pesquisas.service.ts:274-302` não recebe
  nenhum parâmetro de filtro — busca sempre `repositorio().find({ order: { criadoEm: 'DESC' } })`
  (linha 277), sem `where`. Confirmado também no comentário de
  `backend/src/services/../pesquisasService.ts` (frontend) e no comentário
  inline do próprio `PesquisasListPage.tsx:32-35`: "`GET /api/pesquisas` não
  pagina/filtra no servidor — busca, status e ordenação desta tela são 100%
  client-side sobre o array completo."
- `GET /api/ciclos` → `listar(ator)` em
  `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts:362-365`,
  mesmo padrão: `repositorio().find({ order: { criadoEm: 'DESC' } })`, sem
  `where`, sem parâmetros. Confirmado em
  `frontend/src/services/ciclosService.ts:27-30` e
  `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (filtro de status e
  busca por nome são só `useMemo` client-side, linhas 103-110).
- **Implicação para o plano**: hoje não existe NENHUM filtro de query aplicado no
  backend nessas duas listagens — o filtro `ativo = true` por padrão (e a opção
  de inverter para "só inativos") precisa ser introduzido do zero nos dois
  services, não é uma extensão de um filtro pré-existente. O padrão mais
  próximo a seguir é o de `colaboradores` (`obterQueryBooleanoOpcional` +
  `where.ativo`), mesmo que pesquisas/ciclos não tenham hoje nenhum outro filtro
  de query para se alinhar.

### Onde a decisão de quais botões aparecem hoje vive no frontend

- **`PesquisasListPage.tsx`** (`frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx`):
  a decisão de botões está centralizada num único bloco `CardActions` por card
  (linhas 280-333), sem nenhum componente/hook separado — é decisão inline na
  própria página, condicionada só a `pesquisa.status`. Hoje, para uma pesquisa
  `encerrada`, o bloco atual já renderiza (por ausência de guarda condicional
  contrária): botão "Ver detalhes" (rótulo condicional ao status, linha 282, mas
  o botão em si aparece para QUALQUER status), "Pré-visualizar" (linhas
  284-290, incondicional) e "Duplicar" (linha 291-293, incondicional) — só os
  botões condicionais "Encerrar" (`status === 'publicada'`, linha 294) e
  "Publicar"/"Deletar" (`status === 'rascunho'`, linha 306) não aparecem para
  `encerrada`. **Fato relevante**: a nova regra ("encerrada + ativo → somente
  Duplicar e Ver detalhes, nenhuma outra") é mais restritiva que o
  comportamento atual — hoje "Pré-visualizar" também aparece para pesquisas
  encerradas e precisará ser escondido nesse estado. Ver "Ambiguidade
  resolvida" abaixo.
- **`CiclosListPage.tsx`** (`frontend/src/pages/CiclosListPage/CiclosListPage.tsx`):
  mesmo padrão, decisão inline num único bloco `CardActions` por card (linhas
  271-330), condicionada só a `ciclo.status`. Hoje, para um ciclo `encerrado`, o
  bloco já renderiza incondicionalmente "Ver detalhes" (linha 272-274), "Visão
  Geral" (linhas 275-281, atalho para `/analise/visao-geral`) e "Avaliações"
  (linhas 282-288, atalho para `/analise/avaliacoes`) — só "Ativar
  ciclo"/"Excluir" (`status === 'rascunho'`, linha 289) e "Encerrar"
  (`status === 'ativo'`, linha 319) não aparecem. **Fato crítico**: Ciclo **não
  tem hoje nenhuma funcionalidade de "Duplicar"** — nem endpoint no backend
  (`backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts` não expõe
  rota `duplicar`, e `ciclos-avaliacao.service.ts` não tem função `duplicar`),
  nem botão/serviço no frontend (`ciclosService.ts` não exporta nenhuma função
  de duplicação). A decisão fechada diz "SOMENTE Duplicar e Ver detalhes" para
  os dois tipos de item — para Ciclo isso não pode ser aplicado literalmente
  porque a ação "Duplicar" não existe. Ver "Ambiguidade resolvida" abaixo.
  Também fica registrado que os atalhos "Visão Geral"/"Avaliações" somem do
  card de um ciclo encerrado sob a nova regra (hoje aparecem para qualquer
  status).
- Não há duplicação de decisão de botões em múltiplos lugares — em ambas as
  páginas, a lógica vive só no bloco `CardActions` do respectivo componente de
  listagem, sem lógica equivalente replicada em outro arquivo.

### Rotas e services já existentes (para inserir os novos endpoints ao lado)

- Pesquisas: `backend/src/modules/pesquisas/pesquisas.module.ts:23-29` —
  `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`,
  `PATCH /:id/status`, `POST /:id/duplicar`. Todas atrás de
  `router.use(autenticar)` (linha 17).
- Ciclos: `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts:26-33` —
  `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`,
  `PATCH /:id/status`, `GET /:id/relacionamentos`, `GET /:id/progresso`. Também
  atrás de `router.use(autenticar)` (linha 19).
- Em ambos os services, toda função exportada chama `garantirPapel(ator, [...PAPEIS_COM_ACESSO])`
  como primeira linha, com `PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const`
  — `pesquisas.service.ts:25` e `ciclos-avaliacao.service.ts:25`. **Os novos
  endpoints de inativar/ativar devem exigir exatamente esse mesmo par de papéis
  (`admin`, `gestor_rh`)** — o mesmo já usado para criar/editar/mudar status
  nas duas entidades. `colaborador` nunca deve ter acesso.
- `TRANSICOES_VALIDAS` de status (`pesquisas.service.ts:30-34`,
  `ciclos-avaliacao.service.ts:30-34`) só regula transições do enum de status
  operacional (`rascunho`/`publicada`/`encerrada` e
  `rascunho`/`ativo`/`encerrado`) — a nova flag `ativo` é ortogonal a essa
  máquina de estados, não deve ser adicionada a `TRANSICOES_VALIDAS`.

### Padrão de erro para tentativa de inativar item não encerrado

Seguindo o padrão já usado (`ErroHttp(status, codigo, mensagem)`,
`backend/src/common/erro-http.ts`, e o precedente direto de
`pesquisas.service.ts:406-413` / `ciclos-avaliacao.service.ts:692-699` para
transição de status inválida — ambos usam `409 TRANSICAO_STATUS_INVALIDA`), a
spec propõe, para a tentativa de inativar um item cujo `status` ainda não é o
valor de "encerrado":

- Status HTTP: `422` (conforme pedido explicitamente no enunciado da task —
  nota-se que isso diverge do precedente de `409` usado para
  `TRANSICAO_STATUS_INVALIDA`, mas `422` também já é usado no projeto para
  outras pré-condições de negócio, ex. `CICLO_SEM_PARTICIPANTES`/campo
  obrigatório ausente em `colaboradores.service.ts:510`).
- Código: `PESQUISA_NAO_ENCERRADA` (para o service de pesquisas) e
  `CICLO_NAO_ENCERRADO` (para o service de ciclos) — mesmo padrão de nome já
  usado para as pré-condições análogas `PESQUISA_NAO_REMOVIVEL`/
  `CICLO_NAO_REMOVIVEL`/`CICLO_VINCULADO_NAO_EDITAVEL`.
- Mensagem sugerida: "Só é possível inativar pesquisas/ciclos encerrados."
  (mesmo tom das mensagens de erro já usadas nos dois services).
- Tentar reativar (`ativar`) um item que já está `ativo = true` — e o inverso,
  inativar um que já está `ativo = false` — deve ser tratado como uma
  pré-condição de negócio análoga (idempotência vs. erro é decisão do
  `planejamento-backend`; não fechada aqui).

## Conclusão sobre risco de anonimização — BAIXO RISCO

Investigação confirma que esta funcionalidade é estritamente de visibilidade de
listagem de `Pesquisa`/`CicloAvaliacao`, sem nenhum cruzamento com dado de
resposta:

- A nova coluna `ativo` fica só em `pesquisas` e `ciclos_avaliacao`. Nenhuma
  query de listagem/filtro proposta aqui toca `respostas`, `itens_resposta`,
  `respostas_clima`, `itens_resposta_clima` ou `relacionamentos_avaliacao`.
- `garantirPapel(ator, ['admin', 'gestor_rh'])` — o mesmo gate já usado para
  criar/editar/mudar status dessas duas entidades — cobre os novos endpoints;
  não há bypass de papel e `colaborador` nunca alcança esses endpoints (mesma
  garantia já aplicada hoje).
- O módulo `analise` (`analise-comum.ts`, `analise-ranking.service.ts`, etc.)
  não foi tocado por esta spec e não precisa ser — os endpoints de inativar/
  ativar propostos aqui não adicionam nem alteram nenhuma leitura de
  `itens_resposta`/`relacionamentos_avaliacao`.
- Único ponto de atenção não-crítico: se uma tela de análise algum dia listar
  ciclos/pesquisas por um seletor (dropdown) que reusa `GET /api/ciclos`/
  `GET /api/pesquisas`, ela herdará o filtro `ativo = true` por padrão — ou
  seja, um ciclo/pesquisa inativado deixa de aparecer nesses seletores também.
  Isso é o comportamento correto e esperado (soft-hide), não um problema de
  anonimização; registrado aqui só para o `planejamento-frontend` confirmar
  que nenhuma tela de análise depende de listar um ciclo/pesquisa já inativado.

**Conclusão: baixo risco de anonimização.** Nenhum dado de resposta/relacionamento
é lido, filtrado ou exposto de forma diferente por esta funcionalidade.

## Escopo funcional a implementar (para orientar os planos seguintes)

### Backend (`backend/`)

- Migration (SQL em texto puro, NENHUM arquivo `.ts` deve ser criado nesta
  rodada):
  ```sql
  ALTER TABLE pesquisas ADD COLUMN ativo boolean NOT NULL DEFAULT true;
  ALTER TABLE ciclos_avaliacao ADD COLUMN ativo boolean NOT NULL DEFAULT true;
  ```
  (índice parcial opcional tipo `WHERE ativo = false`, se o
  `planejamento-backend` julgar necessário para a query de "só inativos" —
  decisão de performance, não fechada aqui.)
- Entidades: adicionar `@Column({ type: 'boolean', default: true }) ativo!: boolean`
  em `Pesquisa` (`pesquisas/pesquisa.entity.ts`) e em `CicloAvaliacao`
  (`ciclos-avaliacao/ciclo-avaliacao.entity.ts`).
- Endpoints novos (papel exigido: `admin`, `gestor_rh` — mesmo `PAPEIS_COM_ACESSO`
  já usado nos dois services):
  - `PATCH /api/pesquisas/:id/inativar` e `PATCH /api/pesquisas/:id/ativar`
  - `PATCH /api/ciclos/:id/inativar` e `PATCH /api/ciclos/:id/ativar`
  - Validação: inativar só é permitido com `status === 'encerrada'` (pesquisa)
    / `status === 'encerrado'` (ciclo); caso contrário, `422` com o código
    proposto acima. Ativar não tem pré-condição de status (um item só chega a
    `ativo = false` já estando encerrado).
- Ajuste das queries de listagem existentes (`pesquisas.service.ts:274-302` e
  `ciclos-avaliacao.service.ts:362-...`): aceitar um novo parâmetro opcional
  (ex.: `apenasInativos` ou reaproveitar `ativo` como boolean, no padrão de
  `colaboradores`) e aplicar:
  - Sem parâmetro (padrão): `where: { ativo: true }`.
  - Com o parâmetro indicando "só inativos": `where: { ativo: false }`.
  - Nunca misturar os dois num único resultado (sem opção "todos" no backend,
    já que o requisito de produto é listagem padrão vs. filtro explícito
    "Inativas"/"Inativos" — decisão de nomear o parâmetro fica para
    `planejamento-backend`, seguindo o precedente de
    `obterQueryBooleanoOpcional`).

### Frontend (`frontend/`)

- `PesquisasListPage.tsx` e `CiclosListPage.tsx`: estender a lógica já
  centralizada no bloco `CardActions` de cada card (não criar um novo
  local de decisão) para os 3 estados:
  1. Não encerrado: sem mudança.
  2. Encerrado + `ativo`: somente "Duplicar" (pesquisa) / nenhuma ação
     equivalente disponível hoje para ciclo (ver ambiguidade resolvida abaixo)
     e "Ver detalhes" — esconder todos os outros botões hoje incondicionais
     nesse estado (Pré-visualizar em pesquisas; Visão Geral/Avaliações em
     ciclos). Exibir novo botão "Inativar".
  3. Encerrado + não `ativo`: nenhuma ação — exibir só o botão "Ativar".
- Nova opção de filtro "Inativas" (Pesquisas) / "Inativos" (Ciclos),
  complementar ao `RadioGroup` de status já existente
  (`PesquisasListPage.tsx:200-205`, `CiclosListPage.tsx:184-189`) — precisa
  decidir junto ao `planejamento-frontend` se é um novo valor dentro do mesmo
  `RadioGroup` de status ou um controleà parte (ex.: checkbox "Mostrar
  inativas"), já que "inativo" não é um valor do enum de `status`, é um campo
  independente. Como a listagem hoje é 100% client-side, essa opção pode
  continuar client-side SE o backend também retornar itens inativos quando
  pedido (ver filtro de backend acima) — ou seja, a página precisará decidir
  se chama a API duas vezes (uma para ativos, outra para inativos) ou muda o
  parâmetro da mesma chamada ao alternar o filtro.
- Services (`pesquisasService.ts`, `ciclosService.ts`): adicionar funções
  `inativarPesquisa(id)`/`ativarPesquisa(id)` e `inativarCiclo(id)`/`ativarCiclo(id)`,
  além de repassar o novo parâmetro de filtro em `listarPesquisas`/`listarCiclos`.
- Tipos (`types/pesquisa.ts`, `types/ciclo.ts`): adicionar `ativo: boolean` a
  `PesquisaResumo`/`Pesquisa` e a `Ciclo`.

## Fora de escopo (explícito)

- Qualquer mudança em `respostas`, `itens_resposta`, `respostas_clima`,
  `itens_resposta_clima`, `relacionamentos_avaliacao` ou no módulo `analise`.
- Criar uma funcionalidade de "Duplicar" para Ciclo (não existe hoje) — esta
  spec não pede a criação dessa funcionalidade; ver "Ambiguidade resolvida"
  abaixo sobre como o estado "encerrado + ativo" de Ciclo é tratado na ausência
  dela.
- Qualquer paginação/filtro server-side além do necessário para "ativo vs.
  inativo" (busca por texto e ordenação continuam 100% client-side, como já
  são hoje).
- Qualquer criação de arquivo de migration `.ts` nesta rodada — só o SQL em
  texto puro registrado acima, para o `backend-developer` aplicar como
  achar melhor (nova migration `.ts` de fato só na próxima rodada, com
  confirmação explícita do usuário antes de rodar contra qualquer banco real).
- Regra de quem pode ver pesquisas/ciclos inativos por papel diferente do já
  usado para editar (`admin`/`gestor_rh`) — nenhum pedido de expor isso a
  `colaborador` foi feito.

## Ambiguidades que precisei resolver

1. **Ciclo não tem "Duplicar" hoje.** A decisão fechada diz que o estado
   "encerrado + ativo" mostra "somente Duplicar e Ver detalhes" para as duas
   entidades. Para Pesquisa isso é direto (`Duplicar` já existe,
   `pesquisas.service.ts:434-497` / `POST /:id/duplicar`). Para Ciclo, não
   existe hoje nenhum endpoint/serviço/botão de duplicação (confirmado por
   ausência em `ciclos-avaliacao.module.ts`, `ciclos-avaliacao.service.ts` e
   `ciclosService.ts` do frontend). **Resolução adotada nesta spec**: não criar
   uma funcionalidade de duplicação de ciclo (fora de escopo, não foi pedida);
   para Ciclo, o estado "encerrado + ativo" mostra somente "Ver detalhes" (a
   ação "Duplicar" simplesmente não existe para essa entidade, não é
   escondida — é ausente). Se o usuário quiser um "Duplicar Ciclo" futuro,
   isso é uma funcionalidade nova e separada, a ser pedida explicitamente.
2. **"Pré-visualizar" (pesquisas) e "Visão Geral"/"Avaliações" (ciclos) hoje
   aparecem incondicionalmente para itens encerrados** — a nova regra
   ("nenhuma outra ação" para encerrado + ativo) implica escondê-los nesse
   estado, o que é uma mudança de comportamento hoje existente, não só uma
   adição. Resolução: registrei isso como fato/consequência da decisão já
   fechada (não é uma pergunta em aberto, já que "nenhuma outra" é explícito),
   mas destaco para o `planejamento-frontend` confirmar antes de implementar,
   já que remove o atalho direto para telas de análise de um ciclo encerrado
   diretamente do card da listagem (o usuário ainda alcança essas telas por
   "Ver detalhes" → tela de detalhe do ciclo, e pelo menu lateral
   Análises → Quantitativa/Qualitativa, então não é uma perda de acesso, só de
   atalho).
3. **Rotas `/inativar` + `/ativar` vs. o precedente `/status` único de
   `colaboradores`.** O enunciado da task já pede explicitamente
   `PATCH /api/pesquisas/:id/inativar` e `/ativar` (e equivalente para ciclos)
   como exemplo — segui esse formato na spec porque foi dado como exemplo
   explícito na tarefa, mesmo notando que diverge do padrão único
   `PATCH /:id/status` com body `{ ativo }` já usado por `colaboradores`
   (`colaboradores.module.ts:20`). Deixo registrado para o
   `planejamento-backend` decidir se replica o padrão de `colaboradores` (uma
   rota `/status` com body) ou mantém o par `/inativar`+`/ativar` — ambos são
   consistentes com o "mesmo papel administrativo" e a mesma validação de
   pré-condição; a escolha de forma da rota não muda nenhuma regra de negócio
   desta spec.
4. **Nome do parâmetro de filtro "só inativos" na listagem.** Não fechado
   nesta spec (fica para `planejamento-backend`/`planejamento-frontend`
   decidirem juntos um nome único usado nos dois lados) — sugestões viáveis
   observadas no código: reaproveitar `ativo` como boolean (mesmo nome/uso de
   `colaboradores.controller.ts:12`) ou um parâmetro dedicado como
   `apenasInativos`. Qualquer um dos dois satisfaz o requisito "filtro
   explícito, complementar aos já existentes".
