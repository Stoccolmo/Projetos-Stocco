# Handoff — Painel Outbound (Dash Prospecção)

Documento de continuidade para retomar o trabalho no painel de gestão do Outbound/Pré-vendas em uma nova conversa, sem precisar reconstruir o contexto do zero.

## Link oficial (compartilhado com o time)

```
https://script.google.com/a/macros/gabriel.com.br/s/AKfycbxcQCd3evfVsX0leS_7ehTpIlaZ2AnV8DLjejaYkqy3zTwd2d8sg-yUivlYQp6qW23EAA/exec
```

Este link **não muda** entre implantações — cada nova versão é publicada como "Nova versão" na mesma implantação existente. Versão atual: **Versão 10** (06/08/2026).

Time que usa o painel: Caio Louback, João Pedro Modé, Pedro Porto, Roberta Lobasso (BDRs de pré-vendas).

## O que é

Dashboard de gestão do Outbound com 6 abas (Visão Geral, Ranking, Evolução, Funil vs Meta, **Online vs Presencial**, Cohort), com filtros globais de **Período** (incluindo range personalizado De/Até), **Vendedor** e **Origem** que recalculam tudo instantaneamente no navegador. Espelha o padrão de um dashboard de Inbound já existente. Roda 100% em Google Apps Script + HubSpot API direta, sem depender de warehouse.

## Arquitetura

