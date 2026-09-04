# Task: Cargo (select fixo), `eh_gestor` e e-mail opcional para colaborador comum (Backend)

Demanda 100% backend, restrita ao módulo `backend/src/modules/colaboradores/**`
(mais `backend/src/common/enums.ts`, `backend/src/common/http-params.ts` e uma
migration nova em `backend/src/migrations/`). Não toca `frontend/`. Pedido já
esclarecido diretamente pelo usuário — sem etapa de `spec`. Sem etapa de
`test-engineer` nesta task (pedido explícito do usuário).

**Regra de anonimização:** não aplicável. Esta task não toca `ciclos_avaliacao`,
`relacionamentos_avaliacao`, `envios_pesquisa`, `respostas`/`itens_resposta` nem
nenhuma view de resultados — é só o cadastro de colaboradores.

**Papéis:** nenhuma rota nova é criada. As três rotas afetadas
(`POST /api/colaboradores`, `PUT /api/colaboradores/:id`,
`GET /api/colaboradores`) continuam exigindo `garantirPapel(ator, ['admin', 'gestor_rh'])`
exatamente como hoje — `colaborador` nunca acessa nenhuma delas (ele não tem
conta no Supabase Auth, então nunca teria uma sessão válida para chegar aqui de
qualquer forma).

## Estado atual verificado (confirmado por leitura direta antes deste plano)

- `backend/src/modules/colaboradores/colaborador.entity.ts`: `email` é
  `@Column({ type: 'varchar', length: 255 })` (NOT NULL por padrão do TypeORM,
  sem `nullable: true`); `cargo` é `@Column({ type: 'varchar', length: 255, nullable: true })`
  (texto livre); `gestorId`/`gestor` (self `@ManyToOne` via `gestor_id`) já
  existem e não precisam de mudança.
- `backend/src/modules/colaboradores/colaboradores.service.ts`: `criar()` chama
  `validarCamposObrigatorios(dto)` (que já lança antes de qualquer efeito
  colateral) e só depois decide `precisaContaAuth = deveTerContaAuth(papel)` e
  chama `criarContaAuth`. `atualizar()` computa `emailNovo`/`cpfDigitosNovo`
  cedo, mas `papelNovo` só é computado na linha ~371-372, **antes** do bloco de
  promoção (linha ~381 em diante, que chama `criarContaAuth`) — ponto exato
  onde a nova checagem "papel exige e-mail" deste plano precisa entrar.
- `garantirEmailECpfUnicos(email, cpfDigitos, idParaExcluir?)` faz dois
  `findOneBy` sequenciais (cpf, depois email) — precisa aceitar `email: string | null`
  e pular a checagem de e-mail quando `null` (UNIQUE do Postgres já permite
  múltiplos `NULL`, não há o que checar).
- `backend/src/common/validacao.ts`: `validarEnum<T extends string>(valor, valoresValidos, campo)`
  já existe e é genérico o bastante para validar `cargo` contra uma lista fixa
  — não precisa de nova função, só reaproveitar `validarEnum` no lugar de
  `validarTextoObrigatorio` para o campo `cargo`.
- `backend/src/common/enums.ts`: padrão já estabelecido para listas de valores
  fixos é `export type X = 'a' | 'b' | ...` + `export const X_VALORES: X[] = [...]`
  (ver `PAPEL_COLABORADOR_VALORES`, `TIPO_PERGUNTA_VALORES`, etc.) — seguir o
  mesmo padrão para `cargo`.
- `backend/src/common/http-params.ts` só tem `obterParametroRota` (params de
  rota). Não existe hoje nenhum helper para query string — precisa de um novo
  para os filtros de listagem do item 2.
- `backend/src/middlewares/tratadorErros.ts`: `MAPA_CONSTRAINT_PARA_CODIGO` só
  mapeia violações de `UNIQUE` (`err.code === '23505'`); a constraint `CHECK`
  já existente `chk_colaboradores_papel_auth` (da migration original) **não**
  está nesse mapa — violações de `CHECK` (`err.code === '23514'`) caem hoje no
  fallback genérico `500 ERRO_INTERNO`. Isso é o padrão já aceito no projeto
  (checagem de aplicação é a via "amigável"; o `CHECK` no banco é só a segunda
  camada de defesa) — a nova `CHECK` do item 3 abaixo segue o mesmo padrão,
  **sem** precisar de entrada nova em `tratadorErros`.
- Nenhuma migration do projeto rodou contra banco real ainda (confirmado pelo
  CLAUDE.md). Última migration existente: `1788500000000-CriarColetaRespostasPublica.ts`
  — as migrations novas desta task precisam de timestamp maior que esse.
- Padrão de migration de correção já em uso (`1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`):
  arquivo dedicado por conjunto de mudanças relacionadas, com comentário no
  topo da classe explicando o que é e a instrução de não rodar sem confirmação.

## Plano — Backend

### 1. backend-developer

#### 1.1 Cargo vira lista fixa de opções (sem migration)

