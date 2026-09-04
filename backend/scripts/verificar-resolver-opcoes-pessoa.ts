/**
 * Script de diagnóstico STANDALONE — NÃO é suite de teste formal (não roda
 * via `vitest`, não faz parte de `npm test`). É um arquivo único para
 * verificar manualmente, contra um banco real, que `resolverOpcoesPessoa`
 * (coleta-respostas-publica.service.ts) resolve corretamente o filtro
 * `pares`/`subordinado`/`todos_gestores`/`externo` de uma pergunta tipo
 * `pessoa` num cenário deliberadamente cruzado: um colaborador (`ColabA3`)
 * cuja EQUIPE (`EquipeA`) é diferente do GESTOR (`GestorB`, gestor de
 * `EquipeB`) — confirma que `pares` é resolvido por EQUIPE, nunca por
 * gestor, e que `subordinado` é resolvido por `gestor_id`, nunca por equipe.
 *
 * NÃO RODAR ainda: nenhuma migration deste projeto rodou contra um banco
 * real (ver nota da task) — `eh_gestor`/`tipos_relacionamento_gerados`/etc.
 * usadas por este script não existem em nenhum banco real hoje. Depois que
 * as migrations pendentes tiverem rodado contra o banco configurado em
 * `backend/.env` (DATABASE_URL), rodar com:
 *
 *   npx tsx backend/scripts/verificar-resolver-opcoes-pessoa.ts
 *
 * O script SEMPRE fecha a conexão (`AppDataSource.destroy()`) no `finally`,
 * mesmo se o seed ou a verificação lançarem no meio do caminho. A seção 4
 * (SQL de limpeza) é só `console.log` de texto — nunca executada por este
 * script; rode manualmente contra o banco depois de inspecionar os dados.
 */

import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../src/data-source'
import type { ColaboradorAutenticado } from '../src/types/express'
import type { FiltroRelacionamentoPessoa } from '../src/common/enums'
import type { RelacionamentoAvaliacao } from '../src/modules/ciclos-avaliacao/relacionamento-avaliacao.entity'
import * as equipesService from '../src/modules/equipes/equipes.service'
import * as colaboradoresService from '../src/modules/colaboradores/colaboradores.service'
import * as ciclosAvaliacaoService from '../src/modules/ciclos-avaliacao/ciclos-avaliacao.service'
import * as cicloParticipantesService from '../src/modules/ciclo-participantes/ciclo-participantes.service'
import * as pesquisasService from '../src/modules/pesquisas/pesquisas.service'
import * as paginasPesquisaService from '../src/modules/paginas-pesquisa/paginas-pesquisa.service'
import * as perguntasService from '../src/modules/perguntas/perguntas.service'
import { resolverOpcoesPessoa } from '../src/modules/coleta-respostas-publica/coleta-respostas-publica.service'

// --- Ator sintético ---------------------------------------------------
//
// Este script não passa por HTTP/Supabase Auth — não existe uma sessão real
// nem um JWT validado pelo middleware `autenticar`. `garantirPapel` (chamado
// como primeira linha de toda função *.service.ts) só olha `.papel`, então
// construímos um `ColaboradorAutenticado` sintético com `papel: 'admin'` só
// para satisfazer essa checagem. Isso é um bypass de autenticação real
// aceitável APENAS porque é um script interno de diagnóstico — nunca um
// padrão a copiar para código de produto (nenhuma rota HTTP deve construir
// um ator dessa forma).
//
// `id` começa como um UUID qualquer (nenhuma tabela referencia esse valor
// nos passos iniciais de seed — equipes/colaboradores não têm coluna
// `criado_por`), e é REATRIBUÍDO logo após `ZTeste_GestorA` ser criado, para
// apontar para um `colaboradores.id` real: `ciclos_avaliacao.criado_por` tem
// FK `REFERENCES colaboradores(id)` (nullable, mas quando preenchido precisa
// existir), e `ciclosAvaliacaoService.criar()` grava `criadoPor: ator.id`.
const atorSintetico: ColaboradorAutenticado = {
  id: randomUUID(),
  papel: 'admin',
  nomeCompleto: 'ZTeste_ScriptDiagnostico',
  email: 'ztest-script-diagnostico@example.invalid',
}

