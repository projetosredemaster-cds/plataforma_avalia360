import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { TabelaEstado } from '../../components/TabelaEstado/TabelaEstado'
import { StatusCicloChip } from '../../components/ciclos/StatusCicloChip/StatusCicloChip'
import { ROTULOS_TIPO_RELACIONAMENTO } from '../../components/ciclos/rotulosTipoRelacionamento'
import { StatusPesquisaChip } from '../../components/pesquisas/StatusPesquisaChip/StatusPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { listarColaboradores } from '../../services/colaboradoresService'
import { listarEquipes } from '../../services/equipesService'
import { atualizarStatusCiclo, buscarCiclo, listarRelacionamentos } from '../../services/ciclosService'
import {
  adicionarParticipantesIndividual,
  adicionarParticipantesPorEquipe,
  listarParticipantes,
  removerParticipante,
} from '../../services/participantesCicloService'
import { atualizarPesquisa, listarPesquisas } from '../../services/pesquisasService'
import type { Colaborador, Equipe } from '../../types/colaborador'
import type { Ciclo, Participante, Relacionamento } from '../../types/ciclo'
import type { PesquisaResumo } from '../../types/pesquisa'
import { CicloDadosForm } from './CicloDadosForm'

const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR')
const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** `'YYYY-MM-DD'`/ISO tratado como data local (nunca `new Date(data)` puro, que pode deslocar um dia por fuso). */
function formatarData(data: string): string {
  return FORMATADOR_DATA.format(new Date(`${data}T00:00:00`))
}

/**
 * Tela central do motor de ciclos: dados do ciclo (editáveis só em
 * rascunho), participantes, pesquisa vinculada, ativação/encerramento e,
 * quando o ciclo já saiu de rascunho, a tabela de relacionamentos gerados
 * (dado IDENTIFICADO de quem avalia quem — nunca extraída daqui, ver
 * `types/ciclo.ts`).
 */
