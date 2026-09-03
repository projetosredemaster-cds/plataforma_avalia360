import { apiFetch } from '../lib/apiClient'
import type { EnvioPesquisaAcao, ListarEnviosCicloResposta } from '../types/envio'

/** Dado IDENTIFICADO — só pode ser consumido dentro de `CicloDetalhePage`. Ver `types/envio.ts`. */
export function listarEnvios(cicloId: string): Promise<ListarEnviosCicloResposta> {
  return apiFetch<ListarEnviosCicloResposta>(`/api/ciclos/${cicloId}/envios`)
}

/** Só aceito pelo backend com o envio em `pendente` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). Para clima_geral, `envioId` é o id do envio único da campanha. */
export function marcarComoEnviado(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/marcar-enviado`, { method: 'PATCH' })
}

/** Só aceito pelo backend com o envio em `enviado` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). */
export function registrarLembrete(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/registrar-lembrete`, {
    method: 'PATCH',
  })
}

/** Aceito a partir de qualquer status (conforme contrato do backend), inclusive idempotente. */
export function expirarEnvio(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/expirar`, { method: 'PATCH' })
}
