import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'
import {
  CPF_VALIDO_1,
  atorDe,
  configurarGetUserPorToken,
  configurarSupabaseAdminPadrao,
  construirRepositoriosFalsos,
  criarColaboradorFixture,
} from './test/fixtures'

// Silencia console.error esperado (tratadorErros loga qualquer 500 antes de
// responder — não deve poluir a saída do teste nem esconder falhas reais de
// asserção, que continuam vindo do corpo/status da resposta HTTP).
vi.spyOn(console, 'error').mockImplementation(() => undefined)

describe('controle de acesso por papel — todas as rotas de /api/equipes e /api/colaboradores', () => {
  let repos: ReturnType<typeof construirRepositoriosFalsos>

  // CPFs distintos e explícitos em cada ator seedado — `criarColaboradorFixture`
  // usa CPF_VALIDO_1 como default, que é o mesmo CPF usado nos payloads de
  // "POST /api/colaboradores" dos testes de sucesso abaixo; sem overrides
  // aqui, os atores colidiriam com o CPF do novo colaborador sendo criado e
  // o teste falharia com 409 CPF_DUPLICADO por engano, não pela asserção real.
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-admin-id', cpf: '12345678909' })
  const gestorRh = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-gestor-id', cpf: '98765432100' })
  // Guard rail: no fluxo real um `colaborador` NUNCA tem usuario_auth_id (ver
  // regra dura papel<->auth), então na prática ele nunca teria uma sessão
  // válida por esta rota. Este registro existe só para provar, em runtime e
  // via HTTP real, que MESMO SE uma sessão autenticada de papel `colaborador`
  // existisse (bug futuro/estado inconsistente), `garantirPapel` ainda
  // bloqueia com 403 — não é a ausência de sessão que protege a rota, é a
  // checagem de papel.
  const colaboradorGuardRail = criarColaboradorFixture({
    papel: 'colaborador',
    usuarioAuthId: 'auth-colaborador-guardrail-id',
    cpf: '19283746500',
  })

  // IDs fixos (gerados uma vez, fora do beforeEach) porque a lista de rotas
  // usada em `it.each` é montada durante a fase de coleta de testes, antes
  // de qualquer `beforeEach` rodar — depender de um objeto recriado em
  // beforeEach para montar os caminhos causaria "Cannot read properties of
  // undefined" na coleta.
  const EQUIPE_ALVO_ID = randomUUID()
  const COLABORADOR_ALVO_ID = randomUUID()

  let equipeAlvo: { id: string; nome: string; criadoEm: Date; atualizadoEm: Date }
  let colaboradorAlvo: ReturnType<typeof criarColaboradorFixture>

  beforeEach(() => {
    repos = construirRepositoriosFalsos()
    configurarSupabaseAdminPadrao()
    configurarGetUserPorToken({
      'token-admin': 'auth-admin-id',
      'token-gestor_rh': 'auth-gestor-id',
      'token-colaborador': 'auth-colaborador-guardrail-id',
    })

    equipeAlvo = { id: EQUIPE_ALVO_ID, nome: 'Equipe Alvo', criadoEm: new Date(), atualizadoEm: new Date() }
    colaboradorAlvo = criarColaboradorFixture({
      id: COLABORADOR_ALVO_ID,
      nomeCompleto: 'Colaborador Alvo',
      cpf: '11144477735',
    })

    repos.equipesRepo.semear([equipeAlvo])
    repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail, colaboradorAlvo])
  })

  function rotas() {
    return [
      { metodo: 'post' as const, caminho: '/api/equipes', corpo: { nome: 'Nova Equipe' } },
      { metodo: 'get' as const, caminho: '/api/equipes' },
      { metodo: 'get' as const, caminho: `/api/equipes/${EQUIPE_ALVO_ID}` },
      { metodo: 'put' as const, caminho: `/api/equipes/${EQUIPE_ALVO_ID}`, corpo: { nome: 'Equipe Renomeada' } },
      { metodo: 'delete' as const, caminho: `/api/equipes/${EQUIPE_ALVO_ID}` },
      {
        metodo: 'post' as const,
        caminho: '/api/colaboradores',
        corpo: {
          nomeCompleto: 'Fulano da Silva',
          email: `fulano-${randomUUID()}@exemplo.com`,
          cpf: CPF_VALIDO_1,
          papel: 'colaborador',
        },
      },
      { metodo: 'get' as const, caminho: '/api/colaboradores' },
      { metodo: 'get' as const, caminho: `/api/colaboradores/${COLABORADOR_ALVO_ID}` },
      {
        metodo: 'put' as const,
        caminho: `/api/colaboradores/${COLABORADOR_ALVO_ID}`,
        corpo: { nomeCompleto: 'Nome Editado' },
      },
      {
        metodo: 'patch' as const,
        caminho: `/api/colaboradores/${COLABORADOR_ALVO_ID}/status`,
        corpo: { ativo: false },
      },
    ]
  }

  describe('sem token de autenticação', () => {
    it.each(rotas().map((r) => [r.metodo, r.caminho] as const))(
      '%s %s → 401 TOKEN_AUSENTE',
      async (metodo, caminho) => {
        const resposta = await request(app)[metodo](caminho)
        expect(resposta.status).toBe(401)
        expect(resposta.body.erro.codigo).toBe('TOKEN_AUSENTE')
      },
    )
  })

  describe('token válido de papel colaborador (guard rail)', () => {
    it.each(rotas().map((r) => [r.metodo, r.caminho, r.corpo] as const))(
      '%s %s → 403 PAPEL_NAO_AUTORIZADO',
      async (metodo, caminho, corpo) => {
        const resposta = await request(app)[metodo](caminho).set('Authorization', 'Bearer token-colaborador').send(corpo)
        expect(resposta.status).toBe(403)
        expect(resposta.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO')
      },
    )
  })

  describe.each(['token-admin', 'token-gestor_rh'] as const)('token válido de papel autorizado (%s)', (token) => {
    it('POST /api/equipes → 201', async () => {
      const resposta = await request(app).post('/api/equipes').set('Authorization', `Bearer ${token}`).send({
        nome: 'Equipe Nova',
      })
      expect(resposta.status).toBe(201)
    })

    it('GET /api/equipes → 200', async () => {
      const resposta = await request(app).get('/api/equipes').set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
    })

    it('GET /api/equipes/:id → 200', async () => {
      const resposta = await request(app).get(`/api/equipes/${equipeAlvo.id}`).set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
    })

    it('PUT /api/equipes/:id → 200', async () => {
      const resposta = await request(app)
        .put(`/api/equipes/${equipeAlvo.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nome: 'Renomeada' })
      expect(resposta.status).toBe(200)
    })

    it('DELETE /api/equipes/:id → 204', async () => {
      const resposta = await request(app).delete(`/api/equipes/${equipeAlvo.id}`).set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(204)
    })

    it('POST /api/colaboradores → 201', async () => {
      const resposta = await request(app)
        .post('/api/colaboradores')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nomeCompleto: 'Sucesso Teste',
          email: `sucesso-${randomUUID()}@exemplo.com`,
          cpf: CPF_VALIDO_1,
          papel: 'colaborador',
        })
      expect(resposta.status).toBe(201)
    })

    it('GET /api/colaboradores → 200', async () => {
      const resposta = await request(app).get('/api/colaboradores').set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
    })

    it('GET /api/colaboradores/:id → 200', async () => {
      const resposta = await request(app)
        .get(`/api/colaboradores/${colaboradorAlvo.id}`)
        .set('Authorization', `Bearer ${token}`)
      expect(resposta.status).toBe(200)
    })

    it('PUT /api/colaboradores/:id → 200', async () => {
      const resposta = await request(app)
        .put(`/api/colaboradores/${colaboradorAlvo.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nomeCompleto: 'Editado' })
      expect(resposta.status).toBe(200)
    })

    it('PATCH /api/colaboradores/:id/status → 200', async () => {
      const resposta = await request(app)
        .patch(`/api/colaboradores/${colaboradorAlvo.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ativo: false })
      expect(resposta.status).toBe(200)
    })
  })

  describe('token inválido/expirado', () => {
    it('token que o Supabase Auth não reconhece → 401 TOKEN_INVALIDO', async () => {
      const resposta = await request(app).get('/api/equipes').set('Authorization', 'Bearer token-inexistente')
      expect(resposta.status).toBe(401)
      expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO')
    })
  })

  describe('colaborador inativo (mesmo admin/gestor_rh) perde acesso', () => {
    it('admin com ativo=false → 403 COLABORADOR_NAO_VINCULADO', async () => {
      const adminInativo = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-admin-inativo', ativo: false })
      repos.colaboradoresRepo.semear([admin, gestorRh, colaboradorGuardRail, colaboradorAlvo, adminInativo])
      configurarGetUserPorToken({ 'token-admin-inativo': 'auth-admin-inativo' })

      const resposta = await request(app).get('/api/equipes').set('Authorization', 'Bearer token-admin-inativo')
      expect(resposta.status).toBe(403)
      expect(resposta.body.erro.codigo).toBe('COLABORADOR_NAO_VINCULADO')
    })
  })
})

describe('GET /api/auth/me', () => {
  let repos: ReturnType<typeof construirRepositoriosFalsos>
  const admin = criarColaboradorFixture({ papel: 'admin', usuarioAuthId: 'auth-admin-id', cargo: 'Diretora' })
  const outroUsuario = criarColaboradorFixture({ papel: 'gestor_rh', usuarioAuthId: 'auth-outro-id' })

  beforeEach(() => {
    repos = construirRepositoriosFalsos()
    repos.colaboradoresRepo.semear([admin, outroUsuario])
    configurarGetUserPorToken({ 'token-admin': 'auth-admin-id', 'token-outro': 'auth-outro-id' })
  })

  it('retorna somente o registro do próprio chamador', async () => {
    const resposta = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-admin')

    expect(resposta.status).toBe(200)
    expect(resposta.body.id).toBe(admin.id)
    expect(resposta.body.id).not.toBe(outroUsuario.id)
    expect(resposta.body.papel).toBe('admin')
  })

  it('não expõe cpf', () => {
    return request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token-admin')
      .then((resposta) => {
        expect(resposta.body.cpf).toBeUndefined()
        expect(resposta.body.equipe).toBeUndefined()
        expect(resposta.body.gestor).toBeUndefined()
      })
  })

  it('não aceita id de terceiro — rota não tem parâmetro :id, sempre resolve pelo token', async () => {
    // Não existe rota /api/auth/me/:id — tentar "passar" um id de terceiro
    // não tem efeito algum: o controller nunca lê req.params/req.query.
    const respostaComQuery = await request(app)
      .get(`/api/auth/me?id=${outroUsuario.id}`)
      .set('Authorization', 'Bearer token-admin')

    expect(respostaComQuery.body.id).toBe(admin.id)

    const respostaComPath = await request(app)
      .get(`/api/auth/me/${outroUsuario.id}`)
      .set('Authorization', 'Bearer token-admin')
    expect(respostaComPath.status).toBe(404) // rota inexistente — Express não casa com /api/auth/me/:algo
  })

  it('sem token → 401', async () => {
    const resposta = await request(app).get('/api/auth/me')
    expect(resposta.status).toBe(401)
  })
})
