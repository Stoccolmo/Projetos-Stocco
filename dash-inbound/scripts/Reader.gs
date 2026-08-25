// =============================================================
// Reader.gs — Leitura da planilha mãe → JSON do payload
// =============================================================
// Não escreve nada. Lê células e devolve estruturas conforme §6 do BUILD.md.

// =============================================================
// META INFO (metadados de período da Compilado)
// =============================================================
function lerMetaInfo_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_COMPILADO);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_COMPILADO);

  const startMonth = sheet.getRange('Z2').getValue();
  const endMonth   = sheet.getRange('AA2').getValue();
  const today      = sheet.getRange('AB2').getValue();

  return {
    startMonth: formatarDataISO_(startMonth),
    endMonth:   formatarDataISO_(endMonth),
    today:      formatarDataISO_(today),
    diasUteisRestantes: null  // Reservado: implementar com aba Feriados se necessário
  };
}

function lerFiltrosAtuais_(ss) {
  const cohort = ss.getSheetByName(CONFIG.ABA_COHORT);
  const funil  = ss.getSheetByName(CONFIG.ABA_FUNIL);
  if (!cohort) throw new Error('Aba não encontrada: ' + CONFIG.ABA_COHORT);
  if (!funil)  throw new Error('Aba não encontrada: ' + CONFIG.ABA_FUNIL);

  return {
    cohortStart: formatarDataISO_(cohort.getRange('B2').getValue()),
    cohortEnd:   formatarDataISO_(cohort.getRange('C2').getValue()),
    funilStart:  formatarDataISO_(funil.getRange('A2').getValue()),
    funilEnd:    formatarDataISO_(funil.getRange('B2').getValue())
  };
}

// =============================================================
// COMPILADO DE PASSES (linhas 2-7 vendedores, linha 8 Total)
// =============================================================
function lerCompilado_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_COMPILADO);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_COMPILADO);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('lerCompilado_: aba "' + CONFIG.ABA_COMPILADO + '" sem linhas de dados.');
    return { rows: [], total: null, projecaoUnica: null, taxaConversaoPasseValido: null };
  }

  // Cols A-N (14 colunas): Pré Vendedor + Meta Time + ... + Passes/Dia Para Bater Meta.
  // Lê DINAMICAMENTE até a última linha — não assume 6 vendedores.
  const dados = sheet.getRange(2, 1, ultimaLinha - 1, 14).getValues();

  const mapearLinha = function(row) {
    return {
      vendedor:                            row[0],
      metaTime:                            sanitizarNumero_(row[1]),
      metaProRata:                         sanitizarNumero_(row[2]),
      realizado:                           sanitizarNumero_(row[3]),
      atingimentoProRata:                  sanitizarNumero_(row[4]),
      aValidar:                            sanitizarNumero_(row[5]),
      seTodosForemValidos:                 sanitizarNumero_(row[6]),
      deltaVsMetaRealizado:                sanitizarNumero_(row[7]),
      deltaVsMetaProjecao:                 sanitizarNumero_(row[8]),
      atingimentoProjecao:                 sanitizarNumero_(row[9]),
      atingimentoProjecaoPctVsMetaProRata: sanitizarNumero_(row[10]),
      atingimentoProjetadoVsMetaMes:       sanitizarNumero_(row[11]),
      atingimentoProjetadoPctVsMetaMes:    sanitizarNumero_(row[12]),
      passesDiaParaBaterMeta:              sanitizarNumero_(row[13])
    };
  };

  // Detecta a linha "Total" pelo RÓTULO na coluna A (case-insensitive, trim).
  // Vendedores = todas as linhas acima do Total. Assim, adicionar/remover vendedor
  // é só inserir/remover linha na planilha — o código não precisa mudar.
  let idxTotal = -1;
  for (let i = 0; i < dados.length; i++) {
    const rotulo = String(dados[i][0] == null ? '' : dados[i][0]).trim().toLowerCase();
    if (rotulo === 'total') { idxTotal = i; break; }
  }

  // Fallback: se não houver rótulo "Total", para na 1ª linha com coluna A vazia.
  if (idxTotal === -1) {
    for (let i = 0; i < dados.length; i++) {
      const v = dados[i][0];
      if (v == null || String(v).trim() === '') { idxTotal = i; break; }
    }
    if (idxTotal === -1) idxTotal = dados.length;  // sem Total e sem vazia: tudo é vendedor
    Logger.log('lerCompilado_: linha "Total" não encontrada pelo rótulo na coluna A; ' +
      'usando fallback (1ª linha vazia em idx ' + idxTotal + '). Confira o rótulo "Total".');
  }

  const rows = dados.slice(0, idxTotal)
    .filter(function(r) { return r[0] != null && String(r[0]).trim() !== ''; })
    .map(mapearLinha);
  const total = (idxTotal >= 0 && idxTotal < dados.length) ? mapearLinha(dados[idxTotal]) : null;

  if (rows.length === 0) Logger.log('lerCompilado_: nenhum vendedor detectado acima da linha Total.');
  if (!total) Logger.log('lerCompilado_: linha Total não disponível — KPIs de total podem ficar vazios.');

  return {
    rows: rows,
    total: total,
    projecaoUnica:            sanitizarNumero_(sheet.getRange('T2').getValue()),
    taxaConversaoPasseValido: sanitizarNumero_(sheet.getRange('U2').getValue())
  };
}

