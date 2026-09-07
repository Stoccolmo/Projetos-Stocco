// build-v21.js — gera a Versão 21 do painel Inbound a partir do espelho (que precisa
// estar byte a byte igual à produção) e emite docs/aplicar-v21.js (mesmos hunks, pra
// colar no console do editor do Apps Script ou rodar via automação).
//
// Uso: node docs/build-v21.js            → valida âncoras e escreve scripts/*.{html,gs} novos + docs/aplicar-v21.js
//      node docs/build-v21.js --check    → só valida (não escreve nada)
//
// Cada hunk: { f: arquivo, n: nº, why: motivo curto, old: texto EXATO (único no arquivo), nw: texto novo }.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'scripts');
const CHECK = process.argv.includes('--check');

const J = (lines) => lines.join('\n');

const H = [];
// ─────────────────────────────────────────────────────────────────────────────
// INDEX.HTML
// ─────────────────────────────────────────────────────────────────────────────
H.push({ f: 'Index.html', n: 1, why: 'Ranking: grid de 8 colunas (nova coluna Ating. Projeção)',
  old: "  .grid-rank-mtd7 { grid-template-columns: 36px 2fr 72px 84px 104px 100px 100px; }",
  nw: J([
    "  .grid-rank-mtd7 { grid-template-columns: 36px 2fr 72px 84px 104px 100px 100px; }",
    "  .grid-rank-mtd8 { grid-template-columns: 36px 2fr 64px 76px 96px 96px 96px 96px; }",
    "  .rank-aviso { font-size: 11px; color: var(--amber); font-weight: 700; margin-top: 6px; }"
  ]) });

H.push({ f: 'Index.html', n: 2, why: 'Ranking: usa o grid de 8 colunas no mês corrente',
  old: "  const gridCls = isCurr ? 'grid-rank-mtd7' : 'grid-rank-mtd';",
  nw:  "  const gridCls = isCurr ? 'grid-rank-mtd8' : 'grid-rank-mtd';" });

H.push({ f: 'Index.html', n: 3, why: 'Ranking: badge de projeção do total + guarda de meta divergente entre Compilado e aba Meta Pré vendedor',
  old: J([
    "  const totalRow = ating.total || {};",
    "  const totalBadge = badgeForPct(totalRow.atingimentoProRata);",
    "  const totalMetaBadge = badgeForPct(atingVsMetaCheia(totalRow));"
  ]),
  nw: J([
    "  const totalRow = ating.total || {};",
    "  const totalBadge = badgeForPct(totalRow.atingimentoProRata);",
    "  const totalMetaBadge = badgeForPct(atingVsMetaCheia(totalRow));",
    "  // Ating. Projeção = col K do Compilado: (Realizado + 85% do A validar) ÷ Meta Pro Rata.",
    "  // É a MESMA conta do card \"Atingimento Projeção\" da Visão Geral — só existe no mês corrente.",
    "  const totalProjBadge = badgeForPct(isCurr ? totalRow.atingimentoProjecaoPctVsMetaProRata : null);",
    "",
    "  // Guarda: a meta do Compilado (col B) e a da aba \"Meta Pré vendedor\" (mesmo mês) precisam",
    "  // ser iguais — o Ranking usa a primeira e o gráfico \"Atingimento da meta\" usa a segunda.",
    "  // Se divergirem (ou se a coluna do mês estiver vazia, o bug de jul/26), avisa em vez de calar.",
    "  let avisoMeta = '';",
    "  if (isCurr) {",
    "    const mpm = DASHBOARD_DATA.metasPorMes && DASHBOARD_DATA.metasPorMes.metas;",
    "    const metasAba = mpm ? mpm[ating.mesLabel] : null;",
    "    if (!metasAba) {",
    "      avisoMeta = 'Aba \"Meta Pré vendedor\" sem meta para ' + ating.mesLabel + ' — o gráfico \"Atingimento da meta\" da Visão Geral fica sem denominador.';",
    "    } else {",
    "      const div = (ating.rows || []).filter(function(r) {",
    "        const m = metasAba[r.vendedor];",
    "        return m != null && m !== '' && Number(m) !== Number(r.metaTime || 0);",
    "      }).map(function(r) { return r.vendedor + ' (Compilado ' + r.metaTime + ' × aba ' + metasAba[r.vendedor] + ')'; });",
    "      if (div.length) avisoMeta = 'Meta divergente entre Compilado e aba \"Meta Pré vendedor\": ' + div.join(', ') + '.';",
    "    }",
    "  }",
    "  const avisoMetaHtml = avisoMeta ? '<div class=\"rank-aviso\">⚠ ' + avisoMeta + '</div>' : '';"
  ]) });

