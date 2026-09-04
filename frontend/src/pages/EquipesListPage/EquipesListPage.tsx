import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
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
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { TabelaEstado } from '../../components/TabelaEstado/TabelaEstado'
import { ApiError } from '../../lib/apiClient'
import { listarColaboradores } from '../../services/colaboradoresService'
import type { ColaboradorDaEquipe } from '../../services/equipesService'
import {
  atualizarEquipe,
  criarEquipe,
  listarColaboradoresDaEquipe,
  listarEquipes,
  removerEquipe,
  vincularColaboradoresEquipe,
} from '../../services/equipesService'
import type { Colaborador, Equipe } from '../../types/colaborador'

type ModoDialog = 'criar' | 'editar' | null

/**
 * CRUD de equipes, incluindo o vínculo de colaboradores. `GET /api/equipes`
 * não pagina — lista tudo. O `DELETE` agora é bloqueado pela API
 * (`EQUIPE_COM_COLABORADORES_VINCULADOS`, 422) quando a equipe ainda tem
 * qualquer colaborador vinculado (ativo ou inativo) — o botão "Excluir" já
 * fica desabilitado nesse caso a partir de `totalColaboradores`, mas
 * qualquer erro retornado pela API é exibido literalmente dentro do
 * `ConfirmDialog`.
 */
