import type { Request, Response } from 'express'
import * as authService from './auth.service'

export function obterMeuPerfil(req: Request, res: Response): void {
  const resposta = authService.meuPerfil(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}