H.push({ f: 'Index.html', n: 4, why: 'Ranking: Math.round em vez de Math.ceil (ceil inflava a meta pro rata e a soma das linhas) + badge de projeção por linha',
  old: J([
    "    const meta_       = Math.ceil(r.metaTime || 0);",
    "    const metaProRata = Math.ceil(r.metaProRata || 0);",
    "    const realizado   = Math.ceil(r.realizado || 0);",
    "    const atingBadge  = badgeForPct(r.atingimentoProRata);",
    "    const atingMetaBadge = badgeForPct(atingVsMetaCheia(r));"
  ]),
  nw: J([
    "    // Math.round, não Math.ceil: ceil arredondava 19,8 → 20 e 82,1 → 83 (o Compilado mostra 82),",
    "    // e deixava a linha auto-contraditória (Vitória 15/16 = 93,8% com badge de 94,9%).",
    "    const meta_       = Math.round(r.metaTime || 0);",
    "    const metaProRata = Math.round(r.metaProRata || 0);",
    "    const realizado   = Math.round(r.realizado || 0);",
    "    const atingBadge  = badgeForPct(r.atingimentoProRata);",
    "    const atingProjBadge = badgeForPct(isCurr ? r.atingimentoProjecaoPctVsMetaProRata : null);",
    "    const atingMetaBadge = badgeForPct(atingVsMetaCheia(r));"
  ]) });

H.push({ f: 'Index.html', n: 5, why: 'Ranking: célula Ating. Projeção entre Pro Rata e Meta (linhas)',
  old: J([
    "        <div style=\"text-align:center\"><span class=\"metric-badge ${atingBadge.cls}\">${atingBadge.label}</span></div>",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${atingMetaBadge.cls}\">${atingMetaBadge.label}</span></div>` : ''}",
    "      </div>`;"
  ]),
  nw: J([
    "        <div style=\"text-align:center\"><span class=\"metric-badge ${atingBadge.cls}\">${atingBadge.label}</span></div>",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${atingProjBadge.cls}\">${atingProjBadge.label}</span></div>` : ''}",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${atingMetaBadge.cls}\">${atingMetaBadge.label}</span></div>` : ''}",
    "      </div>`;"
  ]) });

H.push({ f: 'Index.html', n: 6, why: 'Ranking: legenda inclui a coluna nova',
  old: J([
    "  const legendaAting = isCurr",
    "    ? ' · Ating. Pro Rata = no ritmo esperado até hoje · Ating. Meta = do total do mês'",
    "    : '';"
  ]),
  nw: J([
    "  const legendaAting = isCurr",
    "    ? ' · Ating. Pro Rata = no ritmo esperado até hoje · Ating. Projeção = (realizado + 85% do a validar) vs pro rata · Ating. Meta = do total do mês'",
    "    : '';"
  ]) });

H.push({ f: 'Index.html', n: 7, why: 'Ranking: aviso de meta divergente no cabeçalho + coluna Ating. Projeção no header',
  old: J([
    "      ${headerInfo}${legendaAting}",
    "    </div>"
  ]),
  nw: J([
    "      ${headerInfo}${legendaAting}",
    "      ${avisoMetaHtml}",
    "    </div>"
  ]) });

H.push({ f: 'Index.html', n: 8, why: 'Ranking: header da coluna Ating. Projeção',
  old: "        ${isCurr ? `<div style=\"text-align:center\">Ating. Meta${tip('Realizado ÷ Meta CHEIA do mês, sem ajuste por dias decorridos. Quanto do mês inteiro já foi entregue.', true)}</div>` : ''}",
  nw: J([
    "        ${isCurr ? `<div style=\"text-align:center\">Ating. Projeção${tip('(Realizado + 85% do A validar) ÷ Meta Pro Rata — col K do Compilado, a mesma conta do card \"Atingimento Projeção\" da Visão Geral. Atenção: o A validar inclui reuniões ainda futuras no mês.', true)}</div>` : ''}",
    "        ${isCurr ? `<div style=\"text-align:center\">Ating. Meta${tip('Realizado ÷ Meta CHEIA do mês, sem ajuste por dias decorridos. Quanto do mês inteiro já foi entregue.', true)}</div>` : ''}"
  ]) });

H.push({ f: 'Index.html', n: 9, why: 'Ranking: linha Total — round, célula de projeção e rótulo "Total do time" quando há filtro de pré-vendedor',
  old: J([
    "        <div style=\"text-transform:uppercase;font-size:11px;letter-spacing:0.06em;color:var(--muted);\">Total</div>",
    "        <div style=\"text-align:center\">${Math.ceil(totalRow.metaTime || 0)}</div>",
    "        <div style=\"text-align:center\">${Math.ceil(totalRow.metaProRata || 0)}</div>",
    "        <div style=\"text-align:center\">${Math.ceil(totalRow.realizado || 0)}</div>",
    "        <div style=\"text-align:center\"><span class=\"metric-badge ${totalBadge.cls}\">${totalBadge.label}</span></div>",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${totalMetaBadge.cls}\">${totalMetaBadge.label}</span></div>` : ''}"
  ]),
  nw: J([
    "        <div style=\"text-transform:uppercase;font-size:11px;letter-spacing:0.06em;color:var(--muted);\">${sv === 'all' ? 'Total' : 'Total do time'}</div>",
    "        <div style=\"text-align:center\">${Math.round(totalRow.metaTime || 0)}</div>",
    "        <div style=\"text-align:center\">${Math.round(totalRow.metaProRata || 0)}</div>",
    "        <div style=\"text-align:center\">${Math.round(totalRow.realizado || 0)}</div>",
    "        <div style=\"text-align:center\"><span class=\"metric-badge ${totalBadge.cls}\">${totalBadge.label}</span></div>",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${totalProjBadge.cls}\">${totalProjBadge.label}</span></div>` : ''}",
    "        ${isCurr ? `<div style=\"text-align:center\"><span class=\"metric-badge ${totalMetaBadge.cls}\">${totalMetaBadge.label}</span></div>` : ''}"
  ]) });

