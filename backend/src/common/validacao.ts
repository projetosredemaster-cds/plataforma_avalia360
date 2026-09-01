import { ErroHttp } from './erro-http'

interface OpcoesTextoObrigatorio {
  campo: string
  min?: number
  max?: number
}

/**
 * Validação manual de texto obrigatório (sem lib de validação — o volume de
 * campos desta task não justifica introduzir zod/class-validator; ver
 * resumo da task para essa decisão registrada).
 */
export function validarTextoObrigatorio(
  valor: unknown,
  opcoes: OpcoesTextoObrigatorio,
): string {
  const { campo, min = 1, max } = opcoes

  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" é obrigatório.`)
  }

  const texto = valor.trim()

  if (texto.length < min) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      `Campo "${campo}" deve ter pelo menos ${min} caractere(s).`,
    )
  }

  if (max !== undefined && texto.length > max) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      `Campo "${campo}" deve ter no máximo ${max} caractere(s).`,
    )
  }

  return texto
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mesmo regex já usado no frontend (EsqueciSenhaModal.tsx), por consistência. */
export function validarEmail(valor: unknown, campo = 'email'): string {
  if (typeof valor !== 'string' || !REGEX_EMAIL.test(valor.trim())) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', `Campo "${campo}" inválido.`)
  }
  return valor.trim().toLowerCase()
}

export function validarEnum<T extends string>(
  valor: unknown,
  valoresValidos: readonly T[],
  campo: string,
): T {
  if (typeof valor !== 'string' || !valoresValidos.includes(valor as T)) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      `Campo "${campo}" deve ser um dos valores: ${valoresValidos.join(', ')}.`,
    )
  }
  return valor as T
}
