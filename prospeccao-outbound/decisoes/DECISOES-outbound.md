# Decisões — Painel Outbound (Dash Prospecção)

Registro vivo das decisões, achados e pendências do painel de gestão Outbound (Google Apps Script + HubSpot direto). Ver também `docs/HANDOFF_DASH_PROSPECCAO.md` para arquitetura e histórico de bugs anteriores.

---

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
