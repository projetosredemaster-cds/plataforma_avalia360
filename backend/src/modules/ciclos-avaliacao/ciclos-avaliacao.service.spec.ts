import { describe, expect, it } from 'vitest'
import { atorDe, criarColaboradorFixture } from '../../test/fixtures'
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