- `backend/src/common/enums.ts`: adicionar, seguindo exatamente o padrão já
  usado por `PAPEL_COLABORADOR_VALORES` etc.:
  ```ts
  /**
   * Lista fixa de cargos válidos para `colaboradores.cargo` — validada só em
   * aplicação (a coluna continua `varchar` livre no banco, sem enum
   * Postgres/migration). Adicionar uma opção nova é uma mudança de código
   * (editar este array), nunca uma migration.
   */
  export type CargoColaborador =
    | 'Auxiliar de Escritório'
    | 'Auxiliar Administrativo'
    | 'Assistente Administrativo'
    | 'Recepcionista'
    | 'Atendente'
    | 'Auxiliar Financeiro'
    | 'Analista Financeiro'
    | 'Contador'
    | 'Assistente de RH'
    | 'Analista de RH'
    | 'Gerente de RH'
    | 'Coordenador'
    | 'Supervisor'
    | 'Gerente'
    | 'Diretor'
    | 'Gestor'

  export const CARGO_COLABORADOR_VALORES: CargoColaborador[] = [
    'Auxiliar de Escritório',
    'Auxiliar Administrativo',
    'Assistente Administrativo',
    'Recepcionista',
    'Atendente',
    'Auxiliar Financeiro',
    'Analista Financeiro',
    'Contador',
    'Assistente de RH',
    'Analista de RH',
    'Gerente de RH',
    'Coordenador',
    'Supervisor',
    'Gerente',
    'Diretor',
    'Gestor',
  ]
  ```
  Usar exatamente esses 16 valores/grafias (acentuação e maiúsculas incluídas)
  — é o que o frontend vai mandar no `<select>`.
- `dto/criar-colaborador.dto.ts`: `cargo?: CargoColaborador` (era `cargo?: string`).
- `dto/atualizar-colaborador.dto.ts`: `cargo?: CargoColaborador` (era `cargo?: string`).
- `colaboradores.service.ts`:
  - `CamposValidados.cargo` passa a ser `CargoColaborador | null`.
  - Em `validarCamposObrigatorios`, trocar
    `dto.cargo !== undefined ? validarTextoObrigatorio(dto.cargo, { campo: 'cargo', min: 1, max: 255 }) : null`
    por
    `dto.cargo !== undefined ? validarEnum(dto.cargo, CARGO_COLABORADOR_VALORES, 'cargo') : null`.
  - Em `atualizar()`, trocar o bloco
    `if (dto.cargo !== undefined) { colaborador.cargo = validarTextoObrigatorio(...) }`
    por `if (dto.cargo !== undefined) { colaborador.cargo = validarEnum(dto.cargo, CARGO_COLABORADOR_VALORES, 'cargo') }`.
  - Importar `CARGO_COLABORADOR_VALORES` (e o tipo, se necessário) de
    `../../common/enums`.
  - Valor fora da lista → `422 CAMPO_INVALIDO` (comportamento já embutido em
    `validarEnum`, nenhuma mensagem nova a escrever).
- Não criar migration, não alterar o tipo da coluna `cargo` na entidade (continua
  `@Column({ type: 'varchar', length: 255, nullable: true })`).

#### 1.2 Novo campo `eh_gestor` (boolean, default `false`) + listagem filtrável

**Entidade** (`colaborador.entity.ts`):
```ts
@Column({ name: 'eh_gestor', type: 'boolean', default: false })
ehGestor!: boolean
```
Adicionar logo após a coluna `ativo` (ou próximo de `gestorId`/`gestor`, por
proximidade semântica — decisão livre do `backend-developer`, sem impacto
funcional).

**Migration nova** (não editar nenhuma migration existente —
`1788268503083-CriarEquipesEColaboradores.ts` corresponde a task já fechada):
arquivo `backend/src/migrations/<timestamp>-AdicionarEhGestorColaboradores.ts`,
timestamp maior que `1788500000000` (última existente), sugestão
`1788550000000`. Conteúdo `up`:
```sql
ALTER TABLE colaboradores
  ADD COLUMN eh_gestor boolean NOT NULL DEFAULT false;
```
`down`:
```sql
ALTER TABLE colaboradores
  DROP COLUMN eh_gestor;
```
Opcional (sugestão, não obrigatória — só criar se o `backend-developer` achar
que vale, já que o filtro do item abaixo roda sobre uma tabela pequena):
índice parcial `CREATE INDEX idx_colaboradores_eh_gestor ON colaboradores (eh_gestor) WHERE eh_gestor = true AND ativo = true;`
com `DROP INDEX idx_colaboradores_eh_gestor;` no `down` correspondente, criado
**antes** do `DROP COLUMN` no `down`.

**DTOs:**
- `criar-colaborador.dto.ts`: `ehGestor?: boolean` (default `false` quando
  omitido).
- `atualizar-colaborador.dto.ts`: `ehGestor?: boolean`.

