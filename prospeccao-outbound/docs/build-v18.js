// build-v18.js — Versão 18 do painel Outbound: racional de atingimento igual ao Inbound.
//   (a) card "Atingimento pro rata" → "Atingimento Projeção" (85% de TODO o A validar, inclusive futuro)
//   (b) coluna "Ating. Projeção" no Ranking, entre Ating. Pro Rata e Ating. Meta
// Gera a partir do espelho (que precisa estar byte a byte igual à produção — medido em 07/09/2026)
// e emite docs/aplicar-v18.js para colar no console do editor do Apps Script.
//
// Uso: node docs/build-v18.js            → valida âncoras, escreve scripts/Index.html e docs/aplicar-v18.js
//      node docs/build-v18.js --check    → só valida
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'scripts');
const CHECK = process.argv.includes('--check');
const J = (l) => l.join('\n');
const H = [];

H.push({ f: 'Index.html', n: 1, why: 'computeGeral: realizadoProjecao = validados + 85% de TODO o A validar (inclusive futuro)',
  old: J([
    `var aValidarPassado = inPeriod.filter(function(d){ return d.reuniaoEfetiva !== 'Sim' && d.reuniaoEfetiva !== 'Não' && d.dataReuniao && d.dataReuniao <= todayIso; }).length;`,
    `var realizadoEstimado = validados + 0.85*aValidarPassado;`
  ]),
  nw: J([
    `var aValidarPassado = inPeriod.filter(function(d){ return d.reuniaoEfetiva !== 'Sim' && d.reuniaoEfetiva !== 'Não' && d.dataReuniao && d.dataReuniao <= todayIso; }).length;`,
    `var realizadoEstimado = validados + 0.85*aValidarPassado;`,
    `// Atingimento Projeção (mesma régua da col K do Compilado do Inbound): credita 85% de TODO o`,
    `// backlog A validar do período, inclusive reuniões ainda futuras — não só as já realizadas.`,
    `var realizadoProjecao = validados + 0.85*aValidar;`
  ]) });

H.push({ f: 'Index.html', n: 2, why: 'computeGeral: expõe realizadoProjecao',
  old: `diasDecorridos:diasDecorridos, diasRestantes:diasRestantes, aValidarPassado:aValidarPassado, realizadoEstimado:realizadoEstimado,`,
  nw:  `diasDecorridos:diasDecorridos, diasRestantes:diasRestantes, aValidarPassado:aValidarPassado, realizadoEstimado:realizadoEstimado, realizadoProjecao:realizadoProjecao,` });

H.push({ f: 'Index.html', n: 3, why: 'Card Atingimento (oficial): tooltip passa a referenciar o card Atingimento Projeção',
  old: `Os dois cards ao lado fazem as leituras ajustadas: Atingimento pro rata corrige o atraso de validação e compara com a meta proporcional aos dias úteis decorridos; Atingimento projetado estima como o período vai fechar no ritmo atual.`,
  nw:  `Os dois cards ao lado fazem as leituras ajustadas: Atingimento Projeção credita 85% do que ainda está A validar (inclusive reuniões futuras) e compara com a meta pro rata dos dias úteis decorridos; Atingimento projetado estima como o período vai fechar no ritmo atual. Este card é o número de cobrança; os outros dois são acompanhamento.` });

