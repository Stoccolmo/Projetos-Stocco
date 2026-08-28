# Decisões — Painel Outbound (Dash Prospecção)

Registro vivo das decisões, achados e pendências do painel de gestão Outbound (Google Apps Script + HubSpot direto). Ver também `docs/HANDOFF_DASH_PROSPECCAO.md` para arquitetura e histórico de bugs anteriores.

---

## 27/08/2026 — Filtro de cidade (paridade com a dash de Inbound)

### Contexto
Rodrigo pediu para replicar no Outbound o filtro de Cidade que já existia na dash de Inbound (commit `f7a6a3e`, SP/RJ/BH/Outros).

### Implementação — bem mais simples que no Inbound
- O dado já estava disponível: `estado` (UF) já vinha no `DEAL_PROPS` do `Codigo.gs` e já era serializado em cada deal (`estado: p.estado || null`). **Nenhuma mudança de backend, nenhuma invalidação de cache** — só front-end.
- Novo `mapCidade_(uf)` no `Index.html`, cópia da regra do Inbound: `SP→SP`, `RJ→RJ`, `MG→BH`, resto/vazio→`Outros`. Agrupa por UF e não por nome de cidade de propósito, para que SP inclua ABC/Guarulhos/Osasco e BH inclua Nova Lima — é como a meta é cobrada.
- `filterByCidade()` entrou na composição de `filterDeals()`, junto com vendedor e origem.

### Diferença de arquitetura vs Inbound (vale registrar)
- No Inbound o filtro teve de ser aplicado **aba por aba** (`passaCidade_` fora de `aplicarFiltrosDimensoes_`), porque os itens da Evolução são timeline e não carregam cidade — incluir lá zerava o gráfico.
- No Outbound **todas as 6 abas** partem de `filterDeals(DATA.deals)` e todo deal carrega `estado`. Então o filtro entrou num ponto único e passou a valer em todas as abas de uma vez, sem exceção e sem esconder o seletor em aba nenhuma.

### Validação contra a base real (universo completo, 2.547 deals do pipeline outbound)
- Distribuição de `estado`: **RJ 1.167 (45,8%) · SP 1.044 (41,0%) · MG 255 (10,0%) · vazio 81 (3,2%)**. Nenhuma outra UF aparece — as 4 opções do Inbound cobrem a base inteira.
- `estado` é enumeração (`fieldType: select`) de 27 UFs no HubSpot, com valores em sigla — mesma forma que o Inbound consome, daí o mapa ser reaproveitável sem normalização extra.
- Teste funcional rodando as funções extraídas do próprio arquivo contra os 2.547 deals: SP 1.044 + RJ 1.167 + BH 255 + Outros 81 = 2.547 = total sem filtro. **Partição completa, nenhum deal órfão.**
- Sintaxe: os 9 blocos `<script>` conferidos antes e depois do patch — mesmo resultado (o bloco 0 falha em parser puro por conter o scriptlet `<?!= data ?>` do Apps Script, comportamento pré-existente, não regressão).

### Ressalva conhecida — meta NÃO é fatiada por cidade
- `metasForRange()` + `activeBdrs()` derivam a meta apenas do filtro de **vendedor**. Com uma cidade selecionada, o numerador (realizado) é filtrado mas o denominador (meta) continua o do time inteiro, então os cards de Atingimento ficam **subestimados**.
- Isso **não é novo**: o filtro de Origem já se comportava exatamente assim desde que foi criado. O filtro de cidade só herdou o mesmo comportamento, por consistência.
- Corrigir exige decisão de produto (existe meta por praça? como ratear os 3,2% sem estado?), então foi deixado explícito aqui em vez de resolvido por conta própria.

