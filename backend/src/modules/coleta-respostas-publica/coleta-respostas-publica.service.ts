import { In } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { compararCpfConstantTime, normalizarCpf } from '../../common/cpf'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import { LIMITE_TENTATIVAS_CPF_INVALIDAS } from '../../common/limites'
import { ehUuidValido } from '../../common/uuid'
import type { FiltroRelacionamentoPessoa, TipoPergunta, TipoPesquisa } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { EnvioPesquisa } from '../envios-pesquisa/envio-pesquisa.entity'
import { Competencia } from '../competencias/competencia.entity'
import { PaginaPesquisa } from '../paginas-pesquisa/pagina-pesquisa.entity'
import { PerguntaCompetencia } from '../perguntas/pergunta-competencia.entity'
import { Pergunta } from '../perguntas/pergunta.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { ItemResposta } from '../respostas/item-resposta.entity'
import { Resposta } from '../respostas/resposta.entity'
import { ItemRespostaClima } from '../respostas-clima/item-resposta-clima.entity'
import { RespostaClima } from '../respostas-clima/resposta-clima.entity'
import type { ConfirmarCpfDto } from './dto/confirmar-cpf.dto'
import type { EnviarRespostasDto } from './dto/enviar-respostas.dto'
import { SessaoResposta } from './sessao-resposta.entity'

// --- Tipos de resposta HTTP (contrato literal da spec, seção 6) ----------

export interface StatusEnvioResposta {
  estado: 'aguardando_cpf'
}

export interface ConfirmarCpfResposta {
  sessaoToken: string
  expiraEm: string
  tipoPesquisa: TipoPesquisa
}

export interface CompetenciaResumoFormulario {
  id: string
  nome: string
}

export interface OpcaoPessoaFormulario {
  id: string
  nomeCompleto: string
}

export interface PerguntaFormulario {
  id: string
  tipo: TipoPergunta
  enunciado: string
  obrigatoria: boolean
  ordem: number
  configuracao: Record<string, unknown>
  competencias?: CompetenciaResumoFormulario[]
  opcoesPessoa?: OpcaoPessoaFormulario[]
}

export interface PaginaFormulario {
  id: string
  ordem: number
  titulo: string | null
  perguntas: PerguntaFormulario[]
}

export interface FormularioResposta {
  pesquisa: { titulo: string; mensagemBoasVindas: string | null; logoUrl: string | null }
  paginas: PaginaFormulario[]
}

export interface EnviarRespostasResposta {
  sucesso: true
}

// --- Helpers internos compartilhados --------------------------------------

/**
 * Checagem de estado do envio, na ORDEM exigida pela spec (seção 4): token
 * existe -> bloqueado por tentativas -> ciclo/pesquisa ativos -> envio
 * expirado -> (só avaliacao_360) já respondido. Reaproveitada por
 * `obterStatusEnvio` e `confirmarCpf`, para os dois nunca divergirem.
 * `pesquisa.cicloId` é usado para achar o ciclo em AMBOS os tipos de
 * pesquisa (ver "Decisões de modelagem" nº 15 do plano) — nunca precisa de
 * um branch por tipo aqui.
 */
