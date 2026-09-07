# Método de auditoria de dados de uma dash de Pré-Vendas (teste de contradição lógica)

Racional aplicado na dash **Inbound** em 07/09/2026 (Versão 21). Serve de briefing para repetir na dash **Outbound** (`prospeccao-outbound/`) ou em qualquer painel Apps Script + Sheets + HubSpot.

Pedido original, em uma frase: *"Antes de me devolver qualquer entrega, rode um teste de contradição lógica na dash inteira, busque erros, valide os dados, aplique as correções e me devolva um resumo do que foi alterado."*

---

## 0. Regras que valem antes de qualquer edição

1. **Produção é o Apps Script, não o repo.** O espelho em `scripts/` pode ter divergido. Medir o desvio (hash de bloco → hash de linha via `monaco.editor.getModels()`) e ressincronizar o espelho byte a byte ANTES de escrever uma linha. Só depois editar, sempre por **substituições ancoradas** (cada bloco "antes" único no arquivo; abortar se não casar 1×).
2. **Nunca estimar dado histórico.** Lacuna em planilha → checar histórico de versões e pedir o número real.
3. **Toda alteração vai pro GitHub** (`Stoccolmo/Projetos-Stocco`, branch `main`) com log em `decisoes/DECISOES-*.md` e handoff atualizado. Mensagem de commit cita a versão publicada.
4. **Escrita automatizada no editor do Apps Script e em massa na planilha é bloqueada** pelo classificador do modo auto. Caminho que funciona: gerar `docs/aplicar-vNN.js` (hunks validados) para Rodrigo colar no console do DevTools; cliques de salvar/implantar e refresh via URL não são bloqueados. Dados em massa para a planilha vão como TSV em `docs/` para colar.
5. Depois de publicar, **F5 na dash** — "Atualizar dados" recarrega só o payload, não o código.

---

## 1. Levantar o que a dash mostra (sem confiar na tela)

- Ler o **payload real**: navegar para `<URL exec>?action=fetch` (não `fetch()`, dá CORS). O JSON em `document.body.innerText` é exatamente o que alimenta todas as abas. Recomputar cada aba a partir dele em JS na própria página, devolvendo resumos pequenos (a saída da tool trunca em ~1.400 chars).
- Ler a **planilha** só em CSV: `gviz/tq?tqx=out:csv&sheet=<aba>&range=<A1:F50>` com cookie do Chrome logado (`out:json` dá ACCESS_DENIED). Para trocar de aba sem clicar: Ctrl+J e digitar `'Nome da Aba'!A1`.
- Anotar, por aba, **fonte de dados, campo de data e universo** (lead × negócio × passe; data de agendamento × data da reunião × data de validação). A maior parte das "contradições" nasce aqui.

## 2. Cruzar com a fonte primária (HubSpot / Redshift)

- Replicar a consulta do sync (`SyncNeo.gs` no Inbound; `Codigo.gs` no Outbound) direto na API do HubSpot com o token do `.env`: mesmos pipelines, mesma propriedade de data, mesma regra de status (Sim / Não / vazio = validado / não válido / a validar). Comparar total e **por pessoa**. No Inbound bateu 99/52/39/8 exato.
- Números "snapshot" (MRR etc.) → reproduzir a consulta no Redshift (`entities.Deal` × `reports.EventoAssinatura`, Evento 'Ativação') e comparar mês a mês com a aba. Verificar se o snapshot está **datado** na tela; se não, datar.
- Fórmulas da planilha que a dash só repassa (pro rata, projeções): inferir a fórmula a partir dos valores e confirmar que fecha com 2 decimais antes de escrever no tooltip.

## 3. Checklist de contradições (o que procurar)

