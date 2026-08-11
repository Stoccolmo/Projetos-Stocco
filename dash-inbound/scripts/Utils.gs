// =============================================================
// Utils.gs — Helpers compartilhados
// =============================================================
// Funções públicas (sem _) só existem aqui porque normalizarVendedor
// é usada por leitores. As demais (parseDataISO_, formatarDataISO_,
// sanitizarNumero_) são privadas por convenção.

const ALIASES_VENDEDOR = {
  // Variações de "Maria Victoria / Vitória Miranda" (nome aparece diferente em
  // Compilado, Passes da Semana e Passes Do Mês — todas mapeiam para o nome
  // canônico do Compilado: "Vitória Miranda").
  'maria victoria rocha de andrade': 'Vitória Miranda',
  'maria victoria rocha de alencar': 'Vitória Miranda',
  'maria victoria rocha':            'Vitória Miranda',
  'maria victoria':                  'Vitória Miranda',
  'maria vitoria':                   'Vitória Miranda',
  'maria vitória':                   'Vitória Miranda',
  'vitoria miranda':                 'Vitória Miranda',
  'vitória miranda':                 'Vitória Miranda'
};

function normalizarVendedor(nome) {
  if (nome === null || nome === undefined || nome === '') return null;
  // chave canônica: trim + collapse de espaços múltiplos + lowercase
  const chave = String(nome)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return ALIASES_VENDEDOR[chave] || String(nome).trim();
}

function parseDataISO_(iso) {
  // "2026-04-30" → Date local (00:00 hora local do script)
  if (!iso) return null;
  const partes = String(iso).split('-');
  if (partes.length !== 3) throw new Error('Formato inválido (esperado YYYY-MM-DD): ' + iso);
  const ano = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const dia = parseInt(partes[2], 10);
  if (isNaN(ano) || isNaN(mes) || isNaN(dia)) {
    throw new Error('Formato inválido (esperado YYYY-MM-DD): ' + iso);
  }
  return new Date(ano, mes - 1, dia);
}

function formatarDataISO_(d) {
  // Date → "YYYY-MM-DD" no timezone do script (BRT/America-Sao_Paulo)
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;

  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
}

// =============================================================
// layoutCohort_(n) — esquema de linhas do cohort derivado de N vendedores
// =============================================================
// Função PURA (não toca planilha). Centraliza toda a aritmética de offsets
// da aba "Passes da Semana" para que ESCRITA (Cohort.gs) e LEITURA (Reader.gs
// lerCohort_) usem exatamente as mesmas posições — impossível dessincronizar.
//
// Para N=6 (estado histórico) devolve os offsets originais:
//   absDatas=5, absNumeros=6, absInicio=7, absFim=12, totalAbs=13,
//   percDatas=16, percNumeros=17, percInicio=18, percFim=23, totalPerc=24.
// Conforme N cresce, o bloco percentual desce automaticamente.
function layoutCohort_(n) {
  const C = CONFIG.COHORT;
  if (!n || n < 1) {
    throw new Error('layoutCohort_: número de vendedores inválido (N=' + n + ').');
  }
  const absInicio = C.ABS_INICIO;
  const totalAbs  = absInicio + n;                 // logo abaixo da última linha de vendedor
  const percDatas = totalAbs + C.GAP_BLANK + 1;    // pula o gap em branco + entra no header
  const percNumeros = percDatas + 1;
  const percInicio  = percNumeros + 1;
  const totalPerc   = percInicio + n;
  return {
    colVend:     C.COL_VENDEDOR,
    colDados:    C.COL_DADOS,
    larguraMax:  C.LARGURA_MAX,
    absDatas:    absInicio - 2,
    absNumeros:  absInicio - 1,
    absInicio:   absInicio,
    absFim:      absInicio + n - 1,
    totalAbs:    totalAbs,
    percDatas:   percDatas,
    percNumeros: percNumeros,
    percInicio:  percInicio,
    percFim:     percInicio + n - 1,
    totalPerc:   totalPerc
  };
}

// limparAreaCohort_(sheetCohort) — limpa as áreas de output do cohort.
// Clear ÚNICO e generoso: da linha 3 (nunca toca H1/H2 em 1-2) até o total
// percentual do TETO MAX_VENDEDORES. Cobre resíduo de execução anterior com N
// maior (se a equipe encolher entre execuções). Compartilhado entre a escrita
// (construirCohortPassesSemana) e o estado-vazio.
function limparAreaCohort_(sheetCohort) {
  const C = CONFIG.COHORT;
  const layoutTeto = layoutCohort_(C.MAX_VENDEDORES);
  const primeiraLinha = 3;  // linhas 1-2 = H1/H2 (fórmulas auxiliares) — NUNCA limpar
  const numLinhas = layoutTeto.totalPerc - primeiraLinha + 1;
  sheetCohort.getRange(primeiraLinha, C.COL_DADOS, numLinhas, C.LARGURA_MAX)
    .clearContent().clearFormat();
}

function sanitizarNumero_(val) {
  // Regras (§6.2):
  //  - null / undefined / "" → null
  //  - erro de fórmula (#DIV/0!, #REF!, #N/A, …) → null
  //  - string numérica → number
  //  - number → number
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'string' && val.indexOf('#') === 0) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}
