import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import { buscarVisaoGeralAnalise, buscarAvaliacoesAnalise, buscarRankingAnalise } from './analise.controller'

const router = Router()

router.use(autenticar)

router.get('/visao-geral', asyncHandler(buscarVisaoGeralAnalise))
router.get('/avaliacoes', asyncHandler(buscarAvaliacoesAnalise))
router.get('/ranking', asyncHandler(buscarRankingAnalise))

export { router as analiseRouter }
