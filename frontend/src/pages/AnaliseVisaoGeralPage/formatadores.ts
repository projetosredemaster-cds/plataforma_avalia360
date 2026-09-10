const FORMATADOR_NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const FORMATADOR_INTEIRO = new Intl.NumberFormat('pt-BR')

export function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor)
}

export function formatarPercentual(valor: number): string {
  return `${FORMATADOR_NUMERO.format(valor)}%`
}

export function formatarHoras(horas: number): string {
  if (horas <= 0) return '—'
  if (horas < 24) return `${FORMATADOR_NUMERO.format(horas)} h`
  return `${FORMATADOR_NUMERO.format(horas / 24)} d`
}

export function inicioAnoCorrenteYMD(): string {
  return `${new Date().getFullYear()}-01-01`
}

export function hojeYMD(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