**Service (`colaboradores.service.ts`):**
- `criar()`: ao montar `novoColaborador`, incluir `ehGestor: dto.ehGestor ?? false`.
  Se `dto.ehGestor` estiver presente e não for `boolean` → `422 CAMPO_INVALIDO`
  (`Campo "ehGestor" deve ser booleano.`), checagem simples via `typeof`, sem
  precisar de helper novo (só `equipeId`/`gestorId` usam o padrão `'campo' in dto`
  porque distinguem "ausente" de "null" — `ehGestor` não tem estado "limpar",
  só true/false/ausente).
- `atualizar()`: `if (dto.ehGestor !== undefined) { if (typeof dto.ehGestor !== 'boolean') throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "ehGestor" deve ser booleano.'); colaborador.ehGestor = dto.ehGestor }`.
- `mapearColaborador()` e as interfaces `ColaboradorResposta`/`ColaboradorRespostaCriacao`:
  adicionar `ehGestor: boolean` no shape de resposta (logo após `ativo`, para
  manter a mesma ordem lógica da entidade).

**Listagem filtrável para popular o select de gestor no formulário
(reaproveitar `GET /api/colaboradores`, não criar endpoint novo):**

- Já existe listagem simples em `colaboradores.controller.ts` →
  `listarColaboradores` → `colaboradoresService.listar(ator)`, sem filtros.
  Estender essa mesma rota com query params opcionais em vez de criar uma rota
  nova, mantendo compatibilidade total com quem já consome `GET /api/colaboradores`
  sem filtro nenhum (comportamento idêntico ao atual quando nenhum query param
  é enviado).
- `backend/src/common/http-params.ts`: adicionar
  ```ts
  /**
   * Lê um filtro booleano opcional de query string (`req.query[nome]`).
   * Ausente → undefined (sem filtro). Presente → precisa ser exatamente
   * "true" ou "false", senão 400.
   */
  export function obterQueryBooleanoOpcional(req: Request, nome: string): boolean | undefined {
    const valor = req.query[nome]
    if (valor === undefined) return undefined
    if (valor === 'true') return true
    if (valor === 'false') return false
    throw new ErroHttp(400, 'PARAMETRO_INVALIDO', `Parâmetro de consulta "${nome}" deve ser "true" ou "false".`)
  }
  ```
- `colaboradores.controller.ts` → `listarColaboradores`:
  ```ts
  export async function listarColaboradores(req: Request, res: Response): Promise<void> {
    const ehGestor = obterQueryBooleanoOpcional(req, 'ehGestor')
    const ativo = obterQueryBooleanoOpcional(req, 'ativo')
    const resposta = await colaboradoresService.listar(req.colaboradorAutenticado!, { ehGestor, ativo })
    res.status(200).json(resposta)
  }
  ```
- `colaboradores.service.ts` → `listar()`:
  ```ts
  export async function listar(
    ator: ColaboradorAutenticado,
    filtros?: { ehGestor?: boolean; ativo?: boolean },
  ): Promise<ColaboradorResposta[]> {
    garantirPapel(ator, [...PAPEIS_COM_ACESSO])

    const where: FindOptionsWhere<Colaborador> = {}
    if (filtros?.ehGestor !== undefined) where.ehGestor = filtros.ehGestor
    if (filtros?.ativo !== undefined) where.ativo = filtros.ativo

    const colaboradores = await repositorio().find({
      where,
      relations: { equipe: true, gestor: true },
      order: { criadoEm: 'ASC' },
    })

    return colaboradores.map(mapearColaborador)
  }
  ```
  (importar `FindOptionsWhere` de `typeorm`). Sem filtros → `where: {}` →
  comportamento idêntico ao `find()` atual.
- Uso esperado pelo frontend (fora de escopo desta task, só para contexto):
  `GET /api/colaboradores?ehGestor=true&ativo=true` para popular o `<select>`
  de gestor no formulário de cadastro/edição. Papéis permitidos continuam
  `admin`/`gestor_rh` — mesma rota, mesma checagem, nenhuma exposição nova a
  `colaborador`.

#### 1.3 E-mail obrigatório só para `admin`/`gestor_rh`

**Entidade** (`colaborador.entity.ts`):
```ts
@Column({ type: 'varchar', length: 255, nullable: true })
email!: string | null
```

**Migration nova** — decisão: migration **separada** da do item 1.2 (não
combinar as duas em um único arquivo), porque são preocupações distintas
(hierarquia organizacional vs. nulabilidade de contato) e cada uma deve poder
ser revertida independentemente sem arrastar a outra — mesmo padrão de
granularidade já usado no histórico do projeto (`1788350000000`, `1788400000000`,
`1788450000000` são três migrations separadas tocando áreas próximas dentro da
mesma leva de trabalho). Arquivo
`backend/src/migrations/<timestamp>-EmailColaboradorOpcional.ts`, timestamp
maior que o da migration do item 1.2, sugestão `1788600000000`.

