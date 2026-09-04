import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adiciona `colaboradores.eh_gestor` (boolean, default false) — marca quem
 * pode ser selecionado como gestor no formulário de cadastro/edição de
 * colaborador (`GET /api/colaboradores?ehGestor=true&ativo=true`). NÃO edita
 * `1788268503083-CriarEquipesEColaboradores.ts` (task já fechada).
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class AdicionarEhGestorColaboradores1788550000000 implements MigrationInterface {
  name = 'AdicionarEhGestorColaboradores1788550000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE colaboradores
        ADD COLUMN eh_gestor boolean NOT NULL DEFAULT false
    `)

    await queryRunner.query(`
      CREATE INDEX idx_colaboradores_eh_gestor
        ON colaboradores (eh_gestor)
        WHERE eh_gestor = true AND ativo = true
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_colaboradores_eh_gestor`)
    await queryRunner.query(`ALTER TABLE colaboradores DROP COLUMN eh_gestor`)
  }
}
