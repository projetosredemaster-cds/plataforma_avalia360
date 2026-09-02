import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../lib/apiClient'
import {
  atualizarColaborador,
  buscarColaborador,
  criarColaborador,
  listarColaboradores,
  type ColaboradorPayload,
} from '../../services/colaboradoresService'
import { listarEquipes } from '../../services/equipesService'
import { cpfValido, formatarCpf, normalizarCpf } from '../../utils/cpf'
import type { Colaborador, Equipe, Papel } from '../../types/colaborador'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PAPEL_OPCOES: Array<{ valor: Papel; label: string }> = [
  { valor: 'admin', label: 'Administrador' },
  { valor: 'gestor_rh', label: 'Gestor de RH' },
  { valor: 'colaborador', label: 'Colaborador' },
]

interface ErrosCampo {
  nomeCompleto?: string
  email?: string
  cpf?: string
}

/**
 * Formulário de criação/edição de colaborador, usado em `/colaboradores/novo`
 * e `/colaboradores/:id/editar`. `ativo` não faz parte deste formulário —
 * inativação/reativação é uma ação própria da listagem
 * (`PATCH /api/colaboradores/:id/status`), não um campo editável aqui.
 */
export function ColaboradorFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdicao = Boolean(id)
  const navigate = useNavigate()

  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [opcoesGestor, setOpcoesGestor] = useState<Colaborador[]>([])

  const [nomeCompleto, setNomeCompleto] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [papel, setPapel] = useState<Papel>('colaborador')
  const [cargo, setCargo] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [gestorId, setGestorId] = useState('')

  const [errosCampo, setErrosCampo] = useState<ErrosCampo>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregarDadosIniciais = useCallback(async () => {
    setCarregandoInicial(true)
    setErroCarregamento(null)
    try {
      const [listaEquipes, listaColaboradores, colaboradorAtual] = await Promise.all([
        listarEquipes(),
        listarColaboradores(),
        isEdicao && id ? buscarColaborador(id) : Promise.resolve(null),
      ])

      setEquipes(listaEquipes)
      setOpcoesGestor(listaColaboradores.filter((c) => c.ativo && c.id !== id))

      if (colaboradorAtual) {
        setNomeCompleto(colaboradorAtual.nomeCompleto)
        setEmail(colaboradorAtual.email)
        setCpf(formatarCpf(colaboradorAtual.cpf))
        setPapel(colaboradorAtual.papel)
        setCargo(colaboradorAtual.cargo ?? '')
        setEquipeId(colaboradorAtual.equipe?.id ?? '')
        setGestorId(colaboradorAtual.gestor?.id ?? '')
      }
    } catch (err) {
      setErroCarregamento(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os dados do formulário.',
      )
    } finally {
      setCarregandoInicial(false)
    }
  }, [id, isEdicao])

  useEffect(() => {
    carregarDadosIniciais()
  }, [carregarDadosIniciais])

  function validar(): boolean {
    const erros: ErrosCampo = {}
    if (nomeCompleto.trim().length < 2) {
      erros.nomeCompleto = 'Informe o nome completo.'
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      erros.email = 'Informe um e-mail válido.'
    }
    if (!cpfValido(cpf)) {
      erros.cpf = 'CPF inválido. Verifique os números digitados.'
    }
    setErrosCampo(erros)
    return Object.keys(erros).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (salvando) return
    setErroGeral(null)
    if (!validar()) return

    const payload: ColaboradorPayload = {
      nomeCompleto: nomeCompleto.trim(),
      email: email.trim(),
      cpf: normalizarCpf(cpf),
      papel,
      cargo: cargo.trim() || undefined,
      equipeId: equipeId || null,
      gestorId: gestorId || null,
    }

    setSalvando(true)
    try {
      if (isEdicao && id) {
        await atualizarColaborador(id, payload)
        navigate('/colaboradores', { state: { successMessage: 'Colaborador atualizado com sucesso.' } })
        return
      }

      const resposta = await criarColaborador(payload)
      // Contrato de três estados: `false` = tentou enviar o e-mail de definição de
      // senha e falhou de verdade (papel admin/gestor_rh); `null` = papel sem conta
      // de login (colaborador comum), não aplicável; `true` = enviado com sucesso.
      // Só `false` deve disparar o aviso abaixo.
      if (resposta.emailDefinicaoSenhaEnviado === false) {
        navigate('/colaboradores', {
          state: {
            warningMessage:
              'Colaborador criado, mas não foi possível enviar o e-mail de definição de senha. ' +
              'Oriente a pessoa a usar "Esqueci minha senha" na tela de login.',
          },
        })
        return
      }
      navigate('/colaboradores', { state: { successMessage: 'Colaborador criado com sucesso.' } })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.codigo === 'CPF_INVALIDO' || err.codigo === 'CPF_DUPLICADO') {
          setErrosCampo((prev) => ({ ...prev, cpf: err.message }))
        } else if (err.codigo === 'EMAIL_DUPLICADO' || err.codigo === 'EMAIL_JA_REGISTRADO_AUTH') {
          setErrosCampo((prev) => ({ ...prev, email: err.message }))
        } else {
          setErroGeral(err.message)
        }
      } else {
        setErroGeral('Não foi possível salvar o colaborador. Tente novamente.')
      }
    } finally {
      setSalvando(false)
    }
  }

  if (carregandoInicial) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (erroCarregamento) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Typography role="alert" color="error">
          {erroCarregamento}
        </Typography>
        <Button variant="contained" color="primary" onClick={carregarDadosIniciais}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <Paper className="mx-auto max-w-2xl p-6">
      <Typography variant="h5" component="h1" sx={{ mb: 3 }}>
        {isEdicao ? 'Editar colaborador' : 'Novo colaborador'}
      </Typography>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Nome completo"
          value={nomeCompleto}
          onChange={(e) => setNomeCompleto(e.target.value)}
          error={Boolean(errosCampo.nomeCompleto)}
          helperText={errosCampo.nomeCompleto}
          disabled={salvando}
          required
          fullWidth
        />

        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={Boolean(errosCampo.email)}
          helperText={errosCampo.email}
          disabled={salvando}
          required
          fullWidth
        />

        <TextField
          label="CPF"
          value={cpf}
          onChange={(e) => setCpf(formatarCpf(e.target.value))}
          error={Boolean(errosCampo.cpf)}
          helperText={errosCampo.cpf}
          disabled={salvando}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          required
          fullWidth
        />

        <TextField
          select
          label="Papel"
          value={papel}
          onChange={(e) => setPapel(e.target.value as Papel)}
          disabled={salvando}
          required
          fullWidth
        >
          {PAPEL_OPCOES.map((opcao) => (
            <MenuItem key={opcao.valor} value={opcao.valor}>
              {opcao.label}
            </MenuItem>
          ))}
        </TextField>

        <Alert severity="info">
          {papel === 'colaborador'
            ? 'Esta pessoa poderá ser avaliada e avaliar outras pessoas na Avaliação 360°, mas não terá login na plataforma.'
            : 'Será criada uma conta de acesso para este e-mail. Um e-mail de definição de senha será enviado automaticamente.'}
        </Alert>

        <TextField
          label="Cargo"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          disabled={salvando}
          fullWidth
        />

        <TextField
          select
          label="Equipe"
          value={equipeId}
          onChange={(e) => setEquipeId(e.target.value)}
          disabled={salvando}
          fullWidth
        >
          <MenuItem value="">Nenhuma</MenuItem>
          {equipes.map((equipe) => (
            <MenuItem key={equipe.id} value={equipe.id}>
              {equipe.nome}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Gestor"
          value={gestorId}
          onChange={(e) => setGestorId(e.target.value)}
          disabled={salvando}
          fullWidth
        >
          <MenuItem value="">Nenhum</MenuItem>
          {opcoesGestor.map((opcao) => (
            <MenuItem key={opcao.id} value={opcao.id}>
              {opcao.nomeCompleto}
            </MenuItem>
          ))}
        </TextField>

        {erroGeral && (
          <Alert severity="error" role="alert">
            {erroGeral}
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="text" onClick={() => navigate('/colaboradores')} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Paper>
  )
}