H.push({ f: 'Index.html', n: 10, why: 'Mês fechado: vendedor sem meta vira "—" em vez de 0,0% vermelho',
  old: J([
    "    const metaProRata = metaTime;",
    "    const atingimentoProRata = metaTime > 0 ? realizado / metaTime : 0;"
  ]),
  nw: J([
    "    const metaProRata = metaTime;",
    "    // null (não 0): sem meta não existe atingimento — badgeForPct/projPct mostram \"—\".",
    "    const atingimentoProRata = metaTime > 0 ? realizado / metaTime : null;"
  ]) });

H.push({ f: 'Index.html', n: 11, why: 'Visão Geral: Média por dia útil real (era total ÷ 20 fixo, com reuniões futuras no numerador)',
  old: J([
    "  const diasUteisFallback = 20;",
    "  const mediaDia = (Math.ceil(totalPeriodo) / diasUteisFallback).toFixed(1);"
  ]),
  nw: J([
    "  // Média por dia útil: volume bruto ATÉ HOJE (reunião com data futura fica fora)",
    "  // ÷ dias úteis decorridos no período (seg–sex menos a aba \"Feriados\", quando o backend",
    "  // manda a lista). Antes era total ÷ 20 fixo: no dia 07/09 dava 99 ÷ 20 = 5,0 com só",
    "  // 4 dias úteis passados e 15 reuniões ainda por acontecer dentro dos 99.",
    "  const duInfo = calcularDiasUteisDecorridos_();",
    "  const totalAteHoje = getTotalPorMetricAteHoje_('count');",
    "  const mediaDia = duInfo.dias > 0 ? (totalAteHoje / duInfo.dias).toFixed(1) : '—';",
    "  const mediaDiaSub = duInfo.dias > 0",
    "    ? (totalAteHoje + ' até hoje ÷ ' + duInfo.dias + (duInfo.dias === 1 ? ' dia útil' : ' dias úteis') + (duInfo.comFeriados ? '' : ' (seg–sex)'))",
    "    : 'nenhum dia útil decorrido no período';"
  ]) });

H.push({ f: 'Index.html', n: 12, why: 'Visão Geral: rótulo do card Média por dia',
  old: J([
    "        <div class=\"metric-label\">Média por dia</div>",
    "        <div class=\"metric-value\">${mediaDia}</div>",
    "        <div class=\"metric-sub\">~${diasUteisFallback} dias úteis</div>"
  ]),
  nw: J([
    "        <div class=\"metric-label\">Média por dia útil</div>",
    "        <div class=\"metric-value\">${mediaDia}</div>",
    "        <div class=\"metric-sub\">${mediaDiaSub}</div>"
  ]) });

H.push({ f: 'Index.html', n: 13, why: 'Helpers novos: volume até hoje e dias úteis decorridos',
  old: J([
    "// Aplica filtro de período + filtro de seller a metas.items.",
    "// Usado pelos charts de Visão Geral.",
    "function obterMetasFiltradas() {"
  ]),
  nw: J([
    "// Volume (métrica) do período atual só até HOJE — descarta reuniões com data futura.",
    "function getTotalPorMetricAteHoje_(metric) {",
    "  if (!DASHBOARD_DATA) return 0;",
    "  const today = (DASHBOARD_DATA.metaInfo || {}).today || '';",
    "  const sv = document.getElementById('filter-seller').value;",
    "  return filtrarMetasPorPeriodo().reduce(function(acc, i) {",
    "    if (sv !== 'all' && i.vendedor !== sv) return acc;",
    "    if (today && i.date > today) return acc;",
    "    return acc + (i[metric] || 0);",
    "  }, 0);",
    "}",
    "",
    "// Dias úteis decorridos no período selecionado (início → min(hoje, fim)).",
    "// seg–sex, menos metaInfo.feriados (ISO, aba \"Feriados\") quando o backend enviar a lista.",
    "function calcularDiasUteisDecorridos_() {",
    "  const meta = (DASHBOARD_DATA && DASHBOARD_DATA.metaInfo) || {};",
    "  const today = meta.today || '';",
    "  const p = document.getElementById('filter-periodo').value;",
    "  const f = (DASHBOARD_DATA && DASHBOARD_DATA.filters) || {};",
    "  let ini, fim;",
    "  if (p === 'today') { ini = today; fim = today; }",
    "  else if (p === 'week') { ini = obterInicioSemana(today); fim = today; }",
    "  else if (p === 'custom') { ini = f.cohortStart || meta.startMonth; fim = f.cohortEnd || meta.endMonth; }",
    "  else { ini = meta.startMonth; fim = meta.endMonth; }",
    "  if (!ini || !fim) return { dias: 0, comFeriados: false };",
    "  if (today && fim > today) fim = today;",
    "  const feriados = Array.isArray(meta.feriados) ? meta.feriados : [];",
    "  const setF = {};",
    "  feriados.forEach(function(d) { setF[d] = true; });",
    "  let dias = 0;",
    "  const d = new Date(ini + 'T00:00:00');",
    "  const end = new Date(fim + 'T00:00:00');",
    "  while (d <= end) {",
    "    const dow = d.getDay();",
    "    if (dow !== 0 && dow !== 6 && !setF[formatarISO_(d)]) dias++;",
    "    d.setDate(d.getDate() + 1);",
    "  }",
    "  return { dias: dias, comFeriados: feriados.length > 0 };",
    "}",
    "",
    "// Aplica filtro de período + filtro de seller a metas.items.",
    "// Usado pelos charts de Visão Geral.",
    "function obterMetasFiltradas() {"
  ]) });