### Achado colateral (PRÉ-EXISTENTE, não causado por esta mudança) — 45,5% dos deals são descartados por `sdr` vazio
- Ao validar o filtro na UI com dados reais, a opção **BH apareceu com zero** deals. Investigado: dos 2.547 deals do pipeline outbound, o `Codigo.gs` descarta **1.160 (45,5%)** na linha `var bdrNome = BDR_OWNER_IDS[p.sdr]; if (!bdrNome) return;`.
- Em **todos** os 1.160 o motivo é o mesmo: a propriedade `sdr` está **vazia** (nenhum caso de id desconhecido).
- Cruzamento estado × `sdr`: **os 255 deals de MG têm `sdr` vazio, sem exceção** — por isso BH dá zero. Os 81 deals sem estado também. RJ perde 416 de 1.167 e SP 408 de 1.044.
- **96,3% dos descartados (1.117) têm `hubspot_owner_id` que JÁ está em `BDR_OWNER_IDS`** — ou seja, o dono é um dos 4 BDRs conhecidos, só o campo `sdr` não foi preenchido. Nos 255 de MG: Roberta 88, João Pedro 61, Pedro Porto 60, Caio 44, Eduarda de Barros 2.
- Concentração temporal: 1.031 dos descartados foram criados em **08/2026** e 129 em 07/2026 — indica mudança recente de processo/automação criando deals sem setar `sdr`.
- Impacto varia por aba (as métricas de reunião dependem de `data_da_reuniao`, e boa parte dos descartados está em Validação/Prospecção), mas o efeito no filtro novo é direto: **BH e Outros ficam vazios enquanto o `sdr` não for preenchido**.
- Caminhos possíveis, não aplicados por serem decisão de Rodrigo: (a) preencher `sdr` nos deals no HubSpot; (b) fallback no `Codigo.gs` para `hubspot_owner_id` quando `sdr` estiver vazio — recuperaria 96,3% e o mapa de ids já existe.

### Pendências
- [ ] Publicar no Apps Script (usar `Get-Content -Raw -Encoding UTF8` antes do `Set-Clipboard` — ver achado de encoding de 09/08).
- [ ] Decidir com Rodrigo se a meta deve ser fatiada por cidade nos cards de Atingimento (hoje não é, igual ao filtro de Origem).
- [ ] **Resolver o `sdr` vazio em 1.160 deals (45,5% do pipeline)** — sem isso a opção BH do filtro fica permanentemente em zero. Ver achado colateral acima.

## 09/08/2026 — Botão de atualização manual e rotas sem agrupamento

### Botão "Atualizar agora"
- Adicionado no canto superior direito do cabeçalho. Chama `refreshNow()` no backend via `google.script.run`.
- `refreshNow()` usa `LockService.getScriptLock()` (tryLock 500ms) para impedir que dois cliques concorrentes (de usuários diferentes) disparem `buildDashboardData()` ao mesmo tempo — a mesma razão pela qual o cache existe (rate limit do HubSpot com os 4 BDRs). Se já tem uma atualização rodando, retorna `{busy:true}` e o front avisa o usuário.
- Front mostra "Atualizando... (até 20s)" e desabilita o botão durante a chamada; ao voltar, recalcula `BDR_NAMES`/`ORIGEM_NAMES` (`recomputeDerived()`) e re-renderiza tudo com `renderShell()`.

### Reuniões por Rota — removido o agrupamento "Outras rotas"
- Antes: top 8 rotas + resto agrupado em "Outras rotas" (bucket). Rodrigo pediu o número exato de cada rota, sem bucket.
- Fix: `rotaSegments` agora mapeia todas as rotas distintas do período, sem slice/top-N. Bar chart e pizza mostram cada rota individualmente (cores do `ROTA_PALETTE` ciclam se houver mais rotas que cores disponíveis — puramente cosmético, não afeta os números).

### Achado técnico — encoding ao colar via clipboard
- Publicar via `Set-Clipboard`/`Ctrl+V` no editor do Apps Script quebrou acentuação (ex. "mês" → "mÃ¡s") quando o arquivo fonte foi lido no PowerShell sem especificar `-Encoding UTF8` explicitamente no `Get-Content -Raw`. Sem o parâmetro, o PowerShell 5.1 usa o codepage padrão do sistema pra interpretar o arquivo UTF-8, corrompendo caracteres multibyte.
- Fix pontual: sempre usar `Get-Content -Raw -Encoding UTF8` antes de `Set-Clipboard` ao publicar conteúdo com acentuação neste projeto.
- Achado secundário: a área de transferência usada é a do Windows real do usuário (compartilhada com o desktop) — se Rodrigo copiar algo em paralelo, o conteúdo pretendido pode ser sobrescrito antes do paste. Sempre verificar o tamanho/conteúdo do clipboard imediatamente antes de colar, e o conteúdo do editor imediatamente depois, antes de salvar.

