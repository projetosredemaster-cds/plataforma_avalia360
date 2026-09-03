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

/** Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa `avaliacao_360`). SEM MUDANÇA nesta task. */
export interface EnvioAvaliacao360Resposta extends EnvioComumResposta {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * O ÚNICO envio (link de campanha) de uma pesquisa `clima_geral` — 1 por
 * ciclo (garantido pelo índice único parcial `uq_envios_pesquisa_ciclo`).
 * Sem `destinatario`: não representa mais 1 pessoa, e sim a campanha
 * inteira — a lista de destinatários/participantes vive em
 * `ListarEnviosCicloRespostaClimaGeral.participantes`, não aqui.
 */
export interface EnvioClimaGeralCampanhaResposta extends EnvioComumResposta {
  origem: 'ciclo'
}

/** Retorno das 3 ações (`marcar-enviado`/`registrar-lembrete`/`expirar`) — o item único atualizado. */
export type EnvioAcaoResposta = EnvioAvaliacao360Resposta | EnvioClimaGeralCampanhaResposta

/**
 * Participante do ciclo, para o braço `clima_geral` de
 * `GET /api/ciclos/:cicloId/envios` — `respondeuEm` é metadado de controle
 * de participação (NUNCA conteúdo de resposta), sempre `null` nesta task
 * (nenhuma rota o escreve; reservado para a futura página pública
 * `/responder`).
 */
export interface ParticipanteClimaResposta {
  id: string
  colaboradorId: string
  nomeCompleto: string
  respondeuEm: string | null
}

export interface ListarEnviosCicloRespostaVazia {
  tipoPesquisa: null
  envios: []
}

export interface ListarEnviosCicloRespostaAvaliacao360 {
  tipoPesquisa: 'avaliacao_360'
  envios: EnvioAvaliacao360Resposta[]
}

export interface ListarEnviosCicloRespostaClimaGeral {
  tipoPesquisa: 'clima_geral'
  campanha: EnvioClimaGeralCampanhaResposta
  participantes: ParticipanteClimaResposta[]
}

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa: null`
 * SOMENTE quando o ciclo ainda não foi ativado (nenhum envio gerado ainda)
 * — nunca interpretar como erro. `avaliacao_360` mantém o shape anterior
 * (array `envios`) sem NENHUMA mudança. `clima_geral` muda de shape: em vez
 * de um item por participante, um único objeto `campanha` (o link) + a lista
 * `participantes` (quem está no ciclo + `respondeuEm`).
 */
export type ListarEnviosCicloResposta =
  | ListarEnviosCicloRespostaVazia
  | ListarEnviosCicloRespostaAvaliacao360
  | ListarEnviosCicloRespostaClimaGeral

function montarLinkPublico(tokenAcesso: string): string {
  // Página `/responder` ainda não existe (próximo item do roadmap) — só a
  // URL/token precisam existir e ser exibidos por ora.
  return `${env.frontendUrl}/responder/${tokenAcesso}`
}

/**
 * Gera `envios_pesquisa` a partir dos `relacionamentos_avaliacao` recém-
 * criados/existentes do ciclo — 1 envio por relacionamento. SEM MUDANÇA
 * nesta task (reproduzida aqui por completude do arquivo).
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
 * Gera o ÚNICO `envios_pesquisa` (link de campanha) do ciclo, para
 * pesquisas `clima_geral` — `cicloId` preenchido, `relacionamentoId: null`.
 * REESCRITA nesta task: antes gerava 1 envio por `ciclo_participantes`
 * (`colaboradorId` preenchido); agora gera exatamente 1 linha por ciclo,
 * sem depender de ler `ciclo_participantes` (a checagem
 * `CICLO_SEM_PARTICIPANTES`, em `ciclos-avaliacao.service.ts`, já garante
 * que existe ao menos 1 participante antes desta função rodar — mas o link
 * da campanha não depende de QUANTOS participantes existem, ver decisão de
 * modelagem 6 do plano). NUNCA gera `relacionamentos_avaliacao` (guard rail
 * de anonimização, inalterado). Idempotente via `.orIgnore()` sobre o
 * índice único parcial `uq_envios_pesquisa_ciclo (ciclo_id) WHERE ciclo_id
 * IS NOT NULL`. Assinatura inalterada — `ciclos-avaliacao.service.ts` não
 * precisa de nenhuma mudança.
 */
export async function gerarEnviosClima(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values({
      pesquisaId,
      relacionamentoId: null,
      cicloId,
      status: 'pendente' as const,
    })
    .orIgnore()
    .execute()
}

/**
 * Busca um envio garantindo que pertence ao ciclo informado, via
 * `pesquisas.ciclo_id` — SEM MUDANÇA nesta task. Já era origem-agnóstico
 * (não depende de `colaborador_id`/`ciclo_id` da própria linha de
 * `envios_pesquisa` para localizar o envio dentro do ciclo), então continua
 * funcionando sem alteração tanto para `avaliacao_360` quanto para o novo
 * modelo de `clima_geral`.
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
 * Query base — reaproveitada por `listarPorCiclo` (braço `avaliacao_360`) e
 * por `buscarEnvioComNomes` (usada pelas 3 ações, qualquer origem).
 * `LEFT JOIN` (nunca `INNER JOIN`) em `relacionamentos_avaliacao`/
 * avaliador/avaliado: cada linha de `envios_pesquisa` só preenche um dos
 * dois lados (garantido pelo CHECK do banco) — para uma linha de
 * `clima_geral`, todos os campos vindos desse `LEFT JOIN` vêm `NULL`,
 * tratado em `mapearLinha`. O `leftJoin`/`addSelect` de `destinatario`
 * (modelo anterior) foram REMOVIDOS — não há mais "destinatário" por linha.
 */
function baseQuery() {
  return AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .leftJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .leftJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .leftJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .select('e.id', 'id')
    .addSelect('pesquisa.tipo', 'pesquisaTipo')
    .addSelect('e.relacionamento_id', 'relacionamentoId')
    .addSelect('r.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('r.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('r.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('e.status', 'status')
    .addSelect('e.token_acesso', 'tokenAcesso')
    .addSelect('e.quantidade_lembretes', 'quantidadeLembretes')
    .addSelect('e.cpf_confirmado_em', 'cpfConfirmadoEm')
    .addSelect('e.concluido_em', 'concluidoEm')
}

async function buscarEnvioComNomes(envioId: string): Promise<EnvioAcaoResposta> {
  const linha = await baseQuery().where('e.id = :envioId', { envioId }).getRawOne()
  return mapearLinha(linha)
}

/**
 * Discriminante: presença de `relacionamentoId` (nunca ambos/nenhum,
 * garantido pelo CHECK `chk_envios_pesquisa_origem_exclusiva` no banco —
 * agora contra `ciclo_id` em vez de `colaborador_id`, mas a lógica de
 * discriminação por `relacionamentoId` não muda).
 */
function mapearLinha(linha: any): EnvioAcaoResposta {
  const comum: EnvioComumResposta = {
    id: linha.id,
    status: linha.status,
    link: montarLinkPublico(linha.tokenAcesso),
    quantidadeLembretes: linha.quantidadeLembretes,
    cpfConfirmadoEm: linha.cpfConfirmadoEm ? new Date(linha.cpfConfirmadoEm).toISOString() : null,
    concluidoEm: linha.concluidoEm ? new Date(linha.concluidoEm).toISOString() : null,
  }

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

  return { ...comum, origem: 'ciclo' }
}

function mapearParticipanteClima(linha: any): ParticipanteClimaResposta {
  return {
    id: linha.id,
    colaboradorId: linha.colaboradorId,
    nomeCompleto: linha.nomeCompleto,
    respondeuEm: linha.respondeuEm ? new Date(linha.respondeuEm).toISOString() : null,
  }
}

export async function listarPorCiclo(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<ListarEnviosCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // Visão IDENTIFICADA de controle de envio — restrita a admin/gestor_rh,
  // mesma natureza de GET /api/ciclos/:id/relacionamentos. Nunca junction
  // com dado de resposta (itens_resposta/respostas ainda não existem).
  await buscarCicloOuFalhar(cicloId)

  const linhas = await baseQuery()
    .where('pesquisa.ciclo_id = :cicloId', { cicloId })
    .orderBy('avaliado.nome_completo', 'ASC')
    .addOrderBy('r.tipo_relacionamento', 'ASC')
    .getRawMany()

  if (linhas.length === 0) {
    return { tipoPesquisa: null, envios: [] }
  }

  const tipoPesquisa = linhas[0].pesquisaTipo as TipoPesquisa

  if (tipoPesquisa === 'clima_geral') {
    // Exatamente 1 linha, garantido pelo índice único parcial
    // uq_envios_pesquisa_ciclo — mapearLinha() sempre retorna o braço
    // `origem: 'ciclo'` aqui, porque nenhuma linha de clima tem
    // relacionamentoId preenchido.
    const campanha = mapearLinha(linhas[0]) as EnvioClimaGeralCampanhaResposta

    const participantesLinhas = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('p')
      .innerJoin(Colaborador, 'c', 'c.id = p.colaborador_id')
      .select('p.id', 'id')
      .addSelect('p.colaborador_id', 'colaboradorId')
      .addSelect('c.nome_completo', 'nomeCompleto')
      .addSelect('p.respondeu_em', 'respondeuEm')
      .where('p.ciclo_id = :cicloId', { cicloId })
      .orderBy('c.nome_completo', 'ASC')
      .getRawMany()

    return {
      tipoPesquisa: 'clima_geral',
      campanha,
      participantes: participantesLinhas.map(mapearParticipanteClima),
    }
  }

  // avaliacao_360: SEM MUDANÇA de comportamento em relação à versão
  // anterior (mesmas linhas, mesmo mapeamento).
  return {
    tipoPesquisa: 'avaliacao_360',
    envios: linhas.map(mapearLinha) as EnvioAvaliacao360Resposta[],
  }
}

export async function marcarComoEnviado(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioAcaoResposta> {
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
): Promise<EnvioAcaoResposta> {
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
): Promise<EnvioAcaoResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  envio.status = 'expirado'
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}