async function buscarEnvioValidoOuFalhar(
  token: string,
): Promise<{ envio: EnvioPesquisa; pesquisa: Pesquisa }> {
  // Formato inválido tratado EXATAMENTE como "não encontrado" (mesmo código,
  // mesma mensagem) — sem essa checagem, um token malformado chegaria ao
  // driver do Postgres e estouraria como 500 em vez de 404 (ver correção
  // pontual desta task).
  if (!ehUuidValido(token)) {
    throw new ErroHttp(404, 'LINK_INVALIDO', 'Link de acesso inválido.')
  }

  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ tokenAcesso: token })
  if (!envio) {
    throw new ErroHttp(404, 'LINK_INVALIDO', 'Link de acesso inválido.')
  }

  if (envio.tentativasCpfInvalidas >= LIMITE_TENTATIVAS_CPF_INVALIDAS) {
    throw new ErroHttp(
      403,
      'BLOQUEADO_TENTATIVAS_CPF',
      'Não foi possível confirmar seus dados. Procure o RH.',
    )
  }

  const pesquisa = await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
  const ciclo = pesquisa?.cicloId
    ? await AppDataSource.getRepository(CicloAvaliacao).findOneBy({ id: pesquisa.cicloId })
    : null

  if (!pesquisa || pesquisa.status !== 'publicada' || !ciclo || ciclo.status !== 'ativo') {
    throw new ErroHttp(
      409,
      'CICLO_OU_PESQUISA_INATIVOS',
      'Este ciclo ou pesquisa não está mais ativo.',
    )
  }

  if (envio.status === 'expirado') {
    throw new ErroHttp(410, 'ENVIO_EXPIRADO', 'Este link de acesso expirou.')
  }

  // Só verificável aqui para avaliacao_360 (o envio já identifica 1 pessoa).
  // clima_geral: adiado para depois do match de CPF (ver confirmarCpf).
  if (envio.relacionamentoId && envio.status === 'concluido') {
    throw new ErroHttp(409, 'JA_RESPONDIDO', 'Você já respondeu esta pesquisa.')
  }

  return { envio, pesquisa }
}

/** Grava cpf_confirmado_em SÓ na primeira confirmação (WHERE ... IS NULL) —
 * correto mesmo sob concorrência, nos dois fluxos (ver decisão nº 6). */
async function marcarPrimeiraConfirmacaoCpf(envioId: string): Promise<void> {
  await AppDataSource.createQueryBuilder()
    .update(EnvioPesquisa)
    .set({ cpfConfirmadoEm: () => 'now()' })
    .where('id = :envioId', { envioId })
    .andWhere('cpf_confirmado_em IS NULL')
    .execute()
}

/** Incrementa a tentativa inválida com um UPDATE atômico (só a coluna
 * `tentativas_cpf_invalidas`, via RETURNING) e lança o erro apropriado —
 * nunca retorna normalmente. Se atingir o limite, responde já com
 * BLOQUEADO_TENTATIVAS_CPF (spec, seção 6.2) em vez de CPF_NAO_CONFERE.
 *
 * Correção de code review: a versão anterior lia a entidade inteira antes
 * do request e dava `.save()` nela, o que sob concorrência (rota pública,
 * sem rate limit, e no clima_geral com uma única linha de `envios_pesquisa`
 * compartilhada por todo o ciclo) podia sobrescrever `cpf_confirmado_em`/
 * `status`/`concluido_em` gravados por outra requisição concorrente com
 * valores obsoletos. Agora o UPDATE toca só esta coluna (mesmo padrão já
 * usado por `marcarPrimeiraConfirmacaoCpf`) e a decisão de bloqueio usa o
 * valor pós-incremento devolvido pelo próprio UPDATE (`RETURNING`), nunca
 * uma leitura anterior. */
async function registrarTentativaInvalida(envioId: string): Promise<never> {
  const resultado = await AppDataSource.createQueryBuilder()
    .update(EnvioPesquisa)
    .set({ tentativasCpfInvalidas: () => 'tentativas_cpf_invalidas + 1' })
    .where('id = :envioId', { envioId })
    .returning('tentativas_cpf_invalidas')
    .execute()

  const tentativasAtualizadas = Number(
    resultado.raw?.[0]?.tentativas_cpf_invalidas ?? LIMITE_TENTATIVAS_CPF_INVALIDAS,
  )

  if (tentativasAtualizadas >= LIMITE_TENTATIVAS_CPF_INVALIDAS) {
    throw new ErroHttp(
      403,
      'BLOQUEADO_TENTATIVAS_CPF',
      'Não foi possível confirmar seus dados. Procure o RH.',
    )
  }
  throw new ErroHttp(422, 'CPF_NAO_CONFERE', 'CPF não confere.')
}

