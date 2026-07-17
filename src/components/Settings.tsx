import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/appStore'
import type { AnchorOption } from '../../shared/types'
import '../styles/settings.css'

function AnchorPositionSettings() {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const [options, setOptions] = useState<AnchorOption[]>([])

  useEffect(() => {
    window.edge.listAnchorOptions().then(setOptions).catch(() => setOptions([]))
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, AnchorOption[]>()
    for (const opt of options) {
      const list = map.get(opt.displayLabel) ?? []
      list.push(opt)
      map.set(opt.displayLabel, list)
    }
    return [...map.entries()]
  }, [options])

  const isActive = (opt: AnchorOption) =>
    settings.anchorDisplayId === opt.displayId && settings.anchorEdge === opt.edge

  return (
    <div className="setting-row vertical">
      <div className="setting-info">
        <div className="setting-title">显示位置</div>
        <div className="setting-desc">选择面板贴靠的显示器与外边缘（已自动排除屏幕接缝）</div>
      </div>
      {grouped.length === 0 ? (
        <div className="setting-desc">正在加载显示器信息…</div>
      ) : (
        grouped.map(([label, edges]) => (
          <div key={label} className="anchor-display-group">
            <div className="anchor-display-label">{label}</div>
            <div className="setting-pills">
              {edges.map((opt) => (
                <button
                  key={`${opt.displayId}-${opt.edge}`}
                  className={`pill${isActive(opt) ? ' active' : ''}`}
                  onClick={() => patch({ anchorDisplayId: opt.displayId, anchorEdge: opt.edge })}
                >
                  {opt.edgeLabel}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function Settings() {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const updateInfo = useStore((s) => s.updateInfo)

  return (
    <div className="settings-list">
      {updateInfo?.hasUpdate && (
        <>
          <div className="update-prompt">
            <div className="update-text">
              有新版本可用，点击下载更新。
            </div>
            <button
              className="update-btn"
              onClick={() => window.open(updateInfo.downloadUrl, '_blank')}
            >
              下载 {updateInfo.latestVersion}
            </button>
          </div>
          <div className="setting-divider" />
        </>
      )}

      <AnchorPositionSettings />

      <div className="setting-divider" />

      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">传到手机</div>
          <div className="setting-desc">
            卡片「⋯」可发送到手机或加入暂存箱；Header 手机图标打开暂存箱。手机与电脑需同一 Wi-Fi，扫码即可下载（二维码约 30 分钟有效）。多网卡时可在暂存箱内切换局域网 IP。
          </div>
        </div>
      </div>

      <div className="setting-divider" />

      {/* Clear unpinned on restart */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">重启时清除未固定项</div>
          <div className="setting-desc">每次设备重启时清除未固定的剪贴板项</div>
        </div>
        <Toggle
          checked={settings.clearUnpinnedOnRestart}
          onChange={(v) => patch({ clearUnpinnedOnRestart: v })}
        />
      </div>

      <div className="setting-divider" />

      {/* Auto-delete timer */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">自动删除计时</div>
          <div className="setting-desc">自动清除已复制项（已固定项保留）</div>
        </div>
        <div className="setting-pills">
          {[
            { label: '永不', val: 0 },
            { label: '1 小时', val: 1 },
            { label: '6 小时', val: 6 },
            { label: '24 小时', val: 24 },
            { label: '7 天', val: 168 }
          ].map((opt) => (
            <button
              key={opt.val}
              className={`pill ${settings.autoDeleteHours === opt.val ? 'active' : ''}`}
              onClick={() => patch({ autoDeleteHours: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* History capacity */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">历史容量</div>
          <div className="setting-desc">最多保存的未固定历史项数量</div>
        </div>
        <div className="setting-pills">
          {[
            { label: '100', val: 100 },
            { label: '250', val: 250 },
            { label: '500', val: 500 },
            { label: '1000', val: 1000 }
          ].map((opt) => (
            <button
              key={opt.val}
              className={`pill ${settings.historyLimit === opt.val ? 'active' : ''}`}
              onClick={() => patch({ historyLimit: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Edge trigger height */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">边缘触发高度</div>
          <div className="setting-desc">屏幕边缘悬停区域大小</div>
        </div>
        <div className="setting-pills">
          {[
            { label: '小', val: 0.25 },
            { label: '中', val: 0.4 },
            { label: '大', val: 0.6 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${Math.abs(settings.hotZoneHeight - opt.val) < 0.08 ? 'active' : ''}`}
              onClick={() => patch({ hotZoneHeight: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Edge trigger width */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">边缘触发厚度</div>
          <div className="setting-desc">触发区域的物理宽度</div>
        </div>
        <div className="setting-pills">
          {[
            { label: '小', val: 3 },
            { label: '中', val: 6 },
            { label: '大', val: 12 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${settings.hotZoneWidth === opt.val ? 'active' : ''}`}
              onClick={() => patch({ hotZoneWidth: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Panel height */}
      <div className="setting-row vertical">
        <div className="setting-info">
          <div className="setting-title">面板高度</div>
          <div className="setting-desc">剪贴板面板的垂直尺寸</div>
        </div>
        <div className="setting-pills">
          {[
            { label: '小', val: 0.5 },
            { label: '中', val: 0.65 },
            { label: '大', val: 0.8 }
          ].map((opt) => (
            <button
              key={opt.label}
              className={`pill ${Math.abs((settings.panelHeight || 0.6) - opt.val) < 0.08 ? 'active' : ''}`}
              onClick={() => patch({ panelHeight: opt.val })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-divider" />

      {/* Incognito mode */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">无痕模式</div>
          <div className="setting-desc">暂停记录新的剪贴板内容</div>
        </div>
        <Toggle
          checked={settings.incognito}
          onChange={(v) => patch({ incognito: v })}
        />
      </div>

      <div className="setting-divider" />

      {/* Launch at login */}
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">开机自启</div>
          <div className="setting-desc">电脑启动时在后台静默运行</div>
        </div>
        <Toggle
          checked={settings.launchAtLogin}
          onChange={(v) => patch({ launchAtLogin: v })}
        />
      </div>

      <div className="setting-divider" />


    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`setting-toggle${checked ? ' checked' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" />
    </button>
  )
}
