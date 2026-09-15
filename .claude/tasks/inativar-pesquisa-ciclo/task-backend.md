# Task: Inativar/Ativar em Pesquisas e Ciclos — Backend

Base: `.claude/tasks/inativar-pesquisa-ciclo/spec.md` (decisões já fechadas lá não
são reabertas aqui). Demanda toca só `backend/` (`apps/api` na nomenclatura dos
agentes/skills — diretório real é `backend/`). Dois módulos afetados, em
paralelo, com a mesma regra: `pesquisas` e `ciclos-avaliacao`.

## Decisões já fechadas pelo orquestrador (não reabertas aqui)

- Forma das rotas: par `PATCH /:id/inativar` + `PATCH /:id/ativar` (não o
  padrão único `/:id/status` de `colaboradores`).
- Nome do parâmetro de filtro de listagem: `ativo` (boolean, query param),
  mesmo nome/uso de `colaboradores` via `obterQueryBooleanoOpcional`.

## Risco de anonimização — BAIXO (confirmado pela spec)

Nenhum passo abaixo faz JOIN ou leitura de `respostas`, `itens_resposta`,
`respostas_clima`, `itens_resposta_clima` ou `relacionamentos_avaliacao`. A
coluna nova (`ativo`) e os endpoints novos só leem/escrevem `pesquisas` e
`ciclos_avaliacao`. Todo endpoint novo é gated por
`garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha — nenhum
bypass, `colaborador` nunca alcança.

## REGRA CRÍTICA DESTA RODADA

**Nenhuma migration `.ts` deve ser criada em `backend/src/migrations/` nesta
rodada.** O `backend-developer` aplica a mudança de schema rodando o SQL
abaixo manualmente (ou orientando o usuário a rodar no SQL Editor do
Supabase) — isso diverge deliberadamente do padrão usual do projeto (onde o
próprio `backend-developer` cria a migration). Uma migration `.ts` de fato só
será criada em uma rodada futura, com confirmação explícita do usuário antes
de rodar contra qualquer banco real.

### SQL manual (rodar fora do fluxo de migration, sem arquivo `.ts` correspondente)

```sql
ALTER TABLE pesquisas ADD COLUMN ativo boolean NOT NULL DEFAULT true;
ALTER TABLE ciclos_avaliacao ADD COLUMN ativo boolean NOT NULL DEFAULT true;
```

**Decisão sobre índice: NÃO criar índice nesta rodada.** As duas listagens
(`GET /api/pesquisas`, `GET /api/ciclos`) já rodam hoje como `SELECT *`
sem paginação nem nenhum outro filtro server-side, sobre tabelas de baixo
volume (dezenas/centenas de linhas — uma por pesquisa/ciclo, não por
resposta). Um índice parcial (`WHERE ativo = false`) seria otimização
prematura para um volume de dados que não justifica o custo de manutenção
adicional em `INSERT`/`UPDATE`. Se o volume real crescer a ponto de a
listagem ficar lenta, isso é uma decisão de performance a ser tomada depois,
com dado real de produção — não nesta task.

## 1. backend-developer

### 1.1 Schema (manual, sem migration `.ts`)

- Rodar o SQL da seção acima manualmente contra o banco de desenvolvimento
  (nunca contra produção sem confirmação explícita do usuário, mesma regra
  de sempre).
- **Não criar nenhum arquivo em `backend/src/migrations/`** para esta task.

### 1.2 Entidades

- `backend/src/modules/pesquisas/pesquisa.entity.ts`: adicionar, seguindo
  exatamente o padrão já usado em `colaborador.entity.ts:52-53`:
  ```ts
  @Column({ type: 'boolean', default: true })
  ativo!: boolean
  ```
  (sem `name:` — `ativo` é uma palavra só, camelCase = snake_case).
- `backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`: mesma
  coluna, mesmo formato.

### 1.3 Expor `ativo` nas respostas já existentes (necessário para o frontend decidir os 3 estados)

- `pesquisas.service.ts`:
  - Interfaces `PesquisaRespostaLista` (linha ~63-72) e
    `PesquisaRespostaDetalhe` (linha ~96-108): adicionar campo `ativo: boolean`.
  - `mapearPesquisaLista` (linha ~134) e `montarDetalhe` (linha ~147, no
    objeto de retorno ~198-215): incluir `ativo: pesquisa.ativo`.
- `ciclos-avaliacao.service.ts`:
  - Interface `CicloResposta` (linha ~53-68): adicionar campo
    `ativo: boolean`.
  - `mapearCiclo` (linha ~218, no objeto de retorno ~223-238): incluir
    `ativo: ciclo.ativo`.

### 1.4 Novas funções de service — Pesquisas (`pesquisas.service.ts`)

Duas funções novas, cada uma com `garantirPapel(ator, [...PAPEIS_COM_ACESSO])`
como primeira linha (mesmo array já definido na linha 25, não duplicar
inline no controller):

```ts
export async function inativar(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  if (pesquisa.status !== 'encerrada') {
    throw new ErroHttp(
      422,
      'PESQUISA_NAO_ENCERRADA',
      'Só é possível inativar pesquisas encerradas.',
    )
  }

  if (!pesquisa.ativo) {
    throw new ErroHttp(409, 'PESQUISA_JA_INATIVA', 'Esta pesquisa já está inativa.')
  }

  pesquisa.ativo = false
  const salva = await repositorio().save(pesquisa)

  return montarDetalhe(ator, salva)
}

