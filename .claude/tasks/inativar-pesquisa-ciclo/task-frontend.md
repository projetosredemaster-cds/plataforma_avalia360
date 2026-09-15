## Plano — Frontend

Base: `.claude/tasks/inativar-pesquisa-ciclo/spec.md` (decisões já fechadas, não
reabertas aqui) + contrato de backend fechado pelo orquestrador:

- `PATCH /api/pesquisas/:id/inativar`, `PATCH /api/pesquisas/:id/ativar`
- `PATCH /api/ciclos/:id/inativar`, `PATCH /api/ciclos/:id/ativar`
- `GET /api/pesquisas`/`GET /api/ciclos` aceitam query param booleano opcional
  `ativo`: ausente → só ativos (default); `?ativo=false` → só inativos. Não
  existe opção "todos" no backend.
- `ativo: boolean` passa a vir no payload de pesquisa e de ciclo.

Papéis: sem mudança de gate de acesso nas telas — `PesquisasListPage` e
`CiclosListPage` já são acessíveis só a `admin`/`gestor_rh` (mesmo grupo que já
cria/edita/muda status dessas entidades); `colaborador` não chega a estas
telas hoje e continua sem chegar. Nenhuma tela nova de rota é criada nesta
funcionalidade.

Fonte de dados: `ativo` e as listas filtradas vêm prontas da API — nenhuma
agregação/regra de negócio calculada no frontend, só repasse do parâmetro e
leitura do campo (mesma restrição já seguida por `analiseService.ts`).

---

### 1. frontend-developer

**Arquivos a tocar:**

- `frontend/src/types/pesquisa.ts`
- `frontend/src/types/ciclo.ts`
- `frontend/src/services/pesquisasService.ts`
- `frontend/src/services/ciclosService.ts`
- `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx`
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`

Nenhum componente novo é necessário — reaproveita `ConfirmDialog`
(`frontend/src/components/ConfirmDialog/ConfirmDialog.tsx`, já usado para
Encerrar/Excluir nas duas páginas e para Inativar/Reativar em
`ColaboradoresListPage.tsx`, mesmo padrão) e `StatusPesquisaChip`/
`StatusCicloChip` já existentes. Nenhuma página/rota nova.

**1.1 — Tipos**

- `types/pesquisa.ts`: adicionar `ativo: boolean` a `PesquisaResumo` e a
  `Pesquisa` (os dois tipos, ao lado de `status`).
- `types/ciclo.ts`: adicionar `ativo: boolean` à interface `Ciclo`.

**1.2 — Services**

Seguir exatamente o padrão já usado por `listarColaboradores`/
`atualizarStatusColaborador` (`frontend/src/services/colaboradoresService.ts:25-36,56-61`):

`pesquisasService.ts`:
```ts
export interface ListarPesquisasFiltros {
  ativo?: boolean
}

/**
 * Sem `filtros.ativo` (ou `ativo: undefined`): backend retorna só pesquisas
 * ativas (default). `{ ativo: false }`: só inativas. Não existe opção
 * "todas" no backend — nunca chamar isto esperando o universo completo.
 */
export function listarPesquisas(filtros?: ListarPesquisasFiltros): Promise<PesquisaResumo[]> {
  const params = new URLSearchParams()
  if (filtros?.ativo !== undefined) params.set('ativo', String(filtros.ativo))
  const query = params.toString()
  return apiFetch<PesquisaResumo[]>(`/api/pesquisas${query ? `?${query}` : ''}`)
}

