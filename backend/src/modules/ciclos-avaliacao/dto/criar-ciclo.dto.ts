export interface CriarCicloDto {
  nome: string
  descricao?: string
  dataInicio: string // "YYYY-MM-DD"
  dataFim: string // "YYYY-MM-DD"
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
}