// =============================================================
// COHORT (Passes da Semana) — matriz absoluta + percentual
// =============================================================
function lerCohort_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_COHORT);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_COHORT);

  const inicio = sheet.getRange('B2').getValue();
  const fim    = sheet.getRange('C2').getValue();

  if (!inicio || !fim) {
    return cohortVazio_(formatarDataISO_(inicio), formatarDataISO_(fim));
  }

  // N e layout vêm da MESMA fonte que Cohort.gs (Compilado) — leitura e escrita
  // compartilham layoutCohort_(N), então nunca dessincronizam.
  const N = lerCompilado_(ss).rows.length;
  if (N < 1) {
    return cohortVazio_(formatarDataISO_(inicio), formatarDataISO_(fim));
  }
  const layout = layoutCohort_(N);

  const MS_DIA = 24 * 60 * 60 * 1000;
  const intervaloDias = Math.round(
    (new Date(fim).getTime() - new Date(inicio).getTime()) / MS_DIA
  ) + 1;

  // Detecta o número de cohorts (varredura na linha de números a partir da col de dados)
  const linhaNums = sheet.getRange(layout.absNumeros, layout.colDados, 1, layout.larguraMax).getValues()[0];
  let numCohorts = 0;
  for (let i = 0; i < linhaNums.length; i++) {
    if (linhaNums[i] === '' || linhaNums[i] === null || linhaNums[i] === 'Total') break;
    numCohorts++;
  }

  if (numCohorts === 0) {
    return cohortVazio_(formatarDataISO_(inicio), formatarDataISO_(fim));
  }

  // Cabeçalhos (linha de datas / números) + linha de total absoluto
  const datasHeaders  = sheet.getRange(layout.absDatas,  layout.colDados, 1, numCohorts).getValues()[0];
  const numeroHeaders = sheet.getRange(layout.absNumeros, layout.colDados, 1, numCohorts).getValues()[0];
  const totalLinha    = sheet.getRange(layout.totalAbs,  layout.colDados, 1, numCohorts + 1).getValues()[0];

  const headers = numeroHeaders.map(function(num, i) {
    return {
      numero: String(num),
      data: String(datasHeaders[i] || ''),
      totalColuna: sanitizarNumero_(totalLinha[i])
    };
  });

  // Vendedores no bloco absoluto (N linhas) — normalizar Maria Victoria → Vitória Miranda
  const vendedores = sheet.getRange(layout.absInicio, layout.colVend, N, 1).getValues().map(function(r) {
    return normalizarVendedor(r[0]);
  });

  // Matriz absoluta (N linhas) com a coluna Total ao final
  const matrizAbs = sheet.getRange(layout.absInicio, layout.colDados, N, numCohorts + 1).getValues();
  const absRows = matrizAbs.map(function(row, i) {
    return {
      vendedor: vendedores[i],
      valores: row.slice(0, numCohorts).map(sanitizarNumero_),
      total:   sanitizarNumero_(row[numCohorts])
    };
  });

  // Matriz percentual (N linhas) + linha de total percentual
  const matrizPerc     = sheet.getRange(layout.percInicio, layout.colDados, N, numCohorts + 1).getValues();
  const linhaPercTotal = sheet.getRange(layout.totalPerc, layout.colDados, 1, numCohorts + 1).getValues()[0];

  const percRows = matrizPerc.map(function(row, i) {
    return {
      vendedor: vendedores[i],
      valores: row.slice(0, numCohorts).map(sanitizarNumero_),
      total:   sanitizarNumero_(row[numCohorts])
    };
  });

  return {
    dateRange: {
      start: formatarDataISO_(inicio),
      end:   formatarDataISO_(fim)
    },
    intervaloDias: intervaloDias,
    vendedores: vendedores,
    headers: headers,
    absoluto: {
      rows: absRows,
      totalRow: {
        valores: totalLinha.slice(0, numCohorts).map(sanitizarNumero_),
        total:   sanitizarNumero_(totalLinha[numCohorts])
      }
    },
    percentual: {
      rows: percRows,
      totalRow: {
        valores: linhaPercTotal.slice(0, numCohorts).map(sanitizarNumero_),
        total:   sanitizarNumero_(linhaPercTotal[numCohorts])
      }
    }
  };
}

function cohortVazio_(start, end) {
  return {
    dateRange: { start: start, end: end },
    intervaloDias: 0,
    vendedores: [],
    headers: [],
    absoluto:   { rows: [], totalRow: { valores: [], total: 0 } },
    percentual: { rows: [], totalRow: { valores: [], total: 0 } }
  };
}

// =============================================================
// FUNIL (Pré Vendas - Visão Funil) — Visão Safra + Visão Mês
// =============================================================
function lerFunil_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_FUNIL);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_FUNIL);

  // Vendedores na linha 7 (header da Visão Safra), colunas C-H
  const vendedoresRaw = sheet.getRange(7, 3, 1, 6).getValues()[0];
  const vendedores = vendedoresRaw.map(normalizarVendedor);

  // Bloco Visão Safra: volumes 8-11, conversões 15-17
  const volsSafra      = lerBlocoVolumes_(sheet, 8);
  const totalsSafra    = lerBlocoTotais_(sheet, 8);
  const convSafra      = lerBlocoConversoes_(sheet, 15);
  const convTotalSafra = lerBlocoConversoesTotal_(sheet, 15);

  // Bloco Visão Mês: volumes 21-24, conversões 28-30
  const volsMes      = lerBlocoVolumes_(sheet, 21);
  const totalsMes    = lerBlocoTotais_(sheet, 21);
  const convMes      = lerBlocoConversoes_(sheet, 28);
  const convTotalMes = lerBlocoConversoesTotal_(sheet, 28);

  return {
    dateRange: {
      start: formatarDataISO_(sheet.getRange('A2').getValue()),
      end:   formatarDataISO_(sheet.getRange('B2').getValue())
    },
    vendedores: vendedores,
    safra: {
      volumes:         volsSafra,
      totais:          totalsSafra,
      conversoes:      convSafra,
      conversoesTotal: convTotalSafra
    },
    mes: {
      volumes:         volsMes,
      totais:          totalsMes,
      conversoes:      convMes,
      conversoesTotal: convTotalMes
    }
  };
}

function lerBlocoVolumes_(sheet, linhaInicial) {
  // 4 linhas: LAV, Conectado, Agendado, Ganho — cols C-H (6 vendedores)
  const dados = sheet.getRange(linhaInicial, 3, 4, 6).getValues();
  return {
    lav:       dados[0].map(sanitizarNumero_),
    conectado: dados[1].map(sanitizarNumero_),
    agendado:  dados[2].map(sanitizarNumero_),
    ganho:     dados[3].map(sanitizarNumero_)
  };
}

function lerBlocoTotais_(sheet, linhaInicial) {
  // Coluna I = totais das mesmas 4 linhas
  const dados = sheet.getRange(linhaInicial, 9, 4, 1).getValues();
  return {
    lav:       sanitizarNumero_(dados[0][0]),
    conectado: sanitizarNumero_(dados[1][0]),
    agendado:  sanitizarNumero_(dados[2][0]),
    ganho:     sanitizarNumero_(dados[3][0])
  };
}

function lerBlocoConversoes_(sheet, linhaInicial) {
  // 3 linhas: Lav>Conectado, Conectado>Passe, Passe>Ganho — cols C-H
  const dados = sheet.getRange(linhaInicial, 3, 3, 6).getValues();
  return {
    lavConectado:   dados[0].map(sanitizarNumero_),
    conectadoPasse: dados[1].map(sanitizarNumero_),
    passeGanho:     dados[2].map(sanitizarNumero_)
  };
}

function lerBlocoConversoesTotal_(sheet, linhaInicial) {
  const dados = sheet.getRange(linhaInicial, 9, 3, 1).getValues();
  return {
    lavConectado:   sanitizarNumero_(dados[0][0]),
    conectadoPasse: sanitizarNumero_(dados[1][0]),
    passeGanho:     sanitizarNumero_(dados[2][0])
  };
}

