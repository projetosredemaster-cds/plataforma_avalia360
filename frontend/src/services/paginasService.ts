import { apiFetch } from '../lib/apiClient'
import type { Pagina, ReordenarItem } from '../types/pesquisa'

export function criarPagina(pesquisaId: string, dados: { titulo?: string } = {}): Promise<Pagina> {
  return apiFetch<Pagina>(`/api/pesquisas/${pesquisaId}/paginas`, { method: 'POST', body: dados })
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