`up`:
```sql
ALTER TABLE colaboradores
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE colaboradores
  ADD CONSTRAINT chk_colaboradores_papel_email
  CHECK (papel = 'colaborador' OR email IS NOT NULL);
```
A `CHECK` extra não foi pedida literalmente no enunciado, mas segue o mesmo
padrão de dupla defesa já usado por `chk_colaboradores_papel_auth` na migration
original (regra dura reforçada em aplicação **e** banco) — adicionar por
consistência com a convenção do projeto. Se o `backend-developer` preferir
não adicionar essa `CHECK` para manter o escopo estritamente literal ao
pedido, isso deve ficar registrado explicitamente no resumo da task como
desvio deliberado, não como esquecimento.

`down`:
```sql
ALTER TABLE colaboradores
  DROP CONSTRAINT chk_colaboradores_papel_email;

ALTER TABLE colaboradores
  ALTER COLUMN email SET NOT NULL;
```
Observação a comentar no arquivo (mesmo padrão do `down` de
`1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`): o `ALTER COLUMN email
SET NOT NULL` só reverte sem erro se, no momento do revert, não existir
nenhuma linha com `email IS NULL` (ou seja, nenhum `colaborador` sem e-mail foi
cadastrado ainda) — limitação inerente, não é um bug da migration.

A constraint `UNIQUE` existente (`uq_colaboradores_email`, da migration
original) **não muda** — Postgres já trata cada `NULL` como distinto sob
`UNIQUE`, então múltiplos colaboradores sem e-mail continuam permitidos sem
qualquer ajuste na constraint. `tratadorErros` também não precisa de mudança
(mapeamento `uq_colaboradores_email → EMAIL_DUPLICADO` já existe e continua
válido; a nova `CHECK` cai no fallback genérico `500`, mesmo padrão já aceito
para `chk_colaboradores_papel_auth`, ver "Estado atual verificado" acima).

**DTOs:**
- `criar-colaborador.dto.ts`: `email?: string` (era `email: string` —
  obrigatoriedade agora é condicional ao papel, decidida no service, não no
  tipo do DTO).
- `atualizar-colaborador.dto.ts`: `email?: string | null` (era `email?: string`).
  Seguir exatamente o mesmo padrão já usado por `equipeId`/`gestorId` (comentário
  no topo do arquivo já documenta a distinção "ausente vs. null" — estender esse
  mesmo comentário para incluir `email`): chave ausente → não mexe; chave
  presente com `null` → limpa o e-mail (só permitido se o papel resultante for
  `colaborador`, checado no service); chave presente com string → valida
  formato e unicidade.

**Service (`colaboradores.service.ts`):**

`validarCamposObrigatorios` (usado por `criar`) — reordenar para validar
e-mail condicionalmente ao papel, **antes** de qualquer outra coisa que possa
levar a uma chamada ao Supabase Auth:
```ts
function validarCamposObrigatorios(dto: CriarColaboradorDto): CamposValidados {
  const nomeCompleto = validarTextoObrigatorio(dto.nomeCompleto, { campo: 'nomeCompleto', min: 2, max: 255 })
  const papel = validarEnum(dto.papel, PAPEL_COLABORADOR_VALORES, 'papel')

  let email: string | null = null
  if (dto.email !== undefined && dto.email !== null && String(dto.email).trim().length > 0) {
    email = validarEmail(dto.email, 'email')
  }

  if (deveTerContaAuth(papel) && email === null) {
    throw new ErroHttp(
      422,
      'EMAIL_OBRIGATORIO_PARA_PAPEL',
      'E-mail é obrigatório para os papéis admin e gestor_rh.',
    )
  }

  const cpfDigitos = normalizarCpf(dto.cpf)
  if (!validarCpf(cpfDigitos)) {
    throw new ErroHttp(422, 'CPF_INVALIDO', 'CPF inválido.')
  }

  const cargo = dto.cargo !== undefined ? validarEnum(dto.cargo, CARGO_COLABORADOR_VALORES, 'cargo') : null

  return { nomeCompleto, email, papel, cpfDigitos, cargo }
}
```
`CamposValidados.email` passa a ser `string | null`. Como esta função inteira
já roda antes de `precisaContaAuth`/`criarContaAuth` em `criar()` (linha
~230-237 hoje), o novo `throw` cedo aqui já satisfaz "bloquear antes de
qualquer chamada ao Supabase Auth" sem precisar de mudança estrutural em
`criar()` além de propagar `email: string | null`.

`garantirEmailECpfUnicos` — aceitar `email: string | null` e pular a checagem
de unicidade de e-mail quando `null`:
```ts
async function garantirEmailECpfUnicos(
  email: string | null,
  cpfDigitos: string,
  idParaExcluir?: string,
): Promise<void> {
  const existentePorCpf = await repositorio().findOneBy({ cpf: cpfDigitos })
  if (existentePorCpf && existentePorCpf.id !== idParaExcluir) {
    throw new ErroHttp(409, 'CPF_DUPLICADO', 'Já existe um colaborador com este CPF.')
  }

  if (email !== null) {
    const existentePorEmail = await repositorio().findOneBy({ email })
    if (existentePorEmail && existentePorEmail.id !== idParaExcluir) {
      throw new ErroHttp(409, 'EMAIL_DUPLICADO', 'Já existe um colaborador com este e-mail.')
    }
  }
}
```

