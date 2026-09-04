// Nunca declara `status` — transição de status é feita só via
// PATCH /api/ciclos/:id/status (ver atualizar-status-ciclo.dto.ts).
export interface AtualizarCicloDto {
  nome?: string
  descricao?: string | null
  dataInicio?: string
  dataFim?: string
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  // Se omitido, mantém o valor atual do ciclo (nunca reseta para o default).
  tiposRelacionamentoGerados?: string[]
}
