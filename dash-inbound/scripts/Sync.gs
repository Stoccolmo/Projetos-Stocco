// =============================================================
// Sync.gs — Reabastece "Passes Do Mês" a partir de "Neo Crescimento - PV"
// =============================================================
// Fonte ATUAL dos passes (mesma do Compilado): reunião do negócio (data_da_reuniao)
// + createdate (data de criação do negócio) — exige o IMPORTRANGE ampliado p/ A:Q.
// Mapeia para o layout de 12 colunas da "Passes Do Mês" → cohort/timeline funcionam sem alteração.

// Rode UMA vez pra reagendar tudo pra 3x/dia.
// Remove os acionadores antigos (os que pertencem a ESTE usuário) e cria:
//   exportarLeadsParaSheets -> 07h, 11h, 17h  (pesado, roda antes)
//   atualizarNeoEPasses     -> 08h, 12h, 18h  (neo + passes, nesta ordem)
// Obs.: atHour(H) roda numa janela de ~1h a partir de H, não no minuto exato.
function instalarTriggers3xDia() {
  var alvos = ['exportarLeadsParaSheets', 'sincronizarNeoCrescimento',
               'sincronizarPassesDoMes', 'atualizarNeoEPasses'];
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (alvos.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });

  [7, 11, 17].forEach(function (h) {
    ScriptApp.newTrigger('exportarLeadsParaSheets').timeBased().everyDays(1).atHour(h).create();
  });
  [8, 12, 18].forEach(function (h) {
    ScriptApp.newTrigger('atualizarNeoEPasses').timeBased().everyDays(1).atHour(h).create();
  });

  var msg = 'Acionadores reinstalados. Removidos: ' + removidos + '. Criados: 6 (leads 07/11/17, neo+passes 08/12/18).';
  Logger.log(msg);
  return msg;
}

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
// =============================================================
// AGENDAMENTO 3x/DIA (08h / 12h / 18h) — instalado 25/08/2026
// =============================================================
// Antes: 1x/dia (leads 05h, neo 06h, passes 06h) — e com um bug de ordem:
// "Passes Do Mês" DERIVA de "Neo Crescimento - PV", mas os dois estavam
// agendados pra mesma hora e o Apps Script não garante ordem dentro da
// janela. Na prática o Passes rodava ~06:37 e o Neo ~06:49, ou seja, o
// Passes vinha sendo montado com o Neo do dia ANTERIOR.
//
// Por isso os dois passam a rodar na MESMA execução, em sequência — é a
// única forma de garantir a ordem. Juntos levam ~35s, folgado.
//
// Já o exportarLeadsParaSheets fica SOZINHO e uma hora antes: ele levou
// 361s (6 min) em 25/08 e vem crescendo (230s no dia anterior). Encostar
// os outros dois nele arriscaria estourar o limite de execução.
function atualizarNeoEPasses() {
  sincronizarNeoCrescimento();
  sincronizarPassesDoMes();
}