H.push({ f: 'Index.html', n: 14, why: 'Visão Geral: badge do Líder diz contra o que compara (pro rata) e não inventa % em semana/hoje',
  old: "const leaderBadge = topPct >= 100 ? 'badge-green' : topPct >= 80 ? 'badge-amber' : 'badge-red';",
  nw: J([
    "// Rótulo honesto: no mês corrente o denominador é a META PRO RATA (não a meta cheia — o",
    "// gráfico \"Atingimento da meta\" logo abaixo usa a cheia, por isso os % diferem). Em",
    "// semana/hoje não existe meta do período, então mostra só o nº de válidos, sem cor.",
    "const periodoLider = document.getElementById('filter-periodo').value;",
    "const liderSemMeta = (periodoLider === 'today' || periodoLider === 'week');",
    "const leaderBadge = liderSemMeta ? '' : (topPct >= 100 ? 'badge-green' : topPct >= 80 ? 'badge-amber' : 'badge-red');",
    "const leaderBadgeTxt = !leader ? '—'",
    "  : liderSemMeta ? (leader.realizado + (leader.realizado === 1 ? ' válido' : ' válidos'))",
    "  : (ating && ating.isMesCorrente) ? (topPct + '% da meta pro rata')",
    "  : (topPct + '% da meta');"
  ]) });

H.push({ f: 'Index.html', n: 15, why: 'Visão Geral: markup do badge do Líder',
  old: "        <span class=\"metric-badge ${leaderBadge}\">${topPct}% da meta</span>",
  nw:  "        <span class=\"metric-badge ${leaderBadge}\">${leaderBadgeTxt}</span>" });

H.push({ f: 'Index.html', n: 16, why: 'Visão Geral: card "Esta semana" explica que é seg→dom e inclui reuniões futuras (o preset Semana atual é seg→hoje)',
  old: "        <div class=\"metric-sub\">${weekStart} a ${weekEnd}</div>",
  nw:  "        <div class=\"metric-sub\">${weekStart} a ${weekEnd} · seg→dom, inclui reuniões futuras</div>" });

H.push({ f: 'Index.html', n: 17, why: 'Visão Geral: remove ">" solto que aparecia antes do valor do card Projetado (Fim do Mês)',
  old: ">      <div class=\"metric-value\" style=\"color:${projMesBadge === 'badge-green' ? 'var(--accent)' : projMesBadge === 'badge-amber' ? 'var(--amber)' : 'var(--red)'}\">${projMesPctLabel}</div>",
  nw:  "      <div class=\"metric-value\" style=\"color:${projMesBadge === 'badge-green' ? 'var(--accent)' : projMesBadge === 'badge-amber' ? 'var(--amber)' : 'var(--red)'}\">${projMesPctLabel}</div>" });

H.push({ f: 'Index.html', n: 18, why: 'Visão Geral: tooltip do Atingimento Projeção com a fórmula real (col K) e o porquê de divergir do Projetado',
  old: "    ? 'Compara o que o time ja fez (realizado + 85% do que esta quase certo de validar) contra a meta proporcional aos dias ja passados no mes. Responde: como estamos indo ate agora, comparado com o esperado ate hoje?'",
  nw:  "    ? 'Col K do Compilado: (Realizado + 85% do A validar) ÷ Meta Pro Rata (meta × dias úteis decorridos ÷ dias úteis do mês). O A validar inclui reuniões ainda futuras no mês, por isso este número pode passar de 100% mesmo com o ritmo de validados abaixo da meta — compare com o card Projetado (Fim do Mês), que extrapola só os validados.'" });

