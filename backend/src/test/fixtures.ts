import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { AppDataSource } from '../data-source'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { Colaborador } from '../modules/colaboradores/colaborador.entity'
import { Equipe } from '../modules/equipes/equipe.entity'
import type { ColaboradorAutenticado } from '../types/express'
import { FakeRepository } from './fakeRepository'

/** CPFs válidos conhecidos (dígitos verificadores conferidos manualmente pelo algoritmo mod 11). */
export const CPF_VALIDO_1 = '52998224725'
export const CPF_VALIDO_1_MASCARADO = '529.982.247-25'
export const CPF_VALIDO_2 = '11144477735'
export const CPF_VALIDO_2_MASCARADO = '111.444.777-35'

/**
 * Cria os dois fakes de repositório (colaboradores/equipes) e conecta
 * `AppDataSource.getRepository` (já mockado globalmente via
 * src/test/mocks-setup.ts) para devolvê-los conforme a entidade pedida —
 * espelha exatamente o roteamento que `AppDataSource.getRepository(Colaborador)`
 * / `AppDataSource.getRepository(Equipe)` fariam contra um Postgres real.
 * Chamar em beforeEach para isolar o estado entre testes.
 */
export function construirRepositoriosFalsos() {
  const equipesRepo = new FakeRepository<Equipe>()
  const colaboradoresRepo = new FakeRepository<Colaborador>((linha, relacoes) => {
    const resultado = { ...linha } as Colaborador
    if (relacoes?.equipe) {
      resultado.equipe = linha.equipeId
        ? (equipesRepo.todas().find((e) => e.id === linha.equipeId) ?? null)
        : null
    }
    if (relacoes?.gestor) {
      resultado.gestor = linha.gestorId
        ? (colaboradoresRepo.todas().find((c) => c.id === linha.gestorId) ?? null)
        : null
    }
    return resultado
  })

  vi.mocked(AppDataSource.getRepository).mockImplementation((entidade: unknown) => {
    if (entidade === Colaborador) return colaboradoresRepo as never
    if (entidade === Equipe) return equipesRepo as never
    throw new Error(`FakeRepository não configurado para a entidade: ${String(entidade)}`)
  })

  return { equipesRepo, colaboradoresRepo }
}

/** Fixture de uma linha de `colaboradores` — sobrescreva só os campos que o teste precisa. */
export function criarColaboradorFixture(parcial: Partial<Colaborador> = {}): Colaborador {
  const agora = new Date()
  return {
    id: randomUUID(),
    nomeCompleto: 'Colaborador Teste',
    email: `colaborador-${randomUUID()}@exemplo.com`,
    cpf: CPF_VALIDO_1,
    papel: 'colaborador',
    cargo: null,
    equipeId: null,
    equipe: null,
    gestorId: null,
    gestor: null,
    ativo: true,
    usuarioAuthId: null,
    criadoEm: agora,
    atualizadoEm: agora,
    ...parcial,
  } as Colaborador
}

/**
 * Deriva o `ColaboradorAutenticado` (o que o middleware `autenticar`
 * preencheria em req.colaboradorAutenticado) — só usado para atores
 * admin/gestor_rh nos testes (os únicos que passam pelo middleware real),
 * que sempre têm email não nulo; non-null assertion segura.
 */
export function atorDe(colaborador: Colaborador): ColaboradorAutenticado {
  return {
    id: colaborador.id,
    papel: colaborador.papel,
    nomeCompleto: colaborador.nomeCompleto,
    email: colaborador.email!,
  }
}

/** Configura os mocks de `supabaseAdmin.auth.admin.*` com um comportamento de sucesso "feliz" por padrão. */
export function configurarSupabaseAdminPadrao() {
  vi.mocked(supabaseAdmin.auth.admin.createUser).mockImplementation(
    async () => ({ data: { user: { id: randomUUID() } }, error: null }) as never,
  )
  vi.mocked(supabaseAdmin.auth.admin.deleteUser).mockResolvedValue({ data: {}, error: null } as never)
  vi.mocked(supabaseAdmin.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null } as never)
}

/**
 * Configura `supabaseAdmin.auth.getUser` (usado pelo middleware `autenticar`)
 * para resolver um token de teste para um `userId` do Supabase Auth — usado
 * nos testes de rota (supertest) para simular sessões de diferentes papéis.
 */
export function configurarGetUserPorToken(mapaTokenParaUserId: Record<string, string>) {
  vi.mocked(supabaseAdmin.auth.getUser).mockImplementation(async (token?: string) => {
    const userId = token ? mapaTokenParaUserId[token] : undefined
    if (!userId) {
      return { data: { user: null }, error: { message: 'token inválido' } } as never
    }
    return { data: { user: { id: userId } }, error: null } as never
  })
}
