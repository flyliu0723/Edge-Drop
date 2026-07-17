/**
 * QrModal — shows a one-shot QR code for phone download.
 * 关闭弹层即作废 token，避免用户误以为关掉就失效。
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QrResult } from '../../shared/types'
import { CloseIcon, CopyIcon } from './icons'
import { useStore } from '../store/appStore'
import '../styles/transfer.css'

interface Props {
  qr: QrResult | null
}

function formatRemaining(expiresAt: number): string {
  if (!expiresAt || expiresAt <= 0) return '有效期未知'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return '已过期'
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  if (mins < 60) return `${mins} 分钟内有效`
  const hours = Math.ceil(mins / 60)
  return `${hours} 小时内有效`
}

export function QrModal({ qr }: Props) {
  const [remaining, setRemaining] = useState('')
  const [copied, setCopied] = useState(false)
  const dismissQr = useStore((s) => s.dismissQr)
  const pushToast = useStore((s) => s.pushToast)

  useEffect(() => {
    if (!qr) return
    const tick = () => setRemaining(formatRemaining(qr.expiresAt))
    tick()
    const id = window.setInterval(tick, 5_000)
    return () => window.clearInterval(id)
  }, [qr])

  const copyUrl = async () => {
    if (!qr) return
    try {
      await navigator.clipboard.writeText(qr.url)
      setCopied(true)
      pushToast({ id: `copy-url-${Date.now()}`, message: '链接已复制', tone: 'info' })
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ id: `copy-url-${Date.now()}`, message: '复制失败', tone: 'error' })
    }
  }

  return (
    <AnimatePresence>
      {qr && (
        <motion.div
          className="qr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => void dismissQr()}
        >
          <motion.div
            className="qr-card"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qr-card-header">
              <span>扫码传到手机</span>
              <button
                type="button"
                className="icon-btn"
                title="关闭并作废链接"
                onClick={() => void dismissQr()}
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
            <img className="qr-image" src={qr.qrDataUrl} alt="传输二维码" />
            <div className="qr-meta">
              <div>{remaining}</div>
              <div className="qr-url" title={qr.url}>
                {qr.lanIp} · 同一 Wi-Fi 扫码即可
              </div>
              <div className="qr-hint">关闭后链接立即失效</div>
              <div className="qr-hint">打不开时请允许防火墙「专用网络」访问</div>
            </div>
            <button type="button" className="qr-copy-btn" onClick={() => void copyUrl()}>
              <CopyIcon width={14} height={14} />
              {copied ? '已复制' : '复制链接'}
            </button>
            <button type="button" className="qr-revoke-btn" onClick={() => void dismissQr()}>
              关闭并作废
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
