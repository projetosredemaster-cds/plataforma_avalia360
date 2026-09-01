"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
// Runner escolhido: Vitest — não há Postgres/Supabase real disponível nesta
// sessão (ver restrição registrada em .claude/tasks/cadastro-colaboradores-equipes).
// Vitest foi escolhido porque:
// - já é natural no ecossistema Vite do frontend deste mesmo repo (mesma
//   ferramenta, sem curva de aprendizado nova para quem mantém os dois lados);
// - transpila TS via esbuild sem depender do `tsc`/tsconfig estrito do
//   projeto (que usa `nodenext`/`verbatimModuleSyntax` ajustado e TypeScript
//   7.x experimental), evitando atrito de configuração de build só para rodar
//   testes;
// - suporta `experimentalDecorators`/`emitDecoratorMetadata` (necessários
//   para os decorators do TypeORM nas entidades) via leitura do tsconfig;
// - `vi.mock` com hoisting automático é suficiente para isolar `data-source`
//   (TypeORM `DataSource`) e `lib/supabaseAdmin` (Supabase Admin client) sem
//   nenhuma conexão real, que é exatamente o que esta suíte precisa.
exports.default = (0, config_1.defineConfig)({
    test: {
        environment: 'node',
        setupFiles: ['./src/test/env-setup.ts', './src/test/mocks-setup.ts'],
        include: ['src/**/*.spec.ts'],
        restoreMocks: true,
    },
});
//# sourceMappingURL=vitest.config.js.map