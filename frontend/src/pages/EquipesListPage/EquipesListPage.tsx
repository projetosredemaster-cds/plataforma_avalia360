import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
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
  Typography,
} from '@mui/material'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { TabelaEstado } from '../../components/TabelaEstado/TabelaEstado'
import { ApiError } from '../../lib/apiClient'
import { atualizarEquipe, criarEquipe, listarEquipes, removerEquipe } from '../../services/equipesService'
import type { Equipe } from '../../types/colaborador'

type ModoDialog = 'criar' | 'editar' | null

/**
 * CRUD simples de equipes. `GET /api/equipes` não pagina — lista tudo. O
 * `DELETE` é físico (o banco usa `ON DELETE SET NULL` em
 * `colaboradores.equipe_id`), então não há mensagem específica prometida de
 * "equipe em uso"; qualquer erro retornado pela API é exibido literalmente
 * dentro do `ConfirmDialog`.
 */
export function EquipesListPage() {
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modoDialog, setModoDialog] = useState<ModoDialog>(null)
  const [equipeEmEdicao, setEquipeEmEdicao] = useState<Equipe | null>(null)
  const [nomeDialog, setNomeDialog] = useState('')
  const [salvandoDialog, setSalvandoDialog] = useState(false)
  const [erroDialogForm, setErroDialogForm] = useState<string | null>(null)

  const [equipeParaExcluir, setEquipeParaExcluir] = useState<Equipe | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)

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

  function abrirCriacao() {
    setModoDialog('criar')
    setEquipeEmEdicao(null)
    setNomeDialog('')
    setErroDialogForm(null)
  }

  function abrirEdicao(equipe: Equipe) {
    setModoDialog('editar')
    setEquipeEmEdicao(equipe)
    setNomeDialog(equipe.nome)
    setErroDialogForm(null)
  }

  function fecharDialog() {
    if (salvandoDialog) return
    setModoDialog(null)
    setEquipeEmEdicao(null)
    setErroDialogForm(null)
  }

  async function handleSalvarDialog() {
    const nome = nomeDialog.trim()
    if (nome.length < 2) {
      setErroDialogForm('Informe um nome com pelo menos 2 caracteres.')
      return
    }

    setSalvandoDialog(true)
    setErroDialogForm(null)
    try {
      if (modoDialog === 'editar' && equipeEmEdicao) {
        await atualizarEquipe(equipeEmEdicao.id, nome)
      } else {
        await criarEquipe(nome)
      }
      setModoDialog(null)
      setEquipeEmEdicao(null)
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
                      <Button size="small" onClick={() => abrirEdicao(equipe)}>
                        Editar
                      </Button>
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
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={modoDialog !== null} onClose={fecharDialog} fullWidth maxWidth="xs">
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
          <Button onClick={handleSalvarDialog} variant="contained" color="primary" disabled={salvandoDialog}>
            {salvandoDialog ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(equipeParaExcluir)}
        titulo="Excluir equipe"
        mensagem={`Deseja realmente excluir a equipe "${equipeParaExcluir?.nome ?? ''}"? Colaboradores vinculados a ela ficarão sem equipe definida.`}
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
    </div>
  )
}
