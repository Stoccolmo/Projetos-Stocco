// ===== Painel Outbound - Pre-Vendas =====
var PIPELINE_OUTBOUND = '905667466';
var STAGE_OUTBOUND = { VALIDACAO: '1371354117', PROSPECCAO: '1371354118', CONECTADO: '1371354119', QUALIFICACAO: '1371354120', AGENDADO: '1371354121', REAGENDAMENTO: '1371354122', PERDIDO: '1371354124' };
var PIPELINE_VENDAS = '79388826';
var STAGE_CONTRATO_ASSINADO = '150350641';
var BDR_OWNER_IDS = { '90529435': 'Caio Louback', '89320493': 'João Pedro Modé', '87959862': 'Pedro Porto', '82534211': 'Roberta Lobasso' };
var STAGE_ENTERED_PROPS = ['hs_v2_date_entered_' + STAGE_OUTBOUND.VALIDACAO, 'hs_v2_date_entered_' + STAGE_OUTBOUND.PROSPECCAO, 'hs_v2_date_entered_' + STAGE_OUTBOUND.CONECTADO, 'hs_v2_date_entered_' + STAGE_OUTBOUND.QUALIFICACAO, 'hs_v2_date_entered_' + STAGE_OUTBOUND.AGENDADO, 'hs_v2_date_entered_' + STAGE_OUTBOUND.REAGENDAMENTO];
var DEAL_PROPS = ['dealname', 'dealstage', 'pipeline', 'sdr', 'amount', 'pre_vendas__reuniao_foi_efetiva', 'data_da_reuniao', 'pre_vendas__motivo_da_reuniao_nao_efetiva', 'tipo_de_reuniao', 'rota', 'estado', 'parceia_com_associacao__associacao', 'motivo_de_lost', 'createdate', 'closedate', 'hubspot_owner_id'].concat(STAGE_ENTERED_PROPS);
var CACHE_FILE_NAME = 'painel_outbound_cache.json';

function getToken_() {
var t = PropertiesService.getScriptProperties().getProperty('HUBSPOT_API_TOKEN');
if (!t) throw new Error('HUBSPOT_API_TOKEN não configurado.');
return t;
}

function hubspotFetchWithRetry_(url, options) {
for (var attempt = 0; attempt < 5; attempt++) {
var resp = UrlFetchApp.fetch(url, options);
var code = resp.getResponseCode();
if (code === 200) return resp;
var body = resp.getContentText();
if (code === 429 || body.indexOf('RATE_LIMIT') !== -1) {
Utilities.sleep(1000 * (attempt + 1));
continue;
}
throw new Error('HubSpot error (' + code + '): ' + body);
}
throw new Error('HubSpot rate limit: excedeu tentativas.');
}

function hubspotSearchAll_(filterGroups, properties) {
var token = getToken_();
var url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
var results = [];
var after = undefined;
do {
var payload = { filterGroups: filterGroups, properties: properties, limit: 100 };
if (after) payload.after = after;
var resp = hubspotFetchWithRetry_(url, {
method: 'post',
contentType: 'application/json',
headers: { Authorization: 'Bearer ' + token },
payload: JSON.stringify(payload),
muteHttpExceptions: true
});
var body = JSON.parse(resp.getContentText());
results = results.concat(body.results || []);
after = body.paging && body.paging.next ? body.paging.next.after : undefined;
if (after) Utilities.sleep(350);
} while (after);
return results;
}

function fetchOutboundDeals_() {
return hubspotSearchAll_([{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_OUTBOUND }] }], DEAL_PROPS);
}

function fetchGraduatedDeals_() {
var owners = Object.keys(BDR_OWNER_IDS);
return hubspotSearchAll_([{ filters: [
{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_VENDAS },
{ propertyName: 'sdr', operator: 'IN', values: owners },
{ propertyName: 'tipo_de_reuniao', operator: 'HAS_PROPERTY' }
] }], DEAL_PROPS);
}

function fetchOwnersMap_() {
var token = getToken_();
var map = {};
var after = undefined;
do {
var url = 'https://api.hubapi.com/crm/v3/owners?limit=100' + (after ? '&after=' + after : '');
var resp = hubspotFetchWithRetry_(url, {
method: 'get',
headers: { Authorization: 'Bearer ' + token },
muteHttpExceptions: true
});
var body = JSON.parse(resp.getContentText());
(body.results || []).forEach(function (o) {
map[o.id] = (o.firstName || '') + (o.lastName ? ' ' + o.lastName : '');
});
after = body.paging && body.paging.next ? body.paging.next.after : undefined;
} while (after);
return map;
}

function fetchEfetivaDatesMap_(dealIds) {
var token = getToken_();
var map = {};
var url = 'https://api.hubapi.com/crm/v3/objects/deals/batch/read';
for (var i = 0; i < dealIds.length; i += 50) {
var batch = dealIds.slice(i, i + 50);
var resp = hubspotFetchWithRetry_(url, {
method: 'post',
contentType: 'application/json',
headers: { Authorization: 'Bearer ' + token },
payload: JSON.stringify({
propertiesWithHistory: ['pre_vendas__reuniao_foi_efetiva'],
inputs: batch.map(function (id) { return { id: id }; })
}),
muteHttpExceptions: true
});
var body = JSON.parse(resp.getContentText());
(body.results || []).forEach(function (r) {
var hist = r.propertiesWithHistory && r.propertiesWithHistory.pre_vendas__reuniao_foi_efetiva;
if (hist && hist.length && hist[0].value === 'Sim') map[r.id] = hist[0].timestamp;
});
if (i + 50 < dealIds.length) Utilities.sleep(350);
}
return map;
}

