import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Motor de envios de pesquisa (link manual, sem automação de e-mail/
 * WhatsApp) — cria `envios_pesquisa`, gerada automaticamente (1 linha por
 * `relacionamentos_avaliacao`) na ativação do ciclo
 * (`ciclos-avaliacao.service.ts`, `atualizarStatus`). Nenhuma coluna de
 * resposta/valor aqui — `respostas`/`itens_resposta` são de uma task futura.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores.
 */
export class CriarEnviosPesquisa1788350000000 implements MigrationInterface {
  name = 'CriarEnviosPesquisa1788350000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE status_envio AS ENUM ('pendente', 'enviado', 'em_andamento', 'concluido', 'expirado')`,
    )

    await queryRunner.query(`
      CREATE TABLE envios_pesquisa (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
        relacionamento_id uuid NOT NULL REFERENCES relacionamentos_avaliacao(id) ON DELETE CASCADE,
        status status_envio NOT NULL DEFAULT 'pendente',
        token_acesso uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        enviado_em timestamptz,
        concluido_em timestamptz,
        quantidade_lembretes smallint NOT NULL DEFAULT 0,
        cpf_confirmado_em timestamptz,
        tentativas_cpf_invalidas smallint NOT NULL DEFAULT 0,
        criado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (pesquisa_id, relacionamento_id)
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_envios_pesquisa ON envios_pesquisa (pesquisa_id)`)
    await queryRunner.query(
      `CREATE INDEX idx_envios_relacionamento ON envios_pesquisa (relacionamento_id)`,
    )
    await queryRunner.query(`CREATE INDEX idx_envios_status ON envios_pesquisa (status)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_envios_status`)
    await queryRunner.query(`DROP INDEX idx_envios_relacionamento`)
    await queryRunner.query(`DROP INDEX idx_envios_pesquisa`)
    await queryRunner.query(`DROP TABLE envios_pesquisa`)
    await queryRunner.query(`DROP TYPE status_envio`)
  }
}
