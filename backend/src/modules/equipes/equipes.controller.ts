import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as equipesService from './equipes.service'

export async function criarEquipe(req: Request, res: Response): Promise<void> {
  const resposta = await equipesService.criar(req.colaboradorAutenticado!, req.body)
  res.status(201).json(resposta)
}

export async function listarEquipes(req: Request, res: Response): Promise<void> {
  const resposta = await equipesService.listar(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}

export async function buscarEquipePorId(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await equipesService.buscarPorId(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}

export async function atualizarEquipe(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await equipesService.atualizar(req.colaboradorAutenticado!, id, req.body)
  res.status(200).json(resposta)
}

export async function removerEquipe(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  await equipesService.remover(req.colaboradorAutenticado!, id)
  res.status(204).send()
}
