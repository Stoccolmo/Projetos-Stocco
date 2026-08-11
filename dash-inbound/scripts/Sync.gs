// =============================================================
// Sync.gs — Reabastece "Passes Do Mês" a partir de "Neo Crescimento - PV"
// =============================================================
// Fonte ATUAL dos passes (mesma do Compilado): reunião do negócio (data_da_reuniao)
// + createdate (data de criação do negócio) — exige o IMPORTRANGE ampliado p/ A:Q.
// Mapeia para o layout de 12 colunas da "Passes Do Mês" → cohort/timeline funcionam sem alteração.

function sincronizarPassesDoMes() {
  const ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);
  const origem  = ss.getSheetByName(CONFIG.ABA_NEO_CRESCIMENTO); // 'Neo Crescimento - PV'
  const destino = ss.getSheetByName(CONFIG.ABA_PASSES_MES);      // 'Passes Do Mês'
  if (!origem)  throw new Error('Aba não encontrada: ' + CONFIG.ABA_NEO_CRESCIMENTO);
  if (!destino) throw new Error('Aba não encontrada: ' + CONFIG.ABA_PASSES_MES);

  const ult = origem.getLastRow();
  if (ult < 2) { Logger.log('Neo Crescimento vazia.'); return; }

  // Lê A:Q (17 colunas). Índices 0-based:
  // A hs_object_id=0 | C Executivo=2 | D data_da_reuniao=3 | J estado=9 | K rota=10 | Q createdate=16
  const dados = origem.getRange(2, 1, ult - 1, 17).getValues();

  const toDate = (v) => {
    if (v instanceof Date) return v;
    if (v == null || v === '') return '';
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d;
  };

  const linhas = [];
  for (let i = 0; i < dados.length; i++) {
    const r = dados[i];
    const reuniao = toDate(r[3]);   // data_da_reuniao
    if (!reuniao) continue;         // só passes com reunião
    const criacao = toDate(r[16]);  // createdate
    linhas.push([
      r[9]  || '',   // A  Estado
      '',            // B  Origem Macro      (n/d no Neo)
      '',            // C  Origem Micro      (n/d no Neo)
      reuniao,       // D  Data de Entrada em Reunião Agendada
      '',            // E  Perfil do Lead    (n/d no Neo)
      '',            // F  Perfil Agrupado   (n/d no Neo)
      '',            // G  Formulário - Campanha (n/d no Neo)
      r[2]  || '',   // H  Proprietário do Lead (Executivo de Pré-Vendas)
      criacao,       // I  Data de Criação   (createdate)
      r[0]  || '',   // J  ID do Registro    (hs_object_id)
      reuniao,       // K  Data Parametrizada - Reunião
      criacao        // L  Data Parametrizada - Criação
    ]);
  }

  const last = destino.getLastRow();
  if (last > 1) destino.getRange(2, 1, last - 1, 12).clearContent();
  if (linhas.length) destino.getRange(2, 1, linhas.length, 12).setValues(linhas);
  Logger.log('Passes Do Mês sincronizada (Neo Crescimento): ' + linhas.length + ' passes.');

  // Recalcula o cohort com os dados frescos:
  try { construirCohortPassesSemana(); } catch (e) { Logger.log('Cohort não recalculado: ' + e.message); }
}

// Rode UMA vez para agendar a sincronização diária (06h):
function instalarTriggerSyncPassesDoMes() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarPassesDoMes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarPassesDoMes').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Trigger diário instalado.');
}