/**
 * Model-directory adapter shared by the effort slider surfaces.
 *
 * Harness 0.1.5 removed `connection.api`: the model directory and the effort
 * write moved to `ctx.remote.session` (`modelCatalog` / `selectModel`), and the
 * session's own choice is projected as `modelSelection`. Both generations answer
 * with an `{ ok, value }` carrier — the older one nests it under `result` — and
 * both accept the same selection shape, so this module normalizes them into the
 * two verbs a slider needs.
 *
 * The remote namespaces are themselves service keys: reading `ctx.remote.session`
 * requires `remote.session` in the plugin's `inject` list, or Cordis throws
 * `cannot get property "remote.session" without inject`.
 */
import { useEffect, useState } from 'react'

/** One model selection, as the directory and the write API speak it. */
export interface EffortSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** One reasoning level offered by the selected model. */
export interface EffortLevel {
  id: string
  name: string
  description?: string
}

/** The advisory directory value both host generations reduce to. */
export interface EffortDirectory {
  current: EffortSelection | null
  groups: Array<{
    id: string
    models: Array<{
      id: string
      reasoning?: { efforts?: EffortLevel[]; defaultEffort?: string }
    }>
  }>
}

/** The `{ ok, value }` carrier, tolerating the older `result`-nested answer. */
interface ResultCarrier<T> {
  ok?: boolean
  value?: T
  error?: { code?: string; message?: string }
  result?: { ok?: boolean; value?: T; error?: { code?: string; message?: string } }
}

/** The two verbs every effort surface needs, normalized across host versions. */
export interface EffortApi {
  /** Read the generation's model directory. */
  models(request: { sessionId: string }): Promise<ResultCarrier<EffortDirectory>>
  /** Install one reasoning level for the session. */
  selectModel(request: EffortSelection & { sessionId: string }): Promise<ResultCarrier<unknown>>
}

/**
 * Minimal structural view of the plugin context: enough to read services
 * without pinning the adapter to one SDK generation's `Context` type.
 */
export interface EffortContext {
  get(name: string): unknown
}

/** One normalized carrier answer. */
export interface CarrierValue<T> {
  ok: boolean
  value: T | undefined
  error: { code?: string; message?: string } | undefined
}

/**
 * Unwrap either generation's answer into one shape.
 * @param response - the raw carrier.
 * @returns the normalized outcome.
 */
export function carrierOf<T>(response: ResultCarrier<T> | undefined): CarrierValue<T> {
  const source = response?.result ?? response
  return {
    ok: source?.ok === true,
    value: source?.value,
    error: source?.error,
  }
}

/**
 * Resolve the effort API for the running host generation.
 * @param ctx - the plugin context (see {@link EffortContext}).
 * @param sessionId - the session whose directory is wanted.
 * @returns the normalized verbs, or undefined when neither generation is usable.
 */
export function resolveEffortApi(ctx: EffortContext, sessionId: string): EffortApi | undefined {
  const connection = ctx.get('connection') as
    | { api?: { sessions?: { models?: (request: { sessionId: string }) => Promise<ResultCarrier<EffortDirectory>>; selectModel?: EffortApi['selectModel'] } } }
    | undefined
  const legacy = connection?.api?.sessions
  if (legacy !== undefined && typeof legacy.models === 'function' && typeof legacy.selectModel === 'function') {
    return {
      models: (request) => legacy.models!(request),
      selectModel: (request) => legacy.selectModel!(request),
    }
  }
  // `remote` is a Context property in some builds and a `ctx.get` service in
  // others; a host that provides neither must degrade, not throw.
  let remote: unknown
  try {
    remote = ctx.get('remote')
  } catch (error) {
    console.warn('[effort-slider] remote lookup failed:', error)
    remote = undefined
  }
  const session = (remote as { session?: { modelCatalog?: EffortApi['models']; selectModel?: EffortApi['selectModel'] } } | undefined)?.session
  if (session === undefined || typeof session.modelCatalog !== 'function' || typeof session.selectModel !== 'function') {
    return undefined
  }
  return {
    // `modelCatalog()` is session-independent and takes no request: the
    // per-session choice comes from the `modelSelection` projection instead.
    models: () => session.modelCatalog!(),
    selectModel: (request) => session.selectModel!(request),
  }
}

/**
 * The session's own model choice: the durable `modelSelection` projection's
 * `next` (then `lastUsed`), falling back to the directory default — the same
 * precedence the official picker uses.
 * @param ctx - the plugin context.
 * @param sessionId - the owning session.
 * @param value - the freshly loaded directory value.
 * @returns the effective selection, or null when nothing is known.
 */
export function currentSelectionOf(
  ctx: EffortContext,
  sessionId: string,
  value: EffortDirectory & { default?: EffortSelection },
): EffortSelection | null {
  try {
    const sessions = ctx.get('sessions') as
      | { binding?: (id: string) => { session?: { projections?: { faceOf?: (key: string) => { getSnapshot?: () => unknown } } } } | undefined }
      | undefined
    const face = sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('modelSelection')
    const projected = face?.getSnapshot?.() as { next?: EffortSelection | null; lastUsed?: EffortSelection | null } | undefined
    const picked = projected?.next ?? projected?.lastUsed
    if (picked !== undefined && picked !== null) return picked
  } catch (error) {
    console.warn('[effort-slider] projection read failed:', error)
  }
  return value.current ?? value.default ?? null
}

/**
 * Load the per-session model directory once per surface mount.
 * @param api - the resolved verbs, or undefined when the host offers none.
 * @param ctx - the plugin context.
 * @param sessionId - the owning session.
 * @returns the directory, or null while it is unavailable.
 */
export function useEffortDirectory(
  api: EffortApi | undefined,
  ctx: EffortContext,
  sessionId: string,
): EffortDirectory | null {
  const [directory, setDirectory] = useState<EffortDirectory | null>(null)
  useEffect(() => {
    let alive = true
    setDirectory(null)
    if (api === undefined) {
      return () => {
        alive = false
      }
    }
    void api
      .models({ sessionId })
      .then((response) => {
        const { ok, value, error } = carrierOf(response)
        console.log('[effort-slider] models:', ok
          ? `ok groups=${value?.groups?.length} current=${JSON.stringify(value?.current ?? (value as { default?: unknown } | undefined)?.default)}`
          : `fail ${error?.code}: ${error?.message}`)
        if (alive && ok && value !== undefined) {
          setDirectory({
            groups: value.groups ?? [],
            current: currentSelectionOf(ctx, sessionId, value),
          })
        }
      })
      .catch((error: unknown) => {
        console.warn('[effort-slider] models threw:', error)
      })
    return () => {
      alive = false
    }
  }, [api, ctx, sessionId])
  return directory
}