// =============================================================
// METAS MENSAIS (aba "Meta Pré vendedor")
// =============================================================
// Matriz mês × vendedor com a meta mensal. Substitui Compilado.col B como
// fonte de meta no chart Atingimento e no cálculo do % do Líder.
//
// Schema:
//   A1: header "Pré Vendedor"
//   B1, C1, D1, ...: datas do primeiro dia de cada mês (01/01/2026, 01/02/2026, ...)
//   A2-A7: vendedores
//   B2-...: valores de meta
//
// Convenções de valor:
//   - "-"     = vendedor ainda não estava na equipe → null
//   - vazio   = meta ainda não definida → null
//   - número  = meta válida
//
// Retorna:
//   { meses: ["2026-01", "2026-02", ...], metas: { "2026-01": { vendedor: N }, ... } }
function lerMetasMensais_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_METAS);
  if (!sheet) {
    Logger.log('lerMetasMensais_: aba "' + CONFIG.ABA_METAS + '" não encontrada — retornando estrutura vazia.');
    return { meses: [], metas: {} };
  }

  const ultimaCol = sheet.getLastColumn();
  const ultimaLinha = sheet.getLastRow();
  if (ultimaCol < 2 || ultimaLinha < 2) return { meses: [], metas: {} };

  const dados = sheet.getRange(1, 1, ultimaLinha, ultimaCol).getValues();

  // Linha 1 (idx 0): cabeçalho com datas. Cols 1..ultimaCol-1 são meses.
  const meses = [];
  for (let c = 1; c < ultimaCol; c++) {
    const cellValue = dados[0][c];
    if (cellValue === null || cellValue === undefined || cellValue === '') {
      meses.push(null);
      continue;
    }
    const dt = (cellValue instanceof Date) ? cellValue : new Date(cellValue);
    if (isNaN(dt.getTime())) {
      meses.push(null);
      continue;
    }
    const ano = dt.getFullYear();
    const mes = String(dt.getMonth() + 1).padStart(2, '0');
    meses.push(ano + '-' + mes);
  }

  // Linhas 2..ultimaLinha (idx 1..): vendedores + metas por mês
  const metas = {};
  for (let r = 1; r < ultimaLinha; r++) {
    const vendedorRaw = dados[r][0];
    if (!vendedorRaw) continue;
    const vendedor = normalizarVendedor(vendedorRaw);
    if (!vendedor) continue;

    for (let c = 1; c < ultimaCol; c++) {
      const mesKey = meses[c - 1];
      if (!mesKey) continue;

      const valor = dados[r][c];
      let metaValor = null;
      if (valor === null || valor === undefined || valor === '' || valor === '-') {
        metaValor = null; // não estava na equipe ou meta não definida
      } else {
        const n = Number(valor);
        metaValor = isNaN(n) ? null : n;
      }

      if (!metas[mesKey]) metas[mesKey] = {};
      metas[mesKey][vendedor] = metaValor;
    }
  }

  return {
    meses: meses.filter(function(m) { return m !== null; }),
    metas: metas
  };
}