function getMetas_() {
var raw = PropertiesService.getScriptProperties().getProperty('METAS_JSON');
if (!raw) return {};
try { return JSON.parse(raw); } catch (e) { return {}; }
}

function buildDashboardData() {
var outbound = fetchOutboundDeals_();
var graduated = fetchGraduatedDeals_();
var all = outbound.concat(graduated);
var metas = getMetas_();
var owners = fetchOwnersMap_();
var efetivaIds = all.filter(function (d) { return d.properties.pre_vendas__reuniao_foi_efetiva === 'Sim'; }).map(function (d) { return d.id; });
var efetivaDates = fetchEfetivaDatesMap_(efetivaIds);
var order = [STAGE_OUTBOUND.VALIDACAO, STAGE_OUTBOUND.PROSPECCAO, STAGE_OUTBOUND.CONECTADO, STAGE_OUTBOUND.QUALIFICACAO, STAGE_OUTBOUND.AGENDADO];

var rows = [];
all.forEach(function (deal) {
var p = deal.properties;
var bdrNome = BDR_OWNER_IDS[p.sdr];
if (!bdrNome) return;
var isOutboundPipeline = p.pipeline === PIPELINE_OUTBOUND;
var stage = p.dealstage;
var reachedIdx = -1;
if (!isOutboundPipeline) {
reachedIdx = order.length - 1;
} else {
reachedIdx = order.indexOf(stage);
if (stage === STAGE_OUTBOUND.REAGENDAMENTO) reachedIdx = order.indexOf(STAGE_OUTBOUND.AGENDADO);
}
var stageDates = [
p['hs_v2_date_entered_' + STAGE_OUTBOUND.VALIDACAO] || null,
p['hs_v2_date_entered_' + STAGE_OUTBOUND.PROSPECCAO] || null,
p['hs_v2_date_entered_' + STAGE_OUTBOUND.CONECTADO] || null,
p['hs_v2_date_entered_' + STAGE_OUTBOUND.QUALIFICACAO] || null,
p['hs_v2_date_entered_' + STAGE_OUTBOUND.AGENDADO] || p['hs_v2_date_entered_' + STAGE_OUTBOUND.REAGENDAMENTO] || null
];
rows.push({
id: deal.id,
nome: p.dealname,
bdr: bdrNome,
dataReuniao: p.data_da_reuniao || null,
reuniaoEfetiva: p.pre_vendas__reuniao_foi_efetiva || null,
dataEfetiva: efetivaDates[deal.id] || null,
tipoReuniao: p.tipo_de_reuniao || null,
origem: p.parceia_com_associacao__associacao ? p.parceia_com_associacao__associacao.split(' - ')[0] : 'Nenhuma',
rota: p.rota || null,
estado: p.estado || null,
reachedIdx: reachedIdx,
stageDates: stageDates,
isPerdido: isOutboundPipeline && stage === STAGE_OUTBOUND.PERDIDO,
motivoLost: p.motivo_de_lost || null,
isVenda: p.pipeline === PIPELINE_VENDAS && stage === STAGE_CONTRATO_ASSINADO,
valor: parseFloat(p.amount || 0),
dataCriacao: p.createdate || null,
dataFechamento: p.closedate || null,
execVendas: (p.pipeline === PIPELINE_VENDAS && p.hubspot_owner_id) ? (owners[p.hubspot_owner_id] || null) : null
});
});

return { geradoEm: new Date().toISOString(), metas: metas, deals: rows };
}

function getOrCreateCacheFile_() {
var props = PropertiesService.getScriptProperties();
var fileId = props.getProperty('CACHE_FILE_ID');
if (fileId) {
try { return DriveApp.getFileById(fileId); } catch (e) {}
}
var file = DriveApp.createFile(CACHE_FILE_NAME, '{}', MimeType.PLAIN_TEXT);
props.setProperty('CACHE_FILE_ID', file.getId());
return file;
}

function refreshCache() {
var data = buildDashboardData();
var file = getOrCreateCacheFile_();
file.setContent(JSON.stringify(data));
Logger.log('Cache atualizado: ' + data.deals.length + ' deals em ' + data.geradoEm);
return data;
}

function refreshNow() {
var lock = LockService.getScriptLock();
if (!lock.tryLock(500)) {
return { busy: true };
}
try {
var data = refreshCache();
return { busy: false, data: data };
} finally {
lock.releaseLock();
}
}

function readCache_() {
var props = PropertiesService.getScriptProperties();
var fileId = props.getProperty('CACHE_FILE_ID');
if (!fileId) return null;
try {
var file = DriveApp.getFileById(fileId);
var data = JSON.parse(file.getBlob().getDataAsString());
if (!data || !data.deals || !data.deals.length) return null;
return data;
} catch (e) {
return null;
}
}

function installTriggers() {
ScriptApp.getProjectTriggers().forEach(function (t) {
if (t.getHandlerFunction() === 'refreshCache') ScriptApp.deleteTrigger(t);
});
[8, 12, 18, 20].forEach(function (hour) {
ScriptApp.newTrigger('refreshCache').timeBased().atHour(hour).nearMinute(0).everyDays(1).create();
});
Logger.log('Gatilhos instalados: 08:00, 12:00, 18:00 e 20:00 (America/Sao_Paulo).');
}

function doGet(e) {
var data = readCache_();
if (!data) data = buildDashboardData();
var tmpl = HtmlService.createTemplateFromFile('Index');
tmpl.data = JSON.stringify(data);
return tmpl.evaluate().setTitle('Painel Outbound - Pré-Vendas').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function testFetch() {
var data = buildDashboardData();
Logger.log(JSON.stringify(data.deals.length) + ' deals');
Logger.log(JSON.stringify(data, null, 2).substring(0, 3000));
}

