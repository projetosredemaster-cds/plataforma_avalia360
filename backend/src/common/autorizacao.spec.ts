import { describe, expect, it } from 'vitest'
import { garantirPapel } from './autorizacao'
import { ErroHttp } from './erro-http'
import type { ColaboradorAutenticado } from '../types/express'

function ator(papel: ColaboradorAutenticado['papel']): ColaboradorAutenticado {
  return { id: 'id-1', papel, nomeCompleto: 'Fulano', email: 'fulano@exemplo.com' }
}

describe('garantirPapel', () => {
  it('não lança quando o papel do ator está na lista permitida', () => {
    expect(() => garantirPapel(ator('admin'), ['admin', 'gestor_rh'])).not.toThrow()
    expect(() => garantirPapel(ator('gestor_rh'), ['admin', 'gestor_rh'])).not.toThrow()
  })

  it('lança ErroHttp 403 PAPEL_NAO_AUTORIZADO quando o papel não está na lista', () => {
    expect(() => garantirPapel(ator('colaborador'), ['admin', 'gestor_rh'])).toThrow(ErroHttp)
    try {
      garantirPapel(ator('colaborador'), ['admin', 'gestor_rh'])
      expect.unreachable('deveria ter lançado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroHttp)
      expect((erro as ErroHttp).status).toBe(403)
      expect((erro as ErroHttp).codigo).toBe('PAPEL_NAO_AUTORIZADO')
    }
  })

  it('lista de papéis permitidos vazia bloqueia todo mundo, inclusive admin', () => {
    expect(() => garantirPapel(ator('admin'), [])).toThrow(ErroHttp)
  })
})