H.push({ f: 'Index.html', n: 19, why: 'Visão Geral: título/tooltip do card Projetado (Fim do Mês) — fórmula real (col M) e nome certo em mês fechado',
  old: J([
    "    const projMesTituloKPI = 'Atingimento Projetado (Fim do Mes)';",
    "    const projMesSubKPI = (ating && ating.isMesCorrente)",
    "    ? `${projContexto} vs Meta Mes - projecao full-month`",
    "    : `${projContexto} vs Meta Total - ${ating ? ating.mesLabel : '-'} (mes finalizado)`;",
    "    const projMesTituloKPITip = 'Projeta o realizado no ritmo atual ate o fim do mes (extrapolando pelos dias uteis restantes) e compara com a meta do mes inteiro. Responde: se continuarmos nesse ritmo, vamos bater a meta do mes?';"
  ]),
  nw: J([
    "    const projMesTituloKPI = (ating && ating.isMesCorrente) ? 'Atingimento Projetado (Fim do Mês)' : 'Atingimento (mês finalizado)';",
    "    const projMesSubKPI = (ating && ating.isMesCorrente)",
    "    ? `${projContexto} vs Meta Mês - projeção full-month`",
    "    : `${projContexto} vs Meta Total - ${ating ? ating.mesLabel : '-'} (mesmo valor do card ao lado)`;",
    "    const projMesTituloKPITip = (ating && ating.isMesCorrente)",
    "    ? 'Col M do Compilado: [Realizado + 85% do A validar + (Realizado ÷ dias úteis decorridos) × dias úteis restantes] ÷ Meta do mês. Extrapola só o ritmo de VALIDADOS até hoje — por isso fica abaixo do card Atingimento Projeção quando há muito A validar.'",
    "    : 'Mês finalizado: realizado ÷ meta do mês (não há mais projeção).';"
  ]) });

H.push({ f: 'Index.html', n: 20, why: 'Visão Geral: gráfico "Atingimento da meta" respeita o filtro de pré-vendedor (o gráfico ao lado já respeitava)',
  old: "  const sellersAll = SELLERS;",
  nw:  "  const sellersAll = (sv === 'all') ? SELLERS : SELLERS.filter(function(s) { return s === sv; });" });

H.push({ f: 'Index.html', n: 21, why: 'Online vs Presencial: fonte real (regra por Executivo desde 24/08, não tipo_de_reuniao) e universo explicitado',
  old: "      <div class=\"chart-card-sub\">Fonte: HubSpot Lead (tipo_de_reuniao) \\u00b7 Base Leads 2025-2026 \\u00b7 Total no periodo: ${totalGeral}</div>",
  nw:  "      <div class=\"chart-card-sub\">Fonte: Base Leads 2025-2026 (leads que entraram em Agendado no periodo \\u2014 universo diferente dos passes validados) \\u00b7 Online/Presencial definido pelo Executivo de Vendas (4 executivos fazem online, o resto e presencial) \\u00b7 \"Agora\" vem do HubSpot \\u00b7 Total no periodo: ${totalGeral}</div>" });

H.push({ f: 'Index.html', n: 22, why: 'Online vs Presencial: rótulo "Top 8 + Outras" estava desatualizado (mostra todas as rotas desde 10/08)',
  old: "        <div class=\"chart-card-sub\">rota_do_lead \\u00b7 Base Leads \\u00b7 Top 8 + Outras</div>",
  nw:  "        <div class=\"chart-card-sub\">rota_do_lead \\u00b7 Base Leads \\u00b7 todas as rotas, sem agrupamento</div>" });

H.push({ f: 'Index.html', n: 23, why: 'Overlay de deals: janela é a da planilha, não necessariamente o mês corrente',
  old: "  const sub = `${fmtDataBR_(dateRange.start)} — ${fmtDataBR_(dateRange.end)} · mês corrente`;",
  nw:  "  const sub = `${fmtDataBR_(dateRange.start)} — ${fmtDataBR_(dateRange.end)} · janela da planilha (muda só em \"Atualizar dados\"), independente do seletor de período`;" });

H.push({ f: 'Index.html', n: 24, why: 'Funil: explicita que o card Total inclui leads sem pré-vendedor (soma dos cards ≠ Total)',
  old: "  const filtrosAtivos = temFiltrosDimensoesAtivos_();",
  nw: J([
    "  // Leads sem pré-vendedor válido entram só no card Total (backend soma em Total.lead).",
    "  // Sem esta nota, a soma dos cards individuais parece \"não bater\" com o Total.",
    "  const semOwnerLead = (fl.fatiadoSemOwner || []).reduce(function(a, x) { return a + ((x.mes && x.mes.lead) || 0); }, 0);",
    "  const notaSemOwner = (sv === 'all' && semOwnerLead > 0)",
    "    ? `<div style=\"font-size:11px;color:var(--muted);margin-top:4px;\">O card <strong style=\"color:var(--text)\">Total</strong> inclui ${semOwnerLead} lead${semOwnerLead === 1 ? '' : 's'} sem pré-vendedor válido (etapa Lead), que não aparecem nos cards individuais — por isso a soma dos cards é menor que o Total.</div>`",
    "    : '';",
    "  const filtrosAtivos = temFiltrosDimensoesAtivos_();"
  ]) });

