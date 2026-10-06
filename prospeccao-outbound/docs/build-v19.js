// build-v19.js — gera docs/aplicar-v19.js (correção do MRR) a partir dos hunks abaixo.
// Uso: node docs/build-v19.js   (roda da pasta prospeccao-outbound)
// Valida cada "old" como ocorrência única no espelho, aplica numa cópia em memória,
// checa sintaxe do Codigo.gs com node e grava o script de console.
//
// O que a V19 corrige (05/10/2026):
//  1. STAGE_CONTRATO_ASSINADO apontava para 150350641, que é "Concluído". O Contrato Assinado
//     real é 150350640. Venda agora = Contrato Assinado OU Concluído (o relatório do comercial
//     conta "já ativadas ou ainda em ativação").
//  2. fetchGraduatedDeals_ exige tipo_de_reuniao. Quando o executivo perde o negócio original e
//     cria um novo "Adesão" na mão (com o BDR no campo sdr), o novo vem sem tipo_de_reuniao e
//     a venda some. Esses negócios agora vêm numa lista à parte (vendasExtras), que entra SÓ nas
//     tabelas de MRR — não no funil, ranking nem reuniões, para a reunião não contar duas vezes.
//  3. dataFechamento cai para a data de entrada em Contrato Assinado quando closedate está vazio.
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var HUNKS = {
  'Codigo.gs': [
    { n: 1,
      old: "var STAGE_CONTRATO_ASSINADO = '150350641';",
      nw: "// 150350640 = Contrato Assinado; 150350641 = Concluído. Até a V18 esta constante apontava para o Concluído com o nome trocado.\nvar STAGE_CONTRATO_ASSINADO = '150350640';\nvar STAGE_CONCLUIDO = '150350641';" },
    { n: 2,
      old: "'createdate', 'closedate', 'hubspot_owner_id'].concat(STAGE_ENTERED_PROPS);",
      nw: "'createdate', 'closedate', 'hubspot_owner_id', 'hs_v2_date_entered_150350640'].concat(STAGE_ENTERED_PROPS);" },
    { n: 3,
      old: "function fetchOwnersMap_() {",
      nw: [
        "// Vendas de BDR que nao passaram pelo funil com tipo_de_reuniao: tipicamente o executivo marca o",
        "// negocio original como perdido e cria um novo \"Adesao\" na mao, com o BDR no campo sdr (V19).",
        "// Entram so nas tabelas de MRR (DATA.vendasExtras), nunca no funil/ranking/reunioes.",
        "function fetchVendasSemReuniao_() {",
        "var owners = Object.keys(BDR_OWNER_IDS);",
        "return hubspotSearchAll_([{ filters: [",
        "{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_VENDAS },",
        "{ propertyName: 'sdr', operator: 'IN', values: owners },",
        "{ propertyName: 'dealstage', operator: 'IN', values: [STAGE_CONTRATO_ASSINADO, STAGE_CONCLUIDO] },",
        "{ propertyName: 'tipo_de_reuniao', operator: 'NOT_HAS_PROPERTY' }",
        "] }], DEAL_PROPS);",
        "}",
        "",
        "function isVendaFechada_(p) {",
        "return p.pipeline === PIPELINE_VENDAS && (p.dealstage === STAGE_CONTRATO_ASSINADO || p.dealstage === STAGE_CONCLUIDO);",
        "}",
        "",
        "function dataFechamento_(p) {",
        "return p.closedate || p['hs_v2_date_entered_' + STAGE_CONTRATO_ASSINADO] || null;",
        "}",
        "",
        "function fetchOwnersMap_() {"
      ].join('\n') },
    { n: 4,
      old: "var graduated = fetchGraduatedDeals_();\nvar all = outbound.concat(graduated);",
      nw: "var graduated = fetchGraduatedDeals_();\nvar all = outbound.concat(graduated);\nvar vendasSemReuniao = fetchVendasSemReuniao_();" },
    { n: 5,
      old: "isVenda: p.pipeline === PIPELINE_VENDAS && stage === STAGE_CONTRATO_ASSINADO,",
      nw: "isVenda: isVendaFechada_(p)," },
    { n: 6,
      old: "dataFechamento: p.closedate || null,",
      nw: "dataFechamento: dataFechamento_(p)," },
    { n: 7,
      old: "return { geradoEm: new Date().toISOString(), metas: metas, deals: rows };",
      nw: [
        "var vendasExtras = [];",
        "vendasSemReuniao.forEach(function (deal) {",
        "var p = deal.properties;",
        "var bdrNome = BDR_OWNER_IDS[p.sdr];",
        "if (!bdrNome || !isVendaFechada_(p)) return;",
        "vendasExtras.push({",
        "id: deal.id,",
        "nome: p.dealname,",
        "bdr: bdrNome,",
        "origem: p.parceia_com_associacao__associacao ? p.parceia_com_associacao__associacao.split(' - ')[0] : 'Nenhuma',",
        "rota: p.rota || null,",
        "estado: p.estado || null,",
        "isVenda: true,",
        "somenteVenda: true,",
        "valor: parseFloat(p.amount || 0),",
        "dataReuniao: p.data_da_reuniao || null,",
        "dataCriacao: p.createdate || null,",
        "dataFechamento: dataFechamento_(p),",
        "execVendas: p.hubspot_owner_id ? (owners[p.hubspot_owner_id] || null) : null",
        "});",
        "});",
        "",
        "return { geradoEm: new Date().toISOString(), metas: metas, deals: rows, vendasExtras: vendasExtras };"
      ].join('\n') }
  ],
  'Index.html': [
    { n: 8,
      old: "h += renderVendasTable('MRR &mdash; por mês de agendamento'+infoIcon('Segmenta as vendas fechadas pelo mês em que a REUNIÃO foi agendada, não importa quando o contrato foi assinado depois. Útil para medir a qualidade das reuniões marcadas em cada mês.'), 'Vendas geradas por reuniões agendadas em cada mês, mesmo que o fechamento tenha ocorrido depois', deals, buckets, bdrs, 'dataReuniao');\nh += renderVendasTable('MRR &mdash; por mês de venda (fechamento)'+infoIcon('Segmenta as vendas fechadas pelo mês em que o CONTRATO foi assinado, não importa quando a reunião original aconteceu. Útil para medir o faturamento real que entrou em cada mês.'), 'Vendas fechadas em cada mês, independente de quando a reunião foi agendada', deals, buckets, bdrs, 'dataFechamento');",
      nw: "// V19: vendas de BDR criadas direto no pipeline de Vendas (sem tipo de reunião) entram só aqui.\nvar dealsVenda = deals.concat(filterDeals(DATA.vendasExtras || []));\nh += renderVendasTable('MRR &mdash; por mês de agendamento'+infoIcon('Segmenta as vendas (Contrato Assinado ou Concluído) pelo mês em que a REUNIÃO foi agendada, não importa quando o contrato foi assinado depois. Útil para medir a qualidade das reuniões marcadas em cada mês. Vendas registradas num negócio novo, criado direto pelo executivo sem data de reunião, não aparecem aqui — só na tabela por mês de venda.'), 'Vendas geradas por reuniões agendadas em cada mês, mesmo que o fechamento tenha ocorrido depois', dealsVenda, buckets, bdrs, 'dataReuniao');\nh += renderVendasTable('MRR &mdash; por mês de venda (fechamento)'+infoIcon('Segmenta as vendas pelo mês em que o CONTRATO foi assinado, não importa quando a reunião original aconteceu. Conta negócios em Contrato Assinado ou Concluído no pipeline de Vendas com o BDR no campo SDR, inclusive os que o executivo criou direto (sem tipo de reunião). Sem data de fechamento, usa a data de entrada em Contrato Assinado.'), 'Vendas fechadas em cada mês, independente de quando a reunião foi agendada', dealsVenda, buckets, bdrs, 'dataFechamento');" }
  ]
};
var MARK = { 'Codigo.gs': 'function buildDashboardData', 'Index.html': 'function viewCohort' };

