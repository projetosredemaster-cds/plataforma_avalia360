import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as enviosPesquisaService from './envios-pesquisa.service'

export async function listarEnviosCiclo(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const resposta = await enviosPesquisaService.listarPorCiclo(req.colaboradorAutenticado!, cicloId)
  res.status(200).json(resposta)
}

export async function marcarEnvioComoEnviado(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.marcarComoEnviado(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}

export async function registrarLembreteEnvio(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.registrarLembrete(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}

export async function expirarEnvioAcao(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.expirarEnvio(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}

export async function desbloquearTentativasEnvio(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.desbloquearTentativas(
    req.colaboradorAutenticado!,
    cicloId,
    id,
  )
  res.status(200).json(resposta)
}
