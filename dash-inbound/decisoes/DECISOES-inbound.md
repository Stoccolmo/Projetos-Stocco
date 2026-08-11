# Decisões — Dashboard Pré-Vendas (Inbound)

Registro vivo das decisões, achados e pendências do dashboard de Pré-Vendas Inbound (Google Sheets + Apps Script). Atualizado a cada sessão.

---

## 05/08/2026 — Meta de agosto, novas dimensões (Origem, Online vs Presencial) e achado de token exposto

### Contexto
Início do mês: era preciso lançar a meta de agosto na aba "Compilado de Passes" mantendo o histórico, e depois adicionar duas dimensões novas pedidas por Rodrigo: filtro de Origem no funil e uma visão "Online vs Presencial" das reuniões.

### Meta de agosto
- Confirmado que "Compilado de Passes" é 100% auto-rotativo por data (`Z2 = FIMMÊS(HOJE();-1)+1`) — só a coluna **Meta Time** é manual, todo o resto (Realizado, Dias Úteis etc.) recalcula sozinho a cada mês. "Manter histórico" não exige arquivar nada: os dados brutos (Neo Crescimento - PV, Passes Do Mês, Base Leads) continuam intactos nas abas-fonte.
- Meta de agosto aplicada: Eduarda de Barros 88, Giovanna Garcia 137, Pedro Dias 101, Vitória Miranda 81 (total 407, batendo com o print do time). **Luiz Fernando Pellegrini e Roberta Lobasso zerados** (saíram do time de Pré-Vendas inbound este mês, a pedido de Rodrigo) — corrigido `#DIV/0!` nas colunas de % desses dois com `SEERRO(...;0)`.

### Arquitetura descoberta (importante pra próximas sessões)
- **"Dashboard Pré-Vendas" é um projeto Apps Script STANDALONE** (não container-bound à planilha) — `Extensões > Apps Script` a partir da planilha abre um script container-bound DIFERENTE e irrelevante ("Projeto sem título", legado). O script real fica em `script.google.com/home/my` → lista de projetos.
- IDs de produção: planilha `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY`, script `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp` (ver correção abaixo sobre qual planilha é a real).
- **Ambiente de teste já existe** (de sessão anterior, redescoberto nesta): planilha `1JnxESNWy_CutGxR6ak_Ma8sG9QfJUc3xFqYbGDAgugE` ("[TESTE] Meta e Andamento - Cópia") + script `1WnKDxA7ZdHk3O-th1iKMrknFA5o3Y9IJKwWxN1c2LZqz_InwrFwbJUMs` ("Copy of Dashboard Pré-Vendas"). Usar esse, não criar um novo — copiar a planilha sozinha NÃO copia o script standalone (só copiaria o bound irrelevante).
- Truque técnico pra ler/editar arquivos do Apps Script via browser automation: o editor novo usa Monaco; `get_page_text` não funciona (canvas virtualizado). Ler via `window.monaco.editor.getModels()` + `.getValue().split('\n').slice(...)` (retornar ARRAY, nunca substring bruta grande — dispara bloqueio "[BLOCKED: Cookie/query string data]" do harness). Editar via `model.applyEdits([{range, text}])` (nunca digitar via teclado — autoclose de parênteses/aspas corrompe o código).

### Conversão LAV→Conectado→Agendado→Ganho (recorte Morador de Casa)
- LAV/Conectado só existem no objeto Lead do HubSpot (0-136) — Redshift não tem. Agendado (Passe) e Ganho (Concluído) existem em `entities.Deal` (Redshift), mas são snapshots por mês de entrada na etapa, não coorte fechada.
- Recorte "Morador de Casa" = `PerfilDoContato = 'Morador'` AND `CategoriaEstabelecimento = 'Casa'` no Deal; no Lead é `perfil_agrupado`/`tipo_de_estabelecimento` (valores exatos: "Morador", "Casa").
- `leads.gs` (`exportarLeadsParaSheets`) já importa ~38,5 mil leads do HubSpot pra aba "Base Leads 2025-2026" — é a fonte certa pra qualquer análise de funil de Lead.

