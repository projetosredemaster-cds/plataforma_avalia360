import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { ErroHttp } from '../../common/erro-http'
import {
  CPF_VALIDO_1,
  CPF_VALIDO_1_MASCARADO,
  CPF_VALIDO_2,
  atorDe,
  configurarSupabaseAdminPadrao,
  construirRepositoriosFalsos,
  criarColaboradorFixture,
} from '../../test/fixtures'
import * as colaboradoresService from './colaboradores.service'
import type { CriarColaboradorDto } from './dto/criar-colaborador.dto'

describe('colaboradores.service', () => {
  let repos: ReturnType<typeof construirRepositoriosFalsos>
  // CPF distinto do usado por padrão em dtoBase() (CPF_VALIDO_1) para não
  // colidir com o próprio ator seedado em todo teste — colisão faria os
  // testes de "criar" falharem com 409 CPF_DUPLICADO por engano.
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: randomUUID(), cpf: CPF_VALIDO_2 })

  beforeEach(() => {
    repos = construirRepositoriosFalsos()
    repos.colaboradoresRepo.semear([admin])
    configurarSupabaseAdminPadrao()
    // Silencia console.error esperado (logs de erro previstos pelo próprio
    // código de produção, ex.: [LIMPEZA_AUTH_PENDENTE]) sem esconder falhas
    // reais de asserção. Reaplicado a cada teste porque `restoreMocks: true`
    // (vitest.config.ts) desfaz spies entre testes.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  function dtoBase(overrides: Partial<CriarColaboradorDto> = {}): CriarColaboradorDto {
    return {
      nomeCompleto: 'Novo Colaborador',
      email: `novo-${randomUUID()}@exemplo.com`,
      cpf: CPF_VALIDO_1_MASCARADO,
      papel: 'colaborador',
      ...overrides,
    }
  }

  describe('PRIORIDADE MÁXIMA — colaborador comum nunca tem conta Auth criada', () => {
    it('POST papel=colaborador: createUser e resetPasswordForEmail NUNCA são chamados; usuarioAuthId fica null', async () => {
      const resposta = await colaboradoresService.criar(atorDe(admin), dtoBase({ papel: 'colaborador' }))

      expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.resetPasswordForEmail).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled()
      expect(resposta.usuarioAuthId).toBeNull()
      expect(resposta.emailDefinicaoSenhaEnviado).toBeNull()
    })

    it.each(['admin', 'gestor_rh'] as const)(
      'POST papel=%s: createUser é chamado 1x, usuarioAuthId é vinculado, resetPasswordForEmail é disparado',
      async (papel) => {
        const authId = randomUUID()
        vi.mocked(supabaseAdmin.auth.admin.createUser).mockResolvedValueOnce({
          data: { user: { id: authId } },
          error: null,
        } as never)

        const resposta = await colaboradoresService.criar(atorDe(admin), dtoBase({ papel }))

        expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledTimes(1)
        expect(supabaseAdmin.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
        expect(resposta.usuarioAuthId).toBe(authId)
        expect(resposta.emailDefinicaoSenhaEnviado).toBe(true)
      },
    )

    it('PUT promoção (colaborador -> gestor_rh): cria conta e vincula usuarioAuthId', async () => {
      const alvo = criarColaboradorFixture({ papel: 'colaborador', usuarioAuthId: null })
      repos.colaboradoresRepo.semear([admin, alvo])
      const authId = randomUUID()
      vi.mocked(supabaseAdmin.auth.admin.createUser).mockResolvedValueOnce({
        data: { user: { id: authId } },
        error: null,
      } as never)

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { papel: 'gestor_rh' })

      expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledTimes(1)
      expect(supabaseAdmin.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled()
      expect(resposta.papel).toBe('gestor_rh')
      expect(resposta.usuarioAuthId).toBe(authId)
    })

    it('PUT rebaixamento (gestor_rh -> colaborador): usuarioAuthId volta a null e deleteUser é chamado', async () => {
      const authIdAntigo = randomUUID()
      const alvo = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: authIdAntigo })
      repos.colaboradoresRepo.semear([admin, alvo])

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { papel: 'colaborador' })

      expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledTimes(1)
      expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(authIdAntigo)
      expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled()
      expect(resposta.papel).toBe('colaborador')
      expect(resposta.usuarioAuthId).toBeNull()
    })

    it('PUT rebaixamento: falha do deleteUser NÃO derruba a atualização do colaborador', async () => {
      const authIdAntigo = randomUUID()
      const alvo = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: authIdAntigo })
      repos.colaboradoresRepo.semear([admin, alvo])
      vi.mocked(supabaseAdmin.auth.admin.deleteUser).mockRejectedValueOnce(new Error('falha de rede simulada'))

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { papel: 'colaborador' })

      expect(resposta.papel).toBe('colaborador')
      expect(resposta.usuarioAuthId).toBeNull()
      const persistido = repos.colaboradoresRepo.todas().find((c) => c.id === alvo.id)
      expect(persistido?.papel).toBe('colaborador')
      expect(persistido?.usuarioAuthId).toBeNull()
    })

    it('PUT troca lateral (admin <-> gestor_rh): nenhuma chamada à Auth API', async () => {
      const authId = randomUUID()
      const alvo = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: authId })
      repos.colaboradoresRepo.semear([admin, alvo])

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { papel: 'gestor_rh' })

      expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.resetPasswordForEmail).not.toHaveBeenCalled()
      expect(resposta.papel).toBe('gestor_rh')
      expect(resposta.usuarioAuthId).toBe(authId)
    })

    it('PATCH /status (inativação/reativação): nenhuma chamada à Auth API', async () => {
      const authId = randomUUID()
      const alvo = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: authId, ativo: true })
      repos.colaboradoresRepo.semear([admin, alvo])

      const resposta = await colaboradoresService.atualizarStatus(atorDe(admin), alvo.id, { ativo: false })

      expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled()
      expect(supabaseAdmin.auth.resetPasswordForEmail).not.toHaveBeenCalled()
      expect(resposta.ativo).toBe(false)
      expect(resposta.usuarioAuthId).toBe(authId) // conta Auth permanece intacta, só ativo muda
    })

    it('compensação: se o INSERT falhar após criar a conta Auth, deleteUser é chamado (conta órfã removida) e 500 é propagado', async () => {
      const authId = randomUUID()
      vi.mocked(supabaseAdmin.auth.admin.createUser).mockResolvedValueOnce({
        data: { user: { id: authId } },
        error: null,
      } as never)
      vi.spyOn(repos.colaboradoresRepo, 'save').mockRejectedValueOnce(new Error('insert falhou'))

      await expect(colaboradoresService.criar(atorDe(admin), dtoBase({ papel: 'admin' }))).rejects.toMatchObject({
        status: 500,
        codigo: 'ERRO_INTERNO',
      })

      expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(authId)
    })
  })

  describe('controle de acesso (garantirPapel) — guard rail', () => {
    // Guard rail explícito: mesmo que no fluxo real um colaborador nunca
    // tenha usuario_auth_id (logo nunca teria sessão via middleware
    // `autenticar`), este teste falha caso alguém no futuro remova a
    // checagem `garantirPapel` do service e torne as rotas de
    // colaboradores acessíveis a um ator de papel `colaborador` por
    // qualquer caminho (ex.: chamado direto do service, um novo endpoint,
    // etc.) — protege a estrutura organizacional inteira de vazar para quem
    // não pode vê-la.
    const atorColaborador = atorDe(criarColaboradorFixture({ papel: 'colaborador' }))

    it('criar: papel colaborador é bloqueado com 403', async () => {
      await expect(colaboradoresService.criar(atorColaborador, dtoBase())).rejects.toMatchObject({
        status: 403,
        codigo: 'PAPEL_NAO_AUTORIZADO',
      })
    })

    it('listar: papel colaborador é bloqueado com 403', async () => {
      await expect(colaboradoresService.listar(atorColaborador)).rejects.toMatchObject({
        status: 403,
        codigo: 'PAPEL_NAO_AUTORIZADO',
      })
    })

    it('buscarPorId: papel colaborador é bloqueado com 403', async () => {
      await expect(colaboradoresService.buscarPorId(atorColaborador, admin.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('atualizar: papel colaborador é bloqueado com 403', async () => {
      await expect(colaboradoresService.atualizar(atorColaborador, admin.id, {})).rejects.toMatchObject({
        status: 403,
      })
    })

    it('atualizarStatus: papel colaborador é bloqueado com 403', async () => {
      await expect(
        colaboradoresService.atualizarStatus(atorColaborador, admin.id, { ativo: false }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('admin e gestor_rh têm acesso a listar()', async () => {
      const atorGestor = atorDe(criarColaboradorFixture({ papel: 'gestor_rh' }))
      await expect(colaboradoresService.listar(atorDe(admin))).resolves.toBeInstanceOf(Array)
      await expect(colaboradoresService.listar(atorGestor)).resolves.toBeInstanceOf(Array)
    })
  })

  describe('CPF: normalização, validação e unicidade', () => {
    it('rejeita CPF inválido com 422 CPF_INVALIDO', async () => {
      await expect(
        colaboradoresService.criar(atorDe(admin), dtoBase({ cpf: '11111111111' })),
      ).rejects.toMatchObject({ status: 422, codigo: 'CPF_INVALIDO' })
    })

    it('entrada de CPF não-string (regressão da revisão) nunca vira 500 — sempre 422 CPF_INVALIDO', async () => {
      await expect(
        colaboradoresService.criar(atorDe(admin), dtoBase({ cpf: 12345678901 as unknown as string })),
      ).rejects.toMatchObject({ status: 422, codigo: 'CPF_INVALIDO' })
    })

    it('CPF duplicado (mesmo valor normalizado) é rejeitado com 409 CPF_DUPLICADO — máscara não dribla unicidade', async () => {
      const existente = criarColaboradorFixture({ cpf: CPF_VALIDO_1 })
      repos.colaboradoresRepo.semear([admin, existente])

      await expect(
        colaboradoresService.criar(atorDe(admin), dtoBase({ cpf: CPF_VALIDO_1_MASCARADO, papel: 'colaborador' })),
      ).rejects.toMatchObject({ status: 409, codigo: 'CPF_DUPLICADO' })
    })

    it('e-mail duplicado é rejeitado com 409 EMAIL_DUPLICADO', async () => {
      const existente = criarColaboradorFixture({ email: 'duplicado@exemplo.com', cpf: CPF_VALIDO_2 })
      repos.colaboradoresRepo.semear([admin, existente])

      await expect(
        colaboradoresService.criar(
          atorDe(admin),
          dtoBase({ email: 'duplicado@exemplo.com', cpf: CPF_VALIDO_1_MASCARADO }),
        ),
      ).rejects.toMatchObject({ status: 409, codigo: 'EMAIL_DUPLICADO' })
    })

    it('CPF é persistido só com dígitos, mesmo enviado mascarado', async () => {
      const resposta = await colaboradoresService.criar(
        atorDe(admin),
        dtoBase({ cpf: CPF_VALIDO_1_MASCARADO, papel: 'colaborador' }),
      )
      expect(resposta.cpf).toBe(CPF_VALIDO_1)
    })
  })

  describe('regressão pós-revisão: equipeId/gestorId null vs. omitido em PUT', () => {
    it('PUT com equipeId: null limpa o vínculo (não retorna 404)', async () => {
      const equipe = { id: randomUUID(), nome: 'Equipe A', criadoEm: new Date(), atualizadoEm: new Date() }
      repos.equipesRepo.semear([equipe])
      const alvo = criarColaboradorFixture({ equipeId: equipe.id })
      repos.colaboradoresRepo.semear([admin, alvo])

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { equipeId: null })

      expect(resposta.equipe).toBeNull()
    })

    it('PUT com gestorId: null limpa o vínculo (não retorna 404)', async () => {
      const gestor = criarColaboradorFixture({ papel: 'gestor_rh' })
      const alvo = criarColaboradorFixture({ gestorId: gestor.id })
      repos.colaboradoresRepo.semear([admin, gestor, alvo])

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { gestorId: null })

      expect(resposta.gestor).toBeNull()
    })

    it('PUT com campo omitido não altera o vínculo existente', async () => {
      const equipe = { id: randomUUID(), nome: 'Equipe B', criadoEm: new Date(), atualizadoEm: new Date() }
      repos.equipesRepo.semear([equipe])
      const alvo = criarColaboradorFixture({ equipeId: equipe.id })
      repos.colaboradoresRepo.semear([admin, alvo])

      const resposta = await colaboradoresService.atualizar(atorDe(admin), alvo.id, { nomeCompleto: 'Novo Nome' })

      expect(resposta.equipe).toEqual({ id: equipe.id, nome: equipe.nome })
    })

    it('PUT em id inexistente retorna 404 COLABORADOR_NAO_ENCONTRADO', async () => {
      await expect(
        colaboradoresService.atualizar(atorDe(admin), randomUUID(), { nomeCompleto: 'X' }),
      ).rejects.toMatchObject({ status: 404, codigo: 'COLABORADOR_NAO_ENCONTRADO' })
    })
  })

  describe('listagem — shape com equipe/gestor como objeto {id, nome}', () => {
    it('retorna equipe e gestor resolvidos por nome, nunca só o id cru', async () => {
      const equipe = { id: randomUUID(), nome: 'Equipe Comercial', criadoEm: new Date(), atualizadoEm: new Date() }
      repos.equipesRepo.semear([equipe])
      const gestor = criarColaboradorFixture({ papel: 'gestor_rh', nomeCompleto: 'Gestora Fulana' })
      const alvo = criarColaboradorFixture({ equipeId: equipe.id, gestorId: gestor.id })
      repos.colaboradoresRepo.semear([admin, gestor, alvo])

      const lista = await colaboradoresService.listar(atorDe(admin))
      const encontrado = lista.find((c) => c.id === alvo.id)

      expect(encontrado?.equipe).toEqual({ id: equipe.id, nome: 'Equipe Comercial' })
      expect(encontrado?.gestor).toEqual({ id: gestor.id, nomeCompleto: 'Gestora Fulana' })
    })
  })
})
