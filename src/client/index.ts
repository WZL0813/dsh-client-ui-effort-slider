/**
 * 推理等级滑块（独立插件）—— 从极光皮肤里抽出来的模块。
 *
 * 官方模型菜单打开时，在菜单末尾注入一条「推理等级」滑块：Off / Low / High /
 * Max 档位、WebGL 火焰轨道、拖动吸附。确认可用之后才隐藏官方那一行「推理等级」
 * 入口，宿主既不提供旧 `connection.api` 也不提供新 `remote.session` 时保留官方
 * 控件，不会两边都丢。
 *
 * 与皮肤无关：本插件只写这一块 UI，不碰背景、主题或布局，任何皮肤下都能用。
 * @module @wzl0813/dsh-client-ui-effort-slider
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InlineEffortSection } from './effort/InlineEffortSection.tsx'
import { resolveEffortApi } from './effort/api.ts'

/**
 * 需要的客户端服务：sessions / connection 供旧宿主取模型目录，
 * remote 与 remote.session 是 0.1.5 起的正式通路，uiSession 是 0.1.7 起
 * 当前会话的唯一来源。
 *
 * remote 与 remote.session 两个都必须声明：远程命名空间自身也是一个服务键，
 * 只声明 remote 时读 `.session` 仍会抛
 * "cannot get property \"remote.session\" without inject"。
 */
export const inject: string[] = ['connection', 'sessions', 'remote', 'remote.session', 'uiSession']

/**
 * 当前会话 id，按宿主代次取。
 *
 * 0.1.7 起 `sessions.list` 的快照不再带 `current`（改成 `ids` + `byId`），当前会话
 * 改由 `ctx.uiSession.adapter.current` 这个绑定源给出，键名是 `key`。更早的宿主只有
 * 旧字段，所以两代都试一遍；都拿不到就返回 undefined，调用方保留官方入口。
 * @param ctx - 插件上下文。
 * @returns 当前会话 id，或 undefined。
 */
function currentSessionId(ctx: ClientContext): string | undefined {
  try {
    const uiSession = ctx.get('uiSession') as
      | { adapter?: { current?: { getSnapshot?: () => { key?: unknown } } } }
      | undefined
    const key = uiSession?.adapter?.current?.getSnapshot?.()?.key
    if (typeof key === 'string' && key !== '') return key
  } catch (error) {
    console.warn('[effort-slider] uiSession read failed:', error)
  }
  try {
    const sessions = ctx.get('sessions') as { list?: { getSnapshot?: () => { current?: unknown } } } | undefined
    const current = sessions?.list?.getSnapshot?.()?.current
    if (typeof current === 'string' && current !== '') return current
  } catch (error) {
    console.warn('[effort-slider] session list read failed:', error)
  }
  return undefined
}

/**
 * 注册滑块：监听模型菜单出现，注入滑块区。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  const body = document.body
  const inlineRoots = new Set<Root>()

  /** 隐藏官方「推理等级」入口 cell（二级菜单），仅在滑块确认可用后调用。 */
  const hideOfficialEffortCells = (menu: HTMLElement): void => {
    for (const cell of menu.querySelectorAll('button[role="menuitem"]')) {
      const text = (cell.textContent ?? '').trim()
      if (text.startsWith('推理等级') || text.startsWith('Effort')) (cell as HTMLElement).style.display = 'none'
    }
  }

  /**
   * 让官方模型卡按「含滑块区」的新高度重新落位。官方在 useLayoutEffect 里用
   * menu.offsetHeight 量好位置，而滑块区是 MutationObserver 事后挂进 DOM 的，
   * 那次测量看不到它 —— 卡片会按旧高度落位、底部溢出。官方监听 window resize
   * 重算，这里派发一次人工 resize 即可（同帧再补一帧，等 React 渲染完）。
   */
  const nudgeMenuPlacement = (): void => {
    const fire = (): void => {
      try {
        window.dispatchEvent(new Event('resize'))
      } catch {
        /* 非 DOM 宿主没有可重排的东西 */
      }
    }
    fire()
    try {
      requestAnimationFrame(fire)
    } catch {
      /* 没有动画帧：同步那次已经补过 */
    }
  }

  /** 往一个模型菜单里注入滑块区（已注入则只补隐藏官方入口）。 */
  const mountInlineEffort = (menu: HTMLElement): void => {
    const existing = menu.querySelector<HTMLElement>('[data-effort-inline]')
    if (existing !== null) {
      // 目录就绪（usable）才隐藏官方入口，避免滑块不可用时两处都消失。
      if (existing.dataset.effortInline === 'usable') hideOfficialEffortCells(menu)
      return
    }
    const sessionId = currentSessionId(ctx)
    if (sessionId === undefined) return
    const api = resolveEffortApi(ctx, sessionId)
    if (api === undefined) return
    const container = document.createElement('div')
    container.dataset.effortInline = ''
    menu.appendChild(container)
    nudgeMenuPlacement()
    const root = createRoot(container)
    root.render(createElement(InlineEffortSection, {
      sessionId,
      api,
      ctx,
      onUsable: () => {
        container.dataset.effortInline = 'usable'
        hideOfficialEffortCells(menu)
        nudgeMenuPlacement()
      },
    }))
    inlineRoots.add(root)
  }

  // 菜单一打开即注入：滑块区挂在菜单末尾，跨 root/模型面板常驻。
  // 模型切换保持官方二次点击流程，不做干预。
  const observer = new MutationObserver(() => {
    for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) {
      // 官方模型菜单带 aria-busy；其他菜单不匹配。
      if (!menu.hasAttribute('aria-busy')) continue
      mountInlineEffort(menu)
    }
  })
  observer.observe(body, { childList: true, subtree: true })

  ctx.effect(
    () => () => {
      observer.disconnect()
      for (const root of inlineRoots) root.unmount()
      inlineRoots.clear()
      for (const el of document.querySelectorAll('[data-effort-inline]')) el.remove()
    },
    'ui-effort-slider: inline reasoning slider',
  )
}
