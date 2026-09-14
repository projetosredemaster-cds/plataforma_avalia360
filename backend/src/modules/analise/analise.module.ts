import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  buscarVisaoGeralAnalise,
  buscarAvaliacoesAnalise,
  buscarRankingAnalise,
  buscarNuvemPalavrasAnalise,
  buscarResultadosPerguntaAnalise,
} from './analise.controller'

const router = Router()

router.use(autenticar)

router.get('/visao-geral', asyncHandler(buscarVisaoGeralAnalise))
router.get('/avaliacoes', asyncHandler(buscarAvaliacoesAnalise))
router.get('/ranking', asyncHandler(buscarRankingAnalise))
router.get('/nuvem-palavras', asyncHandler(buscarNuvemPalavrasAnalise))
router.get('/resultados-pergunta', asyncHandler(buscarResultadosPerguntaAnalise))

export { router as analiseRouter }