`criar()`: nenhuma mudança estrutural além de propagar o novo tipo — `email`
vindo de `validarCamposObrigatorios` já é `string | null`, passa direto para
`garantirEmailECpfUnicos(email, cpfDigitos)` e para `repositorio().create({ ..., email, ... })`.

`atualizar()` — pontos a mudar, na ordem em que já aparecem na função hoje:
1. Cálculo de `emailNovo`, trocar
   ```ts
   let emailNovo = colaborador.email
   if (dto.email !== undefined) {
     emailNovo = validarEmail(dto.email, 'email')
   }
   ```
   por
   ```ts
   let emailNovo: string | null = colaborador.email
   if ('email' in dto) {
     emailNovo = dto.email === null ? null : validarEmail(dto.email, 'email')
   }
   ```
2. Checagem de unicidade, trocar a condição
   `if (emailNovo !== colaborador.email || cpfDigitosNovo !== colaborador.cpf)`
   por chamar sempre `garantirEmailECpfUnicos(emailNovo, cpfDigitosNovo, id)`
   quando qualquer um dos dois mudou — a função já ignora `email` quando `null`,
   então a condição existente continua correta sem mudança adicional, só o tipo
   do parâmetro.
3. **Novo bloco**, inserido logo depois de `papelNovo` ser calculado (linha
   ~372 hoje, `const papelNovo = dto.papel !== undefined ? validarEnum(...) : papelAtual`)
   e **antes** do bloco `contaAtualExiste`/`contaNovaNecessaria`/qualquer
   `criarContaAuth` (linha ~381 em diante):
   ```ts
   if (deveTerContaAuth(papelNovo) && emailNovo === null) {
     throw new ErroHttp(
       422,
       'EMAIL_OBRIGATORIO_PARA_PAPEL',
       'E-mail é obrigatório para os papéis admin e gestor_rh.',
     )
   }
   ```
   Isso cobre tanto "promover colaborador sem e-mail para admin/gestor_rh" (o
   `usuarioAuthId` atual é `null`, cairia no bloco de promoção que chama
   `criarContaAuth`) quanto "editar um admin/gestor_rh já existente limpando o
   e-mail" (`dto.email === null` com `papel` inalterado ainda `admin`/`gestor_rh`)
   — em ambos os casos o bloqueio acontece antes de qualquer efeito colateral
   (nenhum `save()`, nenhuma chamada Auth).
4. `colaborador.email = emailNovo` (linha ~377 hoje) já funciona sem mudança
   adicional, só o tipo.

`mapearColaborador()` / `ColaboradorResposta.email`: tipo passa a ser
`string | null`.

**Import novo em `colaboradores.service.ts`:** `CARGO_COLABORADOR_VALORES` de
`../../common/enums` (junto dos já importados `PAPEL_COLABORADOR_VALORES`/`PapelColaborador`).

#### 1.4 Checklist de fechamento

- `npm run build` (tsc) dentro de `backend/` sem erros ao final.
- Nenhuma migration executada contra banco real (`npm run migration:run` não
  deve ser chamado nesta task sem confirmação explícita do usuário).
- Registrar no resumo da task os dois nomes de arquivo de migration
  efetivamente criados (com timestamp real usado) e se a `CHECK
  chk_colaboradores_papel_email` do item 1.3 foi incluída ou deliberadamente
  omitida.

#### 1.5 Status: CONCLUÍDO (backend-developer)

Implementado exatamente conforme o plano acima. Resumo:

- **Cargo (lista fixa, sem migration):** `CargoColaborador` + `CARGO_COLABORADOR_VALORES`
  (16 valores) adicionados a `backend/src/common/enums.ts`. DTOs de criar/atualizar
  colaborador passaram a tipar `cargo?: CargoColaborador`. `colaboradores.service.ts`
  passou a validar `cargo` com `validarEnum(..., CARGO_COLABORADOR_VALORES, 'cargo')`
  em `validarCamposObrigatorios` (criar) e em `atualizar`. A coluna `cargo` na entidade
  e no banco continua `varchar` livre — nenhuma migration criada para este item.
- **`eh_gestor` (boolean, default false) + listagem filtrável:** coluna `ehGestor`
  adicionada a `colaborador.entity.ts` (`@Column({ name: 'eh_gestor', type: 'boolean', default: false })`),
  logo após `ativo`. Migration nova
  `backend/src/migrations/1788550000000-AdicionarEhGestorColaboradores.ts`
  (`ADD COLUMN eh_gestor boolean NOT NULL DEFAULT false` + índice parcial
  `idx_colaboradores_eh_gestor` para `eh_gestor = true AND ativo = true`; `down` remove
  o índice antes da coluna). DTOs ganharam `ehGestor?: boolean`. `criar()` usa
  `dto.ehGestor ?? false` e valida `typeof` antes de qualquer chamada Auth; `atualizar()`
  valida `typeof` e atribui. `mapearColaborador`/`ColaboradorResposta` expõem
  `ehGestor: boolean`. `GET /api/colaboradores` ganhou query params opcionais
  `ehGestor`/`ativo` via novo helper `obterQueryBooleanoOpcional`
  (`backend/src/common/http-params.ts`); sem filtro, comportamento idêntico ao anterior
  (mesma `garantirPapel(['admin', 'gestor_rh'])`, nenhuma rota nova).