### Nova dimensão: Origem em "Funil vs Meta"
Já existia implementado (dropdowns Origem Macro/Micro/Perfil/Tipo Estab., multi-select) de sessão anterior — só validado.

### Nova dimensão: "Online vs Presencial" — 2 bugs de dado corrigidos em sequência
1. **1º erro (meu)**: implementei puxando `tipo_de_reuniao` do objeto **Deal** (pipeline "Executivo de Vendas 2.0") — só 152-158 registros no histórico todo, muito abaixo do esperado.
2. **Causa raiz real**: existe uma propriedade **homônima só de nome, só de nome mesmo** — `tipo_de_reuniao` no objeto **Lead** (0-136), rotulada apenas "Tipo de Reunião" (sem "(outbound)"). É preenchida pelo **pré-vendedor** (SDR) como pré-requisito pra criar o Deal pro executivo de vendas — bate exatamente com os números reais (447 leads em julho/2026 vs. 427 confirmados por Rodrigo). Distribuição real: Online ~59% / Presencial ~40% / Agora ~1%.
3. **Lição**: HubSpot permite o MESMO nome interno de propriedade em objetos diferentes (Deal vs Lead) — sempre confirmar o objeto, não só o nome, antes de assumir qual campo é o certo.
4. Corrigido: `leads.gs` passou a puxar `tipo_de_reuniao` do Lead junto com LAV/Conectado/Agendado/Ganho; `TipoReuniao.gs` (a tentativa errada via Deal) foi deletado.

### Melhorias pedidas depois do 1º teste visual
- Gráfico de pizza/donut (SVG puro, sem lib externa) com tooltip de % no hover, no lugar da barra empilhada — cards numéricos mantidos.
- Rótulo "Vendedor" → "**Pré-vendedor**", trocado **globalmente** (é o mesmo time em toda a dash, não só nessa aba).
- Nova quebra **"Reuniões por Executivo de Vendas"**: junção Lead→Deal via propriedade raw `id_do_lead_associado` (number) no Deal, buscando em lotes de 100 via `id_do_lead_associado IN [...]`, owner resolvido com `obterMapaOwners_` (reaproveitado).
- Nova quebra **"Reuniões por Rota"**: usa `rota_do_lead`, já importado, sem chamada API nova.

### 🔴 Achado de segurança — token do HubSpot exposto em texto plano
`Leads.gs` (produção e teste) tem `LEADS_TOKEN_` hardcoded como string literal no código (`pat-na1-...`), violando a própria regra do `CLAUDE.md` do projeto ("nunca hardcode o valor em scripts ou no chat"). Comentário no código indica que esse token é **compartilhado com outra automação chamada "Automação"** — rotacionar exige coordenar as duas pontas (ou criar um Private App novo dedicado só ao dashboard, mais limpo e sem dependência cruzada). Confirmado que é um token **diferente** do `HUBSPOT_API_TOKEN` do `.env` local (Rodrigo não necessariamente tem acesso admin a esse Private App específico).

**Não é incidente ativo** (token não vazou pra fora do Workspace da Gabriel) — é dívida técnica pra resolver com calma.

### 🔴 Achado crítico — a "planilha mãe" que Rodrigo passou não é a que alimenta a dash oficial
A dash oficial (URL `.../AKfycbyI171A-.../exec`, implantação Versão 11 do script `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp`) tem `CONFIG.ID_PLANILHA_MAE` apontando pra `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY` ("Planilha - Meta e Andamento") — **não** para `1ErIzfW2tLLvgFkEJ_EPunJt99ew03wAQRFpETOisY2g` (a que Rodrigo linkou no início desta sessão como "planilha mãe"). Confirmado direto em "Gerenciar implantações" (não é inferência).

