/**
 * inline reasoning-effort slider.
 *
 * Injected at the bottom of the official model menu: the same glow card, WebGL
 * fire track, glowing thumb and drag point-light as {@link EffortPanel}, sized
 * to sit under the model list. The official「推理等级」row is hidden only once
 * this surface reports a usable directory, so a host that offers neither API
 * keeps the stock control instead of losing both.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { carrierOf, useEffortDirectory, type EffortApi, type EffortContext } from './api.ts'
import { useWebglFire } from './useWebglFire.ts'
import css from './effort.module.css'

/** Inline section props: owning session, resolved verbs, host context, ready verb. */
export interface InlineEffortSectionProps {
  sessionId: string
  api: EffortApi
  ctx: EffortContext
  /** Called once the directory is loaded AND the model offers multiple levels. */
  onUsable: () => void
}

/**
 * The inline effort card.
 * @param props - session, verbs, context and the ready notification.
 */
export function InlineEffortSection(props: InlineEffortSectionProps): ReactElement {
  const { sessionId, api, ctx, onUsable } = props
  const directory = useEffortDirectory(api, ctx, sessionId)
  const [dragging, setDragging] = useState(false)
  // Continuous 0..100 slider position; snaps to an effort level on release.
  const [rawValue, setRawValue] = useState(0)

  const disabled = directory === null
  const rawCurrent = directory?.current ?? null
  // 无 current 时回退到第一个分组的第一模型（目录数据总是可用的）。
  const fallback = directory !== null && directory.groups.length > 0 && directory.groups[0].models.length > 0
    ? { provider: directory.groups[0].id, model: directory.groups[0].models[0].id }
    : null
  const current = rawCurrent ?? fallback
  const group = current === null ? undefined : directory?.groups.find((entry) => entry.id === current.provider)
  const model = group?.models.find((entry) => entry.id === current?.model)
  const efforts = model?.reasoning?.efforts ?? []
  const usable = !disabled && current !== null && efforts.length >= 2

  const currentEffortId = current?.reasoningEffort ?? model?.reasoning?.defaultEffort
  const rawIndex = currentEffortId === undefined ? -1 : efforts.findIndex((level) => level.id === currentEffortId)
  const step100 = efforts.length > 1 ? 100 / (efforts.length - 1) : 100
  const initialRaw = usable && rawIndex >= 0 ? rawIndex * step100 : 0

  useEffect(() => {
    setRawValue(initialRaw)
    setDragging(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory])

  // 目录加载成功且当前模型确实有多档等级时才接管官方入口。
  useEffect(() => {
    if (usable) onUsable()
  }, [usable, onUsable])

  const displayIndex = usable ? Math.round(rawValue / step100) : 0
  const level = efforts[displayIndex]
  const slider100 = usable ? rawValue : 0
  // 火焰前缘保底可见（最低档也有火苗，拖动时跟随滑块）。
  const slider01 = usable ? 0.15 + (rawValue / 100) * 0.85 : 0

  // WebGL fire: the front edge follows the slider; the CSS mask reveals it.
  const fireRef = useRef<HTMLCanvasElement | null>(null)
  useWebglFire(fireRef, () => slider01, () => true)

  const maskP = Math.max(slider100 - 1.5, 0)
  const maskFade = Math.min(slider100 + 1.5, 100)
  const fireStyle: CSSProperties = usable
    ? {
        maskImage: `linear-gradient(to right, black 0%, black ${maskP}%, transparent ${maskFade}%)`,
        WebkitMaskImage: `linear-gradient(to right, black 0%, black ${maskP}%, transparent ${maskFade}%)`,
        opacity: 1,
      }
    : { opacity: 0 }
  const pointLightStyle: CSSProperties = { left: `${slider100}%`, top: '50%' }

  /** 写入当前档位到会话（供拖动中节流调用）。 */
  const writeEffort = (v: number): void => {
    if (!usable || current === null) return
    const idx = Math.round(v / step100)
    const effort = efforts[idx]
    if (effort === undefined) return
    void api
      .selectModel({
        sessionId,
        provider: current.provider,
        model: current.model,
        reasoningEffort: effort.id,
      })
      .then((response) => {
        const { ok, error } = carrierOf(response)
        if (!ok) console.warn('[effort-slider] selectModel failed:', error?.code, error?.message)
      })
      .catch(() => {
        /* the official picker keeps its own error surface */
      })
  }
  const lastWriteRef = useRef(0)

  const onInput = (event: React.FormEvent<HTMLInputElement>): void => {
    if (!usable) return
    const v = Number((event.target as HTMLInputElement).value)
    setRawValue(v)
    // 每帧最多一次写入，避免拖动中请求堆积造成尾部延迟。
    const now = performance.now()
    if (now - lastWriteRef.current >= 16) {
      lastWriteRef.current = now
      writeEffort(v)
    }
  }

  /** 松手/失焦/键盘结束时吸附到最近档位并补发一次确认。 */
  const commit = (event: React.SyntheticEvent<HTMLInputElement>): void => {
    if (!usable) return
    const v = Number((event.target as HTMLInputElement).value)
    const idx = Math.round(v / step100)
    setRawValue(idx * step100)
    setDragging(false)
    writeEffort(v)
  }

  return (
    <div
      data-effort-inline="true"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 12px 8px', borderTop: '1px solid var(--dsw-alias-border-l2,#2a3350)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.02em', color: 'var(--dsw-alias-label-secondary,#9aa4c0)' }}>
          推理等级
        </span>
        {usable && level !== undefined ? (
          <span
            key={level.name}
            className={`${css.status} ${css[`level${displayIndex}`] ?? ''} ${displayIndex === efforts.length - 1 ? css.statusGlow : ''}`}
          >
            {level.name}
          </span>
        ) : (
          <span className={css.status}>—</span>
        )}
      </div>
      <div style={{ borderBottom: '1px dashed var(--dsw-alias-border-l2,#2a3350)', margin: '1px 0 4px' }} />
      <div className={css.levelLabels}>
        {efforts.map((entry, labelIndex) => (
          <span
            key={entry.id}
            className={`${css.levelLabel}${labelIndex === displayIndex ? ` ${css.levelLabelActive}` : ''}`}
            style={{ left: `${10 + (labelIndex / Math.max(efforts.length - 1, 1)) * 80}%` }}
          >
            {labelIndex === 0 ? 'Off' : labelIndex === efforts.length - 1 ? 'Max' : entry.name}
          </span>
        ))}
      </div>
      {/* 轨道无条件渲染：canvas 必须常驻 DOM，WebGL hook 才能在挂载时初始化。 */}
      <div className={css.trackWrapper}>
        <div className={css.trackBg} />
        <div className={css.dotsLayer}>
          {efforts.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`${css.dot}${dotIndex === displayIndex ? ` ${css.dotActive}` : ''}`}
              style={{ left: `${10 + (dotIndex / Math.max(efforts.length - 1, 1)) * 80}%` }}
            />
          ))}
        </div>
        <canvas ref={fireRef} className={css.fire} style={fireStyle} />
        <div className={`${css.pointLight}${dragging ? ` ${css.pointLightOn}` : ''}`} style={pointLightStyle} />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={usable ? rawValue : 0}
          disabled={!usable}
          className={`${css.range}${dragging ? ` ${css.rangeGlow}` : ''}`}
          onInput={onInput}
          onPointerDown={() => setDragging(true)}
          onPointerUp={commit}
          onPointerLeave={() => setDragging(false)}
          onBlur={commit}
        />
      </div>
      {!usable && (
        <div className={css.emptyOverlay}>
          {disabled ? '模型目录加载中…' : '当前模型不提供多档推理等级'}
        </div>
      )}
    </div>
  )
}
