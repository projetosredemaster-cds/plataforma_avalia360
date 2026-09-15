import type { Request, Response } from 'express'
import * as analiseService from './analise.service'
import * as analiseAvaliacoesService from './analise-avaliacoes.service'
import * as analiseRankingService from './analise-ranking.service'
import * as analiseNuvemPalavrasService from './analise-nuvem-palavras.service'
import * as analiseResultadosPerguntaService from './analise-resultados-pergunta.service'
import * as analiseEnviosService from './analise-envios.service'

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

export async function buscarRankingAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseRankingService.buscarRanking(req.colaboradorAutenticado!, {
    cicloId: req.query.cicloId,
    modo: req.query.modo,
    cargo: req.query.cargo,
    equipeId: req.query.equipeId,
    ordenarPor: req.query.ordenarPor,
    ordem: req.query.ordem,
  })
  res.status(200).json(resposta)
}

export async function buscarNuvemPalavrasAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseNuvemPalavrasService.buscarNuvemPalavras(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}

export async function buscarResultadosPerguntaAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseResultadosPerguntaService.buscarResultadosPergunta(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}

export async function buscarEnviosAnalise(req: Request, res: Response): Promise<void> {
  const resposta = await analiseEnviosService.buscarEnviosAnalise(req.colaboradorAutenticado!, {
    de: req.query.de,
    ate: req.query.ate,
    cicloId: req.query.cicloId,
  })
  res.status(200).json(resposta)
}
