import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
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
import { CARGO_OPCOES } from '../../constants/colaborador'
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
  const [ehGestor, setEhGestor] = useState(false)
  const [equipeId, setEquipeId] = useState('')
  const [gestorId, setGestorId] = useState('')

  const emailObrigatorio = papel === 'admin' || papel === 'gestor_rh'

  const [errosCampo, setErrosCampo] = useState<ErrosCampo>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregarDadosIniciais = useCallback(async () => {
    setCarregandoInicial(true)
    setErroCarregamento(null)
    try {
      const [listaEquipes, listaGestores, colaboradorAtual] = await Promise.all([
        listarEquipes(),
        listarColaboradores({ ehGestor: true, ativo: true }),
        isEdicao && id ? buscarColaborador(id) : Promise.resolve(null),
      ])

      setEquipes(listaEquipes)
      // Filtro `ehGestor`/`ativo` já é feito pelo backend
      // (`GET /api/colaboradores?ehGestor=true&ativo=true`); só o próprio
      // colaborador em edição precisa ser excluído aqui, já que o backend
      // não sabe qual formulário está fazendo a chamada.
      setOpcoesGestor(listaGestores.filter((c) => c.id !== id))

      if (colaboradorAtual) {
        setNomeCompleto(colaboradorAtual.nomeCompleto)
        setEmail(colaboradorAtual.email ?? '')
        setCpf(formatarCpf(colaboradorAtual.cpf))
        setPapel(colaboradorAtual.papel)
        setCargo(colaboradorAtual.cargo ?? '')
        setEhGestor(colaboradorAtual.ehGestor ?? false)
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
    const emailPreenchido = email.trim().length > 0
    if (emailObrigatorio && !emailPreenchido) {
      erros.email = 'Informe o e-mail.'
    } else if (emailPreenchido && !EMAIL_REGEX.test(email.trim())) {
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

    const emailTrimmed = email.trim()
    const payload: ColaboradorPayload = {
      nomeCompleto: nomeCompleto.trim(),
      // Papel `colaborador` pode não ter e-mail: enviamos `undefined` (campo
      // omitido) em vez de string vazia, alinhado ao DTO do backend
      // (`email?: string`) — ver task-backend.md, item 1.3.
      email: emailTrimmed.length > 0 ? emailTrimmed : undefined,
      cpf: normalizarCpf(cpf),
      papel,
      cargo: cargo || undefined,
      ehGestor,
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
      if (resposta.emailDefinicaoSenhaEnviado === true) {
        navigate('/colaboradores', {
          state: {
            successMessage:
              'Colaborador criado com sucesso. Um e-mail de definição de senha foi enviado para o endereço informado.',
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
            ? 'Esta pessoa não terá login na plataforma.'
            : 'Será criada uma conta de acesso para este e-mail. Um e-mail de definição de senha será enviado automaticamente.'}
        </Alert>

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
          required={emailObrigatorio}
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
          label="Cargo"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          disabled={salvando}
          fullWidth
        >
          <MenuItem value="">Nenhum</MenuItem>
          {/* Valor legado digitado livremente antes desta task, que não bate
              com nenhuma opção fixa: preserva o dado existente em vez de
              apagá-lo silenciosamente ao abrir a edição. */}
          {cargo && !(CARGO_OPCOES as readonly string[]).includes(cargo) && (
            <MenuItem value={cargo}>{cargo} (valor atual)</MenuItem>
          )}
          {CARGO_OPCOES.map((opcao) => (
            <MenuItem key={opcao} value={opcao}>
              {opcao}
            </MenuItem>
          ))}
        </TextField>

        <FormControlLabel
          control={
            <Checkbox
              checked={ehGestor}
              onChange={(e) => setEhGestor(e.target.checked)}
              disabled={salvando}
            />
          }
          label="É gestor"
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
