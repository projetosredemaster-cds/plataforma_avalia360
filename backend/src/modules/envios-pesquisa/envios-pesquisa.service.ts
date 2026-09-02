import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import type { ColaboradorAutenticado } from '../../types/express'
import type { TipoPesquisa, TipoRelacionamento } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { EnvioPesquisa } from './envio-pesquisa.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

interface EnvioComumResposta {
  id: string
  status: string // StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/** Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa `avaliacao_360`). */
export interface EnvioAvaliacao360Resposta extends EnvioComumResposta {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * Envio gerado a partir de `ciclo_participantes` (pesquisa `clima_geral`) —
 * sem avaliador/avaliado, só o destinatário do link. `destinatario` é
 * IDENTIFICADO (nome completo) mas isso é dado estrutural de controle de
 * envio, não resposta — ver "Guard rails de anonimização" no plano.
 */
export interface EnvioClimaGeralResposta extends EnvioComumResposta {
  origem: 'colaborador'
  destinatario: { id: string; nomeCompleto: string }
}

export type EnvioCicloResposta = EnvioAvaliacao360Resposta | EnvioClimaGeralResposta

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa` não é
 * repetido por item porque uma ativação de ciclo sempre gera envios para
 * UMA ÚNICA pesquisa (mesmo `pesquisaId` passado a
 * `gerarEnviosPesquisa`/`gerarEnviosClima`) — permite ao frontend decidir a
 * seção/colunas certas com um único `if`. `null` SOMENTE quando `envios`
 * está vazio (ciclo ainda não ativado, nenhum envio gerado ainda) — nunca
 * interpretar como erro.
 */
export interface ListarEnviosCicloResposta {
  tipoPesquisa: TipoPesquisa | null
  envios: EnvioCicloResposta[]
}

function montarLinkPublico(tokenAcesso: string): string {
  // Página `/responder` ainda não existe (próximo item do roadmap) — só a
  // URL/token precisam existir e ser exibidos por ora.
  return `${env.frontendUrl}/responder/${tokenAcesso}`
}

/**
 * Gera `envios_pesquisa` a partir dos `relacionamentos_avaliacao` recém-
 * criados/existentes do ciclo — 1 envio por relacionamento, vinculado à
 * pesquisa publicada do ciclo. Função interna, chamada só por
 * `ciclos-avaliacao.service.ts` (`atualizarStatus`), dentro da MESMA
 * transação que gera os relacionamentos — nunca fora de uma transação.
 * Idempotente via `.orIgnore()` sobre `unique (pesquisa_id, relacionamento_id)`.
 */
export async function gerarEnviosPesquisa(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  const relacionamentos = await manager
    .getRepository(RelacionamentoAvaliacao)
    .find({ where: { cicloId } })

  if (relacionamentos.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values(
      relacionamentos.map((r) => ({
        pesquisaId,
        relacionamentoId: r.id,
        status: 'pendente' as const,
      })),
    )
    .orIgnore()
    .execute()
}

/**
 * Gera `envios_pesquisa` a partir de `ciclo_participantes` — 1 envio por
 * participante, `colaboradorId` preenchido e `relacionamentoId` NULL.
 * Usada EXCLUSIVAMENTE para pesquisas `clima_geral` (ver
 * `ciclos-avaliacao.service.ts`, `atualizarStatus`) — NUNCA gera
 * `relacionamentos_avaliacao` (guard rail de anonimização: essa tabela e a
 * regra de pares/subordinado são exclusivas do motor de `avaliacao_360`).
 * Função interna, chamada só dentro da MESMA transação de ativação do
 * ciclo. Idempotente via `.orIgnore()` sobre o índice único parcial
 * `uq_envios_pesquisa_colaborador (pesquisa_id, colaborador_id) WHERE
 * colaborador_id IS NOT NULL`.
 */
export async function gerarEnviosClima(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  const participantes = await manager.getRepository(CicloParticipante).find({ where: { cicloId } })

  if (participantes.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values(
      participantes.map((p) => ({
        pesquisaId,
        relacionamentoId: null,
        colaboradorId: p.colaboradorId,
        status: 'pendente' as const,
      })),
    )
    .orIgnore()
    .execute()
}

/**
 * Busca um envio garantindo que pertence ao ciclo informado. Filtro trocado
 * nesta task: de `relacionamentos_avaliacao.ciclo_id` (quebrava para
 * envios `clima_geral`, que têm `relacionamento_id = NULL` e por isso
 * nunca combinavam com um INNER JOIN nessa tabela) para
 * `pesquisas.ciclo_id` — funciona uniformemente para as duas origens,
 * porque TODO envio (de qualquer origem) tem `pesquisa_id` preenchido, e
 * essa é a MESMA pesquisa (`pesquisaPublicada`) já resolvida e vinculada ao
 * ciclo pela checagem `CICLO_SEM_PESQUISA_PUBLICADA` existente antes da
 * geração.
 */
async function buscarEnvioDoCicloOuFalhar(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .where('e.id = :envioId', { envioId })
    .andWhere('pesquisa.ciclo_id = :cicloId', { cicloId })
    .getOne()

  if (!envio) {
    throw new ErroHttp(404, 'ENVIO_NAO_ENCONTRADO', 'Envio de pesquisa não encontrado para este ciclo.')
  }

  return envio
}

/**
 * Query base com LEFT JOIN para as duas origens possíveis — reaproveitada
 * por `listarPorCiclo` e por `buscarEnvioComNomes` (usada pelas 3 ações).
 * `LEFT JOIN` (nunca `INNER JOIN`) em `relacionamentos_avaliacao`/
 * avaliador/avaliado/destinatário: cada linha de `envios_pesquisa` só
 * preenche um dos dois lados (garantido pelo CHECK do banco), então os
 * campos do lado que não se aplica vêm `NULL` do banco — tratado em
 * `mapearLinha`.
 */
function baseQuery() {
  return AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .leftJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .leftJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .leftJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .leftJoin(Colaborador, 'destinatario', 'destinatario.id = e.colaborador_id')
    .select('e.id', 'id')
    .addSelect('pesquisa.tipo', 'pesquisaTipo')
    .addSelect('e.relacionamento_id', 'relacionamentoId')
    .addSelect('r.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('r.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('r.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('e.colaborador_id', 'destinatarioId')
    .addSelect('destinatario.nome_completo', 'destinatarioNome')
    .addSelect('e.status', 'status')
    .addSelect('e.token_acesso', 'tokenAcesso')
    .addSelect('e.quantidade_lembretes', 'quantidadeLembretes')
    .addSelect('e.cpf_confirmado_em', 'cpfConfirmadoEm')
    .addSelect('e.concluido_em', 'concluidoEm')
}

async function buscarEnvioComNomes(envioId: string): Promise<EnvioCicloResposta> {
  const linha = await baseQuery().where('e.id = :envioId', { envioId }).getRawOne()
  return mapearLinha(linha)
}

function mapearLinha(linha: any): EnvioCicloResposta {
  const comum: EnvioComumResposta = {
    id: linha.id,
    status: linha.status,
    link: montarLinkPublico(linha.tokenAcesso),
    quantidadeLembretes: linha.quantidadeLembretes,
    cpfConfirmadoEm: linha.cpfConfirmadoEm ? new Date(linha.cpfConfirmadoEm).toISOString() : null,
    concluidoEm: linha.concluidoEm ? new Date(linha.concluidoEm).toISOString() : null,
  }

  // Discriminante: presença de relacionamentoId (nunca ambos/nenhum,
  // garantido pelo CHECK chk_envios_pesquisa_origem_exclusiva no banco).
  if (linha.relacionamentoId) {
    return {
      ...comum,
      origem: 'relacionamento',
      avaliadorId: linha.avaliadorId,
      avaliadorNome: linha.avaliadorNome,
      avaliadoId: linha.avaliadoId,
      avaliadoNome: linha.avaliadoNome,
      tipoRelacionamento: linha.tipoRelacionamento,
    }
  }

  return {
    ...comum,
    origem: 'colaborador',
    destinatario: { id: linha.destinatarioId, nomeCompleto: linha.destinatarioNome },
  }
}

export async function listarPorCiclo(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<ListarEnviosCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // Visão IDENTIFICADA de controle de envio (quem-avalia-quem para
  // avaliacao_360, destinatário para clima_geral) — restrita a
  // admin/gestor_rh, mesma natureza de GET /api/ciclos/:id/relacionamentos.
  // Nunca junction com dado de resposta (itens_resposta/respostas ainda não
  // existem) — só vínculo estrutural + metadados de controle de envio.
  await buscarCicloOuFalhar(cicloId)

  const linhas = await baseQuery()
    .where('pesquisa.ciclo_id = :cicloId', { cicloId })
    .orderBy('COALESCE(avaliado.nome_completo, destinatario.nome_completo)', 'ASC')
    .addOrderBy('r.tipo_relacionamento', 'ASC')
    .getRawMany()

  const envios = linhas.map(mapearLinha)
  const tipoPesquisa = linhas.length > 0 ? (linhas[0].pesquisaTipo as TipoPesquisa) : null

  return { tipoPesquisa, envios }
}

export async function marcarComoEnviado(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'pendente') {
    throw new ErroHttp(
      409,
      'TRANSICAO_ENVIO_INVALIDA',
      'Só é possível marcar como enviado um envio em status "pendente".',
    )
  }

  envio.status = 'enviado'
  envio.enviadoEm = new Date()
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function registrarLembrete(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'enviado') {
    throw new ErroHttp(
      409,
      'TRANSICAO_ENVIO_INVALIDA',
      'Só é possível registrar lembrete para um envio em status "enviado".',
    )
  }

  envio.quantidadeLembretes += 1
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function expirarEnvio(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  // Requisito 6 do pedido: "qualquer status → expirado", sem pré-condição
  // (inclusive idempotente se já estiver expirado). Ver "Perguntas em
  // aberto" (task-backend.md) sobre bloquear a partir de "concluido".
  envio.status = 'expirado'
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}
