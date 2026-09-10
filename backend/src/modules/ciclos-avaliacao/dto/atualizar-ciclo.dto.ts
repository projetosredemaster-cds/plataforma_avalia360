
export interface AtualizarCicloDto {
  nome?: string
  descricao?: string | null
  dataInicio?: string
  dataFim?: string
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