async function criarSessao(
  envioId: string,
  cicloParticipanteId: string | null,
  tipoPesquisa: TipoPesquisa,
): Promise<SessaoResposta> {
  const expiraEm = new Date(Date.now() + env.sessaoRespostaTtlMinutos * 60_000)
  const repo = AppDataSource.getRepository(SessaoResposta)
  const salva = await repo.save(repo.create({ envioId, cicloParticipanteId, tipoPesquisa, expiraEm }))
  // `token` é gerado pelo DEFAULT do Postgres (gen_random_uuid()), sem
  // @Generated/default na entidade (mesmo padrão deliberado de
  // envios_pesquisa.tokenAcesso) — o TypeORM não sabe incluí-lo no RETURNING
  // do INSERT, então `salva.token` viria undefined em memória mesmo já
  // persistido no banco. Re-busca para ler o valor real gerado pelo banco.
  return repo.findOneByOrFail({ id: salva.id })
}

function montarRespostaConfirmacao(sessao: SessaoResposta): ConfirmarCpfResposta {
  return {
    sessaoToken: sessao.token,
    expiraEm: sessao.expiraEm.toISOString(),
    tipoPesquisa: sessao.tipoPesquisa,
  }
}

/** Checagem de sessão, reaproveitada por buscarFormulario e enviarRespostas. */
async function buscarSessaoValidaOuFalhar(sessaoToken: string): Promise<SessaoResposta> {
  // Mesma lógica de `buscarEnvioValidoOuFalhar`: formato inválido tratado
  // como "não encontrado", ANTES de qualquer consulta ao banco.
  if (!ehUuidValido(sessaoToken)) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }

  const sessao = await AppDataSource.getRepository(SessaoResposta).findOneBy({ token: sessaoToken })
  if (!sessao) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }
  if (sessao.usadaEm) {
    throw new ErroHttp(409, 'SESSAO_JA_UTILIZADA', 'Esta sessão já foi utilizada.')
  }
  if (sessao.expiraEm.getTime() < Date.now()) {
    throw new ErroHttp(410, 'SESSAO_EXPIRADA', 'Sessão expirada.')
  }
  return sessao
}

/**
 * Resolve as opções de uma pergunta tipo `pessoa`: colaboradores que, no
 * MESMO ciclo, têm um relacionamento com QUEM ESTÁ RESPONDENDO (o
 * `avaliador_id` do relacionamento atual — `relacionamento.avaliadorId` —
 * nunca o `avaliado_id`), restrito aos tipos presentes em
 * `configuracao.filtroRelacionamento`. A direção da relação depende do tipo:
 * - `pares`: o respondente pode estar de qualquer lado da linha (a geração
 *   do motor de ciclos já produz as duas direções, mas checamos as duas
 *   mesmo assim, por defesa) — o colega é o outro lado.
 * - `gestor`: só linhas em que o respondente é o AVALIADO (é o gestor DO
 *   respondente que aparece como opção, nunca quem o respondente gerencia).
 * - `subordinado`: só linhas em que o respondente é o AVALIADO (são os
 *   subordinados DO respondente).
 * - `autoavaliacao`: nunca contribui, mesmo se marcado no filtro (não faz
 *   sentido indicar a si mesmo) — ignorado ao montar as condições.
 * - `externo`: nenhuma linha desse tipo é gerada hoje pelo motor de ciclos
 *   (reservado para avaliador convidado manualmente) — não contribui
 *   nenhuma condição, sem que isso seja um erro.
 * - `todos_gestores`: IGNORA completamente a relação com o respondente —
 *   lista todos os colaboradores com `eh_gestor = true` E `ativo = true`
 *   que sejam `ciclo_participantes` do MESMO ciclo
 *   (`relacionamento.cicloId`), consultando `ciclo_participantes` ⨝
 *   `colaboradores` (NUNCA `relacionamentos_avaliacao` para esta branch).
 *   Combinável com os filtros acima (união dos dois conjuntos de
 *   resultados, sem duplicar — mesmo dedupe por id já usado). Sempre
 *   exclui o próprio respondente, mesmo que ele seja gestor.
 * Se, depois de descartar `autoavaliacao`/`externo`, nenhum tipo válido
 * sobrar E `todos_gestores` não estiver marcado, retorna `[]` sem consultar
 * o banco. O resultado é deduplicado por id do colaborador (necessário pela
 * simetria de `pares`, por segurança quando a mesma pessoa aparece via mais
 * de um tipo marcado no filtro, e agora também quando a mesma pessoa é ao
 * mesmo tempo gestor (via `todos_gestores`) e par/subordinado/etc. via
 * relação).
 * Lê só `colaboradores`/`ciclo_participantes`/`relacionamentos_avaliacao`
 * (estrutural) — NUNCA `respostas`/`itens_resposta`, em nenhuma branch.
 */
