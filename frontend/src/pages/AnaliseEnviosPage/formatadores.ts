const FORMATADOR_INTEIRO = new Intl.NumberFormat('pt-BR')
const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR')

export function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor)
}

export function formatarData(data: string): string {
  return FORMATADOR_DATA.format(new Date(`${data}T00:00:00`))
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