export function CicloDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [ciclo, setCiclo] = useState<Ciclo | null>(null)
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [pesquisas, setPesquisas] = useState<PesquisaResumo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])

  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  const [relacionamentos, setRelacionamentos] = useState<Relacionamento[]>([])
  const [carregandoRelacionamentos, setCarregandoRelacionamentos] = useState(false)
  const [erroRelacionamentos, setErroRelacionamentos] = useState<string | null>(null)

  const [selecionadosIndividual, setSelecionadosIndividual] = useState<Colaborador[]>([])
  const [adicionandoIndividual, setAdicionandoIndividual] = useState(false)
  const [erroAdicionarIndividual, setErroAdicionarIndividual] = useState<string | null>(null)

  const [equipeSelecionada, setEquipeSelecionada] = useState('')
  const [adicionandoEquipe, setAdicionandoEquipe] = useState(false)
  const [erroAdicionarEquipe, setErroAdicionarEquipe] = useState<string | null>(null)

  const [alvoRemoverParticipante, setAlvoRemoverParticipante] = useState<Participante | null>(null)
  const [removendoParticipante, setRemovendoParticipante] = useState(false)
  const [erroRemoverParticipante, setErroRemoverParticipante] = useState<string | null>(null)

  const [snackbar, setSnackbar] = useState<string | null>(null)

  const [pesquisaSelecionadaId, setPesquisaSelecionadaId] = useState('')
  const [salvandoPesquisa, setSalvandoPesquisa] = useState(false)
  const [erroPesquisa, setErroPesquisa] = useState<string | null>(null)

  const [confirmarAtivar, setConfirmarAtivar] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivar, setErroAtivar] = useState<string | null>(null)

  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erroEncerrar, setErroEncerrar] = useState<string | null>(null)

  const carregarRelacionamentos = useCallback(async (cicloId: string) => {
    setCarregandoRelacionamentos(true)
    setErroRelacionamentos(null)
    try {
      const dados = await listarRelacionamentos(cicloId)
      setRelacionamentos(dados)
    } catch (err) {
      setErroRelacionamentos(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os relacionamentos gerados.',
      )
    } finally {
      setCarregandoRelacionamentos(false)
    }
  }, [])

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregandoInicial(true)
    setErroCarregamento(null)
    try {
      const [dadosCiclo, dadosParticipantes, dadosPesquisas, dadosColaboradores, dadosEquipes] = await Promise.all([
        buscarCiclo(id),
        listarParticipantes(id),
        listarPesquisas(),
        listarColaboradores(),
        listarEquipes(),
      ])
      setCiclo(dadosCiclo)
      setParticipantes(dadosParticipantes)
      setPesquisas(dadosPesquisas)
      setColaboradores(dadosColaboradores)
      setEquipes(dadosEquipes)
      // A rota de relacionamentos existe e não erraria em rascunho, mas a
      // lista sempre estaria vazia antes da ativação — evita-se a chamada.
      if (dadosCiclo.status !== 'rascunho') {
        carregarRelacionamentos(id)
      }
    } catch (err) {
      setErroCarregamento(err instanceof ApiError ? err.message : 'Não foi possível carregar o ciclo.')
    } finally {
      setCarregandoInicial(false)
    }
  }, [id, carregarRelacionamentos])

  useEffect(() => {
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const colaboradoresAtivosDisponiveis = useMemo(() => {
    const idsParticipantes = new Set(participantes.map((p) => p.colaboradorId))
    return colaboradores.filter((c) => c.ativo && !idsParticipantes.has(c.id))
  }, [colaboradores, participantes])

  const pesquisaVinculada = useMemo(
    () => (ciclo ? (pesquisas.find((p) => p.cicloId === ciclo.id) ?? null) : null),
    [pesquisas, ciclo],
  )

  const pesquisasCandidatas = useMemo(
    () => pesquisas.filter((p) => p.status === 'publicada' && p.cicloId === null),
    [pesquisas],
  )

  async function handleAdicionarIndividual() {
    if (!ciclo || selecionadosIndividual.length === 0) return
    setAdicionandoIndividual(true)
    setErroAdicionarIndividual(null)
    try {
      const atualizados = await adicionarParticipantesIndividual(
        ciclo.id,
        selecionadosIndividual.map((c) => c.id),
      )
      setParticipantes(atualizados)
      setSelecionadosIndividual([])
    } catch (err) {
      setErroAdicionarIndividual(
        err instanceof ApiError ? err.message : 'Não foi possível adicionar os participantes selecionados.',
      )
    } finally {
      setAdicionandoIndividual(false)
    }
  }

  async function handleAdicionarEquipe() {
    if (!ciclo || !equipeSelecionada) return
    setAdicionandoEquipe(true)
    setErroAdicionarEquipe(null)
    try {
      const atualizados = await adicionarParticipantesPorEquipe(ciclo.id, equipeSelecionada)
      if (atualizados.length === participantes.length) {
        setSnackbar('Nenhum colaborador novo foi adicionado desta equipe.')
      }
      setParticipantes(atualizados)
      setEquipeSelecionada('')
    } catch (err) {
      setErroAdicionarEquipe(err instanceof ApiError ? err.message : 'Não foi possível adicionar a equipe.')
    } finally {
      setAdicionandoEquipe(false)
    }
  }

  async function handleConfirmarRemoverParticipante() {
    if (!ciclo || !alvoRemoverParticipante) return
    setRemovendoParticipante(true)
    setErroRemoverParticipante(null)
    try {
      await removerParticipante(ciclo.id, alvoRemoverParticipante.colaboradorId)
      setParticipantes((prev) => prev.filter((p) => p.colaboradorId !== alvoRemoverParticipante.colaboradorId))
      setAlvoRemoverParticipante(null)
    } catch (err) {
      setErroRemoverParticipante(err instanceof ApiError ? err.message : 'Não foi possível remover o participante.')
    } finally {
      setRemovendoParticipante(false)
    }
  }

  /**
   * Vincular/desvincular pesquisa usa exclusivamente `PUT /api/pesquisas/:id`
   * (via `atualizarPesquisa`) — não existe (e não deve ser criada) rota
   * equivalente em `ciclosService.ts`. A restrição "só vincular/desvincular
   * com o ciclo em rascunho" (botões abaixo) é decisão de UX espelhada no
   * backend: esse `PUT`, ao vincular (`cicloId` não nulo), valida tanto o
   * status do ciclo (`409 CICLO_NAO_EDITAVEL` se não estiver em rascunho)
   * quanto o da pesquisa (`409 PESQUISA_NAO_PUBLICADA` se a pesquisa não
   * estiver publicada). Desvincular (`cicloId: null`) continua sempre
   * permitido, independentemente do status de ambos.
   */
  async function handleVincularPesquisa() {
    if (!ciclo || !pesquisaSelecionadaId) return
    setSalvandoPesquisa(true)
    setErroPesquisa(null)
    try {
      const atualizada = await atualizarPesquisa(pesquisaSelecionadaId, { cicloId: ciclo.id })
      setPesquisas((prev) => prev.map((p) => (p.id === atualizada.id ? { ...p, cicloId: atualizada.cicloId } : p)))
      setPesquisaSelecionadaId('')
    } catch (err) {
      setErroPesquisa(err instanceof ApiError ? err.message : 'Não foi possível vincular a pesquisa.')
    } finally {
      setSalvandoPesquisa(false)
    }
  }

  async function handleDesvincularPesquisa() {
    if (!pesquisaVinculada) return
    setSalvandoPesquisa(true)
    setErroPesquisa(null)
    try {
      const atualizada = await atualizarPesquisa(pesquisaVinculada.id, { cicloId: null })
      setPesquisas((prev) => prev.map((p) => (p.id === atualizada.id ? { ...p, cicloId: atualizada.cicloId } : p)))
    } catch (err) {
      setErroPesquisa(err instanceof ApiError ? err.message : 'Não foi possível desvincular a pesquisa.')
    } finally {
      setSalvandoPesquisa(false)
    }
  }

  /**
   * Ativação dispara a geração de `relacionamentos_avaliacao` no backend a
   * partir dos participantes atuais — irreversível, por isso o
   * `ConfirmDialog` abaixo é explícito sobre isso. Esta ação só valida
   * client-side a existência de participantes (espelhando
   * `422 CICLO_SEM_PARTICIPANTES`); não checa se há pesquisa vinculada, mesmo
   * critério do backend (ver "Perguntas em aberto" #1 em task-frontend.md).
   */
  async function handleConfirmarAtivar() {
    if (!ciclo) return
    setAtivando(true)
    setErroAtivar(null)
    try {
      const atualizado = await atualizarStatusCiclo(ciclo.id, 'ativo')
      setCiclo(atualizado)
      setConfirmarAtivar(false)
      carregarRelacionamentos(ciclo.id)
    } catch (err) {
      setErroAtivar(err instanceof ApiError ? err.message : 'Não foi possível ativar o ciclo.')
    } finally {
      setAtivando(false)
    }
  }

  async function handleConfirmarEncerrar() {
    if (!ciclo) return
    setEncerrando(true)
    setErroEncerrar(null)
    try {
      const atualizado = await atualizarStatusCiclo(ciclo.id, 'encerrado')
      setCiclo(atualizado)
      setConfirmarEncerrar(false)
    } catch (err) {
      setErroEncerrar(err instanceof ApiError ? err.message : 'Não foi possível encerrar o ciclo.')
    } finally {
      setEncerrando(false)
    }
  }

  if (carregandoInicial) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (erroCarregamento || !ciclo) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Typography role="alert" color="error">
          {erroCarregamento ?? 'Não foi possível carregar o ciclo.'}
        </Typography>
        <Button variant="contained" color="primary" onClick={carregar}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Typography variant="h5" component="h1">
            {ciclo.nome}
          </Typography>
          <StatusCicloChip status={ciclo.status} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {ciclo.status === 'rascunho' && (
            <Tooltip title={participantes.length === 0 ? 'Adicione ao menos um participante antes de ativar.' : ''}>
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={participantes.length === 0}
                  onClick={() => {
                    setErroAtivar(null)
                    setConfirmarAtivar(true)
                  }}
                >
                  Ativar ciclo
                </Button>
              </span>
            </Tooltip>
          )}
          {ciclo.status === 'ativo' && (
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                setErroEncerrar(null)
                setConfirmarEncerrar(true)
              }}
            >
              Encerrar ciclo
            </Button>
          )}
        </div>
      </div>

      <CicloDadosForm ciclo={ciclo} onAtualizado={setCiclo} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Typography variant="subtitle1">Participantes</Typography>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Cargo</TableCell>
                  <TableCell>Equipe</TableCell>
                  {ciclo.status === 'rascunho' && <TableCell align="right">Ação</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                <TabelaEstado
                  colSpan={ciclo.status === 'rascunho' ? 5 : 4}
                  carregando={false}
                  vazio={participantes.length === 0}
                  mensagemVazio="Nenhum participante adicionado ainda."
                />
                {participantes.map((participante) => (
                  <TableRow key={participante.id} hover>
                    <TableCell>{participante.nomeCompleto}</TableCell>
                    <TableCell>{participante.email}</TableCell>
                    <TableCell>{participante.cargo ?? '—'}</TableCell>
                    <TableCell>{participante.equipe?.nome ?? '—'}</TableCell>
                    {ciclo.status === 'rascunho' && (
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            setErroRemoverParticipante(null)
                            setAlvoRemoverParticipante(participante)
                          }}
                        >
                          Remover
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {ciclo.status === 'rascunho' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Typography variant="subtitle2">Adicionar por pessoa</Typography>
                <Autocomplete
                  multiple
                  options={colaboradoresAtivosDisponiveis}
                  getOptionLabel={(colaborador) => colaborador.nomeCompleto}
                  value={selecionadosIndividual}
                  onChange={(_evento, valor) => setSelecionadosIndividual(valor)}
                  disabled={adicionandoIndividual}
                  renderInput={(params) => (
                    <TextField {...params} label="Colaboradores ativos" placeholder="Buscar..." />
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    variant="outlined"
                    onClick={handleAdicionarIndividual}
                    disabled={adicionandoIndividual || selecionadosIndividual.length === 0}
                  >
                    {adicionandoIndividual ? 'Adicionando...' : 'Adicionar selecionados'}
                  </Button>
                </div>
                {erroAdicionarIndividual && (
                  <Alert severity="error" role="alert">
                    {erroAdicionarIndividual}
                  </Alert>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Typography variant="subtitle2">Adicionar por equipe</Typography>
                <TextField
                  select
                  label="Equipe"
                  value={equipeSelecionada}
                  onChange={(e) => setEquipeSelecionada(e.target.value)}
                  disabled={adicionandoEquipe}
                  fullWidth
                >
                  <MenuItem value="">Selecione</MenuItem>
                  {equipes.map((equipe) => (
                    <MenuItem key={equipe.id} value={equipe.id}>
                      {equipe.nome}
                    </MenuItem>
                  ))}
                </TextField>
                <div className="flex justify-end">
                  <Button
                    variant="outlined"
                    onClick={handleAdicionarEquipe}
                    disabled={adicionandoEquipe || !equipeSelecionada}
                  >
                    {adicionandoEquipe ? 'Adicionando...' : 'Adicionar equipe inteira'}
                  </Button>
                </div>
                {erroAdicionarEquipe && (
                  <Alert severity="error" role="alert">
                    {erroAdicionarEquipe}
                  </Alert>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Typography variant="subtitle1">Pesquisa vinculada</Typography>

          {pesquisaVinculada ? (
            <div className="flex flex-wrap items-center gap-2">
              <Typography>{pesquisaVinculada.titulo}</Typography>
              <StatusPesquisaChip status={pesquisaVinculada.status} />
              <Button size="small" onClick={() => navigate(`/pesquisas/${pesquisaVinculada.id}/editar`)}>
                Editar pesquisa
              </Button>
              {ciclo.status === 'rascunho' && (
                <Button size="small" color="error" onClick={handleDesvincularPesquisa} disabled={salvandoPesquisa}>
                  {salvandoPesquisa ? 'Removendo...' : 'Desvincular'}
                </Button>
              )}
            </div>
          ) : pesquisasCandidatas.length === 0 ? (
            <Typography color="text.secondary">Nenhuma pesquisa publicada disponível para vincular.</Typography>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <TextField
                select
                label="Pesquisa publicada"
                value={pesquisaSelecionadaId}
                onChange={(e) => setPesquisaSelecionadaId(e.target.value)}
                disabled={salvandoPesquisa}
                sx={{ minWidth: 240 }}
              >
                <MenuItem value="">Selecione</MenuItem>
                {pesquisasCandidatas.map((pesquisa) => (
                  <MenuItem key={pesquisa.id} value={pesquisa.id}>
                    {pesquisa.titulo}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                onClick={handleVincularPesquisa}
                disabled={salvandoPesquisa || !pesquisaSelecionadaId || ciclo.status !== 'rascunho'}
              >
                {salvandoPesquisa ? 'Vinculando...' : 'Vincular'}
              </Button>
            </div>
          )}

          {erroPesquisa && (
            <Alert severity="error" role="alert">
              {erroPesquisa}
            </Alert>
          )}
        </CardContent>
      </Card>

      {ciclo.status !== 'rascunho' && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Typography variant="subtitle1">Relacionamentos gerados</Typography>
            <Typography variant="body2" color="text.secondary">
              Vínculo estrutural de quem avalia quem, gerado automaticamente na ativação do ciclo. Dado identificado
              — visível apenas para admin/gestor de RH.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Avaliador</TableCell>
                    <TableCell>Avaliado</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Data</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TabelaEstado
                    colSpan={4}
                    carregando={carregandoRelacionamentos}
                    erro={erroRelacionamentos}
                    vazio={!carregandoRelacionamentos && !erroRelacionamentos && relacionamentos.length === 0}
                    mensagemVazio="Nenhum relacionamento gerado ainda."
                    onTentarNovamente={() => carregarRelacionamentos(ciclo.id)}
                  />
                  {!carregandoRelacionamentos &&
                    !erroRelacionamentos &&
                    relacionamentos.map((relacionamento) => (
                      <TableRow key={relacionamento.id} hover>
                        <TableCell>{relacionamento.avaliadorNome}</TableCell>
                        <TableCell>{relacionamento.avaliadoNome}</TableCell>
                        <TableCell>{ROTULOS_TIPO_RELACIONAMENTO[relacionamento.tipoRelacionamento]}</TableCell>
                        <TableCell>{FORMATADOR_DATA_HORA.format(new Date(relacionamento.criadoEm))}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary">
        Período: {formatarData(ciclo.dataInicio)} — {formatarData(ciclo.dataFim)}
      </Typography>

      <ConfirmDialog
        open={Boolean(alvoRemoverParticipante)}
        titulo="Remover participante"
        mensagem={`Remover "${alvoRemoverParticipante?.nomeCompleto ?? ''}" deste ciclo?`}
        confirmarLabel="Remover"
        carregando={removendoParticipante}
        erro={erroRemoverParticipante}
        onConfirmar={handleConfirmarRemoverParticipante}
        onCancelar={() => {
          if (removendoParticipante) return
          setAlvoRemoverParticipante(null)
          setErroRemoverParticipante(null)
        }}
      />

      <ConfirmDialog
        open={confirmarAtivar}
        titulo="Ativar ciclo"
        mensagem="Ativar este ciclo? Os relacionamentos de avaliação (quem avalia quem) serão gerados automaticamente a partir dos participantes atuais, e não será mais possível editar o ciclo, seus participantes ou a pesquisa vinculada depois disso."
        confirmarLabel="Ativar"
        carregando={ativando}
        erro={erroAtivar}
        onConfirmar={handleConfirmarAtivar}
        onCancelar={() => {
          if (ativando) return
          setConfirmarAtivar(false)
          setErroAtivar(null)
        }}
      />

      <ConfirmDialog
        open={confirmarEncerrar}
        titulo="Encerrar ciclo"
        mensagem="Encerrar este ciclo? Esta ação não pode ser desfeita."
        confirmarLabel="Encerrar"
        carregando={encerrando}
        erro={erroEncerrar}
        onConfirmar={handleConfirmarEncerrar}
        onCancelar={() => {
          if (encerrando) return
          setConfirmarEncerrar(false)
          setErroEncerrar(null)
        }}
      />

      {snackbar && (
        <Snackbar open autoHideDuration={5000} onClose={() => setSnackbar(null)}>
          <Alert severity="info" onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
            {snackbar}
          </Alert>
        </Snackbar>
      )}
    </div>
  )
}