var root = path.join(__dirname, '..', 'scripts');
var ok = true;
var patched = {};
Object.keys(HUNKS).forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
  HUNKS[f].forEach(function (h) {
    var c = src.split(h.old).length - 1;
    if (c !== 1) { console.log('FALHA ' + f + '#' + h.n + ': ' + c + ' ocorrencias'); ok = false; return; }
    src = src.replace(h.old, function () { return h.nw; });
  });
  patched[f] = src;
});
if (!ok) process.exit(1);

var tmp = path.join(require('os').tmpdir(), 'codigo-v19-check.js');
fs.writeFileSync(tmp, patched['Codigo.gs']);
cp.execFileSync(process.execPath, ['--check', tmp]);
console.log('Sintaxe Codigo.gs OK');

if (process.argv.indexOf('--write-mirror') !== -1) {
  Object.keys(patched).forEach(function (f) { fs.writeFileSync(path.join(root, f), patched[f]); });
  console.log('Espelho atualizado.');
}

var out = [
  '// aplicar-v19.js — Versão 19 do painel Outbound: correção do MRR (' + HUNKS['Codigo.gs'].length + ' hunks no Codigo.gs, ' + HUNKS['Index.html'].length + ' no Index.html).',
  '// Cole no console do DevTools (F12) com o editor do Apps Script aberto e os DOIS arquivos (Codigo.gs e Index.html) já abertos uma vez.',
  '// Não salva sozinho: só edita os modelos do Monaco. Se algum hunk não casar exatamente 1x, aborta sem alterar nada.',
  '// Depois: salvar pelo ícone da UI, rodar refreshCache (muda o cache) e Implantar → Gerenciar implantações → Nova versão.',
  '(function () {',
  '  var HUNKS = ' + JSON.stringify(HUNKS) + ';',
  '  var MARK = ' + JSON.stringify(MARK) + ';',
  "  var models = (window.monaco && monaco.editor.getModels()) || [];",
  "  var alvo = {};",
  "  for (var f in HUNKS) {",
  "    var c = models.filter(function (m) { return m.getValue().indexOf(MARK[f]) !== -1; });",
  "    if (c.length !== 1) return 'ERRO: ' + f + ' — achei ' + c.length + ' modelos com \"' + MARK[f] + '\". Abra ' + f + ' na lista de arquivos e rode de novo.';",
  "    alvo[f] = c[0];",
  "  }",
  "  var ruim = [];",
  "  for (var f2 in HUNKS) HUNKS[f2].forEach(function (p) {",
  "    if (alvo[f2].findMatches(p.old, false, false, true, null, false).length !== 1) ruim.push(f2 + '#' + p.n);",
  "  });",
  "  if (ruim.length) return 'ABORTADO, nada foi alterado. Hunks que nao casaram exatamente 1x: ' + ruim.join(', ');",
  "  var out = [];",
  "  for (var f3 in HUNKS) {",
  "    HUNKS[f3].forEach(function (p) {",
  "      var m = alvo[f3];",
  "      var hit = m.findMatches(p.old, false, false, true, null, false)[0];",
  "      m.pushEditOperations([], [{ range: hit.range, text: p.nw }], function () { return null; });",
  "    });",
  "    out.push(f3 + ': ' + HUNKS[f3].length + ' hunks, ' + alvo[f3].getLineCount() + ' linhas');",
  "  }",
  "  return 'OK. ' + out.join(' | ') + '. Agora salve pelo icone da UI, rode refreshCache e implante como Nova versao.';",
  '})();',
  ''
].join('\n');
fs.writeFileSync(path.join(__dirname, 'aplicar-v19.js'), out);
console.log('docs/aplicar-v19.js gerado (' + out.length + ' chars).');
