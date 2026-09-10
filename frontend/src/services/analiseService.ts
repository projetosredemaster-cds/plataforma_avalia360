import { apiFetch } from '../lib/apiClient'
import type { AvaliacoesAnalise, VisaoGeralAnalise } from '../types/analise'

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