export async function ativar(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<PesquisaRespostaDetalhe> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const pesquisa = await buscarEntidadeOuFalhar(id)

  if (pesquisa.ativo) {
    throw new ErroHttp(409, 'PESQUISA_JA_ATIVA', 'Esta pesquisa já está ativa.')
  }

  // Sem checagem de `status` aqui: uma pesquisa só chega a `ativo = false`
  // vindo de `inativar()`, que já exige `status === 'encerrada'`, e `status`
  // nunca regride (TRANSICOES_VALIDAS só permite avanço) — logo, reativar
  // sempre encontra a pesquisa ainda encerrada. Não reforçar essa checagem
  // de novo aqui evita lógica redundante sem ganho de segurança real.
  pesquisa.ativo = true
  const salva = await repositorio().save(pesquisa)

  return montarDetalhe(ator, salva)
}
```

**Atenção ao literal exato**: pesquisa usa `'encerrada'` (feminino), não
`'encerrado'`.

### 1.5 Novas funções de service — Ciclos (`ciclos-avaliacao.service.ts`)

Mesmo padrão, literal `'encerrado'` (masculino) e códigos de erro próprios:

```ts
export async function inativar(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)

  if (ciclo.status !== 'encerrado') {
    throw new ErroHttp(
      422,
      'CICLO_NAO_ENCERRADO',
      'Só é possível inativar ciclos encerrados.',
    )
  }

  if (!ciclo.ativo) {
    throw new ErroHttp(409, 'CICLO_JA_INATIVO', 'Este ciclo já está inativo.')
  }

  ciclo.ativo = false
  const salvo = await repositorio().save(ciclo)

  return montarCicloResposta(salvo)
}

