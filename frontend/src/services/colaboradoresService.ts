import { apiFetch } from '../lib/apiClient'
import type { Colaborador, Papel } from '../types/colaborador'

/**
 * Corpo enviado em POST/PUT de colaborador. `equipeId`/`gestorId` aceitam
 * `null` explícito para representar "Nenhuma equipe"/"Nenhum gestor" — o
 * formulário sempre envia o estado completo (não é um PATCH parcial), então
 * limpar um vínculo precisa ser expresso como `null`, não omissão do campo.
 */
export interface ColaboradorPayload {
  nomeCompleto: string
  email?: string
  cpf: string
  papel: Papel
  cargo?: string
  ehGestor: boolean
  equipeId?: string | null
  gestorId?: string | null
}

export interface CriarColaboradorResposta extends Colaborador {
  emailDefinicaoSenhaEnviado: boolean | null
}

export interface ListarColaboradoresFiltros {
  ehGestor?: boolean
  ativo?: boolean
}

export function listarColaboradores(filtros?: ListarColaboradoresFiltros): Promise<Colaborador[]> {
  const params = new URLSearchParams()
  if (filtros?.ehGestor !== undefined) params.set('ehGestor', String(filtros.ehGestor))
  if (filtros?.ativo !== undefined) params.set('ativo', String(filtros.ativo))
  const query = params.toString()
  return apiFetch<Colaborador[]>(`/api/colaboradores${query ? `?${query}` : ''}`)
}

export function buscarColaborador(id: string): Promise<Colaborador> {
  return apiFetch<Colaborador>(`/api/colaboradores/${id}`)
}

export function criarColaborador(payload: ColaboradorPayload): Promise<CriarColaboradorResposta> {
  return apiFetch<CriarColaboradorResposta>('/api/colaboradores', {
    method: 'POST',
    body: payload,
  })
}

export function atualizarColaborador(id: string, payload: ColaboradorPayload): Promise<Colaborador> {
  return apiFetch<Colaborador>(`/api/colaboradores/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export function atualizarStatusColaborador(id: string, ativo: boolean): Promise<Colaborador> {
  return apiFetch<Colaborador>(`/api/colaboradores/${id}/status`, {
    method: 'PATCH',
    body: { ativo },
  })
}
