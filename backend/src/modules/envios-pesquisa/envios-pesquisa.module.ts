import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  expirarEnvioAcao,
  listarEnviosCiclo,
  marcarEnvioComoEnviado,
  registrarLembreteEnvio,
} from './envios-pesquisa.controller'

// mergeParams: true — path final montado como sub-router de ciclos-avaliacao,
// precisa herdar `cicloId` do router pai.
const router = Router({ mergeParams: true })

// Montado aqui de novo (mesmo já autenticado pelo router pai) — nenhuma rota
// deste módulo é acessível por `colaborador`, defesa em profundidade
// explícita, mesmo padrão de `ciclo-participantes`/`perguntas`.
router.use(autenticar)

router.get('/', asyncHandler(listarEnviosCiclo))
router.patch('/:id/marcar-enviado', asyncHandler(marcarEnvioComoEnviado))
router.patch('/:id/registrar-lembrete', asyncHandler(registrarLembreteEnvio))
router.patch('/:id/expirar', asyncHandler(expirarEnvioAcao))

export { router as enviosPesquisaRouter }
