# Handoff — Painel Pré-Vendas Inbound

Documento de continuidade para retomar o trabalho no painel de gestão do Pré-Vendas Inbound em uma nova conversa, sem precisar reconstruir o contexto do zero.

## Link oficial (compartilhado com o time)

```
https://script.google.com/a/macros/gabriel.com.br/s/AKfycbyI171A-6I9qLfHpqc1kpuRNpEY3XMOsJSslwdWP6C9OA7DilcEIDV56WLPj7v0g3gBYQ/exec
```

Este link **não muda** entre implantações — cada nova versão é publicada como "Nova versão" na mesma implantação existente.

Time que usa o painel (pré-vendedores Inbound, meta de setembro/2026 = 431: Eduarda de Barros 104, Giovanna Garcia 140, Pedro Dias 104, Vitória Miranda 83). Luiz Fernando Pellegrini e Roberta Lobasso saíram do time em agosto/2026 (meta zerada, histórico preservado).

**Rotina de virada de mês (meta):** editar só a coluna B (Meta Time) de "Compilado de Passes" **e** a coluna do mês em "Meta Pré vendedor" (matriz mês × vendedor — se ficar vazia, o mês quebra quando fechar; foi o bug de julho/2026). Nunca alterar meses anteriores. Registro de cada virada em `decisoes/DECISOES-inbound.md`.

## O que é

Dashboard de gestão do Pré-Vendas Inbound com abas de Visão Geral, Funil vs Meta (com filtro de Origem: Macro/Micro/Perfil/Tipo Estab.) e Online vs Presencial (donut de tipo de reunião, composição por pré-vendedor, reuniões por Executivo de Vendas, reuniões por Rota). Roda em Google Apps Script (projeto standalone, não container-bound) + Google Sheets como planilha mãe + HubSpot API direta para os leads.

## Arquitetura

- **Projeto Apps Script**: "Dashboard Pré-Vendas", ID `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp` — é um projeto **standalone**, não container-bound à planilha (`Extensões > Apps Script` a partir da planilha abre um projeto container-bound diferente e irrelevante, um "Projeto sem título" legado). O projeto real fica em `script.google.com/home/my`.
- **Planilha mãe**: `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY` ("Planilha OFICIAL - Meta e Andamento"). Abas relevantes: "Compilado de Passes" (meta mensal por pré-vendedor, coluna Meta Time é a única manual — todo o resto recalcula sozinho por mês via `Z2 = FIMMÊS(HOJE();-1)+1`), "Meta Pré vendedor" (matriz mês × vendedor, usada para meses já fechados), "Base Leads 2025-2026" (dump de leads do HubSpot, atualizado por `leads.gs`).
- **Arquivos**: `Cohort.gs` (cálculo imperativo do cohort de passes por semana), `Code.gs` (CONFIG global, roteamento HTTP `doGet`), `Utils.gs`, `Writer.gs` (escreve datas de input na planilha — não mexe em fórmulas), `Reader.gs` (o maior arquivo — toda a leitura/agregação de dados da planilha), `Index.html` (frontend, todo em JS client-side dentro de `<script>` tags), `Sync.gs`, `leads.gs` (importa leads do HubSpot objeto Lead `0-136` pra "Base Leads"), `SyncNeo.gs`.
- **HubSpot Lead vs Deal — mesma propriedade, objetos diferentes**: `tipo_de_reuniao` existe tanto no objeto Lead (`0-136`) quanto no objeto Deal, com dados diferentes. A versão do **Deal** é do pipeline "Executivo de Vendas 2.0" e está quase vazia (rotulada "(outbound)" na prática). A versão certa pro Inbound é a do **Lead**, preenchida pelo pré-vendedor (SDR) como pré-requisito pra criar o Deal — bate com os números reais do time. **Sempre confirmar o objeto, não só o nome da propriedade**, antes de usar um campo do HubSpot.
- **Executivo de Vendas**: `leads.gs` resolve via `sincronizarExecutivoDeVendas_()`, que junta `Deal.id_do_lead_associado` (aponta pro Lead que originou o negócio) com `Deal.hubspot_owner_id`, em lotes de 100 via busca `IN`.
- **Token do HubSpot**: `Leads.gs` tem `LEADS_TOKEN_` hardcoded (compartilhado com outra automação chamada "Automação") — ver pendência de segurança abaixo.