export async function ativar(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<CicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ciclo = await buscarCicloOuFalhar(id)

  if (ciclo.ativo) {
    throw new ErroHttp(409, 'CICLO_JA_ATIVO', 'Este ciclo já está ativo.')
  }

  // Mesmo raciocínio de `pesquisas.ativar()`: só chega aqui vindo de
  // `inativar()`, que já exige `status === 'encerrado'`, e `status` nunca
  // regride — reforçar a checagem de status de novo seria redundante.
  ciclo.ativo = true
  const salvo = await repositorio().save(ciclo)

  return montarCicloResposta(salvo)
}
```

**Atenção ao literal exato**: ciclo usa `'encerrado'` (masculino), não
`'encerrada'`. Não confundir com o `status = 'ativo'` do enum
`status_ciclo` — a nova flag `ativo` (boolean) é um campo totalmente
diferente e ortogonal; **não adicionar `ativo`/`inativo` a
`TRANSICOES_VALIDAS`** (que continua regulando só o enum `status`).

### 1.6 Decisão de idempotência (fechada nesta task, não deixar para o developer decidir)

- Inativar um item já inativo (`ativo === false`) → `409` com
  `PESQUISA_JA_INATIVA` / `CICLO_JA_INATIVO`.
- Ativar um item já ativo (`ativo === true`) → `409` com `PESQUISA_JA_ATIVA` /
  `CICLO_JA_ATIVO`.
- Justificativa do `409` (em vez de `422`, reservado ao caso "não encerrado"
  por pedido explícito do enunciado da task): segue o precedente já usado no
  projeto para "estado atual conflita com a operação pedida"
  (`TRANSICAO_STATUS_INVALIDA`, `PESQUISA_NAO_REMOVIVEL`,
  `CICLO_NAO_REMOVIVEL` são todos `409`), reservando `422` para pré-condição
  de dado de entrada/regra de negócio sobre o objeto (`PESQUISA_NAO_ENCERRADA`,
  `CICLO_NAO_ENCERRADO`, `CICLO_SEM_PARTICIPANTES`).

### 1.7 Ajuste das listagens — filtro `ativo`

`pesquisas.service.ts`, função `listar` (linha ~274-302):

```ts
export async function listar(
  ator: ColaboradorAutenticado,
  filtros?: { ativo?: boolean | undefined },
): Promise<PesquisaRespostaLista[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ativoFiltro = filtros?.ativo ?? true
  const pesquisas = await repositorio().find({
    where: { ativo: ativoFiltro },
    order: { criadoEm: 'DESC' },
  })

  // ...resto da função (contagem de perguntas por pesquisa em rascunho,
  // mapearPesquisaLista) inalterado.
}
```

`ciclos-avaliacao.service.ts`, função `listar` (linha ~362-365): mesmo
padrão —

```ts
export async function listar(
  ator: ColaboradorAutenticado,
  filtros?: { ativo?: boolean | undefined },
): Promise<CicloResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const ativoFiltro = filtros?.ativo ?? true
  const ciclos = await repositorio().find({
    where: { ativo: ativoFiltro },
    order: { criadoEm: 'DESC' },
  })

  // ...resto da função inalterado.
}
```

Comportamento resultante (igual nos dois módulos):
- Sem `?ativo=` na query → `where: { ativo: true }` (default, esconde
  inativos — comportamento novo, hoje a listagem não filtra nada).
- `?ativo=false` → só inativos.
- `?ativo=true` → só ativos (equivalente explícito do default).
- Nunca misturar os dois num único resultado (sem opção "todos" no backend).

### 1.8 Controllers

`pesquisas.controller.ts`:
```ts
export async function listarPesquisas(req: Request, res: Response): Promise<void> {
  const ativo = obterQueryBooleanoOpcional(req, 'ativo')
  const resposta = await pesquisasService.listar(req.colaboradorAutenticado!, { ativo })
  res.status(200).json(resposta)
}

export async function inativarPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.inativar(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}

