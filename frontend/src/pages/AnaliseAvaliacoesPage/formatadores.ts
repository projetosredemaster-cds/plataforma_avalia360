export function inicioAnoCorrenteYMD(): string {
  return `${new Date().getFullYear()}-01-01`
}

export function hojeYMD(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
