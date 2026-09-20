# Status do Projeto — Portfólio de Projetos

Última atualização: 2026-09-19

## 1. O que foi implementado

- Rebuild completo do protótipo Base44 em stack própria (Node/TypeScript + React), com toda a lógica de KPIs, gatilhos e imutabilidade de baseline preservada das entregas anteriores.
- **Dashboard reutilizável por escopo**: o mesmo componente de dashboard (cards, gráficos, tabela) é usado tanto para o portfólio inteiro quanto para um projeto específico, através de um parâmetro de escopo no backend — não existem dois dashboards com lógica diferente.
- **Aba "Projetos"**: dropdown para selecionar um projeto e ver o dashboard filtrado só para ele, reaproveitando 100% do layout do dashboard geral.
- **Aba "Pessoas"**: CRUD completo (criar/editar/excluir) dos recursos do escritório de projetos, com campo Cargo. Sem controle de horas trabalhadas (decisão explícita — não há fonte de dado real para isso).
- **Aba "Tarefas"**: CRUD completo de tarefas, com filtro por status, busca e campo Prioridade (Alta/Média/Baixa).
- **Navegação lateral (sidebar)**: menu convertido de abas horizontais para sidebar vertical fixa, no padrão visual do protótipo Base44 de referência.
- **Suporte a 3 idiomas (PT/EN/ES)**: seletor de idioma na sidebar (🇧🇷🇺🇸🇪🇸). Traduz apenas a interface fixa (menus, títulos, botões, tooltips); dados cadastrados pelo usuário (nomes, status como "Em Andamento", prioridades) permanecem sempre no idioma original em que foram digitados.
- **Importação de planilhas** (CSV/XLSX) para Projetos, Tarefas e Pessoas, com preview e mapeamento de colunas.
- **Explorar Dados**: consulta ad-hoc com filtros, agrupamento e seleção de campos sobre Projetos/Tarefas/Pessoas.
- **Migração do banco de dados** de SQLite (local) para PostgreSQL (Neon, em nuvem), incluindo tradução do gatilho de imutabilidade de baseline para PL/pgSQL.
- **Deploy em produção**: aplicação publicada em `https://alicemagc.onrender.com`, com deploy automático a cada `git push` na branch `main` (GitHub → Render).

## 2. Arquivos principais alterados/criados nesta fase

**Backend**
- `src/server.ts` — rotas de API, serve os arquivos estáticos do frontend em produção, endpoints de Pessoas/Tarefas/listas auxiliares.
- `src/db.ts` — trigger de imutabilidade de baseline reescrito em PL/pgSQL.
- `src/domain/dashboardService.ts` — `montarPayloadDashboard(agora, escopoProjetoId?)`, função única reaproveitada para portfólio e projeto individual.
- `src/domain/pessoaService.ts` (novo) — CRUD de Pessoa.
- `src/domain/tarefaService.ts` — CRUD de Tarefa + campo `prioridade`.
- `src/domain/importService.ts`, `src/domain/explorerService.ts` — suporte aos novos campos `cargo`/`prioridade`.
- `prisma/schema.prisma` — provider Postgres, campos `cargo` (Pessoa) e `prioridade` (Tarefa).
- `.gitignore`, `.env.example` (novos) — preparação para deploy.

**Frontend**
- `web/src/App.tsx` — shell com sidebar + roteamento por estado local (sem react-router).
- `web/src/components/Nav.tsx` — sidebar vertical + seletor de idioma.
- `web/src/components/DashboardView.tsx` (novo) — componente único de dashboard, reaproveitado por escopo.
- `web/src/pages/DashboardPage.tsx`, `web/src/pages/ProjectListPage.tsx` — wrappers do dashboard (portfólio vs. projeto via dropdown).
- `web/src/pages/PeoplePage.tsx`, `web/src/pages/TasksPage.tsx` (novos) — CRUD com modal (`web/src/components/Modal.tsx`, novo).
- `web/src/i18n/translations.ts`, `web/src/i18n/LanguageContext.tsx` (novos) — dicionário e contexto de idioma.
- `web/src/format.ts` — funções `dias()` sensível a idioma; `num()`/`moeda()` permanecem fixos em pt-BR (decisão explícita).
- Todos os componentes visuais (`CardsLinha1`, `CardsLinha2`, `Charts`, `ProjectsTable`, `Common`, páginas) foram adaptados para usar `useLanguage()`/`t()`.

## 3. Estrutura atual do frontend (`web/src`)