// Exportada só para o script de diagnóstico standalone
// (`scripts/verificar-resolver-opcoes-pessoa.ts`) importar e chamar
// diretamente — nenhum outro consumidor de produto deve importar esta
// função fora deste módulo (o fluxo público continua usando-a só
// internamente via buscarFormulario/enviarRespostas).
export async function resolverOpcoesPessoa(
  relacionamento: RelacionamentoAvaliacao,
  configuracao: Record<string, unknown>,
): Promise<OpcaoPessoaFormulario[]> {
  const filtro = Array.isArray(configuracao.filtroRelacionamento)
    ? (configuracao.filtroRelacionamento as FiltroRelacionamentoPessoa[])
    : []

  const respondenteId = relacionamento.avaliadorId

  const condicoes: string[] = []
  if (filtro.includes('pares')) {
    condicoes.push(
      "(r.tipo_relacionamento = 'pares' AND (r.avaliador_id = :respondenteId OR r.avaliado_id = :respondenteId))",
    )
  }
  if (filtro.includes('gestor')) {
    condicoes.push("(r.tipo_relacionamento = 'gestor' AND r.avaliado_id = :respondenteId)")
  }
  if (filtro.includes('subordinado')) {
    condicoes.push("(r.tipo_relacionamento = 'subordinado' AND r.avaliado_id = :respondenteId)")
  }
  // 'autoavaliacao' nunca contribui e 'externo' nunca tem linhas geradas hoje
  // — nenhum dos dois adiciona uma condição aqui.
  const incluirTodosGestores = filtro.includes('todos_gestores')
  if (condicoes.length === 0 && !incluirTodosGestores) return []

  const porId = new Map<string, OpcaoPessoaFormulario>()

  if (condicoes.length > 0) {
    // Id do colega = o lado da linha que NÃO é o respondente. Funciona igual
    // para as 3 direções possíveis (pares-como-avaliador, pares-como-avaliado,
    // gestor/subordinado sempre com o respondente do lado avaliado).
    const idColegaExpr =
      'CASE WHEN r.avaliador_id = :respondenteId THEN r.avaliado_id ELSE r.avaliador_id END'

    const linhasRelacao = await AppDataSource.getRepository(RelacionamentoAvaliacao)
      .createQueryBuilder('r')
      .innerJoin(Colaborador, 'c', `c.id = (${idColegaExpr})`)
      .select(idColegaExpr, 'id')
      .addSelect('c.nome_completo', 'nomeCompleto')
      .where('r.ciclo_id = :cicloId', { cicloId: relacionamento.cicloId })
      .andWhere(`(${condicoes.join(' OR ')})`)
      // Correção pontual anterior, preservada: colaborador desativado não deve
      // aparecer como opção de resposta na pergunta tipo `pessoa`.
      .andWhere('c.ativo = true')
      // Defensivo: nunca oferecer o próprio respondente como opção, mesmo que
      // as regras acima já não devessem retorná-lo naturalmente.
      .andWhere(`(${idColegaExpr}) <> :respondenteId`)
      .setParameter('respondenteId', respondenteId)
      .getRawMany<OpcaoPessoaFormulario>()

    for (const linha of linhasRelacao) porId.set(linha.id, linha)
  }

  if (incluirTodosGestores) {
    // Escopo independente de relação: todo colaborador marcado como gestor E
    // participante do mesmo ciclo, exceto o próprio respondente — dado
    // estrutural (grafo "quem é gestor + está no ciclo"), NUNCA conteúdo de
    // resposta. Consulta só `ciclo_participantes` join `colaboradores`.
    const linhasGestores = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('cp')
      .innerJoin(Colaborador, 'c', 'c.id = cp.colaborador_id')
      .select('c.id', 'id')
      .addSelect('c.nome_completo', 'nomeCompleto')
      .where('cp.ciclo_id = :cicloId', { cicloId: relacionamento.cicloId })
      .andWhere('c.eh_gestor = true')
      .andWhere('c.ativo = true')
      .andWhere('c.id <> :respondenteId', { respondenteId })
      .getRawMany<OpcaoPessoaFormulario>()

    for (const linha of linhasGestores) porId.set(linha.id, linha)
  }

  // Deduplica por id — necessário pela simetria de `pares` (mesmo colega via
  // as duas direções), por segurança quando a mesma pessoa aparece via mais
  // de um tipo marcado no filtro, e agora também quando a mesma pessoa é ao
  // mesmo tempo gestor (via `todos_gestores`) e par/subordinado/etc. (via
  // relação) — o `Map` já cobre os 3 casos sem lógica extra.
  return Array.from(porId.values())
}