| # | Tipo | Exemplo real encontrado no Inbound |
|---|---|---|
| 1 | **Mesma palavra, universos diferentes** | "Reunião" = passe pela data da reunião (441 em ago) em 5 abas × lead que entrou em Agendado (488) em Online vs Presencial e Funil |
| 2 | **Rótulo contradiz o cálculo** | Líder "81% da meta" era vs meta **pro rata**; gráfico ao lado usava meta cheia (15%) |
| 3 | **Constante hardcoded** | "Média por dia" = total ÷ **20** dias úteis fixos, com reuniões futuras no numerador |
| 4 | **Filtro aplicado pela metade** | Filtro de pré-vendedor valia num gráfico e não no vizinho; linha "Total" era do time com um vendedor filtrado |
| 5 | **Arredondamento** | `Math.ceil` por linha: pro rata total 83 vs 82 na planilha; "15/16 = 94,9%" |
| 6 | **Roster por posição / lista antiga** | Cohort lia nomes da col B da aba (lista de 6 antiga) → mostrava quem saiu e omitia quem está |
| 7 | **Duas fontes da mesma meta sem cruzamento** | Compilado col B × aba "Meta Pré vendedor" (bug de julho: coluna vazia → 567%) |
| 8 | **Snapshot sem data** | MRR de 10/08 exibido como mês fechado (agosto com 0 vendas) |
| 9 | **Dois cards "iguais" com fórmulas diferentes** | Atingimento Projeção 103,7% (col K, conta 85% do a validar) × Projetado fim do mês 71,0% (col M, só validados) sem explicação |
| 10 | **Seletor de período ignorado** | Funil/Cohort/overlay só mudam em "Atualizar dados"; texto dizia "mês corrente" fixo |
| 11 | **Mês fechado × mês corrente** | Sem meta virava "0,0%" vermelho em vez de "—"; título "Projetado (Fim do Mês)" em mês já fechado |
| 12 | **Rótulo desatualizado** | "Fonte: tipo_de_reuniao" (regra mudou em 24/08); "Top 8 + Outras" (mostra todas desde 10/08) |
| 13 | **Soma das partes ≠ total sem nota** | Card Total do Funil inclui leads sem pré-vendedor |
| 14 | **Typo visível** | `>` solto antes de um KPI |
| 15 | **Histórico filtrado pelo roster atual** | Passes de quem saiu somem dos meses passados (documentado, não corrigido) |

## 4. Revisão de código em paralelo

Subagente lê `Index.html`, `Reader.gs`/`Codigo.gs` e auxiliares procurando exatamente os itens acima, com `arquivo:linha`, cenário concreto e correção sugerida, e devolve também a lista do que **conferiu e está correto** (para não repetir).

## 5. Corrigir, publicar, verificar

1. Hunks em `docs/build-vNN.js` (valida âncora única, escreve espelho e gera `docs/aplicar-vNN.js`). Checar sintaxe com `new Function` nos blocos `<script>`.
2. Rodrigo cola o applier no console → salvar pelo ícone → Implantar → Nova versão. Confirmar em "Gerenciar implantações" que a versão ativa mudou e o código da implantação não.
3. Rodar `<exec>?action=refresh&cohortStart=…&cohortEnd=…&funilStart=…&funilEnd=…` e reler o payload: os números corrigidos precisam aparecer ali antes de olhar a tela.
4. Screenshot da Visão Geral (F5) como prova.

## 6. Entregável (resumo para o gestor)

- Tabela **"o que era → como está"** por aba, com o número antes e depois.
- Lista do que ficou **documentado sem corrigir** (precisa de decisão) — no Inbound: unificar a definição de "reunião" (TO-DO aprovado), roster histórico, custom cruzando meses, período ignorado em 3 abas, K × M como projeção oficial.
- Lista do que **conferiu e está correto**, com a fonte do cruzamento.
- Tudo em `decisoes/DECISOES-*.md` + handoff + commit.

---

## Briefing pronto para a dash Outbound

> Aplique na dash **Outbound** (`Projetos-Stocco/prospeccao-outbound/`, Apps Script + "Planilha" + HubSpot pipelines `Outbound BDR` 905667466 e `Executivo de Vendas 2.0` 79388826) o mesmo método de `METODO_AUDITORIA_DASH.md`: (1) ressincronize o espelho com a produção antes de editar; (2) leia o payload via `?action=fetch` e recompute cada aba; (3) cruze validados/agendados por BDR com o HubSpot replicando o `Codigo.gs` (atenção: o Outbound aloca pelo mês da **validação** via `dataEfetiva`, e o universo de pipelines é fechado — ver `dash_prevendas_datas_reuniao_gotchas`); (4) rode o checklist de 15 tipos de contradição; (5) corrija o que for contradição interna, documente o que exigir decisão, publique como nova versão e me devolva a tabela "o que era → como está". Regras: espelho não é fonte de verdade, nunca estimar histórico, tudo commitado no GitHub, applier em `docs/` para eu colar.
