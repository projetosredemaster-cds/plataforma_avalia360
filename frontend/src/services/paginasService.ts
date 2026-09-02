import { apiFetch } from '../lib/apiClient'
import type { Pagina, ReordenarItem } from '../types/pesquisa'

/**
 * Resposta real de `POST /api/pesquisas/:id/paginas` (ver `mapearPagina` em
 * `backend/src/modules/paginas-pesquisa/paginas-pesquisa.service.ts`) — uma
 * página recém-criada nunca tem `perguntas`, então o backend não retorna
 * esse campo. `Pagina` declara `perguntas` como obrigatório; usamos este
 * tipo só para descrever o corpo cru antes de completá-lo abaixo.
 */
type PaginaCriadaResponse = Omit<Pagina, 'perguntas'>

export async function criarPagina(pesquisaId: string, dados: { titulo?: string } = {}): Promise<Pagina> {
  const paginaCriada = await apiFetch<PaginaCriadaResponse>(`/api/pesquisas/${pesquisaId}/paginas`, {
    method: 'POST',
    body: dados,
  })
  return { ...paginaCriada, perguntas: [] }
}

export function atualizarPagina(pesquisaId: string, paginaId: string, dados: { titulo?: string }): Promise<Pagina> {
  return apiFetch<Pagina>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}`, { method: 'PUT', body: dados })
}

export function removerPagina(pesquisaId: string, paginaId: string): Promise<void> {
  return apiFetch<void>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}`, { method: 'DELETE' })
}

/**
 * Envia a lista COMPLETA de páginas do escopo (todas as páginas da
 * pesquisa) recalculada a cada movimento — nunca só o item movido. O
 * backend valida que `itens` cobre exatamente o conjunto de ids existentes
 * (`422 ORDEM_INVALIDA` caso contrário).
 */
export function reordenarPaginas(pesquisaId: string, itens: ReordenarItem[]): Promise<void> {
  return apiFetch<void>(`/api/pesquisas/${pesquisaId}/paginas/reordenar`, { method: 'PATCH', body: { itens } })
}