H.push({ f: 'Index.html', n: 25, why: 'Funil: renderiza a nota do Total',
  old: J([
    "        Fonte: Base Leads 2025-2026 · Período: ${fl.dateRange.start} → ${fl.dateRange.end}",
    "      </div>"
  ]),
  nw: J([
    "        Fonte: Base Leads 2025-2026 · Período: ${fl.dateRange.start} → ${fl.dateRange.end}",
    "      </div>",
    "      ${notaSemOwner}"
  ]) });

H.push({ f: 'Index.html', n: 26, why: 'MRR: mostra a data do snapshot e avisa que meses posteriores estão incompletos',
  old: J([
    "    html += tabelaHtml(",
    "      'MRR — por mês de agendamento',",
    "      'Vendas geradas por reuniões agendadas em cada mês (SDR = pré-vendedor que fez a reunião) · Conversão = vendas / reuniões do período · snapshot manual (Redshift), não é ao vivo',",
    "      dados.agendamento, true",
    "    );",
    "    html += tabelaHtml(",
    "      'MRR — por mês de venda (fechamento)',",
    "      'Vendas fechadas em cada mês, independente de quando a reunião foi agendada · snapshot manual (Redshift), não é ao vivo',",
    "      dados.venda, false",
    "    );"
  ]),
  nw: J([
    "    // Snapshot manual: sem a data na tela, um mês parcial (ex.: agosto lido em 10/08) parece mês fechado.",
    "    var snapTxt = dados.snapshot",
    "      ? 'snapshot manual (Redshift) de ' + fmtDataBR_(dados.snapshot) + ' — meses iguais ou posteriores a essa data estão incompletos'",
    "      : 'snapshot manual (Redshift) sem data registrada — não é ao vivo';",
    "    html += tabelaHtml(",
    "      'MRR — por mês de agendamento',",
    "      'Vendas geradas por reuniões agendadas em cada mês (SDR = pré-vendedor que fez a reunião) · Conversão = vendas / reuniões do período · ' + snapTxt,",
    "      dados.agendamento, true",
    "    );",
    "    html += tabelaHtml(",
    "      'MRR — por mês de venda (fechamento)',",
    "      'Vendas fechadas em cada mês, independente de quando a reunião foi agendada · ' + snapTxt,",
    "      dados.venda, false",
    "    );"
  ]) });

// ─────────────────────────────────────────────────────────────────────────────
// READER.GS
// ─────────────────────────────────────────────────────────────────────────────
H.push({ f: 'Reader.gs', n: 1, why: 'metaInfo passa a levar a lista de feriados (aba Feriados) para o card Média por dia útil',
  old: J([
    "  return {",
    "    startMonth: formatarDataISO_(startMonth),",
    "    endMonth:   formatarDataISO_(endMonth),",
    "    today:      formatarDataISO_(today),",
    "    diasUteisRestantes: null  // Reservado: implementar com aba Feriados se necessário",
    "  };"
  ]),
  nw: J([
    "  // Feriados (aba \"Feriados\", col A, dd/mm/yyyy ou Date) em ISO — o frontend usa pra",
    "  // contar dias úteis decorridos no card \"Média por dia útil\". Falha aqui não derruba o payload.",
    "  let feriados = [];",
    "  try {",
    "    const shF = ss.getSheetByName('Feriados');",
    "    if (shF && shF.getLastRow() >= 1) {",
    "      feriados = shF.getRange(1, 1, shF.getLastRow(), 1).getValues()",
    "        .map(function(r) { return r[0]; })",
    "        .filter(function(v) { return v !== '' && v !== null && v !== undefined; })",
    "        .map(function(v) {",
    "          if (v instanceof Date) return formatarDataISO_(v);",
    "          const m = String(v).trim().match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);",
    "          return m ? (m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')) : null;",
    "        })",
    "        .filter(function(v) { return !!v; });",
    "    }",
    "  } catch (e) { Logger.log('lerMetaInfo_: feriados indisponíveis — ' + e.message); }",
    "",
    "  return {",
    "    startMonth: formatarDataISO_(startMonth),",
    "    endMonth:   formatarDataISO_(endMonth),",
    "    today:      formatarDataISO_(today),",
    "    feriados:   feriados,",
    "    diasUteisRestantes: null  // Reservado",
    "  };"
  ]) });

H.push({ f: 'Reader.gs', n: 2, why: 'MRR: lê a linha "snapshot" (data) e blinda NaN em célula vazia',
  old: "  var agendamento = [], venda = [];",
  nw:  "  var agendamento = [], venda = [], snapshot = null;" });

H.push({ f: 'Reader.gs', n: 3, why: 'MRR: NaN guard',
  old: J([
    "    var vendas = Number(row[4]);",
    "    var mrr = Number(row[5]);"
  ]),
  nw: J([
    "    var vendas = Number(row[4]) || 0;",
    "    var mrr = Number(row[5]) || 0;"
  ]) });

