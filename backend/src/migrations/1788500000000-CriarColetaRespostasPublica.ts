import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Coleta pública de respostas (`/responder/:token`). Cria:
 * - `sessoes_resposta`: capability token temporário emitido após confirmação
 *   de CPF, ponte ÚNICA entre identidade e intenção de responder. Nunca
 *   referenciada por `respostas`/`itens_resposta`/`respostas_clima`/
 *   `itens_resposta_clima`, nem o inverso.
 * - `respostas`/`itens_resposta` (avaliação 360, greenfield): escrita SEMPRE
 *   identificada via `envio_id -> relacionamento_id -> avaliador_id`. A
 *   anonimização de pares/subordinado é regra de LEITURA de uma task futura,
 *   nunca aplicada aqui.
 * - `respostas_clima`/`itens_resposta_clima` (clima_geral): anonimato
 *   ESTRUTURAL — nenhuma FK de identidade (sem colaborador_id, sem
 *   sessao_id, sem envio_id). Nunca adicionar uma nessas duas tabelas.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada a todas as migrations
 * anteriores (nenhuma delas rodou ainda contra um banco real).
 */
export class CriarColetaRespostasPublica1788500000000 implements MigrationInterface {
  name = 'CriarColetaRespostasPublica1788500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sessoes_resposta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        envio_id uuid NOT NULL REFERENCES envios_pesquisa(id) ON DELETE CASCADE,
        ciclo_participante_id uuid REFERENCES ciclo_participantes(id) ON DELETE CASCADE,
        tipo_pesquisa tipo_pesquisa NOT NULL,
        expira_em timestamptz NOT NULL,
        usada_em timestamptz,
        criada_em timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_sessoes_resposta_envio ON sessoes_resposta (envio_id)`)

    await queryRunner.query(`
      CREATE TABLE respostas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        envio_id uuid NOT NULL REFERENCES envios_pesquisa(id) ON DELETE CASCADE,
        respondido_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_respostas_envio_id UNIQUE (envio_id)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE itens_resposta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        resposta_id uuid NOT NULL REFERENCES respostas(id) ON DELETE CASCADE,
        pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
        valor jsonb NOT NULL DEFAULT '{}'::jsonb,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_itens_resposta_resposta_pergunta UNIQUE (resposta_id, pergunta_id)
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_itens_resposta ON itens_resposta (resposta_id)`)
    await queryRunner.query(`CREATE INDEX idx_itens_pergunta ON itens_resposta (pergunta_id)`)

    // SEM colaborador_id, SEM sessao_id, SEM envio_id — guard rail de
    // anonimização estrutural (ver comentário do cabeçalho). NUNCA adicionar
    // nenhuma dessas colunas aqui, em nenhuma migration futura.
    await queryRunner.query(`
      CREATE TABLE respostas_clima (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
        ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
        respondido_em timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX idx_respostas_clima_pesquisa ON respostas_clima (pesquisa_id)`)
    await queryRunner.query(`CREATE INDEX idx_respostas_clima_ciclo ON respostas_clima (ciclo_id)`)

    await queryRunner.query(`
      CREATE TABLE itens_resposta_clima (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        resposta_clima_id uuid NOT NULL REFERENCES respostas_clima(id) ON DELETE CASCADE,
        pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
        valor jsonb NOT NULL DEFAULT '{}'::jsonb,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_itens_resposta_clima_resposta_pergunta UNIQUE (resposta_clima_id, pergunta_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX idx_itens_resposta_clima_resposta ON itens_resposta_clima (resposta_clima_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX idx_itens_resposta_clima_pergunta ON itens_resposta_clima (pergunta_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_itens_resposta_clima_pergunta`)
    await queryRunner.query(`DROP INDEX idx_itens_resposta_clima_resposta`)
    await queryRunner.query(`DROP TABLE itens_resposta_clima`)

    await queryRunner.query(`DROP INDEX idx_respostas_clima_ciclo`)
    await queryRunner.query(`DROP INDEX idx_respostas_clima_pesquisa`)
    await queryRunner.query(`DROP TABLE respostas_clima`)

    await queryRunner.query(`DROP INDEX idx_itens_pergunta`)
    await queryRunner.query(`DROP INDEX idx_itens_resposta`)
    await queryRunner.query(`DROP TABLE itens_resposta`)

    await queryRunner.query(`DROP TABLE respostas`)

    await queryRunner.query(`DROP INDEX idx_sessoes_resposta_envio`)
    await queryRunner.query(`DROP TABLE sessoes_resposta`)
  }
}
