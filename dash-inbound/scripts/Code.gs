// =============================================================
// Code.gs — Entry point: CONFIG global, roteamento HTTP, API pública
// =============================================================

// =============================================================
// CONFIG GLOBAL
// =============================================================
const CONFIG = {
  ID_PLANILHA_MAE: '1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY',
  ABA_COMPILADO:       'Compilado de Passes',
  ABA_COHORT:          'Passes da Semana',
  ABA_FUNIL:           'Pré Vendas - Visão Funil',
  ABA_PASSES_MES:      'Passes Do Mês',
  ABA_NEO_CRESCIMENTO: 'Neo Crescimento - PV',  // visão de meta (reuniões agendadas/realizadas)
  ABA_BASE_LEADS:      'Base Leads 2025-2026',  // fonte do funil (LAV/Conectado/Agendado/Ganho)
  ABA_METAS:           'Meta Pré vendedor',     // matriz mês × vendedor com a meta mensal
  ABA_ID_VENDEDOR:     'ID Pré Vendas',
  CACHE_TTL_SEC:   300,    // 5 minutos
  LOCK_TIMEOUT_MS: 30000,  // 30 segundos
  TIMELINE_DIAS:   60,

  // Layout do cohort (aba "Passes da Semana") — fonte ÚNICA dos offsets.
  // Consumido por layoutCohort_(N) em Utils.gs, usado tanto na ESCRITA (Cohort.gs)
  // quanto na LEITURA (Reader.gs lerCohort_). Os offsets de linha do bloco
  // percentual são DERIVADOS de N (nº de vendedores), nunca fixos — assim o
  // bloco percentual desce sozinho conforme a equipe cresce e nunca colide com
  // o bloco absoluto. Ver layoutCohort_ e gotcha do cohort no CLAUDE.md.
  COHORT: {
    COL_VENDEDOR:   2,   // coluna B — nomes raw dos vendedores
    COL_DADOS:      3,   // coluna C — início das matrizes
    ABS_INICIO:     7,   // 1ª linha de vendedor do bloco absoluto (datas=5, números=6)
    GAP_BLANK:      2,   // linhas em branco entre total absoluto e header percentual
    LARGURA_MAX:    50,  // colunas a limpar (C..AX) — teto de cohorts
    MAX_VENDEDORES: 20   // teto p/ o clear cobrir resíduo de execução anterior com N maior
  },

  // HubSpot — usado pra construir link na overlay de cohort
  // URL: https://app.hubspot.com/contacts/<portalId>/record/<objectType>/<recordId>
  TIPO_REUNIAO_DIAS: 180, // janela de retenção (dias) ao ler tipo_de_reuniao da Base Leads 2025-2026

  HUBSPOT_PORTAL_ID:           '23636141',
  HUBSPOT_LEAD_OBJECT_TYPE:    '0-136'   // Lead é objeto custom
};

// =============================================================
// ROTEAMENTO HTTP — para acesso via browser e debug
// =============================================================
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;

  if (action === 'fetch') {
    return jsonResponse_(executeFetch_());
  }

  if (action === 'refresh') {
    const params = {
      cohortStart: e.parameter.cohortStart,
      cohortEnd:   e.parameter.cohortEnd,
      funilStart:  e.parameter.funilStart,
      funilEnd:    e.parameter.funilEnd
    };
    return jsonResponse_(executeRefresh_(params));
  }

  // Sem action → serve o dashboard HTML
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Dashboard Pré-Vendas')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
// MENU OPCIONAL — adiciona "Calcular Cohort" na barra da planilha
// =============================================================
// Mantido como conveniência para o gerente rodar manual fora do dashboard.
// Se você não quiser o menu, basta apagar esta função.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Calcular Cohort')
    .addItem('▶ Executar', 'construirCohortPassesSemana')
    .addToUi();
}

// =============================================================
// FUNÇÕES PÚBLICAS — chamáveis via google.script.run
// =============================================================
function fetchData() {
  return executeFetch_();
}

function refreshData(params) {
  return executeRefresh_(params);
}

