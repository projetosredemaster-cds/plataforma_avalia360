import { beforeEach, describe, expect, it } from 'vitest'
import { atorDe, criarColaboradorFixture } from '../../test/fixtures'
import { construirRepositoriosAnaliseFalsos, criarCicloAvaliacaoFixture } from '../../test/analiseFixtures'
import type { CriarCicloDto } from './dto/criar-ciclo.dto'
import type { AtualizarCicloDto } from './dto/atualizar-ciclo.dto'
import * as ciclosAvaliacaoService from './ciclos-avaliacao.service'

// Arquivo criado para cobrir a correção do achado não crítico registrado em
// .claude/tasks/analise-visao-geral/task-backend.md ("## Testes"): `validarData`
// aceitava datas de calendário inexistentes (ex.: "2026-02-30") por causa do
// rollover silencioso do construtor `Date` do JavaScript. `criar()` lança o
// erro de validação (CAMPO_INVALIDO) antes de qualquer acesso a repositório,
// então nenhum fake de repositório é necessário aqui.
describe('ciclos-avaliacao.service — validarData (rollover de calendário)', () => {
  const admin = atorDe(criarColaboradorFixture({ papel: 'admin' }))

  it('dataInicio com data de calendário inexistente ("2026-02-30") → 422 CAMPO_INVALIDO', async () => {
    await expect(
      ciclosAvaliacaoService.criar(admin, {
        nome: 'Ciclo Teste',
        dataInicio: '2026-02-30',
        dataFim: '2026-03-01',
      }),
    ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
  })
})

// Cobertura do achado não crítico do backend-codereviewer: `validarMinimoRespostasPares`
// (guard rail direto da regra de anonimização — protege o limiar mínimo de
// respondentes antes de liberar agregado de pares/subordinado) não tinha teste
// dedicado nos limites, e o hardcode de `anonimizarRespostasPares = true` em
// criar()/atualizar() não tinha teste de regressão simulando um payload
// malicioso fora da UI (`as unknown as ...Dto` para burlar o tipo do DTO em
// tempo de compilação, exatamente como um cliente HTTP direto poderia enviar
// um campo extra no corpo JSON).
describe('ciclos-avaliacao.service — validarMinimoRespostasPares / guard rail de anonimização', () => {
  const admin = atorDe(criarColaboradorFixture({ papel: 'admin' }))
  let repos: ReturnType<typeof construirRepositoriosAnaliseFalsos>

  beforeEach(() => {
    repos = construirRepositoriosAnaliseFalsos()
  })

  function dtoBase(extra: Record<string, unknown> = {}): CriarCicloDto {
    return {
      nome: 'Ciclo Teste',
      dataInicio: '2026-01-01',
      dataFim: '2026-03-31',
      ...extra,
    } as CriarCicloDto
  }

  describe('valores ACEITOS (inteiro ímpar > 1) via criar()', () => {
    it.each([3, 5, 7, 9])('minimoRespostasPares = %i é aceito e persistido', async (valor) => {
      const resposta = await ciclosAvaliacaoService.criar(admin, dtoBase({ minimoRespostasPares: valor }))
      expect(resposta.minimoRespostasPares).toBe(valor)
    })
  })

  describe('valores REJEITADOS via criar() → 422 CAMPO_INVALIDO', () => {
    it.each([1, 2, 4, 0, -1, 2.5, 'abc', NaN])(
      'minimoRespostasPares = %p é rejeitado',
      async (valor) => {
        await expect(
          ciclosAvaliacaoService.criar(admin, dtoBase({ minimoRespostasPares: valor })),
        ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })
      },
    )
  })

  describe('valores ACEITOS/REJEITADOS via atualizar()', () => {
    it('minimoRespostasPares = 5 é aceito e persistido em um ciclo em rascunho', async () => {
      const cicloExistente = criarCicloAvaliacaoFixture({ status: 'rascunho', minimoRespostasPares: 3 })
      repos.ciclosRepo.semear([cicloExistente])

      const resposta = await ciclosAvaliacaoService.atualizar(admin, cicloExistente.id, {
        minimoRespostasPares: 5,
      })

      expect(resposta.minimoRespostasPares).toBe(5)
    })

    it.each([1, 2, 4, 0, -1, 2.5, 'abc', NaN])(
      'minimoRespostasPares = %p é rejeitado e não altera o ciclo existente',
      async (valor) => {
        const cicloExistente = criarCicloAvaliacaoFixture({ status: 'rascunho', minimoRespostasPares: 3 })
        repos.ciclosRepo.semear([cicloExistente])

        await expect(
          ciclosAvaliacaoService.atualizar(admin, cicloExistente.id, {
            minimoRespostasPares: valor,
          } as unknown as AtualizarCicloDto),
        ).rejects.toMatchObject({ status: 422, codigo: 'CAMPO_INVALIDO' })

        // Nenhuma alteração parcial deve ter sido persistida.
        const persistido = repos.ciclosRepo.todas().find((c) => c.id === cicloExistente.id)
        expect(persistido?.minimoRespostasPares).toBe(3)
      },
    )
  })

  describe('anonimizarRespostasPares — guard rail: nunca pode ser desligado por payload', () => {
    it('criar(): payload malicioso com anonimizarRespostasPares: false ainda persiste true', async () => {
      const dtoMalicioso = {
        nome: 'Ciclo Teste',
        dataInicio: '2026-01-01',
        dataFim: '2026-03-31',
        anonimizarRespostasPares: false,
      } as unknown as CriarCicloDto

      const resposta = await ciclosAvaliacaoService.criar(admin, dtoMalicioso)

      expect(resposta.anonimizarRespostasPares).toBe(true)

      const persistido = repos.ciclosRepo.todas().find((c) => c.id === resposta.id)
      expect(persistido?.anonimizarRespostasPares).toBe(true)
    })

    it('atualizar(): payload malicioso com anonimizarRespostasPares: false não altera o valor gravado', async () => {
      const cicloExistente = criarCicloAvaliacaoFixture({
        status: 'rascunho',
        anonimizarRespostasPares: true,
      })
      repos.ciclosRepo.semear([cicloExistente])

      const dtoMalicioso = {
        anonimizarRespostasPares: false,
      } as unknown as AtualizarCicloDto

      const resposta = await ciclosAvaliacaoService.atualizar(admin, cicloExistente.id, dtoMalicioso)

      expect(resposta.anonimizarRespostasPares).toBe(true)

      const persistido = repos.ciclosRepo.todas().find((c) => c.id === cicloExistente.id)
      expect(persistido?.anonimizarRespostasPares).toBe(true)
    })
  })
})
