import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adiciona `ciclos_avaliacao.tipos_relacionamento_gerados` (text[], NOT
 * NULL, default os 4 tipos atuais) — restringe quais tipos de relação o
 * motor de ciclos (`gerarRelacionamentos`) gera na ativação. NÃO edita
 * `1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
 * (task já fechada).
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class TiposRelacionamentoGeradosPorCiclo1788650000000 implements MigrationInterface {
  name = 'TiposRelacionamentoGeradosPorCiclo1788650000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD COLUMN tipos_relacionamento_gerados text[] NOT NULL
          DEFAULT '{autoavaliacao,gestor,pares,subordinado}'
    `)

    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD CONSTRAINT chk_ciclos_tipos_relacionamento_validos
          CHECK (tipos_relacionamento_gerados <@ ARRAY['autoavaliacao','gestor','pares','subordinado']::text[])
    `)

    // cardinality() (não array_length()) porque array_length(arr,1) retorna
    // NULL (não 0) para array vazio '{}', e uma CHECK que avalia NULL é
    // tratada como satisfeita pelo Postgres — cardinality() retorna 0
    // corretamente.
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio
          CHECK (cardinality(tipos_relacionamento_gerados) > 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio
    `)
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_validos
    `)
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP COLUMN tipos_relacionamento_gerados
    `)
  }
}
