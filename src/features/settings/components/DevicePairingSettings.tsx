import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Laptop,
  Loader2,
  QrCode as QrCodeIcon,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Copy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatPairingCode, normalizePairingCode } from '@yaply/crypto'
import { getMyFingerprint } from '@/features/chat/hooks/useEncryption'
import { useDevicePairing } from '@/features/pairing/hooks/useDevicePairing'
import type { TrustRole } from '@/features/pairing/hooks/useDevicePairing'
import PairingQr from '@/features/pairing/components/PairingQr'
import QrScanner, { hasCamera } from '@/features/pairing/components/QrScanner'

interface Props {
  userId: string
  /** Code arriving from a scanned QR deep link (/link#c=…), if any. */
  initialCode?: string
}

interface DeviceRow {
  device_id: number
  key_fingerprint: string | null
  device_name: string | null
  last_active_at: string | null
  created_at: string
}

// 'pick' → choose a trust role; 'rendezvous' → choose show-vs-enter; 'active'
// → a session is running and the hook owns the screen.
type Step = 'pick' | 'rendezvous' | 'active'

export default function DevicePairingSettings({ userId, initialCode }: Props) {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [myFp, setMyFp] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [pendingRole, setPendingRole] = useState<TrustRole>('receiver')
  const [typedCode, setTypedCode] = useState('')
  const [typedError, setTypedError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraAvailable, setCameraAvailable] = useState(false)
  const [copied, setCopied] = useState(false)

  const { phase, role, code, sas, error, importedCount, start, confirmAndSend, cancel } =
    useDevicePairing(userId)

  useEffect(() => {
    void hasCamera().then(setCameraAvailable)
    void getMyFingerprint(userId).then(setMyFp)
    void supabase
      .from('devices')
      .select('device_id, key_fingerprint, device_name, last_active_at, created_at')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false })
      .then(({ data }) => setDevices((data ?? []) as DeviceRow[]))
  }, [userId])

  const beginEntrant = useCallback(
    (raw: string) => {
      const normalized = normalizePairingCode(raw)
      if (!normalized) {
        setTypedError('That code doesn’t look right — it should be 8 characters.')
        return
      }
      setTypedError(null)
      setScanning(false)
      setStep('active')
      void start(pendingRole, normalized)
    },
    [pendingRole, start],
  )

  // A scanned deep link means the user already chose to receive on this device.
  useEffect(() => {
    if (!initialCode) return
    setPendingRole('receiver')
    const normalized = normalizePairingCode(initialCode)
    if (normalized) {
      setStep('active')
      void start('receiver', normalized)
    }
  }, [initialCode, start])

  const reset = () => {
    cancel()
    setStep('pick')
    setTypedCode('')
    setTypedError(null)
    setScanning(false)
  }

  const copyCode = () => {
    if (!code) return
    void navigator.clipboard.writeText(formatPairingCode(code)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="max-w-lg space-y-8">
      {/* Registered devices */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
            <Laptop size={14} className="text-text-subtle" />
          </span>
          <p className="text-sm font-semibold text-text">Your devices</p>
        </div>
        <div className="space-y-2">
          {devices.map((d) => (
            <div
              key={d.device_id}
              className="rounded-xl border border-border bg-tint px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-text truncate">
                  {d.device_name ?? `Device ${d.device_id}`}
                  {d.key_fingerprint && d.key_fingerprint === myFp && (
                    <span className="ml-2 text-xs text-accent-mint">this device</span>
                  )}
                </p>
                <p className="text-xs text-text-subtle">
                  Last active{' '}
                  {d.last_active_at ? new Date(d.last_active_at).toLocaleDateString() : 'unknown'}
                </p>
              </div>
              <span className="text-[10px] font-mono text-text-subtle truncate max-w-[6rem]">
                {d.key_fingerprint?.slice(0, 8)}
              </span>
            </div>
          ))}
          {devices.length === 0 && (
            <p className="text-xs text-text-subtle">No devices registered yet.</p>
          )}
        </div>
      </div>

      {/* Pairing */}
      <div className="pt-6 border-t border-border">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
            <ShieldCheck size={14} className="text-text-subtle" />
          </span>
          <p className="text-sm font-semibold text-text">Link a device</p>
        </div>
        <p className="text-xs text-text-subtle mb-4">
          Each device gets its own encryption key, so a new one can’t read messages sent before
          it existed. Linking copies your existing key across so history opens up. Both devices have
          to be online at the same time.
        </p>

        {step === 'pick' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setPendingRole('receiver')
                setStep('rendezvous')
              }}
              className="text-left rounded-2xl border border-border bg-tint p-4 hover:border-[#5b8def]/50 transition-colors"
            >
              <p className="text-sm font-medium text-text">Get history here</p>
              <p className="text-xs text-text-subtle mt-1">
                This device is new. Pull the keys from a device that already has your messages.
              </p>
            </button>
            <button
              onClick={() => {
                setPendingRole('sender')
                setStep('rendezvous')
              }}
              className="text-left rounded-2xl border border-border bg-tint p-4 hover:border-[#5b8def]/50 transition-colors"
            >
              <p className="text-sm font-medium text-text">Send history from here</p>
              <p className="text-xs text-text-subtle mt-1">
                This device already reads your messages. Hand its keys to another one.
              </p>
            </button>
          </div>
        )}

        {step === 'rendezvous' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('pick')}
              className="flex items-center gap-1.5 text-xs text-text-subtle hover:text-text transition-colors"
            >
              <ArrowLeft size={13} /> Back
            </button>
            <p className="text-xs text-text-subtle">
              Either device can show the code — pick whichever is easier. A camera is never
              required.
            </p>
            <button
              onClick={() => {
                setStep('active')
                void start(pendingRole)
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              <QrCodeIcon size={15} /> Show a code on this device
            </button>
            <div className="flex items-center gap-3">
              <span className="flex-1 h-px bg-border" />
              <span className="text-xs text-text-subtle">or</span>
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-2">
              <label htmlFor="pairing-code" className="block text-xs font-medium text-text-subtle">
                Enter the code shown on your other device
              </label>
              <div className="flex gap-2">
                <input
                  id="pairing-code"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && beginEntrant(typedCode)}
                  placeholder="XXXX-XXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-tint border border-border text-sm font-mono tracking-widest text-text placeholder:text-text-subtle outline-none focus:ring-1 focus:ring-[#5b8def]/50 focus:border-[#5b8def]/50 transition"
                />
                <button
                  onClick={() => beginEntrant(typedCode)}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  Continue
                </button>
              </div>
              {typedError && <p className="text-xs text-danger">{typedError}</p>}
              {/* Only offered where a camera actually exists — a camera-less
                  desktop should never see a control that leads nowhere. */}
              {cameraAvailable && !scanning && (
                <button
                  onClick={() => setScanning(true)}
                  className="flex items-center gap-1.5 text-xs text-primary-text hover:underline"
                >
                  <ScanLine size={13} /> Scan the QR instead
                </button>
              )}
              {scanning && (
                <QrScanner onScan={beginEntrant} onError={(m) => { setScanning(false); setTypedError(m) }} />
              )}
            </div>
          </div>
        )}

        {step === 'active' && (
          <div className="rounded-2xl border border-border bg-tint p-4 space-y-4">
            {phase === 'waiting' && (
              <>
                {code && (
                  <div className="flex flex-col items-center gap-3">
                    <PairingQr code={code} />
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-2 text-2xl font-mono tracking-[0.2em] text-text hover:opacity-80 transition-opacity"
                    >
                      {formatPairingCode(code)}
                      {copied ? <Check size={16} className="text-accent-mint" /> : <Copy size={16} className="text-text-subtle" />}
                    </button>
                    <p className="text-xs text-text-subtle text-center">
                      Scan this, or type the code into your other device. yaply will never ask you
                      to share this code with anyone else.
                    </p>
                  </div>
                )}
                <p className="flex items-center justify-center gap-2 text-xs text-text-subtle">
                  <Loader2 size={13} className="animate-spin" /> Waiting for the other device…
                </p>
              </>
            )}

            {phase === 'verifying' && (
              <div className="text-center space-y-3">
                <p className="text-xs text-text-subtle">
                  Check that this number matches on both screens. If it doesn’t, cancel — someone
                  else may be in the middle.
                </p>
                <p className="text-4xl font-mono tracking-[0.25em] text-text">{sas}</p>
                {role === 'sender' ? (
                  <button
                    onClick={() => void confirmAndSend()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                  >
                    <ShieldCheck size={15} /> Numbers match — send my keys
                  </button>
                ) : (
                  <p className="text-xs text-text-subtle">
                    Confirm on your other device to finish.
                  </p>
                )}
              </div>
            )}

            {phase === 'transferring' && (
              <p className="flex items-center justify-center gap-2 text-sm text-text-subtle">
                <Loader2 size={14} className="animate-spin" /> Transferring…
              </p>
            )}

            {phase === 'done' && (
              <div className="text-center space-y-3">
                <p className="flex items-center justify-center gap-2 text-sm text-text">
                  <Check size={15} className="text-accent-mint" />
                  {role === 'receiver'
                    ? `Linked — ${importedCount} key${importedCount === 1 ? '' : 's'} imported.`
                    : 'Linked. The other device can read your history now.'}
                </p>
                {role === 'receiver' && (
                  <>
                    <p className="text-xs text-text-subtle">
                      Reload to re-read your conversations with the new keys.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                    >
                      Reload
                    </button>
                  </>
                )}
              </div>
            )}

            {(phase === 'expired' || phase === 'error') && (
              <div className="text-center space-y-3">
                <p className="text-sm text-danger">
                  {phase === 'expired' ? 'That code expired. Start over.' : error}
                </p>
              </div>
            )}

            {phase !== 'done' && (
              <button
                onClick={reset}
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-surface transition-colors"
              >
                Cancel
              </button>
            )}
            {phase === 'done' && (
              <button
                onClick={reset}
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-text-muted hover:bg-surface transition-colors"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-text-subtle">
        <Smartphone size={13} className="mt-0.5 flex-shrink-0" />
        If you lose every linked device at once, past messages can’t be recovered — nothing that
        could unlock them is stored on our servers.
      </p>
    </div>
  )
}