H.push({ f: 'Index.html', n: 4, why: 'Card "Atingimento pro rata" vira "Atingimento Projeção": 85% de todo o A validar ÷ meta pro rata',
  old: `h += '<div class="ph-card"><div class="lbl">Atingimento pro rata'+infoIcon('Mesmo cálculo do Atingimento até hoje, mas corrigindo o atraso de validação. FÓRMULA: (Validados + 0,85 × A Validar que JÁ ACONTECERAM) ÷ Meta pro-rata. Hoje são '+g.validados+' validadas + 85% de '+g.aValidarPassado+' reuniões já realizadas e pendentes de julgamento = '+g.realizadoEstimado.toFixed(1)+'. IMPORTANTE: só entram as reuniões com data ATÉ HOJE. As que estão agendadas para os próximos dias ficam de fora, porque ainda não foram realizadas — não faria sentido creditar trabalho que ainda não aconteceu no desempenho até agora. Os 85% são uma taxa de efetividade esperada, fixa no sistema (a taxa real histórica do time está em torno de 90%).')+'</div><div class="val ph-num">'+pct(g.realizadoEstimado,g.metaProRata)+'%</div><div class="sub2">'+g.realizadoEstimado.toFixed(1)+' est. / pro rata '+Math.round(g.metaProRata)+'</div></div>';`,
  nw:  `h += '<div class="ph-card"><div class="lbl">Atingimento Projeção'+infoIcon('Leitura de ACOMPANHAMENTO, mesma régua da dash Inbound. FÓRMULA: (Validados + 0,85 × A validar) ÷ Meta pro rata. Hoje: '+g.validados+' validadas + 85% de '+g.aValidar+' reuniões A validar = '+g.realizadoProjecao.toFixed(1)+', contra meta pro rata de '+Math.round(g.metaProRata)+' (meta × dias úteis decorridos ÷ dias úteis do período). IMPORTANTE: o A validar inclui as reuniões ainda FUTURAS dentro do período, não só as que já aconteceram. Por isso é uma leitura otimista: pode passar de 100% com poucas validadas, e cai no dia seguinte se as reuniões marcadas não acontecerem ou forem julgadas como Não válidas. Os 85% são a taxa de efetividade esperada, fixa no sistema (a real do time gira em torno de 90%). Use este número para ver quem tende a bater e quem precisa de ajuda ainda no mês. Para cobrança, use o card Atingimento, que só conta validadas.')+'</div><div class="val ph-num">'+pct(g.realizadoProjecao,g.metaProRata)+'%</div><div class="sub2">'+g.realizadoProjecao.toFixed(1)+' est. / pro rata '+Math.round(g.metaProRata)+'</div></div>';` });

H.push({ f: 'Index.html', n: 5, why: 'Ranking: calcula A validar (sem Perdido/Reagendamento) e Ating. Projeção por vendedor',
  old: J([
    `var realizado = iv.filter(function(d){ return d.reuniaoEfetiva==='Sim'; }).length;`,
    `var meta = metasMapR[n]||0;`,
    `var proRata = Math.round(meta * (diasDecorridos/diasTotais));`,
    `return { nome:n, meta:meta, proRata:proRata, realizado:realizado, atingProRata:pct(realizado,proRata), atingMeta:pct(realizado,meta) };`
  ]),
  nw: J([
    `var realizado = iv.filter(function(d){ return d.reuniaoEfetiva==='Sim'; }).length;`,
    `// A validar = sem julgamento (nem Sim nem Não), excluindo Perdido/Reagendamento — mesmo universo do`,
    `// card "Atingimento Projeção" da Visão Geral. Inclui reuniões ainda futuras dentro do período.`,
    `var aValidar = iv.filter(function(d){ return d.reuniaoEfetiva!=='Sim' && d.reuniaoEfetiva!=='Não' && !d.isPerdido && !d.isReagendamento; }).length;`,
    `var meta = metasMapR[n]||0;`,
    `var proRata = Math.round(meta * (diasDecorridos/diasTotais));`,
    `var realizadoProjecao = realizado + 0.85*aValidar;`,
    `return { nome:n, meta:meta, proRata:proRata, realizado:realizado, aValidar:aValidar, realizadoProjecao:realizadoProjecao, atingProRata:pct(realizado,proRata), atingProjecao:pct(realizadoProjecao,proRata), atingMeta:pct(realizado,meta) };`
  ]) });

