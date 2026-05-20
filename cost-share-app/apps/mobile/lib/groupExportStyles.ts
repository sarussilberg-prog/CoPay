/** Inline CSS for exported group HTML reports. */
export const GROUP_EXPORT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    color: #1a1a1a;
    margin: 24px;
    background: #fafafa;
  }
  .wrap {
    max-width: 960px;
    margin: 0 auto;
    background: #fff;
    padding: 28px 32px;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
  }
  h1 { font-size: 22px; margin: 0 0 8px; font-weight: 700; }
  .meta { color: #555; margin: 0 0 24px; font-size: 13px; }
  .meta p { margin: 4px 0; }
  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #e8e8e8;
    color: #333;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    font-size: 13px;
  }
  th {
    background: #f0f4f8;
    text-align: start;
    padding: 10px 12px;
    font-weight: 600;
    border: 1px solid #dde3ea;
    color: #2c3e50;
  }
  td {
    padding: 9px 12px;
    border: 1px solid #e8ecf0;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f9fafb; }
  tr.row-settlement td { background: #f0fdf4; }
  tr.row-message td { background: #faf5ff; }
  td.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.muted, th.muted { color: #888; }
  td.empty { text-align: center; color: #666; font-style: italic; padding: 20px; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
  .footer .brand-name { color: #3B82F6; font-weight: 700; }
`;
