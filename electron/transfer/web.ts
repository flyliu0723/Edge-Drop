/**
 * Minimal HTML pages served to the phone browser after scanning a QR code.
 * Kept as string templates — not part of the Vite renderer build.
 */

export interface ListFileMeta {
  name: string
  size: number
  index: number
  isText: boolean
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const BASE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0a0a0c; color: #f2f2f7; min-height: 100vh;
    padding: 24px 16px 48px;
  }
  .card {
    max-width: 480px; margin: 0 auto;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px; padding: 20px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
  .sub { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 20px; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 8px; width: 100%; padding: 14px 16px; border-radius: 12px;
    border: none; font-size: 15px; font-weight: 600; cursor: pointer;
    text-decoration: none; color: #000; background: #fff; margin-top: 10px;
  }
  .btn.secondary {
    background: rgba(255,255,255,0.08); color: #fff;
    border: 1px solid rgba(255,255,255,0.12);
  }
  .row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .row:last-child { border-bottom: none; }
  .name { flex: 1; min-width: 0; font-size: 14px; word-break: break-all; }
  .meta { font-size: 12px; color: rgba(255,255,255,0.45); margin-top: 2px; }
  .dl {
    flex-shrink: 0; padding: 8px 12px; border-radius: 8px;
    background: rgba(255,255,255,0.12); color: #fff; text-decoration: none;
    font-size: 13px; font-weight: 500;
  }
  pre, .text-body {
    white-space: pre-wrap; word-break: break-word;
    background: rgba(0,0,0,0.35); border-radius: 12px;
    padding: 14px; font-size: 14px; line-height: 1.5;
    max-height: 60vh; overflow: auto; margin: 0 0 12px;
  }
  .hint { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 14px; line-height: 1.4; }
  .err { color: #ff6b6b; }
`

/** Text clipboard share page with a copy button. */
export function renderTextPage(text: string, title = '文本内容'): string {
  const safe = escapeHtml(text)
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Edge-Drop · ${escapeHtml(title)}</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card">
  <h1>${escapeHtml(title)}</h1>
  <div class="sub">来自 Edge-Drop</div>
  <div class="text-body" id="body">${safe}</div>
  <button class="btn" id="copyBtn" type="button">复制文本</button>
  <p class="hint" id="hint"></p>
</div>
<script>
  const text = ${JSON.stringify(text)};
  document.getElementById('copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById('hint').textContent = '已复制到剪贴板';
    } catch (e) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); document.getElementById('hint').textContent = '已复制到剪贴板'; }
      catch { document.getElementById('hint').textContent = '复制失败，请长按文本手动复制'; }
      document.body.removeChild(ta);
    }
  };
</script>
</body></html>`
}

/** Multi-file list: per-file download + zip all. */
export function renderListPage(token: string, files: ListFileMeta[]): string {
  const rows = files
    .map((f) => {
      if (f.isText) {
        return `<div class="row">
          <div class="name"><div>${escapeHtml(f.name)}</div><div class="meta">文本</div></div>
          <a class="dl" href="/d/${encodeURIComponent(token)}/file/${f.index}">查看</a>
        </div>`
      }
      return `<div class="row">
        <div class="name"><div>${escapeHtml(f.name)}</div><div class="meta">${formatBytes(f.size)}</div></div>
        <a class="dl" href="/d/${encodeURIComponent(token)}/file/${f.index}" download="${escapeHtml(f.name)}">下载</a>
      </div>`
    })
    .join('')

  const hasBinary = files.some((f) => !f.isText)

  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Edge-Drop · 文件列表</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card">
  <h1>待接收文件</h1>
  <div class="sub">共 ${files.length} 项 · 来自 Edge-Drop</div>
  ${rows}
  ${
    hasBinary
      ? `<a class="btn" href="/d/${encodeURIComponent(token)}/zip">全部下载 (ZIP)</a>
         <button class="btn secondary" id="seqBtn" type="button">逐个下载</button>
         <p class="hint">若「逐个下载」被浏览器拦截，请逐个点击右侧「下载」。ZIP 可一次收下全部文件。</p>`
      : ''
  }
</div>
<script>
  const links = ${JSON.stringify(
    files.filter((f) => !f.isText).map((f) => `/d/${token}/file/${f.index}`)
  )};
  const btn = document.getElementById('seqBtn');
  if (btn) {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '下载中…';
      for (let i = 0; i < links.length; i++) {
        const a = document.createElement('a');
        a.href = links[i];
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise(r => setTimeout(r, 400));
      }
      btn.disabled = false;
      btn.textContent = '逐个下载';
    };
  }
</script>
</body></html>`
}

export function renderGonePage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>链接已失效</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card">
  <h1 class="err">链接已失效</h1>
  <div class="sub">此二维码已过期，或电脑端已移除相关内容。请在 Edge-Drop 中重新生成。</div>
</div>
</body></html>`
}

export function renderErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>错误</title>
<style>${BASE_STYLE}</style>
</head><body>
<div class="card">
  <h1 class="err">出错了</h1>
  <div class="sub">${escapeHtml(message)}</div>
</div>
</body></html>`
}
