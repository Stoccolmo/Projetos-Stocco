# Decisões — Painel Outbound (Dash Prospecção)

Registro vivo das decisões, achados e pendências do painel de gestão Outbound (Google Apps Script + HubSpot direto). Ver também `docs/HANDOFF_DASH_PROSPECCAO.md` para arquitetura e histórico de bugs anteriores.

---

## 07/09/2026 — Racional de atingimento igual ao Inbound: card "Atingimento Projeção" + coluna "Ating. Projeção" no Ranking (Versão 18, publicada 17:49)

### Contexto
Rodrigo questionou se as 12 reuniões "A validar" de setembro estavam sendo consideradas a 85% no atingimento, porque o Pedro Porto aparecia com 0% tendo 8 a validar. Pediu o mesmo racional da dash Inbound (`METODO_AUDITORIA_DASH.md`), só para atingimento, mantendo o pro rata atual, e tooltips explicando cada número.

### Diagnóstico (confirmado na API do HubSpot, 20 no período / 8 válidas / 12 a validar — igual à dash)
- O 0,85 existia no Outbound, mas nos lugares errados para acompanhar pessoa: o card **"Atingimento pro rata"** só creditava a validar **com data até hoje** (2 das 12: uma da Roberta em 04/09 e uma do Pedro em 04/09) → 29%. As outras 10 são reuniões futuras (7 do Pedro em 08/09).
- No **Ranking** não havia coluna com a validar: Ating. Pro Rata e Ating. Meta usam só validadas → Pedro 0% nas duas. O único lugar onde as 8 dele apareciam era o rótulo "proj." miúdo das barras.
- No Inbound (V21): card "Atingimento Projeção" e coluna "Ating. Projeção" = (Realizado + 0,85 × **todo** o A validar, inclusive futuro) ÷ Meta pro rata. O gráfico "Atingimento da meta" por pessoa é válidas ÷ meta cheia nas duas dashes (não muda).

### Decisão (Rodrigo, 07/09)
Aplicar as duas mudanças; manter o pro rata como está (regra de dias inalterada: cards em dias úteis sem feriado, Ranking em dias corridos); manter 0,85 fixo; não mexer no gráfico por pessoa nem no card "Atingimento projetado (fim período)". Recomendação registrada: a projeção é leitura de **acompanhamento** (credita agendamento, pode inflar com reunião fraca); a **cobrança** continua no card/coluna Atingimento, só com validadas — mesma separação do Inbound.

### O que muda (11 hunks, só `Index.html`; `Codigo.gs` intacto)
| Onde | Antes | Depois |
|---|---|---|
| Card 7 da Visão Geral | "Atingimento pro rata" = (válidas + 0,85 × a validar já realizadas) ÷ meta pro rata → **29%** (9,7 / 33) | "Atingimento Projeção" = (válidas + 0,85 × **todas** a validar) ÷ meta pro rata → **55%** (18,2 / 33) |
| Tooltip do card Atingimento (oficial) | citava "Atingimento pro rata" | cita "Atingimento Projeção" e diz que este é o número de cobrança |
| Ranking | Meta · Pro rata · Realizado · Ating. Pro Rata · Ating. Meta | + **Ating. Projeção** entre Ating. Pro Rata e Ating. Meta, com tooltip no cabeçalho e `title` na célula mostrando a conta (N validadas + 85% de M a validar = X / pro rata P); linha Total idem |
| A validar do Ranking | — | mesmo universo do card: sem julgamento (nem Sim nem Não) e **excluindo Perdido/Reagendamento**; inclui reuniões futuras do período |

Ranking de setembro recalculado com o código novo (teste em node com os deals reais, 07/09):

| Vendedor | Meta | Pro rata | Realizado | Ating. Pro Rata | **Ating. Projeção** | Ating. Meta |
|---|---|---|---|---|---|---|
| Caio Louback | 41 | 10 | 4 | 40% | **40%** | 10% |
| Roberta Lobasso | 46 | 11 | 3 | 27% | **50%** | 7% |
| João Pedro Modé | 13 | 3 | 1 | 33% | **62%** | 8% |
| Pedro Porto | 46 | 11 | 0 | 0% | **62%** | 0% |
| Total | 146 | 35 | 8 | 23% | **52%** | 5% |

