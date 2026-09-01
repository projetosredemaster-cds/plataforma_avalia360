import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { perguntasRouter } from '../perguntas/perguntas.module'
import {
  atualizarPagina,
  criarPagina,
  removerPagina,
  reordenarPaginas,
} from './paginas-pesquisa.controller'

// mergeParams: true — path final montado como sub-router de pesquisas,
// precisa herdar `pesquisaId` do router pai.
const router = Router({ mergeParams: true })

// Montado aqui de novo (mesmo já autenticado pelo router pai) — nenhuma rota
// deste módulo é acessível por `colaborador`, defesa em profundidade
// explícita pedida pelo plano da task.
router.use(autenticar)

router.post('/', asyncHandler(criarPagina))
router.put('/:id', asyncHandler(atualizarPagina))
router.delete('/:id', asyncHandler(removerPagina))
router.patch('/reordenar', asyncHandler(reordenarPaginas))

// Sub-router de perguntas, path final:
// /api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas...
router.use('/:paginaId/perguntas', perguntasRouter)

export { router as paginasPesquisaRouter }