- **E-mail opcional, obrigatório só para admin/gestor_rh:** `email` virou
  `string | null` na entidade (`nullable: true`). Migration nova
  `backend/src/migrations/1788600000000-EmailColaboradorOpcional.ts`
  (`ALTER COLUMN email DROP NOT NULL` + `CHECK chk_colaboradores_papel_email
  (papel = 'colaborador' OR email IS NOT NULL)` — **CHECK incluída**, não omitida,
  por consistência com `chk_colaboradores_papel_auth` já existente). `down` remove a
  `CHECK` antes de `SET NOT NULL` (reversível só se não houver linha com email nulo).
  `validarCamposObrigatorios` (criar) e o novo bloco em `atualizar()` (logo após
  `papelNovo` ser calculado, antes de qualquer `criarContaAuth`) lançam
  `422 EMAIL_OBRIGATORIO_PARA_PAPEL` quando `deveTerContaAuth(papel) && email === null` —
  cobre os 4 casos do plano (criar sem e-mail, promover sem e-mail, limpar e-mail de
  admin/gestor_rh existente, limpar e-mail de colaborador comum permitido).
  `garantirEmailECpfUnicos` pula a checagem de e-mail quando `null` (CPF sempre
  checado). `UNIQUE (email)` não foi alterada (Postgres já permite múltiplos `NULL`).
  `ColaboradorResposta.email`/`ParticipanteResposta.email` (módulo
  `ciclo-participantes`, ajuste mecânico de tipo necessário para o build,
  fora do escopo original do plano mas inevitável pela mudança de tipo na entidade)
  passaram a `string | null`.
- **Ajustes de tipo necessários fora do escopo literal do plano (para manter o build
  verde), registrados aqui por transparência:**
  - `backend/src/middlewares/autenticacao.ts`: `email: colaborador.email!` (non-null
    assertion com comentário) — só admin/gestor_rh chegam a esse middleware e ambos
    sempre têm e-mail garantido por `EMAIL_OBRIGATORIO_PARA_PAPEL` + `CHECK`.
  - `backend/src/modules/ciclo-participantes/ciclo-participantes.service.ts`:
    `ParticipanteResposta.email` mudou de `string` para `string | null` (participantes
    de ciclo podem ser qualquer colaborador, inclusive `colaborador` comum sem e-mail).
  - `backend/src/test/fixtures.ts`: `atorDe()` usa `colaborador.email!` (mesma lógica
    do middleware — só usado para atores admin/gestor_rh nos testes).
  - `colaboradores.service.ts` → `listar()`: assinatura do parâmetro `filtros` usa
    `boolean | undefined` explícito (não só `?:`) por causa de
    `exactOptionalPropertyTypes: true` no `tsconfig.json`.

**Migrations criadas** (nenhuma executada contra banco real):
1. `backend/src/migrations/1788550000000-AdicionarEhGestorColaboradores.ts`
2. `backend/src/migrations/1788600000000-EmailColaboradorOpcional.ts`

**Checklist de fechamento:**
- `npm run build` (tsc) dentro de `backend/`: sem erros nos arquivos tocados por esta
  task. Resta 1 erro pré-existente e não relacionado em `src/test/fakeRepository.ts`
  (`TS2352`, confirmado presente também no `HEAD` antes desta task via `git stash`) —
  não corrigido aqui por estar fora do escopo desta demanda.
- `npm test` (vitest): 6 arquivos de teste, 141 testes, todos passando.
- Nenhuma migration executada (`migration:run` não foi chamado).

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Cargo**: `CARGO_COLABORADOR_VALORES` tem exatamente os 16 valores pedidos,
   sem tradução/reformatação de grafia; `criar-colaborador.dto.ts` e
   `atualizar-colaborador.dto.ts` usam `CargoColaborador` (não `string` solto);
   `cargo` fora da lista → `422 CAMPO_INVALIDO` em ambos os fluxos (criar e
   atualizar), nunca aceito silenciosamente. Confirmar que **nenhuma** migration
   foi criada/alterada para este item — a coluna `cargo` continua `varchar`
   livre no banco.
