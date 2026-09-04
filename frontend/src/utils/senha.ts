/**
 * Utilitários puros de validação de senha, sem dependência externa. Critério
 * de senha forte: mínimo 6 caracteres, pelo menos 1 letra maiúscula, 1
 * minúscula e 1 caractere especial. Usada como gate de UX (checklist visível
 * + bloqueio de submit) em qualquer ponto de definição de senha nova.
 */

export interface CriteriosSenha {
  tamanhoMinimo: boolean
  maiuscula: boolean
  minuscula: boolean
  caractereEspecial: boolean
}

const TAMANHO_MINIMO = 6
const REGEX_MAIUSCULA = /[A-Z]/
const REGEX_MINUSCULA = /[a-z]/
const REGEX_CARACTERE_ESPECIAL = /[^A-Za-z0-9]/

/** Avalia cada critério de força individualmente, para uso em checklists. */
export function avaliarCriteriosSenha(senha: string): CriteriosSenha {
  return {
    tamanhoMinimo: senha.length >= TAMANHO_MINIMO,
    maiuscula: REGEX_MAIUSCULA.test(senha),
    minuscula: REGEX_MINUSCULA.test(senha),
    caractereEspecial: REGEX_CARACTERE_ESPECIAL.test(senha),
  }
}

/** `true` somente quando todos os critérios de força são atendidos. */
export function senhaValida(senha: string): boolean {
  const criterios = avaliarCriteriosSenha(senha)
  return Object.values(criterios).every(Boolean)
}
