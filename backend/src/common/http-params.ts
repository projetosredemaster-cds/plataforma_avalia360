import type { Request } from 'express'
import { ErroHttp } from './erro-http'

/**
 * Lê um parâmetro de rota (`req.params[nome]`) validando que é uma string
 * simples e não vazia — os tipos do Express 5 permitem `string | string[]`
 * (rotas com parâmetros repetidos), o que não se aplica a nenhuma rota
 * desta API (`/:id`).
 */
export function obterParametroRota(req: Request, nome: string): string {
  const valor = req.params[nome]
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new ErroHttp(400, 'PARAMETRO_INVALIDO', `Parâmetro de rota "${nome}" inválido.`)
  }
  return valor
}

/**
 * Lê um filtro booleano opcional de query string (`req.query[nome]`).
 * Ausente → undefined (sem filtro). Presente → precisa ser exatamente
 * "true" ou "false", senão 400.
 */
export function obterQueryBooleanoOpcional(req: Request, nome: string): boolean | undefined {
  const valor = req.query[nome]
  if (valor === undefined) return undefined
  if (valor === 'true') return true
  if (valor === 'false') return false
  throw new ErroHttp(400, 'PARAMETRO_INVALIDO', `Parâmetro de consulta "${nome}" deve ser "true" ou "false".`)
}
