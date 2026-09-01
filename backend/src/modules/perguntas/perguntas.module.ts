import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  atualizarPergunta,
  criarPergunta,
  removerPergunta,
  reordenarPerguntas,
} from './perguntas.controller'

// mergeParams: true — path final montado como sub-router de
// paginas-pesquisa, precisa herdar `pesquisaId`/`paginaId` dos routers pais.
const router = Router({ mergeParams: true })

// Montado aqui de novo (mesmo já autenticado pelo router pai) — nenhuma rota
// deste módulo é acessível por `colaborador`, defesa em profundidade
// explícita pedida pelo plano da task.
router.use(autenticar)

router.post('/', asyncHandler(criarPergunta))
router.put('/:id', asyncHandler(atualizarPergunta))
router.delete('/:id', asyncHandler(removerPergunta))
router.patch('/reordenar', asyncHandler(reordenarPerguntas))

export { router as perguntasRouter }
