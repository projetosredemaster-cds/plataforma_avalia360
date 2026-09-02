import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as cicloParticipantesService from './ciclo-participantes.service'

export async function listarParticipantes(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const resposta = await cicloParticipantesService.listar(req.colaboradorAutenticado!, cicloId)
  res.status(200).json(resposta)
}

export async function adicionarParticipantesIndividual(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const resposta = await cicloParticipantesService.adicionarIndividual(
    req.colaboradorAutenticado!,
    cicloId,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function adicionarParticipantesPorEquipe(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const resposta = await cicloParticipantesService.adicionarPorEquipe(
    req.colaboradorAutenticado!,
    cicloId,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function removerParticipante(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const colaboradorId = obterParametroRota(req, 'colaboradorId')
  await cicloParticipantesService.remover(req.colaboradorAutenticado!, cicloId, colaboradorId)
  res.status(204).send()
}
