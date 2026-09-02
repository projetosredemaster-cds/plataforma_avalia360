import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Diferenciação de tipo de pesquisa (Avaliação 360 vs Clima/Geral) — só
 * ALTER TABLE/CREATE TYPE/CREATE INDEX sobre tabelas já existentes. NÃO edita
 * nenhuma das 3 migrations anteriores (todas de tasks já fechadas):
 * `CriarPesquisasPaginasPerguntasCompetencias`,
 * `CriarCiclosAvaliacaoRelacionamentosEParticipantes`, `CriarEnviosPesquisa`.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class DiferenciarTipoPesquisaEEnviosClima1788400000000 implements MigrationInterface {
  name = 'DiferenciarTipoPesquisaEEnviosClima1788400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE tipo_pesquisa AS ENUM ('avaliacao_360', 'clima_geral')`,
    )

    await queryRunner.query(`
      ALTER TABLE pesquisas
        ADD COLUMN tipo tipo_pesquisa NOT NULL DEFAULT 'avaliacao_360'
    `)

    // relacionamento_id vira opcional — envios de pesquisas `clima_geral`
    // não têm relacionamento avaliador↔avaliado por trás.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ALTER COLUMN relacionamento_id DROP NOT NULL
    `)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE
    `)

    // Exatamente um dos dois preenchido — nunca os dois, nunca nenhum.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (colaborador_id IS NOT NULL))
    `)

    // A UNIQUE (pesquisa_id, relacionamento_id) já existente NÃO cobre o
    // caso clima (relacionamento_id é sempre NULL nessas linhas, e o
    // Postgres trata cada NULL como distinto em UNIQUE) — índice único
    // PARCIAL novo, restrito às linhas onde colaborador_id é preenchido.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_colaborador
        ON envios_pesquisa (pesquisa_id, colaborador_id)
        WHERE colaborador_id IS NOT NULL
    `)

    await queryRunner.query(
      `CREATE INDEX idx_envios_colaborador ON envios_pesquisa (colaborador_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_envios_colaborador`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_colaborador`)
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN colaborador_id`)
    // Nota: só reversível sem erro se não existir nenhuma linha com
    // relacionamento_id NULL no momento do revert (ou seja, nenhum envio de
    // clima_geral foi gerado) — mesma limitação inerente de qualquer
    // ALTER COLUMN ... SET NOT NULL sobre dado pré-existente incompatível.
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa ALTER COLUMN relacionamento_id SET NOT NULL`,
    )
    await queryRunner.query(`ALTER TABLE pesquisas DROP COLUMN tipo`)
    await queryRunner.query(`DROP TYPE tipo_pesquisa`)
  }
}
