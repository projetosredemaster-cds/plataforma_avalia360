import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { paginasPesquisaRouter } from '../paginas-pesquisa/paginas-pesquisa.module'
import {
  atualizarPesquisa,
  atualizarStatusPesquisa,
  buscarPesquisaPorId,
  criarPesquisa,
  duplicarPesquisa,
  listarPesquisas,
  removerPesquisa,
} from './pesquisas.controller'

const router = Router()

router.use(autenticar)

// Sub-router de páginas (que por sua vez monta o de perguntas), path final:
// /api/pesquisas/:pesquisaId/paginas...
router.use('/:pesquisaId/paginas', paginasPesquisaRouter)

router.post('/', asyncHandler(criarPesquisa))
router.get('/', asyncHandler(listarPesquisas))
router.get('/:id', asyncHandler(buscarPesquisaPorId))
router.put('/:id', asyncHandler(atualizarPesquisa))
router.delete('/:id', asyncHandler(removerPesquisa))
router.patch('/:id/status', asyncHandler(atualizarStatusPesquisa))
router.post('/:id/duplicar', asyncHandler(duplicarPesquisa))

export { router as pesquisasRouter }