/** Só permitido com `status === 'encerrada'` (422 PESQUISA_NAO_ENCERRADA caso contrário). */
export function inativarPesquisa(id: string): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}/inativar`, { method: 'PATCH' })
}

export function ativarPesquisa(id: string): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}/ativar`, { method: 'PATCH' })
}
```
Atualizar a assinatura de `listarPesquisas()` existente (hoje sem parâmetro,
linha 44) para o formato acima — call sites existentes que chamam
`listarPesquisas()` sem argumento continuam funcionando (filtro opcional).
Atualizar também o comentário de topo da função, que hoje afirma "não
pagina/filtra no servidor" — isso deixa de ser 100% verdade com o novo
parâmetro `ativo` (busca/status/ordenação continuam client-side; só a
visibilidade ativo/inativo passa a ser server-side).

`ciclosService.ts`: mesmo padrão —
`ListarCiclosFiltros { ativo?: boolean }`, `listarCiclos(filtros?)`,
`inativarCiclo(id)`, `ativarCiclo(id)` (422 `CICLO_NAO_ENCERRADO` quando
inativar um ciclo não encerrado). Mesmo ajuste do comentário de topo de
`listarCiclos`.

**1.3 — UI do novo filtro "Inativas"/"Inativos" (decisão de UX fechada aqui)**

O filtro de status atual (`RadioGroup` — `PesquisasListPage.tsx:200-205`,
`CiclosListPage.tsx:184-189`) e o novo filtro de visibilidade são dimensões
independentes (`ativo` não é valor do enum `status`), então **não** viram um
único `RadioGroup` com mais opções — isso obrigaria inventar um pseudo-valor
tipo `'inativa'` misturado a `StatusPesquisa`/`StatusCiclo`, contaminando o
tipo `FiltroStatus` com algo que não existe no enum real.

Decisão: um controle novo e separado, na mesma `Paper` da barra lateral de
filtros, logo abaixo do bloco "Status":

```tsx
<div>
  <Typography variant="subtitle2" sx={{ mb: 1 }}>
    Visibilidade
  </Typography>
  <FormControlLabel
    control={
      <Switch
        size="small"
        checked={mostrarInativas}
        onChange={(e) => setMostrarInativas(e.target.checked)}
      />
    }
    label="Mostrar somente inativas"
  />
  {mostrarInativas && (
    <Typography variant="caption" color="text.secondary">
      Toda pesquisa inativa está encerrada — o filtro de status acima fica
      desativado enquanto este modo está ativo.
    </Typography>
  )}
</div>
```
(equivalente em `CiclosListPage.tsx`, estado `mostrarInativos`, label "Mostrar
somente inativos"). Importar `Switch` de `@mui/material` nas duas páginas.

Comportamento ao ligar `mostrarInativas`/`mostrarInativos`:
- Força `statusFiltro` de volta a `'todas'` e desabilita (`disabled`) o
  `RadioGroup`/`FormControlLabel` de Status enquanto o switch estiver ligado
  — evita o estado sem sentido "mostrar inativas + filtrar por rascunho"
  (nenhum item inativo pode estar em `rascunho`/`publicada`/`ativo`, já que só
  se chega a `ativo = false` estando encerrado).
- Dispara um novo fetch com `{ ativo: false }` (ver 1.4).

Ao desligar, volta a buscar sem parâmetro (`ativo` ausente → só ativos,
comportamento atual) e reabilita o `RadioGroup` de Status.

**1.4 — Troca de fetch ao alternar visibilidade**

Hoje `carregarPesquisas`/`carregarCiclos` são `useCallback` sem dependências,
chamadas uma vez no mount. Passam a depender do novo estado de visibilidade,
para que o `useEffect` já existente refaça o fetch sozinho ao alternar:

```ts
const carregarPesquisas = useCallback(async () => {
  setCarregando(true)
  setErro(null)
  try {
    const dados = await listarPesquisas(mostrarInativas ? { ativo: false } : undefined)
    setPesquisas(dados)
  } catch (err) {
    setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as pesquisas.')
  } finally {
    setCarregando(false)
  }
}, [mostrarInativas])