// =============================================================
// CACHE FRAGMENTADO — payload pode passar de 100KB (limite por chave do CacheService)
// =============================================================
// Apps Script CacheService limita 100KB por chave. O payload completo (com
// funilLeads + metas detalhadas) frequentemente passa disso. Fragmentamos em
// múltiplas chaves de até ~90KB cada (margem para overhead de string).
const _CHUNK_SIZE = 90 * 1024;
const _CACHE_META_KEY = 'dashboard_payload_meta';
const _CACHE_CHUNK_PREFIX = 'dashboard_payload_chunk_';

function cachePutPayload_(payload) {
  const cache = CacheService.getDocumentCache();
  const json = JSON.stringify(payload);
  const numChunks = Math.ceil(json.length / _CHUNK_SIZE);

  const toStore = {};
  toStore[_CACHE_META_KEY] = JSON.stringify({
    numChunks: numChunks,
    totalBytes: json.length,
    storedAt: new Date().toISOString()
  });
  for (let i = 0; i < numChunks; i++) {
    toStore[_CACHE_CHUNK_PREFIX + i] = json.slice(i * _CHUNK_SIZE, (i + 1) * _CHUNK_SIZE);
  }

  try {
    cache.putAll(toStore, CONFIG.CACHE_TTL_SEC);
    Logger.log('Cache: armazenado payload de ' + json.length + ' bytes em ' + numChunks + ' chunks.');
  } catch (cacheErr) {
    // Se mesmo fragmentado falhar (>100MB), apenas loga e segue. O fetch retorna o payload
    // ao chamador igual — só perde o cache hit nas próximas requisições.
    Logger.log('Cache: falhou ao armazenar payload. ' + cacheErr.message);
  }
}

function cacheGetPayload_() {
  const cache = CacheService.getDocumentCache();
  const metaStr = cache.get(_CACHE_META_KEY);
  if (!metaStr) return null;

  let meta;
  try { meta = JSON.parse(metaStr); } catch (e) { return null; }

  const keys = [];
  for (let i = 0; i < meta.numChunks; i++) {
    keys.push(_CACHE_CHUNK_PREFIX + i);
  }
  const chunks = cache.getAll(keys);

  let json = '';
  for (let i = 0; i < meta.numChunks; i++) {
    const chunk = chunks[_CACHE_CHUNK_PREFIX + i];
    if (chunk == null) {
      // Chunk faltando = cache parcial (provavelmente expirado parcialmente). Invalida.
      return null;
    }
    json += chunk;
  }

  try { return JSON.parse(json); } catch (e) { return null; }
}

function cacheRemovePayload_() {
  const cache = CacheService.getDocumentCache();
  const metaStr = cache.get(_CACHE_META_KEY);
  if (!metaStr) {
    cache.remove(_CACHE_META_KEY);
    return;
  }
  let meta;
  try { meta = JSON.parse(metaStr); } catch (e) {
    cache.remove(_CACHE_META_KEY);
    return;
  }
  const keys = [_CACHE_META_KEY];
  for (let i = 0; i < meta.numChunks; i++) {
    keys.push(_CACHE_CHUNK_PREFIX + i);
  }
  cache.removeAll(keys);
}

// =============================================================
// EXECUTORES PRIVADOS
// =============================================================
function executeFetch_() {
  try {
    const cached = cacheGetPayload_();
    if (cached) {
      cached._fromCache = true;
      return cached;
    }

    const payload = montarPayloadCompleto_();
    cachePutPayload_(payload);  // tolerante a falha
    return payload;
  } catch (err) {
    return errorResponse_(err, 'UNKNOWN');
  }
}

