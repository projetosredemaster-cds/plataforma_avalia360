import { apiFetch } from '../lib/apiClient'
import type {
  AvaliacoesAnalise,
  NuvemPalavrasAnalise,
  RankingAnalise,
  ResultadosPerguntaAnalise,
  VisaoGeralAnalise,
} from '../types/analise'

export interface BuscarVisaoGeralAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/visao-geral` — dado 100% agregado (contagens/médias),
 * nunca identificado. `de`/`ate` são sempre obrigatórios (sem default no
 * backend); quem decide a sugestão inicial de período é a página.
 */
export function buscarVisaoGeralAnalise(params: BuscarVisaoGeralAnaliseParams): Promise<VisaoGeralAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<VisaoGeralAnalise>(`/api/analise/visao-geral?${query.toString()}`)
}

export interface BuscarAvaliacoesAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/avaliacoes` — payload MISTO (ver comentário em
 * `types/analise.ts`): identidade completa para autoavaliacao/gestor/externo,
 * agregado/reembaralhado (ou bloqueio explícito, sem bypass para nenhum
 * papel) para pares/subordinado/clima.
 */
export function buscarAvaliacoesAnalise(params: BuscarAvaliacoesAnaliseParams): Promise<AvaliacoesAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<AvaliacoesAnalise>(`/api/analise/avaliacoes?${query.toString()}`)
}

export interface BuscarRankingAnaliseParams {
  cicloId: string // obrigatório — a página nunca chama esta função com cicloId vazio
  modo?: 'avaliado' | 'equipe'
  cargo?: string
  equipeId?: string
  ordenarPor?: 'likert' | 'matriz'
  ordem?: 'asc' | 'desc'
}

/**
 * `GET /api/analise/ranking` — identifica o avaliado (nome/id), NUNCA o
 * avaliador de pares/subordinado; nota agregada com gate próprio, sinalizado
 * só por booleanos (`paresInsuficiente`/`subordinadoInsuficiente`/
 * `dadosInsuficientes*`), nunca por contagem. `cicloId` é obrigatório na API
 * — quem garante que só é chamada com um ciclo selecionado é a página.
 */
export function buscarRankingAnalise(params: BuscarRankingAnaliseParams): Promise<RankingAnalise> {
  const query = new URLSearchParams({ cicloId: params.cicloId })
  if (params.modo) query.set('modo', params.modo)
  if (params.cargo) query.set('cargo', params.cargo)
  if (params.equipeId) query.set('equipeId', params.equipeId)
  if (params.ordenarPor) query.set('ordenarPor', params.ordenarPor)
  if (params.ordem) query.set('ordem', params.ordem)
  return apiFetch<RankingAnalise>(`/api/analise/ranking?${query.toString()}`)
}

export interface BuscarNuvemPalavrasAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/nuvem-palavras` — dado 100% agregado (frequência de
 * palavras + métricas complementares), nunca identificado. `de`/`ate` são
 * sempre obrigatórios (sem default no backend); `cicloId` é opcional, mesmo
 * padrão de `buscarAvaliacoesAnalise`. `palavras` já vem ordenada/cortada
 * pelo backend — esta função só transporta, não reordena.
 */
export function buscarNuvemPalavrasAnalise(
  params: BuscarNuvemPalavrasAnaliseParams,
): Promise<NuvemPalavrasAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<NuvemPalavrasAnalise>(`/api/analise/nuvem-palavras?${query.toString()}`)
}

export interface BuscarResultadosPerguntaAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/resultados-pergunta` — distribuição de contagens por
 * nível (likert/matriz) ou opção (caixa_selecao), por pergunta. Tela MAIS
 * ESTRITA do módulo: nunca expõe totalRespondentes/minimoNecessario, só
 * `liberado`/`motivo`. `distribuicao`/`competencias` já vem zero-preenchida
 * e ordenada pelo backend — esta função só transporta, não reordena/completa.
 */
export function buscarResultadosPerguntaAnalise(
  params: BuscarResultadosPerguntaAnaliseParams,
): Promise<ResultadosPerguntaAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<ResultadosPerguntaAnalise>(`/api/analise/resultados-pergunta?${query.toString()}`)
}
