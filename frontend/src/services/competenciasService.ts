import { apiFetch } from '../lib/apiClient'
import type { Competencia } from '../types/competencia'

/** Usado só para popular o editor de pergunta `matriz`. Sem escrita nesta task. */
export function listarCompetencias(): Promise<Competencia[]> {
  return apiFetch<Competencia[]>('/api/competencias')
}
