import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as coletaRespostasPublicaService from './coleta-respostas-publica.service'

export async function obterStatusEnvioController(req: Request, res: Response): Promise<void> {
  const token = obterParametroRota(req, 'token')
  const resposta = await coletaRespostasPublicaService.obterStatusEnvio(token)
  res.status(200).json(resposta)
}

export async function confirmarCpfController(req: Request, res: Response): Promise<void> {
  const token = obterParametroRota(req, 'token')
  const resposta = await coletaRespostasPublicaService.confirmarCpf(token, req.body ?? {})
  res.status(200).json(resposta)
}

export async function buscarFormularioController(req: Request, res: Response): Promise<void> {
  const sessaoToken = obterParametroRota(req, 'sessaoToken')
  const resposta = await coletaRespostasPublicaService.buscarFormulario(sessaoToken)
  res.status(200).json(resposta)
}

export async function enviarRespostasController(req: Request, res: Response): Promise<void> {
  const sessaoToken = obterParametroRota(req, 'sessaoToken')
  const resposta = await coletaRespostasPublicaService.enviarRespostas(sessaoToken, req.body ?? {})
  res.status(200).json(resposta)
}
