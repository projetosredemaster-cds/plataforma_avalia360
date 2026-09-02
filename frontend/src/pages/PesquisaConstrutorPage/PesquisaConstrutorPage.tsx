import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, CardContent, CircularProgress, MenuItem, Snackbar, TextField, Typography } from '@mui/material'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { StatusPesquisaChip } from '../../components/pesquisas/StatusPesquisaChip/StatusPesquisaChip'
import { TipoPesquisaChip } from '../../components/pesquisas/TipoPesquisaChip/TipoPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { listarCompetencias } from '../../services/competenciasService'
import { criarPagina, reordenarPaginas } from '../../services/paginasService'
import { atualizarPesquisa, atualizarStatusPesquisa, buscarPesquisa, criarPesquisa } from '../../services/pesquisasService'
import type { Competencia } from '../../types/competencia'
import type { Pagina, Pesquisa, TipoPesquisa } from '../../types/pesquisa'
import { PaginaEditor } from './PaginaEditor'

interface LocationState {
  pesquisaInicial?: Pesquisa
}

/**
 * Usada em `/pesquisas/nova` (sem `id`, modo criação) e
 * `/pesquisas/:id/editar` (modo edição — carrega detalhe + competências e
 * gerencia páginas/perguntas com persistência granular).
 */