### Método (regras do `METODO_AUDITORIA_DASH.md`)
1. **Desvio espelho × produção medido** por hash de linha via `monaco.editor.getModels()`: `Codigo.gs` idêntico (247 linhas); `Index.html` divergia em **1 linha (412)** — a produção não tem o `class="ph-bar-proj"` no rótulo "proj." das barras. Espelho ressincronizado para a produção antes de qualquer hunk.
2. Hunks em `docs/build-v18.js` (âncora única validada, sintaxe dos 9 blocos `<script>` checada com `new Function`, template `<?!= data ?>` substituído só para compilar). Gera `scripts/Index.html` novo (793 linhas) e `docs/aplicar-v18.js`.
3. Teste funcional: blocos carregados em `vm` do node com os 143 deals reais (consulta igual à do `Codigo.gs`) → card e Ranking acima.
4. **Aplicação é manual** (escrita no editor é bloqueada para automação): Rodrigo cola `docs/aplicar-v18.js` no console do DevTools com o editor aberto (Index.html carregado), salva pelo ícone e publica **Nova versão** na implantação existente. Sem `refreshCache`: é só front-end, o payload não muda.

### Pendências
- [x] Applier colado por Rodrigo no console (retorno "OK. Index.html: 11 hunks, 793 linhas"). Salvar e publicar feitos pela UI via automação (cliques não são bloqueados): **Versão 18 em 7 de set. de 2026, 17:49**, mesma implantação (código AKfycbxcQCd3...), descrição "V18: card Atingimento Projecao (85% de todo o A validar) + coluna Ating. Projecao no Ranking, tooltips".
- [x] Verificação ao vivo (17:52, dash Mês atual, cache 16:58): card **Atingimento Projeção 55% — 18,2 est. / pro rata 33** no lugar do antigo 29%; card Atingimento 5% (8 válidas / meta 146) e Atingimento projetado 52% intactos. A aba Ranking não pôde ser aberta pela automação (cliques no iframe não registram); a coluna foi validada pelo teste em node acima e pela mesma função que renderiza o card.
- [ ] Rodrigo conferir a aba Ranking na tela (coluna Ating. Projeção, Pedro 62%, Total 52%).

### Ressalva documentada sem corrigir — ritmo do card "Atingimento projetado (fim período)" (pergunta de Rodrigo, 07/09 ~18h)
Fórmula em produção: `projecao = validados + 0,85 × (aValidar + ritmo × diasRestantes)`, com `ritmo = total ÷ diasDecorridos` (o card "Média por dia"). Hoje: 20 ÷ 5 = 4,0/dia útil × 17 restantes = 68 novas; 8 + 0,85 × (12 + 68) = 76 → 76 ÷ 146 = **52%**.

Dois vieses, em sentidos opostos:
1. **Reunião futura no numerador do ritmo.** `total` é por data da reunião e inclui as 10 ainda não realizadas (7 do Pedro em 08/09; 08 e 09/09 de Roberta e João Pedro). Elas contam como "produção" dos 5 dias passados. Ritmo só com o que já aconteceu = 10 ÷ 5 = 2/dia → projeção 47 (32%). Mesmo padrão do item 3 do checklist do `METODO_AUDITORIA_DASH.md` (Inbound, "Média por dia" com reuniões futuras).
2. **07/09 contado como dia útil.** `isDiaUtil_` só tira sáb/dom; não conhece feriados. Com feriado: 4 decorridos / 17 restantes de 21 → ritmo 5/dia → projeção 85 (58%). O Inbound desconta pela aba Feriados.

Diferença estrutural vs Inbound: a col M do Compilado extrapola o ritmo de **validadas** (Realizado ÷ dias úteis decorridos × restantes), sem 0,85 nessa parcela; o Outbound extrapola **agendadas** e aplica 0,85. Nenhuma das duas é "errada", mas não são a mesma projeção.

**Status:** explicado a Rodrigo, nada alterado. Ajuste mais defensável, se quiser uma V19: ritmo só com reuniões cuja data já passou (`dataReuniao <= hoje`) e dias úteis com feriados. Aguardando decisão.

---

## 07/09/2026 — Meta de setembro/2026 lançada (146)

### Contexto
Rodrigo mandou o print das metas de setembro do time Outbound e pediu para lançar na dash sem quebrar nada, só para acompanhar o atingimento do mês.

### Onde a meta vive (não é no código)
- A meta **não está no repo**: mora na Script Property `METAS_JSON` do projeto Apps Script (`1SqeoBSS-...`), chaveada por mês (`{"YYYY-MM": {nome: meta}}`). Ver HANDOFF, bug #6.
- Nenhuma linha de `Codigo.gs` / `Index.html` foi alterada. O editor de código foi aberto só para rodar `refreshCache`; o projeto continua "Salvo no Google Drive" sem mudança de código e sem nova implantação.

### O que foi feito
1. Lido o valor atual de `METAS_JSON` (só `2026-07` e `2026-08`) e **acrescentada** a chave `2026-09`, preservando as anteriores:

   | BDR | Meta set/26 |
   |---|---|
   | Caio Louback | 41 |
   | João Pedro Modé | 13 |
   | Pedro Porto | 46 |
   | Roberta Lobasso | 46 |
   | **Time (Prospecção)** | **146** |

   A chave usa `João Pedro Modé` (com acento), igual a `BDR_OWNER_IDS` no `Codigo.gs` — o print vinha "Mode" sem acento; se fosse copiado literal a meta dele não casaria com o nome do owner.
