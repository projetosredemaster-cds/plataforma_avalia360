import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Torna `colaboradores.email` opcional — só `admin`/`gestor_rh` (papéis com
 * conta no Supabase Auth) continuam exigindo e-mail; `colaborador` comum
 * (acesso só via link do envio + CPF, sem sessão Auth) passa a poder ser
 * cadastrado sem e-mail. Regra reforçada em aplicação
 * (`colaboradores.service.ts`, `EMAIL_OBRIGATORIO_PARA_PAPEL`) e, por
 * consistência com `chk_colaboradores_papel_auth` (migration original), também
 * em banco via `CHECK`. NÃO edita `1788268503083-CriarEquipesEColaboradores.ts`
 * (task já fechada) nem `1788550000000-AdicionarEhGestorColaboradores.ts`
 * (migration separada — preocupações distintas, cada uma revertível
 * independentemente).
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class EmailColaboradorOpcional1788600000000 implements MigrationInterface {
  name = 'EmailColaboradorOpcional1788600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE colaboradores
        ALTER COLUMN email DROP NOT NULL
    `)

    await queryRunner.query(`
      ALTER TABLE colaboradores
        ADD CONSTRAINT chk_colaboradores_papel_email
        CHECK (papel = 'colaborador' OR email IS NOT NULL)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE colaboradores DROP CONSTRAINT chk_colaboradores_papel_email`,
    )
    // Nota: só reversível sem erro se não existir nenhuma linha com
    // email IS NULL no momento do revert (ou seja, nenhum colaborador sem
    // e-mail foi cadastrado ainda) — limitação inerente de qualquer
    // ALTER COLUMN ... SET NOT NULL sobre dado pré-existente incompatível,
    // mesmo padrão já documentado em
    // `1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`.
    await queryRunner.query(`
      ALTER TABLE colaboradores
        ALTER COLUMN email SET NOT NULL
    `)
  }
}