// =============================================================
// FUNIL LEADS (Base Leads 2025-2026 — fonte do funil)
// =============================================================
// Substitui a aba "Pré Vendas - Visão Funil" como fonte do funil de vendas.
// Conta leads em cada etapa do funil (LAV → Conectado → Agendado → Ganho)
// para 2 visões: Mês (filtra pela data da etapa) e Safra (filtra pela data
// de criação do lead).
//
// Schema esperado em Base Leads 2025-2026:
//   Col C: Data LAV         (timestamp "yyyy-MM-dd HH:mm" ou Date)
//   Col D: Data Conectado   (timestamp ou Date)
//   Col E: Data Agendado    (timestamp ou Date)
//   Col F: Data Ganho       (timestamp ou Date)
//   Col L: Data de Criação  (timestamp ou Date)
//   Col N: Pré Vendedor     (string)
//
// Filtros aplicados (janela = funilStart..funilEnd dos filtros do dashboard):
//   Visão Mês:
//     Lead      → linha conta se col L (criação) ∈ janela
//     LAV       → linha conta se col C ∈ janela
//     Conectado → linha conta se col D ∈ janela
//     Agendado  → linha conta se col E ∈ janela
//     Ganho     → linha conta se col F ∈ janela
//   Visão Safra (lead criado na janela e que atingiu cada etapa):
//     Lead      → col L ∈ janela (todo lead criado na janela conta)
//     LAV       → col L ∈ janela E col C != null/vazio
//     Conectado → col L ∈ janela E col D != null/vazio
//     Agendado  → col L ∈ janela E col E != null/vazio
//     Ganho     → col L ∈ janela E col F != null/vazio
//
// "Lead" conta TODA linha (com ou sem owner válido) — inclui leads sem pré-vendedor
// atribuído (descartados em workflow antes de chegar ao time). LAV/Conectado/Agendado/
// Ganho só contam linhas com owner na lista de pré-vendedores ativos (aba "Compilado de
// Passes"). Por isso o Total.lead >= soma dos vendedores — a diferença é o descarte.
//
// Retorna agregação por vendedor + linha "Total":
//   {
//     dateRange: { start, end },
//     vendedores: ["Eduarda de Barros", ...],
//     mes:   { "Eduarda de Barros": { lead, lav, conectado, agendado, ganho }, ..., "Total": {...} },
//     safra: { "Eduarda de Barros": { lead, lav, conectado, agendado, ganho }, ..., "Total": {...} }
//   }
function agregarFunilLeads_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_BASE_LEADS);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_BASE_LEADS);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return funilLeadsVazio_(ss);

  // Lê janela de datas dos filtros atuais (A2/B2 da Visão Funil — refletem o filtro do dashboard)
  const filtros = lerFiltrosAtuais_(ss);
  const inicio = parseDataISO_(filtros.funilStart);
  const fim    = parseDataISO_(filtros.funilEnd);
  if (!inicio || !fim) return funilLeadsVazio_(ss, filtros.funilStart, filtros.funilEnd);
  fim.setHours(23, 59, 59, 999);

  // Ler cols C-P de uma vez (14 colunas: C..N + O Perfil Agrupado + P Tipo Estabelecimento)
  const dados = sheet.getRange(2, 3, ultimaLinha - 1, 14).getValues();

  // Vendedores válidos (do Compilado, normalizados)
  const compilado = lerCompilado_(ss);
  const vendedoresLista = compilado.rows
    .map(function(r) { return normalizarVendedor(r.vendedor); })
    .filter(function(v) { return !!v; });
  const vendedoresValidos = new Set(vendedoresLista);

  const inRange = function(val) {
    if (val === null || val === undefined || val === '') return false;
    const dt = (val instanceof Date) ? val : new Date(val);
    if (isNaN(dt.getTime())) return false;
    return dt >= inicio && dt <= fim;
  };

  const conhecida = function(val) {
    return val !== null && val !== undefined && val !== '';
  };

  // Normaliza valor de dimensão (origem/perfil/tipo) — trim, default "Não informado"
  const normDim = function(v) {
    if (v === null || v === undefined) return 'Não informado';
    const s = String(v).trim();
    return s === '' ? 'Não informado' : s;
  };

  // Inicializa estruturas com 0 para todos os vendedores válidos
  const mes = {}, safra = {};
  vendedoresLista.forEach(function(v) {
    mes[v]   = { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 };
    safra[v] = { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 };
  });

  // Fatiado: 1 entry por combinação única (vendedor, origemMacro, perfilAgrupado, tipoEstab)
  // Permite ao frontend re-agregar com filtros aplicados, sem mandar 30k linhas crus.
  // Chave de agg: vendedor|origemMacro|perfilAgrupado|tipoEstab
  const fatiadoAgg = {};

  // "Lead" (topo de funil) sem owner válido — leads que caem em workflow e nunca chegam
  // a um pré-vendedor (sem responsável ou responsável fora da lista ativa). Precisa de
  // agregação própria (sem dimensão de vendedor) pra não ficar invisível no Total do funil.
  // Chave de agg: origemMacro|origemMicro|perfilAgrupado|tipoEstab
  const fatiadoSemOwnerAgg = {};

  const desconhecidos = {};

  for (let i = 0; i < dados.length; i++) {
    // Indexes (relativos ao bloco que começa em col C):
    // C=0, D=1, E=2, F=3, G=4, H=5, I=6, J=7, K=8, L=9, M=10, N=11, O=12, P=13
    const colC = dados[i][0];   // Data LAV
    const colD = dados[i][1];   // Data Conectado
    const colE = dados[i][2];   // Data Agendado
    const colF = dados[i][3];   // Data Ganho
    const colG = dados[i][4];   // Origem Macro
    const colH = dados[i][5];   // Origem Micro
    const colL = dados[i][9];   // Data Criação
    const colN = dados[i][11];  // Pré Vendedor
    const colO = dados[i][12];  // Perfil Agrupado
    const colP = dados[i][13];  // Tipo de Estabelecimento

    const origemMacro    = normDim(colG);
    const origemMicro    = normDim(colH);
    const perfilAgrupado = normDim(colO);
    const tipoEstab      = normDim(colP);

    // Cidade (col J = estado). Mesma regra de agrupamento do agregarTipoReuniao_:
    // agrupa por UF pra que SP inclua ABC/Guarulhos e BH inclua Nova Lima.
    const colJ = dados[i][7];   // Estado (UF)
    const uf = String(colJ == null ? '' : colJ).trim().toUpperCase();
    const cidade = (uf === 'SP') ? 'SP' : (uf === 'RJ') ? 'RJ' : (uf === 'MG') ? 'BH' : 'Outros';

    // Visão Mês: cada etapa filtra pela coluna de data DA ETAPA
    const leadMes      = inRange(colL) ? 1 : 0;
    const lavMes       = inRange(colC) ? 1 : 0;
    const conectadoMes = inRange(colD) ? 1 : 0;
    const agendadoMes  = inRange(colE) ? 1 : 0;
    const ganhoMes     = inRange(colF) ? 1 : 0;

    // Visão Safra: lead CRIADO na janela (col L), conta a etapa se a coluna correspondente é "conhecida"
    const dentroSafra = inRange(colL);
    const leadSafra       = dentroSafra ? 1 : 0;
    const lavSafra        = (dentroSafra && conhecida(colC)) ? 1 : 0;
    const conectadoSafra  = (dentroSafra && conhecida(colD)) ? 1 : 0;
    const agendadoSafra   = (dentroSafra && conhecida(colE)) ? 1 : 0;
    const ganhoSafra      = (dentroSafra && conhecida(colF)) ? 1 : 0;

    // vendedor válido = tem owner E owner está na lista de pré-vendedores ativos.
    // "Lead" conta pra QUALQUER linha (com ou sem owner válido) — é o topo de funil real.
    // LAV/Conectado/Agendado/Ganho só fazem sentido atribuídos a um pré-vendedor do time.
    const vendedor = colN ? normalizarVendedor(colN) : null;
    const vendedorValido = !!vendedor && vendedoresValidos.has(vendedor);

    if (colN && !vendedorValido) {
      desconhecidos[String(colN).trim()] = (desconhecidos[String(colN).trim()] || 0) + 1;
    }

    if (vendedorValido) {
      // Skip se essa linha não tem nenhum evento na janela (nem mes nem safra)
      const totalEventos = leadMes + lavMes + conectadoMes + agendadoMes + ganhoMes +
                           leadSafra + lavSafra + conectadoSafra + agendadoSafra + ganhoSafra;
      if (totalEventos === 0) continue;

      // Agrega no totalizador por vendedor
      mes[vendedor].lead       += leadMes;
      mes[vendedor].lav        += lavMes;
      mes[vendedor].conectado  += conectadoMes;
      mes[vendedor].agendado   += agendadoMes;
      mes[vendedor].ganho      += ganhoMes;
      safra[vendedor].lead       += leadSafra;
      safra[vendedor].lav        += lavSafra;
      safra[vendedor].conectado  += conectadoSafra;
      safra[vendedor].agendado   += agendadoSafra;
      safra[vendedor].ganho      += ganhoSafra;

      // Agrega no fatiado (chave = vendedor|origemMacro|origemMicro|perfilAgrupado|tipoEstab|cidade)
      const chave = vendedor + '|' + origemMacro + '|' + origemMicro + '|' + perfilAgrupado + '|' + tipoEstab + '|' + cidade;
      if (!fatiadoAgg[chave]) {
        fatiadoAgg[chave] = {
          vendedor: vendedor,
          origemMacro: origemMacro,
          origemMicro: origemMicro,
          perfilAgrupado: perfilAgrupado,
          tipoEstab: tipoEstab,
          cidade: cidade,
          mes:   { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 },
          safra: { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 }
        };
      }
      const f = fatiadoAgg[chave];
      f.mes.lead      += leadMes;
      f.mes.lav       += lavMes;
      f.mes.conectado += conectadoMes;
      f.mes.agendado  += agendadoMes;
      f.mes.ganho     += ganhoMes;
      f.safra.lead      += leadSafra;
      f.safra.lav       += lavSafra;
      f.safra.conectado += conectadoSafra;
      f.safra.agendado  += agendadoSafra;
      f.safra.ganho     += ganhoSafra;
    } else {
      // Sem owner válido: não entra em LAV/Conectado/Agendado/Ganho (não tem pré-vendedor
      // pra atribuir), mas ainda conta como "Lead" — senão o descarte por workflow desaparece.
      if (leadMes === 0 && leadSafra === 0) continue;

      const chaveSemOwner = origemMacro + '|' + origemMicro + '|' + perfilAgrupado + '|' + tipoEstab + '|' + cidade;
      if (!fatiadoSemOwnerAgg[chaveSemOwner]) {
        fatiadoSemOwnerAgg[chaveSemOwner] = {
          origemMacro: origemMacro,
          origemMicro: origemMicro,
          perfilAgrupado: perfilAgrupado,
          tipoEstab: tipoEstab,
          cidade: cidade,
          mes:   { lead: 0 },
          safra: { lead: 0 }
        };
      }
      fatiadoSemOwnerAgg[chaveSemOwner].mes.lead   += leadMes;
      fatiadoSemOwnerAgg[chaveSemOwner].safra.lead += leadSafra;
    }
  }

  // Total = soma sobre vendedores + leads sem owner válido (só na etapa "lead")
  const totalMes   = { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 };
  const totalSafra = { lead: 0, lav: 0, conectado: 0, agendado: 0, ganho: 0 };
  vendedoresLista.forEach(function(v) {
    totalMes.lead      += mes[v].lead;
    totalMes.lav       += mes[v].lav;
    totalMes.conectado += mes[v].conectado;
    totalMes.agendado  += mes[v].agendado;
    totalMes.ganho     += mes[v].ganho;
    totalSafra.lead      += safra[v].lead;
    totalSafra.lav       += safra[v].lav;
    totalSafra.conectado += safra[v].conectado;
    totalSafra.agendado  += safra[v].agendado;
    totalSafra.ganho     += safra[v].ganho;
  });
  const fatiadoSemOwnerArr = Object.keys(fatiadoSemOwnerAgg).map(function(k) { return fatiadoSemOwnerAgg[k]; });
  fatiadoSemOwnerArr.forEach(function(f) {
    totalMes.lead   += f.mes.lead;
    totalSafra.lead += f.safra.lead;
  });
  mes.Total   = totalMes;
  safra.Total = totalSafra;

  const desconhecidosKeys = Object.keys(desconhecidos);
  if (desconhecidosKeys.length > 0) {
    Logger.log('agregarFunilLeads_: vendedores desconhecidos descartados: ' +
      desconhecidosKeys.map(function(k) { return k + ' (' + desconhecidos[k] + ')'; }).join(', '));
  }

  // Coleta vocabulários únicos (pra popular os selects de filtro no frontend)
  const fatiadoArr = Object.keys(fatiadoAgg).map(function(k) { return fatiadoAgg[k]; });
  const dimensoes = coletarDimensoes_(fatiadoArr);

  return {
    dateRange: { start: filtros.funilStart, end: filtros.funilEnd },
    vendedores: vendedoresLista,
    mes:   mes,
    safra: safra,
    fatiado: fatiadoArr,
    fatiadoSemOwner: fatiadoSemOwnerArr,
    dimensoes: dimensoes
  };
}

