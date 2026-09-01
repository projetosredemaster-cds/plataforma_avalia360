import { apiFetch } from '../lib/apiClient'
import type { Equipe } from '../types/colaborador'

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
