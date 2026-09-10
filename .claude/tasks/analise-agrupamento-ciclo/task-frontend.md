# Task: Análise — agrupamento por ciclo/pergunta + correção de quebra de texto + seletor de ciclo — Frontend

Extensão 100% frontend (`frontend/`) sobre a tela **já implementada e revisada**
`AnaliseAvaliacoesPage` (`/analise/avaliacoes`). Não toca `backend/`. `.claude/tasks/
analise-agrupamento-ciclo/task-backend.md` **não existe** no momento deste plano —
o contrato abaixo foi passado diretamente pelo pedido do usuário/orquestrador e é
tratado aqui como fechado; se `task-backend.md` aparecer depois com um shape
diferente, este plano deve ser revisto antes do `frontend-developer` come çar.

Base obrigatória, lida por completo antes deste plano: `.claude/tasks/
analise-avaliacoes/task-frontend.md` (implementação original + revisão, sem
achados críticos) — todos os guard rails de anonimização registrados lá continuam
valendo e são citados de novo abaixo, adaptados aos 3 pontos novos.

**Atenção — estado em disco, não o último commit**: `frontend/src/pages/
AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` e `frontend/src/pages/
AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` têm mudanças não commitadas. Este
plano foi escrito depois de ler o conteúdo **atual** dos dois arquivos (não o do
último commit) — ver "Estado atual verificado".

## Estado atual verificado (lido por completo antes deste plano)

- `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` (atual, não
  commitado): mesmo desenho geral do plano original, com dois ajustes já em disco
  que **não estavam** na versão revisada — `handleSubmit` já usa `FormEvent<HTMLFormElement>`
  importado explicitamente (igual ao plano original), e o `TextField` "Até" ganhou
  `slotProps.formHelperText.sx` com `position: 'absolute'` (ajuste de layout do
  helper text, não relacionado a esta task). Estrutura de dados/estado
  (`de`/`ate`/`cicloId`/`nomeCiclo`/`dados`/`carregando`/`erro`,
  `executarBusca(overrides?)`, `identificadasPorTipo` via `agruparPorTipo`, `vazio`,
  `existeGrupoLiberado`, Chip "Filtrado por ciclo" com `onDelete`,
  `buscarCiclo(cicloId)` best-effort) é idêntica ao que a task original documentou.
- `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` (atual, não
  commitado): mesmo ajuste de `slotProps.formHelperText.sx` no campo "Até". Ainda usa
  `React.FormEvent` implícito em `handleSubmit` (a sugestão de import explícito da
  revisão de "Visão Geral" **não** foi aplicada aqui, só em `AnaliseAvaliacoesPage`).
  Mesmo padrão de Chip + `buscarCiclo` best-effort que `AnaliseAvaliacoesPage`.
- `frontend/src/types/analise.ts`: `AvaliacaoIdentificada`, `GrupoParesSubordinado`,
  `GrupoClimaGeral` **ainda sem** `nomeCiclo` — campo novo desta task (contrato
  atualizado, ver seção abaixo).
- `frontend/src/components/analise/TextoAbertoLista/TextoAbertoLista.tsx`: lista
  solta, sem agrupamento por pergunta, sem `break-word` no texto/enunciado — os dois
  pontos que esta task altera.
- `frontend/src/components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard.tsx`:
  idem — renderiza `perguntaEnunciado` + `texto` sem `break-word`, sempre mostra o
  enunciado (não tem prop para ocultá-lo, necessário para o agrupamento por
  pergunta desta task).
- `frontend/src/components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard.tsx`
  e `GrupoClimaCard/GrupoClimaCard.tsx`: ambos delegam a `TextoAbertoLista` quando
  `liberado` — corrigir `TextoAbertoLista` uma vez corrige os dois automaticamente,
  sem editar esses dois arquivos.
- `frontend/src/components/analise/rotulosRelacionamento.ts`,
  `EstadoAguardandoMinimo/EstadoAguardandoMinimo.tsx`,
  `AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao.tsx`: conferidos, **sem
  mudança nesta task** — `EstadoAguardandoMinimo` continua deliberadamente sem
  nenhuma prop de callback/ação (não mexer nisso).
- `frontend/src/services/analiseService.ts`: `buscarAvaliacoesAnalise`/
  `buscarVisaoGeralAnalise` — assinatura inalterada (o `nomeCiclo` novo é só um
  campo a mais na resposta já tipada, sem mudança de query/params).