export function PesquisaConstrutorPage() {
  const { id } = useParams<{ id: string }>()
  const isEdicao = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()

  // --- Modo criação ---
  const [tituloCriacao, setTituloCriacao] = useState('')
  const [mensagemCriacao, setMensagemCriacao] = useState('')
  const [tipoCriacao, setTipoCriacao] = useState<TipoPesquisa>('avaliacao_360')
  const [criando, setCriando] = useState(false)
  const [erroCriacao, setErroCriacao] = useState<string | null>(null)

  // --- Modo edição ---
  const [pesquisa, setPesquisa] = useState<Pesquisa | null>(null)
  const [competencias, setCompetencias] = useState<Competencia[]>([])
  const [carregandoInicial, setCarregandoInicial] = useState(isEdicao)
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  const [tituloHeader, setTituloHeader] = useState('')
  const [mensagemHeader, setMensagemHeader] = useState('')
  const [salvandoHeader, setSalvandoHeader] = useState(false)
  const [erroHeader, setErroHeader] = useState<string | null>(null)

  const [erroPaginas, setErroPaginas] = useState<string | null>(null)
  const [criandoPagina, setCriandoPagina] = useState(false)

  const [publicando, setPublicando] = useState(false)
  const [erroPublicar, setErroPublicar] = useState<string | null>(null)

  const [snackbar, setSnackbar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregandoInicial(true)
    setErroCarregamento(null)
    try {
      const state = location.state as LocationState | null
      const [dadosPesquisa, dadosCompetencias] = await Promise.all([
        state?.pesquisaInicial && state.pesquisaInicial.id === id
          ? Promise.resolve(state.pesquisaInicial)
          : buscarPesquisa(id),
        listarCompetencias(),
      ])
      setPesquisa(dadosPesquisa)
      setTituloHeader(dadosPesquisa.titulo)
      setMensagemHeader(dadosPesquisa.mensagemBoasVindas ?? '')
      setCompetencias(dadosCompetencias)
      if (state?.pesquisaInicial) {
        navigate(location.pathname, { replace: true, state: null })
      }
    } catch (err) {
      setErroCarregamento(err instanceof ApiError ? err.message : 'Não foi possível carregar a pesquisa.')
    } finally {
      setCarregandoInicial(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (isEdicao) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      carregar()
    }
  }, [isEdicao, carregar])

  const somenteLeitura = pesquisa ? pesquisa.status !== 'rascunho' : false

  async function handleCriar() {
    setErroCriacao(null)
    if (tituloCriacao.trim().length < 2) {
      setErroCriacao('Informe um título com pelo menos 2 caracteres.')
      return
    }
    setCriando(true)
    try {
      const nova = await criarPesquisa({
        titulo: tituloCriacao.trim(),
        mensagemBoasVindas: mensagemCriacao.trim() || undefined,
        tipo: tipoCriacao,
      })
      navigate(`/pesquisas/${nova.id}/editar`, { replace: true, state: { pesquisaInicial: nova } })
    } catch (err) {
      setErroCriacao(err instanceof ApiError ? err.message : 'Não foi possível criar a pesquisa.')
    } finally {
      setCriando(false)
    }
  }

  async function handleSalvarHeader() {
    if (!pesquisa) return
    setErroHeader(null)
    if (tituloHeader.trim().length < 2) {
      setErroHeader('Informe um título com pelo menos 2 caracteres.')
      return
    }
    setSalvandoHeader(true)
    try {
      const atualizada = await atualizarPesquisa(pesquisa.id, {
        titulo: tituloHeader.trim(),
        // `null` explícito (não `undefined`) quando o usuário esvaziou o
        // campo — o PUT distingue "chave ausente" (não alterar) de "chave
        // presente com null" (limpar), mesmo padrão de `cicloId` no backend.
        mensagemBoasVindas: mensagemHeader.trim() || null,
      })
      setPesquisa((prev) => (prev ? { ...prev, ...atualizada, paginas: prev.paginas } : prev))
      setSnackbar('Alterações salvas com sucesso.')
    } catch (err) {
      setErroHeader(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.')
    } finally {
      setSalvandoHeader(false)
    }
  }

  function atualizarPaginaLocal(paginaAtualizada: Pagina) {
    setPesquisa((prev) =>
      prev
        ? { ...prev, paginas: prev.paginas.map((p) => (p.id === paginaAtualizada.id ? paginaAtualizada : p)) }
        : prev,
    )
  }

  function removerPaginaLocal(paginaId: string) {
    setPesquisa((prev) => (prev ? { ...prev, paginas: prev.paginas.filter((p) => p.id !== paginaId) } : prev))
  }

  async function handleAdicionarPagina() {
    if (!pesquisa) return
    setCriandoPagina(true)
    setErroPaginas(null)
    try {
      const novaPagina = await criarPagina(pesquisa.id, {})
      setPesquisa((prev) => (prev ? { ...prev, paginas: [...prev.paginas, novaPagina] } : prev))
    } catch (err) {
      setErroPaginas(err instanceof ApiError ? err.message : 'Não foi possível adicionar a página.')
    } finally {
      setCriandoPagina(false)
    }
  }

  async function handleMoverPagina(paginaId: string, direcao: 'cima' | 'baixo') {
    if (!pesquisa) return
    const ordenadas = [...pesquisa.paginas].sort((a, b) => a.ordem - b.ordem)
    const indice = ordenadas.findIndex((p) => p.id === paginaId)
    const alvo = direcao === 'cima' ? indice - 1 : indice + 1
    if (indice < 0 || alvo < 0 || alvo >= ordenadas.length) return
    const copia = [...ordenadas]
    ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
    const itens = copia.map((p, i) => ({ id: p.id, ordem: i + 1 }))
    setErroPaginas(null)
    try {
      await reordenarPaginas(pesquisa.id, itens)
      const mapaOrdem = new Map(itens.map((item) => [item.id, item.ordem]))
      setPesquisa((prev) =>
        prev
          ? {
              ...prev,
              paginas: prev.paginas
                .map((p) => ({ ...p, ordem: mapaOrdem.get(p.id) ?? p.ordem }))
                .sort((a, b) => a.ordem - b.ordem),
            }
          : prev,
      )
    } catch (err) {
      setErroPaginas(err instanceof ApiError ? err.message : 'Não foi possível reordenar as páginas.')
    }
  }

  const podePublicar = useMemo(
    () => Boolean(pesquisa) && (pesquisa?.paginas.some((p) => p.perguntas.length > 0) ?? false),
    [pesquisa],
  )

  async function handlePublicar() {
    if (!pesquisa) return
    setErroPublicar(null)
    setPublicando(true)
    try {
      const atualizada = await atualizarStatusPesquisa(pesquisa.id, 'publicada')
      setPesquisa((prev) => (prev ? { ...prev, status: atualizada.status } : prev))
      setSnackbar('Pesquisa publicada com sucesso.')
    } catch (err) {
      setErroPublicar(err instanceof ApiError ? err.message : 'Não foi possível publicar a pesquisa.')
    } finally {
      setPublicando(false)
    }
  }

  // ---------- Modo criação ----------
  if (!isEdicao) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Typography variant="h5" component="h1">
          Nova pesquisa
        </Typography>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <TextField
              label="Título"
              value={tituloCriacao}
              onChange={(e) => setTituloCriacao(e.target.value)}
              disabled={criando}
              required
              fullWidth
            />
            <TextField
              select
              label="Tipo de pesquisa"
              value={tipoCriacao}
              onChange={(e) => setTipoCriacao(e.target.value as TipoPesquisa)}
              disabled={criando}
              helperText="Não pode ser alterado depois de criada."
              required
              fullWidth
            >
              <MenuItem value="avaliacao_360">Avaliação 360</MenuItem>
              <MenuItem value="clima_geral">Clima e Satisfação</MenuItem>
            </TextField>
            <TextField
              label="Mensagem de boas-vindas"
              value={mensagemCriacao}
              onChange={(e) => setMensagemCriacao(e.target.value)}
              disabled={criando}
              multiline
              minRows={3}
              fullWidth
            />
            {erroCriacao && (
              <Alert severity="error" role="alert">
                {erroCriacao}
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => navigate('/pesquisas')} disabled={criando}>
                Cancelar
              </Button>
              <Button variant="contained" color="primary" onClick={handleCriar} disabled={criando}>
                {criando ? 'Salvando...' : 'Salvar rascunho'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------- Modo edição ----------
  if (carregandoInicial) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (erroCarregamento || !pesquisa) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Typography role="alert" color="error">
          {erroCarregamento ?? 'Não foi possível carregar a pesquisa.'}
        </Typography>
        <Button variant="contained" color="primary" onClick={carregar}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  const paginasOrdenadas = [...pesquisa.paginas].sort((a, b) => a.ordem - b.ordem)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Typography variant="h5" component="h1">
            {pesquisa.titulo}
          </Typography>
          <StatusPesquisaChip status={pesquisa.status} />
          <TipoPesquisaChip tipo={pesquisa.tipo} />
        </div>
        {pesquisa.status === 'rascunho' && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="contained" color="primary" onClick={handlePublicar} disabled={publicando || !podePublicar}>
              {publicando ? 'Publicando...' : 'Publicar'}
            </Button>
            {!podePublicar && (
              <Typography variant="caption" color="text.secondary">
                Adicione ao menos 1 página com 1 pergunta para publicar.
              </Typography>
            )}
          </div>
        )}
      </div>

      {somenteLeitura && (
        <Alert severity="info">
          Esta pesquisa está {pesquisa.status === 'publicada' ? 'publicada' : 'encerrada'}. Não é possível editar sua
          estrutura.
        </Alert>
      )}

      {erroPublicar && (
        <Alert severity="error" role="alert">
          {erroPublicar}
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Typography variant="subtitle1">Cabeçalho</Typography>
          <TextField
            label="Título"
            value={tituloHeader}
            onChange={(e) => setTituloHeader(e.target.value)}
            disabled={somenteLeitura || salvandoHeader}
            required
            fullWidth
          />
          <TextField
            label="Mensagem de boas-vindas"
            value={mensagemHeader}
            onChange={(e) => setMensagemHeader(e.target.value)}
            disabled={somenteLeitura || salvandoHeader}
            multiline
            minRows={3}
            fullWidth
          />
          {erroHeader && (
            <Alert severity="error" role="alert">
              {erroHeader}
            </Alert>
          )}
          {!somenteLeitura && (
            <div className="flex justify-end">
              <Button variant="contained" color="primary" onClick={handleSalvarHeader} disabled={salvandoHeader}>
                {salvandoHeader ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1">Páginas</Typography>

      {erroPaginas && (
        <Alert severity="error" role="alert">
          {erroPaginas}
        </Alert>
      )}

      {paginasOrdenadas.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nenhuma página ainda. Adicione a primeira.
        </Typography>
      )}

      {paginasOrdenadas.map((pagina, indice) => (
        <PaginaEditor
          key={pagina.id}
          pesquisaId={pesquisa.id}
          pagina={pagina}
          tipoPesquisa={pesquisa.tipo}
          competencias={competencias}
          somenteLeitura={somenteLeitura}
          podeMoverCima={indice > 0}
          podeMoverBaixo={indice < paginasOrdenadas.length - 1}
          onMoverCima={() => handleMoverPagina(pagina.id, 'cima')}
          onMoverBaixo={() => handleMoverPagina(pagina.id, 'baixo')}
          onAtualizada={atualizarPaginaLocal}
          onRemovida={() => removerPaginaLocal(pagina.id)}
          onErro={(mensagem) => setErroPaginas(mensagem)}
        />
      ))}

      {!somenteLeitura && (
        <div>
          <Button variant="outlined" onClick={handleAdicionarPagina} disabled={criandoPagina}>
            {criandoPagina ? 'Adicionando...' : 'Adicionar página'}
          </Button>
        </div>
      )}

      {snackbar && (
        <Snackbar open autoHideDuration={4000} onClose={() => setSnackbar(null)}>
          <Alert severity="success" onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
            {snackbar}
          </Alert>
        </Snackbar>
      )}
    </div>
  )
}