/**
 * Valida o `valor` de um item de resposta contra o shape esperado do tipo de
 * pergunta (docs/schema_avaliacao360_pt_v2.sql). Usada tanto para perguntas
 * obrigatórias (item precisa existir E ser válido) quanto opcionais (se
 * existir, precisa ser válido — defesa contra payload forjado).
 */
function valorValidoParaTipo(
  tipo: TipoPergunta,
  valor: unknown,
  contexto: { niveis: number | undefined; competenciaIds: string[]; opcoesPessoaIds: Set<string> | undefined },
): boolean {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false
  const objeto = valor as Record<string, unknown>
  const niveis = contexto.niveis ?? 0

  if (tipo === 'likert') {
    const nota = objeto.nota
    return typeof nota === 'number' && Number.isInteger(nota) && nota >= 1 && nota <= niveis
  }

  if (tipo === 'texto_aberto') {
    return typeof objeto.texto === 'string' && objeto.texto.trim().length > 0
  }

  if (tipo === 'matriz') {
    const notas = objeto.notas
    if (typeof notas !== 'object' || notas === null || Array.isArray(notas)) return false
    const notasObjeto = notas as Record<string, unknown>
    return contexto.competenciaIds.every((competenciaId) => {
      const nota = notasObjeto[competenciaId]
      return typeof nota === 'number' && Number.isInteger(nota) && nota >= 1 && nota <= niveis
    })
  }

  // tipo === 'pessoa'
  const colaboradorId = objeto.colaboradorId
  return typeof colaboradorId === 'string' && (contexto.opcoesPessoaIds?.has(colaboradorId) ?? false)
}

// --- Endpoint 1: GET /api/publico/envios/:token/status --------------------

export async function obterStatusEnvio(token: string): Promise<StatusEnvioResposta> {
  await buscarEnvioValidoOuFalhar(token)
  return { estado: 'aguardando_cpf' }
}

// --- Endpoint 2: POST /api/publico/envios/:token/confirmar-cpf ------------