2. JSON validado antes de salvar (3 chaves, soma de setembro = 146) e relido após recarregar a página de configurações.
3. Como `doGet()` lê `metas` do cache no Drive, rodei `refreshCache` pelo editor (16:52, 1.640 deals). Sem isso a dash ficaria em "meta 0" até o gatilho das 18h.

### Verificação na dash publicada (Mês atual, 07/09 16:52)
- Card Atingimento: **5% — 8 válidas / meta 146**; Atingimento pro rata 29% (9,7 est. / pro rata 33); Atingimento projetado 52% (projeção 76 / meta 146).
- Gráfico "Atingimento da meta" por vendedor: 10% / 8% / 0% / 7% = 4/41, 1/13, 0/46, 3/46 — confirma que a meta individual está atribuída ao nome certo.
- Não consegui abrir a aba Ranking pela automação (cliques dentro do iframe do Apps Script não registram pela extensão); a conferência acima foi feita pela Visão Geral.

### Armadilhas anotadas para o próximo mês
- Sempre **acrescentar** a chave do mês no `METAS_JSON`, nunca sobrescrever o objeto.
- Depois de salvar a propriedade, rodar `refreshCache` (ou "Atualizar agora" na dash) — a meta só chega ao front pelo cache.
- No editor do Apps Script, teclas de seta/Enter enviadas ao dropdown de função caem no código e marcam "Mudanças não salvas"; Executar salva o projeto, então desfazer (Ctrl+Z) antes de rodar. Aconteceu nesta sessão e foi revertido antes de executar.

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

### Correção do card "Atingimento até hoje" → "Atingimento" (oficial)
- Rodrigo apontou olhando a produção: o card estava dividindo pela **meta pro-rata**, sendo que o card ao lado já é justamente a leitura pro-rata. O atingimento principal tem de ser o **oficial**.
- Antes: `pct(g.validados, g.metaProRata)` — rótulo "Atingimento até hoje", rodapé "82 válidas / pro rata 127" = **65%**.
- Depois: `pct(g.validados, g.meta)` — rótulo "Atingimento", rodapé "82 válidas / meta 140" = **59%**.
- Numerador **não** mudou: continua só `validados` (resultado real, sem estimativa). Só o denominador passou de pro-rata para meta cheia.
- Os outros dois cards ficaram intactos: "Atingimento pro rata" (88,8 est. ÷ 127 = 70%) e "Atingimento projetado (fim período)" (111 ÷ 140 = 79%). A tooltip do card novo foi reescrita para dizer explicitamente que este é o número de cobrança de meta e que os dois ao lado são as leituras ajustadas.
- **Atenção ao publicar:** o número cai de 65% para 59% na visão do time. Não é piora de resultado, é troca de denominador.

### Espelho do repo estava ATRÁS da produção — confirmado e medido
- Ao ir publicar o filtro, descobri que a produção **já rodava** as mudanças que estavam apenas como "não commitadas" no working tree local (dias úteis, exclusão de Perdido/Reagendamento, e os três cards de atingimento). Ou seja: alguém publicou sem commitar, e o repo é que estava desatualizado — não o contrário.
- Diff real medido linha a linha (hash djb2 de cada linha, comparação feita dentro da própria página do editor para não trafegar o fonte): produção 756 linhas × baseline local 756 linhas, **apenas 3 linhas divergentes** — 342 e 371 (texto de tooltip) e 385 (`proj.` minúsculo em produção vs `Proj.` no local). Tudo cosmético.
- Consequência prática: **publicar sobrescrevendo o arquivo inteiro apagaria essas 3 linhas de produção.** A publicação tem de ser por substituição ancorada dos trechos alterados, como já mandava a regra do projeto.
- Técnica útil para reusar: ler a fonte real via `monaco.editor.getModels()` no editor do Apps Script (`model/2` = Codigo.gs, `model/3` = Index.html) e comparar por hash de linha, enviando os hashes locais **para dentro** da página e devolvendo só os números das linhas diferentes — evita tanto o truncamento da saída quanto o bloqueio "[BLOCKED: Cookie/query string data]" que atinge linhas longas com URL/token.

### Implantado — Versão 17 (27/08/2026, 22:47 BRT)
- Publicado por substituição ancorada no editor (5 âncoras, todas com exatamente 1 ocorrência, validadas antes em modo seco): STATE, bloco `mapCidade_`/`filterByCidade`/`filterDeals`, seletor de Cidade, listener e a linha do card de atingimento. Arquivo foi de 756 → 783 linhas. `Codigo.gs` não foi tocado (247 linhas antes e depois).
- Verificado **no app publicado**, não no diálogo de confirmação: filtro "Cidade / Todas as cidades" presente na barra, card **Atingimento 59% (82 válidas / meta 140)**, e os dois vizinhos intactos — Atingimento pro rata 70% e Atingimento projetado 79%.
- Link não mudou (mesma implantação): `.../AKfycbx...Qp6qW23EAA/exec`.

