import { apiFetch } from '../lib/apiClient'
import type { Participante } from '../types/ciclo'

export function listarParticipantes(cicloId: string): Promise<Participante[]> {
  return apiFetch<Participante[]>(`/api/ciclos/${cicloId}/participantes`)
}

/**
 * Retorna a lista COMPLETA atualizada de participantes (não um delta) — a
 * página deve usar o retorno diretamente para atualizar o estado local,
 * nunca fazer um `GET` extra logo em seguida.
 */
export function adicionarParticipantesIndividual(
  cicloId: string,
  colaboradorIds: string[],
): Promise<Participante[]> {
  return apiFetch<Participante[]>(`/api/ciclos/${cicloId}/participantes`, {
    method: 'POST',
    body: { colaboradorIds },
  })
}

/**
 * Retorna a lista COMPLETA atualizada de participantes. Equipe sem
 * colaboradores ativos (ou já todos participantes) não é erro — a lista
 * simplesmente volta inalterada.
 */
export function adicionarParticipantesPorEquipe(cicloId: string, equipeId: string): Promise<Participante[]> {
  return apiFetch<Participante[]>(`/api/ciclos/${cicloId}/participantes/por-equipe`, {
    method: 'POST',
    body: { equipeId },
  })
}

export function removerParticipante(cicloId: string, colaboradorId: string): Promise<void> {
  return apiFetch<void>(`/api/ciclos/${cicloId}/participantes/${colaboradorId}`, { method: 'DELETE' })
}