- **Projeto Apps Script**: "Painel Outbound - Pre-Vendas", ID `1SqeoBSS-efHf5aQs2_MUmHIzelHrpPPQ4o0anUPkK-SfAPxx9UQvLBwj`, de propriedade de `rodrigo.stocco@gabriel.com.br`.
- **Arquivos**: `Código.gs` (backend, busca no HubSpot e monta cache) + `Índex.html` (frontend, todo em JS client-side dentro de `<script>` tags via `HtmlService`).
- **HubSpot direto**: pipeline Outbound BDR (`905667466`, 7 etapas) + pipeline Vendas (`79388826`, negócios "graduados" quando a reunião é agendada). Atribuição por campo `sdr`, que persiste entre pipelines.
- **Cache 4x/dia**: `refreshCache()` roda via gatilhos de horário (08h, 12h, 18h, 20h America/Sao_Paulo) e salva o JSON num arquivo do Drive (`CACHE_FILE_ID` nas Script Properties). `doGet()` lê do cache; só busca ao vivo no HubSpot se o cache não existir. Isso evita rate-limit do HubSpot com os 4 usuários simultâneos.
- **Script Properties**: `HUBSPOT_API_TOKEN`, `METAS_JSON` (desde 06/08/2026 versionado por mês: `{"2026-07": {...}, "2026-08": {...}}` — ver seção "Bugs corrigidos" #6), `CACHE_FILE_ID`.
- **Executivo de Vendas**: `fetchOwnersMap_()` busca `/crm/v3/owners` do HubSpot a cada `refreshCache()` e resolve `hubspot_owner_id` do negócio (só populado quando `pipeline === PIPELINE_VENDAS`) pro campo `execVendas` de cada linha.
- **Filtros são 100% client-side**: o servidor manda todos os deals crus; `STATE` + `filterDeals()`/`periodRange()`/`inRange()` no JS fazem toda a filtragem e agregação no navegador.

## Datas importantes de um negócio (fonte de muita confusão — leia antes de mexer em métricas)

Um deal tem 3 datas conceitualmente diferentes:
1. `dataCriacao` (`createdate`) — quando o lead entrou no HubSpot.
2. `dataReuniao` (`data_da_reuniao`) — data calendário da reunião marcada. É o que usa a métrica **"Total no período"** (usada para o atingimento de meta — **não mexer nisso**, Rodrigo confirmou que está correto).
3. `stageDates[4]` / `hs_v2_date_entered_1371354121` — quando o negócio de fato ENTROU na etapa Agendado. É o critério do relatório nativo do HubSpot ("agendamentos do mês"). Usado na seção **"Agendamentos feitos no período"**.

Confusão típica: "Total no período" (dataReuniao) e "Agendamentos feitos" (data de entrada em Agendado) são números diferentes de propósito — um é meta/resultado, outro é atividade/ritmo. Não são bug um do outro.

## Bugs já corrigidos nesta série de sessões

1. Rate limit do HubSpot → retry exponencial + sleep entre páginas.
2. Contaminação Roberta Lobasso (atende Inbound e Outbound) → filtro `tipo_de_reuniao HAS_PROPERTY` nos negócios graduados.
3. Funil "Visão Mês" inflado/circular → reconstrução por `hs_v2_date_entered_*` com `reachedIdxByCutoff()` (busca a etapa mais alta com data válida até o corte — resistente a lacunas causadas por uma correção manual em massa do HubSpot entre 15–29/07/2026).
4. Funil "Visão Safra" com % impossível (>100%) → usa `reachedIdx` (snapshot atual da etapa, sempre monotônico) em vez de checar existência de data por etapa.
5. Discrepância "15 agendamentos do Hub" vs "Total no período" → não era bug, eram métricas diferentes (ver seção acima). Resolvido adicionando o card "Agendamentos feitos no período" sem alterar "Total no período".
6. **Meta histórica sobrescrita mês a mês** (achado 06/08/2026) → `METAS_JSON` era um mapa achatado `{nome: meta}` sem dimensão de tempo; toda vez que a meta do mês virava, a do mês anterior era perdida (ex: Ranking de "Mês passado" mostrava a meta de agosto, não a de julho). Corrigido: `METAS_JSON` agora é `{"YYYY-MM": {nome: meta}}`; o front resolve o mês certo via `metasForRange(range)` usando o mês de `range.start`. **Atenção pra quem for atualizar a meta todo mês**: adicionar uma nova chave `"YYYY-MM"`, nunca sobrescrever o objeto todo.

## Funcionalidades entregues (mais recentes primeiro)

- **Aba "Online vs Presencial"** (06/08/2026, portada do padrão já usado no Inbound): donut de `tipo_de_reuniao` (Deal, valores "Reunião On Line"/"Presencial"/"Agora"), composição por pré-vendedor (barras empilhadas), reuniões por Executivo de Vendas (via `execVendas`, owner do negócio já graduado pra pipeline Vendas), reuniões por Rota (barra top-8 + **gráfico de pizza** com tooltip nativo `<title>` mostrando % ao passar o mouse — pedido explícito do Rodrigo pra facilitar apresentação). Todos os gráficos são SVG puro (`buildDonutSvg`/`buildPieSvg` em Index.html), sem lib externa, consistentes com o resto do painel.
- Filtro de **Período Personalizado** (campos De/Até) — `STATE.customStart`/`customEnd`, branch `'custom'` em `periodRange()`.
- Card **"Agendamentos feitos no período"** — usa `stageDates[4]`, mostra Validados/A validar/Não válidos com o mesmo critério do relatório nativo do Hub.
- Filtro global de **Origem** (associação/parceria).
- Ranking dividido em **Ating. Pro Rata** / **Ating. Meta**.
- Tooltips (`title`) nos gráficos de barra da Visão Geral.
- Linha **"Validados"** no funil.
- Duas tabelas de **MRR por BDR** na aba Cohort: por mês de agendamento da reunião e por mês de fechamento da venda (`closedate`).
- **Popovers de explicação** (ícone "ⓘ" clicável) em praticamente toda métrica do painel — pedido explícito do Rodrigo como boa prática de produto.

## Pendência em aberto: link mais bonito

Rodrigo pediu um link mais curto/bonito (tipo `dash-prospeccao-gabriel`). Apps Script não permite vanity URL nativa. Tentei criar uma página no Google Sites (`sites.google.com/a/gabriel.com.br/...`) como solução simples dentro do próprio Workspace, mas **o serviço Sites está desativado pelo administrador do Workspace gabriel.com.br** (erro "Serviço não permitido").

Duas rotas possíveis, ainda não executadas:
1. Rodrigo pedir ao **administrador do Google Workspace** para habilitar o Sites — depois disso, criar a página é rápido (só um link/redirect ou embed do dashboard).
2. Acionar o **time de infraestrutura** para configurar um subdomínio próprio (ex: `dash.gabriel.com.br`) redirecionando para o link do Apps Script. Essa é a rota recomendada quando envolve domínio/infra da empresa — não deve ser resolvida com serviços de terceiros tipo encurtadores externos.

## Notas técnicas para quem for editar o código

- Edição é feita direto no editor do Apps Script via automação de navegador — não existe cópia local "fonte da verdade"; qualquer cópia em pastas de scratchpad é só espelho de trabalho de uma sessão.
- **Verificação pós-edição**: exportar o projeto via Google Drive API (`download_file_content`, `exportMimeType: application/vnd.google-apps.script+json`, fileId = ID do projeto Apps Script acima), decodificar o `content` (base64 → JSON `{files:[{name,type,source}]}`), e comparar com o conteúdo pretendido (para HTML, normalizar removendo espaços em branco por linha antes de comparar, já que o Monaco pode alterar indentação sem alterar o conteúdo real).
- **Bug de indentação em cascata do Monaco**: colar/digitar arquivos grandes (500+ linhas) via automação de teclado pode inflar a indentação linha a linha. Fix: Ctrl+H → habilitar regex → buscar `^[ \t]+` → substituir por vazio → Substituir tudo → Ctrl+S.
- **Bug do dropdown de versão ao implantar**: clicar com o mouse em "Nova versão" no diálogo de implantação às vezes não registra (fica preso na versão antiga). Fix confiável: abrir o dropdown, pressionar **seta ↑** uma vez (foca "Nova versão", destaque cinza em vez de azul), depois **Enter**.
- **Selects nativos (`<select>`) dentro do iframe do HtmlService não são clicáveis via automação de navegador de forma direta** — abrir o dropdown com clique trava o pipeline de screenshot (popup nativo do SO). Alternativa que funciona: focar o select via clique + Tab, então usar seta ↓/↑ **uma tecla por vez** (cada mudança de valor dispara `renderShell()` que recria o DOM e derruba o foco, então é preciso re-focar a cada passo).
- O conteúdo do painel roda dentro de um **iframe sandboxed cross-origin** (padrão do HtmlService) — não dá para acessar via `document` do frame pai nem via `read_page`/`find` da extensão de navegador. Toda inspeção de UI precisa ser por screenshot + clique por coordenada.

## Prompt sugerido para iniciar a nova conversa

```
Estou continuando o trabalho no painel "Outbound — Painel de Gestão" (Google Apps Script +
HubSpot direto). Lê o arquivo C:\Users\rodrigo.stocco_gabri\Desktop\Nuvia\HANDOFF_DASH_PROSPECCAO.md
pra pegar o contexto completo (arquitetura, bugs já corrigidos, funcionalidades entregues,
convenções de edição/deploy). O link oficial do painel já implantado é:
https://script.google.com/a/macros/gabriel.com.br/s/AKfycbxcQCd3evfVsX0leS_7ehTpIlaZ2AnV8DLjejaYkqy3zTwd2d8sg-yUivlYQp6qW23EAA/exec
(ID do projeto Apps Script: 1SqeoBSS-efHf5aQs2_MUmHIzelHrpPPQ4o0anUPkK-SfAPxx9UQvLBwj)

Preciso de ajuda com: [DESCREVER AQUI O QUE VOCÊ QUER FAZER AGORA — ex: "resolver o link mais
bonito, já pedi pro admin habilitar o Google Sites" ou "adicionar uma nova métrica X" ou
"investigar por que o número Y está diferente do esperado"]
```
