import { apiFetch } from '../lib/apiClient'
import type { AtualizarPerguntaPayload, Pergunta, PerguntaPayload, ReordenarItem } from '../types/pesquisa'

export function criarPergunta(pesquisaId: string, paginaId: string, dados: PerguntaPayload): Promise<Pergunta> {
  return apiFetch<Pergunta>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}/perguntas`, {
    method: 'POST',
    body: dados,
  })
}

export function atualizarPergunta(
  pesquisaId: string,
  paginaId: string,
  perguntaId: string,
  dados: AtualizarPerguntaPayload,
): Promise<Pergunta> {
  return apiFetch<Pergunta>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}/perguntas/${perguntaId}`, {
    method: 'PUT',
    body: dados,
  })
}

export function removerPergunta(pesquisaId: string, paginaId: string, perguntaId: string): Promise<void> {
  return apiFetch<void>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}/perguntas/${perguntaId}`, {
    method: 'DELETE',
  })
}

/**
 * Envia a lista COMPLETA de perguntas da página (não só o item movido). O
 * backend valida que `itens` cobre exatamente o conjunto de ids existentes
 * na página (`422 ORDEM_INVALIDA` caso contrário).
 */
export function reordenarPerguntas(pesquisaId: string, paginaId: string, itens: ReordenarItem[]): Promise<void> {
  return apiFetch<void>(`/api/pesquisas/${pesquisaId}/paginas/${paginaId}/perguntas/reordenar`, {
    method: 'PATCH',
    body: { itens },
  })
}
