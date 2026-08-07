# Especificação — Dashboard de Gestão Outbound (Google Sheets + Apps Script)

## 01/08/2026 — Prompt de escopo, no modelo da planilha de Inbound existente

### Contexto
Rodrigo já tem um painel de Inbound que funciona bem: uma planilha Google Sheets (link de referência: `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY`) que alimenta uma dashboard via Google Apps Script (web app publicado em `script.google.com/.../exec`). Quer o equivalente para Outbound, mesmo padrão de arquitetura (Sheets + Apps Script, dados vindos do HubSpot/warehouse).

### Estrutura confirmada da planilha de Inbound (referência de modelo)
- **Aba Meta x Realizado**: por Pré Vendedor — `Meta Time | Meta Pro Rata | Realizado | Atingimento Pro Rata | A Validar | Se todos Forem Válidos | Delta vs Meta | Atingimento Projeção | Passes/Dia Para Bater a Meta | Encerrou o Mês?`. Pro-rata calculado com base em dias úteis decorridos/total (tem mini-tabela de parâmetros: início/fim do mês, dias úteis, feriados).
- **Série histórica mensal** por pessoa (uma coluna por mês).
- **Painel semanal** ("Passes da Semana"), comparando semana atual vs anterior.
- **Extratos raw do HubSpot** (Reunião Agendada, controle de no-show com campo Reunião Efetiva Sim/Não).
- **Aba "Visão Safra" vs "Visão Mês"** (achado-chave, documentado na própria planilha):
  > Visão Safra = baseado na criação do lead, independente de quando moveu de etapa.
  > Visão Mês = baseado na performance do período, independente de quando o lead foi criado.

  Funil em ambas as visões: `LAV → Conectado → Agendado → Ganho`, com taxas de conversão etapa a etapa.
- **Sem aba de MRR/receita** — o funil do Inbound para em "Ganho", sem valor monetário.
- Dimensão de território usada: `Rota do lead` (ex. "Barra da Tijuca", "Zona Sul 1") + `Estado`.

### Prompt refinado (escopo para a versão Outbound)

> Construir um dashboard de gestão para o time de Outbound (BDRs), replicando a arquitetura Google Sheets + Apps Script já usada no Inbound, alimentado por HubSpot/warehouse (Redshift, tabela `entities.Deal`, filtrando por `NomeProprietarioPreVendas` — nunca por `OrigemMicro`, que é mal marcada nesta base).
>
> **Aba 1 — Visão Geral do Time**: Meta, Realizado, A validar, Projeção (`Realizado + 0,85 × A_validar`), agendamentos efetivos vs. não efetivos (`ReuniaoFoiEfetiva` = Sim/Não, com `MotivoReuniaoNaoEfetiva` como detalhe — **sugestão minha**: isso já existe no dado e dá visibilidade de causa de no-show, não só a contagem), por BDR + linha de time. Replica o modelo "Meta x Realizado" do Inbound.
>
> **Aba 2 — Conversão por Etapa**: funil completo por BDR (Validação → Prospecção → Conectado → Qualificação → Agendado → Efetiva), com toggle **Visão Mês / Visão Safra** igual ao Inbound — essa distinção resolve diretamente o problema de qualidade de dado identificado em 01/08 (correções em massa de etapa entre 15/07-29/07): Visão Mês fica confiável a partir de agora, Visão Safra carrega a ressalva histórica para cohorts anteriores a 30/07.
>
> **Aba 3 — MRR & Vendas** (não existe no Inbound, pedido novo do Rodrigo): por BDR, quantidade de vendas fechadas e MRR/valor gerado pelos agendamentos que ele originou — mesmo depois do negócio mudar de dono para o executivo de vendas. Viável porque `NomeProprietarioPreVendas` persiste no negócio mesmo após o "passe". Campos-fonte: `SituacaoNegocio = 'Ganho'`, `MRRAdicionado`, `TotalNegocio`, `DataDeEntradaEmConcluido`. **Sugestão minha**: incluir também `NomePasseExecutivoVendas` (para qual executivo cada BDR está passando) e `CicloDeVendasDias` (tempo entre o passe e o fechamento) — dá ao Rodrigo visibilidade de quão bem cada handoff está convertendo do outro lado, não só o volume que ele entrega.
>
> **Aba 4 — Agendamentos por Rota**: replica a dimensão `RotaComercial`/`AsaComercial` já usada no protótipo atual, cruzando com Meta/Realizado por rota e por período.
>
> **Filtros globais** (aplicáveis a todas as abas): intervalo de datas (date range), BDR (multi-seleção), toggle Visão Mês/Safra.
>
> **Sugestão adicional minha**: uma 5ª aba (ou seção dentro da Aba 2) de **Motivo de Perda** (`MotivoDeLostOutbound`), agrupado por BDR e por etapa — ajuda a identificar se a perda é concentrada em alguma etapa/motivo específico por pessoa, informação que já existe no dado e hoje não aparece em nenhum lugar do protótipo.

