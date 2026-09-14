import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, CircularProgress, Tooltip, Typography } from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { StatusPesquisaChip } from '../../components/pesquisas/StatusPesquisaChip/StatusPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { buscarPesquisa } from '../../services/pesquisasService'
import type { Pesquisa } from '../../types/pesquisa'
import { PreviewPagina } from './PreviewPagina'

/**
 * Pré-visualização somente leitura de uma pesquisa já persistida, como ela
 * apareceria para quem responde — sem ciclo, sem link/CPF, sem persistir
 * nada. Único endpoint consumido: `GET /api/pesquisas/:id`
 * (`buscarPesquisa`); a lista de colaboradores da pergunta `pessoa` é
 * sempre fictícia, gerada localmente (`colaboradoresFicticios.ts`), nunca
 * vinda de rede. Acesso restrito a admin/gestor_rh pelo grupo de rota em
 * `App.tsx` — nenhuma checagem de papel adicional aqui.
 */
export function PesquisaPreviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [paginaAtual, setPaginaAtual] = useState(0)

  const carregarPesquisa = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    setErro(null)
    try {
      const dados = await buscarPesquisa(id)
      setPesquisa(dados)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar a pesquisa.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    // Carga inicial da pesquisa via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarPesquisa()
  }, [carregarPesquisa])

  const totalPaginas = pesquisa?.paginas.length ?? 0
  const ultimaPagina = paginaAtual === totalPaginas - 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Typography variant="h5" component="h1">
            {pesquisa ? pesquisa.titulo : 'Pré-visualização'}
          </Typography>
          {pesquisa && <StatusPesquisaChip status={pesquisa.status} />}
        </div>
        <Button variant="outlined" onClick={() => navigate('/pesquisas')}>
          Fechar
        </Button>
      </div>

      <Alert severity="info">
        Modo de pré-visualização — as respostas não são salvas e o botão Enviar está desabilitado.
      </Alert>

      {carregando && (
        <div className="flex justify-center py-12">
          <CircularProgress />
        </div>
      )}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">
            {erro}
          </Typography>
          <Button variant="contained" color="primary" onClick={carregarPesquisa}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!carregando && !erro && pesquisa && pesquisa.paginas.length === 0 && (
        <Typography color="text.secondary">
          Esta pesquisa ainda não tem páginas ou perguntas cadastradas.
        </Typography>
      )}

      {!carregando && !erro && pesquisa && pesquisa.paginas.length > 0 && (
        <div className="flex flex-col gap-6">
          <Typography variant="caption" color="text.secondary">
            Página {paginaAtual + 1} de {totalPaginas}
          </Typography>

          {/* `fieldset disabled` bloqueia nativamente TODO botão/input descendente —
              precisa envolver só as perguntas, nunca a navegação abaixo (Anterior/
              Próxima ficariam inoperantes, mesmo bug que motivou esta correção). */}
          <fieldset disabled className="border-0 p-0 m-0">
            <PreviewPagina pagina={pesquisa.paginas[paginaAtual]} />
          </fieldset>

          <div className="flex justify-between gap-3">
            <Button
              variant="outlined"
              color="primary"
              disabled={paginaAtual === 0}
              onClick={() => setPaginaAtual((atual) => Math.max(0, atual - 1))}
            >
              Anterior
            </Button>

            {ultimaPagina ? (
              <Tooltip title="Envio desabilitado na pré-visualização">
                <span>
                  <Button variant="contained" color="primary" disabled>
                    Enviar
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={() => setPaginaAtual((atual) => Math.min(totalPaginas - 1, atual + 1))}
              >
                Próxima
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