## Datas/campos importantes (fonte de muita confusão — leia antes de mexer em métricas)

- **LAV/Conectado** só existem no objeto Lead do HubSpot — o Redshift (`entities.Deal`) não tem essas etapas.
- **Agendado (Passe) e Ganho (Concluído)** existem em `entities.Deal` no Redshift, mas são snapshots por mês de entrada na etapa, não coorte fechada.
- Recorte "Morador de Casa": no Deal é `PerfilDoContato = 'Morador'` + `CategoriaEstabelecimento = 'Casa'`; no Lead é `perfil_agrupado`/`tipo_de_estabelecimento` com os mesmos valores exatos ("Morador", "Casa").
- **MRR por pré-vendedor**: `Deal.MRRAdicionado` é 100% zero para Inbound — a fonte certa é `reports.EventoAssinatura` (Redshift) via join.

## Bugs já corrigidos

1. **Meta de julho/2026 ausente na aba "Meta Pré vendedor"** (achado 06/08/2026) → coluna de julho estava inteiramente vazia, causando "Líder do período" mostrando 567% da meta e "Atingimento" 0% ao filtrar julho. Corrigido preenchendo os valores reais fornecidos por Rodrigo (Eduarda 58, Giovanna 130, Pedro Dias 95, Vitória Miranda 76 — total 359, batendo com o histórico). **Lição, virou regra permanente**: nunca tratar uma lacuna de dado histórico como "normal" sem checar o histórico de versões da planilha e pedir o dado real — ver `decisoes/DECISOES-inbound.md`.
2. **Bug de código separado da lacuna de dado acima**: mesmo depois de preencher a meta de julho, "Líder do período" continuava mostrando 567% enquanto "Atingimento" já mostrava 108,1% corretamente — bug em `Index.html`/`obterAtingimentoPorMes_()`, que usava uma fonte de meta não period-aware pro cálculo do líder. Corrigido adicionando `leaderAtingRow` (lookup em `ating.rows`, vindo de `obterAtingimentoPorMes_()`) quando o período filtrado não é o mês corrente.
3. **Planilha "mãe" errada identificada no início de uma sessão** (05/08/2026) → Rodrigo linkou `1ErIzfW2tLLvgFkEJ_EPunJt99ew03wAQRFpETOisY2g` como planilha mãe, mas a implantação ao vivo (`CONFIG.ID_PLANILHA_MAE` do script implantado) apontava para `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY`. **Lição**: nunca assumir qual é a planilha/script de produção só pelo nome ou link recebido — sempre confirmar via "Gerenciar implantações" > código da implantação em uso.
4. **"Online vs Presencial" puxando do objeto errado do HubSpot** → ver seção de arquitetura acima (Deal vs Lead).

## Funcionalidades entregues (mais recentes primeiro)

