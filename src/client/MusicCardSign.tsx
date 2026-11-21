import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Settings2, X } from 'lucide-react'
import { usePluginContext } from '@luckylillia-dev/plugin-sdk/webui'

const DEFAULT_URL = 'https://ss.xingzhige.com/music_card/card'

/**
 * The service OneBot's `music` segment turns a song into a signed card with: the bot setting `musicCardSignUrl`,
 * which only this adapter reads, applied as it is saved without dropping a connection.
 */
const MusicCardSign: React.FC = () => {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [])

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors flex-shrink-0"
      >
        <Settings2 size={16} />
        高级设置
      </button>
      {open && createPortal(<MusicCardSignDialog onClose={close} />, document.body)}
    </>
  )
}

const MusicCardSignDialog: React.FC<{ onClose(): void }> = ({ onClose }) => {
  const ctx = usePluginContext()
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let disposed = false
    dialog.current?.focus()
    ctx.api('/api/config').then(
      (data: { config: { musicCardSignUrl?: string } }) => {
        if (disposed) return
        setSaved(data.config.musicCardSignUrl ?? '')
        setUrl(data.config.musicCardSignUrl ?? '')
      },
      (e: unknown) => {
        if (disposed) return
        ctx.toast(e instanceof Error ? e.message : '读取设置失败', 'error')
        onClose()
      },
    )
    return () => { disposed = true }
  }, [ctx, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!saving) onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const save = async () => {
    if (saving || saved === null || url.trim() === saved) return
    setSaving(true)
    try {
      await ctx.api('/api/config', { method: 'POST', body: { config: { musicCardSignUrl: url.trim() } } })
      ctx.toast('音乐卡片签名地址已保存')
      onClose()
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 scrim flex items-center justify-center p-4" style={{ zIndex: 9000 }}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="glass glass-thick r-window glass-pop w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onKeyDown={e => {
          if (e.key !== 'Tab') return
          const controls = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            e.preventDefault()
            last?.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 hairline-b">
          <h3 id={`${id}-title`} className="text-lg font-semibold text-theme">OneBot 11 · 高级设置</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭高级设置" className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-50">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); void save() }}>
          <div className="p-6">
            {saved === null ? (
              <div className="flex justify-center py-6" aria-label="正在读取设置"><Loader2 size={24} className="animate-spin text-pink-500" /></div>
            ) : (
              <div>
                <label htmlFor={`${id}-url`} className="block text-sm font-medium text-theme-secondary mb-2">音乐卡片签名地址</label>
                <input
                  id={`${id}-url`}
                  type="text"
                  inputMode="url"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  disabled={saving}
                  onChange={e => setUrl(e.target.value)}
                  placeholder={DEFAULT_URL}
                  aria-describedby={`${id}-description`}
                  className="input-field w-full"
                />
                <p id={`${id}-description`} className="text-xs text-theme-muted mt-2">发送音乐卡片时，使用此服务生成签名卡片。修改后立即生效。</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 px-6 pb-6">
            <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2 text-theme-secondary hover:bg-theme-item rounded-xl font-medium transition-colors disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving || saved === null || url.trim() === saved} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 size={18} className="animate-spin" />}保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MusicCardSign
