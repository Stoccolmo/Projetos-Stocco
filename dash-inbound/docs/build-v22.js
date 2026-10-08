// build-v22.js — gera docs/aplicar-v22.js (Roberta no Inbound só a partir de out/2026).
// Uso: node docs/build-v22.js [--write-mirror]   (rodar da pasta dash-inbound)
//
// Contexto (08/10/2026): Roberta Lobasso volta ao time de Qualificação em outubro/2026 (férias da
// Giovanna). Ela foi Inbound jan–jun/26 e Outbound jun–set/26. Rodrigo: "colocar os dados dela
// SOMENTE ESSE MÊS ... não traga os dados de outbound dela de jeito nenhum".
//
// Regra: nas bases que alimentam a dash ("Neo Crescimento - PV" e "Base Leads 2025-2026"), o dono
// fica VAZIO para (a) negócio/lead da Roberta com data anterior a 01/10/2026 e (b) qualquer negócio
// dela que passou pelo funil Outbound. As linhas NÃO são apagadas: hoje ela já está fora do roster
// (Compilado), então essas linhas já não contam para ninguém — os totais de meses anteriores ficam
// idênticos. Depois disso ela pode entrar no Compilado e sair de VENDEDORES_EXCLUIDOS_.
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var HUNKS = {
  'Utils.gs': [
    { n: 1,
      old: "function parseDataISO_(iso) {",
      nw: [
        "// V22 (08/10/2026): pre-vendedor que veio do Outbound so conta no Inbound a partir da data de",
        "// entrada no time. Antes dela, e em qualquer negocio que passou pelo funil Outbound, o dono e",
        "// gravado VAZIO nas bases (Neo Crescimento e Base Leads). A linha continua na base, entao os",
        "// totais de meses anteriores nao mudam. Roberta: Inbound jan-jun/26, Outbound jun-set/26, volta out/26.",
        "var INICIO_NO_INBOUND_ = { 'Roberta Lobasso': '2026-10-01' };",
        "function donoNoInbound_(nome, data, veioDoOutbound) {",
        "  var ini = INICIO_NO_INBOUND_[nome];",
        "  if (!ini) return nome;",
        "  if (veioDoOutbound) return '';",
        "  var dt = (data instanceof Date) ? data : (data ? new Date(data) : null);",
        "  if (!dt || isNaN(dt.getTime())) return '';",
        "  var p = ini.split('-');",
        "  return dt >= new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) ? nome : '';",
        "}",
        "",
        "function parseDataISO_(iso) {"
      ].join('\n') }
  ],
  'leads.gs': [
    { n: 2,
      old: "      var dono = owners[String(p.hubspot_owner_id)] || '';",
      nw: "      var dono = donoNoInbound_(owners[String(p.hubspot_owner_id)] || '', d_(p.hs_createdate), false); // V22" }
  ],
  'SyncNeo.gs': [
    { n: 3,
      old: "  var props = ['hs_object_id', 'dealname', 'createdate', PROP_SDR, PROP_DATA_REU, PROP_EFETIVA, PROP_DATA_OUT];",
      nw: "  // V22: entrada nas etapas Validação/Prospecção do funil Outbound (905667466) = negócio veio do Outbound\n  var PROPS_OUTBOUND = ['hs_v2_date_entered_1371354117', 'hs_v2_date_entered_1371354118'];\n  var props = ['hs_object_id', 'dealname', 'createdate', PROP_SDR, PROP_DATA_REU, PROP_EFETIVA, PROP_DATA_OUT].concat(PROPS_OUTBOUND);" },
    { n: 4,
      old: "      var nome = owners[String(p[PROP_SDR])] || '';",
      nw: "      var veioDoOutbound = !!(p[PROP_DATA_OUT] || p[PROPS_OUTBOUND[0]] || p[PROPS_OUTBOUND[1]]);\n      var nome = donoNoInbound_(owners[String(p[PROP_SDR])] || '', reuniao, veioDoOutbound); // V22" }
  ],
  'Index.html': [
    { n: 5,
      old: "var VENDEDORES_EXCLUIDOS_ = ['Luiz Fernando Pellegrini', 'Roberta Lobasso'];",
      nw: "// V22: Roberta volta ao Inbound em out/2026. O historico dela antes disso ja chega vazio das bases\n// (donoNoInbound_ em Utils.gs), entao ela nao precisa mais ser escondida aqui.\nvar VENDEDORES_EXCLUIDOS_ = ['Luiz Fernando Pellegrini'];" }
  ]
};
var MARK = {
  'Utils.gs': 'function normalizarVendedor',
  'leads.gs': 'function exportarLeadsParaSheets',
  'SyncNeo.gs': 'function sincronizarNeoCrescimento',
  'Index.html': 'var VENDEDORES_EXCLUIDOS_'
};

