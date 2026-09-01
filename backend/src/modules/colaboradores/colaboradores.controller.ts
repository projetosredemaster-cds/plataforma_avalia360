import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as colaboradoresService from './colaboradores.service'

export async function criarColaborador(req: Request, res: Response): Promise<void> {
  const resposta = await colaboradoresService.criar(req.colaboradorAutenticado!, req.body)
  res.status(201).json(resposta)
}

export async function listarColaboradores(req: Request, res: Response): Promise<void> {
  const resposta = await colaboradoresService.listar(req.colaboradorAutenticado!)
  res.status(200).json(resposta)
}

export async function buscarColaboradorPorId(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await colaboradoresService.buscarPorId(req.colaboradorAutenticado!, id)
  res.status(200).json(resposta)
}

export async function atualizarColaborador(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await colaboradoresService.atualizar(req.colaboradorAutenticado!, id, req.body)
  res.status(200).json(resposta)
}

export async function atualizarStatusColaborador(req: Request, res: Response): Promise<void> {
  const id = obterParametroRota(req, 'id')
  const resposta = await colaboradoresService.atualizarStatus(
    req.colaboradorAutenticado!,
    id,
    req.body,
  )
  res.status(200).json(resposta)
}