### Pendências antes de começar a construir
- [x] ~~Decidir caminho técnico (Sheets+Apps Script vs. n8n→HTML)~~ — decidido: Sheets + Apps Script, igual ao Inbound.
- [ ] Confirmar com Rodrigo se aprova o escopo acima (5 abas: Geral, Conversão, MRR, Rota, Motivo de Perda) ou quer cortar/priorizar algo.
- [ ] Não foi possível inspecionar as fórmulas/Apps Script da planilha de Inbound (export só traz valores) — se for replicar a lógica exata de pro-rata/projeção, vale pedir acesso de edição/visualização do código do Apps Script original.

### Correção de rota (01/08/2026) — fonte de dado: HubSpot direto, não warehouse

Rodrigo questionou por que ir pelo warehouse se o Inbound (que já funciona bem, feito por outra pessoa) aparentemente puxa direto do HubSpot. Reavaliação:

- Confirmado via `builder_hubspot_list_properties` que os campos de MRR **existem nativamente como propriedade de deal no HubSpot** (`mrr_total`, `mrr_ativado`, `mrr_renovado`, `valor_total`, `mrr___tcv`, entre outros) — ou seja, MRR não é exclusividade do warehouse.
- **Decisão: seguir HubSpot direto para as 5 abas, igual ao Inbound.** Motivos: (1) sem dependência de abrir rede/infra pro Apps Script alcançar o Redshift, que Rodrigo não tem experiência pra configurar sozinho; (2) dado mais em tempo real, sem o atraso de sincronização do warehouse (causa raiz do caso "Roberta 19 vs 20" de 30/07); (3) os campos necessários (etapa, dono/SDR, rota, MRR) existem nativamente no HubSpot.
- Warehouse fica como plano B, só se o campo de MRR nativo do HubSpot não representar bem o que Rodrigo quer ver (o warehouse cruza com o sistema de assinaturas — mais rigoroso para reconciliação financeira total da empresa, mas over-engineering para atribuição por BDR).
- **Atenção para quem for implementar**: a lógica de filtro por dono do negócio (campo SDR/pré-vendas, não a propriedade de "Origem Micro") precisa ser replicada com cuidado direto contra a API do HubSpot — essa mesma regra já foi validada e testada extensivamente contra o warehouse ao longo de julho/2026; a leitura errada (por origem em vez de por dono) já causou múltiplas discrepâncias de contagem nesta operação.

### Aba "Agendamentos" — confirmado em 01/08/2026

Rodrigo pediu uma visão específica dos agendamentos com: negócio, executivo de pré-vendas responsável, data do agendamento, e um link clicável pro HubSpot. Testado e confirmado:

- **Quebra por status** (query: `COUNT` sobre `DataDeEntradaEmAgendadoOutbound IS NOT NULL`, sem filtro de pipeline — ver pegadinha abaixo): **Total 151** | Efetivas (`ReuniaoFoiEfetiva='Sim'`) **119** | Não válidas (`='Não'`) **9** | Abertas/a validar (`NULL` ou vazio) **23**.
- **Link do HubSpot**: padrão de URL confirmado (já usado nesta mesma conta/tenant): `https://app.hubspot.com/contacts/23636141/record/0-3/{IDNegocio}`. Na planilha, gerar como coluna com `=HYPERLINK("https://app.hubspot.com/contacts/23636141/record/0-3/"&[célula do ID], "Abrir no HubSpot")`.
- Colunas da aba: ID do negócio | Executivo Pré-Vendas | Data Agendado | Status (Efetiva/Não válida/Aberta) | Link HubSpot.

