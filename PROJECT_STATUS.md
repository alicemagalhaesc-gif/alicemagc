# Status do Projeto — Portfólio de Projetos

Última atualização: 2026-09-19

## 1. O que foi implementado

- Rebuild completo do protótipo Base44 em stack própria (Node/TypeScript + React), com toda a lógica de KPIs, gatilhos e imutabilidade de baseline preservada das entregas anteriores.
- **Dashboard reutilizável por escopo**: o mesmo componente de dashboard (cards, gráficos, tabela) é usado tanto para o portfólio inteiro quanto para um projeto específico, através de um parâmetro de escopo no backend.
- **Aba "Projetos"**: dropdown para selecionar um projeto e ver o dashboard filtrado só para ele, reaproveitando 100% do layout do dashboard geral.
- **Aba "Pessoas"** e **"Tarefas"**: CRUD completo (criar/editar/excluir), com campos Cargo e Prioridade.
- **Navegação lateral (sidebar)** + **suporte a 3 idiomas** (PT/EN/ES, seletor na sidebar). Traduz só a interface fixa — dados cadastrados pelo usuário nunca são traduzidos.
- **Login com senha** (autenticação por cookie/JWT) — toda a API exige sessão autenticada, exceto `/api/login`, `/api/logout`, `/api/me`.
- **Importação de planilhas genérica** (CSV/XLSX) para Projetos, Tarefas e Pessoas, com preview e mapeamento manual de colunas.
- **Importador dedicado do MS Project (EAP completa)**: novo modo "MS Project (EAP)" na aba Importar — sobe o export "Planilha de Tarefas" e cria/atualiza o projeto inteiro automaticamente, sem mapeamento manual (formato fixo e conhecido). Ver detalhes na seção 6.
- **Legendas (ⓘ) em todo o dashboard**: ícone com tooltip explicando cada um dos 8 cards, 5 gráficos e as colunas calculadas da tabela de projetos.
- **Explorar Dados**: consulta ad-hoc com filtros, agrupamento e seleção de campos sobre Projetos/Tarefas/Pessoas.
- **Banco de dados em PostgreSQL** (Neon, em nuvem) — migrado de SQLite, incluindo tradução do gatilho de imutabilidade de baseline para PL/pgSQL.
- **Deploy em produção**: aplicação publicada em `https://alicemagc.onrender.com`, com deploy automático a cada `git push` na branch `main` (GitHub → Render).

## 2. Arquivos principais alterados/criados nesta fase

**Backend**
- `src/server.ts` — rotas de API, autenticação obrigatória em `/api/*`, serve os arquivos estáticos do frontend em produção.
- `src/domain/authService.ts` — login, hash de senha (bcrypt), geração/verificação de JWT.
- `src/domain/msProjectImportService.ts` (novo) — parse do export do MS Project (EDT, marcos, recursos com % de alocação, custo), upsert por `projetoId + edt`, proteção de baseline contra sobrescrita silenciosa.
- `src/domain/importService.ts` — decodificação automática de CSV em Windows-1252 (Excel em português salva CSV assim, não UTF-8) via `iconv-lite`; funções `parsearArquivo`/`normalizarCabecalho` agora exportadas e reaproveitadas pelo importador de MS Project.
- `src/domain/dashboardService.ts` — `montarPayloadDashboard(agora, escopoProjetoId?)`, função única para portfólio e projeto individual.
- `src/domain/pessoaService.ts`, `tarefaService.ts` — CRUD + campos `cargo`/`prioridade`.
- `prisma/schema.prisma` — Postgres; `Pessoa.email`/`senha_hash` (login); `Tarefa.edt/eh_marco/duracao_dias/custo_planejado/predecessoras_raw`; nova tabela `TarefaRecurso` (alocação por % vinda do MS Project); `Projeto.origem_dados`.

**Frontend**
- `web/src/App.tsx`, `web/src/components/Nav.tsx` — shell com sidebar + seletor de idioma.
- `web/src/components/DashboardView.tsx` — componente único de dashboard, reaproveitado por escopo.
- `web/src/components/Common.tsx` — novo `InfoTooltip` (ícone ⓘ), usado em cards/gráficos/tabela.
- `web/src/pages/ImportPage.tsx` — segundo fluxo de import (MS Project), sem tela de mapeamento manual.
- `web/src/pages/PeoplePage.tsx`, `TasksPage.tsx` — CRUD com modal.
- `web/src/i18n/translations.ts` — dicionário PT/EN/ES, incluindo as novas legendas do dashboard e textos do importador de MS Project.

## 3. Estrutura atual do frontend (`web/src`)