useEffect(() => {
  carregarPesquisas()
}, [carregarPesquisas])
```
Mesmo padrão em `CiclosListPage` — inclusive no `setInterval` de polling de
progresso (`CiclosListPage.tsx:87-96`), que deve continuar chamando
`listarCiclos()` com o MESMO filtro de visibilidade atual (senão o polling
periódico "puxaria de volta" a lista de ativos por cima da lista de inativos
que o usuário estava vendo) — repassar `mostrarInativos` também nesse
`useEffect` do intervalo (dependência + mesma chamada condicional).

Toda mutação que já recarrega a lista após sucesso (`handleDuplicar`,
`handlePublicar`, `handleConfirmarEncerrar`, `handleConfirmarExcluir` em
Pesquisas; `handleConfirmarExcluir`, `handleConfirmarAtivar` [rascunho→ativo],
`handleConfirmarEncerrar` em Ciclos) continua chamando `carregarPesquisas()`/
`carregarCiclos()` sem argumento — automaticamente respeita o filtro de
visibilidade atual por causa da closure sobre `mostrarInativas`/
`mostrarInativos`. Os dois novos handlers (`handleConfirmarInativar`,
`handleConfirmarReativar`, ver 1.6) seguem o mesmo padrão.

Ajustar `filtroAtivo` (usado para decidir mensagem de vazio e esconder o CTA
"Nova pesquisa"/"Novo ciclo"):
```ts
const filtroAtivo = busca.trim().length > 0 || statusFiltro !== 'todas' || mostrarInativas
```
(idem `mostrarInativos` em Ciclos) — evita mostrar "Nenhuma pesquisa
cadastrada ainda." (mensagem de estado zero-dado) quando na verdade o
resultado vazio é porque não há nenhuma pesquisa/ciclo inativo.

**1.5 — Máquina de estados de botões no `CardActions`**

Estender o bloco já existente (não criar segundo local de decisão), por
`item`, com duas variáveis derivadas:

```ts
const encerrada = pesquisa.status === 'encerrada' // ciclo: ciclo.status === 'encerrado'
const restritoParaInativar = encerrada && pesquisa.ativo   // estado 2
const somenteAtivarDeVolta = encerrada && !pesquisa.ativo  // estado 3
```

`PesquisasListPage.tsx` — `CardActions` (linhas 280-333 hoje):

| Botão | Condição atual | Condição nova |
|---|---|---|
| Ver detalhes/Editar | sempre | `!somenteAtivarDeVolta` |
| Pré-visualizar | sempre | `!encerrada` |
| Duplicar | sempre | `!somenteAtivarDeVolta` |
| Encerrar | `status === 'publicada'` | sem mudança (nunca coincide com `encerrada`) |
| Publicar / Deletar | `status === 'rascunho'` | sem mudança (nunca coincide com `encerrada`) |
| **Inativar** (novo) | — | `restritoParaInativar` |
| **Ativar** (novo) | — | `somenteAtivarDeVolta` |

`CiclosListPage.tsx` — `CardActions` (linhas 271-330 hoje):

| Botão | Condição atual | Condição nova |
|---|---|---|
| Ver detalhes | sempre | `!somenteAtivarDeVolta` |
| Visão Geral | sempre | `!encerrada` |
| Avaliações | sempre | `!encerrada` |
| Ativar ciclo / Excluir | `status === 'rascunho'` | sem mudança |
| Encerrar | `status === 'ativo'` | sem mudança |
| **Inativar** (novo) | — | `restritoParaInativar` |
| **Ativar** (novo) | — | `somenteAtivarDeVolta` |

Ciclo não ganha "Duplicar" (não existe hoje, fora de escopo — confirmado na
spec, ambiguidade 1). No estado 2 de um ciclo, sobra só "Ver detalhes" +
"Inativar".

**1.6 — Handlers e estado de diálogo para Inativar/Ativar**

Reaproveitar `ConfirmDialog` com dois pares novos de estado por página
(mesmo padrão de `alvoEncerrar`/`encerrando`/`erroEncerrar` já existente):

- `alvoInativar` / `inativando` / `erroInativar`
- `alvoReativar` / `reativando` / `erroReativar`

Nomes de variável usam `Reativar` internamente em `CiclosListPage.tsx` para
não colidir com o trio já existente `alvoAtivar`/`ativando`/`erroAtivar`
(usado pelo botão **"Ativar ciclo"**, transição `rascunho → ativo` via
`atualizarStatusCiclo`, linhas 52-54/129-142/354-367 — ação totalmente
diferente da nova, mesmo que ambas usem a palavra "ativar"; elas nunca
aparecem juntas no mesmo card porque exigem estados de `status` mutuamente
exclusivos: `rascunho` vs. `encerrado`). O rótulo do BOTÃO novo continua
"Ativar" (conforme a decisão fechada), só o dialog de confirmação usa o
título "Reativar ciclo" para diferenciar visualmente do dialog existente
"Ativar ciclo" (rascunho→ativo). Em Pesquisas não há esse conflito (nenhum
"Ativar" pré-existente), então lá o dialog pode se chamar "Ativar pesquisa"
sem ambiguidade.

```ts
async function handleConfirmarInativar() {
  if (!alvoInativar) return
  setInativando(true)
  setErroInativar(null)
  try {
    await inativarPesquisa(alvoInativar.id) // ou inativarCiclo
    setAlvoInativar(null)
    await carregarPesquisas() // ou carregarCiclos
  } catch (err) {
    setErroInativar(err instanceof ApiError ? err.message : 'Não foi possível inativar a pesquisa.')
  } finally {
    setInativando(false)
  }
}
```
Handler simétrico `handleConfirmarReativar` chamando `ativarPesquisa`/
`ativarCiclo`. Mensagens de erro exibidas cruas (`err.message`) seguem o
mesmo padrão já usado nos outros handlers desta página — sem mapeamento
especial de código (`PESQUISA_NAO_ENCERRADA`/`CICLO_NAO_ENCERRADO`), já que
o botão só aparece quando o item já está elegível, tornando esse erro um
caso defensivo raro (ex.: outra aba mudou o estado entre a renderização e o
clique).

Textos sugeridos dos `ConfirmDialog`:
- Inativar (pesquisa): título "Inativar pesquisa", mensagem "Inativar esta
  pesquisa? Ela deixará de aparecer na listagem padrão. Nenhum dado é
  perdido — é possível reativar a qualquer momento.", `confirmarLabel`
  "Inativar".
- Ativar/Reativar (pesquisa): título "Ativar pesquisa", mensagem "Reativar
  esta pesquisa? Ela volta a aparecer na listagem padrão.", `confirmarLabel`
  "Ativar".
- Equivalente para ciclo, trocando "pesquisa" por "ciclo" e o título de
  reativação para "Reativar ciclo" (ver justificativa acima).

**1.7 — Indicação visual de item inativo no card (reaproveitando padrão existente)**

Ao lado do `StatusPesquisaChip`/`StatusCicloChip` já exibido no
`CardContent`, quando `!item.ativo`, renderizar um `Chip` cinza adicional
`label="Inativa"` (pesquisa) / `"Inativo"` (ciclo) — mesmo padrão já usado em
`ColaboradoresListPage.tsx:293-294` (`label={colaborador.ativo ? 'Ativo' :
'Inativo'}`, `color={colaborador.ativo ? 'success' : 'default'}`). Como só é
possível ver itens inativos com o switch "Mostrar somente inativas/os"
ligado, todo card visível nesse modo terá o chip — reforça visualmente por
que só resta o botão "Ativar".

**1.8 — Consulta prévia de reaproveitamento (feita agora, não repetir na
implementação)**

- `ConfirmDialog` (`components/ConfirmDialog/ConfirmDialog.tsx`): reaproveitado
  tal como já é, sem alteração de props.
- `StatusPesquisaChip`/`StatusCicloChip`: reaproveitados sem alteração —
  continuam refletindo só `status`, não `ativo`.
- Não existe hoje nenhum componente "Chip de ativo/inativo" compartilhado
  (`ColaboradoresListPage` monta o `Chip` inline, não extraído em componente
  próprio) — seguir o mesmo padrão inline nas duas páginas, sem extrair um
  componente novo compartilhado nesta rodada (extrair um `AtivoChip`
  reutilizável ficaria fora de escopo/gold-plating para uma mudança de 2
  telas; se uma terceira tela precisar do mesmo chip no futuro, aí sim vale
  extrair).

**Estados a tratar (sem mudança de padrão, só extensão):**

- Carregando: `Skeleton` já existente, sem mudança — passa a rodar de novo a
  cada troca de `mostrarInativas`/`mostrarInativos` (o `carregando` já cobre
  isso, pois `carregarPesquisas`/`carregarCiclos` já fazem
  `setCarregando(true)` no início).
- Vazio: mensagem existente reaproveitada via `filtroAtivo` (1.4); nenhum
  texto novo específico de "nenhuma inativa" é estritamente necessário porque
  a mensagem genérica de filtro já cobre o caso.
- Erro de carga: reaproveitado sem mudança (`erro` + botão "Tentar
  novamente").
- Erro de ação (inativar/ativar): dentro do próprio `ConfirmDialog`, mesmo
  padrão de Encerrar/Excluir/Ativar-ciclo.

---

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nenhuma lógica de negócio nova no cliente** — confirmar que o frontend
   só lê `item.ativo` vindo da API e repassa o parâmetro `ativo` na
   listagem; nenhuma tentativa de inferir/computar "encerrado + inativo" a
   partir de outra coisa que não seja os dois campos (`status`, `ativo`)
   literalmente devolvidos pela API.
2. **Estado 3 (`somenteAtivarDeVolta`) não deve vazar nenhum botão além de
   "Ativar"** — checar linha a linha o `CardActions` das duas páginas
   (nenhum botão remanescente incondicional escapando da tabela de condições
   da seção 1.5, incluindo os já existentes hoje incondicionais
   "Pré-visualizar"/"Visão Geral"/"Avaliações").
3. **Sem colisão de nome de estado em `CiclosListPage.tsx`** entre o trio
   pré-existente `alvoAtivar`/`ativando`/`erroAtivar` (rascunho→ativo) e o
   trio novo de reativação (`alvoReativar`/`reativando`/`erroReativar`) —
   confirmar que os dois `ConfirmDialog` nunca ficam abertos ao mesmo tempo
   por engano e que os handlers chamam o service certo
   (`atualizarStatusCiclo` vs. `ativarCiclo`).
4. **Refetch respeita o filtro de visibilidade atual** — toda chamada de
   recarregamento após uma mutação (duplicar, publicar, encerrar, excluir,
   inativar, ativar/reativar, e o `setInterval` de polling de progresso em
   `CiclosListPage`) precisa repassar o mesmo `mostrarInativas`/
   `mostrarInativos` vigente, não silenciosamente resetar para "só ativos".
   Atenção especial ao `setInterval` de 30s (`CiclosListPage.tsx:87-96`),
   que é fácil de esquecer por não estar perto do resto dos handlers.
5. **`listarPesquisas`/`listarCiclos` sem argumento continuam significando
   "só ativos"** (nunca "todos") — nenhum call site fora das duas listagens
   (se houver, ex. um seletor de ciclo/pesquisa em outra tela) deve assumir
   silenciosamente que passou a ver itens inativos.
6. **RadioGroup de Status desabilitado + resetado para `'todas'`** quando o
   switch de visibilidade está ligado — conferir que a UX não deixa o
   usuário preso num `statusFiltro` incompatível (ex. `'rascunho'`) que
   sempre resulta em lista vazia sob "mostrar inativas".
7. Confirmar que nenhum arquivo fora de
   `frontend/src/{types,services,pages}/...` listado na seção 1 foi tocado, e
   que nenhuma mudança extrapolou para `apps/api`/`backend/`.