### Pegadinha de pipeline — importante para quem for implementar (confirmado por Rodrigo em 01/08/2026)

O Outbound trabalha no objeto **Deal**, pipeline **"Outbound BDR"** (existe desde 01/06/2026: Validação → Prospecção → Conectado → Qualificação → Agendado). Quando a reunião agendada vira efetiva, **o mesmo deal (mesmo Record ID) migra para o pipeline "Executivo de Vendas 2.0"** — confirmado testando 4 deals conhecidos como efetivos, histórico de etapas intacto após a migração.

Implicação direta para as queries/filtros de cada aba:
- **Abas 1, 2, 4** (Geral, Conversão por Etapa, Rota): filtrar Deal pelo **pipeline = "Outbound BDR"**.
- **Aba 3** (MRR & Vendas): **NÃO filtrar por esse pipeline** — o negócio já migrou para "Executivo de Vendas 2.0" no momento em que fecha, então filtrar por "Outbound BDR" faria a aba de MRR nunca encontrar nenhuma venda fechada. Filtrar só pelo campo de dono/SDR de pré-vendas, sem filtro de pipeline.

---

# Especificação — Automação do Painel Outbound (n8n)

Documento para o time de infra/n8n implementar a atualização automática (2x/dia) do painel de gestão Outbound hoje prototipado em [dash_preview.html] (protótipo estático, sem atualização automática). Não requer decisão de produto — só implementação técnica das peças abaixo.

---

## 1. Objetivo

Substituir a atualização manual (hoje feita por mim, sob pedido, rodando consultas e editando o HTML à mão) por um job agendado que:
1. Consulta o warehouse (Redshift) 2x/dia.
2. Gera o HTML do painel a partir de um template.
3. Publica o HTML atualizado em um lugar acessível para o time de pré-vendas.

## 2. Fonte de dados

Warehouse Redshift, schema `entities`, tabela `Deal`. Owner (dono do negócio) é o critério de filtro — **nunca usar `OrigemMicro`** (tags de origem do HubSpot, comprovadamente não confiáveis/mal marcadas nesta base).

Roster e metas de outbound são mantidos manualmente mês a mês (não existe tabela de metas no warehouse) — a query 2.1 abaixo tem os nomes/metas hardcoded como exemplo de julho/2026; **precisa ser atualizada todo mês** por quem mantiver o workflow.

### 2.1 Snapshot geral + por BDR (Meta / Realizado / A validar / Projeção)

```sql
WITH metas AS (
  SELECT 'Caio Louback' AS nome, 22 AS meta
  UNION ALL SELECT 'João Pedro Modé', 11
  UNION ALL SELECT 'Pedro Porto', 25
  UNION ALL SELECT 'Roberta Lobasso', 20
),
realizado AS (
  SELECT
    "NomeProprietarioPreVendas" || ' ' || COALESCE("SobrenomeProprietarioPreVendas",'') AS nome,
    SUM(CASE WHEN "ReuniaoFoiEfetiva" = 'Sim' THEN 1 ELSE 0 END) AS realizado,
    SUM(CASE WHEN "ReuniaoFoiEfetiva" IS NULL OR "ReuniaoFoiEfetiva" NOT IN ('Sim','Não') THEN 1 ELSE 0 END) AS a_validar
  FROM entities."Deal"
  WHERE "DataReuniaoPreVendas" >= DATE_TRUNC('month', CURRENT_DATE)
    AND "DataReuniaoPreVendas" < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
  GROUP BY 1
)
SELECT
  m.nome,
  m.meta,
  COALESCE(r.realizado, 0) AS realizado,
  COALESCE(r.a_validar, 0) AS a_validar,
  ROUND(COALESCE(r.realizado, 0) + 0.85 * COALESCE(r.a_validar, 0)) AS projecao
FROM metas m
LEFT JOIN realizado r ON r.nome = m.nome
ORDER BY m.nome;
```

