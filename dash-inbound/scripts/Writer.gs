// =============================================================
// Writer.gs — Escrita de células-input na planilha mãe
// =============================================================
// Apenas escreve datas em B2:C2 (Cohort) e A2:B2 (Funil).
// Não tocar em fórmulas (H1/H2 da Cohort) nem em qualquer outra célula.

function escreverDatasCohort(startISO, endISO) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  const sheet = ss.getSheetByName(CONFIG.ABA_COHORT);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_COHORT);

  sheet.getRange('B2').setValue(parseDataISO_(startISO));
  sheet.getRange('C2').setValue(parseDataISO_(endISO));
}

function escreverDatasFunil(startISO, endISO) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  const sheet = ss.getSheetByName(CONFIG.ABA_FUNIL);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_FUNIL);

  sheet.getRange('A2').setValue(parseDataISO_(startISO));
  sheet.getRange('B2').setValue(parseDataISO_(endISO));
}
