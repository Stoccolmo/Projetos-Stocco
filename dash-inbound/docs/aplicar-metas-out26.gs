// Função TEMPORÁRIA (08/10/2026) — colada no fim do Utils.gs, executada uma vez pelo editor e removida.
// Faz a parte de planilha da V22: linha da Roberta no Compilado + metas de out/26 nas duas abas.
// Só escreve depois de validar o layout; se algo não for o esperado, lança erro sem alterar nada.
function aplicarMetasOutubro2026V22() {
  var ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  var metas = { 'Eduarda de Barros': 98, 'Giovanna Garcia': 42, 'Pedro Dias': 98, 'Roberta Lobasso': 133, 'Vitória Miranda': 78 };

  // --- validações (nada é escrito antes delas) ---
  var c = ss.getSheetByName(CONFIG.ABA_COMPILADO);
  var nomes = c.getRange('A2:A7').getValues().map(function (r) { return String(r[0]).trim(); });
  var esperado = ['Eduarda de Barros', 'Giovanna Garcia', 'Pedro Dias', '', 'Vitória Miranda', 'Total'];
  if (nomes.join('|') !== esperado.join('|')) throw new Error('Compilado fora do esperado: ' + nomes.join('|'));
  if (c.getRange('A5:Z5').getValues()[0].some(function (v) { return v !== ''; })) throw new Error('Linha 5 do Compilado não está vazia');

  var m = ss.getSheetByName('Meta Pré vendedor');
  var hdr = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
  var col = -1;
  hdr.forEach(function (v, i) { if (v instanceof Date && v.getFullYear() === 2026 && v.getMonth() === 9 && v.getDate() === 1) col = i + 1; });
  if (col < 0) throw new Error('Coluna 01/10/2026 não encontrada em Meta Pré vendedor');
  var linhas = m.getRange(2, 1, m.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  var alvo = [];
  Object.keys(metas).forEach(function (n) {
    var i = linhas.indexOf(n);
    if (i < 0) throw new Error('Pré-vendedor não encontrado na matriz: ' + n);
    if (m.getRange(i + 2, col).getValue() !== '') throw new Error('Célula da matriz já preenchida: ' + n);
    alvo.push([i + 2, metas[n]]);
  });

  // --- escrita ---
  var lastCol = c.getLastColumn();
  c.getRange(6, 1, 1, lastCol).copyTo(c.getRange(5, 1, 1, lastCol)); // fórmulas da Vitória -> linha 5
  c.getRange('A5').setValue('Roberta Lobasso');
  for (var r = 2; r <= 6; r++) c.getRange(r, 2).setValue(metas[String(c.getRange(r, 1).getValue()).trim()]);
  alvo.forEach(function (a) { m.getRange(a[0], col).setValue(a[1]); });
  SpreadsheetApp.flush();

  Logger.log('Compilado A2:F7 = ' + JSON.stringify(c.getRange('A2:F7').getDisplayValues()));
  Logger.log('Matriz col ' + col + ' = ' + JSON.stringify(m.getRange(1, col, m.getLastRow(), 1).getDisplayValues().map(function (x) { return x[0]; })));
}