H.push({ f: 'Reader.gs', n: 4, why: 'MRR: linha Base=snapshot com a data na col C vira payload.snapshot',
  old: J([
    "    if (base === 'agendamento') { item.reunioes = reunioes; agendamento.push(item); }",
    "    else if (base === 'venda') { venda.push(item); }",
    "  });",
    "  return { agendamento: agendamento, venda: venda };"
  ]),
  nw: J([
    "    if (base === 'agendamento') { item.reunioes = reunioes; agendamento.push(item); }",
    "    else if (base === 'venda') { venda.push(item); }",
    "    else if (base === 'snapshot') {",
    "      // Linha de controle: col C = data em que o snapshot foi tirado do Redshift.",
    "      snapshot = mesRaw instanceof Date",
    "        ? Utilities.formatDate(mesRaw, Session.getScriptTimeZone(), 'yyyy-MM-dd')",
    "        : String(mesRaw).slice(0, 10);",
    "    }",
    "  });",
    "  return { agendamento: agendamento, venda: venda, snapshot: snapshot };"
  ]) });

// ─────────────────────────────────────────────────────────────────────────────
// COHORT.GS
// ─────────────────────────────────────────────────────────────────────────────
H.push({ f: 'Cohort.gs', n: 1, why: 'Cohort: roster vem do Compilado, não da col B por posição (lia Luiz, que saiu, e deixava Vitória de fora)',
  old: J([
    "  // Nomes RAW da aba cohort (col B), N linhas a partir de absInicio. NÃO normalizar:",
    "  // a contagem compara com o proprietário (col H de Passes Do Mês), que é raw.",
    "  const vendedores = sheetCohort.getRange(layout.absInicio, layout.colVend, N, 1)",
    "    .getValues().map(function(r) { return r[0]; });",
    "",
    "  // Validação: avisa se a aba cohort tem menos nomes que o Compilado (operador",
    "  // adicionou vendedor no Compilado mas esqueceu de adicionar aqui).",
    "  const nomesBrancos = vendedores.filter(function(v) { return !v || String(v).trim() === ''; }).length;",
    "  if (nomesBrancos > 0) {",
    "    Logger.log('Cohort: ATENÇÃO — ' + nomesBrancos + ' nome(s) de vendedor em branco na coluna B ' +",
    "      '(esperados ' + N + ' nomes a partir da linha ' + layout.absInicio + ', conforme o Compilado). ' +",
    "      'Adicione os nomes faltantes na aba \"' + CONFIG.ABA_COHORT + '\".');",
    "  }"
  ]),
  nw: J([
    "  // Nomes vêm do COMPILADO (fonte da verdade do roster), não mais da col B por posição.",
    "  // Bug corrigido em 07/09/2026: a col B ainda tinha a lista antiga de 6 nomes; com N=4",
    "  // o cohort lia \"Luiz Fernando Pellegrini\" (saiu em ago/26, 0 passes) e deixava",
    "  // \"Vitória Miranda\" de fora — total 76 em vez de 99. Os nomes agora são ESCRITOS na",
    "  // col B dos dois blocos a cada execução, e a comparação com o proprietário (col H de",
    "  // Passes Do Mês) é normalizada dos dois lados (cobre alias como \"Maria Victoria ...\").",
    "  const vendedores = lerCompilado_(ss).rows.map(function(r) { return r.vendedor; });",
    "  const vendedoresNorm = vendedores.map(function(v) { return normalizarVendedor(v); });"
  ]) });

H.push({ f: 'Cohort.gs', n: 2, why: 'Cohort: comparação normalizada de proprietário',
  old: "        if (proprietario !== nomeVendedor) continue;",
  nw:  "        if (normalizarVendedor(proprietario) !== vendedoresNorm[v]) continue;" });

H.push({ f: 'Cohort.gs', n: 3, why: 'Cohort: escreve o roster na col B (abs + perc) e limpa resíduo da lista antiga',
  old: J([
    "  // Limpa áreas de saída antes de reescrever (clear único generoso, via helper",
    "  // compartilhado — cobre resíduo de execução anterior com N maior; nunca toca H1/H2)",
    "  limparAreaCohort_(sheetCohort);"
  ]),
  nw: J([
    "  // Limpa áreas de saída antes de reescrever (clear único generoso, via helper",
    "  // compartilhado — cobre resíduo de execução anterior com N maior; nunca toca H1/H2)",
    "  limparAreaCohort_(sheetCohort);",
    "",
    "  // Col B: apaga o resíduo do roster antigo (até o teto) e escreve o roster atual nos",
    "  // dois blocos, com os rótulos do bloco percentual. lerCohort_ (Reader.gs) continua",
    "  // lendo a col B — agora sempre coerente com o que foi contado.",
    "  const layoutTeto = layoutCohort_(CONFIG.COHORT.MAX_VENDEDORES);",
    "  sheetCohort.getRange(layout.absInicio, layout.colVend, layoutTeto.totalPerc - layout.absInicio + 1, 1).clearContent();",
    "  const nomesCol = vendedores.map(function(v) { return [v]; });",
    "  sheetCohort.getRange(layout.absInicio, layout.colVend, N, 1).setValues(nomesCol);",
    "  sheetCohort.getRange(layout.totalAbs, layout.colVend, 1, 1).setValue('Total');",
    "  sheetCohort.getRange(layout.percDatas - 1, layout.colVend, 1, 1).setValue('Semana de Criação');",
    "  sheetCohort.getRange(layout.percDatas, layout.colVend, 1, 1).setValue('Passes da Semana');",
    "  sheetCohort.getRange(layout.percNumeros, layout.colVend, 1, 1).setValue('Pré Vendedor');",
    "  sheetCohort.getRange(layout.percInicio, layout.colVend, N, 1).setValues(nomesCol);",
    "  sheetCohort.getRange(layout.totalPerc, layout.colVend, 1, 1).setValue('Total');"
  ]) });

