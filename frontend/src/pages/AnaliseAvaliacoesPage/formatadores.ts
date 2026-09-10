/** `'YYYY-MM-DD'` do primeiro dia do ano corrente — sugestão inicial de UX, nunca um default do backend. */
export function inicioAnoCorrenteYMD(): string {
  return `${new Date().getFullYear()}-01-01`
}

/** `'YYYY-MM-DD'` de hoje, fuso local — sugestão inicial de UX. */
export function hojeYMD(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
