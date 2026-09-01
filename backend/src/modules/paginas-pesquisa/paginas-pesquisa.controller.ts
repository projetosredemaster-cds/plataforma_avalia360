import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as paginasPesquisaService from './paginas-pesquisa.service'

export async function criarPagina(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const resposta = await paginasPesquisaService.criar(
    req.colaboradorAutenticado!,
    pesquisaId,
    req.body,
  )
  res.status(201).json(resposta)
}

export async function atualizarPagina(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const id = obterParametroRota(req, 'id')
  const resposta = await paginasPesquisaService.atualizar(
    req.colaboradorAutenticado!,
    pesquisaId,
    id,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function removerPagina(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const id = obterParametroRota(req, 'id')
  await paginasPesquisaService.remover(req.colaboradorAutenticado!, pesquisaId, id)
  res.status(204).send()
}

export async function reordenarPaginas(req: Request, res: Response): Promise<void> {
  const pesquisaId = obterParametroRota(req, 'pesquisaId')
  const resposta = await paginasPesquisaService.reordenar(
    req.colaboradorAutenticado!,
    pesquisaId,
    req.body,
  )
  res.status(200).json(resposta)
}