Consequência: a edição manual de Meta Time que fiz na `1ErIzfW2t...` foi na planilha errada — mas sem dano, porque a `1YebaL...` real já tinha os mesmos números (88/137/101/81=407, só 4 reps, sem linhas de Luiz Fernando Pellegrini/Roberta Lobasso) e "Realizado" já avançando de verdade (prova de que é a planilha ativa). Já a sincronização de leads do HubSpot (`exportarLeadsParaSheets`, análise Morador de Casa) foi feita **rodando o script certo**, então caiu na planilha certa — não precisou refazer.

**Lição para o futuro**: nunca assumir qual é "a" planilha/script de produção só pelo nome ou por um link recebido — sempre confirmar via `CONFIG.ID_PLANILHA_MAE` do script efetivamente implantado (Implantar → Gerenciar implantações → conferir o código de implantação bate com a URL oficial em uso).

### Pendências
- [ ] **Rotacionar/isolar o token do HubSpot em `Leads.gs`** — mover pra Script Properties + gerar Private App dedicado (ou coordenar rotação do compartilhado com quem mantém a "Automação"). Rodrigo pediu pra deixar em backlog e ser avisado.
- [x] Aplicar em produção as duas features validadas em teste (filtro de Origem + aba Online vs Presencial completa com donut/Executivo de Vendas/Rota) — concluído em 06/08/2026.
- [ ] Decidir sobre as 4 dimensões restantes do prompt original ainda não endereçadas: reuniões por cidade/praça, conversão por PerfilDoContato/CategoriaEstabelecimento, ciclo de vendas por origem, LAV como métrica visível na dash "oficial" (hoje só via análise pontual).

---

## 06/08/2026 — Bug do "Líder do período" em mês fechado + lacuna de meta histórica

### Contexto
Rodrigo filtrou julho/2026 (mês já fechado) no painel e viu números absurdos: "Líder do período" mostrando 567% da meta e "Atingimento" 0%. Pediu correção com instrução explícita: "vc tem acertado mas tem errado bastante, vamos fazer as coisas certas, se tiver dúvida me procura."

### Causa raiz nº1 — lacuna de dado histórico
A coluna de julho/2026 na aba "Meta Pré vendedor" (matriz mês × vendedor) estava **inteiramente vazia**. Rodrigo perguntou diretamente "Você tinha, você apagou?" — investigação do histórico de versões do Google Sheets foi inconclusiva (não achei prova de quem apagou ou se sempre esteve vazia). Fui transparente sobre a inconclusão em vez de assumir uma resposta. Rodrigo forneceu os valores reais (print de metas de julho: Eduarda 58, Giovanna 130, Pedro Dias 95, Vitória Miranda 76 — total 359) e deu a instrução permanente: **"nunca mais perca nada de histórico"**.

**Regra permanente daqui pra frente**: antes de tratar uma lacuna de dado histórico como "normal", checar o histórico de versões da planilha e pedir o dado real ao Rodrigo — nunca estimar ou aceitar a lacuna calada.

### Causa raiz nº2 — bug de código independente da lacuna de dado
Mesmo depois de preencher a meta de julho corretamente, "Líder do período" continuou mostrando 567% enquanto "Atingimento" já mostrava 108,1% (correto). Ou seja, havia um bug de código separado do bug de dado. Localizado em `Index.html`: o card do líder usava uma fonte de meta que não era period-aware (sempre pegava a meta do mês corrente, mesmo filtrando um mês passado). Corrigido adicionando `leaderAtingRow` — um lookup em `ating.rows` (retornado por `obterAtingimentoPorMes_()`) usado quando o período filtrado não é o mês corrente.

### Verificação
Testado em produção após a correção: Líder do período (Válidos) Giovanna 114% da meta (antes: 567%), Atingimento 108,1%, Atingimento Projetado 108,1% — todos coerentes entre si. Mês atual (agosto) não foi afetado pela mudança (Giovanna 84% da meta, igual antes e depois).

---

## 07/08/2026 — Gráfico de pizza em "Reuniões por Rota" + criação deste repositório

### Contexto
Rodrigo pediu que "Reuniões por Rota" (na aba Online vs Presencial) usasse o mesmo padrão de gráfico de pizza com tooltip de hover já implementado no painel Outbound (`../prospeccao-outbound`), pra usar numa reunião de rotas.