// Coleta valores únicos das 4 dimensões a partir do fatiado.
// Usado pra popular selects no frontend. Sempre inclui "Não informado" se houver.
function coletarDimensoes_(fatiado) {
  const setOrigem = {}, setOrigemMicro = {}, setPerfil = {}, setTipo = {};
  fatiado.forEach(function(f) {
    setOrigem[f.origemMacro]      = true;
    setOrigemMicro[f.origemMicro] = true;
    setPerfil[f.perfilAgrupado]   = true;
    setTipo[f.tipoEstab]          = true;
  });
  return {
    origemMacro:    Object.keys(setOrigem).sort(),
    origemMicro:    Object.keys(setOrigemMicro).sort(),
    perfilAgrupado: Object.keys(setPerfil).sort(),
    tipoEstab:      Object.keys(setTipo).sort()
  };
}

function funilLeadsVazio_(ss, start, end) {
  return {
    dateRange: { start: start || null, end: end || null },
    vendedores: [],
    mes:   {},
    safra: {},
    fatiado: [],
    fatiadoSemOwner: [],
    dimensoes: { origemMacro: [], origemMicro: [], perfilAgrupado: [], tipoEstab: [] }
  };
}

// =============================================================
// METAS (Neo Crescimento - PV — visão de meta / reuniões)
// =============================================================
// Fonte da aba "Visão Geral", "Ranking" e do bar Realizado da "Funil vs Meta".
// Diferente de timeline: lê de Neo Crescimento - PV (não de Passes Do Mês),
// porque "passes feitos esse mês" pode ser para reuniões em outro mês — para
// fins de meta, conta a reunião (data D), não o passe.
//
// Schema esperado:
//   - Col C: Pré Vendedor
//   - Col D: Data da Reunião (Date ou ISO)
//   - Col E: Status de validação ("Sim" = válido, "Não" = inválido, vazio = a validar)
//
// Cada item agregado contém:
//   { date, vendedor, count, validados, aValidar, naoValidos }
//   onde count = validados + aValidar + naoValidos (volume total).
function agregarMetas_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_NEO_CRESCIMENTO);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_NEO_CRESCIMENTO);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return { items: [] };

  // Lê cols C-E (3 colunas): vendedor, data reunião, status
  const dados = sheet.getRange(2, 3, ultimaLinha - 1, 3).getValues();

  // Normaliza nomes do Compilado também (defensivo contra variações)
  const vendedoresValidos = new Set(
    lerCompilado_(ss).rows
      .map(function(r) { return normalizarVendedor(r.vendedor); })
      .filter(function(v) { return !!v; })
  );

  // Para diagnóstico: log de vendedores desconhecidos (descartados)
  const desconhecidos = {};

  const agg = {};
  for (let i = 0; i < dados.length; i++) {
    const proprietario = dados[i][0];   // col C
    const dataReuniao  = dados[i][1];   // col D
    const validacao    = dados[i][2];   // col E

    if (!proprietario || !dataReuniao) continue;

    const dt = (dataReuniao instanceof Date) ? dataReuniao : new Date(dataReuniao);
    if (isNaN(dt.getTime())) continue;

    const vendedorNorm = normalizarVendedor(proprietario);
    if (!vendedoresValidos.has(vendedorNorm)) {
      desconhecidos[String(proprietario).trim()] = (desconhecidos[String(proprietario).trim()] || 0) + 1;
      continue;
    }

    const dataKey = formatarDataISO_(dt);
    const chave = dataKey + '|' + vendedorNorm;
    if (!agg[chave]) {
      agg[chave] = { date: dataKey, vendedor: vendedorNorm, count: 0, validados: 0, aValidar: 0, naoValidos: 0 };
    }
    agg[chave].count++;

    const status = (validacao === null || validacao === undefined) ? '' : String(validacao).trim().toLowerCase();
    if (status === 'sim') {
      agg[chave].validados++;
    } else if (status === 'não' || status === 'nao') {
      agg[chave].naoValidos++;
    } else {
      // string vazia ou qualquer outra coisa = a validar
      agg[chave].aValidar++;
    }
  }

  // Loga vendedores desconhecidos (úteis pra detectar nomes não cobertos por aliases)
  const desconhecidosKeys = Object.keys(desconhecidos);
  if (desconhecidosKeys.length > 0) {
    Logger.log('agregarMetas_: vendedores desconhecidos descartados: ' +
      desconhecidosKeys.map(function(k) { return k + ' (' + desconhecidos[k] + ')'; }).join(', '));
  }

  const items = Object.keys(agg).map(function(k) { return agg[k]; });

  // Ordena: data desc, depois vendedor asc
  items.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.vendedor < b.vendedor ? -1 : 1;
  });

  return { items: items };
}

