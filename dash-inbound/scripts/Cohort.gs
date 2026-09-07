// =============================================================
// Cohort.gs — Cálculo imperativo do cohort de passes por semana
// =============================================================
// Migração da função `construirCohortPassesSemana` original (cohort_webapp.gs)
// com 3 ajustes (BUILD.md §7.2):
//   1. Usa CONFIG.ABA_COHORT / CONFIG.ABA_PASSES_MES (alinhado com Code.gs)
//   2. Mantém throw new Error() em vez de getUi().alert()
//   3. Sem doGet/doPost/onOpen aqui — esses ficam em Code.gs
//
// A função NÃO retorna nada — apenas escreve nas linhas 5-13 (absoluto)
// e 16-24 (percentual) da aba "Passes da Semana". A leitura subsequente
// é feita por lerCohort_ em Reader.gs.

function construirCohortPassesSemana() {
  const ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  const sheetCohort = ss.getSheetByName(CONFIG.ABA_COHORT);
  const sheetDados  = ss.getSheetByName(CONFIG.ABA_PASSES_MES);

  if (!sheetCohort) {
    throw new Error('Aba "' + CONFIG.ABA_COHORT + '" não encontrada na planilha.');
  }
  if (!sheetDados) {
    throw new Error('Aba "' + CONFIG.ABA_PASSES_MES + '" não encontrada na planilha.');
  }

  let inicioSemana = sheetCohort.getRange('B2').getValue();
  let fimSemana    = sheetCohort.getRange('C2').getValue();

  if (!inicioSemana || !fimSemana) {
    throw new Error('B2 ou C2 estão vazios. Verifique as fórmulas de data na aba cohort.');
  }

  inicioSemana = new Date(inicioSemana);
  inicioSemana.setHours(0, 0, 0, 0);
  fimSemana = new Date(fimSemana);
  fimSemana.setHours(0, 0, 0, 0);

  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const intervaloDias = Math.round((fimSemana.getTime() - inicioSemana.getTime()) / MS_POR_DIA) + 1;

  fimSemana.setHours(23, 59, 59, 999);

  Logger.log('Intervalo detectado: ' + intervaloDias + ' dias');

  const ultimaLinha = sheetDados.getLastRow();
  if (ultimaLinha < 2) {
    throw new Error('Sem dados na aba "' + CONFIG.ABA_PASSES_MES + '".');
  }

  // K = data reunião, L = data criação, H = proprietário
  const colK = sheetDados.getRange(2, 11, ultimaLinha - 1, 1).getValues();
  const colL = sheetDados.getRange(2, 12, ultimaLinha - 1, 1).getValues();
  const colH = sheetDados.getRange(2,  8, ultimaLinha - 1, 1).getValues();

  const parseDateBR = function(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    const s = String(val).trim();
    const parts = s.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return new Date(s);
  };

  // 1ª passada: descobre quais cohorts existem (pelo menos 1 lead criado)
  const semanasSet = {};
  for (let i = 0; i < colL.length; i++) {
    const dataCriacao = parseDateBR(colL[i][0]);
    if (!dataCriacao || isNaN(dataCriacao.getTime())) continue;

    dataCriacao.setHours(0, 0, 0, 0);

    const diffMs = inicioSemana.getTime() - dataCriacao.getTime();
    const diffDias = Math.floor(diffMs / MS_POR_DIA);

    if (diffDias < 0) {
      semanasSet[0] = true;  // criação no futuro vira cohort 0
      continue;
    }

    const cohortNumero = Math.floor(diffDias / intervaloDias);
    semanasSet[cohortNumero] = true;
  }

  const cohortsExistentes = Object.keys(semanasSet)
    .map(Number)
    .sort(function(a, b) { return a - b; });

  if (cohortsExistentes.length === 0) {
    limparAreaCohort_(sheetCohort);
    Logger.log('Cohort: nenhum dado de criação encontrado no histórico. Saída limpa.');
    return;
  }

  // N e layout vêm da fonte da verdade (Compilado) — MESMA derivação que lerCohort_
  // em Reader.gs, garantindo que escrita e leitura nunca dessincronizam.
  const N = lerCompilado_(ss).rows.length;
  if (N < 1) {
    limparAreaCohort_(sheetCohort);
    Logger.log('Cohort: Compilado sem vendedores — saída limpa.');
    return;
  }
  const layout = layoutCohort_(N);

  // Nomes vêm do COMPILADO (fonte da verdade do roster), não mais da col B por posição.
  // Bug corrigido em 07/09/2026: a col B ainda tinha a lista antiga de 6 nomes; com N=4
  // o cohort lia "Luiz Fernando Pellegrini" (saiu em ago/26, 0 passes) e deixava
  // "Vitória Miranda" de fora — total 76 em vez de 99. Os nomes agora são ESCRITOS na
  // col B dos dois blocos a cada execução, e a comparação com o proprietário (col H de
  // Passes Do Mês) é normalizada dos dois lados (cobre alias como "Maria Victoria ...").
  const vendedores = lerCompilado_(ss).rows.map(function(r) { return r.vendedor; });
  const vendedoresNorm = vendedores.map(function(v) { return normalizarVendedor(v); });

  const formatarData = function(d) {
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return dia + '/' + mes + '/' + ano;
  };

  // 2ª passada: contagem absoluta (vendedor × cohort)
  const dadosAbsolutosCompletos = [];

  for (let v = 0; v < vendedores.length; v++) {
    const nomeVendedor = vendedores[v];
    const linhaVendedor = [];

    for (let c = 0; c < cohortsExistentes.length; c++) {
      const cohortNumero = cohortsExistentes[c];

      const inicioCohort = new Date(inicioSemana.getTime() - cohortNumero * intervaloDias * MS_POR_DIA);
      inicioCohort.setHours(0, 0, 0, 0);

      const fimCohort = new Date(inicioCohort.getTime() + (intervaloDias - 1) * MS_POR_DIA);
      fimCohort.setHours(23, 59, 59, 999);

      let count = 0;

      for (let i = 0; i < colK.length; i++) {
        const dataReuniao = parseDateBR(colK[i][0]);
        const dataCriacaoLinha = parseDateBR(colL[i][0]);
        const proprietario = colH[i][0];

        if (!dataReuniao || isNaN(dataReuniao.getTime())) continue;
        if (!dataCriacaoLinha || isNaN(dataCriacaoLinha.getTime())) continue;
        if (!proprietario) continue;
        if (normalizarVendedor(proprietario) !== vendedoresNorm[v]) continue;

        dataReuniao.setHours(0, 0, 0, 0);
        dataCriacaoLinha.setHours(0, 0, 0, 0);

        const reuniaoNoPeriodo = dataReuniao >= inicioSemana && dataReuniao <= fimSemana;
        const criacaoNoCohort  = dataCriacaoLinha >= inicioCohort && dataCriacaoLinha <= fimCohort;

        if (reuniaoNoPeriodo && criacaoNoCohort) {
          count++;
        }
      }

      linhaVendedor.push(count);
    }

    dadosAbsolutosCompletos.push(linhaVendedor);
  }

  // Filtra colunas de cohort com soma > 0
  const cohortsFiltrados = [];
  for (let c = 0; c < cohortsExistentes.length; c++) {
    let somaColuna = 0;
    for (let v = 0; v < dadosAbsolutosCompletos.length; v++) {
      somaColuna += dadosAbsolutosCompletos[v][c];
    }
    if (somaColuna > 0) {
      cohortsFiltrados.push(c);
    }
  }

  if (cohortsFiltrados.length === 0) {
    limparAreaCohort_(sheetCohort);
    Logger.log('Cohort: nenhum passe no período atual. Saída limpa.');
    return;
  }

  // Reduz dadosAbsolutosCompletos → dadosAbsolutos (apenas cohorts ativos) + total por vendedor
  const dadosAbsolutos = [];
  for (let v = 0; v < dadosAbsolutosCompletos.length; v++) {
    const linhaFiltrada = [];
    let totalVendedor = 0;
    for (let ci = 0; ci < cohortsFiltrados.length; ci++) {
      const val = dadosAbsolutosCompletos[v][cohortsFiltrados[ci]];
      linhaFiltrada.push(val);
      totalVendedor += val;
    }
    linhaFiltrada.push(totalVendedor);
    dadosAbsolutos.push(linhaFiltrada);
  }

  // Cabeçalhos (data + número, com a coluna "Total" no final)
  const cabecalhosNumero = [];
  const cabecalhosData = [];

  for (let ci = 0; ci < cohortsFiltrados.length; ci++) {
    const cohortNumero = cohortsExistentes[cohortsFiltrados[ci]];

    const inicioCohort = new Date(inicioSemana.getTime() - cohortNumero * intervaloDias * MS_POR_DIA);
    inicioCohort.setHours(0, 0, 0, 0);

    const fimCohort = new Date(inicioCohort.getTime() + (intervaloDias - 1) * MS_POR_DIA);

    cabecalhosNumero.push(String(cohortNumero));
    cabecalhosData.push(formatarData(inicioCohort) + ' - ' + formatarData(fimCohort));
  }

  cabecalhosNumero.push('Total');
  cabecalhosData.push('');

  // Limpa áreas de saída antes de reescrever (clear único generoso, via helper
  // compartilhado — cobre resíduo de execução anterior com N maior; nunca toca H1/H2)
  limparAreaCohort_(sheetCohort);

  // Col B: apaga o resíduo do roster antigo (até o teto) e escreve o roster atual nos
  // dois blocos, com os rótulos do bloco percentual. lerCohort_ (Reader.gs) continua
  // lendo a col B — agora sempre coerente com o que foi contado.
  const layoutTeto = layoutCohort_(CONFIG.COHORT.MAX_VENDEDORES);
  sheetCohort.getRange(layout.absInicio, layout.colVend, layoutTeto.totalPerc - layout.absInicio + 1, 1).clearContent();
  const nomesCol = vendedores.map(function(v) { return [v]; });
  sheetCohort.getRange(layout.absInicio, layout.colVend, N, 1).setValues(nomesCol);
  sheetCohort.getRange(layout.totalAbs, layout.colVend, 1, 1).setValue('Total');
  sheetCohort.getRange(layout.percDatas - 1, layout.colVend, 1, 1).setValue('Semana de Criação');
  sheetCohort.getRange(layout.percDatas, layout.colVend, 1, 1).setValue('Passes da Semana');
  sheetCohort.getRange(layout.percNumeros, layout.colVend, 1, 1).setValue('Pré Vendedor');
  sheetCohort.getRange(layout.percInicio, layout.colVend, N, 1).setValues(nomesCol);
  sheetCohort.getRange(layout.totalPerc, layout.colVend, 1, 1).setValue('Total');

  // ── MATRIZ ABSOLUTA ──────────────────────────────────────
  const rangeDatas1 = sheetCohort.getRange(layout.absDatas, layout.colDados, 1, cabecalhosData.length);
  rangeDatas1.setValues([cabecalhosData]);
  rangeDatas1.setFontSize(9);
  rangeDatas1.setFontColor('#000000');
  rangeDatas1.setHorizontalAlignment('center');
  rangeDatas1.setWrap(false);

  const rangeCabecalhos1 = sheetCohort.getRange(layout.absNumeros, layout.colDados, 1, cabecalhosNumero.length);
  rangeCabecalhos1.setValues([cabecalhosNumero]);
  rangeCabecalhos1.setFontWeight('bold');
  rangeCabecalhos1.setHorizontalAlignment('center');
  sheetCohort.getRange(layout.absNumeros, layout.colDados, 1, cohortsFiltrados.length).setBackground('#f4f4f4');

  sheetCohort.getRange(layout.absInicio, layout.colDados, dadosAbsolutos.length, cabecalhosNumero.length).setValues(dadosAbsolutos);

  const totaisColuna = [];
  for (let ci = 0; ci < cohortsFiltrados.length; ci++) {
    let somaColuna = 0;
    for (let v = 0; v < dadosAbsolutos.length; v++) {
      somaColuna += dadosAbsolutos[v][ci];
    }
    totaisColuna.push(somaColuna);
  }
  const totalGeral = totaisColuna.reduce(function(a, b) { return a + b; }, 0);
  totaisColuna.push(totalGeral);

  const rangeTotal1 = sheetCohort.getRange(layout.totalAbs, layout.colDados, 1, cabecalhosNumero.length);
  rangeTotal1.setValues([totaisColuna]);
  rangeTotal1.setFontWeight('bold');

  // ── MATRIZ PERCENTUAL ─────────────────────────────────────
  const rangeDatas2 = sheetCohort.getRange(layout.percDatas, layout.colDados, 1, cabecalhosData.length);
  rangeDatas2.setValues([cabecalhosData]);
  rangeDatas2.setFontSize(9);
  rangeDatas2.setFontColor('#000000');
  rangeDatas2.setHorizontalAlignment('center');
  rangeDatas2.setWrap(false);

  const rangeCabecalhos2 = sheetCohort.getRange(layout.percNumeros, layout.colDados, 1, cabecalhosNumero.length);
  rangeCabecalhos2.setValues([cabecalhosNumero]);
  rangeCabecalhos2.setFontWeight('bold');
  rangeCabecalhos2.setHorizontalAlignment('center');
  sheetCohort.getRange(layout.percNumeros, layout.colDados, 1, cohortsFiltrados.length).setBackground('#f4f4f4');

  const dadosPercentuais = [];
  for (let v = 0; v < dadosAbsolutos.length; v++) {
    const linhaAbs = dadosAbsolutos[v];
    const totalVend = linhaAbs[linhaAbs.length - 1];
    const linhaPerc = [];

    for (let ci = 0; ci < cohortsFiltrados.length; ci++) {
      linhaPerc.push(totalVend > 0 ? linhaAbs[ci] / totalVend : 0);
    }
    linhaPerc.push(totalVend > 0 ? 1 : 0);
    dadosPercentuais.push(linhaPerc);
  }

  const rangePerc = sheetCohort.getRange(layout.percInicio, layout.colDados, dadosPercentuais.length, cabecalhosNumero.length);
  rangePerc.setValues(dadosPercentuais);
  rangePerc.setNumberFormat('0.0%');

  const totaisPercColuna = [];
  for (let ci = 0; ci < cohortsFiltrados.length; ci++) {
    totaisPercColuna.push(totalGeral > 0 ? totaisColuna[ci] / totalGeral : 0);
  }
  totaisPercColuna.push(totalGeral > 0 ? 1 : 0);

  const rangeTotal2 = sheetCohort.getRange(layout.totalPerc, layout.colDados, 1, cabecalhosNumero.length);
  rangeTotal2.setValues([totaisPercColuna]);
  rangeTotal2.setNumberFormat('0.0%');
  rangeTotal2.setFontWeight('bold');

  sheetCohort.autoResizeColumns(layout.colDados, cabecalhosNumero.length);

  Logger.log('✅ Cohort | Intervalo: ' + intervaloDias + ' dias | ' +
             cohortsFiltrados.length + ' cohorts | ' +
             vendedores.length + ' vendedores.');
}

// limparAreaCohort_ vive agora em Utils.gs (clear único derivado de layoutCohort_),
// compartilhado entre a escrita acima e o estado-vazio. Mantido lá pra não duplicar
// os offsets do layout.