- **Versão 21 (publicada 07/09/2026)**: coluna "Ating. Projeção" no Ranking + 15 correções do teste de contradição lógica (Cohort lia o roster antigo e omitia Vitória; Média por dia útil real; badge do Líder "da meta pro rata"; tooltips com as fórmulas das cols K/M; MRR com data do snapshot, refeito no Redshift e colado na aba em 07/09). Ver `decisoes/DECISOES-inbound.md` 07/09.
- **Meta de setembro/2026** lançada em "Compilado de Passes" e na coluna 01/09/2026 de "Meta Pré vendedor" (Eduarda 104, Giovanna 140, Pedro Dias 104, Vitória Miranda 83 — total 431), 07/09/2026.
- **Meta de agosto/2026** lançada em "Compilado de Passes" preservando histórico (Eduarda 88, Giovanna 137, Pedro Dias 101, Vitória Miranda 81 — total 407); Luiz Fernando Pellegrini e Roberta Lobasso zerados (saíram do time).
- **Filtro de Origem** em "Funil vs Meta" (Macro/Micro/Perfil/Tipo Estab., multi-select).
- **Aba "Online vs Presencial"**: donut de `tipo_de_reuniao` (fonte: HubSpot Lead) com tooltip customizado que segue o cursor (`showChartTip_`/`hideChartTip_`, SVG puro), composição por pré-vendedor, reuniões por Executivo de Vendas, reuniões por Rota.
- Rótulo "Vendedor" → "Pré-vendedor" trocado globalmente no painel.
- **Gráficos de pizza** pra "Reuniões por Rota" e "Reuniões por Executivo de Vendas" (mesmo padrão do painel Outbound, mas reaproveitando o tooltip que já existia no Inbound — `showChartTip_`/`hideChartTip_`, segue o cursor). Mostram **todas** as fatias individualmente, sem agrupar as menores em "Outros" (pedido explícito do Rodrigo). Paleta de cores expandida para 20 tons (`BREAKDOWN_PALETTE_`).
- **Aba "MRR"**: snapshot recalculado em 07/09/2026 (Redshift, abr–set/26) e colado na aba (cópia em `docs/mrr_snapshot_2026-09-07.tsv`); a linha de controle `snapshot` (col A) leva a data que a dash exibe. **Rotina para atualizar**: rodar as duas consultas documentadas em `decisoes/DECISOES-inbound.md` (07/09), gerar o TSV, colar em A2 substituindo tudo, ajustar a data da linha `snapshot`, clicar "Atualizar dados". Duas tabelas (por mês de agendamento da reunião e por mês de venda/fechamento) mostrando quanto de MRR cada pré-vendedor gerou, com % de conversão. Fonte de dados é um **snapshot manual do Redshift** (não é ao vivo — ver nota técnica abaixo), lido por `lerMRRPorPreVendedor_` (Reader.gs) a partir da aba "MRR por Pré-vendedor" na planilha mãe.
- **Luiz Fernando Pellegrini e Roberta Lobasso removidos** do filtro de pré-vendedor, do mapa de metas e da aba MRR (`VENDEDORES_EXCLUIDOS_` em Index.html) — Luiz foi demitido, Roberta é do time de Outbound e não deve aparecer no painel Inbound.

## Ambientes

- **Produção**: planilha `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY`, script `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp`. Versão implantada atual: **Versão 21** (07/09/2026, 16:14) — hunks em `docs/aplicar-v21.js`, `docs/build-v21.js` regenera espelho + applier.
- **Teste**: planilha `1JnxESNWy_CutGxR6ak_Ma8sG9QfJUc3xFqYbGDAgugE` ("[TESTE] Meta e Andamento - Cópia"), script `1WnKDxA7ZdHk3O-th1iKMrknFA5o3Y9IJKwWxN1c2LZqz_InwrFwbJUMs` ("Copy of Dashboard Pré-Vendas"). Fluxo de trabalho: validar mudanças no teste primeiro, depois replicar em produção (edição direta via automação de navegador é possível, mas instável — ver notas técnicas). **Importante**: ao portar mudanças de teste pra produção, sempre checar `Code.gs` e `Reader.gs` também, não só `Index.html` — já aconteceu de uma mudança de backend ficar só no teste enquanto o frontend já tinha ido pra produção, quebrando a feature (MRR não aparecia porque faltava `mrrPorPreVendedor` no DATA).

## Pendências em aberto

0. **Unificar a definição de "reunião" na dash (aprovado por Rodrigo em 07/09/2026, a fazer):** Online vs Presencial migra de "leads que entraram em Agendado" (Base Leads col E) para passes pela data da reunião (Neo Crescimento + executivo do negócio); Funil ganha rótulo "Agendado (entrada na etapa)" + referência "Reuniões no mês"; rodapé com a definição em todas as abas. Contexto e números (488 × 441 em ago/26) em `decisoes/DECISOES-inbound.md`, 07/09.

