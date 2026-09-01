/**
 * Remove tudo que não é dígito. Não valida tamanho — só normaliza.
 * Aceita `unknown` (o body chega como JSON não tipado): qualquer entrada que
 * não seja string (número, boolean, objeto, null/undefined) retorna string
 * vazia em vez de lançar — isso garante que `validarCpf` sempre recebe uma
 * string e falha pelo caminho normal (`422 CPF_INVALIDO`), igual aos demais
 * validadores do módulo (`validarTextoObrigatorio`/`validarEmail`/
 * `validarEnum`), nunca um `TypeError` não tratado virando `500`.
 */
export function normalizarCpf(valor: unknown): string {
  if (typeof valor !== 'string') {
    return ''
  }
  return valor.replace(/\D/g, '')
}

/**
 * Exige exatamente 11 dígitos, rejeita sequências de dígito repetido
 * (00000000000...99999999999) e confere os dois dígitos verificadores pelo
 * algoritmo mod 11 padrão da Receita Federal. Retorna boolean puro (sem
 * lançar) — quem chama decide o erro HTTP.
 */
export function validarCpf(cpfDigitos: string): boolean {
  if (!/^\d{11}$/.test(cpfDigitos)) {
    return false
  }

  if (/^(\d)\1{10}$/.test(cpfDigitos)) {
    return false
  }

  const digitos = cpfDigitos.split('').map((d) => Number(d))

  const calcularDigitoVerificador = (base: number[]): number => {
    let peso = base.length + 1
    let soma = 0
    for (const digito of base) {
      soma += digito * peso
      peso -= 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const primeiros9 = digitos.slice(0, 9)
  const digitoVerificador1 = calcularDigitoVerificador(primeiros9)
  if (digitoVerificador1 !== digitos[9]) {
    return false
  }

  const primeiros10 = digitos.slice(0, 10)
  const digitoVerificador2 = calcularDigitoVerificador(primeiros10)
  if (digitoVerificador2 !== digitos[10]) {
    return false
  }

  return true
}
