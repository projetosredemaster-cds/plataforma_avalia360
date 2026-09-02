import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Motor de ciclos de avaliação 360 — cria `ciclos_avaliacao`,
 * `ciclo_participantes` (tabela nova, sem equivalente no schema doc — ver
 * "Decisão de modelagem" em .claude/tasks/ciclos-avaliacao/task-backend.md)
 * e `relacionamentos_avaliacao` (quem avalia quem, base da anonimização
 * futura — skill backend-anonimizacao-respostas). Também resolve o tech
 * debt de `pesquisas.ciclo_id` (FK real + índice ausente).
 *
 * Nenhuma tabela aqui guarda resposta, respondente ou valor de avaliação —
 * `envios_pesquisa`/`respostas`/`itens_resposta` são de uma task futura.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores.
 */
export class CriarCiclosAvaliacaoRelacionamentosEParticipantes1788300000000
  implements MigrationInterface
{
  name = 'CriarCiclosAvaliacaoRelacionamentosEParticipantes1788300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE status_ciclo AS ENUM ('rascunho', 'ativo', 'encerrado')`)
    await queryRunner.query(
      `CREATE TYPE tipo_relacionamento AS ENUM ('autoavaliacao', 'gestor', 'pares', 'subordinado', 'externo')`,
    )

    await queryRunner.query(`
      CREATE TABLE ciclos_avaliacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome text NOT NULL,
        descricao text,
        data_inicio date NOT NULL,
        data_fim date NOT NULL,
        status status_ciclo NOT NULL DEFAULT 'rascunho',
        anonimizar_respostas_pares boolean NOT NULL DEFAULT true,
        minimo_respostas_pares smallint NOT NULL DEFAULT 3,
        criado_por uuid REFERENCES colaboradores(id),
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_datas_ciclo CHECK (data_fim >= data_inicio)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE ciclo_participantes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
        colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ciclo_participantes_ciclo_colaborador UNIQUE (ciclo_id, colaborador_id)
      )
    `)

    await queryRunner.query(
      `CREATE INDEX idx_ciclo_participantes_ciclo_id ON ciclo_participantes (ciclo_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_ciclo_participantes_colaborador_id ON ciclo_participantes (colaborador_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE relacionamentos_avaliacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
        avaliador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
        avaliado_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
        tipo_relacionamento tipo_relacionamento NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)
      )
    `)

    await queryRunner.query(
      `CREATE INDEX idx_relacionamentos_ciclo ON relacionamentos_avaliacao (ciclo_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_relacionamentos_avaliado ON relacionamentos_avaliacao (avaliado_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_relacionamentos_avaliador ON relacionamentos_avaliacao (avaliador_id)`,
    )

    // Tech debt: FK real de pesquisas.ciclo_id (antes era uuid solto, sem
    // REFERENCES, porque ciclos_avaliacao não existia ainda).
    await queryRunner.query(`
      ALTER TABLE pesquisas
        ADD CONSTRAINT fk_pesquisas_ciclo FOREIGN KEY (ciclo_id)
        REFERENCES ciclos_avaliacao(id) ON DELETE SET NULL
    `)

    // Tech debt: índice que o schema doc previa e a migration original de
    // pesquisas não criou.
    await queryRunner.query(`CREATE INDEX idx_pesquisas_ciclo ON pesquisas (ciclo_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_pesquisas_ciclo`)
    await queryRunner.query(`ALTER TABLE pesquisas DROP CONSTRAINT fk_pesquisas_ciclo`)
    await queryRunner.query(`DROP TABLE relacionamentos_avaliacao`)
    await queryRunner.query(`DROP TABLE ciclo_participantes`)
    await queryRunner.query(`DROP TABLE ciclos_avaliacao`)
    await queryRunner.query(`DROP TYPE tipo_relacionamento`)
    await queryRunner.query(`DROP TYPE status_ciclo`)
  }
}