export function EquipesListPage() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Lista completa de colaboradores (ativos e inativos), carregada uma única
  // vez e reaproveitada pelo Autocomplete de criar/editar.
  const [todosColaboradores, setTodosColaboradores] = useState<Colaborador[]>([])

  const [modoDialog, setModoDialog] = useState<ModoDialog>(null)
  const [equipeEmEdicao, setEquipeEmEdicao] = useState<Equipe | null>(null)
  const [nomeDialog, setNomeDialog] = useState('')
  const [colaboradoresSelecionados, setColaboradoresSelecionados] = useState<Colaborador[]>([])
  const [carregandoSelecaoInicial, setCarregandoSelecaoInicial] = useState(false)
  const [salvandoDialog, setSalvandoDialog] = useState(false)
  const [erroDialogForm, setErroDialogForm] = useState<string | null>(null)

  const [equipeParaExcluir, setEquipeParaExcluir] = useState<Equipe | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)

  const [equipeParaVerColaboradores, setEquipeParaVerColaboradores] = useState<Equipe | null>(null)
  const [colaboradoresDaEquipe, setColaboradoresDaEquipe] = useState<ColaboradorDaEquipe[]>([])
  const [carregandoColaboradoresDaEquipe, setCarregandoColaboradoresDaEquipe] = useState(false)
  const [erroColaboradoresDaEquipe, setErroColaboradoresDaEquipe] = useState<string | null>(null)

  const carregarEquipes = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const dados = await listarEquipes()
      setEquipes(dados)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as equipes.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial das equipes via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEquipes()
  }, [carregarEquipes])

  useEffect(() => {
    // Lista completa de colaboradores para o Autocomplete de vínculo,
    // carregada uma única vez ao montar a tela.
    listarColaboradores()
      .then(setTodosColaboradores)
      .catch(() => {
        // Falha aqui não impede o CRUD básico de equipes — o Autocomplete
        // simplesmente ficará sem opções.
      })
  }, [])

  function abrirCriacao() {
    setModoDialog('criar')
    setEquipeEmEdicao(null)
    setNomeDialog('')
    setColaboradoresSelecionados([])
    setErroDialogForm(null)
  }

  async function abrirEdicao(equipe: Equipe) {
    setModoDialog('editar')
    setEquipeEmEdicao(equipe)
    setNomeDialog(equipe.nome)
    setColaboradoresSelecionados([])
    setErroDialogForm(null)

    setCarregandoSelecaoInicial(true)
    try {
      const vinculados = await listarColaboradoresDaEquipe(equipe.id)
      const idsVinculados = new Set(vinculados.map((c) => c.id))
      setColaboradoresSelecionados(todosColaboradores.filter((c) => idsVinculados.has(c.id)))
    } catch (err) {
      setErroDialogForm(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os colaboradores vinculados a esta equipe.',
      )
    } finally {
      setCarregandoSelecaoInicial(false)
    }
  }

  function fecharDialog() {
    if (salvandoDialog) return
    setModoDialog(null)
    setEquipeEmEdicao(null)
    setColaboradoresSelecionados([])
    setErroDialogForm(null)
  }

  async function handleSalvarDialog() {
    const nome = nomeDialog.trim()
    if (nome.length < 2) {
      setErroDialogForm('Informe um nome com pelo menos 2 caracteres.')
      return
    }

    const idsSelecionados = colaboradoresSelecionados.map((c) => c.id)

    setSalvandoDialog(true)
    setErroDialogForm(null)
    try {
      if (modoDialog === 'editar' && equipeEmEdicao) {
        await atualizarEquipe(equipeEmEdicao.id, nome)
        await vincularColaboradoresEquipe(equipeEmEdicao.id, idsSelecionados)
      } else {
        const novaEquipe = await criarEquipe(nome)
        if (idsSelecionados.length > 0) {
          await vincularColaboradoresEquipe(novaEquipe.id, idsSelecionados)
        }
      }
      setModoDialog(null)
      setEquipeEmEdicao(null)
      setColaboradoresSelecionados([])
      await carregarEquipes()
    } catch (err) {
      setErroDialogForm(err instanceof ApiError ? err.message : 'Não foi possível salvar a equipe.')
    } finally {
      setSalvandoDialog(false)
    }
  }

  async function handleConfirmarExclusao() {
    if (!equipeParaExcluir) return
    setExcluindo(true)
    setErroExclusao(null)
    try {
      await removerEquipe(equipeParaExcluir.id)
      setEquipeParaExcluir(null)
      await carregarEquipes()
    } catch (err) {
      setErroExclusao(err instanceof ApiError ? err.message : 'Não foi possível excluir a equipe.')
    } finally {
      setExcluindo(false)
    }
  }

  async function abrirVerColaboradores(equipe: Equipe) {
    setEquipeParaVerColaboradores(equipe)
    setColaboradoresDaEquipe([])
    setErroColaboradoresDaEquipe(null)
    setCarregandoColaboradoresDaEquipe(true)
    try {
      const dados = await listarColaboradoresDaEquipe(equipe.id)
      setColaboradoresDaEquipe(dados)
    } catch (err) {
      setErroColaboradoresDaEquipe(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os colaboradores desta equipe.',
      )
    } finally {
      setCarregandoColaboradoresDaEquipe(false)
    }
  }

  function fecharVerColaboradores() {
    setEquipeParaVerColaboradores(null)
    setColaboradoresDaEquipe([])
    setErroColaboradoresDaEquipe(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Equipes
        </Typography>
        <Button variant="contained" color="primary" onClick={abrirCriacao}>
          Nova equipe
        </Button>
      </div>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TabelaEstado
                colSpan={2}
                carregando={carregando}
                erro={erro}
                vazio={!carregando && !erro && equipes.length === 0}
                mensagemVazio="Nenhuma equipe cadastrada ainda."
                onTentarNovamente={carregarEquipes}
              />
              {!carregando &&
                !erro &&
                equipes.map((equipe) => (
                  <TableRow key={equipe.id} hover>
                    <TableCell>{equipe.nome}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => abrirVerColaboradores(equipe)}>
                        Ver colaboradores
                      </Button>
                      <Button size="small" onClick={() => abrirEdicao(equipe)}>
                        Editar
                      </Button>
                      {equipe.totalColaboradores > 0 ? (
                        <Tooltip title="Esta equipe tem colaboradores vinculados. Desvincule-os antes de excluir.">
                          <span>
                            <Button size="small" color="error" disabled>
                              Excluir
                            </Button>
                          </span>
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            setErroExclusao(null)
                            setEquipeParaExcluir(equipe)
                          }}
                        >
                          Excluir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={modoDialog !== null} onClose={fecharDialog} fullWidth maxWidth="sm">
        <DialogTitle>{modoDialog === 'editar' ? 'Editar equipe' : 'Nova equipe'}</DialogTitle>
        <DialogContent className="flex flex-col gap-4 pt-2">
          <TextField
            label="Nome"
            value={nomeDialog}
            onChange={(e) => setNomeDialog(e.target.value)}
            disabled={salvandoDialog}
            autoFocus
            fullWidth
          />
          <Autocomplete
            multiple
            options={todosColaboradores}
            value={colaboradoresSelecionados}
            onChange={(_, novoValor) => setColaboradoresSelecionados(novoValor)}
            getOptionLabel={(colaborador) =>
              colaborador.ativo ? colaborador.nomeCompleto : `${colaborador.nomeCompleto} (inativo)`
            }
            isOptionEqualToValue={(opcao, valor) => opcao.id === valor.id}
            loading={carregandoSelecaoInicial}
            disabled={salvandoDialog || carregandoSelecaoInicial}
            renderValue={(valor, getItemProps) =>
              valor.map((colaborador, index) => {
                const { key, ...itemProps } = getItemProps({ index })
                return (
                  <Chip
                    key={key}
                    {...itemProps}
                    label={colaborador.nomeCompleto}
                    color={colaborador.ativo ? 'default' : 'warning'}
                    size="small"
                  />
                )
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Colaboradores vinculados"
                placeholder="Selecione os colaboradores"
                helperText="Ao salvar, apenas os colaboradores selecionados ficarão vinculados a esta equipe."
              />
            )}
          />
          {erroDialogForm && (
            <Alert severity="error" role="alert">
              {erroDialogForm}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={fecharDialog} disabled={salvandoDialog}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvarDialog}
            variant="contained"
            color="primary"
            disabled={salvandoDialog || carregandoSelecaoInicial}
          >
            {salvandoDialog ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(equipeParaExcluir)}
        titulo="Excluir equipe"
        mensagem={`Deseja realmente excluir a equipe "${equipeParaExcluir?.nome ?? ''}"?`}
        confirmarLabel="Excluir"
        carregando={excluindo}
        erro={erroExclusao}
        onConfirmar={handleConfirmarExclusao}
        onCancelar={() => {
          if (excluindo) return
          setEquipeParaExcluir(null)
          setErroExclusao(null)
        }}
      />

      <Dialog open={Boolean(equipeParaVerColaboradores)} onClose={fecharVerColaboradores} fullWidth maxWidth="xs">
        <DialogTitle>Colaboradores de "{equipeParaVerColaboradores?.nome ?? ''}"</DialogTitle>
        <DialogContent className="flex flex-col gap-2 pt-2">
          {carregandoColaboradoresDaEquipe && <Typography color="text.secondary">Carregando...</Typography>}
          {!carregandoColaboradoresDaEquipe && erroColaboradoresDaEquipe && (
            <Alert
              severity="error"
              role="alert"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => equipeParaVerColaboradores && abrirVerColaboradores(equipeParaVerColaboradores)}
                >
                  Tentar novamente
                </Button>
              }
            >
              {erroColaboradoresDaEquipe}
            </Alert>
          )}
          {!carregandoColaboradoresDaEquipe && !erroColaboradoresDaEquipe && colaboradoresDaEquipe.length === 0 && (
            <Typography color="text.secondary">Nenhum colaborador vinculado a esta equipe.</Typography>
          )}
          {!carregandoColaboradoresDaEquipe && !erroColaboradoresDaEquipe && colaboradoresDaEquipe.length > 0 && (
            <Box className="flex flex-col gap-2">
              {colaboradoresDaEquipe.map((colaborador) => (
                <div key={colaborador.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div className="flex flex-col">
                    <Typography variant="body2">{colaborador.nomeCompleto}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {colaborador.cargo ?? '—'}
                    </Typography>
                  </div>
                  <Chip
                    label={colaborador.ativo ? 'Ativo' : 'Inativo'}
                    color={colaborador.ativo ? 'success' : 'default'}
                    size="small"
                  />
                </div>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={fecharVerColaboradores}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