```
web/src/
  api.ts                  # chamadas fetch para a API
  types.ts                # tipos compartilhados do payload do dashboard
  format.ts               # formatação de número/moeda/dias/data
  main.tsx                # entrypoint, envolve <App/> em <LanguageProvider>
  App.tsx                 # shell (sidebar + área de conteúdo por aba)
  i18n/
    translations.ts       # dicionário PT/EN/ES
    LanguageContext.tsx    # contexto + hook useLanguage()
  components/
    Nav.tsx                # sidebar + seletor de idioma
    DashboardView.tsx       # dashboard reutilizável (cards+gráficos+tabela)
    CardsLinha1.tsx / CardsLinha2.tsx
    Charts.tsx
    ProjectsTable.tsx
    Common.tsx              # Card, Tooltip, StatusDot, ValorOuTraco
    Modal.tsx                # modal + CampoForm genéricos
  pages/
    DashboardPage.tsx        # dashboard do portfólio inteiro
    ProjectListPage.tsx      # dropdown de projeto + dashboard escopado
    PeoplePage.tsx            # CRUD de Pessoas
    TasksPage.tsx              # CRUD de Tarefas
    ImportPage.tsx              # importação de planilhas
    ExplorerPage.tsx             # explorador de dados ad-hoc
```

Stack: React 18 + TypeScript + Vite (build estático servido pelo backend em produção).

## 4. Estrutura atual do backend (`src`)

```
src/
  server.ts                 # Express: rotas /api/* + serve o build do frontend
  db.ts                     # cliente Prisma + trigger de imutabilidade (Postgres)
  kpis.ts                   # cálculo de KPIs (RAG, CPI, OTD, ritmo, etc.)
  domain/
    dashboardService.ts      # monta o payload do dashboard (com/sem escopo)
    projetoService.ts          # CRUD/regras de Projeto
    tarefaService.ts             # CRUD/gatilhos de Tarefa
    pessoaService.ts               # CRUD de Pessoa
    importService.ts                 # preview + commit de importação CSV/XLSX
    explorerService.ts                 # consulta ad-hoc (Explorar Dados)
    kpiSnapshotJob.ts                   # job diário de snapshot de KPI (histerese de cor)
    regularizacaoService.ts               # regularização de dados legados
    appConfig.ts, constants.ts, datetime.ts, kpiAdapters.ts
  migrations/002_backfill_dados_legados.ts
  telas/regularizarProjetos.ts
```

Stack: Node.js + TypeScript + Express + Prisma ORM.

## 5. Banco de dados e conexão

- **Motor**: PostgreSQL, hospedado no **Neon** (serverless Postgres).
- **Conexão**: via variável de ambiente `DATABASE_URL` (string `postgresql://...` com `sslmode=require`), configurada localmente em `.env` (não versionado) e no painel do Render em produção.
- **Schema**: `prisma/schema.prisma` — modelos `Pessoa`, `Projeto`, `Tarefa`, `TarefaEvento` (histórico append-only), `AppConfig`, `KpiSnapshot` (histórico append-only para histerese de cor), `BaselineAuditLog`.
- **Integridade**: imutabilidade de `data_fim_baseline_original` garantida por trigger de banco (PL/pgSQL), criado automaticamente na inicialização do servidor (`garantirTriggersDeImutabilidade()`).
- **Observação**: o Neon em plano gratuito pode "suspender" a instância por inatividade; a primeira requisição após um período ocioso pode falhar/demorar (já observado em `prisma db push`) — normal, resolve-se sozinho na próxima tentativa.

## 6. Funcionalidades que já funcionam

- Dashboard do portfólio completo (saúde, OTD, CPI, atrasados, progresso ponderado, bloqueios, alocação de equipe, projetos desatualizados, tabela de projetos).
- Dashboard por projeto individual (mesmo componente, escopado via dropdown).
- CRUD de Pessoas e Tarefas (criar, editar, excluir).
- Importação de planilhas (Projeto/Tarefa/Pessoa) com preview e mapeamento.
- Explorar Dados (filtros, agrupamento, seleção de campos).
- Sidebar de navegação com todas as abas.
- Seletor de idioma (PT/EN/ES) persistido no navegador, cobrindo toda a interface fixa.
- Deploy em produção acessível publicamente em `https://alicemagc.onrender.com`, independente do computador do usuário estar ligado.
- Deploy automático via `git push` na branch `main`.

## 7. Problemas pendentes

- **Explorar Dados — rótulos de coluna não traduzidos**: os nomes dos campos exibidos nos checkboxes de seleção (Nome, Status, Orçamento, Progresso, etc.) vêm do backend (`ENTIDADES.campos[].label`) e continuam em português mesmo trocando o idioma da interface para EN/ES. Requer tradução no backend ou um mapeamento adicional no frontend — ainda não decidido/priorizado pelo usuário.
- **Revisão geral dos gráficos**: pedido explícito do usuário ("vamos melhorar esse gráficos", escopo "todos os gráficos, revisão geral") foi feito mas interrompido antes de qualquer alteração. Não foi retomado nem cancelado.
- Sem testes automatizados (`npm test` é placeholder).

## 8. Próximo passo recomendado

Confirmar com o usuário se deseja retomar a **revisão geral dos gráficos** (item pendente mais antigo e explicitamente solicitado), ou priorizar a tradução dos rótulos de campo da aba **Explorar Dados**. Ambos são itens de polimento — nenhum bloqueia o uso atual do sistema em produção.
