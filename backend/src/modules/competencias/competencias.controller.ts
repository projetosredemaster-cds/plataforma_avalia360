import type { Request, Response } from 'express'
import * as competenciasService from './competencias.service'

export async function listarCompetencias(req: Request, res: Response): Promise<void> {
  const resposta = await competenciasService.listar(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}
