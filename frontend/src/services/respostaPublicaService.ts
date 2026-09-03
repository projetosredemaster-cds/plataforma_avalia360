import { apiFetch } from '../lib/apiClient'
import type {
  ConfirmarCpfResposta,
  EnviarRespostasPayload,
  FormularioPublicoResposta,
  StatusEnvioPublicoResposta,
} from '../types/respostaPublica'

/**
 * Transporte fino sobre os 4 endpoints públicos de `/api/publico` — sem
 * lógica de negócio, sem agregação. Todas as chamadas usam
 * `semAutenticacao: true`: nenhuma delas deve enviar `Authorization`, mesmo
 * quando a aba tiver uma sessão Supabase ativa de admin/gestor_rh.
 */

export function consultarStatusEnvio(token: string): Promise<StatusEnvioPublicoResposta> {
  return apiFetch<StatusEnvioPublicoResposta>(`/api/publico/envios/${token}/status`, {
    semAutenticacao: true,
  })
}

export function confirmarCpf(token: string, cpf: string): Promise<ConfirmarCpfResposta> {
  return apiFetch<ConfirmarCpfResposta>(`/api/publico/envios/${token}/confirmar-cpf`, {
    method: 'POST',
    body: { cpf },
    semAutenticacao: true,
  })
}

export function buscarFormularioPublico(sessaoToken: string): Promise<FormularioPublicoResposta> {
  return apiFetch<FormularioPublicoResposta>(`/api/publico/sessoes/${sessaoToken}/formulario`, {
    semAutenticacao: true,
  })
}

export function enviarRespostasPublico(
  sessaoToken: string,
  payload: EnviarRespostasPayload,
): Promise<{ sucesso: true }> {
  return apiFetch<{ sucesso: true }>(`/api/publico/sessoes/${sessaoToken}/respostas`, {
    method: 'POST',
    body: payload,
    semAutenticacao: true,
  })
}