var root = path.join(__dirname, '..', 'scripts');
var ok = true, patched = {};
Object.keys(HUNKS).forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
  HUNKS[f].forEach(function (h) {
    var c = src.split(h.old).length - 1;
    if (c !== 1) { console.log('FALHA ' + f + '#' + h.n + ': ' + c); ok = false; return; }
    src = src.replace(h.old, function () { return h.nw; });
  });
  patched[f] = src;
});
if (!ok) process.exit(1);

// Sintaxe: concatena todos os .gs (escopo global compartilhado no Apps Script) e checa com node.
var gs = fs.readdirSync(root).filter(function (f) { return /\.gs$/.test(f); })
  .map(function (f) { return patched[f] || fs.readFileSync(path.join(root, f), 'utf8'); }).join('\n;\n');
var tmp = path.join(require('os').tmpdir(), 'inbound-v22-check.js');
fs.writeFileSync(tmp, gs);
cp.execFileSync(process.execPath, ['--check', tmp]);
console.log('Sintaxe .gs OK');

// Teste da regra com os casos reais
eval(patched['Utils.gs'].match(/var INICIO_NO_INBOUND_[\s\S]*?\n}\n/)[0]);
var casos = [
  ['Roberta Lobasso', new Date(2026, 9, 5), false, 'Roberta Lobasso'],   // inbound de out
  ['Roberta Lobasso', new Date(2026, 9, 10), true, ''],                  // 65354925313 (outbound, passe 10/10)
  ['Roberta Lobasso', new Date(2026, 8, 20), false, ''],                 // setembro
  ['Roberta Lobasso', new Date(2026, 2, 3), false, ''],                  // inbound de mar/26
  ['Roberta Lobasso', '', false, ''],
  ['Eduarda de Barros', new Date(2026, 2, 3), true, 'Eduarda de Barros']
];
casos.forEach(function (c) {
  var r = donoNoInbound_(c[0], c[1], c[2]);
  if (r !== c[3]) { console.log('TESTE FALHOU', c, '->', r); process.exit(1); }
});
console.log('Regra OK em ' + casos.length + ' casos');

if (process.argv.indexOf('--write-mirror') !== -1) {
  Object.keys(patched).forEach(function (f) { fs.writeFileSync(path.join(root, f), patched[f]); });
  console.log('Espelho atualizado.');
}

var h = function (s) { var x = 5381; for (var c of s) x = ((x * 33) ^ c.codePointAt(0)) >>> 0; return x.toString(36); };
var esperado = {};
Object.keys(patched).forEach(function (f) { esperado[f] = patched[f].split('\n').length; });

var out = [
  '// aplicar-v22.js — Roberta no Inbound só a partir de out/2026 (5 hunks em 4 arquivos). Gerado por docs/build-v22.js.',
  '// Cole no console do DevTools com o editor do Apps Script aberto. Aborta sem alterar nada se algum hunk não casar 1x.',
  '// Depois: salvar, rodar sincronizarNeoCrescimento e exportarLeadsParaSheets, e publicar Nova versão.',
  '(function () {',
  '  var HUNKS = ' + JSON.stringify(HUNKS) + ';',
  '  var MARK = ' + JSON.stringify(MARK) + ';',
  "  var models = (window.monaco && monaco.editor.getModels()) || [];",
  "  var alvo = {};",
  "  for (var f in HUNKS) {",
  "    var c = models.filter(function (m) { return m.getValue().indexOf(MARK[f]) !== -1; });",
  "    if (c.length !== 1) return 'ERRO: ' + f + ' — ' + c.length + ' modelos com a marca. Abra os arquivos no editor e rode de novo.';",
  "    alvo[f] = c[0];",
  "  }",
  "  var ruim = [];",
  "  for (var f2 in HUNKS) HUNKS[f2].forEach(function (p) {",
  "    if (alvo[f2].findMatches(p.old, false, false, true, null, false).length !== 1) ruim.push(f2 + '#' + p.n);",
  "  });",
  "  if (ruim.length) return 'ABORTADO, nada alterado: ' + ruim.join(', ');",
  "  var out = [];",
  "  for (var f3 in HUNKS) {",
  "    HUNKS[f3].forEach(function (p) {",
  "      var hit = alvo[f3].findMatches(p.old, false, false, true, null, false)[0];",
  "      alvo[f3].pushEditOperations([], [{ range: hit.range, text: p.nw }], function () { return null; });",
  "    });",
  "    out.push(f3 + ': ' + alvo[f3].getLineCount() + ' linhas');",
  "  }",
  "  return 'OK. ' + out.join(' | ');",
  '})();',
  ''
].join('\n');
fs.writeFileSync(path.join(__dirname, 'aplicar-v22.js'), out);
console.log('docs/aplicar-v22.js gerado. Linhas esperadas: ' + JSON.stringify(esperado));
