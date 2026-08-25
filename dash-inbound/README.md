# Dashboard Pré-Vendas (Inbound) — Painel de Gestão

Painel de gestão do time de Pré-Vendas Inbound, integrado direto com HubSpot via Google Apps Script + Google Sheets.

- **Link do painel:** https://script.google.com/a/macros/gabriel.com.br/s/AKfycbyI171A-6I9qLfHpqc1kpuRNpEY3XMOsJSslwdWP6C9OA7DilcEIDV56WLPj7v0g3gBYQ/exec
- **Projeto Apps Script:** `1gRnpQdbrQieE2QAkgnEXtTFAB1bdYR2d1CabNfk4Fg31iAXvD6ng3PWp`
- **Planilha mãe (produção):** `1YebaLxqGoS38A_MUk-B0P50g0JL7Srh3T85mGJ_KdPY` ("Planilha OFICIAL - Meta e Andamento")

## Estrutura

- `docs/` — handoff de continuidade (arquitetura, bugs corrigidos, convenções de edição/deploy).
- `decisoes/` — registro vivo de decisões e achados por sessão.
- `scripts/` — cópia mais recente do código-fonte publicado no Apps Script (`Cohort.gs`, `Code.gs`, `Utils.gs`, `Writer.gs`, `Reader.gs`, `Index.html`, `Sync.gs`, `leads.gs`, `SyncNeo.gs`). A fonte de verdade é sempre o projeto Apps Script; esta cópia é só espelho, sincronizada em 25/08/2026 com a **Versão 19** em produção.

## Irmão deste projeto

Existe um painel equivalente para o time de Outbound em [`../prospeccao-outbound`](../prospeccao-outbound/) — mesmo padrão de dashboard (SVG puro, sem lib externa, filtros client-side), fonte de dados diferente (Outbound usa HubSpot Deal direto; Inbound usa HubSpot Lead + planilha de metas).