// =============================================================
// TIMELINE (Passes Do Mês — agregado dos últimos 60 dias)
// =============================================================
function agregarTimeline_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_PASSES_MES);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_PASSES_MES);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return { rangeDias: CONFIG.TIMELINE_DIAS, items: [], dimensoes: { origemMacro: [], origemMicro: [], perfilAgrupado: [], tipoEstab: [] } };

  // Lê bloco contíguo: cols B-M (12 colunas)
  // idx 0=B Origem Macro, 1=C Origem Micro, 4=F Perfil Agrupado, 6=H Proprietário, 9=K Data Reunião, 11=M Tipo Estab
  const dados = sheet.getRange(2, 2, ultimaLinha - 1, 12).getValues();

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - CONFIG.TIMELINE_DIAS);

  // Vendedores ativos = os que aparecem no Compilado de Passes (rows, sem o Total)
  // Normaliza Compilado também (defensivo contra variações de espaço/acento)
  const vendedoresValidos = new Set(
    lerCompilado_(ss).rows
      .map(function(r) { return normalizarVendedor(r.vendedor); })
      .filter(function(v) { return !!v; })
  );

  // Normaliza valor de dimensão (origem/perfil/tipo) — trim, default "Não informado"
  const normDim = function(v) {
    if (v === null || v === undefined) return 'Não informado';
    const s = String(v).trim();
    return s === '' ? 'Não informado' : s;
  };

  const desconhecidos = {};

  // Agrupa por (data, vendedor, origemMacro, origemMicro, perfilAgrupado, tipoEstab) — permite filtro client-side
  const agg = {};
  for (let i = 0; i < dados.length; i++) {
    const origemMacro    = dados[i][0];   // col B
    const origemMicro    = dados[i][1];   // col C
    const perfilAgrupado = dados[i][4];   // col F
    const proprietario   = dados[i][6];   // col H
    const dataReuniao    = dados[i][9];   // col K
    const tipoEstab      = dados[i][11];  // col M

    if (!proprietario || !dataReuniao) continue;

    const dt = (dataReuniao instanceof Date) ? dataReuniao : new Date(dataReuniao);
    if (isNaN(dt.getTime()) || dt < cutoff) continue;

    const vendedorNorm = normalizarVendedor(proprietario);
    if (!vendedoresValidos.has(vendedorNorm)) {
      desconhecidos[String(proprietario).trim()] = (desconhecidos[String(proprietario).trim()] || 0) + 1;
      continue;
    }

    const dataKey = formatarDataISO_(dt);
    const oM  = normDim(origemMacro);
    const oMi = normDim(origemMicro);
    const pA  = normDim(perfilAgrupado);
    const tE  = normDim(tipoEstab);
    const chave = dataKey + '|' + vendedorNorm + '|' + oM + '|' + oMi + '|' + pA + '|' + tE;

    if (!agg[chave]) {
      agg[chave] = {
        date: dataKey,
        vendedor: vendedorNorm,
        origemMacro: oM,
        origemMicro: oMi,
        perfilAgrupado: pA,
        tipoEstab: tE,
        count: 0
      };
    }
    agg[chave].count++;
  }

  const desconhecidosKeys = Object.keys(desconhecidos);
  if (desconhecidosKeys.length > 0) {
    Logger.log('agregarTimeline_: vendedores desconhecidos descartados: ' +
      desconhecidosKeys.map(function(k) { return k + ' (' + desconhecidos[k] + ')'; }).join(', '));
  }

  const items = Object.keys(agg).map(function(k) { return agg[k]; });

  // Ordena: data desc, depois vendedor asc
  items.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.vendedor < b.vendedor ? -1 : 1;
  });

  // Vocabulários únicos (pra popular selects de filtro)
  const setO = {}, setOMi = {}, setP = {}, setT = {};
  items.forEach(function(it) {
    setO[it.origemMacro]     = true;
    setOMi[it.origemMicro]   = true;
    setP[it.perfilAgrupado]  = true;
    setT[it.tipoEstab]       = true;
  });

  return {
    rangeDias: CONFIG.TIMELINE_DIAS,
    items: items,
    dimensoes: {
      origemMacro:    Object.keys(setO).sort(),
      origemMicro:    Object.keys(setOMi).sort(),
      perfilAgrupado: Object.keys(setP).sort(),
      tipoEstab:      Object.keys(setT).sort()
    }
  };
}

