/**
 * Utilitários puros de CPF, sem dependência externa. `cpfValido` é usada
 * apenas como gate de UX (desabilita/avisa antes de enviar o formulário) —
 * a validação autoritativa, incluindo unicidade, é sempre do backend. O
 * formulário precisa continuar exibindo o erro vindo da API (`CPF_INVALIDO`/
 * `CPF_DUPLICADO`) mesmo quando esta validação client-side já passou.
 */

/** Remove tudo que não é dígito. */
export function normalizarCpf(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Aplica a máscara `000.000.000-00` progressivamente enquanto o usuário digita. */
export function formatarCpf(valor: string): string {
  const digitos = normalizarCpf(valor).slice(0, 11)

  let resultado = digitos.slice(0, 3)
  if (digitos.length > 3) resultado += `.${digitos.slice(3, 6)}`
  if (digitos.length > 6) resultado += `.${digitos.slice(6, 9)}`
  if (digitos.length > 9) resultado += `-${digitos.slice(9, 11)}`
  return resultado
}

/**
 * Valida 11 dígitos + os dois dígitos verificadores (algoritmo mod 11 da
 * Receita Federal). Aceita tanto CPF já mascarado quanto só dígitos.
 */
export function cpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const calcularDigitoVerificador = (base: string, pesoInicial: number): number => {
    let soma = 0
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (pesoInicial - i)
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  const digito1 = calcularDigitoVerificador(cpf.slice(0, 9), 10)
  const digito2 = calcularDigitoVerificador(cpf.slice(0, 9) + String(digito1), 11)

  return cpf.slice(9, 11) === `${digito1}${digito2}`
}