### Implementação
- Lido o código do painel Outbound (`buildPieSvg`/`buildDonutSvg`, tooltip via `<title>` nativo do SVG) como referência.
- No Inbound, o padrão de tooltip já existente é **superior** ao do Outbound: usa `showChartTip_`/`hideChartTip_` (JS customizado que segue o cursor do mouse), em vez do `<title>` estático do navegador. Decisão: manter esse padrão já existente e criar `buildPieSvg_()` reaproveitando o mesmo mecanismo de tooltip, em vez de copiar o padrão mais simples do Outbound.
- Implementado e aplicado no **ambiente de teste** (`1WnKDxA7ZdHk3O-th1iKMrknFA5o3Y9IJKwWxN1c2LZqz_InwrFwbJUMs`) via `model.applyEdits()` no editor Monaco (evita reescrever o arquivo inteiro e o bloqueio de conteúdo do harness ao ler de volta).
- **Ainda não copiado pra produção** — ver pendências.

### Achado técnico: diálogo nativo de "Salvar Como" trava a automação
Ao tentar salvar via `Ctrl+S` simulado, quando o foco não estava de fato dentro do editor Monaco, o próprio Chrome capturou o atalho como "Salvar página como", abrindo um diálogo nativo do Windows que **não pode ser fechado via automação** (CDP/JavaScript não alcança diálogos nativos do SO) — precisou de ação manual do Rodrigo pra fechar. Numa ocasião isso levou ao fechamento inesperado de todas as abas do grupo, perdendo a edição em memória do Monaco (não salva ainda) — teve que ser refeita. **Lição**: usar o ícone de salvar da própria UI do Apps Script, nunca o atalho de teclado, quando o foco do editor não está 100% garantido.

### Criação deste repositório
A pedido de Rodrigo, todo o contexto do projeto (código de produção, decisões, handoff) foi organizado numa pasta própria (`dash-inbound/`) dentro do repo GitHub `Stoccolmo/Projetos-Stocco`, no mesmo padrão já usado pelo projeto irmão `prospeccao-outbound/`. O código em `scripts/` é uma cópia da versão de **produção** (não da versão de teste com a pizza de Rota ainda pendente), capturada via download único de todos os arquivos do Apps Script concatenados num só Blob (técnica documentada em `docs/HANDOFF_DASH_INBOUND.md`).

Sem `git` configurado nem GitHub CLI/Desktop instalados na máquina — o commit foi preparado localmente e o **push é feito pelo próprio Rodrigo**, com a conta dele já autenticada.

### Pendências
- [x] Aplicar em produção o gráfico de pizza de "Reuniões por Rota" — concluído (ver 10/08/2026 abaixo).
- [ ] Rotacionar/isolar o token do HubSpot em `Leads.gs` (mantido do registro anterior).
- [ ] Dimensões do prompt original ainda não endereçadas (mantido do registro anterior).

---

## 10/08/2026 — Aba MRR por Pré-vendedor, gráficos de pizza sem agrupamento, remoção de Luiz/Roberta

### Aba nova: MRR por Pré-vendedor
Rodrigo pediu o mesmo relatório de MRR que já existe no painel Outbound (Cohort), mas por pré-vendedor Inbound: quanto dos agendamentos de cada SDR estão virando MRR. Implementado como uma aba nova ("MRR") em vez de dentro de Cohort, com duas tabelas (por mês de agendamento da reunião e por mês de venda/fechamento), incluindo conversão (%).

**Fonte de dados**: não existe join direto e barato via HubSpot API pra isso — a fonte real é Redshift (`entities.Deal.NomeProprietarioPreVendas`/`SobrenomeProprietarioPreVendas` = SDR que fez a reunião de qualificação, join com `reports.EventoAssinatura` via `IDDealHubspot = IDNegocio`, evento = 'Ativação', para pegar o MRR). Filtro usado: `Pipeline = 'Executivo de Vendas 2.0'` e SDR fora da lista de BDRs do Outbound (Caio Louback, João Pedro Mode, Pedro Porto) — essa pipeline mistura negócios Inbound e Outbound porque o campo "SDR" (`NomeProprietarioPreVendas`) é genérico a qualquer pré-vendas, então sem esse filtro a tabela ficaria contaminada com BDRs de Outbound.