### Pendências
- [ ] Nenhuma — validado ao vivo (botão testado end-to-end, timestamp atualizou; aba Online vs Presencial confirmada sem "Outras rotas").

## 07/08/2026 — Meta por mês, data efetiva como critério de crédito, e aba Online vs Presencial

### Contexto
Rodrigo reportou dois problemas no painel (meta de julho sobrescrita pela de agosto; número de agendamentos do mês não conferindo com o esperado) e pediu a mesma aba "Online vs Presencial" já existente no dashboard de Inbound, adaptada pro Outbound.

### Bug 1 — Meta histórica sendo sobrescrita
- Causa: `METAS_JSON` (Script Property) era um mapa único `{nome: meta}`, sem dimensão de mês. Toda vez que a meta do mês era atualizada, o valor do mês anterior era perdido.
- Fix: `METAS_JSON` agora é `{"2026-07": {...}, "2026-08": {...}}`. Front-end resolve o mês certo via `metasForRange(range)` com base no período selecionado.
- Metas de julho recuperadas do print do time: Caio Louback 22, João Pedro Modé 11, Pedro Porto 25, Roberta Lobasso 20 (total 78).

### Bug 2 — "5 agendamentos" vs 17 esperados no Funil vs Meta
- Não era bug: Visão Mês (foto cumulativa desde jun/26) e Visão Safra (só quem foi criado no período) medem coisas diferentes de "quantas reuniões foram marcadas neste mês". Esse terceiro número já existe na Visão Geral, card "Agendamentos feitos no período" (baseado em `stageDates[4]`, entrada na etapa Agendado).

### Nova regra — crédito de meta pela data em que a reunião foi confirmada efetiva, não pela data agendada
- Achado: uma reunião de Caio Louback, agendada para 31/07, só foi marcada `pre_vendas__reuniao_foi_efetiva = Sim` em 03/08 (confirmado no histórico de propriedade do HubSpot, UI de CRM, por Rosimere Santos). Rodrigo confirmou: **o que vale pra bater meta é quando a reunião foi confirmada efetiva**, não a data original marcada.
- Fix: novo campo `dataEfetiva` no backend, obtido via HubSpot Batch Read API com `propertiesWithHistory: ['pre_vendas__reuniao_foi_efetiva']` (⚠️ limite de 50 IDs por chamada, não 100 — a API rejeita lotes maiores com erro de validação).
- Regra de atribuição: `dataParaMeta(d) = d.reuniaoEfetiva === 'Sim' ? (d.dataEfetiva || d.dataReuniao) : d.dataReuniao`. Só reuniões já validadas usam a data efetiva; "A validar"/"Não válidas" continuam usando `data_da_reuniao` (não têm outra data disponível).
- Escopo da mudança: aplicada em Visão Geral (Total no período, Composição do volume, Atingimento) e Ranking (Realizado, Pro rata, Ating. Meta) — **não** aplicada em Evolução (métrica de ritmo/atividade, não de crédito de meta), Funil vs Meta (baseado em entrada de etapa) nem Cohort (baseado em criação/fechamento).
- Consequência: a mudança é retroativa — reuniões que "viraram Sim" depois da virada do mês migram de crédito pro mês da confirmação, não da data agendada original.

### Nova aba — Online vs Presencial
- Dados já existiam no pipeline (propriedade `tipo_de_reuniao` do Deal, label HubSpot "Tipo de reuniao (outbound)" — confirmado ser diferente da homônima do Lead usada no Inbound) — só faltava a UI.
- Adicionado: `hubspot_owner_id` ao `DEAL_PROPS` + `fetchOwnersMap_()` (HubSpot Owners API) pra resolver nome do Executivo de Vendas quando o negócio já migrou pro pipeline Vendas.
- Seções da aba: donut Online/Presencial/Agora (SVG puro, tooltip nativo via `<title>`), composição por pré-vendedor (barras empilhadas), reuniões por Executivo de Vendas (barras), reuniões por Rota (barra + pizza nova, ambas com tooltip de %, top 8 rotas + "Outras").

### Pendências
- [ ] Nenhuma pendência aberta desta sessão — validado ao vivo contra o caso real do Caio Louback (`dataEfetiva` retornou `2026-08-03T19:10:19.499Z`, batendo com o horário mostrado no histórico de propriedade do HubSpot).