### Espelho sincronizado — resta 1 linha de divergência conhecida
- Depois da publicação, o `Index.html` do repo foi alinhado com a produção: aplicadas as 2 diferenças cosméticas que só existiam no ar (travessão → hífen em "não entram aqui - já têm", e `"Proj."` → `"proj."` na tooltip de Agendamentos por vendedor).
- Verificação por hash linha a linha: **782 de 783 linhas idênticas**.
- **Linha 412 continua divergente e não foi resolvida**: é a linha do rótulo `ph-bar-proj` ("proj. " abaixo de cada barra). Produção tem 141 caracteres, o repo tem 161 — 20 a mais, num trecho de atributo `style`. O conteúdo exato da produção não pôde ser lido: o filtro do harness devolve `[BLOCKED: Cookie/query string data]` justamente no pedaço do meio dessa linha, em qualquer fatiamento. Não foi chutado.
- Consequência prática: nenhuma hoje (é estilo de um rótulo). Mas **não usar a linha 412 como âncora** em edições futuras, e se algum dia essa linha precisar mudar, ler o valor real direto no editor primeiro.

### ⚠️ CORREÇÃO (27/08/2026, noite) — o achado do `sdr` vazio acima está EXAGERADO e a conclusão sobre o BH está ERRADA

Rodrigo questionou: "não estou entendendo como `sdr` está vazio, deal no pipeline de outbound com executivo de pré-vendas vazio?". A dúvida procedia. Reinvestigando:

**O que estava errado**
- Afirmei que "BH fica zerado" e que "45,5% do pipeline está invisível na dash". **As duas coisas são falsas.**
- Origem do erro: montei o harness de teste buscando **apenas** o pipeline Outbound (`905667466`). Mas o `Codigo.gs` monta o universo com **duas** consultas — `fetchOutboundDeals_()` **e** `fetchGraduatedDeals_()`, que traz os negócios já migrados para o pipeline **Vendas** (`79388826`). Como os negócios de MG com reunião estão justamente entre os graduados, meu harness não tinha nenhum, e eu li o zero como se fosse comportamento da dash.

**O que os dados realmente dizem**
- `sdr` = propriedade "Executivo de Pré-Vendas", um **dropdown** (enumeration/select), não um campo de proprietário. Fica vazio enquanto o negócio não é trabalhado.
- Preenchimento é fortemente correlacionado com a etapa: Validação 10% · Prospecção 59% · Conectado 26% · Qualificação 26% · **Agendado 100%** · **Reagendamento 100%** · Perdido 76%.
- **Todo negócio com `data_da_reuniao` tem `sdr` preenchido** (0% de falha). E `fetchGraduatedDeals_()` já filtra `sdr IN owners` por construção.
- Ou seja: os 1.160 sem `sdr` são majoritariamente **registros de prospecção ainda não trabalhados**, parados em Validação. Não é dado perdido — é dado que ainda não existe. As métricas de reunião da dash não são afetadas.
- **BH funciona.** Universo real que a dash enxerga: SP 738 (109 c/ reunião) · RJ 871 (131) · **BH 12 (12)** · Outros 2 (2). Verificado na produção com o filtro em BH: Total no período **12**, distribuídos entre Caio 3, João 4, Roberta 5.

**O que continua verdade**
- O `sdr` vazio em etapas iniciais faz esses registros não aparecerem nas abas que contam entrada de etapa (Funil vs Meta, Cohort). Isso é real, mas é bem menor e bem menos grave do que "45,5% invisível", e pode ser comportamento desejado — negócio sem dono não deveria ser creditado a ninguém.
- Se um dia se quiser contar prospecção crua por praça, aí sim seria preciso o fallback para `hubspot_owner_id`. Não é urgente e não bloqueia nada hoje.

**Lição de método:** antes de declarar que um número está errado na dash, reproduzir o **universo completo** que o backend monta — todas as consultas, não só a principal. O harness parcial produziu um zero convincente e falso.

### Pendências
- [x] Publicar no Apps Script — feito, Versão 17 em 27/08/2026 22:47.
- [ ] Decidir com Rodrigo se a meta deve ser fatiada por cidade nos cards de Atingimento (hoje não é, igual ao filtro de Origem).
- [ ] ~~Resolver o `sdr` vazio~~ — **cancelada**: ver correção acima. BH funciona (12 reuniões) e as métricas de reunião não são afetadas. Sobra apenas a questão menor de prospecção crua por praça nas abas de Funil/Cohort.

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