- `frontend/src/services/ciclosService.ts`: `listarCiclos(): Promise<Ciclo[]>` já
  existe, sem paginação/filtro server-side ("busca e filtro de status é inteiramente
  client-side") — reaproveitado tal como está pelo `SeletorCiclo` novo; nenhuma
  mudança neste arquivo.
- `frontend/src/types/ciclo.ts`: `StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'`
  confirmado — "finalizado" do pedido do usuário mapeia para `'encerrado'`.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: os botões "Visão Geral" e
  "Avaliações" (`?cicloId=${ciclo.id}`) ficam **fora** do bloco condicional
  `ciclo.status === 'rascunho'` — ou seja, o deep link por `cicloId` é acionável
  mesmo para um ciclo em `rascunho`. Isso torna real (não hipotético) o caso de
  borda do item 3.7 do pedido (`cicloId` de um ciclo `rascunho`, que o
  `SeletorCiclo` não lista). **Nenhuma mudança nesta task** em `CiclosListPage.tsx`.
- Nenhum `Accordion`/`AccordionSummary`/`AccordionDetails` do MUI é usado hoje em
  nenhum lugar de `frontend/src` (confirmado por grep) — introdução nova, mas sem
  nova dependência (`@mui/material` já inclui `Accordion`).
- Padrão de `Select` já usado no projeto (`PesquisasListPage.tsx`): `<TextField
  select label="..." value={...} onChange={...} size="small">` + `<MenuItem>`, não
  o `<Select>` "cru" do MUI — `SeletorCiclo` segue esse mesmo padrão por
  consistência.

## Contrato de API atualizado (consumido por esta task, não reaberto)

`GET /api/analise/avaliacoes` passa a incluir `nomeCiclo: string` em: cada item de
`avaliacao360.identificadas`, cada grupo de `avaliacao360.paresSubordinado` e cada
grupo de `climaGeral`. Nenhum outro campo muda. `avaliacao360.paresSubordinado`/
`climaGeral` continuam **sem** `avaliadorId`/`avaliadorNome` mesmo com o campo novo
— `nomeCiclo` é metadado do ciclo (administrativo), não identidade de avaliador.

## Decisões (com justificativa)

1. **`nomeCiclo` entra em `AvaliacaoIdentificada`, `GrupoParesSubordinado` e
   `GrupoClimaGeral`** (não em `TextoAbertoItem`, que não tem `cicloId` próprio, e
   não como campo solto do envelope `AvaliacoesAnalise`, que já tem `cicloId`
   singular só para o caso filtrado). Nomes de campo idênticos ao contrato — sem
   tradução.
2. **`buscarCiclo(cicloId)` best-effort é removido de `AnaliseAvaliacoesPage` E de
   `AnaliseVisaoGeralPage`** (resolve o item 3.8 do pedido). Justificativa por
   página:
   - Em `AnaliseAvaliacoesPage`: o cabeçalho de cada `Accordion` de ciclo usa
     `nomeCiclo` **do próprio payload** (decisão 5) — não depende de nenhuma
     chamada adicional. O nome do ciclo selecionado no filtro passa a ser exibido
     pelo próprio `SeletorCiclo` (que já carrega `listarCiclos()` para popular as
     opções, decisão 6) — a função do antigo Chip "Filtrado por ciclo: {nome}" é
     absorvida pelo valor selecionado do `Select`.
   - Em `AnaliseVisaoGeralPage`: `VisaoGeralAnalise` não ganhou `nomeCiclo` (só
     "Avaliações" ganhou, contrato acima) — mas essa página só usava `buscarCiclo`
     para o mesmo propósito que `AnaliseAvaliacoesPage`, popular o Chip. Com o Chip
     substituído pelo `SeletorCiclo` compartilhado (que resolve o nome via sua
     própria lista de `listarCiclos()`), a chamada perde a única razão de existir
     — removida também, sem nenhuma outra função que dependesse dela (confirmado
     por leitura completa do arquivo).
3. **Ordem dos ciclos nos `Accordion`s é "primeira aparição" na resposta, nunca
   ordenada/`sort`ada** — construída varrendo `identificadas`, depois
   `paresSubordinado`, depois `climaGeral`, nessa ordem fixa, usando um `Map` (que
   preserva ordem de inserção) só para deduplicar por `cicloId`. Isso não é uma
   agregação sensível (é reorganização de metadado de ciclo, não de identidade/
   texto), mas mantém o mesmo espírito do guard rail existente de "nunca reordenar
   o que a API mandou" por simplicidade e auditabilidade.
4. **Agrupamento por pergunta dentro de um grupo `pares`/`subordinado`/clima nunca
   cruza grupos diferentes.** A função de bucket por `perguntaId` é aplicada
   **dentro** de `TextoAbertoLista`, que já recebe só o `textos` de **um** grupo por
   vez (`GrupoParesSubordinadoCard`/`GrupoClimaCard` continuam chamando
   `<TextoAbertoLista textos={grupo.textos ?? []} />` exatamente como hoje — nenhuma
   mudança na fronteira desses dois componentes). O gate continua por grupo
   (avaliado+ciclo+tipo), a UI nunca funde `textos` de dois grupos antes de agrupar
   por pergunta — atende literalmente ao guard rail do pedido.
5. **Bucket por `perguntaId` usa `Map` (ordem de inserção), nunca `.sort()`.** A
   ordem dos "baldes" de pergunta = ordem da primeira ocorrência daquele
   `perguntaId` no array `textos` (que já vem embaralhado pelo backend a cada
   chamada) — e a ordem dos textos **dentro** de cada balde é exatamente a ordem em
   que apareciam no array original, sem nenhuma reordenação adicional. Isso é
   bucketing/partição, não sort — nenhuma das duas operações muda a ordem relativa
   dos elementos originais.
6. **`identificadas` passa a ser agrupada por pergunta em vez de por
   `tipoRelacionamento`** (supersede a decisão 6 da task original, que agrupava por
   `autoavaliacao`/`gestor`/`externo`). O pedido do usuário exige "cada pergunta
   aparece uma única vez... sem repetir o enunciado a cada resposta" — mantendo os
   dois agrupamentos simultaneamente (tipo → pergunta, ou pergunta → tipo) infla a
   tela sem necessidade pedida. Nenhuma informação se perde: cada
   `AvaliacaoIdentificadaCard` continua mostrando o `Chip` de
   `tipoRelacionamento` (Autoavaliação/Gestor/Externo) por item, só a agregação
   visual de nível superior muda de "por tipo" para "por pergunta". Ainda é
   filtragem/organização sobre dado 100% identificado — não uma agregação sensível
   (mesmo raciocínio da decisão 6 original).
7. **`AvaliacaoIdentificadaCard` ganha uma prop nova opcional
   `ocultarEnunciado?: boolean` (default `false`)** — aditiva, não quebra nenhum
   outro uso hipotético do componente. Usada com `true` só dentro do agrupamento
   por pergunta de `AnaliseAvaliacoesPage` (o enunciado já aparece uma vez como
   subtítulo do grupo).
8. **`Accordion` remonta a cada busca bem-sucedida nova**, via
   `key={`${resultadoVersao}-${grupoCiclo.cicloId}`}` (`resultadoVersao: number`,
   incrementado a cada `executarBusca` que resolve com sucesso). Isso garante
   `defaultExpanded` correto (decisão 9) toda vez que uma nova busca chega, sem
   precisar de um `Accordion` controlado (`expanded`/`onChange` manuais) — dentro de
   um mesmo resultado, o usuário continua livre para expandir/recolher qualquer
   `Accordion` manualmente, sem nenhuma trava.
9. **`defaultExpanded={Boolean(cicloId)}` por `Accordion`** — como o contrato
   assume que `cicloId` filtrado produz sempre um único ciclo na resposta (mesma
   suposição implícita já usada pelo restante da tela), isso satisfaz "filtrado →
   único accordion já expandido" e "sem filtro → todos recolhidos" ao mesmo tempo,
   sem lógica condicional adicional por quantidade de grupos.
10. **`SeletorCiclo` é dono da sua própria busca de `listarCiclos()`** (decisão de
    encapsulamento — usado em duas páginas, cada instância carrega
    independentemente; sem cache compartilhado, sem nova lib de state management,
    consistente com o resto do projeto que não usa nenhuma).
11. **Edge case do item 3.7 do pedido** (deep link com `cicloId` fora da lista
    filtrada `ativo`/`encerrado`, ou lista ainda carregando): `SeletorCiclo` nunca
    chama `onChange` sozinho e nunca deixa de refletir visualmente o `cicloId`
    recebido via prop. Resolvido injetando um `MenuItem` extra, desabilitado, só
    quando `cicloId` (prop) não está entre as opções carregadas — ver 1.3 abaixo
    para o detalhamento.
12. **Estilo dos textos**: `sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}`
    em todo `Typography` que renderiza `item.texto`/`perguntaEnunciado` — nunca
    `className="break-words"` nesses `Typography` especificamente, para ficar
    consistente com a convenção já registrada no projeto de que `Typography` usa
    `sx` (mesma regra hoje aplicada a `fontWeight`). Fora de `Typography` (não há
    nenhum caso nesta tela), `break-words` do Tailwind seria aceitável — não se
    aplica aqui porque todos os pontos de exibição de texto desta tela já são
    `Typography`.

## Guard rails obrigatórios (frontend-developer e revisor) — reafirmados para esta extensão

- **Nenhuma regra de gate/anonimização recalculada no cliente** — `liberado`/
  `motivo`/presença de `textos` continuam lidos tal como vêm da API; nada nesta
  task adiciona nenhum cálculo de limiar.
- **Nenhum bypass/toggle "ver mesmo assim"** para grupo bloqueado, em nenhum lugar
  novo desta task (`Accordion`/`SeletorCiclo` incluídos). `EstadoAguardandoMinimo`
  não muda.
- **Nenhum `.sort()`/`.reverse()`** sobre `textos`, `identificadas`,
  `paresSubordinado`, `climaGeral`, nem sobre os grupos-por-ciclo/grupos-por-pergunta
  derivados deles — só `Map`/bucket preservando ordem de inserção (decisões 3 e 5).
  Grep do revisor deve continuar vazio.
- **Nenhuma numeração/posição exibida** em nenhum texto, novo ou existente.
- **Agrupamento por pergunta de um grupo `pares`/`subordinado`/clima nunca funde
  `textos` de dois grupos diferentes** (decisão 4) — sempre um `grupo.textos` por
  vez, gate continua por grupo.
- **`climaGeral` nunca ganha nenhuma atribuição de autoria** — inalterado por esta
  task (`GrupoClimaCard` não muda, `TextoAbertoLista` que ele usa também não ganha
  nenhum campo de identidade).
- **`avaliadorId`/`avaliadorNome` continuam só em `AvaliacaoIdentificada`** —
  `nomeCiclo` novo não deve ser confundido/combinado com identidade de
  avaliador/avaliado em nenhum componente de `paresSubordinado`/`climaGeral`.
- **Papéis**: `admin`/`gestor_rh` idênticos, sem nenhum `if (papel === ...)` novo em
  nenhum arquivo desta task — inclusive `SeletorCiclo` (sem checagem de papel
  própria; a proteção continua só em `RotaProtegida`, nível de rota, inalterada).
- **`SeletorCiclo` nunca dispara uma busca não solicitada pelo usuário** — troca de
  ciclo dispara busca (pedido explícito, item 3.4), mas carregamento da própria
  lista de ciclos, ou um `cicloId` órfão (decisão 11), nunca disparam
  `executarBusca` sozinhos nem limpam o filtro ativo silenciosamente.
- **Estilo**: Tailwind só layout/espaçamento; `Typography` com `sx` (decisão 12,
  também para `fontWeight` como já valia); nenhum `.css` novo; import de ícone
  (`ExpandMoreIcon`) por arquivo individual, nunca do barrel.

## Plano — Frontend

### 1. frontend-developer

**Status: concluído.**

Resumo do que foi feito (seguindo o plano 1.1–1.9 literalmente):
- `types/analise.ts`: `nomeCiclo: string` adicionado a `AvaliacaoIdentificada`,
  `GrupoParesSubordinado` e `GrupoClimaGeral` + comentário explicativo.
- `break-word` (`sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}`)
  aplicado em todo `Typography` que renderiza `texto`/`perguntaEnunciado` em
  `TextoAbertoLista.tsx`, `AvaliacaoIdentificadaCard.tsx` e no subtítulo de
  pergunta novo de `AnaliseAvaliacoesPage.tsx`.
- `components/analise/SeletorCiclo/SeletorCiclo.tsx` criado exatamente como no
  plano (`TextField select` + `MenuItem`, filtra `ativo`/`encerrado`, `MenuItem`
  de fallback desabilitado para `cicloId` órfão, sem checagem de papel, nunca
  chama `onChange` sozinho).
- `pages/AnaliseAvaliacoesPage/agrupamento.ts` criado (`agruparPorCiclo`,
  `agruparIdentificadasPorPergunta`, ambos via `Map`, sem `.sort()`/`.reverse()`).
- `TextoAbertoLista.tsx` reescrito: agrupa por `perguntaId` os `textos` de UM
  grupo por vez (bucket via `Map`), cabeçalho de pergunta uma única vez, sem
  numeração/posição.
- `AvaliacaoIdentificadaCard.tsx`: prop nova `ocultarEnunciado?: boolean`
  (default `false`), aditiva.
- `AnaliseAvaliacoesPage.tsx` reescrita: `buscarCiclo`/Chip removidos,
  `SeletorCiclo` (dispara busca + `setSearchParams`) na mesma linha de filtro
  de período, `Accordion`/`AccordionSummary`/`AccordionDetails` por ciclo
  (`key={`${resultadoVersao}-${cicloId}`}`, `defaultExpanded={Boolean(cicloId)}`),
  dentro de cada ciclo: `identificadas` agrupada por pergunta,
  `paresSubordinado`/`climaGeral` inalterados (mesmos cards, gate por grupo
  preservado). `AvisoLimitacaoAnonimizacao` continua único, fora do `.map`.
- `AnaliseVisaoGeralPage.tsx`: mesmo padrão — `buscarCiclo`/Chip removidos,
  `SeletorCiclo` adicionado ao form, `handleCicloChange` idêntico,
  `FormEvent<HTMLFormElement>` importado explicitamente (paridade com
  `AnaliseAvaliacoesPage`). Nenhuma mudança de `MetricaCard`/layout de métricas.
- Ajuste adicional (fora do plano, mas necessário para lint limpo): adicionado
  `// eslint-disable-next-line react-hooks/set-state-in-effect` com comentário,
  no mesmo padrão já usado em `CiclosListPage.tsx`/`PesquisasListPage.tsx`/
  `CicloDetalhePage.tsx`, no `useEffect` de carga inicial de ambas as páginas —
  a regra `react-hooks/set-state-in-effect` passou a bloquear o build sem essa
  supressão, que já era o padrão estabelecido no resto do projeto para o mesmo
  cenário (fetch de carga inicial em `useEffect(() => {...}, [])`).
- `npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
  confirmados sem erros; únicos avisos restantes são o aviso pré-existente de
  chunk size > 500kB e dois avisos `react-hooks/exhaustive-deps` pré-existentes
  (mesmos `useEffect`/dependências de antes desta task, inalterados).

#### 1.1 `frontend/src/types/analise.ts` (editado)

Adicionar `nomeCiclo: string` a `AvaliacaoIdentificada`, `GrupoParesSubordinado` e
`GrupoClimaGeral`. Atualizar o comentário de topo do bloco "Avaliações" acrescentando
uma linha explicando que `nomeCiclo` é metadado administrativo do ciclo (não
identidade de avaliador), usado pela UI para os cabeçalhos de `Accordion` por ciclo.
Nenhuma outra mudança neste arquivo.

#### 1.2 PARTE 1 — correção de quebra de texto (prioridade)

Em `frontend/src/components/analise/TextoAbertoLista/TextoAbertoLista.tsx` e
`frontend/src/components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard.tsx`:
todo `Typography` que renderiza `item.texto` ou `item.perguntaEnunciado`/
`grupo.perguntaEnunciado` ganha `sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}`
(decisão 12 — nunca `className="break-words"` nesses `Typography`). Como
`TextoAbertoLista` também será reescrito na 1.4 (agrupamento por pergunta), aplicar
o `sx` já na versão nova (não editar duas vezes o mesmo trecho) — mas o fix vale
igual se, por ordem de implementação, o `frontend-developer` preferir aplicar o
`sx` primeiro na versão atual e só depois reestruturar; qualquer ordem é aceitável
desde que o resultado final tenha `break-word` em **todo** ponto que renderiza
`texto`/`perguntaEnunciado` desta tela, incluindo os dois pontos novos criados na
1.4 (subtítulo de pergunta dentro de `TextoAbertoLista` e o subtítulo de pergunta
para `identificadas` dentro da página).

Nenhuma mudança em `GrupoParesSubordinadoCard.tsx`/`GrupoClimaCard.tsx` — eles só
delegam a `TextoAbertoLista`, que já resolve o fix para os dois.

#### 1.3 PARTE 3 — `frontend/src/components/analise/SeletorCiclo/SeletorCiclo.tsx` (novo)

```tsx
import { MenuItem, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { listarCiclos } from '../../../services/ciclosService'
import type { Ciclo } from '../../../types/ciclo'

interface SeletorCicloProps {
  cicloId: string | null
  onChange: (cicloId: string | null) => void
}

const STATUS_SELECIONAVEIS = new Set<Ciclo['status']>(['ativo', 'encerrado'])

/**
 * Select simples (sem busca interna) de ciclo — usado por `AnaliseVisaoGeralPage`
 * e `AnaliseAvaliacoesPage`. Só lista ciclos `ativo`/`encerrado` (nunca
 * `rascunho`). Trocar a seleção chama `onChange` imediatamente — quem decide o que
 * fazer com isso (novo fetch, `setSearchParams`) é a página, não este componente.
 * NUNCA chama `onChange` sozinho por conta de carregamento ou de um `cicloId`
 * (prop) que não esteja na lista — ver o `MenuItem` de fallback abaixo.
 */
export function SeletorCiclo({ cicloId, onChange }: SeletorCicloProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false
    listarCiclos()
      .then((todos) => {
        if (!cancelado) setCiclos(todos.filter((c) => STATUS_SELECIONAVEIS.has(c.status)))
      })
      .catch(() => {
        // Best-effort — falha aqui não deve quebrar a página; o filtro de ciclo
        // simplesmente fica indisponível (só "Todos os ciclos" segue utilizável).
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const cicloOrfao = cicloId !== null && !ciclos.some((c) => c.id === cicloId)

  return (
    <TextField
      select
      label="Ciclo"
      size="small"
      value={cicloId ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="min-w-[220px]"
    >
      <MenuItem value="">Todos os ciclos</MenuItem>
      {ciclos.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.nome}
        </MenuItem>
      ))}
      {/* `cicloId` (prop, vindo de deep link/URL) não está entre os ciclos
          selecionáveis — ainda em carregamento, ou o ciclo está em `rascunho`
          (CiclosListPage permite o deep link mesmo nesse status). Renderizado
          desabilitado só para o <TextField select> ter uma opção correspondente
          ao `value` atual e não "engolir" o filtro silenciosamente nem disparar
          nenhum onChange — o usuário troca manualmente se quiser. */}
      {cicloOrfao && (
        <MenuItem value={cicloId as string} disabled>
          {carregando ? 'Carregando…' : 'Ciclo selecionado indisponível para este filtro'}
        </MenuItem>
      )}
    </TextField>
  )
}
```

Nenhuma checagem de papel dentro deste componente (guard rail).

#### 1.4 PARTE 2 — `frontend/src/pages/AnaliseAvaliacoesPage/agrupamento.ts` (novo, local à página)

Funções puras, sem chamada de rede, sem nenhuma decisão de gate:

```ts
import type {
  AvaliacaoIdentificada,
  AvaliacoesAnalise,
  GrupoClimaGeral,
  GrupoParesSubordinado,
} from '../../types/analise'

export interface GrupoCiclo {
  cicloId: string
  nomeCiclo: string
  identificadas: AvaliacaoIdentificada[]
  paresSubordinado: GrupoParesSubordinado[]
  climaGeral: GrupoClimaGeral[]
}

/**
 * Agrupa os três arrays de `AvaliacoesAnalise` por `cicloId`. Ordem = primeira
 * aparição na resposta (varrendo identificadas → paresSubordinado → climaGeral),
 * nunca ordenada por nome/data — usa `Map` só para deduplicar por `cicloId`
 * preservando a ordem de inserção (não é um `.sort()`).
 */
export function agruparPorCiclo(dados: AvaliacoesAnalise): GrupoCiclo[] {
  const mapa = new Map<string, GrupoCiclo>()

  function garantir(cicloId: string, nomeCiclo: string): GrupoCiclo {
    let grupo = mapa.get(cicloId)
    if (!grupo) {
      grupo = { cicloId, nomeCiclo, identificadas: [], paresSubordinado: [], climaGeral: [] }
      mapa.set(cicloId, grupo)
    }
    return grupo
  }

  for (const item of dados.avaliacao360.identificadas) garantir(item.cicloId, item.nomeCiclo).identificadas.push(item)
  for (const grupo of dados.avaliacao360.paresSubordinado) garantir(grupo.cicloId, grupo.nomeCiclo).paresSubordinado.push(grupo)
  for (const grupo of dados.climaGeral) garantir(grupo.cicloId, grupo.nomeCiclo).climaGeral.push(grupo)

  return Array.from(mapa.values())
}

export interface GrupoPergunta<T> {
  perguntaId: string
  perguntaEnunciado: string
  itens: T[]
}

/**
 * Agrupa `identificadas` (de UM ciclo) por `perguntaId`. Só filtragem/bucket sobre
 * dado já 100% identificado — mesma natureza não sensível da decisão 6 original.
 */
export function agruparIdentificadasPorPergunta(itens: AvaliacaoIdentificada[]): GrupoPergunta<AvaliacaoIdentificada>[] {
  const mapa = new Map<string, GrupoPergunta<AvaliacaoIdentificada>>()
  for (const item of itens) {
    let bucket = mapa.get(item.perguntaId)
    if (!bucket) {
      bucket = { perguntaId: item.perguntaId, perguntaEnunciado: item.perguntaEnunciado, itens: [] }
      mapa.set(item.perguntaId, bucket)
    }
    bucket.itens.push(item)
  }
  return Array.from(mapa.values())
}
```

#### 1.5 `TextoAbertoLista.tsx` (reescrito) — agrupamento por pergunta (PARTE 2) + `break-word` (PARTE 1)

```tsx
import { Paper, Typography } from '@mui/material'
import type { TextoAbertoItem } from '../../../types/analise'

interface TextoAbertoListaProps {
  textos: TextoAbertoItem[]
}

interface GrupoPerguntaTexto {
  perguntaId: string
  perguntaEnunciado: string
  textos: TextoAbertoItem[]
}

/**
 * Agrupa POR PERGUNTA os textos de UM ÚNICO grupo (avaliado+ciclo+tipo, ou o único
 * grupo de clima do ciclo) recebido via prop — nunca funde `textos` de grupos
 * diferentes (quem chama já passa só um `grupo.textos` por vez). Bucket via `Map`,
 * preserva a ordem de inserção — a ordem das perguntas é a ordem da primeira
 * ocorrência no array já embaralhado pelo backend; a ordem dos textos DENTRO de
 * cada pergunta é exatamente a do array recebido. Nenhum `.sort()`/`.reverse()`.
 */
function agruparPorPergunta(textos: TextoAbertoItem[]): GrupoPerguntaTexto[] {
  const mapa = new Map<string, GrupoPerguntaTexto>()
  for (const item of textos) {
    let bucket = mapa.get(item.perguntaId)
    if (!bucket) {
      bucket = { perguntaId: item.perguntaId, perguntaEnunciado: item.perguntaEnunciado, textos: [] }
      mapa.set(item.perguntaId, bucket)
    }
    bucket.textos.push(item)
  }
  return Array.from(mapa.values())
}

/**
 * Lista de textos de UM grupo, agrupada por pergunta (cabeçalho uma única vez),
 * SEM numeração/rótulo de posição em nenhum texto individual e SEM qualquer
 * atribuição de autoria — quem chama decide se/como identificar o GRUPO (avaliado,
 * ciclo), nunca o texto individual.
 */
export function TextoAbertoLista({ textos }: TextoAbertoListaProps) {
  const grupos = agruparPorPergunta(textos)
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => (
        <div key={grupo.perguntaId} className="flex flex-col gap-2">
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {grupo.perguntaEnunciado}
          </Typography>
          <div className="flex flex-col gap-2">
            {grupo.textos.map((item, indice) => (
              <Paper key={`${item.perguntaId}-${indice}`} variant="outlined" className="p-3">
                <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {item.texto}
                </Typography>
              </Paper>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

`GrupoParesSubordinadoCard.tsx`/`GrupoClimaCard.tsx` continuam chamando
`<TextoAbertoLista textos={grupo.textos ?? []} />` exatamente como hoje — nenhuma
edição nesses dois arquivos.

#### 1.6 `AvaliacaoIdentificadaCard.tsx` (editado) — prop `ocultarEnunciado` + `break-word`

```tsx
import { Chip, Paper, Typography } from '@mui/material'
import type { AvaliacaoIdentificada } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'

interface AvaliacaoIdentificadaCardProps {
  item: AvaliacaoIdentificada
  /** Omite o `Typography` de `perguntaEnunciado` — usado quando o chamador já
   * mostra o enunciado como subtítulo de um grupo por pergunta (evita repetir). */
  ocultarEnunciado?: boolean
}

export function AvaliacaoIdentificadaCard({ item, ocultarEnunciado = false }: AvaliacaoIdentificadaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2">
          <strong>{item.avaliadoNome}</strong> avaliado por <strong>{item.avaliadorNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} />
      </div>
      {!ocultarEnunciado && (
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          {item.perguntaEnunciado}
        </Typography>
      )}
      <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {item.texto}
      </Typography>
    </Paper>
  )
}
```

#### 1.7 `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` (reescrito)

Mudanças em relação à versão atual (ver "Estado atual verificado"):

- Remove `nomeCiclo` (state) e o `useEffect` de `buscarCiclo(cicloId)` inteiro
  (decisão 2) — import de `buscarCiclo` removido.
- Remove `SECOES_IDENTIFICADAS`, `agruparPorTipo`, `identificadasPorTipo`
  (substituídos pelo agrupamento por ciclo/pergunta, decisão 6).
- Substitui o Chip "Filtrado por ciclo" por `<SeletorCiclo cicloId={cicloId}
  onChange={handleCicloChange} />`, colocado dentro do `Paper component="form"`
  ao lado de "De"/"Até" (mesma linha de filtros — combinável, item 3.6 do pedido).
- Novo `handleCicloChange(novoCicloId: string | null)`: atualiza `cicloId` (state),
  `setSearchParams` (`{ cicloId: novoCicloId }` ou `{}` se `null`, `{ replace:
  true }`), e chama `executarBusca({ cicloId: novoCicloId })` — dispara busca
  automaticamente, sem precisar do botão "Aplicar filtro" (item 3.4 do pedido; o
  botão "Aplicar filtro" continua existindo só para `de`/`ate`). Substitui
  `handleRemoverFiltroCiclo` (a opção "Todos os ciclos" do `SeletorCiclo` cobre o
  mesmo caso, mapeando para `novoCicloId === null`).
- Novo state `resultadoVersao` (`useState(0)`), incrementado dentro de
  `executarBusca` só no caminho de sucesso (depois de `setDados(resultado)`) — usado
  na `key` dos `Accordion`s (decisão 8).
- Novo `useMemo` `gruposPorCiclo = dados ? agruparPorCiclo(dados) : []`.
- Bloco de conteúdo (dentro de `!carregando && !erro && dados && !vazio`) vira:

```tsx
<div className="flex flex-col gap-3">
  {gruposPorCiclo.map((grupoCiclo) => (
    <Accordion key={`${resultadoVersao}-${grupoCiclo.cicloId}`} defaultExpanded={Boolean(cicloId)}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1">{grupoCiclo.nomeCiclo}</Typography>
      </AccordionSummary>
      <AccordionDetails className="flex flex-col gap-6">
        {grupoCiclo.identificadas.length > 0 && (
          <div className="flex flex-col gap-3">
            <Typography variant="subtitle2">Avaliação 360 — respostas identificadas</Typography>
            {agruparIdentificadasPorPergunta(grupoCiclo.identificadas).map((g) => (
              <div key={g.perguntaId} className="flex flex-col gap-2">
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-word' }}
                >
                  {g.perguntaEnunciado}
                </Typography>
                <div className="flex flex-col gap-2">
                  {g.itens.map((item, indice) => (
                    <AvaliacaoIdentificadaCard
                      key={`${item.avaliadoId}-${item.avaliadorId}-${indice}`}
                      item={item}
                      ocultarEnunciado
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {grupoCiclo.paresSubordinado.length > 0 && (
          <div className="flex flex-col gap-3">
            <Typography variant="subtitle2">Avaliação 360 — pares e subordinados</Typography>
            <div className="flex flex-col gap-2">
              {grupoCiclo.paresSubordinado.map((grupo, indice) => (
                <GrupoParesSubordinadoCard key={`${grupo.avaliadoId}-${grupo.tipoRelacionamento}-${indice}`} grupo={grupo} />
              ))}
            </div>
          </div>
        )}

        {grupoCiclo.climaGeral.length > 0 && (
          <div className="flex flex-col gap-3">
            <Typography variant="subtitle2">Clima e Satisfação</Typography>
            <div className="flex flex-col gap-2">
              {grupoCiclo.climaGeral.map((grupo, indice) => (
                <GrupoClimaCard key={indice} grupo={grupo} />
              ))}
            </div>
          </div>
        )}
      </AccordionDetails>
    </Accordion>
  ))}
</div>
```

Novos imports: `Accordion, AccordionSummary, AccordionDetails` de `@mui/material`;
`import ExpandMoreIcon from '@mui/icons-material/ExpandMore'` (arquivo individual,
não barrel); `SeletorCiclo`; `agruparPorCiclo, agruparIdentificadasPorPergunta` de
`./agrupamento`. `AvisoLimitacaoAnonimizacao` continua renderizado uma única vez,
acima de `gruposPorCiclo.map` (decisão do pedido "topo da tela, fora dos
accordions, não duplicado por ciclo") — `existeGrupoLiberado` inalterado
(calculado sobre `dados` inteiro, não por ciclo). Definição de "vazio" inalterada.
Skeleton/erro inalterados.

**Papéis com acesso**: inalterado — `admin`/`gestor_rh`, idênticos, via
`RotaProtegida` em `App.tsx` (não tocado nesta task).

**Endpoints consumidos**: `GET /api/analise/avaliacoes` (inalterado, só ganhou
`nomeCiclo`), `GET /api/ciclos` (via `SeletorCiclo` → `listarCiclos()`, metadado
administrativo, sem identidade). `buscarCiclo(id)` deixa de ser chamado por esta
página (decisão 2).

**Estados a tratar**: carregando (skeleton, inalterado) / vazio (`Alert`,
inalterado) / erro (inalterado) / sucesso com `Accordion`s por ciclo, cada um
default-expandido só quando há filtro de ciclo ativo — `SeletorCiclo` tem seu
próprio sub-estado de carregamento (não bloqueia o carregamento principal da
página) e seu próprio fallback de "ciclo órfão" (decisão 11).

#### 1.8 `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` (editado)

- Remove `nomeCiclo` (state) e o `useEffect` de `buscarCiclo(cicloId)` (decisão 2);
  remove import de `buscarCiclo`.
- Substitui o Chip "Filtrado por ciclo" por `<SeletorCiclo cicloId={cicloId}
  onChange={handleCicloChange} />` dentro do `Paper component="form"`, mesmo padrão
  de 1.7. `handleCicloChange` idêntico ao de `AnaliseAvaliacoesPage` (mesma
  assinatura, mesma lógica de `setSearchParams`/`executarBusca`).
- Remove `handleRemoverFiltroCiclo` (absorvido por `handleCicloChange` com
  `novoCicloId === null`, igual 1.7).
- Pequeno ajuste de consistência aproveitando que o arquivo já está sendo editado:
  troca `function handleSubmit(event: React.FormEvent)` por `function
  handleSubmit(event: FormEvent<HTMLFormElement>)` com `import { type FormEvent }
  from 'react'` explícito no topo — alinha com a sugestão já registrada na revisão
  de "Visão Geral" e já aplicada em `AnaliseAvaliacoesPage`. Não introduzir nenhuma
  outra mudança de comportamento nesta página além do que está descrito aqui
  (nenhuma mudança em `MetricaCard`s/layout de métricas).

**Papéis/endpoints/estados**: inalterados — só a troca Chip → `SeletorCiclo` e a
remoção de `buscarCiclo`.

#### 1.9 Ao final

Rodar `npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`) dentro
de `frontend/`; confirmar que ambos passam sem erros/avisos novos (o aviso
pré-existente de chunk size > 500kB não conta como novo).

### 2. frontend-codereviewer

Checklist específico desta extensão (além do checklist já padrão herdado de
`analise-avaliacoes/task-frontend.md`, seção 2 — reconferir os itens 1–7 de lá
também, já que `AnaliseAvaliacoesPage.tsx` foi reescrita):

1. **`break-word` em todo ponto de exibição de texto da tela** — grep por
   `Typography` que renderiza `item.texto` ou `perguntaEnunciado`/
   `grupo.perguntaEnunciado` em `TextoAbertoLista.tsx`,
   `AvaliacaoIdentificadaCard.tsx` e no bloco novo de `AnaliseAvaliacoesPage.tsx`
   (subtítulo de pergunta de `identificadas`) — todos devem ter
   `sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}`. Nenhum desses
   `Typography` usa `className="break-words"` em vez de `sx` (decisão 12).
2. **Agrupamento por pergunta nunca funde `textos` de grupos diferentes** —
   confirmar que `TextoAbertoLista` só recebe `grupo.textos` de UM
   `GrupoParesSubordinado`/`GrupoClimaGeral` por vez (a chamada em
   `GrupoParesSubordinadoCard.tsx`/`GrupoClimaCard.tsx` não muda) — achado
   **crítico** se `AnaliseAvaliacoesPage.tsx` concatenar `textos` de dois grupos
   antes de passar para qualquer componente de lista.
3. **Nenhum `.sort()`/`.reverse()` novo** — grep em `agrupamento.ts` (novo),
   `TextoAbertoLista.tsx`, `AvaliacaoIdentificadaCard.tsx`,
   `AnaliseAvaliacoesPage.tsx`, `SeletorCiclo.tsx`. Bucket via `Map` é aceitável,
   `.sort()`/`.reverse()` não é — achado crítico se encontrado sobre `textos`/
   `identificadas`/`paresSubordinado`/`climaGeral` ou seus derivados.
4. **Nenhuma numeração/posição exibida** em nenhum texto (novo ou existente).
5. **Estado bloqueado (`liberado: false`) continua aparecendo, dentro do
   `Accordion` do ciclo correspondente, fora de qualquer agrupamento por
   pergunta** — `GrupoParesSubordinadoCard`/`GrupoClimaCard` não mudaram, então
   `EstadoAguardandoMinimo` deve continuar renderizando normalmente dentro da
   seção "pares e subordinados"/"Clima" de cada ciclo — achado crítico se algum
   grupo bloqueado sumir do array renderizado.
6. **`AvisoLimitacaoAnonimizacao` não duplicado por ciclo** — renderizado uma
   única vez, no topo, fora do `.map` de `gruposPorCiclo`.
7. **`nomeCiclo` não confundido com identidade de avaliador/avaliado** — grep por
   `avaliadorId`/`avaliadorNome` em `GrupoParesSubordinadoCard.tsx`/
   `GrupoClimaCard.tsx`/`SeletorCiclo.tsx`/`agrupamento.ts` não deveria retornar
   nada (`GrupoParesSubordinado`/`GrupoClimaGeral` não têm esses campos).
8. **`SeletorCiclo` sem checagem de papel própria** — grep por
   `admin`/`gestor_rh`/`colaborador?.papel` em `SeletorCiclo.tsx` não deveria
   retornar nada.
9. **Edge case do `cicloId` órfão (item 3.7 do pedido)**: com `ciclos` carregado e
   `cicloId` (prop) não presente na lista filtrada, `SeletorCiclo` renderiza o
   `MenuItem` de fallback desabilitado, sem chamar `onChange` sozinho e sem gerar
   warning do MUI de "out-of-range value" no console (verificar manualmente, ex.
   navegando para `/analise/avaliacoes?cicloId=<uuid-de-ciclo-rascunho>`).
10. **Filtro de ciclo combinável com período** — trocar `cicloId` via
    `SeletorCiclo` não deve resetar `de`/`ate`, e vice-versa (mesmo padrão já
    valia antes com o Chip; confirmar que `handleCicloChange` preserva o
    comportamento).
11. **`resultadoVersao`/`defaultExpanded`** — confirmar que filtrar por um
    `cicloId` específico resulta em um único `Accordion` já expandido, e que
    remover o filtro (ou carregar sem filtro) resulta em todos os `Accordion`s
    recolhidos por padrão; confirmar que expandir/recolher manualmente um
    `Accordion` continua funcionando normalmente dentro do mesmo resultado (sem
    ficar travado por algum `expanded` controlado indevido — a implementação
    esperada é `defaultExpanded` não controlado, não `expanded`/`onChange`).
12. **`buscarCiclo` removido de ambas as páginas, sem nenhum outro uso
    remanescente que dependesse dele** — grep por `buscarCiclo` em
    `AnaliseAvaliacoesPage.tsx`/`AnaliseVisaoGeralPage.tsx` não deveria retornar
    nada (só em `ciclosService.ts`, onde a função continua exportada para outros
    consumidores como `CicloDetalhePage`).
13. **`SeletorCiclo` só lista `ativo`/`encerrado`** — confirmar
    `STATUS_SELECIONAVEIS`/filtro não inclui `rascunho`.
14. **Padrão de `Select`**: `TextField select` + `MenuItem`, consistente com
    `PesquisasListPage.tsx` (não introduzir `<Select>` cru do MUI nem nova lib).
15. **`FormEvent<HTMLFormElement>` importado explicitamente** também em
    `AnaliseVisaoGeralPage.tsx` após a 1.8 (paridade com `AnaliseAvaliacoesPage`).
16. **Ícone**: `import ExpandMoreIcon from '@mui/icons-material/ExpandMore'` —
    arquivo individual, não barrel.
17. **Sem nova dependência** — `package.json` sem diff (Accordion já vem de
    `@mui/material`, já instalado).
18. Confirmar `npm run build`/`npm run lint` sem novas falhas antes de aprovar.

### 3. test-engineer

Mesmo contexto já registrado em `analise-avaliacoes/task-frontend.md` ("Testes"):
o projeto (`frontend/package.json`) continua sem framework de teste de
componente/página (sem Vitest/Jest/Testing Library) — confirmar essa constatação
ainda vale antes de prosseguir, não introduzir framework novo nesta rodada por
conta própria.

Nenhum teste automatizado de frontend é esperado desta task por falta de
precedente/framework. Documentar, como já feito antes, os candidatos a teste caso o
projeto adote Vitest + Testing Library no futuro, em ordem de prioridade para esta
extensão especificamente:

1. `agruparPorCiclo`/`agruparIdentificadasPorPergunta`/o bucket interno de
   `TextoAbertoLista` nunca reordenam os itens recebidos (comparar ordem de saída
   com a ordem de entrada, elemento a elemento, dentro de cada balde).
2. Bucket por pergunta de um `GrupoParesSubordinado`/`GrupoClimaGeral` nunca mistura
   `textos` de dois grupos diferentes (teste de unidade chamando `TextoAbertoLista`
   duas vezes com dois `grupo.textos` distintos e conferindo que cada render só
   contém os textos do seu próprio grupo).
3. `EstadoAguardandoMinimo` continua sem nenhum elemento interativo (guard rail
   "sem bypass"), agora também dentro de um `AccordionDetails`.
4. `SeletorCiclo`: com um `cicloId` (prop) ausente da lista carregada, o
   componente não chama `onChange` sozinho (mock de `onChange`, assert
   `not.toHaveBeenCalled()` após o carregamento resolver).
5. `defaultExpanded`: com `cicloId` presente, o único `Accordion` renderizado
   inicia expandido; sem `cicloId`, todos iniciam recolhidos.

## Revisão

Revisão feita por leitura completa dos 7 arquivos tocados (2 novos, 5 editados) +
comparação linha a linha contra o plano (seções "Plano — Frontend" 1.1–1.8, incluindo
os blocos de código literais) + checklist de 18 pontos da seção "2.
frontend-codereviewer" + reconferência dos guard rails de anonimização herdados de
`analise-avaliacoes/task-frontend.md`. Não uso `git diff` diretamente (ferramenta não
disponível neste agente) — a comparação foi feita lendo o conteúdo atual de cada
arquivo e confrontando com o texto/código exato do plano, que por sua vez já
documentava o estado anterior ("Estado atual verificado"). As mudanças pré-existentes
não commitadas antes desta task (`slotProps.formHelperText.sx` com `position:
'absolute'` no campo "Até" de ambas as páginas; `FormEvent<HTMLFormElement>` já
importado explicitamente em `AnaliseAvaliacoesPage.tsx`) foram identificadas como tal
e **não** entram nos achados abaixo, conforme instruído.

**Nenhum achado crítico.** Especificamente sobre a auditoria de anonimização pedida:

- Nenhuma lógica de gate/anonimização foi introduzida ou alterada — `liberado`/
  `motivo`/`textos` continuam lidos tal como vêm da API em `GrupoParesSubordinadoCard`/
  `GrupoClimaCard` (nenhum dos dois foi tocado por esta task, confirmado por leitura).
- Grupos com `liberado: false` continuam sendo exibidos: `AnaliseAvaliacoesPage.tsx`
  mapeia `grupoCiclo.paresSubordinado`/`grupoCiclo.climaGeral` inteiros, sem nenhum
  `.filter(g => g.liberado)`, dentro do `Accordion` do ciclo, fora do agrupamento por
  pergunta (que só se aplica a `identificadas`).
- Grep por `.sort(`/`.reverse(` em `agrupamento.ts`, `TextoAbertoLista.tsx`,
  `AvaliacaoIdentificadaCard.tsx`, `AnaliseAvaliacoesPage.tsx`, `SeletorCiclo.tsx`: só
  ocorrência é dentro de um comentário ("não é um `.sort()`"). Nenhuma numeração/
  posição visível em nenhum `Typography` (índices de array só usados como parte de
  `key` do React).
- `agruparPorCiclo`/`agruparIdentificadasPorPergunta`/o bucket interno de
  `TextoAbertoLista` usam exclusivamente `Map`, preservando ordem de inserção; o bucket
  de `TextoAbertoLista` opera sobre um único `grupo.textos` por vez (a chamada em
  `GrupoParesSubordinadoCard`/`GrupoClimaCard` não mudou) — nenhuma fusão de `textos`
  entre grupos `pares`/`subordinado` diferentes nem entre clima e 360.
- Distinção visual identificado vs. agregado permanece inequívoca após a
  reorganização: dentro de cada `AccordionDetails`, a subseção "Avaliação 360 —
  respostas identificadas" usa exclusivamente `AvaliacaoIdentificadaCard` (sempre
  mostra "`avaliadoNome` avaliado por `avaliadorNome`" + `Chip` de tipo), enquanto
  "pares e subordinados" (`GrupoParesSubordinadoCard`, mostra só `avaliadoNome`, nunca
  quem avaliou) e "Clima e Satisfação" (`GrupoClimaCard`, sem nenhum nome) ficam em
  subseções próprias com cabeçalho `subtitle2` distinto. O agrupamento por pergunta
  novo (`ocultarEnunciado`) só afasta o enunciado repetido do bloco identificado — não
  aproxima nem mistura visualmente com os blocos agregados abaixo.
- `AvisoLimitacaoAnonimizacao` renderizado uma única vez, acima de
  `gruposPorCiclo.map`, fora de qualquer `Accordion`.
- `SeletorCiclo.tsx`: grep por `papel`/`admin`/`gestor_rh`/`colaborador?.` não retorna
  nada; `STATUS_SELECIONAVEIS = new Set(['ativo', 'encerrado'])` exclui `rascunho`
  explicitamente; nunca chama `onChange` no `useEffect` de carga nem no fallback de
  `cicloId` órfão.
- `nomeCiclo` novo aparece só em `AvaliacaoIdentificada`/`GrupoParesSubordinado`/
  `GrupoClimaGeral` (metadado de ciclo) e nunca é combinado com `avaliadorId`/
  `avaliadorNome` em `agrupamento.ts`/`SeletorCiclo.tsx`/`GrupoParesSubordinadoCard.tsx`/
  `GrupoClimaCard.tsx` (grep confirma `avaliadorId`/`avaliadorNome` só aparecem em
  `AvaliacaoIdentificadaCard.tsx`).

Demais pontos do checklist de 18 conferidos sem achado: `break-word` presente em todo
`Typography` que renderiza `texto`/`perguntaEnunciado` em `TextoAbertoLista.tsx`,
`AvaliacaoIdentificadaCard.tsx` e no subtítulo de pergunta novo de
`AnaliseAvaliacoesPage.tsx` (sempre via `sx`, nunca `className="break-words"`);
`buscarCiclo` removido de ambas as páginas, sem uso remanescente; `SeletorCiclo` segue
o padrão `TextField select` + `MenuItem` de `PesquisasListPage.tsx`; ícone
`ExpandMoreIcon` importado de arquivo individual; `FormEvent<HTMLFormElement>`
importado explicitamente também em `AnaliseVisaoGeralPage.tsx`; filtro de ciclo
combinável com período (`handleCicloChange` não toca `de`/`ate` e vice-versa);
`defaultExpanded`/`resultadoVersao` implementados exatamente como especificado
(`defaultExpanded={Boolean(cicloId)}`, não controlado, `key`
`${resultadoVersao}-${cicloId}` incrementado só no caminho de sucesso de
`executarBusca`); sem novo `.css`, sem `style={{}}` extenso, Tailwind só para
layout/espaçamento (`className="min-w-[220px]"` em `SeletorCiclo` é só largura, não
compete com MUI); sem nova dependência em `package.json`.

### Deveria corrigir

1. **Possível novo aviso `react-hooks/exhaustive-deps` reintroduzido em ambas as
   páginas, não coberto pelo "0 erros / 2 avisos pré-existentes" relatado.** No
   `useEffect` de carga inicial de `AnaliseAvaliacoesPage.tsx` (linhas 65–69) e de
   `AnaliseVisaoGeralPage.tsx` (linhas 47–51), o desvio do plano adicionou só
   `// eslint-disable-next-line react-hooks/set-state-in-effect` — mas a versão
   anterior desta mesma página (documentada literalmente em
   `analise-avaliacoes/task-frontend.md`, plano 1.5, linhas 746–751) tinha **duas**
   supressões nesse mesmo bloco: `set-state-in-effect` **e**
   `// eslint-disable-next-line react-hooks/exhaustive-deps` logo antes de `}, [])`,
   porque `executarBusca` (memoizado via `useCallback` com deps `[de, ate, cicloId]`,
   portanto instável) é referenciado dentro do efeito sem entrar no array de
   dependências `[]` — o cenário clássico que a regra `exhaustive-deps` (`'warn'` na
   config deste projeto, confirmado em
   `node_modules/eslint-plugin-react-hooks/.../eslint-plugin-react-hooks.development.js`)
   sinaliza como "missing dependency: 'executarBusca'". A justificativa registrada no
   status ("mesmo padrão já usado em `CiclosListPage.tsx`/`PesquisasListPage.tsx`/
   `CicloDetalhePage.tsx`") não é totalmente equivalente: conferido por leitura, esses
   três arquivos usam `useEffect(() => { fn() }, [fn])` — **incluindo** a função
   memoizada no array de dependências (`[carregarCiclos]`, `[carregarPesquisas]`,
   `[carregar]`), cenário em que só `set-state-in-effect` precisa de supressão,
   porque não há dependência faltando. Já `AnaliseAvaliacoesPage`/
   `AnaliseVisaoGeralPage` usam deliberadamente `[]` (rodar só no mount, já que
   `executarBusca` muda a cada tecla em "De"/"Até"/troca de ciclo) — esse é o cenário
   que precisa da segunda supressão, e o precedente mais direto para essa combinação
   específica é a própria versão anterior deste arquivo, não os três citados. Pode ser
   que a versão instalada de `eslint-plugin-react-hooks` (`^7.1.1`) não sinalize esse
   caso por algum motivo não confirmado por mim (não executei `npm run lint`,
   ferramenta não disponível neste agente) — recomendo rodar `npm run lint` de novo e,
   se aparecer um aviso novo de `exhaustive-deps` nessas duas linhas, restaurar a
   segunda supressão (com o mesmo comentário de justificativa já usado antes) em vez
   de deixá-la de fora.

### Sugestão

1. `avaliadoNome`/`avaliadorNome` em `AvaliacaoIdentificadaCard.tsx` e `avaliadoNome`
   em `GrupoParesSubordinadoCard.tsx` continuam sem `overflowWrap`/`wordBreak` —
   nomes muito longos ou sem espaços poderiam, em tese, sofrer o mesmo problema de
   quebra de linha que motivou o fix desta task em `texto`/`perguntaEnunciado`. Fora
   do escopo declarado do plano (que restringe o fix a esses dois campos
   especificamente) — registrado só como candidato a follow-up, não como achado desta
   task.
2. Nada a apontar em `types/analise.ts`, `agrupamento.ts`, `SeletorCiclo.tsx` além do
   já citado — implementação bate literalmente com os blocos de código do plano
   (1.1, 1.3, 1.4).

**Conclusão**: sem achados críticos. Nenhum vazamento de identidade, nenhum bypass de
controle de acesso, nenhuma regra de gate recalculada no cliente, nenhuma fusão de
`textos` entre grupos `pares`/`subordinado`/clima distintos. A task pode prosseguir
para `test-engineer`; o item "Deveria corrigir" acima é sobre limpeza de lint
(risco zero para a regra de anonimização/controle de acesso), não bloqueante.

## Correção (frontend-developer)

Os dois achados da seção "Revisão" foram endereçados. Nenhuma mudança de lógica de
gate/anonimização; nenhuma mudança de comportamento de fetch (segue disparando só no
mount); nenhuma reordenação de texto/índice exibido.

1. **Deveria corrigir #1 — segunda supressão de lint restaurada.** Confirmado via
   `npm run lint` que os dois avisos `react-hooks/exhaustive-deps` vinham exatamente
   do `useEffect` de carga inicial (`AnaliseAvaliacoesPage.tsx` linha 69,
   `AnaliseVisaoGeralPage.tsx` linha 51) — `executarBusca` (deps `[de, ate, cicloId]`,
   instável) referenciada dentro de um efeito com array `[]`. Restaurada
   `// eslint-disable-next-line react-hooks/exhaustive-deps` em ambos os arquivos,
   com um comentário explicando que o fetch é intencionalmente só-no-mount (incluir
   `executarBusca` nas deps repetiria a busca a cada edição do formulário). Detalhe
   de posicionamento: a supressão `set-state-in-effect` precisa ficar imediatamente
   antes de `executarBusca()` (é ali que o erro é reportado) e a supressão
   `exhaustive-deps` precisa ficar imediatamente antes de `}, [])` (é ali, na linha
   do array de dependências, que o aviso é reportado) — tentar combinar as duas numa
   única `eslint-disable-next-line` antes de `executarBusca()` não suprime o aviso de
   `exhaustive-deps`, que fica associado à linha do array, não à chamada da função.
   Comportamento de fetch inalterado (só-no-mount).

2. **Sugestão #1 — `break-word` estendido a `avaliadoNome`/`avaliadorNome`/
   `nomeCiclo`.** Adicionado `sx={{ overflowWrap: 'break-word', wordBreak:
   'break-word' }}` ao `Typography` que envolve `avaliadoNome`/`avaliadorNome` em
   `AvaliacaoIdentificadaCard.tsx` e ao `Typography` que envolve `avaliadoNome` em
   `GrupoParesSubordinadoCard.tsx` (`GrupoClimaCard.tsx` não tem nenhum nome
   exibido, sem mudança necessária), e ao `Typography` do `nomeCiclo` no cabeçalho
   do `AccordionSummary` em `AnaliseAvaliacoesPage.tsx`. `overflow-wrap`/`word-break`
   são propriedades CSS herdadas, então aplicar no `Typography` pai cobre também os
   `<strong>` filhos sem precisar de `sx` em cada um.

Arquivos tocados nesta correção: `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx`,
`frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`,
`frontend/src/components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard.tsx`,
`frontend/src/components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard.tsx`.

`npm run build` (`tsc -b && vite build`): 0 erros, único aviso é o pré-existente de
chunk size > 500kB (não é erro de TS/ESLint).
`npm run lint` (`eslint .`): 0 erros, 0 avisos (os dois avisos `exhaustive-deps`
pré-existentes citados na revisão foram eliminados pela correção do item 1).
