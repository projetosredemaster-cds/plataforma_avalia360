export interface CriarCicloDto {
  nome: string
  descricao?: string
  dataInicio: string // "YYYY-MM-DD"
  dataFim: string // "YYYY-MM-DD"
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  // Se omitido, usa TIPO_RELACIONAMENTO_GERACAO_VALORES (os 4 tipos) como
  // default. Validado via validarListaEnum quando enviado explicitamente.
  tiposRelacionamentoGerados?: string[]
}
