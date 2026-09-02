import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as ciclosAvaliacaoService from './ciclos-avaliacao.service'

export async function criarCiclo(req: Request, res: Response): Promise<void> {
  const resposta = await ciclosAvaliacaoService.criar(req.colaboradorAutenticado!, req.body)
  res.status(201).json(resposta)
}

export async function listarCiclos(req: Request, res: Response): Promise<void> {
  const resposta = await ciclosAvaliacaoService.listar(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}

export async function buscarCicloPorId(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await ciclosAvaliacaoService.buscarPorId(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}

export async function atualizarCiclo(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await ciclosAvaliacaoService.atualizar(req.colaboradorAutenticado!, id, req.body)
  res.status(200).json(resposta)
}

export async function removerCiclo(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  await ciclosAvaliacaoService.remover(req.colaboradorAutenticado!, id)
  res.status(204).send()
}

export async function atualizarStatusCiclo(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await ciclosAvaliacaoService.atualizarStatus(
    req.colaboradorAutenticado!,
    id,
    req.body,
  )
  res.status(200).json(resposta)
}

export async function listarRelacionamentosCiclo(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await ciclosAvaliacaoService.listarRelacionamentos(
    req.colaboradorAutenticado!,
    id,
  )
  res.status(200).json(resposta)
}
