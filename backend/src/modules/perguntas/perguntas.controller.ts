import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as perguntasService from './perguntas.service'

export async function criarPergunta(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const paginaId = obterParametroRota(req, 'paginaId')
  const resposta = await perguntasService.criar(
    req.colaboradorAutenticado!,
    pesquisaId,
    paginaId,
    req.body,
  )
  res.status(201).json(resposta)
}

export async function atualizarPergunta(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const paginaId = obterParametroRota(req, 'paginaId')
  const id = obterParametroRota(req, 'id')
  const resposta = await perguntasService.atualizar(
    req.colaboradorAutenticado!,
    pesquisaId,
    paginaId,
    id,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function removerPergunta(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const paginaId = obterParametroRota(req, 'paginaId')
  const id = obterParametroRota(req, 'id')
  await perguntasService.remover(req.colaboradorAutenticado!, pesquisaId, paginaId, id)
  res.status(204).send()
}

export async function reordenarPerguntas(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const paginaId = obterParametroRota(req, 'paginaId')
  const resposta = await perguntasService.reordenar(
    req.colaboradorAutenticado!,
    pesquisaId,
    paginaId,
    req.body,
  )
  res.status(200).json(resposta)
}