H.push({ f: 'Index.html', n: 6, why: 'Ranking: legenda da tabela cita a coluna nova',
  old: `&middot; Ating. Pro Rata = no ritmo esperado até hoje &middot; Ating. Meta = do total do período</div>';`,
  nw:  `&middot; Ating. Pro Rata = no ritmo esperado até hoje &middot; Ating. Projeção = (realizado + 85% do a validar) vs pro rata &middot; Ating. Meta = do total do período</div>';` });

H.push({ f: 'Index.html', n: 7, why: 'Ranking: cabeçalho "Ating. Projeção" com tooltip, entre Ating. Pro Rata e Ating. Meta',
  old: `<th class="num">Ating. Meta'+infoIcon('Realizado dividido pela Meta total do período, sem ajuste por dias decorridos.')+'</th></tr></thead><tbody>';`,
  nw:  `<th class="num">Ating. Projeção'+infoIcon('(Realizado + 0,85 × A validar) ÷ Pro rata. Mesma conta do card Atingimento Projeção da Visão Geral e da coluna homônima da dash Inbound. Credita 85% das reuniões do período ainda sem julgamento — inclusive as marcadas para os próximos dias — como se fossem validar. Leitura de acompanhamento: mostra quem tende a bater a meta se o que está agendado acontecer. Compare com Ating. Pro Rata (só validadas) para ver quanto depende de reunião ainda não realizada. Passe o mouse no percentual para ver os números.')+'</th><th class="num">Ating. Meta'+infoIcon('Realizado dividido pela Meta total do período, sem ajuste por dias decorridos. É o número de cobrança.')+'</th></tr></thead><tbody>';` });

H.push({ f: 'Index.html', n: 8, why: 'Ranking: acumulador do A validar para a linha Total',
  old: `var totMeta=0, totProRata=0, totRealizado=0;`,
  nw:  `var totMeta=0, totProRata=0, totRealizado=0, totAValidar=0;` });

H.push({ f: 'Index.html', n: 9, why: 'Ranking: soma A validar por linha',
  old: `totMeta+=r.meta; totProRata+=r.proRata; totRealizado+=r.realizado;`,
  nw:  `totMeta+=r.meta; totProRata+=r.proRata; totRealizado+=r.realizado; totAValidar+=r.aValidar;` });

H.push({ f: 'Index.html', n: 10, why: 'Ranking: célula Ating. Projeção por vendedor (title com a conta)',
  old: J([
    `h += '<td class="num"><span class="ph-badge '+badgeClass(r.atingProRata)+'">'+r.atingProRata+'%</span></td>';`,
    `h += '<td class="num"><span class="ph-badge '+badgeClass(r.atingMeta)+'">'+r.atingMeta+'%</span></td></tr>';`
  ]),
  nw: J([
    `h += '<td class="num"><span class="ph-badge '+badgeClass(r.atingProRata)+'">'+r.atingProRata+'%</span></td>';`,
    `h += '<td class="num" title="'+r.realizado+' validadas + 85% de '+r.aValidar+' a validar = '+r.realizadoProjecao.toFixed(1)+' / pro rata '+r.proRata+'"><span class="ph-badge '+badgeClass(r.atingProjecao)+'">'+r.atingProjecao+'%</span></td>';`,
    `h += '<td class="num"><span class="ph-badge '+badgeClass(r.atingMeta)+'">'+r.atingMeta+'%</span></td></tr>';`
  ]) });

H.push({ f: 'Index.html', n: 11, why: 'Ranking: célula Ating. Projeção na linha Total',
  old: J([
    `h += '<td class="num"><span class="ph-badge '+badgeClass(pct(totRealizado,totProRata))+'">'+pct(totRealizado,totProRata)+'%</span></td>';`,
    `h += '<td class="num"><span class="ph-badge '+badgeClass(pct(totRealizado,totMeta))+'">'+pct(totRealizado,totMeta)+'%</span></td></tr>';`
  ]),
  nw: J([
    `var totProjecao = totRealizado + 0.85*totAValidar;`,
    `h += '<td class="num"><span class="ph-badge '+badgeClass(pct(totRealizado,totProRata))+'">'+pct(totRealizado,totProRata)+'%</span></td>';`,
    `h += '<td class="num" title="'+totRealizado+' validadas + 85% de '+totAValidar+' a validar = '+totProjecao.toFixed(1)+' / pro rata '+totProRata+'"><span class="ph-badge '+badgeClass(pct(totProjecao,totProRata))+'">'+pct(totProjecao,totProRata)+'%</span></td>';`,
    `h += '<td class="num"><span class="ph-badge '+badgeClass(pct(totRealizado,totMeta))+'">'+pct(totRealizado,totMeta)+'%</span></td></tr>';`
  ]) });