// =============================================================
// LEADS GRANULARES PARA OVERLAY DO COHORT (Passes Do Mês)
// =============================================================
// Retorna lista de leads com data reunião dentro da janela do cohort atual
// (B2:C2 da Passes da Semana). Cada lead vira 1 entry com colunas suficientes
// para o overlay (recordId p/ link HubSpot, datas, origem, perfil, tipo).
//
// Schema esperado em Passes Do Mês:
//   col B = Origem Macro
//   col F = Perfil Agrupado
//   col H = Proprietário (vendedor)
//   col J = Record ID HubSpot
//   col K = Data Reunião
//   col L = Data Criação
//   col M = Tipo Estabelecimento
//
// O frontend filtra novamente por (vendedor, criação start/end) pra mostrar
// só os leads da célula sobre a qual o mouse está.
function agregarLeadsParaCohort_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_PASSES_MES);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_PASSES_MES);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return { leads: [], dateRange: { start: null, end: null } };

  // Janela de reunião = mesmo range usado pelo cohort (filters.cohortStart/End)
  const filtros = lerFiltrosAtuais_(ss);
  const inicio = parseDataISO_(filtros.cohortStart);
  const fim    = parseDataISO_(filtros.cohortEnd);
  if (!inicio || !fim) return { leads: [], dateRange: { start: filtros.cohortStart || null, end: filtros.cohortEnd || null } };
  fim.setHours(23, 59, 59, 999);

  // Lê bloco contíguo B-M (mesmo que agregarTimeline_, 12 cols)
  const dados = sheet.getRange(2, 2, ultimaLinha - 1, 12).getValues();

  // Vendedores válidos (normalizados via aliases)
  const vendedoresValidos = new Set(
    lerCompilado_(ss).rows
      .map(function(r) { return normalizarVendedor(r.vendedor); })
      .filter(function(v) { return !!v; })
  );

  const normStr = function(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  };

  const inRange = function(val) {
    if (val === null || val === undefined || val === '') return false;
    const dt = (val instanceof Date) ? val : new Date(val);
    if (isNaN(dt.getTime())) return false;
    return dt >= inicio && dt <= fim;
  };

  const leads = [];
  for (let i = 0; i < dados.length; i++) {
    const origemMacro    = dados[i][0];   // col B
    const perfilAgrupado = dados[i][4];   // col F
    const proprietario   = dados[i][6];   // col H
    const recordId       = dados[i][8];   // col J
    const dataReuniao    = dados[i][9];   // col K
    const dataCriacao    = dados[i][10];  // col L
    const tipoEstab      = dados[i][11];  // col M

    if (!proprietario || !dataReuniao || !inRange(dataReuniao)) continue;

    const vendedorNorm = normalizarVendedor(proprietario);
    if (!vendedoresValidos.has(vendedorNorm)) continue;

    const dtR = (dataReuniao instanceof Date) ? dataReuniao : new Date(dataReuniao);
    const dtC = dataCriacao
      ? ((dataCriacao instanceof Date) ? dataCriacao : new Date(dataCriacao))
      : null;

    leads.push({
      vendedor:       vendedorNorm,
      dataReuniao:    formatarDataISO_(dtR),
      dataCriacao:    (dtC && !isNaN(dtC.getTime())) ? formatarDataISO_(dtC) : null,
      recordId:       normStr(recordId),
      origemMacro:    normStr(origemMacro)    || 'Não informado',
      perfilAgrupado: normStr(perfilAgrupado) || 'Não informado',
      tipoEstab:      normStr(tipoEstab)      || 'Não informado'
    });
  }

  return {
    leads: leads,
    dateRange: { start: filtros.cohortStart, end: filtros.cohortEnd }
  };
}

// =============================================================
// DEALS GRANULARES PARA OVERLAY DA VISÃO GERAL (chart Agendamentos por vendedor)
// =============================================================
// Retorna lista de deals da aba Neo Crescimento - PV no mês corrente, com info pra
// link HubSpot. Cada deal tem: dealId (col A), vendedor (col C), data (col D), status (col E).
// Frontend filtra ao clicar num segmento do chart Agendamentos por (vendedor, status).
//
// URL HubSpot Deal: https://app.hubspot.com/contacts/<portalId>/record/0-3/<dealId>
function agregarDealsParaOverlay_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_NEO_CRESCIMENTO);
  if (!sheet) throw new Error('Aba não encontrada: ' + CONFIG.ABA_NEO_CRESCIMENTO);

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return { deals: [], dateRange: { start: null, end: null } };

  // Janela = a mesma do filtro atual (filters.cohortStart/End). Pode incluir mês passado se Custom.
  // Frontend ainda filtra por vendedor+status no click. Isso garante que o overlay bata com a barra.
  const filtros = lerFiltrosAtuais_(ss);
  const metaInfo = lerMetaInfo_(ss);
  const startRaw = filtros.cohortStart || metaInfo.startMonth;
  const endRaw   = filtros.cohortEnd   || metaInfo.endMonth;
  const inicio = parseDataISO_(startRaw);
  const fim    = parseDataISO_(endRaw);
  if (!inicio || !fim) return { deals: [], dateRange: { start: startRaw || null, end: endRaw || null } };
  fim.setHours(23, 59, 59, 999);

  // Lê cols A-E (5 colunas) — A=Record ID Deal, C=Vendedor, D=Data, E=Status
  const dados = sheet.getRange(2, 1, ultimaLinha - 1, 5).getValues();

  const vendedoresValidos = new Set(
    lerCompilado_(ss).rows
      .map(function(r) { return normalizarVendedor(r.vendedor); })
      .filter(function(v) { return !!v; })
  );

  const deals = [];
  for (let i = 0; i < dados.length; i++) {
    const dealId       = dados[i][0];   // col A
    const proprietario = dados[i][2];   // col C
    const dataReuniao  = dados[i][3];   // col D
    const validacao    = dados[i][4];   // col E

    if (!proprietario || !dataReuniao) continue;

    const dt = (dataReuniao instanceof Date) ? dataReuniao : new Date(dataReuniao);
    if (isNaN(dt.getTime()) || dt < inicio || dt > fim) continue;

    const vendedorNorm = normalizarVendedor(proprietario);
    if (!vendedoresValidos.has(vendedorNorm)) continue;

    // Normaliza status: "sim" → validado · "não" → naoValido · vazio → aValidar
    const raw = (validacao === null || validacao === undefined) ? '' : String(validacao).trim().toLowerCase();
    let status;
    if (raw === 'sim') status = 'validado';
    else if (raw === 'não' || raw === 'nao') status = 'naoValido';
    else status = 'aValidar';

    deals.push({
      dealId:   dealId ? String(dealId).trim() : '',
      vendedor: vendedorNorm,
      data:     formatarDataISO_(dt),
      status:   status
    });
  }

  return {
    deals: deals,
    dateRange: { start: startRaw, end: endRaw }
  };
}


