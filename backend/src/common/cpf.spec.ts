import { describe, expect, it } from 'vitest'
import { normalizarCpf, validarCpf } from './cpf'

describe('normalizarCpf', () => {
  it('remove pontuação de máscara, mantendo só os dígitos', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725')
  })

  it('mantém string já sem máscara inalterada', () => {
    expect(normalizarCpf('52998224725')).toBe('52998224725')
  })

  it('máscara e valor sem máscara normalizam para o mesmo resultado', () => {
    expect(normalizarCpf('529.982.247-25')).toBe(normalizarCpf('52998224725'))
    expect(normalizarCpf('111.444.777-35')).toBe(normalizarCpf('11144477735'))
  })

  it.each([
    ['número', 52998224725],
    ['booleano', true],
    ['null', null],
    ['undefined', undefined],
    ['objeto', { cpf: '52998224725' }],
    ['array', ['5', '2', '9']],
  ])('entrada não-string (%s) nunca lança — retorna string vazia', (_rotulo, valor) => {
    expect(() => normalizarCpf(valor as never)).not.toThrow()
    expect(normalizarCpf(valor as never)).toBe('')
  })
})

describe('validarCpf', () => {
  it.each([
    ['529.982.247-25 (mascarado)', '52998224725'],
    ['111.444.777-35 (mascarado)', '11144477735'],
  ])('aceita CPF válido conhecido: %s', (_rotulo, digitos) => {
    expect(validarCpf(digitos)).toBe(true)
  })

  it('rejeita CPF válido em estrutura mas com dígito verificador incorreto', () => {
    // Último dígito do CPF válido 529.982.247-25 alterado de 5 para 6.
    expect(validarCpf('52998224726')).toBe(false)
  })

  it('rejeita o primeiro dígito verificador incorreto mantendo o segundo original', () => {
    expect(validarCpf('52998224735')).toBe(false)
  })

  it.each([
    ['10 dígitos (curto demais)', '5299822472'],
    ['12 dígitos (longo demais)', '529982247255'],
    ['vazio', ''],
  ])('rejeita comprimento errado: %s', (_rotulo, digitos) => {
    expect(validarCpf(digitos)).toBe(false)
  })

  it.each(Array.from({ length: 10 }, (_, digito) => String(digito).repeat(11)))(
    'rejeita sequência de dígito repetido: %s',
    (sequenciaRepetida) => {
      expect(validarCpf(sequenciaRepetida)).toBe(false)
    },
  )

  it('rejeita entrada com caracteres não numéricos residuais (não normalizada)', () => {
    expect(validarCpf('529.982.247-25')).toBe(false)
  })

  it('CPF mascarado e sem máscara, uma vez normalizados, validam igualmente', () => {
    expect(validarCpf(normalizarCpf('529.982.247-25'))).toBe(true)
    expect(validarCpf(normalizarCpf('52998224725'))).toBe(true)
  })

  it.each([
    ['número', 52998224725],
    ['null', null],
    ['undefined', undefined],
    ['objeto', { cpf: '52998224725' }],
  ])('entrada não-string via normalizarCpf nunca lança e resulta em CPF inválido: %s', (_rotulo, valor) => {
    expect(() => validarCpf(normalizarCpf(valor as never))).not.toThrow()
    expect(validarCpf(normalizarCpf(valor as never))).toBe(false)
  })
})
