import { describe, expect, it } from 'vitest'
import { ErroHttp } from './erro-http'
import { validarEmail, validarEnum, validarTextoObrigatorio } from './validacao'

describe('validarTextoObrigatorio', () => {
  it('aceita texto válido e retorna aparado (trim)', () => {
    expect(validarTextoObrigatorio('  Equipe X  ', { campo: 'nome', min: 2, max: 255 })).toBe('Equipe X')
  })

  it.each([undefined, null, 123, {}, [], ''])('rejeita entrada não-string/vazia: %s', (valor) => {
    expect(() => validarTextoObrigatorio(valor, { campo: 'nome' })).toThrow(ErroHttp)
  })

  it('rejeita texto abaixo do mínimo', () => {
    expect(() => validarTextoObrigatorio('A', { campo: 'nome', min: 2 })).toThrow(ErroHttp)
  })

  it('rejeita texto acima do máximo', () => {
    expect(() => validarTextoObrigatorio('A'.repeat(256), { campo: 'nome', max: 255 })).toThrow(ErroHttp)
  })
})

describe('validarEmail', () => {
  it('aceita e-mail válido e normaliza para minúsculas', () => {
    expect(validarEmail('Fulano@Exemplo.COM')).toBe('fulano@exemplo.com')
  })

  it.each(['sem-arroba.com', 'sem-dominio@', '@exemplo.com', '', 123, null, undefined])(
    'rejeita e-mail inválido: %s',
    (valor) => {
      expect(() => validarEmail(valor)).toThrow(ErroHttp)
    },
  )
})

describe('validarEnum', () => {
  const valores = ['admin', 'gestor_rh', 'colaborador'] as const

  it('aceita valor presente na lista', () => {
    expect(validarEnum('admin', valores, 'papel')).toBe('admin')
  })

  it.each(['ADMIN', 'root', '', 123, null, undefined])('rejeita valor fora da lista/tipo errado: %s', (valor) => {
    expect(() => validarEnum(valor, valores, 'papel')).toThrow(ErroHttp)
  })
})
