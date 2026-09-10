
export interface AtualizarCicloDto {
  nome?: string
  descricao?: string | null
  dataInicio?: string
  dataFim?: string
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
