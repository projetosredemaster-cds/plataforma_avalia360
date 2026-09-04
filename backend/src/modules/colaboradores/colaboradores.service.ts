import type { FindOptionsWhere } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { env } from '../../config/env'
import { garantirPapel } from '../../common/autorizacao'
import { normalizarCpf, validarCpf } from '../../common/cpf'
import {
  CARGO_COLABORADOR_VALORES,
  PAPEL_COLABORADOR_VALORES,
  type CargoColaborador,
  type PapelColaborador,
} from '../../common/enums'
import { ErroHttp } from '../../common/erro-http'
import { validarEmail, validarEnum, validarTextoObrigatorio } from '../../common/validacao'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import type { ColaboradorAutenticado } from '../../types/express'
import { Equipe } from '../equipes/equipe.entity'
import { Colaborador } from './colaborador.entity'
import type { AtualizarColaboradorDto } from './dto/atualizar-colaborador.dto'
import type { AtualizarStatusColaboradorDto } from './dto/atualizar-status-colaborador.dto'
import type { CriarColaboradorDto } from './dto/criar-colaborador.dto'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface ColaboradorResposta {
  id: string
  nomeCompleto: string
  email: string | null
  cpf: string
  papel: PapelColaborador
  cargo: string | null
  ativo: boolean
  ehGestor: boolean
  equipe: { id: string; nome: string } | null
  gestor: { id: string; nomeCompleto: string } | null
  usuarioAuthId: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface ColaboradorRespostaCriacao extends ColaboradorResposta {
  emailDefinicaoSenhaEnviado: boolean | null
}

function repositorio() {
  return AppDataSource.getRepository(Colaborador)
}

function repositorioEquipe() {
  return AppDataSource.getRepository(Equipe)
}

function mapearColaborador(colaborador: Colaborador): ColaboradorResposta {
  return {
    id: colaborador.id,
    nomeCompleto: colaborador.nomeCompleto,
    email: colaborador.email,
    cpf: colaborador.cpf,
    papel: colaborador.papel,
    cargo: colaborador.cargo,
    ativo: colaborador.ativo,
    ehGestor: colaborador.ehGestor,
    equipe: colaborador.equipe ? { id: colaborador.equipe.id, nome: colaborador.equipe.nome } : null,
    gestor: colaborador.gestor
      ? { id: colaborador.gestor.id, nomeCompleto: colaborador.gestor.nomeCompleto }
      : null,
    usuarioAuthId: colaborador.usuarioAuthId,
    criadoEm: colaborador.criadoEm.toISOString(),
    atualizadoEm: colaborador.atualizadoEm.toISOString(),
  }
}

/**
 * Único ponto de decisão de "este papel tem conta no Supabase Auth?" — todo
 * o resto do módulo decide se chama a Auth Admin API consultando esta
 * função, nunca checando `papel` inline em múltiplos lugares. `colaborador`
 * NUNCA retorna true aqui — é a regra dura do projeto.
 */
function deveTerContaAuth(papel: PapelColaborador): boolean {
  return papel === 'admin' || papel === 'gestor_rh'
}

function ehErroEmailJaExistenteNoAuth(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: string | undefined; message?: string | undefined }
  if (code === 'email_exists') return true
  const mensagem = (message ?? '').toLowerCase()
  return mensagem.includes('already been registered') || mensagem.includes('already exists')
}

/**
 * Cria a conta no Supabase Auth para papéis admin/gestor_rh (chamada só a
 * partir de contextos já filtrados por deveTerContaAuth === true). Sem
 * senha — fica indefinida até o colaborador usar o link de definição de
 * senha (resetPasswordForEmail, chamado depois do INSERT confirmado).
 */
async function criarContaAuth(email: string, nomeCompleto: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nome_completo: nomeCompleto },
  })

  if (error || !data.user) {
    if (ehErroEmailJaExistenteNoAuth(error)) {
      throw new ErroHttp(
        409,
        'EMAIL_JA_REGISTRADO_AUTH',
        'Já existe uma conta de autenticação com este e-mail.',
      )
    }
    console.error('[criarContaAuth] falha ao criar usuário no Supabase Auth', error)
    throw new ErroHttp(500, 'ERRO_INTERNO', 'Erro interno do servidor.')
  }

  return data.user.id
}

/** Compensação: remove a conta de auth órfã se o INSERT em `colaboradores` falhar. */
async function compensarContaAuthOrfa(usuarioAuthId: string, erroOriginal: unknown): Promise<never> {
  try {
    await supabaseAdmin.auth.admin.deleteUser(usuarioAuthId)
  } catch (erroCompensacao) {
    console.error(
      '[LIMPEZA_AUTH_PENDENTE] falha ao compensar conta órfã no Supabase Auth',
      usuarioAuthId,
      erroCompensacao,
    )
  }
  console.error('[criarColaborador] falha ao inserir colaborador após criar conta Auth', erroOriginal)
  throw new ErroHttp(500, 'ERRO_INTERNO', 'Erro interno do servidor.')
}

