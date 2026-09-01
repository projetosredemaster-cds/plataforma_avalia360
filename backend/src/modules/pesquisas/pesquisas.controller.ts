import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as pesquisasService from './pesquisas.service'

export async function criarPesquisa(req: Request, res: Response): Promise<void> {
  const resposta = await pesquisasService.criar(req.colaboradorAutenticado!, req.body)
  res.status(201).json(resposta)
}

export async function listarPesquisas(req: Request, res: Response): Promise<void> {
  const resposta = await pesquisasService.listar(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}

export async function buscarPesquisaPorId(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.buscarPorId(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}

export async function atualizarPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.atualizar(req.colaboradorAutenticado!, id, req.body)
  res.status(200).json(resposta)
}

export async function removerPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  await pesquisasService.remover(req.colaboradorAutenticado!, id)
  res.status(204).send()
}

export async function atualizarStatusPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.atualizarStatus(
    req.colaboradorAutenticado!,
    id,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function duplicarPesquisa(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await pesquisasService.duplicar(req.colaboradorAutenticado!, id)
  res.status(201).json(resposta)
}
