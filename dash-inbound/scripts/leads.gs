// =============================================================
// Leads.gs — Importa LEADS do HubSpot (0-136) -> "Base Leads 2025-2026"
// Resolve o funil travado (a Base Leads era um dump estático parado em 08/06).
// =============================================================
var LEADS_TOKEN_ = 'REDACTED_VER_SCRIPT_PROPERTIES_NO_APPS_SCRIPT'; // token real só existe no projeto Apps Script de produção — nunca comitar aqui (mesmo do "Automação", rotacionar depois — ver decisoes/DECISOES-inbound.md)

function exportarLeadsParaSheets() {
  var ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  var sh = ss.getSheetByName(CONFIG.ABA_BASE_LEADS);
  if (!sh) throw new Error('Aba não encontrada: ' + CONFIG.ABA_BASE_LEADS);
  sh.getRange(1, 18).setValue('Executivo de Vendas'); // col R - dono do Deal associado (id_do_lead_associado)

  var owners = obterMapaOwners_();
  var props = ['hs_lead_name','data_de_entrada_em_prospeccao','data_de_entrada_em_conectado',
    'data_de_entrada_em_reuniao_agendada','data_de_entrada_em_ganho','origem_macro','origem_micro',
    'formulario___campanha','estado','rota_do_lead','hs_createdate','hubspot_owner_id',
    'perfil_agrupado','tipo_de_estabelecimento','tipo_de_reuniao'];
  var baseUrl = 'https://api.hubapi.com/crm/v3/objects/0-136?limit=100&archived=false&properties=' + props.join(',');

  // 1) Busca TODOS os leads (acumula antes de escrever — se falhar no meio, a aba não é apagada)
  var linhas = [], after = null, paginas = 0;
  do {
    var resp = UrlFetchApp.fetch(baseUrl + (after ? '&after=' + after : ''),
      { headers: { 'Authorization': 'Bearer ' + LEADS_TOKEN_ }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200)
      throw new Error('HubSpot HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
    var json = JSON.parse(resp.getContentText());
    (json.results || []).forEach(function (l) {
      var p = l.properties || {};
      var dono = owners[String(p.hubspot_owner_id)] || '';
      linhas.push([ l.id || '', p.hs_lead_name || '',
        d_(p.data_de_entrada_em_prospeccao), d_(p.data_de_entrada_em_conectado),
        d_(p.data_de_entrada_em_reuniao_agendada), d_(p.data_de_entrada_em_ganho),
        p.origem_macro || '', p.origem_micro || '', p.formulario___campanha || '',
        p.estado || '', p.rota_do_lead || '', d_(p.hs_createdate),
        dono, dono, p.perfil_agrupado || '', p.tipo_de_estabelecimento || '', p.tipo_de_reuniao || '', '' ]);
    });
    after = (json.paging && json.paging.next) ? json.paging.next.after : null;
    paginas++;
  } while (after && paginas < 1500);
  sincronizarExecutivoDeVendas_(linhas, owners);

  // 2) Só agora reescreve (preserva o cabeçalho da linha 1)
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 18).clearContent();
  if (linhas.length) sh.getRange(2, 1, linhas.length, 18).setValues(linhas);
  Logger.log('Base Leads atualizada: ' + linhas.length + ' leads (' + paginas + ' páginas).');
}

function obterMapaOwners_() {
  var map = {};
  try {  // HubSpot Owners API (id -> "Nome Sobrenome")
    var after = null;
    do {
      var r = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/owners?limit=100' + (after ? '&after=' + after : ''),
        { headers: { 'Authorization': 'Bearer ' + LEADS_TOKEN_ }, muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) { Logger.log('AVISO owners HTTP ' + r.getResponseCode()); break; }
      var j = JSON.parse(r.getContentText());
      (j.results || []).forEach(function (o) {
        map[String(o.id)] = ((o.firstName || '') + ' ' + (o.lastName || '')).trim() || (o.email || '');
      });
      after = (j.paging && j.paging.next) ? j.paging.next.after : null;
    } while (after);
  } catch (e) { Logger.log('AVISO owners: ' + e.message); }
  try {  // Reforço: aba "ID Pré Vendas" que o dashboard já usa
    var sh = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE).getSheetByName(CONFIG.ABA_ID_VENDEDOR);
    if (sh) { var v = sh.getDataRange().getValues();
      for (var i = 1; i < v.length; i++) { var id = String(v[i][0] || '').trim(), nm = String(v[i][1] || '').trim();
        if (id && nm && !map[id]) map[id] = nm; } }
  } catch (e) { Logger.log('AVISO ID Pré Vendas: ' + e.message); }
  return map;
}
// =============================================================
// EXECUTIVO DE VENDAS -- Deal.id_do_lead_associado aponta pro Lead que originou
// o negocio; Deal.hubspot_owner_id e o dono (executivo de vendas) desse negocio.
// So resolvemos pra leads com tipo_de_reuniao preenchido (coluna Q, indice 16),
// que sao as reunioes realmente realizadas. Batch de 100 ids por chamada (limite
// do operador IN), paginando dentro do batch por seguranca.
// =============================================================
function sincronizarExecutivoDeVendas_(linhas, owners) {
  var idsComReuniao = [];
  for (var i = 0; i < linhas.length; i++) {
    if (linhas[i][16]) { // col Q -- tipo_de_reuniao preenchido
      var leadId = String(linhas[i][0] || '').trim();
      if (leadId) idsComReuniao.push(leadId);
    }
  }
  if (!idsComReuniao.length) return;

  owners = owners || obterMapaOwners_();
  var execPorLead = {};
  var BATCH = 100;

  for (var b = 0; b < idsComReuniao.length; b += BATCH) {
    var batch = idsComReuniao.slice(b, b + BATCH);
    var after = null, paginasBatch = 0;
    do {
      var body = {
        filterGroups: [{ filters: [{ propertyName: 'id_do_lead_associado', operator: 'IN', values: batch }] }],
        properties: ['hubspot_owner_id', 'id_do_lead_associado'],
        limit: 100
      };
      if (after) body.after = after;
      var resp;
      try {
        resp = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'Authorization': 'Bearer ' + LEADS_TOKEN_ },
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
      } catch (e) { Logger.log('AVISO deals search: ' + e.message); break; }
      if (resp.getResponseCode() !== 200) {
        Logger.log('AVISO deals search HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
        break;
      }
      var json = JSON.parse(resp.getContentText());
      (json.results || []).forEach(function (d) {
        var p = d.properties || {};
        var leadId = String(p.id_do_lead_associado || '').trim();
        if (!leadId) return;
        var nome = owners[String(p.hubspot_owner_id)] || '';
        if (nome) execPorLead[leadId] = nome;
      });
      after = (json.paging && json.paging.next) ? json.paging.next.after : null;
      paginasBatch++;
    } while (after && paginasBatch < 10);
  }

  for (var i = 0; i < linhas.length; i++) {
    var leadId = String(linhas[i][0] || '').trim();
    linhas[i][17] = execPorLead[leadId] || '';
  }
}


function d_(v) {
  if (!v) return '';
  var dt = /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(v);
  return isNaN(dt.getTime()) ? '' : dt;
}

function instalarTriggerLeads() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'exportarLeadsParaSheets') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('exportarLeadsParaSheets').timeBased().everyDays(1).atHour(5).create();
  Logger.log('Trigger diário de leads instalado (05h).');
}