Regras de negócio embutidas nessa query (não mudar sem alinhar com Rodrigo):
- **Realizado** = `ReuniaoFoiEfetiva = 'Sim'`.
- **A validar** = tudo que não é explicitamente `'Sim'` nem `'Não'` (inclui `NULL`), com `DataReuniaoPreVendas` em qualquer dia do mês corrente (passado ou futuro dentro do mês) — não excluir os últimos dias do mês.
- **Projeção** = `Realizado + 0,85 × A_validar` (fórmula simples, sem extrapolação por dia decorrido).
- Linha "Time" = soma das linhas acima (fazer no template/HTML, não precisa de outra query).

### 2.2 Agendamentos por rota (top 8)

```sql
SELECT
  COALESCE("RotaComercial", 'Sem rota') AS rota,
  COUNT(*) AS total,
  SUM(CASE WHEN "ReuniaoFoiEfetiva" = 'Sim' THEN 1 ELSE 0 END) AS efetivas
FROM entities."Deal"
WHERE "NomeProprietarioPreVendas" || ' ' || COALESCE("SobrenomeProprietarioPreVendas",'') IN
  ('Caio Louback','João Pedro Modé','Pedro Porto','Roberta Lobasso')
  AND "DataReuniaoPreVendas" >= DATE_TRUNC('month', CURRENT_DATE)
  AND "DataReuniaoPreVendas" < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 8;
```

### 2.3 Conversão por etapa (foto atual, acumulada — ver ressalva de qualidade de dado abaixo)

```sql
SELECT
  "NomeProprietarioPreVendas" || ' ' || COALESCE("SobrenomeProprietarioPreVendas",'') AS bdr,
  COUNT(*) AS validou,
  SUM(CASE WHEN "DataDeEntradaEmProspeccaoOutbound"  IS NOT NULL THEN 1 ELSE 0 END) AS prospectou,
  SUM(CASE WHEN "DataDeEntradaEmConectadoOutbound"   IS NOT NULL THEN 1 ELSE 0 END) AS conectou,
  SUM(CASE WHEN "DataDeEntradaEmQualificacaoOutbound" IS NOT NULL THEN 1 ELSE 0 END) AS qualificou,
  SUM(CASE WHEN "DataDeEntradaEmAgendadoOutbound"    IS NOT NULL THEN 1 ELSE 0 END) AS virou_passe
FROM entities."Deal"
WHERE "DataDeEntradaEmValidacaoContatoOutbound" IS NOT NULL
  AND "NomeProprietarioPreVendas" || ' ' || COALESCE("SobrenomeProprietarioPreVendas",'') IN
    ('Caio Louback','João Pedro Modé','Pedro Porto','Roberta Lobasso')
GROUP BY 1
ORDER BY 1;
```

⚠️ **Ressalva de qualidade de dado (achado de 01/08/2026)**: entre 15/07 e 29/07/2026 houve correções manuais em massa de etapa no pipeline "Outbound BDR" (confirmado via clusters de dezenas de deals com o mesmo timestamp de entrada de etapa, ex. 54 deals com o mesmo minuto em 17/07). A contagem por etapa acima reflete o estado **atual e corrigido** de forma confiável, mas a **data** de entrada em etapa não é confiável para métricas de tempo (coorte semanal, tempo médio até conversão, "últimos N dias") no período anterior a 30/07/2026. Só usar essa tabela como "estado de hoje", nunca como velocidade/tempo de funil, até esse histórico decantar mais.

### 2.4 Cohort mensal (opcional, para quando quiserem essa visão)