// --- Geração de CPF sintético, porém matematicamente válido -----------

/**
 * Gera um CPF de 11 dígitos com dígitos verificadores corretos (mesmo
 * algoritmo de `common/cpf.ts`, `validarCpf`), a partir de um índice
 * sequencial — só para satisfazer `validarCpf()` no seed. Nunca é o CPF real
 * de ninguém.
 */
function gerarCpfValido(indice: number): string {
  const baseNumero = 100000000 + indice * 7919
  const base = String(baseNumero).padStart(9, '0').slice(-9).split('').map(Number)

  const calcularDigitoVerificador = (digitos: number[]): number => {
    let peso = digitos.length + 1
    let soma = 0
    for (const digito of digitos) {
      soma += digito * peso
      peso -= 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const digitoVerificador1 = calcularDigitoVerificador(base)
  const digitoVerificador2 = calcularDigitoVerificador([...base, digitoVerificador1])

  return [...base, digitoVerificador1, digitoVerificador2].join('')
}

// --- Seed: nomes curtos usados no relatório <-> nome completo prefixado ---

const NOMES_CURTOS = [
  'GestorA',
  'ColabA1',
  'ColabA2',
  'ColabA3',
  'GestorB',
  'ColabB1',
  'GestorC',
] as const

type NomeCurto = (typeof NOMES_CURTOS)[number]

function nomeCompletoDe(nomeCurto: NomeCurto): string {
  return `ZTeste_${nomeCurto}`
}

/** Remove o prefixo `ZTeste_` de um `nomeCompleto` vindo de `resolverOpcoesPessoa` (defesa: se algo fora do seed vazar aqui, mantém o nome completo em vez de cortar errado). */
function nomeCurtoDe(nomeCompleto: string): string {
  return nomeCompleto.startsWith('ZTeste_') ? nomeCompleto.slice('ZTeste_'.length) : nomeCompleto
}

interface ColaboradorSeed {
  id: string
  nomeCurto: NomeCurto
}

// --- Tabela de resultado esperado (autoritativa, derivada pelo orquestrador
// a partir das regras reais de `resolverOpcoesPessoa` — ver docstring atual
// da função para conferir, mas não precisa ser re-derivada aqui) -----------

// Subconjunto de FiltroRelacionamentoPessoa efetivamente exercitado por este
// script (os 4 filtros pedidos pela spec) — `Record<FiltroRelacionamentoPessoa, ...>`
// exigiria também `autoavaliacao`/`gestor` (que resolverOpcoesPessoa trata à
// parte, fora do escopo deste diagnóstico), então usamos este tipo mais
// estreito só para a tabela ESPERADO/loop de verificação; cada valor
// individual continua sendo um `FiltroRelacionamentoPessoa` válido ao chamar
// a função real.
type FiltroTestado = 'pares' | 'subordinado' | 'todos_gestores' | 'externo'

const FILTROS: FiltroTestado[] = ['pares', 'subordinado', 'todos_gestores', 'externo']

const ESPERADO: Record<NomeCurto, Record<FiltroTestado, NomeCurto[]>> = {
  GestorA: {
    pares: ['ColabA1', 'ColabA2', 'ColabA3'],
    subordinado: ['ColabA1', 'ColabA2'],
    todos_gestores: ['GestorB', 'GestorC'],
    externo: [],
  },
  ColabA1: {
    pares: ['GestorA', 'ColabA2', 'ColabA3'],
    subordinado: [],
    todos_gestores: ['GestorA', 'GestorB', 'GestorC'],
    externo: [],
  },
  ColabA2: {
    pares: ['GestorA', 'ColabA1', 'ColabA3'],
    subordinado: [],
    todos_gestores: ['GestorA', 'GestorB', 'GestorC'],
    externo: [],
  },
  ColabA3: {
    pares: ['GestorA', 'ColabA1', 'ColabA2'],
    subordinado: [],
    todos_gestores: ['GestorA', 'GestorB', 'GestorC'],
    externo: [],
  },
  GestorB: {
    pares: ['ColabB1'],
    subordinado: ['ColabB1', 'ColabA3'],
    todos_gestores: ['GestorA', 'GestorC'],
    externo: [],
  },
  ColabB1: {
    pares: ['GestorB'],
    subordinado: [],
    todos_gestores: ['GestorA', 'GestorB', 'GestorC'],
    externo: [],
  },
  GestorC: {
    pares: [],
    subordinado: [],
    todos_gestores: ['GestorA', 'GestorB'],
    externo: [],
  },
}

// --- Helper: RelacionamentoAvaliacao sintético -----------------------------

/**
 * `resolverOpcoesPessoa` só lê `.avaliadorId` e `.cicloId` do relacionamento
 * recebido (ver a implementação em coleta-respostas-publica.service.ts) — as
 * demais colunas/relações da entidade real (`ciclo`, `avaliador`, `avaliado`,
 * `tipoRelacionamento`, `criadoEm`, `id`) nunca são tocadas, então não
 * precisam ser preenchidas aqui. `as unknown as RelacionamentoAvaliacao`
 * documenta que este é um objeto sintético de diagnóstico, nunca uma linha
 * real vinda do banco.
 */
function relacionamentoSintetico(avaliadorId: string, cicloId: string): RelacionamentoAvaliacao {
  return { avaliadorId, cicloId } as unknown as RelacionamentoAvaliacao
}

// --- Cores ANSI (só legibilidade, sem dependência nova) --------------------

const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const RESET = '\x1b[0m'

async function main(): Promise<void> {
  await AppDataSource.initialize()

  try {
    console.log('=== 1. Seed: cenário ZTeste_ ===\n')

    // --- Equipes ---
    const equipeA = await equipesService.criar(atorSintetico, { nome: 'ZTeste_EquipeA' })
    const equipeB = await equipesService.criar(atorSintetico, { nome: 'ZTeste_EquipeB' })
    console.log(`Equipes criadas: ${equipeA.nome} (${equipeA.id}), ${equipeB.nome} (${equipeB.id})`)

    // --- Gestores (ehGestor = true) ---
    const gestorA = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('GestorA'),
      cpf: gerarCpfValido(1),
      papel: 'colaborador',
      ehGestor: true,
      equipeId: equipeA.id,
    })

    // Reatribui o ator sintético para apontar para um colaborador REAL agora
    // que `gestorA` existe — necessário só a partir daqui, porque
    // `ciclosAvaliacaoService.criar()` (chamado mais abaixo) grava
    // `criadoPor: ator.id`, e `ciclos_avaliacao.criado_por` tem FK para
    // `colaboradores.id` (ver comentário na declaração de `atorSintetico`).
    atorSintetico.id = gestorA.id

    const gestorB = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('GestorB'),
      cpf: gerarCpfValido(2),
      papel: 'colaborador',
      ehGestor: true,
      equipeId: equipeB.id,
    })

    const gestorC = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('GestorC'),
      cpf: gerarCpfValido(3),
      papel: 'colaborador',
      ehGestor: true,
      // Sem equipeId, sem ninguém com gestorId = GestorC — só existe pra
      // aparecer no filtro `todos_gestores`.
    })

    // --- Colaboradores comuns ---
    const colabA1 = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('ColabA1'),
      cpf: gerarCpfValido(4),
      papel: 'colaborador',
      gestorId: gestorA.id,
      equipeId: equipeA.id,
    })

    const colabA2 = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('ColabA2'),
      cpf: gerarCpfValido(5),
      papel: 'colaborador',
      gestorId: gestorA.id,
      equipeId: equipeA.id,
    })

    // Propósito explícito deste registro: gestorId aponta para GestorB (de
    // OUTRA equipe), mas equipeId continua sendo EquipeA (mesma equipe dos
    // outros três) — confirma que `pares` é resolvido por equipe, não por
    // gestor.
    const colabA3 = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('ColabA3'),
      cpf: gerarCpfValido(6),
      papel: 'colaborador',
      gestorId: gestorB.id,
      equipeId: equipeA.id,
    })

    const colabB1 = await colaboradoresService.criar(atorSintetico, {
      nomeCompleto: nomeCompletoDe('ColabB1'),
      cpf: gerarCpfValido(7),
      papel: 'colaborador',
      gestorId: gestorB.id,
      equipeId: equipeB.id,
    })

    const colaboradoresSeed: Record<NomeCurto, ColaboradorSeed> = {
      GestorA: { id: gestorA.id, nomeCurto: 'GestorA' },
      ColabA1: { id: colabA1.id, nomeCurto: 'ColabA1' },
      ColabA2: { id: colabA2.id, nomeCurto: 'ColabA2' },
      ColabA3: { id: colabA3.id, nomeCurto: 'ColabA3' },
      GestorB: { id: gestorB.id, nomeCurto: 'GestorB' },
      ColabB1: { id: colabB1.id, nomeCurto: 'ColabB1' },
      GestorC: { id: gestorC.id, nomeCurto: 'GestorC' },
    }

    console.log('Colaboradores criados:')
    for (const nomeCurto of NOMES_CURTOS) {
      console.log(`  ${nomeCurto} -> ${colaboradoresSeed[nomeCurto].id}`)
    }

    // --- Ciclo de avaliação ---
    const ciclo = await ciclosAvaliacaoService.criar(atorSintetico, {
      nome: 'ZTeste_Ciclo360',
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
      tiposRelacionamentoGerados: ['autoavaliacao', 'gestor', 'pares', 'subordinado'],
    })
    console.log(`\nCiclo criado: ${ciclo.nome} (${ciclo.id}), status=${ciclo.status}`)

    // --- Participantes (os 7 colaboradores do seed) ---
    await cicloParticipantesService.adicionarIndividual(atorSintetico, ciclo.id, {
      colaboradorIds: NOMES_CURTOS.map((nomeCurto) => colaboradoresSeed[nomeCurto].id),
    })
    console.log(`Participantes adicionados ao ciclo: ${NOMES_CURTOS.length}`)

    // --- Pesquisa avaliacao_360, com 1 página + 1 pergunta, publicada ---
    const pesquisa = await pesquisasService.criar(atorSintetico, {
      titulo: 'ZTeste_Pesquisa360',
      tipo: 'avaliacao_360',
    })

    const pagina = await paginasPesquisaService.criar(atorSintetico, pesquisa.id, {
      titulo: 'ZTeste_Pagina1',
    })

    // texto_aberto por simplicidade — este script chama `resolverOpcoesPessoa`
    // DIRETAMENTE (não via formulário público), então nenhuma pergunta
    // `pessoa` real precisa existir na pesquisa para o diagnóstico funcionar;
    // só precisamos de pelo menos 1 pergunta para a pesquisa poder ser
    // publicada (pesquisasService.atualizarStatus exige totalPerguntas > 0).
    await perguntasService.criar(atorSintetico, pesquisa.id, pagina.id, {
      tipo: 'texto_aberto',
      enunciado: 'ZTeste_Pergunta de diagnóstico (não usada pela verificação)',
      obrigatoria: false,
    })

    await pesquisasService.atualizarStatus(atorSintetico, pesquisa.id, { status: 'publicada' })
    await pesquisasService.atualizar(atorSintetico, pesquisa.id, { cicloId: ciclo.id })
    console.log(`Pesquisa criada, publicada e vinculada ao ciclo: ${pesquisa.titulo} (${pesquisa.id})`)

    // --- Ativação do ciclo: dispara gerarRelacionamentos internamente ---
    const cicloAtivo = await ciclosAvaliacaoService.atualizarStatus(atorSintetico, ciclo.id, {
      status: 'ativo',
    })
    console.log(`Ciclo ativado: status=${cicloAtivo.status}\n`)

    // === 2/3. Verificação + relatório =====================================

    console.log('=== 2. Verificação: 28 chamadas a resolverOpcoesPessoa (7 pessoas x 4 filtros) ===\n')

    interface LinhaRelatorio {
      colaborador: NomeCurto
      filtro: FiltroRelacionamentoPessoa
      esperado: string[]
      obtido: string[]
      ok: boolean
    }

    const linhas: LinhaRelatorio[] = []

    for (const nomeCurto of NOMES_CURTOS) {
      const colaborador = colaboradoresSeed[nomeCurto]
      for (const filtro of FILTROS) {
        const relacionamento = relacionamentoSintetico(colaborador.id, ciclo.id)
        const opcoes = await resolverOpcoesPessoa(relacionamento, { filtroRelacionamento: [filtro] })

        const obtido = opcoes.map((opcao) => nomeCurtoDe(opcao.nomeCompleto)).sort()
        const esperado = [...ESPERADO[nomeCurto][filtro]].sort()
        const ok = JSON.stringify(obtido) === JSON.stringify(esperado)

        linhas.push({ colaborador: nomeCurto, filtro, esperado, obtido, ok })
      }
    }

    console.log('=== 3. Relatório ===\n')

    const formatarLista = (lista: string[]): string => (lista.length === 0 ? '(vazio)' : lista.join(', '))

    const colunas = linhas.map((linha) => ({
      colaborador: linha.colaborador,
      filtro: linha.filtro,
      esperado: formatarLista(linha.esperado),
      obtido: formatarLista(linha.obtido),
      status: linha.ok ? 'OK' : 'DIVERGE',
    }))

    const largura = (chave: keyof (typeof colunas)[number]): number =>
      Math.max(chave.length, ...colunas.map((linha) => linha[chave].length))

    const larguras = {
      colaborador: largura('colaborador'),
      filtro: largura('filtro'),
      esperado: largura('esperado'),
      obtido: largura('obtido'),
      status: largura('status'),
    }

    const formatarLinha = (celulas: { colaborador: string; filtro: string; esperado: string; obtido: string; status: string }): string =>
      [
        celulas.colaborador.padEnd(larguras.colaborador),
        celulas.filtro.padEnd(larguras.filtro),
        celulas.esperado.padEnd(larguras.esperado),
        celulas.obtido.padEnd(larguras.obtido),
        celulas.status.padEnd(larguras.status),
      ].join(' | ')

    console.log(
      formatarLinha({
        colaborador: 'colaborador',
        filtro: 'filtro',
        esperado: 'esperado',
        obtido: 'obtido',
        status: 'OK?',
      }),
    )
    console.log('-'.repeat(Object.values(larguras).reduce((a, b) => a + b, 0) + 4 * 3))

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]!
      const coluna = colunas[i]!
      const prefixo = linha.ok ? `${VERDE}` : `${VERMELHO}❌ `
      console.log(`${prefixo}${formatarLinha(coluna)}${RESET}`)
    }

    const totalOk = linhas.filter((linha) => linha.ok).length
    console.log(`\n${totalOk} de ${linhas.length} bateram.`)

    const divergencias = linhas.filter((linha) => !linha.ok)
    if (divergencias.length > 0) {
      console.log(`\n${VERMELHO}⚠️  Divergências encontradas:${RESET}`)
      for (const linha of divergencias) {
        console.log(
          `  - ${linha.colaborador} / ${linha.filtro}: esperado [${formatarLista(linha.esperado)}], obtido [${formatarLista(linha.obtido)}]`,
        )
      }
    } else {
      console.log(`${VERDE}Nenhuma divergência — todas as 28 chamadas bateram com o esperado.${RESET}`)
    }
  } finally {
    // === 4. SQL de limpeza (impresso, NUNCA executado por este script) =====
    console.log('\n=== 4. SQL de limpeza (copiar e rodar manualmente, fora deste script) ===\n')
    console.log(SQL_LIMPEZA)

    await AppDataSource.destroy()
  }
}