export async function confirmarCpf(
  token: string,
  dto: ConfirmarCpfDto,
): Promise<ConfirmarCpfResposta> {
  const { envio } = await buscarEnvioValidoOuFalhar(token)
  const cpfDigitos = normalizarCpf(dto.cpf)

  if (envio.relacionamentoId) {
    // avaliacao_360: CPF deve bater com o AVALIADOR do relacionamento.
    const relacionamento = await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({
      id: envio.relacionamentoId,
    })
    const avaliador = relacionamento
      ? await AppDataSource.getRepository(Colaborador).findOneBy({ id: relacionamento.avaliadorId })
      : null

    // Correção de code review: colaborador.ativo é checado aqui e tratado
    // EXATAMENTE como "CPF não confere" (mesma resposta genérica, mesmo
    // código de erro) — a API nunca deve permitir descobrir, pela resposta,
    // se um CPF existe no sistema mas pertence a um avaliador desativado.
    // Consequência consciente: esta tentativa CONTA para o limite de 5
    // (LIMITE_TENTATIVAS_CPF_INVALIDAS), como qualquer outra tentativa malsucedida —
    // não abrimos uma exceção para não vazar, via ausência de incremento, o
    // sinal de que o CPF era válido porém inativo.
    if (!avaliador || !compararCpfConstantTime(avaliador.cpf, cpfDigitos) || !avaliador.ativo) {
      await registrarTentativaInvalida(envio.id)
      throw new ErroHttp(422, 'CPF_NAO_CONFERE', 'CPF não confere.') // inalcançável — registrarTentativaInvalida sempre lança
    }

    await marcarPrimeiraConfirmacaoCpf(envio.id)
    const sessao = await criarSessao(envio.id, null, 'avaliacao_360')
    return montarRespostaConfirmacao(sessao)
  }

  // clima_geral: CPF deve bater com algum ciclo_participantes do ciclo do envio.
  const participantes = await AppDataSource.getRepository(CicloParticipante).find({
    where: { cicloId: envio.cicloId! },
    relations: { colaborador: true },
  })
  // Correção de code review: colaborador.ativo entra no próprio predicado de
  // busca — um participante com CPF batendo porém colaborador.ativo = false
  // cai no mesmo `!participante` de "CPF não confere" (mesma resposta
  // genérica, mesmo código de erro, mesma contagem para o limite de 5
  // tentativas). Ver comentário equivalente no branch avaliacao_360 acima
  // sobre por que essa tentativa deve contar para o limite.
  const participante = participantes.find(
    (p) => compararCpfConstantTime(p.colaborador.cpf, cpfDigitos) && p.colaborador.ativo,
  )

  if (!participante) {
    await registrarTentativaInvalida(envio.id)
    throw new ErroHttp(422, 'CPF_NAO_CONFERE', 'CPF não confere.') // inalcançável — registrarTentativaInvalida sempre lança
  }

  if (participante.respondeuEm) {
    throw new ErroHttp(409, 'JA_RESPONDIDO', 'Você já respondeu esta pesquisa.')
  }

  await marcarPrimeiraConfirmacaoCpf(envio.id)
  const sessao = await criarSessao(envio.id, participante.id, 'clima_geral')
  return montarRespostaConfirmacao(sessao)
}

// --- Endpoint 3: GET /api/publico/sessoes/:sessaoToken/formulario ---------

export async function buscarFormulario(sessaoToken: string): Promise<FormularioResposta> {
  const sessao = await buscarSessaoValidaOuFalhar(sessaoToken)

  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ id: sessao.envioId })
  const pesquisa = envio
    ? await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
    : null
  if (!envio || !pesquisa) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }

  const paginas = await AppDataSource.getRepository(PaginaPesquisa).find({
    where: { pesquisaId: pesquisa.id },
    order: { ordem: 'ASC' },
  })
  const paginaIds = paginas.map((p) => p.id)

  const perguntas =
    paginaIds.length === 0
      ? []
      : await AppDataSource.getRepository(Pergunta).find({
          where: { paginaId: In(paginaIds) },
          order: { ordem: 'ASC' },
        })
  const perguntaIds = perguntas.map((p) => p.id)

  const vinculos =
    perguntaIds.length === 0
      ? []
      : await AppDataSource.getRepository(PerguntaCompetencia)
          .createQueryBuilder('pc')
          .innerJoin(Competencia, 'c', 'c.id = pc.competencia_id')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('c.id', 'id')
          .addSelect('c.nome', 'nome')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; id: string; nome: string }>()

  const competenciasPorPergunta = new Map<string, CompetenciaResumoFormulario[]>()
  for (const v of vinculos) {
    const lista = competenciasPorPergunta.get(v.perguntaId) ?? []
    lista.push({ id: v.id, nome: v.nome })
    competenciasPorPergunta.set(v.perguntaId, lista)
  }

  // Só carregado quando avaliacao_360 (relacionamentoId presente) — pergunta
  // tipo `pessoa` nunca existe em clima_geral (bloqueado em perguntas.service.ts).
  const relacionamento = envio.relacionamentoId
    ? await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({ id: envio.relacionamentoId })
    : null

  const perguntasPorPagina = new Map<string, PerguntaFormulario[]>()
  for (const pergunta of perguntas) {
    const item: PerguntaFormulario = {
      id: pergunta.id,
      tipo: pergunta.tipo,
      enunciado: pergunta.enunciado,
      obrigatoria: pergunta.obrigatoria,
      ordem: pergunta.ordem,
      configuracao: pergunta.configuracao,
    }
    if (pergunta.tipo === 'matriz') {
      item.competencias = competenciasPorPergunta.get(pergunta.id) ?? []
    }
    if (pergunta.tipo === 'pessoa' && relacionamento) {
      item.opcoesPessoa = await resolverOpcoesPessoa(relacionamento, pergunta.configuracao)
    }
    const lista = perguntasPorPagina.get(pergunta.paginaId) ?? []
    lista.push(item)
    perguntasPorPagina.set(pergunta.paginaId, lista)
  }

  return {
    pesquisa: {
      titulo: pesquisa.titulo,
      mensagemBoasVindas: pesquisa.mensagemBoasVindas,
      logoUrl: pesquisa.logoUrl,
    },
    paginas: paginas.map((pagina) => ({
      id: pagina.id,
      ordem: pagina.ordem,
      titulo: pagina.titulo,
      perguntas: perguntasPorPagina.get(pagina.id) ?? [],
    })),
  }
}