2. **`eh_gestor`**: coluna nova via migration **nova** (nunca editando
   `1788268503083-CriarEquipesEColaboradores.ts` in-place); default `false` no
   banco **e** no service (`dto.ehGestor ?? false` em `criar`); tipo booleano
   validado explicitamente em `atualizar` (não aceitar string `"true"`/`1`
   silenciosamente). `GET /api/colaboradores?ehGestor=true&ativo=true`
   continua exigindo `admin`/`gestor_rh` (mesma `garantirPapel` de sempre) —
   nenhuma exposição nova a `colaborador`. Sem filtro nenhum, a rota deve se
   comportar exatamente como antes (lista completa).
3. **E-mail opcional**:
   - `email` é `nullable: true` na entidade **e** a migration realmente contém
     `ALTER COLUMN email DROP NOT NULL` (não só na entidade TypeORM — sem
     `synchronize: true`, a entidade sozinha não muda o schema real).
   - Regra dura papel→e-mail: `admin`/`gestor_rh` **sempre** precisam de
     `email` não nulo, tanto em `criar` (`validarCamposObrigatorios`) quanto em
     `atualizar` — cobrir mentalmente os 4 casos: (a) criar admin/gestor_rh sem
     e-mail → `422` antes de qualquer chamada Auth; (b) promover colaborador
     sem e-mail a admin/gestor_rh → `422` antes de `criarContaAuth`; (c) editar
     admin/gestor_rh existente limpando o e-mail (`email: null`) sem trocar o
     papel → `422`; (d) editar colaborador comum limpando o e-mail → permitido,
     sem chamada Auth.
   - Conferir que o bloqueio do caso (a)/(b) acontece **antes** de
     `supabaseAdmin.auth.admin.createUser` ser chamado — nenhuma tentativa de
     criar conta primeiro para depois falhar/compensar.
   - `garantirEmailECpfUnicos` pula a checagem de e-mail quando `null`, mas
     **continua** checando CPF sempre.
   - `UNIQUE (email)` (`uq_colaboradores_email`) não foi alterada/recriada —
     confirmar que múltiplos colaboradores com `email = null` não geram `409`
     falso positivo (checagem de aplicação já pula esse caso; a constraint do
     banco por si só já permite múltiplos `NULL`).
   - Se a `CHECK chk_colaboradores_papel_email` foi adicionada: nome exato da
     constraint bate com o `down` da migration; se foi omitida, isso está
     registrado explicitamente no resumo da task como decisão, não como
     esquecimento.
4. **Nenhuma rota nova foi criada** — `GET /api/colaboradores` ganhou query
   params opcionais, não virou um endpoint diferente; `POST`/`PUT` continuam
   nos mesmos paths.
5. **Casing/shape de resposta**: `ColaboradorResposta` inclui `ehGestor: boolean`
   e `email: string | null` (não `string` fixo); nenhum campo novo vazando
   `snake_case` cru.
6. **Migrations**: as duas novas (`AdicionarEhGestorColaboradores`,
   `EmailColaboradorOpcional`) têm timestamps estritamente maiores que
   `1788500000000` e entre si; nenhuma foi executada contra banco real;
   `down` de cada uma reverte exatamente o que o `up` fez, na ordem inversa
   (drop de `CHECK`/índice antes de `SET NOT NULL`/`DROP COLUMN`, conforme
   aplicável).

## Revisão

Revisão feita lendo diretamente o estado atual de todos os arquivos tocados
(`colaboradores.service.ts`, `colaboradores.controller.ts`,
`colaboradores.module.ts`, `colaborador.entity.ts`, os dois DTOs, as duas
migrations novas, `common/enums.ts`, `common/http-params.ts`,
`common/autorizacao.ts`, `common/validacao.ts`, `middlewares/autenticacao.ts`,
`ciclo-participantes.service.ts`, `test/fixtures.ts`) contra o plano acima.

### Crítico

Sem achados críticos.

- **Anonimização**: não aplicável a esta task (confirmado — nenhum arquivo
  tocado pertence a `ciclos_avaliacao`, `relacionamentos_avaliacao`,
  `envios_pesquisa`, `respostas`/`itens_resposta` ou views de resultado).
