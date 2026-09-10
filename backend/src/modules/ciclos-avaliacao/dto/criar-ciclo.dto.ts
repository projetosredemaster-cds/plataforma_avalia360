export interface CriarCicloDto {
  nome: string
  descricao?: string
  dataInicio: string 
  dataFim: string
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
