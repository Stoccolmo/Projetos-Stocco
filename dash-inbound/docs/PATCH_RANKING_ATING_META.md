# Patch — coluna 'Ating. Meta' no Ranking do Inbound

Arquivo: **Index.html** do projeto Apps Script `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp` (produção).

São 10 substituições exatas. Cada bloco ANTES aparece **uma única vez** no arquivo (validado contra o espelho da Versão 19). Aplicar na ordem.

> Se algum bloco ANTES não for encontrado, a produção divergiu do espelho local de 25/08 — parar e reconferir em vez de forçar.

---

## 1

**ANTES**

```
  .grid-rank-mtd { grid-template-columns: 36px 2fr 80px 90px 110px 100px; }
```

**DEPOIS**

```
  .grid-rank-mtd { grid-template-columns: 36px 2fr 80px 90px 110px 100px; }
  .grid-rank-mtd7 { grid-template-columns: 36px 2fr 72px 84px 104px 100px 100px; }
  /* Tooltip no cabecalho da tabela: abre pra BAIXO, senao o overflow:hidden do .table-card corta */
  .table-head .info-tip { opacity: 0.75; }
  .table-head .info-tip .info-tip-content { bottom: auto; top: 150%; width: 230px; }
  .table-head .info-tip.tip-right .info-tip-content { left: auto; right: 0; transform: none; }
```

---

## 2

**ANTES**

```
  const totalRow = ating.total || {};
  const totalBadge = badgeForPct(totalRow.atingimentoProRata);

```

**DEPOIS**

```
  // Mes corrente: mostra as DUAS colunas de atingimento (pro rata + meta cheia), igual a dash de Outbound.
  // Mes finalizado: pro rata == meta cheia (o mes acabou), entao fica so uma coluna.
  const isCurr = ating.isMesCorrente;
  const gridCls = isCurr ? 'grid-rank-mtd7' : 'grid-rank-mtd';

  // Ating. Meta = Realizado / Meta CHEIA do mes (sem ajuste por dias decorridos)
  const atingVsMetaCheia = function(r) {
    const m = Number(r && r.metaTime) || 0;
    return m > 0 ? (Number(r.realizado) || 0) / m : null;
  };

  const totalRow = ating.total || {};
  const totalBadge = badgeForPct(totalRow.atingimentoProRata);
  const totalMetaBadge = badgeForPct(atingVsMetaCheia(totalRow));

```

---

## 3

**ANTES**

```
    const atingBadge  = badgeForPct(r.atingimentoProRata);

```

**DEPOIS**

```
    const atingBadge  = badgeForPct(r.atingimentoProRata);
    const atingMetaBadge = badgeForPct(atingVsMetaCheia(r));

```

---

## 4

**ANTES**

```
      <div class="table-row grid-rank-mtd ${rankClass}">
```

**DEPOIS**

```
      <div class="table-row ${gridCls} ${rankClass}">
```

---

## 5

**ANTES**

```
        <div style="text-align:center"><span class="metric-badge ${atingBadge.cls}">${atingBadge.label}</span></div>
      </div>`;
```

**DEPOIS**

```
        <div style="text-align:center"><span class="metric-badge ${atingBadge.cls}">${atingBadge.label}</span></div>
        ${isCurr ? `<div style="text-align:center"><span class="metric-badge ${atingMetaBadge.cls}">${atingMetaBadge.label}</span></div>` : ''}
      </div>`;
```

---

## 6

**ANTES**

```
  // Disclaimer + labels variam conforme mês corrente vs finalizado
  const isCurr = ating.isMesCorrente;
  const headerInfo = isCurr
```

**DEPOIS**

```
  // Disclaimer + labels variam conforme mês corrente vs finalizado
  const headerInfo = isCurr
```

---

## 7

**ANTES**

```
  const colProRataLabel = isCurr ? 'Pro Rata' : 'Meta Total';
  const colRealizadoLabel = isCurr ? 'Realizado MTD' : 'Realizado';

```

**DEPOIS**

```
  const colProRataLabel = isCurr ? 'Pro Rata' : 'Meta Total';
  const colRealizadoLabel = isCurr ? 'Realizado MTD' : 'Realizado';
  const colAtingLabel = isCurr ? 'Ating. Pro Rata' : 'Atingimento';
  const tip = function(txt, right) {
    return `<span class="info-tip${right ? ' tip-right' : ''}">i<span class="info-tip-content">${txt}</span></span>`;
  };
  const legendaAting = isCurr
    ? ' · Ating. Pro Rata = no ritmo esperado até hoje · Ating. Meta = do total do mês'
    : '';

```

---

## 8

**ANTES**

```
      ${headerInfo}
    </div>
    <div class="table-card">
      <div class="table-head grid-rank-mtd">
        <div></div>
        <div>Vendedor</div>
        <div style="text-align:center">Meta</div>
        <div style="text-align:center">${colProRataLabel}</div>
        <div style="text-align:center">${colRealizadoLabel}</div>
        <div style="text-align:center">Atingimento</div>
      </div>
```

**DEPOIS**

```
      ${headerInfo}${legendaAting}
    </div>
    <div class="table-card">
      <div class="table-head ${gridCls}">
        <div></div>
        <div>Vendedor</div>
        <div style="text-align:center">Meta</div>
        <div style="text-align:center">${colProRataLabel}</div>
        <div style="text-align:center">${colRealizadoLabel}</div>
        <div style="text-align:center">${colAtingLabel}${isCurr ? tip('Realizado ÷ Meta Pro Rata (meta ajustada pelos dias já decorridos). 100% = está no ritmo até hoje.', true) : ''}</div>
        ${isCurr ? `<div style="text-align:center">Ating. Meta${tip('Realizado ÷ Meta CHEIA do mês, sem ajuste por dias decorridos. Quanto do mês inteiro já foi entregue.', true)}</div>` : ''}
      </div>
```

---

## 9

**ANTES**

```
      <div class="table-row grid-rank-mtd" style="background:var(--surface2);font-weight:600;">
```

**DEPOIS**

```
      <div class="table-row ${gridCls}" style="background:var(--surface2);font-weight:600;">
```

---

## 10

**ANTES**

```
        <div style="text-align:center"><span class="metric-badge ${totalBadge.cls}">${totalBadge.label}</span></div>
      </div>
    </div>`;
}
```

**DEPOIS**

```
        <div style="text-align:center"><span class="metric-badge ${totalBadge.cls}">${totalBadge.label}</span></div>
        ${isCurr ? `<div style="text-align:center"><span class="metric-badge ${totalMetaBadge.cls}">${totalMetaBadge.label}</span></div>` : ''}
      </div>
    </div>`;
}
```

