import type { NextFunction, Request, Response } from 'express'
import { ErroHttp } from '../common/erro-http'

interface ErroPostgres extends Error {
  code?: string
  constraint?: string
}

const MAPA_CONSTRAINT_PARA_CODIGO: Record<string, string> = {
  uq_colaboradores_cpf: 'CPF_DUPLICADO',
  uq_colaboradores_email: 'EMAIL_DUPLICADO',
  uq_colaboradores_usuario_auth_id: 'USUARIO_AUTH_DUPLICADO',
  uq_competencias_nome: 'COMPETENCIA_NOME_DUPLICADO',
  uq_paginas_pesquisa_pesquisa_ordem: 'PAGINA_ORDEM_DUPLICADA',
  uq_perguntas_pagina_ordem: 'PERGUNTA_ORDEM_DUPLICADA',
  uq_ciclo_participantes_ciclo_colaborador: 'CICLO_PARTICIPANTE_DUPLICADO',
}

/** Middleware de erro (4 args) — precisa ser o último app.use em app.ts. */
export function tratadorErros(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ErroHttp) {
    res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } })
    return
  }

  const erroPostgres = err as ErroPostgres
  if (erroPostgres && erroPostgres.code === '23505') {
    const codigo = erroPostgres.constraint
      ? MAPA_CONSTRAINT_PARA_CODIGO[erroPostgres.constraint]
      : undefined

    if (codigo) {
      res.status(409).json({ erro: { codigo, mensagem: 'Registro duplicado.' } })
      return
    }
  }

  // Nunca vazar stack/mensagem crua ao cliente — só logar no servidor.
  console.error(err)
  res.status(500).json({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' } })
}
