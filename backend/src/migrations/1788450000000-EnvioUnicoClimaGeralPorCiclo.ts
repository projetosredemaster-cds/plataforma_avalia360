import type { MigrationInterface, QueryRunner } from 'typeorm'

export class EnvioUnicoClimaGeralPorCiclo1788450000000 implements MigrationInterface {
  name = 'EnvioUnicoClimaGeralPorCiclo1788450000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`DROP INDEX idx_envios_colaborador`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_colaborador`)
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN colaborador_id`)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN ciclo_id uuid REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE
    `)

    // Exatamente um dos dois preenchido — nunca os dois, nunca nenhum.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (ciclo_id IS NOT NULL))
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_ciclo
        ON envios_pesquisa (ciclo_id)
        WHERE ciclo_id IS NOT NULL
    `)

    await queryRunner.query(`CREATE INDEX idx_envios_ciclo ON envios_pesquisa (ciclo_id)`)

    await queryRunner.query(`
      ALTER TABLE ciclo_participantes
        ADD COLUMN respondeu_em timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ciclo_participantes DROP COLUMN respondeu_em`)

    await queryRunner.query(`DROP INDEX idx_envios_ciclo`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_ciclo`)
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN ciclo_id`)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE
    `)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (colaborador_id IS NOT NULL))
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_colaborador
        ON envios_pesquisa (pesquisa_id, colaborador_id)
        WHERE colaborador_id IS NOT NULL
    `)

    await queryRunner.query(
      `CREATE INDEX idx_envios_colaborador ON envios_pesquisa (colaborador_id)`,
    )
  }
}
