import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CriarEquipesEColaboradores1788268503083 implements MigrationInterface {
  name = 'CriarEquipesEColaboradores1788268503083'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)

    await queryRunner.query(
      `CREATE TYPE papel_colaborador AS ENUM ('admin', 'gestor_rh', 'colaborador')`,
    )

    await queryRunner.query(`
      CREATE TABLE equipes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome varchar(255) NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE TABLE colaboradores (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome_completo varchar(255) NOT NULL,
        email varchar(255) NOT NULL,
        cpf char(11) NOT NULL,
        papel papel_colaborador NOT NULL DEFAULT 'colaborador',
        cargo varchar(255),
        equipe_id uuid REFERENCES equipes(id) ON DELETE SET NULL,
        gestor_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
        ativo boolean NOT NULL DEFAULT true,
        usuario_auth_id uuid,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_colaboradores_cpf UNIQUE (cpf),
        CONSTRAINT uq_colaboradores_email UNIQUE (email),
        CONSTRAINT uq_colaboradores_usuario_auth_id UNIQUE (usuario_auth_id),
        CONSTRAINT chk_colaboradores_cpf_formato CHECK (cpf ~ '^[0-9]{11}$'),
        CONSTRAINT chk_colaboradores_papel_auth CHECK (
          (papel = 'colaborador' AND usuario_auth_id IS NULL)
          OR (papel <> 'colaborador')
        )
      )
    `)

    await queryRunner.query(
      `CREATE INDEX idx_colaboradores_equipe_id ON colaboradores (equipe_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_colaboradores_gestor_id ON colaboradores (gestor_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_colaboradores_usuario_auth_id ON colaboradores (usuario_auth_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE colaboradores`)
    await queryRunner.query(`DROP TABLE equipes`)
    await queryRunner.query(`DROP TYPE papel_colaborador`)
  }
}
