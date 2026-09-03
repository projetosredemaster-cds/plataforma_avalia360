import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import {
  buscarFormularioController,
  confirmarCpfController,
  enviarRespostasController,
  obterStatusEnvioController,
} from './coleta-respostas-publica.controller'

// ROTA PÚBLICA — NUNCA chamar `autenticar` aqui. Colaborador comum não tem
// conta no Supabase Auth (só admin/gestor_rh têm, via
// colaboradores.usuario_auth_id); autorização é inteiramente por posse do
// `token`/`sessaoToken` (capability tokens) + CPF, validada manualmente em
// coleta-respostas-publica.service.ts. Mesmo padrão de arquitetura já
// documentado em docs/schema_avaliacao360_pt_v2.sql (comentário sobre RLS).
const router = Router()

router.get('/envios/:token/status', asyncHandler(obterStatusEnvioController))
router.post('/envios/:token/confirmar-cpf', asyncHandler(confirmarCpfController))
router.get('/sessoes/:sessaoToken/formulario', asyncHandler(buscarFormularioController))
router.post('/sessoes/:sessaoToken/respostas', asyncHandler(enviarRespostasController))

export { router as coletaRespostasPublicaRouter }