// ─────────────────────────────────────────────────────────────────────────────
// APLICAÇÃO + VALIDAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
const files = {};
let erro = false;
for (const h of H) {
  if (!files[h.f]) files[h.f] = fs.readFileSync(path.join(ROOT, h.f), 'utf8').replace(/\r\n/g, '\n');
  const n = files[h.f].split(h.old).length - 1;
  if (n !== 1) { console.error(`✗ ${h.f} #${h.n}: âncora encontrada ${n}× (precisa ser 1)`); erro = true; continue; }
  files[h.f] = files[h.f].replace(h.old, () => h.nw);
  console.log(`✓ ${h.f} #${h.n} — ${h.why}`);
}
if (erro) { console.error('ABORTADO: nenhum arquivo escrito.'); process.exit(1); }

// Sanidade pós-aplicação
const idx = files['Index.html'];
console.log('grid-rank-mtd8:', idx.split('grid-rank-mtd8').length - 1, '| Ating. Projeção:', idx.split('Ating. Projeção').length - 1,
  '| linhas Index:', idx.split('\n').length, '| Cohort linhas:', files['Cohort.gs'].split('\n').length, '| Reader linhas:', files['Reader.gs'].split('\n').length);

if (!CHECK) {
  for (const f of Object.keys(files)) fs.writeFileSync(path.join(ROOT, f), files[f]);
  // Applier pro editor do Apps Script (console do DevTools ou automação). Um modelo Monaco por arquivo.
  const MARK = { 'Index.html': 'function renderRanking', 'Reader.gs': 'function lerMetaInfo_', 'Cohort.gs': 'function construirCohortPassesSemana' };
  const porArq = {};
  for (const h of H) (porArq[h.f] = porArq[h.f] || []).push({ n: h.n, old: h.old, nw: h.nw });
  const applier = `// aplicar-v21.js — Versão 21 do painel Inbound (${H.length} hunks em ${Object.keys(porArq).length} arquivos).
// Cole no console do DevTools (F12) com o editor do Apps Script aberto (qualquer arquivo).
// Não salva sozinho: só edita os modelos do Monaco. Depois: salvar pelo ícone da UI (Ctrl+S não!)
// em CADA arquivo alterado e implantar como "Nova versão" na implantação existente.
(function () {
  var HUNKS = ${JSON.stringify(porArq)};
  var MARK = ${JSON.stringify(MARK)};
  var models = (window.monaco && monaco.editor.getModels()) || [];
  var out = [];
  var alvo = {};
  for (var f in HUNKS) {
    var c = models.filter(function (m) { return m.getValue().indexOf(MARK[f]) !== -1; });
    if (c.length !== 1) return 'ERRO: ' + f + ' — achei ' + c.length + ' modelos com "' + MARK[f] + '". Abra o projeto com todos os arquivos carregados.';
    alvo[f] = c[0];
  }
  // 1) valida TUDO antes de mexer em qualquer coisa
  var ruim = [];
  for (var f2 in HUNKS) HUNKS[f2].forEach(function (p) {
    if (alvo[f2].findMatches(p.old, false, false, true, null, false).length !== 1) ruim.push(f2 + '#' + p.n);
  });
  if (ruim.length) return 'ABORTADO, nada foi alterado. Hunks que nao casaram exatamente 1x: ' + ruim.join(', ');
  // 2) aplica
  for (var f3 in HUNKS) HUNKS[f3].forEach(function (p) {
    var m = alvo[f3];
    var hit = m.findMatches(p.old, false, false, true, null, false)[0];
    m.pushEditOperations([], [{ range: hit.range, text: p.nw }], function () { return null; });
  });
  for (var f4 in HUNKS) out.push(f4 + ': ' + HUNKS[f4].length + ' hunks, ' + alvo[f4].getLineCount() + ' linhas');
  return 'OK. ' + out.join(' | ') + '. Agora salve cada arquivo pelo icone da UI e implante como Nova versao.';
})();
`;
  fs.writeFileSync(path.join(__dirname, 'aplicar-v21.js'), applier);
  console.log('Escritos: scripts/{Index.html,Reader.gs,Cohort.gs} e docs/aplicar-v21.js');
}
