/**
 * Generate a QR code data URL for a share URL.
 */
import QRCode from 'qrcode'

export async function toQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  })
}