```
web/src/
  api.ts, types.ts, format.ts, main.tsx, App.tsx
  i18n/            # translations.ts, LanguageContext.tsx
  components/
    Nav.tsx, DashboardView.tsx
    CardsLinha1.tsx / CardsLinha2.tsx, Charts.tsx, ProjectsTable.tsx
    Common.tsx      # Card, Tooltip, InfoTooltip, StatusDot, ValorOuTraco
    Modal.tsx
  pages/
    DashboardPage.tsx, ProjectListPage.tsx
    PeoplePage.tsx, TasksPage.tsx
    ImportPage.tsx   # genérico (Projeto/Tarefa/Pessoa) + MS Project (EAP)
    ExplorerPage.tsx
```

Stack: React 18 + TypeScript + Vite (build estático servido pelo backend em produção).

## 4. Estrutura atual do backend (`src`)

```
src/
  server.ts, db.ts, kpis.ts
  domain/
    authService.ts               # login/JWT
    dashboardService.ts, projetoService.ts, tarefaService.ts, pessoaService.ts
    importService.ts             # import genérico (CSV/XLSX) + parsing compartilhado
    msProjectImportService.ts    # import dedicado da EAP do MS Project
    explorerService.ts, kpiSnapshotJob.ts, regularizacaoService.ts
    appConfig.ts, constants.ts, datetime.ts, kpiAdapters.ts
  migrations/002_backfill_dados_legados.ts
  telas/regularizarProjetos.ts
```

Stack: Node.js + TypeScript + Express + Prisma ORM.

## 5. Banco de dados e conexão

- **Motor**: PostgreSQL no **Neon** (serverless). Mesmo banco usado local e em produção (`DATABASE_URL`).
- **Schema**: `Pessoa` (com login), `Projeto`, `Tarefa` (com campos de EAP), `TarefaRecurso` (novo — alocação de recurso por tarefa), `TarefaEvento`, `AppConfig`, `KpiSnapshot`, `BaselineAuditLog`.
- **Integridade**: `data_fim_baseline_original` imutável por trigger de banco (PL/pgSQL); o importador de MS Project respeita isso — reimportar nunca sobrescreve a baseline, só avisa se divergir.
- **Observação**: Neon em plano gratuito "dorme" por inatividade; a primeira requisição depois de um tempo pode falhar/demorar — normal, resolve sozinho na tentativa seguinte.

## 6. Funcionalidades que já funcionam

- Dashboard do portfólio e por projeto (mesmo componente), com legenda em cada indicador.
- CRUD de Pessoas e Tarefas; login obrigatório para usar o site.
- Importação genérica de planilhas (Projeto/Tarefa/Pessoa) com mapeamento manual.
- **Importação da EAP do MS Project**: testada de ponta a ponta com um arquivo real de 188 linhas — 187 tarefas, 29 marcos e 19 recursos importados corretamente, incluindo acentuação (fix de encoding ANSI→UTF-8) e reimportação sem duplicar.
- Explorar Dados; sidebar; idioma PT/EN/ES.
- Deploy automático em produção via `git push` na `main`.

## 7. Problemas pendentes

- **Dashboard não reflete dados de projeto importado do MS Project**: os cards (CPI, Progresso, Bloqueadas, OTD, Throughput) leem sinais de *execução* (status de tarefa, progresso, gasto) que o MS Project não fornece — só planejamento. Um projeto recém-importado aparece com quase tudo zerado, o que é *matematicamente correto* mas pouco útil. Precisa de uma camada de KPIs "planejado" (discutida em detalhe na conversa, ainda não implementada) ou pelo menos o card de **Alocação da Equipe** atualizado pra ler a nova tabela `TarefaRecurso` (dado já existe, só falta o card usar).
- **Importador de Jira**: discutido e desenhado (tradução de status/prioridade em inglês, datas `dd/MMM/yy`, estimativa em segundos), mas não implementado — o usuário ainda não tem acesso/exemplo de export do Jira.
- **Explorar Dados** — rótulos de coluna (Nome, Status, Orçamento etc.) não traduzidos em EN/ES, vêm direto do backend.
- **Revisão geral dos gráficos** — pedido antigo do usuário, nunca retomado.
- Sem testes automatizados (`npm test` é placeholder).

## 8. Próximo passo recomendado

Decidir entre: (a) conectar o card de **Alocação da Equipe** à tabela `TarefaRecurso` — rápido, dado já existe; ou (b) avançar na camada de **KPIs de planejamento** (Andamento/Custos/Recursos "planejado", conforme a matriz discutida) pra o dashboard fazer sentido com projetos vindos do MS Project antes de terem execução registrada.