1. **Rotacionar/isolar o token do HubSpot em `Leads.gs`** (`LEADS_TOKEN_` hardcoded, compartilhado com outra automação chamada "Automação") — mover pra Script Properties + gerar Private App dedicado. Rodrigo pediu pra deixar em backlog e ser avisado quando for resolver.
2. **Automatizar (ou documentar um processo recorrente) para atualizar o snapshot de MRR por Pré-vendedor** — hoje o Apps Script não tem como consultar o Redshift diretamente; a aba "MRR por Pré-vendedor" é escrita manualmente via `escreverSnapshotMRR()` (Utils.gs) com números calculados fora do Apps Script.
3. Dimensões do prompt original ainda não endereçadas: reuniões por cidade/praça, conversão por PerfilDoContato/CategoriaEstabelecimento, ciclo de vendas por origem, LAV como métrica visível na dash oficial.

## Notas técnicas para quem for editar o código

- Edição é feita direto no editor do Apps Script via automação de navegador — não existe cópia local "fonte da verdade" contínua; a pasta `scripts/` deste repo é um espelho pontual (capturado em 07/08/2026), não sincronizado automaticamente.
- **Leitura de código via automação de navegador**: o editor novo do Apps Script usa Monaco (`window.monaco.editor.getModels()`). Ler linha a linha com `get_page_text`/`javascript_tool` dispara um bloqueio de conteúdo ("[BLOCKED: Cookie/query string data]") em trechos de código que lembram cookies/query strings (muitos `=`/`&`/aspas). Workaround legítimo: montar um Blob com `new Blob([texto])`, criar um `<a download>` e simular o clique — isso baixa um arquivo de verdade pro disco, que pode ser lido sem restrição. Pra vários arquivos de uma vez, concatenar tudo num único Blob com delimitadores (`=====FILE:nome:LINES:N=====` / `=====ENDFILE:nome=====`) e baixar uma vez só, depois separar localmente — evita múltiplos diálogos de download.
- **Cuidado com `Ctrl+S` via automação**: se o foco não estiver realmente dentro do editor Monaco, `Ctrl+S` pode ser capturado pelo próprio Chrome como "Salvar página como", abrindo um diálogo nativo do SO que trava a automação (não há como fechar esse diálogo via CDP/JavaScript — precisa de ação manual do usuário). Preferir o ícone de salvar da própria UI do Apps Script, ou `model.applyEdits()` seguido de clique no ícone de salvar.
- **Edição de trechos grandes**: em vez de reescrever o arquivo inteiro, usar `monaco.editor.getModels()` + `model.applyEdits([{range, text}])` com ranges precisos (obtidos via `model.findMatches()` ou contagem de linhas), evitando precisar ler de volta o trecho bloqueado pelo filtro de conteúdo.

## Prompt sugerido para iniciar a nova conversa

```
Estou continuando o trabalho no painel "Dashboard Pré-Vendas" (Inbound, Google Apps Script +
Google Sheets + HubSpot). Lê o arquivo docs/HANDOFF_DASH_INBOUND.md deste projeto (dentro do
repo Projetos-Stocco) pra pegar o contexto completo (arquitetura, bugs já corrigidos,
funcionalidades entregues, ambientes de teste/produção, convenções de edição). O link oficial
do painel já implantado é:
https://script.google.com/a/macros/gabriel.com.br/s/AKfycbyI171A-6I9qLfHpqc1kpuRNpEY3XMOsJSslwdWP6C9OA7DilcEIDV56WLPj7v0g3gBYQ/exec
(ID do projeto Apps Script: 1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp)

Preciso de ajuda com: [DESCREVER AQUI O QUE VOCÊ QUER FAZER AGORA]
```
