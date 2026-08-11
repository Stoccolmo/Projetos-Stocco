// =============================================================
// SyncNeo.gs — Reabastece "Neo Crescimento - PV" do HubSpot (Deals 0-3)
// =============================================================

function _tokenHS_() {
  var p = PropertiesService.getScriptProperties().getProperty('HUBSPOT_TOKEN');
  if (p) return p;
  if (typeof LEADS_TOKEN_ !== 'undefined') return LEADS_TOKEN_;
  throw new Error('Sem token HubSpot. Defina a propriedade HUBSPOT_TOKEN.');
}

var PROP_SDR      = 'sdr';                             // "Executivo de Pré-Vendas" (owner)
var PROP_DATA_REU = 'data_da_reuniao__sdr_';           // "(Passe) Data da Reunião"
var PROP_EFETIVA  = 'pre_vendas__reuniao_foi_efetiva'; // "(Passe) Reunião foi efetiva"

var ID_REAL = '1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY';
var ID_PLANILHA_SYNC = '1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY'; // real
var ABA_NEO = 'Neo Crescimento - PV';
var CUTOFF_ISO = '2026-01-01';

function listarPropriedadesDeal() {
  var r = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/properties/0-3',
    { headers: { Authorization: 'Bearer ' + _tokenHS_() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode() + ': ' + r.getContentText());
  var props = JSON.parse(r.getContentText()).results || [];
  var re = /reuni|efetiv|sdr|pré|pre.?vend|executivo/i;
  props.forEach(function (p) {
    if (re.test(p.label || '') || re.test(p.name || ''))
      Logger.log(p.label + '  →  ' + p.name + '   [' + (p.fieldType || p.type) + ']' +
        (p.options && p.options.length ? '  valores: ' + p.options.map(function (o) { return o.value; }).join(' / ') : ''));
  });
}

function sincronizarNeoCrescimento() {
  var ss = SpreadsheetApp.openById(ID_PLANILHA_SYNC);
  var sh = ss.getSheetByName(ABA_NEO);
  if (!sh) throw new Error('Aba não encontrada: ' + ABA_NEO);

  var owners = obterMapaOwners_();
  var cutoffMs = new Date(CUTOFF_ISO + 'T00:00:00Z').getTime();
  var PROP_DATA_OUT = 'hs_v2_date_entered_194331064'; // "Agendado (Pré-vendas (BDR))" — data reunião outbound
  var props = ['hs_object_id', 'dealname', 'createdate', PROP_SDR, PROP_DATA_REU, PROP_EFETIVA, PROP_DATA_OUT];

  var linhas = [], after = null, paginas = 0;
  do {
    var body = {
      filterGroups: [{ filters: [{ propertyName: PROP_DATA_REU, operator: 'GTE', value: String(cutoffMs) }] }],
      sorts: [{ propertyName: PROP_DATA_REU, direction: 'ASCENDING' }],
      properties: props, limit: 100
    };
    if (after) body.after = after;

    var resp = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/0-3/search', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + _tokenHS_() },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200)
      throw new Error('HubSpot HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
    var json = JSON.parse(resp.getContentText());

    (json.results || []).forEach(function (d) {
      var p = d.properties || {};
    var reuniao = _d_(p[PROP_DATA_REU]) || _d_(p[PROP_DATA_OUT]);
      if (!reuniao) return;
      var nome = owners[String(p[PROP_SDR])] || '';
      var linha = new Array(17).fill('');
      linha[0]  = p.hs_object_id || d.id || '';
      linha[2]  = nome;
      linha[3]  = reuniao;
      linha[4]  = _efetiva_(p[PROP_EFETIVA]);
      linha[16] = _d_(p.createdate);
      linhas.push(linha);
    });

    after = (json.paging && json.paging.next) ? json.paging.next.after : null;
    paginas++;
  } while (after && paginas < 200);

  var header = ['ID','','Executivo Pré-Vendas','Data Reunião','Reunião Efetiva','','','','','Estado','','','','','','','Data Criação'];
  sh.getRange(1, 1, 1, 17).setValues([header]);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 17).clearContent();
  if (linhas.length) sh.getRange(2, 1, linhas.length, 17).setValues(linhas);
  Logger.log('Neo Crescimento sincronizada: ' + linhas.length + ' passes (' + paginas + ' páginas).');

  if (ID_PLANILHA_SYNC === ID_REAL) {
    try { sincronizarPassesDoMes(); } catch (e) { Logger.log('Passes Do Mês: ' + e.message); }
  } else {
    Logger.log('(Teste na cópia — Passes Do Mês/Cohort só rodam na planilha real.)');
  }
}

function _d_(v) {
  if (v === null || v === undefined || v === '') return '';
  var dt;
  if (/^\d+$/.test(String(v))) {
    var base = new Date(Number(v));
    dt = new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  } else {
    dt = new Date(v);
    if (!isNaN(dt.getTime())) {
      dt = new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
    }
  }
  return isNaN(dt.getTime()) ? '' : dt;
}
function _efetiva_(v) {
  if (v == null) return '';
  var s = String(v).trim().toLowerCase();
  if (s === 'sim') return 'Sim';
  if (s === 'não' || s === 'nao') return 'Não';
  return ''; // "Vendas", "Default" ou vazio = a validar
}

function instalarTriggerSyncNeo() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarNeoCrescimento') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarNeoCrescimento').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Trigger diário instalado (06h).');
}