/** Best-effort — não falha o fluxo chamador se o envio falhar. */
async function enviarDefinicaoSenha(email: string): Promise<boolean> {
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.frontendUrl}/definir-senha`,
  })
  if (error) {
    console.error('[enviarDefinicaoSenha] falha ao enviar e-mail de definição de senha', error)
    return false
  }
  return true
}

/** Higiene de segurança no rebaixamento — falha aqui nunca derruba a atualização do colaborador. */
async function removerContaAuthPorRebaixamento(usuarioAuthId: string): Promise<void> {
  try {
    await supabaseAdmin.auth.admin.deleteUser(usuarioAuthId)
  } catch (erro) {
    console.error(
      '[LIMPEZA_AUTH_PENDENTE] falha ao remover conta Auth após rebaixamento a colaborador',
      usuarioAuthId,
      erro,
    )
  }
}

interface CamposValidados {
  nomeCompleto: string
  email: string | null
  papel: PapelColaborador
  cpfDigitos: string
  cargo: CargoColaborador | null
}

function validarCamposObrigatorios(dto: CriarColaboradorDto): CamposValidados {
  const nomeCompleto = validarTextoObrigatorio(dto.nomeCompleto, {
    campo: 'nomeCompleto',
    min: 2,
    max: 255,
  })
  const papel = validarEnum(dto.papel, PAPEL_COLABORADOR_VALORES, 'papel')

  let email: string | null = null
  if (dto.email !== undefined && dto.email !== null && String(dto.email).trim().length > 0) {
    email = validarEmail(dto.email, 'email')
  }

  if (deveTerContaAuth(papel) && email === null) {
    throw new ErroHttp(
      422,
      'EMAIL_OBRIGATORIO_PARA_PAPEL',
      'E-mail é obrigatório para os papéis admin e gestor_rh.',
    )
  }

  const cpfDigitos = normalizarCpf(dto.cpf)
  if (!validarCpf(cpfDigitos)) {
    throw new ErroHttp(422, 'CPF_INVALIDO', 'CPF inválido.')
  }

  const cargo = dto.cargo !== undefined ? validarEnum(dto.cargo, CARGO_COLABORADOR_VALORES, 'cargo') : null

  return { nomeCompleto, email, papel, cpfDigitos, cargo }
}

async function garantirEmailECpfUnicos(
  email: string | null,
  cpfDigitos: string,
  idParaExcluir?: string,
): Promise<void> {
  const existentePorCpf = await repositorio().findOneBy({ cpf: cpfDigitos })
  if (existentePorCpf && existentePorCpf.id !== idParaExcluir) {
    throw new ErroHttp(409, 'CPF_DUPLICADO', 'Já existe um colaborador com este CPF.')
  }

  if (email !== null) {
    const existentePorEmail = await repositorio().findOneBy({ email })
    if (existentePorEmail && existentePorEmail.id !== idParaExcluir) {
      throw new ErroHttp(409, 'EMAIL_DUPLICADO', 'Já existe um colaborador com este e-mail.')
    }
  }
}

async function garantirEquipeExiste(equipeId: string | null | undefined): Promise<void> {
  if (!equipeId) {
    return
  }
  const equipe = await repositorioEquipe().findOneBy({ id: equipeId })
  if (!equipe) {
    throw new ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', 'Equipe não encontrada.')
  }
}

async function garantirGestorValido(
  gestorId: string | null | undefined,
  idProprioRegistro?: string,
): Promise<void> {
  if (!gestorId) {
    return
  }
  if (idProprioRegistro && gestorId === idProprioRegistro) {
    throw new ErroHttp(422, 'GESTOR_INVALIDO', 'Um colaborador não pode ser gestor de si mesmo.')
  }
  const gestor = await repositorio().findOneBy({ id: gestorId })
  if (!gestor) {
    throw new ErroHttp(404, 'GESTOR_NAO_ENCONTRADO', 'Gestor não encontrado.')
  }
}

export async function criar(
  ator: ColaboradorAutenticado,
  dto: CriarColaboradorDto,
): Promise<ColaboradorRespostaCriacao> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const { nomeCompleto, email, papel, cpfDigitos, cargo } = validarCamposObrigatorios(dto)

  await garantirEmailECpfUnicos(email, cpfDigitos)

  if (dto.equipeId !== undefined) {
    await garantirEquipeExiste(dto.equipeId)
  }
  if (dto.gestorId !== undefined) {
    await garantirGestorValido(dto.gestorId)
  }

  if (dto.ehGestor !== undefined && typeof dto.ehGestor !== 'boolean') {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "ehGestor" deve ser booleano.')
  }

  const precisaContaAuth = deveTerContaAuth(papel)

  let usuarioAuthId: string | null = null
  let emailDefinicaoSenhaEnviado: boolean | null = null

  if (precisaContaAuth) {
    // `validarCamposObrigatorios` já garantiu email !== null para papéis
    // que exigem conta Auth — non-null assertion segura aqui.
    usuarioAuthId = await criarContaAuth(email!, nomeCompleto)
  }

  const novoColaborador = repositorio().create({
    nomeCompleto,
    email,
    cpf: cpfDigitos,
    papel,
    cargo,
    equipeId: dto.equipeId ?? null,
    gestorId: dto.gestorId ?? null,
    ehGestor: dto.ehGestor ?? false,
    usuarioAuthId,
    ativo: true,
  })

  let salvo: Colaborador
  try {
    salvo = await repositorio().save(novoColaborador)
  } catch (erro) {
    if (usuarioAuthId) {
      await compensarContaAuthOrfa(usuarioAuthId, erro)
    }
    throw erro
  }

  if (precisaContaAuth) {
    emailDefinicaoSenhaEnviado = await enviarDefinicaoSenha(email!)
  }

  const completo = await repositorio().findOne({
    where: { id: salvo.id },
    relations: { equipe: true, gestor: true },
  })

  return { ...mapearColaborador(completo!), emailDefinicaoSenhaEnviado }
}

export async function listar(
  ator: ColaboradorAutenticado,
  // `boolean | undefined` explícito (não só `?:`) porque `exactOptionalPropertyTypes`
  // exige o tipo exato — o controller monta este objeto a partir de
  // `obterQueryBooleanoOpcional`, que retorna `boolean | undefined`.
  filtros?: { ehGestor?: boolean | undefined; ativo?: boolean | undefined },
): Promise<ColaboradorResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const where: FindOptionsWhere<Colaborador> = {}
  if (filtros?.ehGestor !== undefined) where.ehGestor = filtros.ehGestor
  if (filtros?.ativo !== undefined) where.ativo = filtros.ativo

  const colaboradores = await repositorio().find({
    where,
    relations: { equipe: true, gestor: true },
    order: { criadoEm: 'ASC' },
  })

  return colaboradores.map(mapearColaborador)
}

export async function buscarPorId(
  ator: ColaboradorAutenticado,
  id: string,
): Promise<ColaboradorResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const colaborador = await repositorio().findOne({
    where: { id },
    relations: { equipe: true, gestor: true },
  })

  if (!colaborador) {
    throw new ErroHttp(404, 'COLABORADOR_NAO_ENCONTRADO', 'Colaborador não encontrado.')
  }

  return mapearColaborador(colaborador)
}

export async function atualizar(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarColaboradorDto,
): Promise<ColaboradorResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const colaborador = await repositorio().findOneBy({ id })
  if (!colaborador) {
    throw new ErroHttp(404, 'COLABORADOR_NAO_ENCONTRADO', 'Colaborador não encontrado.')
  }

  if (dto.nomeCompleto !== undefined) {
    colaborador.nomeCompleto = validarTextoObrigatorio(dto.nomeCompleto, {
      campo: 'nomeCompleto',
      min: 2,
      max: 255,
    })
  }

  let emailNovo: string | null = colaborador.email
  if ('email' in dto) {
    emailNovo = dto.email === null ? null : validarEmail(dto.email, 'email')
  }

  let cpfDigitosNovo = colaborador.cpf
  if (dto.cpf !== undefined) {
    cpfDigitosNovo = normalizarCpf(dto.cpf)
    if (!validarCpf(cpfDigitosNovo)) {
      throw new ErroHttp(422, 'CPF_INVALIDO', 'CPF inválido.')
    }
  }

  if (emailNovo !== colaborador.email || cpfDigitosNovo !== colaborador.cpf) {
    await garantirEmailECpfUnicos(emailNovo, cpfDigitosNovo, id)
  }

  if (dto.cargo !== undefined) {
    colaborador.cargo = validarEnum(dto.cargo, CARGO_COLABORADOR_VALORES, 'cargo')
  }

  if (dto.ehGestor !== undefined) {
    if (typeof dto.ehGestor !== 'boolean') {
      throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "ehGestor" deve ser booleano.')
    }
    colaborador.ehGestor = dto.ehGestor
  }

  // Distingue "chave ausente" (não mexe) de "chave presente com null"
  // (limpa o vínculo) — checagem de presença (`in`), nunca `!== undefined`,
  // já que o body chega como JSON não tipado e pode enviar `null` de
  // propósito para desvincular equipe/gestor.
  if ('equipeId' in dto) {
    if (dto.equipeId === null) {
      colaborador.equipeId = null
    } else {
      if (typeof dto.equipeId !== 'string' || dto.equipeId.trim().length === 0) {
        throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "equipeId" deve ser um id válido ou null.')
      }
      await garantirEquipeExiste(dto.equipeId)
      colaborador.equipeId = dto.equipeId
    }
  }

  if ('gestorId' in dto) {
    if (dto.gestorId === null) {
      colaborador.gestorId = null
    } else {
      if (typeof dto.gestorId !== 'string' || dto.gestorId.trim().length === 0) {
        throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "gestorId" deve ser um id válido ou null.')
      }
      await garantirGestorValido(dto.gestorId, id)
      colaborador.gestorId = dto.gestorId
    }
  }

  const papelAtual = colaborador.papel
  const papelNovo = dto.papel !== undefined ? validarEnum(dto.papel, PAPEL_COLABORADOR_VALORES, 'papel') : papelAtual

  if (deveTerContaAuth(papelNovo) && emailNovo === null) {
    throw new ErroHttp(
      422,
      'EMAIL_OBRIGATORIO_PARA_PAPEL',
      'E-mail é obrigatório para os papéis admin e gestor_rh.',
    )
  }

  const contaAtualExiste = colaborador.usuarioAuthId !== null
  const contaNovaNecessaria = deveTerContaAuth(papelNovo)

  colaborador.email = emailNovo
  colaborador.cpf = cpfDigitosNovo

  // Promoção: colaborador (sem conta) -> admin/gestor_rh (passa a precisar de conta).
  if (!contaAtualExiste && contaNovaNecessaria) {
    // A checagem `deveTerContaAuth(papelNovo) && emailNovo === null` acima já
    // garantiu email !== null neste ramo — non-null assertion segura.
    const novoUsuarioAuthId = await criarContaAuth(colaborador.email!, colaborador.nomeCompleto)
    colaborador.papel = papelNovo
    colaborador.usuarioAuthId = novoUsuarioAuthId

    let salvo: Colaborador
    try {
      salvo = await repositorio().save(colaborador)
    } catch (erro) {
      await compensarContaAuthOrfa(novoUsuarioAuthId, erro)
      throw erro
    }
    await enviarDefinicaoSenha(colaborador.email!)

    const completo = await repositorio().findOne({
      where: { id: salvo.id },
      relations: { equipe: true, gestor: true },
    })
    return mapearColaborador(completo!)
  }

  // Rebaixamento: admin/gestor_rh (com conta) -> colaborador (não pode ter conta).
  if (contaAtualExiste && !contaNovaNecessaria) {
    const usuarioAuthIdAntigo = colaborador.usuarioAuthId!
    colaborador.papel = 'colaborador'
    colaborador.usuarioAuthId = null

    const salvo = await repositorio().save(colaborador)

    // Best-effort: se falhar, a linha em `colaboradores` já é a fonte de
    // verdade e permanece salva; log fica para tratamento manual.
    await removerContaAuthPorRebaixamento(usuarioAuthIdAntigo)

    const completo = await repositorio().findOne({
      where: { id: salvo.id },
      relations: { equipe: true, gestor: true },
    })
    return mapearColaborador(completo!)
  }

  // Troca lateral (admin <-> gestor_rh, ambos já com conta) ou papel
  // inalterado: nenhuma chamada à Auth API, só atualiza a coluna `papel`.
  colaborador.papel = papelNovo

  const salvo = await repositorio().save(colaborador)

  const completo = await repositorio().findOne({
    where: { id: salvo.id },
    relations: { equipe: true, gestor: true },
  })
  return mapearColaborador(completo!)
}

export async function atualizarStatus(
  ator: ColaboradorAutenticado,
  id: string,
  dto: AtualizarStatusColaboradorDto,
): Promise<ColaboradorResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  const colaborador = await repositorio().findOneBy({ id })
  if (!colaborador) {
    throw new ErroHttp(404, 'COLABORADOR_NAO_ENCONTRADO', 'Colaborador não encontrado.')
  }

  if (typeof dto.ativo !== 'boolean') {
    throw new ErroHttp(422, 'CAMPO_INVALIDO', 'Campo "ativo" é obrigatório e deve ser booleano.')
  }

  // Não dispara nenhuma chamada à Supabase Auth: a conta continua existindo
  // mesmo com ativo = false — quem bloqueia o acesso é o middleware
  // `autenticar`, que exige ativo = true.
  colaborador.ativo = dto.ativo

  const salvo = await repositorio().save(colaborador)

  const completo = await repositorio().findOne({
    where: { id: salvo.id },
    relations: { equipe: true, gestor: true },
  })
  return mapearColaborador(completo!)
}