- **Controle de acesso**: `criar`, `listar`, `buscarPorId`, `atualizar` e
  `atualizarStatus` em `colaboradores.service.ts` continuam chamando
  `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha, sem
  nenhuma checagem de papel duplicada inline em `colaboradores.controller.ts`
  ou `colaboradores.module.ts`. Nenhuma rota nova foi criada — `GET
  /api/colaboradores` ganhou só query params opcionais
  (`ehGestor`/`ativo`, via `obterQueryBooleanoOpcional`), mesma
  `garantirPapel` de sempre, sem filtro → comportamento idêntico ao anterior.
  `colaborador` nunca alcança essas rotas (nem tem sessão Auth).
- **Ordem de validação vs. chamada ao Supabase Auth**: confirmado nos dois
  fluxos.
  - `criar()`: `validarCamposObrigatorios` (síncrona, sem I/O) já lança
    `422 EMAIL_OBRIGATORIO_PARA_PAPEL` antes de qualquer `await` — inclusive
    antes das checagens de unicidade/equipe/gestor no banco, então
    a fortiori antes de `criarContaAuth` (linha ~264).
  - `atualizar()`: o bloco `if (deveTerContaAuth(papelNovo) && emailNovo ===
    null) throw ...` (linha ~421) está posicionado depois de `papelNovo` ser
    calculado e antes de `contaAtualExiste`/`contaNovaNecessaria` e de
    qualquer `criarContaAuth` (linhas ~439 e ~450) — cobre corretamente os 4
    casos do checklist: (a) criar admin/gestor_rh sem e-mail, (b) promover
    colaborador sem e-mail, (c) limpar e-mail de admin/gestor_rh existente
    sem trocar papel, (d) limpar e-mail de colaborador comum (permitido, sem
    chamada Auth).

### Deveria corrigir

Nenhum item.

### Sugestão

1. **Ordem de validações síncronas vs. I/O em `criar()`/`atualizar()`**: a
   checagem `typeof dto.ehGestor !== 'boolean'` roda depois de
   `garantirEmailECpfUnicos`/`garantirEquipeExiste`/`garantirGestorValido`
   (chamadas ao banco) em `criar()` (linhas ~243–254), e depois de
   `garantirEmailECpfUnicos`/`garantirEquipeExiste`/`garantirGestorValido` em
   `atualizar()`. Não é um problema de correção (nenhum efeito colateral
   irreversível acontece antes — são só leituras), mas quebra o padrão
   "fail-fast" de validar tudo que é síncrono antes de qualquer I/O, já
   seguido pelo restante da função para os demais campos. Puramente
   cosmético/performance.
2. **Cobertura de teste ausente para as regras novas**: não existe
   `colaboradores.service.test.ts` (nem qualquer teste automatizado) cobrindo
   `EMAIL_OBRIGATORIO_PARA_PAPEL` nos 4 casos, a validação de `cargo` fora da
   lista fixa, o `typeof` de `ehGestor`, nem os filtros `ehGestor`/`ativo` de
   `listar()`. Sei que esta task exclui deliberadamente a etapa
   `test-engineer` a pedido do usuário — registrando aqui só para
   rastreabilidade, não como bloqueio.
3. **Empty string em `email`**: em `validarCamposObrigatorios` (criar), uma
   string vazia/whitespace em `dto.email` é silenciosamente tratada como "sem
   e-mail" (vira `null`) em vez de `422 CAMPO_INVALIDO` por formato inválido.
   Comportamento implementado exatamente como especificado no plano — só
   registrando para o caso de o comportamento não ser o desejado pelo
   frontend (ex.: um `<input type="email">` que envia `""` em vez de omitir a
   chave).

### Confirmações pontuais do checklist

- `CARGO_COLABORADOR_VALORES` (`common/enums.ts`) tem exatamente os 16
  valores/grafias do plano, sem tradução; ambos os DTOs usam
  `cargo?: CargoColaborador`; fora da lista → `422 CAMPO_INVALIDO` via
  `validarEnum` em criar e atualizar. Nenhuma migration tocou a coluna
  `cargo` (continua `varchar` livre em `colaborador.entity.ts` e no banco).
- `eh_gestor`: migration nova
  `1788550000000-AdicionarEhGestorColaboradores.ts` (não edita
  `1788268503083-CriarEquipesEColaboradores.ts`), `ADD COLUMN ... DEFAULT
  false` + índice parcial; `down` remove o índice antes da coluna. Default
  `false` também no service (`dto.ehGestor ?? false`). `atualizar` valida
  `typeof` explicitamente (não aceita `"true"`/`1`).
- `email` nullable: migration `1788600000000-EmailColaboradorOpcional.ts`
  contém de fato `ALTER COLUMN email DROP NOT NULL` no banco (não só
  `nullable: true` na entidade) + `CHECK chk_colaboradores_papel_email`
  (nome bate entre `up` e `down`); `down` remove a `CHECK` antes do `SET NOT
  NULL`, com comentário sobre a limitação de revert se já houver linha com
  `email IS NULL`. `garantirEmailECpfUnicos` pula a checagem de e-mail só
  quando `null`, mas sempre checa CPF. `UNIQUE (email)` original não foi
  alterada — comportamento correto do Postgres (múltiplos `NULL` distintos)
  confirmado, sem falso positivo de `409` na checagem de aplicação.
- `ColaboradorResposta`: `ehGestor: boolean` e `email: string | null`
  presentes e corretamente tipados; nenhum campo novo em `snake_case` cru
  vazando na resposta.
- Ajustes de tipo fora do plano original (`middlewares/autenticacao.ts`,
  `ciclo-participantes.service.ts`, `test/fixtures.ts`) revisados: coerentes
  com a mudança de `email` para `string | null` e com o fato de só
  admin/gestor_rh chegarem ao middleware `autenticar` (non-null assertions
  comentadas e seguras nesse contexto).

**Conclusão**: sem achados críticos — pode prosseguir para a próxima etapa do
pipeline conforme definido nesta task (sem `test-engineer`, por pedido
explícito do usuário).
