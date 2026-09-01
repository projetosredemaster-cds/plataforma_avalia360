import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { atorDe, construirRepositoriosFalsos, criarColaboradorFixture } from '../../test/fixtures'
import * as equipesService from './equipes.service'

describe('equipes.service', () => {
  let repos: ReturnType<typeof construirRepositoriosFalsos>
  const admin = atorDe(criarColaboradorFixture({ papel: 'admin' }))
  const gestor = atorDe(criarColaboradorFixture({ papel: 'gestor_rh' }))
  const colaboradorComum = atorDe(criarColaboradorFixture({ papel: 'colaborador' }))

  beforeEach(() => {
    repos = construirRepositoriosFalsos()
  })

  describe('controle de acesso (garantirPapel) — guard rail', () => {
    it('criar: bloqueado para papel colaborador', async () => {
      await expect(equipesService.criar(colaboradorComum, { nome: 'Equipe X' })).rejects.toMatchObject({
        status: 403,
        codigo: 'PAPEL_NAO_AUTORIZADO',
      })
    })

    it('listar: bloqueado para papel colaborador', async () => {
      await expect(equipesService.listar(colaboradorComum)).rejects.toMatchObject({ status: 403 })
    })

    it('buscarPorId: bloqueado para papel colaborador', async () => {
      await expect(equipesService.buscarPorId(colaboradorComum, randomUUID())).rejects.toMatchObject({
        status: 403,
      })
    })

    it('atualizar: bloqueado para papel colaborador', async () => {
      await expect(
        equipesService.atualizar(colaboradorComum, randomUUID(), { nome: 'X' }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('remover: bloqueado para papel colaborador', async () => {
      await expect(equipesService.remover(colaboradorComum, randomUUID())).rejects.toMatchObject({
        status: 403,
      })
    })

    it('admin e gestor_rh conseguem criar e listar', async () => {
      const criada = await equipesService.criar(admin, { nome: 'Equipe do Admin' })
      expect(criada.nome).toBe('Equipe do Admin')

      const criada2 = await equipesService.criar(gestor, { nome: 'Equipe do Gestor RH' })
      expect(criada2.nome).toBe('Equipe do Gestor RH')

      const lista = await equipesService.listar(admin)
      expect(lista).toHaveLength(2)
    })
  })

  describe('CRUD básico', () => {
    it('buscarPorId em id inexistente retorna 404 EQUIPE_NAO_ENCONTRADA', async () => {
      await expect(equipesService.buscarPorId(admin, randomUUID())).rejects.toMatchObject({
        status: 404,
        codigo: 'EQUIPE_NAO_ENCONTRADA',
      })
    })

    it('atualizar em id inexistente retorna 404', async () => {
      await expect(equipesService.atualizar(admin, randomUUID(), { nome: 'Y' })).rejects.toMatchObject({
        status: 404,
        codigo: 'EQUIPE_NAO_ENCONTRADA',
      })
    })

    it('remover em id inexistente retorna 404', async () => {
      await expect(equipesService.remover(admin, randomUUID())).rejects.toMatchObject({
        status: 404,
        codigo: 'EQUIPE_NAO_ENCONTRADA',
      })
    })

    it('nome vazio/curto demais é rejeitado com 422 CAMPO_INVALIDO', async () => {
      await expect(equipesService.criar(admin, { nome: '' })).rejects.toMatchObject({ status: 422 })
      await expect(equipesService.criar(admin, { nome: 'A' })).rejects.toMatchObject({ status: 422 })
    })

    it('remover exclui fisicamente a linha (DELETE físico)', async () => {
      const criada = await equipesService.criar(admin, { nome: 'Equipe a remover' })
      await equipesService.remover(admin, criada.id)
      await expect(equipesService.buscarPorId(admin, criada.id)).rejects.toMatchObject({ status: 404 })
    })
  })
})