// ── aplicação + validação ────────────────────────────────────────────────────
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

// sanidade: cada <script> tem de compilar
const idx = files['Index.html'];
const blocks = [...idx.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// o bloco 1 tem o template do Apps Script (`var DATA = <?!= data ?>;`); troca por literal só para compilar
blocks.forEach((b, i) => { try { new Function(b.replace(/<\?!=\s*data\s*\?>/g, '{}')); } catch (e) { console.error(`✗ bloco <script> #${i + 1} não compila: ${e.message}`); erro = true; } });
if (erro) process.exit(1);
console.log(`scripts ok: ${blocks.length} blocos | "Ating. Projeção": ${idx.split('Ating. Projeção').length - 1} | realizadoProjecao: ${idx.split('realizadoProjecao').length - 1} | linhas: ${idx.split('\n').length}`);

if (!CHECK) {
  for (const f of Object.keys(files)) fs.writeFileSync(path.join(ROOT, f), files[f]);
  const MARK = { 'Index.html': 'function viewRanking' };
  const porArq = {};
  for (const h of H) (porArq[h.f] = porArq[h.f] || []).push({ n: h.n, old: h.old, nw: h.nw });
  const applier = `// aplicar-v18.js — Versão 18 do painel Outbound (${H.length} hunks, só Index.html).
// Cole no console do DevTools (F12) com o editor do Apps Script aberto e o Index.html já aberto uma vez.
// Não salva sozinho: só edita o modelo do Monaco. Depois: salvar pelo ícone da UI e
// Implantar → Gerenciar implantações → editar a implantação existente → Nova versão.
(function () {
  var HUNKS = ${JSON.stringify(porArq)};
  var MARK = ${JSON.stringify(MARK)};
  var models = (window.monaco && monaco.editor.getModels()) || [];
  var out = [];
  var alvo = {};
  for (var f in HUNKS) {
    var c = models.filter(function (m) { return m.getValue().indexOf(MARK[f]) !== -1; });
    if (c.length !== 1) return 'ERRO: ' + f + ' — achei ' + c.length + ' modelos com "' + MARK[f] + '". Clique em Index.html na lista de arquivos e rode de novo.';
    alvo[f] = c[0];
  }
  var ruim = [];
  for (var f2 in HUNKS) HUNKS[f2].forEach(function (p) {
    if (alvo[f2].findMatches(p.old, false, false, true, null, false).length !== 1) ruim.push(f2 + '#' + p.n);
  });
  if (ruim.length) return 'ABORTADO, nada foi alterado. Hunks que nao casaram exatamente 1x: ' + ruim.join(', ');
  for (var f3 in HUNKS) HUNKS[f3].forEach(function (p) {
    var m = alvo[f3];
    var hit = m.findMatches(p.old, false, false, true, null, false)[0];
    m.pushEditOperations([], [{ range: hit.range, text: p.nw }], function () { return null; });
  });
  for (var f4 in HUNKS) out.push(f4 + ': ' + HUNKS[f4].length + ' hunks, ' + alvo[f4].getLineCount() + ' linhas');
  return 'OK. ' + out.join(' | ') + '. Agora salve pelo icone da UI e implante como Nova versao.';
})();
`;
  fs.writeFileSync(path.join(__dirname, 'aplicar-v18.js'), applier);
  console.log('Escritos: scripts/Index.html e docs/aplicar-v18.js');
}
