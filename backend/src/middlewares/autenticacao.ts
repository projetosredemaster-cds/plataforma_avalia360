import type { NextFunction, Request, Response } from 'express'
import { AppDataSource } from '../data-source'
import { ErroHttp } from '../common/erro-http'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { Colaborador } from '../modules/colaboradores/colaborador.entity'

/**
 * Middleware aplicado apenas nos routers de `equipes` e `colaboradores`
 * (router.use(autenticar) dentro de cada *.module.ts) — nunca montado
 * globalmente em app.ts. O fluxo público de resposta a pesquisa (link + CPF,
 * sem login) é de outra task e não deve reutilizar este middleware.
 */
export async function autenticar(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cabecalho = req.headers.authorization

  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    next(new ErroHttp(401, 'TOKEN_AUSENTE', 'Autenticação necessária.'))
    return
  }

  const token = cabecalho.slice('Bearer '.length).trim()

  if (!token) {
    next(new ErroHttp(401, 'TOKEN_AUSENTE', 'Autenticação necessária.'))
    return
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data.user) {
    next(new ErroHttp(401, 'TOKEN_INVALIDO', 'Sessão inválida ou expirada.'))
    return
  }

  const colaboradorRepositorio = AppDataSource.getRepository(Colaborador)

  // Defesa em profundidade: inativar (ativo = false) um admin/gestor_rh
  // bloqueia o acesso dele à API imediatamente, mesmo com a sessão Supabase
  // ainda tecnicamente válida — comportamento esperado.
  const colaborador = await colaboradorRepositorio.findOne({
    where: { usuarioAuthId: data.user.id, ativo: true },
  })

  if (!colaborador) {
    next(new ErroHttp(403, 'COLABORADOR_NAO_VINCULADO', 'Usuário sem colaborador ativo vinculado.'))
    return
  }

  req.colaboradorAutenticado = {
    id: colaborador.id,
    papel: colaborador.papel,
    nomeCompleto: colaborador.nomeCompleto,
    email: colaborador.email,
  }

  next()
}
