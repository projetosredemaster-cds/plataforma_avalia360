import type { Request, Response } from 'express'
import * as analiseService from './analise.service'
import * as analiseAvaliacoesService from './analise-avaliacoes.service'

export async function buscarVisaoGeralAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseService.buscarVisaoGeral(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}

export async function buscarAvaliacoesAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseAvaliacoesService.buscarAvaliacoes(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}
