/**
 * `tipo` (enum `tipo_pesquisa`) é IMUTÁVEL após a criação — deliberadamente
 * NÃO declarado aqui. `pesquisas.service.atualizar()` nunca lê `dto.tipo`;
 * um cliente que o envie neste PUT tem o campo silenciosamente ignorado
 * (mesmo critério já usado para `status`, que só muda via
 * `PATCH /api/pesquisas/:id/status`).
 */
export interface AtualizarPesquisaDto {
  titulo?: string
  mensagemBoasVindas?: string | null
  logoUrl?: string | null
  cicloId?: string | null
}