// --- Endpoint 4: POST /api/publico/sessoes/:sessaoToken/respostas ---------

export async function enviarRespostas(
  sessaoToken: string,
  dto: EnviarRespostasDto,
): Promise<EnviarRespostasResposta> {
  const sessao = await buscarSessaoValidaOuFalhar(sessaoToken)

  const envio = await AppDataSource.getRepository(EnvioPesquisa).findOneBy({ id: sessao.envioId })
  if (!envio) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }
  const pesquisa = await AppDataSource.getRepository(Pesquisa).findOneBy({ id: envio.pesquisaId })
  if (!pesquisa) {
    throw new ErroHttp(404, 'SESSAO_INVALIDA', 'Sessão inválida.')
  }

  const itensBrutos = Array.isArray(dto.itens) ? dto.itens : null
  if (!itensBrutos) {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "itens" deve ser um array.')
  }

  const paginas = await AppDataSource.getRepository(PaginaPesquisa).find({
    where: { pesquisaId: pesquisa.id },
  })
  const paginaIds = paginas.map((p) => p.id)
  const perguntas =
    paginaIds.length === 0
      ? []
      : await AppDataSource.getRepository(Pergunta).find({ where: { paginaId: In(paginaIds) } })
  const perguntasPorId = new Map(perguntas.map((p) => [p.id, p]))

  // Dedupe por perguntaId — a ÚLTIMA ocorrência do array vence (decisão nº 14).
  const itensPorPergunta = new Map<string, unknown>()
  for (const item of itensBrutos) {
    if (typeof item !== 'object' || item === null) {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Cada item de "itens" deve ser um objeto.')
    }
    const perguntaId = (item as Record<string, unknown>).perguntaId
    if (typeof perguntaId !== 'string' || !perguntasPorId.has(perguntaId)) {
      throw new ErroHttp(
        422,
        'PERGUNTA_FORA_DA_PESQUISA',
        'Uma ou mais perguntas informadas não pertencem a esta pesquisa.',
      )
    }
    itensPorPergunta.set(perguntaId, (item as Record<string, unknown>).valor)
  }

  const perguntaIds = perguntas.map((p) => p.id)
  const vinculos =
    perguntaIds.length === 0
      ? []
      : await AppDataSource.getRepository(PerguntaCompetencia)
          .createQueryBuilder('pc')
          .select('pc.pergunta_id', 'perguntaId')
          .addSelect('pc.competencia_id', 'competenciaId')
          .where('pc.pergunta_id IN (:...ids)', { ids: perguntaIds })
          .getRawMany<{ perguntaId: string; competenciaId: string }>()

  const competenciaIdsPorPergunta = new Map<string, string[]>()
  for (const v of vinculos) {
    const lista = competenciaIdsPorPergunta.get(v.perguntaId) ?? []
    lista.push(v.competenciaId)
    competenciaIdsPorPergunta.set(v.perguntaId, lista)
  }

  const relacionamento = envio.relacionamentoId
    ? await AppDataSource.getRepository(RelacionamentoAvaliacao).findOneBy({ id: envio.relacionamentoId })
    : null

  const opcoesPessoaPorPergunta = new Map<string, Set<string>>()
  for (const pergunta of perguntas) {
    if (pergunta.tipo === 'pessoa' && relacionamento) {
      const opcoes = await resolverOpcoesPessoa(relacionamento, pergunta.configuracao)
      opcoesPessoaPorPergunta.set(pergunta.id, new Set(opcoes.map((o) => o.id)))
    }
  }

  // Validação AUTORITATIVA de obrigatoriedade — roda sobre TODAS as
  // perguntas da pesquisa de uma vez (decisão nº 11). Itens não obrigatórios
  // presentes no payload também são validados quanto ao formato.
  for (const pergunta of perguntas) {
    const valor = itensPorPergunta.get(pergunta.id)
    if (valor === undefined) {
      if (pergunta.obrigatoria) {
        throw new ErroHttp(
          422,
          'RESPOSTA_INCOMPLETA',
          'Uma ou mais perguntas obrigatórias não foram respondidas.',
        )
      }
      continue
    }

    const configuracao = pergunta.configuracao as Record<string, unknown>
    const valido = valorValidoParaTipo(pergunta.tipo, valor, {
      niveis: typeof configuracao.niveis === 'number' ? configuracao.niveis : undefined,
      competenciaIds: competenciaIdsPorPergunta.get(pergunta.id) ?? [],
      opcoesPessoaIds: opcoesPessoaPorPergunta.get(pergunta.id),
    })
    if (!valido) {
      throw new ErroHttp(
        422,
        'RESPOSTA_INCOMPLETA',
        'Uma ou mais respostas têm formato inválido para o tipo de pergunta.',
      )
    }
  }

  await AppDataSource.transaction(async (manager) => {
    if (envio.relacionamentoId) {
      // avaliacao_360: escrita SEMPRE identificada via envio_id (guard rail —
      // nenhuma tentativa de ocultar avaliador_id aqui, ver "Guard rails de
      // anonimização").
      const respostaRepo = manager.getRepository(Resposta)
      const resposta = await respostaRepo.save(respostaRepo.create({ envioId: envio.id }))

      const itemRepo = manager.getRepository(ItemResposta)
      for (const [perguntaId, valor] of itensPorPergunta) {
        await itemRepo.save(
          itemRepo.create({ respostaId: resposta.id, perguntaId, valor: valor as Record<string, unknown> }),
        )
      }

      await manager
        .getRepository(EnvioPesquisa)
        .update({ id: envio.id }, { status: 'concluido', concluidoEm: new Date() })
    } else {
      // clima_geral: anonimato ESTRUTURAL — nenhuma coluna de identidade
      // gravada aqui (ver comentário da entidade RespostaClima).
      const respostaClimaRepo = manager.getRepository(RespostaClima)
      const respostaClima = await respostaClimaRepo.save(
        respostaClimaRepo.create({ pesquisaId: pesquisa.id, cicloId: envio.cicloId! }),
      )

      const itemClimaRepo = manager.getRepository(ItemRespostaClima)
      for (const [perguntaId, valor] of itensPorPergunta) {
        await itemClimaRepo.save(
          itemClimaRepo.create({
            respostaClimaId: respostaClima.id,
            perguntaId,
            valor: valor as Record<string, unknown>,
          }),
        )
      }

      // sessao.cicloParticipanteId é a ÚNICA fonte usada para marcar quem
      // respondeu — NUNCA derivado de algo dentro da resposta em si.
      await manager
        .getRepository(CicloParticipante)
        .update({ id: sessao.cicloParticipanteId! }, { respondeuEm: new Date() })
    }

    // Uso único — impede reenviar com a mesma sessão (os dois fluxos).
    await manager.getRepository(SessaoResposta).update({ id: sessao.id }, { usadaEm: new Date() })
  })

  return { sucesso: true }
}