// =============================================================
// TIPO DE REUNIÃO (Online vs Presencial vs Agora) — HubSpot Lead.tipo_de_reuniao
// =============================================================
// Fonte: aba "Base Leads 2025-2026" (Leads.gs -> exportarLeadsParaSheets), coluna
// Q (17ª) tipo_de_reuniao — populada a partir do objeto Lead (0-136) do HubSpot.
// ATENÇÃO: antes esse dado vinha de uma aba separada "Tipo de Reunião"
// (TipoReuniao.gs), que lia Deal.tipo_de_reuniao no pipeline "Executivo de
// Vendas 2.0" -- propriedade HOMÔNIMA só que de um objeto ERRADO (Deal, não
// Lead), o que subcontava as reuniões (~83/mês vs os ~447/mês reais).
// TipoReuniao.gs e a aba "Tipo de Reunião" foram removidos: agora lemos
// direto da Base Leads, sem round-trip extra ao HubSpot.
//
// Data usada para granularidade: col E (data_de_entrada_em_reuniao_agendada),
// a mesma data de "Agendado" do funil -- bate com a expectativa de "reuniões
// do mês" (não createdate, não outra data).
//
// Granular por lead (data, vendedor, tipo) -- permite ao frontend filtrar por
// periodo (dia/semana/mes/custom) e vendedor sem novo round-trip ao backend,
// no mesmo padrao de agregarTimeline_ (ver obterTipoReuniaoFiltrado no Index.html).
function agregarTipoReuniao_(ss) {
  const sheet = ss.getSheetByName(CONFIG.ABA_BASE_LEADS);
  if (!sheet) return { items: [], vendedores: [] };

  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return { items: [], vendedores: [] };

  // Le cols E..R de uma vez (14 colunas). Indexes relativos (bloco comeca em
  // col E=5): E=0 Data Agendado, F=1, G=2, H=3, I=4, J=5, K=6 Rota do Lead,
  // L=7, M=8, N=9 Pre Vendedor, O=10, P=11, Q=12 Tipo de Reuniao,
  // R=13 Executivo de Vendas (dono do Deal associado -- Leads.gs sincronizarExecutivoDeVendas_)
  const dados = sheet.getRange(2, 5, ultimaLinha - 1, 14).getValues();

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (CONFIG.TIPO_REUNIAO_DIAS || 180));

  // ATUALIZACAO 2026-08-24: online/presencial nao vem mais do campo tipo_de_reuniao
  // do HubSpot -- vem de QUEM e o Executivo de Vendas (col R). So os 4 executivos
  // abaixo fazem reuniao online; todo o resto (demais executivos, 'Sem executivo')
  // conta como presencial. 'Reuniao Agora' continua vindo do HubSpot (nao e nem um
  // nem outro). Validado no HubSpot: dos 211 negocios com tipo_de_reuniao preenchido,
  // 47 batem nas duas regras, 7 saiam de online p/ presencial e 2 o inverso -- a
  // diferenca e justamente o campo manual que ficava desatualizado.
  const EXECUTIVOS_ONLINE_ = ['Cayo Martins', 'João Junqueira', 'Costanza Turetta', 'Rafael Matiello'];
  const mapTipo = function(v, executivo) {
    const s = String(v || '').trim();
    if (s === 'Reunião Agora') return 'agora';
    if (s === 'Reunião On Line' || s === 'Reunião Presencial') {
      return EXECUTIVOS_ONLINE_.indexOf(String(executivo || '').trim()) !== -1 ? 'online' : 'presencial';
    }
    return 'outro';
  };

  // Cidade: agrupador regional derivado do campo "estado" (col J), ja sincronizado
  // por leads.gs. MG vira "BH" porque a operacao mineira e Belo Horizonte + Nova Lima.
  // Agrupa por UF e nao pelo nome da cidade de proposito: assim o gerente de SP
  // enxerga ABC/Guarulhos/Osasco junto, que e como a meta dele e cobrada.
  const mapCidade = function(uf) {
    const s = String(uf || '').trim().toUpperCase();
    if (s === 'SP') return 'SP';
    if (s === 'RJ') return 'RJ';
    if (s === 'MG') return 'BH';
    return 'Outros';
  };

  const vendedoresSet = {};
  const items = [];
  for (let i = 0; i < dados.length; i++) {
    const dataAgendado = dados[i][0];  // col E
    const colN         = dados[i][9];  // col N -- Pre Vendedor
    const tipoRaw       = dados[i][12]; // col Q -- tipo_de_reuniao
    const rotaRaw        = dados[i][6];  // col K -- rota_do_lead
    const executivoRaw   = dados[i][13]; // col R -- Executivo de Vendas
    const estadoRaw      = dados[i][5];  // col J -- estado (UF)

    if (!colN || !dataAgendado || !tipoRaw) continue;

    const dt = (dataAgendado instanceof Date) ? dataAgendado : new Date(dataAgendado);
    if (isNaN(dt.getTime()) || dt < cutoff) continue;

    const vendedorNorm = normalizarVendedor(colN);
    if (!vendedorNorm) continue;
    vendedoresSet[vendedorNorm] = true;

    items.push({
      date: formatarDataISO_(dt),
      vendedor: vendedorNorm,
      tipo: mapTipo(tipoRaw, executivoRaw),
      rota: String(rotaRaw || '').trim() || 'Sem rota',
      executivo: String(executivoRaw || '').trim() || 'Sem executivo',
      cidade: mapCidade(estadoRaw)
    });
  }

  return { items: items, vendedores: Object.keys(vendedoresSet).sort() };
}

// =============================================================
// lerMRRPorPreVendedor_ -- le a aba "MRR por Pre-vendedor" (snapshot manual,
// gerado via consulta ao Redshift reports.EventoAssinatura + entities.Deal).
// Nao e atualizado automaticamente pelo Apps Script -- ver decisoes/handoff.
// =============================================================
function lerMRRPorPreVendedor_(ss) {
  var sh = ss.getSheetByName('MRR por Pré-vendedor');
  if (!sh) return { agendamento: [], venda: [] };
  var last = sh.getLastRow();
  if (last < 2) return { agendamento: [], venda: [] };
  var values = sh.getRange(2, 1, last - 1, 6).getValues();
  var agendamento = [], venda = [];
  values.forEach(function(row) {
    var base = String(row[0] || '').trim();
    if (!base) return;
    var sdr = String(row[1] || '').trim();
    var mesRaw = row[2];
    var mes = mesRaw instanceof Date ? Utilities.formatDate(mesRaw, Session.getScriptTimeZone(), 'yyyy-MM') : String(mesRaw).slice(0, 7);
    var reunioes = row[3] === '' ? null : Number(row[3]);
    var vendas = Number(row[4]);
    var mrr = Number(row[5]);
    var item = { sdr: sdr, mes: mes, vendas: vendas, mrr: mrr };
    if (base === 'agendamento') { item.reunioes = reunioes; agendamento.push(item); }
    else if (base === 'venda') { venda.push(item); }
  });
  return { agendamento: agendamento, venda: venda };
}