```sql
SELECT
  DATE_TRUNC('month', "DataDeEntradaEmValidacaoContatoOutbound") AS mes_entrada,
  COUNT(*) AS entrou_validacao,
  SUM(CASE WHEN "DataDeEntradaEmAgendadoOutbound" IS NOT NULL THEN 1 ELSE 0 END) AS virou_passe,
  SUM(CASE WHEN "ReuniaoFoiEfetiva" = 'Sim' THEN 1 ELSE 0 END) AS efetivas
FROM entities."Deal"
WHERE "DataDeEntradaEmValidacaoContatoOutbound" IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

## 3. Geração do HTML

O template visual já existe e está validado com o Rodrigo: `dash_preview.html` (anexo/no mesmo diretório desta especificação, ou pedir a versão mais recente). É HTML+CSS puro, sem dependência externa.

Passos no n8n:
1. **Node de query** (Postgres/Redshift node do n8n) roda as queries da seção 2.
2. **Node Function/Code** recebe o(s) resultado(s) em JSON e monta o HTML:
   - Pegar o `dash_preview.html` como string-template.
   - Substituir os números fixos de hoje por placeholders (ex.: `{{TEAM_REALIZADO}}`, `{{TEAM_META}}`, `{{TEAM_A_VALIDAR}}`, `{{TEAM_PROJECAO}}`, e um bloco repetido por linha de BDR — pode usar um marcador `<!--ROW--> ... <!--/ROW-->` no template e o Function node clona esse bloco por linha do resultado da query 2.1).
   - Calcular no próprio Function node os percentuais (Ating. = Realizado/Meta, Ating. proj. = Projeção/Meta) e as classes de cor do chip (`good`/`warn`/`bad`) pela mesma régua usada no protótipo (≥100% good, 70-99% warn, <70% bad — confirmar com Rodrigo se quer travar esses limiares).
   - Data/hora do refresh: **não usar `new Date()`/timestamp do servidor sem cuidado de timezone** — gravar em GMT-3 explícito, já que todo o resto da operação (times de venda) opera nesse fuso.
3. Resultado: uma string HTML completa, pronta para publicar (seção 4).

Posso entregar o `Function` node já escrito (JS) se quem for implementar preferir — é só pedir depois que o time de infra confirmar o destino de publicação (próxima seção), já que o código de upload depende de qual API vamos usar.

## 4. Onde publicar

Esse painel carrega dado comercial/desempenho individual do time (metas, realizado por pessoa) — por isso a recomendação é manter dentro da infraestrutura da própria empresa, não em serviço de terceiro (Vercel/Render/Supabase e afins ficam fora de cogitação por política de dados).

**Caminho recomendado**: bucket S3 com hosting estático, atrás de um domínio/subdomínio interno da empresa (ex. `painel-outbound.interno.gabriel...`), com IAM da automação restrito a `PutObject` **apenas** nesse bucket/prefixo (não em toda a conta AWS). O time de infra:
- Cria o bucket + política de hosting estático (ou serve via CloudFront/ALB se precisar de HTTPS com domínio próprio).
- Cria uma credencial (access key ou role, conforme padrão interno) escopada só a esse bucket, para o n8n usar no node de upload.
- Decide se o painel fica atrás de autenticação (SSO/VPN interna) — como é dado de performance individual, faz sentido não deixar público sem login.

**Alternativas sem infra nova** (se quiser algo rodando antes de esperar o time de infra):
- n8n atualiza direto uma aba de **Google Sheets** já em uso pelo time (reaproveita permissão/hábito existente).
- n8n posta a "foto do dia" (imagem ou resumo em texto) num **canal do Slack** via node nativo do Slack.

Nenhuma das duas precisa de bucket/domínio novo, mas também não têm o layout visual do protótipo — são fallback, não substituto definitivo.

## 5. Perguntas em aberto para o time de infra
- [ ] Nome/local do bucket (ou decisão de usar Google Sheets/Slack como MVP enquanto o bucket não sai).
- [ ] Domínio interno e se fica atrás de SSO/VPN.
- [ ] Quem cria e é dono da credencial que o n8n vai usar (rotação, escopo mínimo).
- [ ] Onde o n8n já está hospedado hoje (self-hosted da empresa ou precisa subir) — Rodrigo mencionou nunca ter feito isso, então provavelmente o próprio n8n também depende do time de infra para subir.

## 6. Fora de escopo deste documento
- Automação da tabela de conversão por etapa como métrica de **tempo/velocidade** (bloqueada pela ressalva da seção 2.3 até o histórico "sujo" ficar longe o suficiente no passado).
- Aba "Cohort" e filtro "Por rota" como views separadas do dashboard (mencionadas por Rodrigo como desejadas, ainda não desenhadas visualmente — só a query de referência está aqui).