**Limitação arquitetural importante**: o Apps Script **não tem como consultar o Redshift diretamente** (sem conector nativo). A tabela "MRR por Pré-vendedor" na planilha mãe é um **snapshot manual** — escrito uma vez via `escreverSnapshotMRR()` (Utils.gs) com os números já calculados fora do Apps Script (consulta ao Redshift feita nesta sessão). `Reader.gs` (`lerMRRPorPreVendedor_`) só lê essa aba; não recalcula nada. **Não é atualizado automaticamente** — para atualizar os números, alguém precisa rodar a consulta no Redshift de novo e re-escrever a aba (ou pedir pro Claude fazer isso numa sessão futura).

### Gráficos de pizza (Rota e Executivo de Vendas) — removido agrupamento "Outros"
Rodrigo pediu para não agrupar as fatias menores em "Outras rotas"/"Outros executivos" — queria ver todos os valores individualmente. Removida a lógica de top-8 + bucket; agora `rotaSegments`/`execSegments` mapeiam TODAS as chaves. Paleta de cores (`BREAKDOWN_PALETTE_`) expandida de 8 para 20 cores para reduzir repetição visual quando há muitas rotas/executivos (ainda cicla se passar de 20, mas a legenda com nome sempre desambigua).

### Remoção de Luiz Fernando Pellegrini e Roberta Lobasso
Luiz foi demitido; Roberta é do time de Outbound (não devia aparecer no painel Inbound de forma alguma — a menção anterior de "dupla atuação" estava errada, corrigido aqui). Adicionado `VENDEDORES_EXCLUIDOS_` (lista hardcoded com os dois nomes) filtrando tanto o dropdown de filtro "Pré-vendedor" quanto as linhas do mapa de metas (`popularMetas`/`popularSeletorVendedor` em `Index.html`) e as linhas correspondentes na aba de MRR (removidas diretamente do snapshot).

### Achado técnico: diálogos nativos bloqueando a automação, causa ainda não 100% clara
Múltiplos diálogos nativos do SO/Chrome travaram a automação do navegador nesta sessão em pontos diferentes (alguns depois de `Ctrl+S`, outros sem ação óbvia que os explicasse — em um caso, nem um popup de download nem de auth, aparentemente só um aviso inofensivo "Claude is active in this tab group" da própria extensão, que **não travava nada de verdade** — o timeout de screenshot nesse caso foi mais provavelmente uma instabilidade pontual do próprio CDP/renderer, não um diálogo real). **Lição**: antes de pedir pro usuário fechar algo, vale tentar de novo uma vez — parte desses "travamentos" se resolve sozinho.

### Deploy
Aplicado direto em produção (não só em teste) desta vez, incluindo o backend (`Code.gs` + `Reader.gs`, que teste já tinha ganho numa sessão anterior sem que produção tivesse recebido o equivalente — lição: ao portar mudanças de teste pra produção, checar Code.gs/Reader.gs também, não só Index.html). Implantado como **Versão 15**, mesma URL pública de sempre. Confirmado visualmente em produção com dados reais: aba MRR mostrando os 4 pré-vendedores certos (Eduarda, Giovanna, Pedro Dias, Vitória), sem Luiz/Roberta.

### Pendências
- [ ] Rotacionar/isolar o token do HubSpot em `Leads.gs` (mantido do registro anterior).
- [ ] Dimensões do prompt original ainda não endereçadas (mantido do registro anterior).
- [ ] **Automatizar (ou ao menos documentar um processo recorrente) para atualizar o snapshot de MRR por Pré-vendedor** — hoje é manual, feito rodando a consulta no Redshift e reescrevendo a aba via `escreverSnapshotMRR()`.
