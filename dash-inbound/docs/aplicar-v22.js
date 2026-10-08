// aplicar-v22.js — Roberta no Inbound só a partir de out/2026 (5 hunks em 4 arquivos). Gerado por docs/build-v22.js.
// Cole no console do DevTools com o editor do Apps Script aberto. Aborta sem alterar nada se algum hunk não casar 1x.
// Depois: salvar, rodar sincronizarNeoCrescimento e exportarLeadsParaSheets, e publicar Nova versão.
(function () {
  var HUNKS = {"Utils.gs":[{"n":1,"old":"function parseDataISO_(iso) {","nw":"// V22 (08/10/2026): pre-vendedor que veio do Outbound so conta no Inbound a partir da data de\n// entrada no time. Antes dela, e em qualquer negocio que passou pelo funil Outbound, o dono e\n// gravado VAZIO nas bases (Neo Crescimento e Base Leads). A linha continua na base, entao os\n// totais de meses anteriores nao mudam. Roberta: Inbound jan-jun/26, Outbound jun-set/26, volta out/26.\nvar INICIO_NO_INBOUND_ = { 'Roberta Lobasso': '2026-10-01' };\nfunction donoNoInbound_(nome, data, veioDoOutbound) {\n  var ini = INICIO_NO_INBOUND_[nome];\n  if (!ini) return nome;\n  if (veioDoOutbound) return '';\n  var dt = (data instanceof Date) ? data : (data ? new Date(data) : null);\n  if (!dt || isNaN(dt.getTime())) return '';\n  var p = ini.split('-');\n  return dt >= new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) ? nome : '';\n}\n\nfunction parseDataISO_(iso) {"}],"leads.gs":[{"n":2,"old":"      var dono = owners[String(p.hubspot_owner_id)] || '';","nw":"      var dono = donoNoInbound_(owners[String(p.hubspot_owner_id)] || '', d_(p.hs_createdate), false); // V22"}],"SyncNeo.gs":[{"n":3,"old":"  var props = ['hs_object_id', 'dealname', 'createdate', PROP_SDR, PROP_DATA_REU, PROP_EFETIVA, PROP_DATA_OUT];","nw":"  // V22: entrada nas etapas Validação/Prospecção do funil Outbound (905667466) = negócio veio do Outbound\n  var PROPS_OUTBOUND = ['hs_v2_date_entered_1371354117', 'hs_v2_date_entered_1371354118'];\n  var props = ['hs_object_id', 'dealname', 'createdate', PROP_SDR, PROP_DATA_REU, PROP_EFETIVA, PROP_DATA_OUT].concat(PROPS_OUTBOUND);"},{"n":4,"old":"      var nome = owners[String(p[PROP_SDR])] || '';","nw":"      var veioDoOutbound = !!(p[PROP_DATA_OUT] || p[PROPS_OUTBOUND[0]] || p[PROPS_OUTBOUND[1]]);\n      var nome = donoNoInbound_(owners[String(p[PROP_SDR])] || '', reuniao, veioDoOutbound); // V22"}],"Index.html":[{"n":5,"old":"var VENDEDORES_EXCLUIDOS_ = ['Luiz Fernando Pellegrini', 'Roberta Lobasso'];","nw":"// V22: Roberta volta ao Inbound em out/2026. O historico dela antes disso ja chega vazio das bases\n// (donoNoInbound_ em Utils.gs), entao ela nao precisa mais ser escondida aqui.\nvar VENDEDORES_EXCLUIDOS_ = ['Luiz Fernando Pellegrini'];"}]};
  var MARK = {"Utils.gs":"function normalizarVendedor","leads.gs":"function exportarLeadsParaSheets","SyncNeo.gs":"function sincronizarNeoCrescimento","Index.html":"var VENDEDORES_EXCLUIDOS_"};
  var models = (window.monaco && monaco.editor.getModels()) || [];
  var alvo = {};
  for (var f in HUNKS) {
    var c = models.filter(function (m) { return m.getValue().indexOf(MARK[f]) !== -1; });
    if (c.length !== 1) return 'ERRO: ' + f + ' — ' + c.length + ' modelos com a marca. Abra os arquivos no editor e rode de novo.';
    alvo[f] = c[0];
  }
  var ruim = [];
  for (var f2 in HUNKS) HUNKS[f2].forEach(function (p) {
    if (alvo[f2].findMatches(p.old, false, false, true, null, false).length !== 1) ruim.push(f2 + '#' + p.n);
  });
  if (ruim.length) return 'ABORTADO, nada alterado: ' + ruim.join(', ');
  var out = [];
  for (var f3 in HUNKS) {
    HUNKS[f3].forEach(function (p) {
      var hit = alvo[f3].findMatches(p.old, false, false, true, null, false)[0];
      alvo[f3].pushEditOperations([], [{ range: hit.range, text: p.nw }], function () { return null; });
    });
    out.push(f3 + ': ' + alvo[f3].getLineCount() + ' linhas');
  }
  return 'OK. ' + out.join(' | ');
})();
