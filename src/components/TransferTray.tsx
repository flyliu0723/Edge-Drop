/**
 * TransferTray — floating overlay for batch phone transfers.
 * Opened from the Header inbox button.
 */
import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { formatBytes } from '../lib/format'
import { CloseIcon, PhoneIcon, PlusIcon, ClipboardIcon, TrashIcon } from './icons'
import '../styles/transfer.css'

export function TransferTray() {
  const open = useStore((s) => s.transferTrayOpen)
  const setOpen = useStore((s) => s.setTransferTrayOpen)
  const bundles = useStore((s) => s.transferBundles)
  const lanIp = useStore((s) => s.transferLanIp)
  const lanIps = useStore((s) => s.transferLanIps)
  const setTransferState = useStore((s) => s.setTransferState)
  const setActiveQr = useStore((s) => s.setActiveQr)
  const pushToast = useStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)

  const bundle = bundles[0]
  const items = bundle?.items ?? []
  const count = items.length

  const refresh = useCallback(
    async (next?: Awaited<ReturnType<typeof window.edge.transferList>>) => {
      const state = next ?? (await window.edge.transferList())
      setTransferState(state)
    },
    [setTransferState]
  )

  const onAddFiles = async () => {
    setBusy(true)
    try {
      const paths = await window.edge.transferPickFiles()
      if (paths.length) {
        const state = await window.edge.transferStageFile(paths)
        setTransferState(state)
      }
    } catch (e) {
      pushToast({
        id: `tf-${Date.now()}`,
        message: (e as Error).message || '添加文件失败',
        tone: 'error'
      })
    } finally {
      setBusy(false)
    }
  }

  const onStageClipboard = async () => {
    setBusy(true)
    try {
      const state = await window.edge.transferStageClipboard()
      setTransferState(state)
    } catch (e) {
      pushToast({
        id: `tf-${Date.now()}`,
        message: (e as Error).message || '读取剪贴板失败',
        tone: 'error'
      })
    } finally {
      setBusy(false)
    }
  }

  const onRemoveItem = async (itemId: string) => {
    if (!bundle) return
    const state = await window.edge.transferRemoveItem(bundle.id, itemId)
    setTransferState(state)
  }

  const onClear = async () => {
    if (!bundle) return
    const state = await window.edge.transferRemoveBundle(bundle.id)
    setTransferState(state)
  }

  const onGenerateQr = async () => {
    if (!bundle || count === 0) return
    setBusy(true)
    try {
      const qr = await window.edge.transferGenerateQr({ kind: 'bundle', bundleId: bundle.id })
      setActiveQr(qr)
      await refresh()
    } catch (e) {
      pushToast({
        id: `tf-${Date.now()}`,
        message: (e as Error).message || '生成二维码失败',
        tone: 'error'
      })
    } finally {
      setBusy(false)
    }
  }

  const onSelectIp = async (ip: string) => {
    try {
      const state = await window.edge.transferSetLanIp(ip)
      setTransferState(state)
    } catch (e) {
      pushToast({
        id: `tf-${Date.now()}`,
        message: (e as Error).message || '切换网卡失败',
        tone: 'error'
      })
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="transfer-tray"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
        >
          <div className="transfer-tray-header">
            <div className="transfer-tray-title">
              <PhoneIcon width={14} height={14} />
              <span>暂存箱</span>
              {count > 0 && <span className="transfer-count">{count}</span>}
            </div>
            <button
              type="button"
              className="icon-btn"
              title="关闭"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                width: 28,
                height: 28,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>

          <div className="transfer-lan">
            {lanIp ? (
              <span>局域网 · {lanIp}</span>
            ) : (
              <span className="transfer-lan-warn">未检测到局域网 IP，请连接 Wi-Fi</span>
            )}
          </div>

          {lanIps.length > 1 && (
            <div className="transfer-ip-select">
              {lanIps.map((ip) => (
                <button
                  key={ip}
                  type="button"
                  className={`transfer-ip-pill${ip === lanIp ? ' active' : ''}`}
                  onClick={() => void onSelectIp(ip)}
                  title="选择用于二维码的网卡地址"
                >
                  {ip}
                </button>
              ))}
            </div>
          )}

          <div className="transfer-drop-hint">可直接把文件拖进此处加入暂存箱</div>

          <div className="transfer-actions">
            <button type="button" className="transfer-action-btn" disabled={busy} onClick={onAddFiles}>
              <PlusIcon width={14} height={14} />
              添加文件
            </button>
            <button type="button" className="transfer-action-btn" disabled={busy} onClick={onStageClipboard}>
              <ClipboardIcon width={14} height={14} />
              放入当前剪贴板
            </button>
          </div>

          <div className="transfer-list">
            {count === 0 ? (
              <div className="transfer-empty">添加文件或剪贴板内容后，生成二维码传到手机</div>
            ) : (
              items.map((it) => {
                const label =
                  it.payload.kind === 'text'
                    ? it.payload.name || '文本'
                    : it.payload.name
                const sub =
                  it.payload.kind === 'text'
                    ? `${it.payload.text.slice(0, 40)}${it.payload.text.length > 40 ? '…' : ''}`
                    : formatBytes(it.payload.size)
                return (
                  <div key={it.id} className="transfer-row">
                    <div className="transfer-row-body">
                      <div className="transfer-row-name">{label}</div>
                      <div className="transfer-row-sub">{sub}</div>
                    </div>
                    <button
                      type="button"
                      className="act danger"
                      title="移除（会使当前二维码失效）"
                      onClick={() => onRemoveItem(it.id)}
                      style={{ width: 28, height: 28 }}
                    >
                      <TrashIcon width={12} height={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="transfer-footer">
            <button
              type="button"
              className="transfer-primary-btn"
              disabled={busy || count === 0 || !lanIp}
              onClick={onGenerateQr}
            >
              生成二维码
            </button>
            {count > 0 && (
              <button type="button" className="transfer-clear-btn" onClick={onClear}>
                清空
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
