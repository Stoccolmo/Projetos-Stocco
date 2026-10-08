// build-v22b.js — ajuste da V22 (08/10/2026, mesma sessão, antes de publicar).
// Uso: node docs/build-v22b.js [--write-mirror]   (rodar da pasta dash-inbound; espelho já com a V22)
//
// Rodrigo: manter o histórico de INBOUND da Roberta (jan–mai/26, para análises), só não pode entrar
// nada de OUTBOUND. Nova regra de donoNoInbound_:
//   - negócio que passou pelo funil Outbound  -> dono vazio (separa 100% dos 100 negócios de outbound dela)
//   - lead criado no período em que ela estava no Outbound (01/06–30/09/2026) -> dono vazio
//     (os 113 leads desse período só foram repassados a ela em out/26 — carteira de férias da Giovanna)
//   - todo o resto (jan–mai, out em diante) -> fica com ela
// Negócios não usam o período (só o marcador de Outbound): o único passe dela em jun/26 é de inbound.
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var OLD_HELPER = [
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
  "}"
].join('\n');
var NEW_HELPER = [
  "// V22 (08/10/2026): pre-vendedor que passou um periodo no Outbound. O historico de INBOUND dele fica",
  "// na dash; o de OUTBOUND nunca entra. Nas bases (Neo Crescimento e Base Leads) o dono e gravado",
  "// VAZIO para (a) negocio que passou pelo funil Outbound e (b) linha com data dentro do periodo em",
  "// que a pessoa estava no Outbound. As linhas nao sao apagadas.",
  "// Roberta: Inbound jan-mai/26, Outbound jun-set/26, volta ao Inbound em out/26. Os leads criados",
  "// em jun-set no nome dela so foram repassados a ela em out/26 (carteira da Giovanna), por isso saem.",
  "var PERIODO_NO_OUTBOUND_ = { 'Roberta Lobasso': ['2026-06-01', '2026-09-30'] };",
  "function donoNoInbound_(nome, data, veioDoOutbound) {",
  "  var per = PERIODO_NO_OUTBOUND_[nome];",
  "  if (!per) return nome;",
  "  if (veioDoOutbound) return '';",
  "  var dt = (data instanceof Date) ? data : (data ? new Date(data) : null);",
  "  if (!dt || isNaN(dt.getTime())) return nome;",
  "  var a = per[0].split('-'), b = per[1].split('-');",
  "  var ini = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]));",
  "  var fim = new Date(Number(b[0]), Number(b[1]) - 1, Number(b[2]) + 1);",
  "  return (dt >= ini && dt < fim) ? '' : nome;",
  "}"
].join('\n');