// Ordem respeita FK: filhos antes de pais.
// - envios_pesquisa referencia pesquisas/relacionamentos_avaliacao/ciclos_avaliacao.
// - relacionamentos_avaliacao e ciclo_participantes referenciam ciclos_avaliacao (sem coluna de nome direta -> filtra por sub-select em ciclos_avaliacao.nome).
// - perguntas referencia paginas_pesquisa; paginas_pesquisa referencia pesquisas (filtradas por sub-select em pesquisas.titulo, já que paginas_pesquisa.titulo pode ser NULL em outros registros não-ZTeste_).
// - colaboradores.gestor_id/equipe_id são ON DELETE SET NULL (self-referência e equipe) — seguros de apagar num único DELETE em lote.
const SQL_LIMPEZA = `
-- 1) envios_pesquisa: gerados na ativação do ciclo, ligados à pesquisa ZTeste_
--    (relacionamento) ou ao ciclo ZTeste_ (clima, não usado aqui, mas incluído por completude).
DELETE FROM envios_pesquisa
WHERE pesquisa_id = (SELECT id FROM pesquisas WHERE titulo = 'ZTeste_Pesquisa360')
   OR relacionamento_id IN (
        SELECT id FROM relacionamentos_avaliacao
        WHERE ciclo_id = (SELECT id FROM ciclos_avaliacao WHERE nome = 'ZTeste_Ciclo360')
      )
   OR ciclo_id = (SELECT id FROM ciclos_avaliacao WHERE nome = 'ZTeste_Ciclo360');

-- 2) relacionamentos_avaliacao: gerados na ativação do ciclo (sem coluna de nome direta).
DELETE FROM relacionamentos_avaliacao
WHERE ciclo_id = (SELECT id FROM ciclos_avaliacao WHERE nome = 'ZTeste_Ciclo360');

-- 3) ciclo_participantes: sem coluna de nome direta.
DELETE FROM ciclo_participantes
WHERE ciclo_id = (SELECT id FROM ciclos_avaliacao WHERE nome = 'ZTeste_Ciclo360');

-- 4) perguntas da página ZTeste_ (dentro da pesquisa ZTeste_).
DELETE FROM perguntas
WHERE pagina_id IN (
  SELECT id FROM paginas_pesquisa
  WHERE pesquisa_id = (SELECT id FROM pesquisas WHERE titulo = 'ZTeste_Pesquisa360')
);

-- 5) paginas_pesquisa da pesquisa ZTeste_.
DELETE FROM paginas_pesquisa
WHERE pesquisa_id = (SELECT id FROM pesquisas WHERE titulo = 'ZTeste_Pesquisa360');

-- 6) pesquisa ZTeste_.
DELETE FROM pesquisas WHERE titulo LIKE 'ZTeste_%';

-- 7) ciclo ZTeste_.
DELETE FROM ciclos_avaliacao WHERE nome LIKE 'ZTeste_%';

-- 8) colaboradores ZTeste_ (gestor_id/equipe_id são ON DELETE SET NULL, seguro em lote).
DELETE FROM colaboradores WHERE nome_completo LIKE 'ZTeste_%';

-- 9) equipes ZTeste_.
DELETE FROM equipes WHERE nome LIKE 'ZTeste_%';
`.trim()

main().catch((erro) => {
  console.error('\n[verificar-resolver-opcoes-pessoa] falha na execução do script:', erro)
  process.exitCode = 1
})
