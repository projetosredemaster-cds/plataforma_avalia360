import { apiFetch } from '../lib/apiClient'
import type { Ciclo, Relacionamento, StatusCiclo } from '../types/ciclo'

/** Corpo de `POST /api/ciclos`. */
export interface CriarCicloPayload {
  nome: string
  descricao?: string
  dataInicio: string // 'YYYY-MM-DD'
  dataFim: string // 'YYYY-MM-DD'
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
}

/**
 * Corpo de `PUT /api/ciclos/:id` — mesmos campos de `CriarCicloPayload`,
 * todos opcionais, sem `status` (transição de status é sempre via
 * `PATCH /api/ciclos/:id/status`). Só aceito pelo backend com o ciclo em
 * `rascunho` (`409 CICLO_NAO_EDITAVEL` caso contrário).
 */
export type AtualizarCicloPayload = Partial<CriarCicloPayload>

/**
 * `GET /api/ciclos` não pagina/filtra no servidor — busca e filtro de
 * status da listagem são inteiramente client-side (mesmo padrão de
 * `pesquisas`/`colaboradores`/`equipes`).
 */
export function listarCiclos(): Promise<Ciclo[]> {
  return apiFetch<Ciclo[]>('/api/ciclos')
}

export function buscarCiclo(id: string): Promise<Ciclo> {
  return apiFetch<Ciclo>(`/api/ciclos/${id}`)
}

export function criarCiclo(payload: CriarCicloPayload): Promise<Ciclo> {
  return apiFetch<Ciclo>('/api/ciclos', { method: 'POST', body: payload })
}

/** Só aceito pelo backend com o ciclo em `rascunho` (`409 CICLO_NAO_EDITAVEL` caso contrário). */
export function atualizarCiclo(id: string, payload: AtualizarCicloPayload): Promise<Ciclo> {
  return apiFetch<Ciclo>(`/api/ciclos/${id}`, { method: 'PUT', body: payload })
}

/** Só permitido com o ciclo em `rascunho` (`409 CICLO_NAO_REMOVIVEL` caso contrário). */
export function removerCiclo(id: string): Promise<void> {
  return apiFetch<void>(`/api/ciclos/${id}`, { method: 'DELETE' })
}

/**
 * Transições válidas: `rascunho → ativo`, `ativo → encerrado`, mais nenhuma
 * (`409 TRANSICAO_STATUS_INVALIDA`). Ativar sem nenhum participante →
 * `422 CICLO_SEM_PARTICIPANTES`.
 */
export function atualizarStatusCiclo(id: string, status: StatusCiclo): Promise<Ciclo> {
  return apiFetch<Ciclo>(`/api/ciclos/${id}/status`, { method: 'PATCH', body: { status } })
}

/**
 * Dado IDENTIFICADO de quem avalia quem — só pode ser consumido dentro de
 * `CicloDetalhePage`. Ver aviso de anonimização em `types/ciclo.ts`.
 */
export function listarRelacionamentos(id: string): Promise<Relacionamento[]> {
  return apiFetch<Relacionamento[]>(`/api/ciclos/${id}/relacionamentos`)
}
