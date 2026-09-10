export interface CriarCicloDto {
  nome: string
  descricao?: string
  dataInicio: string 
  dataFim: string 
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