var HUNKS = {
  'Utils.gs': [{ n: 1, old: OLD_HELPER, nw: NEW_HELPER }],
  'SyncNeo.gs': [{ n: 2,
    old: "      var nome = donoNoInbound_(owners[String(p[PROP_SDR])] || '', reuniao, veioDoOutbound); // V22",
    nw: "      var nome = donoNoInbound_(owners[String(p[PROP_SDR])] || '', null, veioDoOutbound); // V22: negocio sai so pelo marcador de Outbound" }],
  'leads.gs': [
    { n: 4,
      old: "  var linhas = [], after = null, paginas = 0;",
      nw: "  var linhas = [], after = null, paginas = 0;\n  var pendentes = []; // V22: linhas cujo dono atual nao vale para aquela data (ver devolverDonoAnterior_)" },
    { n: 5,
      old: "      var dono = donoNoInbound_(owners[String(p.hubspot_owner_id)] || '', d_(p.hs_createdate), false); // V22",
      nw: "      var donoAtual = owners[String(p.hubspot_owner_id)] || '';\n      var dono = donoNoInbound_(donoAtual, d_(p.hs_createdate), false); // V22\n      if (donoAtual && !dono) pendentes.push(linhas.length);" },
    { n: 6,
      old: "  sincronizarExecutivoDeVendas_(linhas, owners);",
      nw: "  devolverDonoAnterior_(linhas, pendentes, owners); // V22\n  sincronizarExecutivoDeVendas_(linhas, owners);" },
    { n: 7,
      old: "function instalarTriggerLeads() {",
      nw: [
        "// V22 (08/10/2026): lead criado num periodo em que o dono ATUAL nao estava no Inbound (ex.: carteira",
        "// da Giovanna repassada a Roberta em 01/10/26, leads criados jun-set) volta para quem era o dono",
        "// antes do repasse, lido no historico de hubspot_owner_id. Sem dono anterior, fica vazio.",
        "// Assim o funil de jun-set da Giovanna nao perde os leads que ela trabalhou.",
        "function devolverDonoAnterior_(linhas, pendentes, owners) {",
        "  var ok = 0;",
        "  for (var i = 0; i < pendentes.length; i += 50) { // batch/read com historico aceita no maximo 50",
        "    var lote = pendentes.slice(i, i + 50);",
        "    var resp = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/0-136/batch/read', {",
        "      method: 'post', contentType: 'application/json',",
        "      headers: { 'Authorization': 'Bearer ' + LEADS_TOKEN_ },",
        "      payload: JSON.stringify({ inputs: lote.map(function (k) { return { id: String(linhas[k][0]) }; }),",
        "        properties: ['hubspot_owner_id'], propertiesWithHistory: ['hubspot_owner_id'] }),",
        "      muteHttpExceptions: true });",
        "    if (resp.getResponseCode() !== 200) { Logger.log('AVISO devolverDonoAnterior_ HTTP ' + resp.getResponseCode()); continue; }",
        "    var anterior = {};",
        "    (JSON.parse(resp.getContentText()).results || []).forEach(function (r) {",
        "      var h = (r.propertiesWithHistory && r.propertiesWithHistory.hubspot_owner_id) || []; // mais recente primeiro",
        "      var atual = h.length ? h[0].value : '';",
        "      for (var j = 1; j < h.length; j++) {",
        "        if (h[j].value && h[j].value !== atual) { anterior[r.id] = owners[String(h[j].value)] || ''; break; }",
        "      }",
        "    });",
        "    lote.forEach(function (k) { var nome = anterior[String(linhas[k][0])] || ''; linhas[k][12] = nome; linhas[k][13] = nome; if (nome) ok++; });",
        "  }",
        "  Logger.log('devolverDonoAnterior_: ' + ok + ' de ' + pendentes.length + ' leads devolvidos ao dono anterior (resto fica sem dono).');",
        "}",
        "",
        "function instalarTriggerLeads() {"
      ].join('\n') }
  ],
  'Index.html': [{ n: 3,
    old: "// V22: Roberta volta ao Inbound em out/2026. O historico dela antes disso ja chega vazio das bases\n// (donoNoInbound_ em Utils.gs), entao ela nao precisa mais ser escondida aqui.",
    nw: "// V22: Roberta volta ao Inbound em out/2026. O historico de OUTBOUND dela ja chega vazio das bases\n// (donoNoInbound_ em Utils.gs); o de inbound (jan-mai/26) fica visivel." }]
};
var MARK = { 'Utils.gs': 'function normalizarVendedor', 'leads.gs': 'function exportarLeadsParaSheets', 'SyncNeo.gs': 'function sincronizarNeoCrescimento', 'Index.html': 'var VENDEDORES_EXCLUIDOS_' };

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

var gs = fs.readdirSync(root).filter(function (f) { return /\.gs$/.test(f); })
  .map(function (f) { return patched[f] || fs.readFileSync(path.join(root, f), 'utf8'); }).join('\n;\n');
var tmp = path.join(require('os').tmpdir(), 'inbound-v22b-check.js');
fs.writeFileSync(tmp, gs);
cp.execFileSync(process.execPath, ['--check', tmp]);
console.log('Sintaxe .gs OK');

eval(NEW_HELPER);
var R = 'Roberta Lobasso';
var casos = [
  [R, null, true, ''],                          // negocio de outbound (qualquer data), ex. 65354925313
  [R, null, false, R],                          // negocio de inbound (jan-mai, jun, out)
  [R, new Date(2026, 0, 15, 10), false, R],     // lead jan/26
  [R, new Date(2026, 4, 31, 23), false, R],     // lead 31/05 23h
  [R, new Date(2026, 5, 1, 0, 1), false, ''],   // lead 01/06
  [R, new Date(2026, 8, 30, 23, 59), false, ''],// lead 30/09 23:59
  [R, new Date(2026, 9, 1, 0, 1), false, R],    // lead 01/10
  [R, '', false, R],
  ['Eduarda de Barros', new Date(2026, 6, 1), true, 'Eduarda de Barros']
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
var hh = function (s) { var x = 5381; for (var c of s) x = ((x * 33) ^ c.codePointAt(0)) >>> 0; return x.toString(36); };
Object.keys(patched).forEach(function (f) { console.log(f, patched[f].split('\n').length, hh(patched[f])); });
fs.writeFileSync(path.join(__dirname, 'aplicar-v22b.json'), JSON.stringify({ HUNKS: HUNKS, MARK: MARK }));
