import { apiFetch } from '../lib/apiClient'
import type { Equipe } from '../types/colaborador'

/** Colaborador vinculado a uma equipe, retornado por `GET /api/equipes/:id/colaboradores`. */
export interface ColaboradorDaEquipe {
  id: string
  nomeCompleto: string
  cargo: string | null
  ativo: boolean
}

export function listarEquipes(): Promise<Equipe[]> {
  return apiFetch<Equipe[]>('/api/equipes')
}

export function criarEquipe(nome: string): Promise<Equipe> {
  return apiFetch<Equipe>('/api/equipes', { method: 'POST', body: { nome } })
}

export function atualizarEquipe(id: string, nome: string): Promise<Equipe> {
  return apiFetch<Equipe>(`/api/equipes/${id}`, { method: 'PUT', body: { nome } })
}

export function removerEquipe(id: string): Promise<void> {
  return apiFetch<void>(`/api/equipes/${id}`, { method: 'DELETE' })
}

export function listarColaboradoresDaEquipe(id: string): Promise<ColaboradorDaEquipe[]> {
  return apiFetch<ColaboradorDaEquipe[]>(`/api/equipes/${id}/colaboradores`)
}

/** Substituição total: quem não estiver em `colaboradorIds` é desvinculado da equipe. */
export function vincularColaboradoresEquipe(id: string, colaboradorIds: string[]): Promise<ColaboradorDaEquipe[]> {
  return apiFetch<ColaboradorDaEquipe[]>(`/api/equipes/${id}/colaboradores`, {
    method: 'PATCH',
    body: { colaboradorIds },
  })
}
