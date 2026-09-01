import { apiFetch } from '../lib/apiClient'
import type { Pesquisa, PesquisaResumo, StatusPesquisa } from '../types/pesquisa'

/** Corpo de `POST /api/pesquisas` — o backend ainda não distingue "ausente" de "null" neste endpoint, então campos opcionais vazios devem ser omitidos (nunca `null`). */
export interface CriarPesquisaPayload {
  titulo: string
  mensagemBoasVindas?: string
  logoUrl?: string
}

/**
 * Corpo de `PUT /api/pesquisas/:id`. `mensagemBoasVindas`/`logoUrl` aceitam
 * `null` explícito para "limpar" o campo — distinto de omitido ("não
 * alterar"), mesmo padrão `'campo' in dto` já usado pelo backend para
 * `cicloId`. Nunca envie string vazia como substituto de `null`.
 */
export interface AtualizarPesquisaPayload {
  titulo?: string
  mensagemBoasVindas?: string | null
  logoUrl?: string | null
}

/**
 * `GET /api/pesquisas` não pagina/filtra no servidor — busca, filtro de
 * status e ordenação da listagem são inteiramente client-side sobre o array
 * completo (mesmo padrão de `colaboradores`/`equipes`).
 */
export function listarPesquisas(): Promise<PesquisaResumo[]> {
  return apiFetch<PesquisaResumo[]>('/api/pesquisas')
}

export function buscarPesquisa(id: string): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}`)
}

export function criarPesquisa(dados: CriarPesquisaPayload): Promise<Pesquisa> {
  return apiFetch<Pesquisa>('/api/pesquisas', { method: 'POST', body: dados })
}

/**
 * `PUT /api/pesquisas/:id` não é restrito por status na API — a trava de
 * "só editar cabeçalho em rascunho" é decisão de UX puramente client-side
 * (ver `PesquisaConstrutorPage`), sem correspondência real neste endpoint.
 */
export function atualizarPesquisa(id: string, dados: AtualizarPesquisaPayload): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}`, { method: 'PUT', body: dados })
}

export function atualizarStatusPesquisa(id: string, status: StatusPesquisa): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}/status`, { method: 'PATCH', body: { status } })
}

export function duplicarPesquisa(id: string): Promise<Pesquisa> {
  return apiFetch<Pesquisa>(`/api/pesquisas/${id}/duplicar`, { method: 'POST' })
}

/** Só permitido com a pesquisa em `rascunho` (`409 PESQUISA_NAO_REMOVIVEL` caso contrário). */
export function removerPesquisa(id: string): Promise<void> {
  return apiFetch<void>(`/api/pesquisas/${id}`, { method: 'DELETE' })
}
