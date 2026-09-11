const FORMATADOR_NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const FORMATADOR_INTEIRO = new Intl.NumberFormat('pt-BR')

export function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor)
}

export function formatarPercentual(valor: number): string {
  return `${FORMATADOR_NUMERO.format(valor)}%`
}

export function formatarTempoMedio(horas: number): string {
  if (horas <= 0) return '—'

  const totalMinutos = Math.round(horas * 60)

  if (totalMinutos < 60) {
    return `${totalMinutos}min`
  }

  const dias = Math.floor(totalMinutos / 1440)
  const horasRestantes = Math.floor((totalMinutos % 1440) / 60)
  const minutosRestantes = totalMinutos % 60

  if (totalMinutos < 1440) {
    return minutosRestantes === 0 ? `${horasRestantes}h` : `${horasRestantes}h ${minutosRestantes}min`
  }

  const partes = [`${dias}d`]
  if (horasRestantes > 0) partes.push(`${horasRestantes}h`)
  if (minutosRestantes > 0) partes.push(`${minutosRestantes}min`)
  return partes.join(' ')
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