export async function ativarPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.ativar(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}
```
Importar `obterQueryBooleanoOpcional` de `../../common/http-params` (já
importado nesse mesmo arquivo em `colaboradores.controller.ts`, só falta em
`pesquisas.controller.ts`).

`ciclos-avaliacao.controller.ts`: mesmo padrão —
`listarCiclos` ganha `obterQueryBooleanoOpcional(req, 'ativo')` repassado a
`ciclosAvaliacaoService.listar(ator, { ativo })`; novas funções
`inativarCiclo`/`ativarCiclo` espelhando `inativarPesquisa`/`ativarPesquisa`,
chamando `ciclosAvaliacaoService.inativar`/`ativar`.

### 1.9 Rotas

`pesquisas.module.ts` — adicionar, ao lado de `PATCH /:id/status`:
```ts
router.patch('/:id/inativar', asyncHandler(inativarPesquisa))
router.patch('/:id/ativar', asyncHandler(ativarPesquisa))
```
(mais os imports de `inativarPesquisa`/`ativarPesquisa` no bloco de imports
do topo do arquivo).

`ciclos-avaliacao.module.ts` — mesma coisa:
```ts
router.patch('/:id/inativar', asyncHandler(inativarCiclo))
router.patch('/:id/ativar', asyncHandler(ativarCiclo))
```

Papéis permitidos nos 4 endpoints novos: `admin`, `gestor_rh` (via
`garantirPapel` na camada de service — já coberto pelos passos 1.4/1.5,
listado aqui só para fechar a documentação de acesso por rota):
- `PATCH /api/pesquisas/:id/inativar` — admin, gestor_rh
- `PATCH /api/pesquisas/:id/ativar` — admin, gestor_rh
- `PATCH /api/ciclos/:id/inativar` — admin, gestor_rh
- `PATCH /api/ciclos/:id/ativar` — admin, gestor_rh
- `GET /api/pesquisas?ativo=` e `GET /api/ciclos?ativo=` — mesmo papel de
  hoje (admin, gestor_rh), sem mudança de quem acessa a listagem, só do que
  ela retorna por padrão.

### 1.10 DTOs

Nenhum DTO novo é necessário. As rotas `/inativar` e `/ativar` não recebem
body (o `id` já vem da rota, a ação é o próprio verbo do path) — seguem o
mesmo formato de `POST /:id/duplicar`, que também não tem DTO de entrada.
Não criar `dto/inativar-pesquisa.dto.ts` nem equivalente.

### 1.11 Regras de negócio — resumo

- `ativo` é ortogonal ao enum `status` — nunca entra em `TRANSICOES_VALIDAS`.
- Só é possível inativar um item **encerrado** (`'encerrada'` para pesquisa,
  `'encerrado'` para ciclo — literais diferentes, não trocar).
- Ativar não exige checagem de status (justificado no comentário de código
  em 1.4/1.5).
- Idempotência tratada como erro `409` (não silenciosa), conforme 1.6.
- Soft-hide de visibilidade apenas: nenhuma linha de `pesquisas`/
  `ciclos_avaliacao` é apagada; `DELETE` continua exigindo `status ===
  'rascunho'` (`remover()`, inalterado por esta task).

### Tratamento de anonimização

Não aplicável a mudança de comportamento: nenhuma query ou endpoint desta
task lê `respostas`, `itens_resposta`, `respostas_clima`,
`itens_resposta_clima` ou `relacionamentos_avaliacao`. A separação
identificado/agregado (`respostas_identificadas`/`respostas_pares_agregadas`)
e o gate de `minimo_respostas_pares` do módulo `analise` não são tocados por
nenhuma função criada ou alterada aqui. Ponto de atenção não-crítico (já
registrado na spec, não uma ação desta task): qualquer seletor futuro de
ciclo/pesquisa numa tela de `analise` que reutilize `GET /api/ciclos`/
`GET /api/pesquisas` herdará o filtro `ativo = true` por padrão.

## 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Literal de status correto em cada service** — `'encerrada'` em
   `pesquisas.service.ts`, `'encerrado'` em `ciclos-avaliacao.service.ts`.
   Um `'encerrada'`/`'encerrado'` trocado entre os dois arquivos compilaria
   sem erro de tipo só se o union type coincidisse por acaso — checar
   manualmente a string literal em cada `if`.
2. **`garantirPapel(ator, [...PAPEIS_COM_ACESSO])` como primeira linha** nas
   4 novas funções de service (`inativar`/`ativar` em cada módulo) — nunca
   duplicada inline nos controllers.
3. **Nenhuma migration `.ts` foi criada** em `backend/src/migrations/` — a
   regra desta rodada é SQL manual, não arquivo de migration. Se o
   `backend-developer` criou um arquivo `.ts` de migration mesmo assim, isso
   é um achado crítico a devolver.
4. **`ativo` não foi adicionado a `TRANSICOES_VALIDAS`** em nenhum dos dois
   services (é um campo ortogonal ao enum `status`, não uma transição de
   estado do enum).
5. **Filtro de listagem nunca mistura ativos e inativos** — confirmar que
   `where: { ativo: ativoFiltro }` é sempre aplicado (nunca uma query sem
   `where` quando o parâmetro está ausente) e que o default (`ativoFiltro =
   filtros?.ativo ?? true`) de fato esconde inativos quando `?ativo=` não é
   passado.
6. **Nenhuma query nova faz JOIN com `respostas`, `itens_resposta`,
   `respostas_clima`, `itens_resposta_clima` ou `relacionamentos_avaliacao`**
   — confirmar que as funções `inativar`/`ativar`/`listar` tocam só
   `pesquisas`/`ciclos_avaliacao`.
7. **Idempotência retorna erro (`409`), não sucesso silencioso** — confirmar
   que `inativar()` de algo já inativo e `ativar()` de algo já ativo
   realmente lançam `ErroHttp`, em vez de fazer `save()` sem mudança e
   retornar `200` como se tivesse funcionado.
8. **Campo `ativo` exposto em `PesquisaRespostaLista`/`PesquisaRespostaDetalhe`
   e em `CicloResposta`** — sem esse campo no payload, o frontend não
   consegue distinguir os 3 estados (a segunda tela do pipeline depende
   disso).
9. **Rotas montadas na ordem certa** dentro dos `module.ts` — `/:id/inativar`
   e `/:id/ativar` não colidem com `/:id/status` nem com os sub-routers
   (`/:pesquisaId/paginas`, `/:cicloId/participantes`, `/:cicloId/envios`)
   já montados antes das rotas com `:id` solto.
