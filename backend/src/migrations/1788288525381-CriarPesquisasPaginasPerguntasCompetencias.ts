import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Módulo de pesquisas (construtor de pesquisas) — puramente estrutural/
 * template. Nenhuma tabela aqui guarda resposta, respondente, avaliador ou
 * contador de respostas (ver guard rail 1.8 de `.claude/tasks/pesquisas/
 * task-backend.md`). Dados de execução de pesquisa (`envios_pesquisa`,
 * `respostas`, `itens_resposta`, `relacionamentos_avaliacao`) pertencem a
 * tasks futuras.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada à migration de
 * equipes/colaboradores.
 */
export class CriarPesquisasPaginasPerguntasCompetencias1788288525381
  implements MigrationInterface
{
  name = 'CriarPesquisasPaginasPerguntasCompetencias1788288525381'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE status_pesquisa AS ENUM ('rascunho', 'publicada', 'encerrada')`,
    )
    await queryRunner.query(
      `CREATE TYPE tipo_pergunta AS ENUM ('likert', 'texto_aberto', 'matriz', 'pessoa')`,
    )

    await queryRunner.query(`
      CREATE TABLE competencias (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome varchar(255) NOT NULL,
        descricao text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_competencias_nome UNIQUE (nome)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE pesquisas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        titulo varchar(255) NOT NULL,
        mensagem_boas_vindas text,
        logo_url varchar(500),
        status status_pesquisa NOT NULL DEFAULT 'rascunho',
        -- Sem REFERENCES: ciclos_avaliacao ainda não existe (dívida técnica
        -- assumida — ver decisão assumida 3 do plano da task).
        -- TODO(futuro): adicionar REFERENCES ciclos_avaliacao(id) quando o
        -- módulo de ciclos for criado.
        ciclo_id uuid,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE TABLE paginas_pesquisa (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
        titulo varchar(255),
        ordem integer NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_paginas_pesquisa_pesquisa_ordem UNIQUE (pesquisa_id, ordem) DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(
      `CREATE INDEX idx_paginas_pesquisa_pesquisa_id ON paginas_pesquisa (pesquisa_id)`,
    )

    await queryRunner.query(`
      CREATE TABLE perguntas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pagina_id uuid NOT NULL REFERENCES paginas_pesquisa(id) ON DELETE CASCADE,
        tipo tipo_pergunta NOT NULL,
        enunciado text NOT NULL,
        obrigatoria boolean NOT NULL DEFAULT true,
        -- Configuração estrutural por tipo (escala/rótulos do likert e
        -- matriz, filtro de relacionamento selecionável da pergunta pessoa)
        -- — NUNCA dado de resposta, respondente ou avaliador (guard rail
        -- 1.8 do plano). Chaves em camelCase (niveis, rotulos,
        -- filtroRelacionamento) no wire format da API.
        configuracao jsonb NOT NULL DEFAULT '{}'::jsonb,
        ordem integer NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_perguntas_pagina_ordem UNIQUE (pagina_id, ordem) DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_perguntas_pagina_id ON perguntas (pagina_id)`)

    await queryRunner.query(`
      CREATE TABLE perguntas_competencias (
        pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
        competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
        PRIMARY KEY (pergunta_id, competencia_id)
      )
    `)

    await queryRunner.query(
      `CREATE INDEX idx_perguntas_competencias_competencia_id ON perguntas_competencias (competencia_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE perguntas_competencias`)
    await queryRunner.query(`DROP TABLE perguntas`)
    await queryRunner.query(`DROP TABLE paginas_pesquisa`)
    await queryRunner.query(`DROP TABLE pesquisas`)
    await queryRunner.query(`DROP TABLE competencias`)
    await queryRunner.query(`DROP TYPE tipo_pergunta`)
    await queryRunner.query(`DROP TYPE status_pesquisa`)
  }
}