function executeRefresh_(params) {
  // 1. Validação de parâmetros
  const validation = validarParams_(params);
  if (!validation.ok) {
    return errorResponse_(validation.error, 'VALIDATION_ERROR');
  }

  // 2. Lock — previne race condition multi-usuário
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  } catch (err) {
    return errorResponse_(
      'Outra atualização em andamento — tente em 30 segundos.',
      'LOCK_TIMEOUT'
    );
  }

  try {
    // 3. Escreve datas (Cohort B2:C2, Funil A2:B2)
    escreverDatasCohort(params.cohortStart, params.cohortEnd);
    escreverDatasFunil(params.funilStart, params.funilEnd);

    // 4. Força recálculo das fórmulas dependentes da Visão Funil
    SpreadsheetApp.flush();

    // 5. Recalcula cohort (script imperativo)
    construirCohortPassesSemana();
    SpreadsheetApp.flush();

    // 6. Lê tudo
    const payload = montarPayloadCompleto_();

    // 7. Invalida cache (todos os chunks) e re-armazena
    cacheRemovePayload_();
    cachePutPayload_(payload);

    return payload;
  } catch (err) {
    return errorResponse_(err, 'SHEET_ERROR');
  } finally {
    lock.releaseLock();
  }
}

// =============================================================
// MONTADOR DO PAYLOAD
// =============================================================
function montarPayloadCompleto_() {
  const ss = SpreadsheetApp.openById(CONFIG.ID_PLANILHA_MAE);

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    metaInfo:   lerMetaInfo_(ss),
    filters:    lerFiltrosAtuais_(ss),
    compilado:  lerCompilado_(ss),
    cohort:     lerCohort_(ss),
    cohortLeads: agregarLeadsParaCohort_(ss), // Passes Do Mês — granular pra overlay do cohort
    dealsOverlay: agregarDealsParaOverlay_(ss), // Neo Crescimento - PV — granular pra overlay do chart Agendamentos
    funil:      lerFunil_(ss),               // Pré Vendas - Visão Funil (legado, mantido p/ compatibilidade)
    funilLeads: agregarFunilLeads_(ss),      // Base Leads 2025-2026 — fonte da aba Funil vs Meta
    timeline:   agregarTimeline_(ss),        // Passes Do Mês — fonte da aba Evolução
    metas:      agregarMetas_(ss),           // Neo Crescimento - PV — fonte de Visão Geral / Ranking
    metasPorMes: lerMetasMensais_(ss),       // aba Meta Pré vendedor — meta mensal por vendedor
    tipoReuniao: agregarTipoReuniao_(ss),     // Tipo de Reunião — fonte da aba Online vs Presencial
    mrrPorPreVendedor: lerMRRPorPreVendedor_(ss),  // aba MRR por Pré-vendedor — snapshot manual do Redshift
    hubspot:    { portalId: CONFIG.HUBSPOT_PORTAL_ID, leadObjectType: CONFIG.HUBSPOT_LEAD_OBJECT_TYPE },
    _raw: {
      _comment: 'Reservado para extensões futuras. Adicione chaves aqui sem quebrar o contrato existente.'
    }
  };
}

// =============================================================
// HELPERS DE ERRO E VALIDAÇÃO
// =============================================================
function errorResponse_(err, type) {
  const message = (err && err.message) ? err.message : String(err);
  Logger.log('ERRO [' + type + ']: ' + message + '\n' + (err && err.stack ? err.stack : ''));
  return {
    ok: false,
    error: message,
    errorType: type,
    timestamp: new Date().toISOString()
  };
}

function validarParams_(p) {
  if (!p) return { ok: false, error: 'Parâmetros ausentes.' };

  const campos = ['cohortStart', 'cohortEnd', 'funilStart', 'funilEnd'];
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    if (!p[c]) return { ok: false, error: 'Campo obrigatório ausente: ' + c };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p[c])) {
      return {
        ok: false,
        error: 'Formato inválido em ' + c + ': esperado YYYY-MM-DD, recebido "' + p[c] + '".'
      };
    }
  }

  if (p.cohortStart > p.cohortEnd) return { ok: false, error: 'cohortStart > cohortEnd' };
  if (p.funilStart  > p.funilEnd)  return { ok: false, error: 'funilStart > funilEnd' };

  const min = '2024-01-01', max = '2030-12-31';
  if (p.cohortStart < min || p.cohortEnd > max ||
      p.funilStart  < min || p.funilEnd  > max) {
    return {
      ok: false,
      error: 'Datas fora do intervalo aceito (' + min + ' a ' + max + ').'
    };
  }

  return { ok: true };
}
