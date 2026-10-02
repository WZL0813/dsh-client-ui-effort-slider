# 推理等级滑块（独立插件）

从极光皮肤里抽出来的那一块「推理等级」滑块，单独成包，**与皮肤无关** —— 不碰背景、主题、布局，任何皮肤下都能用。

## 它做什么

官方模型菜单（右下角那个「模型 / 推理等级」弹层）打开时，在菜单末尾注入一条滑块：

- Off / Low / High / Max 档位标签，当前档位高亮
- WebGL 火焰轨道 + 发光圆点 + 拖动时的点光源
- 拖动连续预览，松手吸附到最近档位，节流写入（每帧最多一次请求）

官方那一行「推理等级」入口**只在滑块确认可用之后**才隐藏。宿主既不提供旧 `connection.api` 也不提供新 `remote.session` 时保留官方控件 —— 不会出现两边都丢的情况。

## 装法

profile 的 `dependencies` 里加链接：

```json
"@wzl0813/dsh-client-ui-effort-slider": "link:<本目录绝对路径>"
```

然后在 profile 的 `cordis.patch.yml` 里插一行：

```yaml
- insert:
    - id: ui-effort-slider
      name: '@wzl0813/dsh-client-ui-effort-slider'
```

装完重启 `dsh web`（或强刷页面）生效。

## 依赖的客户端服务

```ts
export const inject = ['connection', 'sessions', 'remote', 'remote.session', 'uiSession']
```

| 服务 | 用途 |
| --- | --- |
| `connection` / `sessions` | 旧宿主取模型目录与当前会话 |
| `remote` + `remote.session` | 0.1.5 起的正式通路（`modelCatalog` / `selectModel`） |
| `uiSession` | 0.1.7 起当前会话的唯一来源 |

`remote` 与 `remote.session` **必须都声明**：远程命名空间自身也是个服务键，只声明 `remote` 时读 `.session` 会抛 `cannot get property "remote.session" without inject`。

## 重新构建

```bash
pnpm install
pnpm build
```

产物是 `lib/client.js`（浏览器半区）和 `lib/index.js`（空的宿主半区）。

## 目录

```
src/client/index.ts                  菜单监听 + 注入
src/client/effort/InlineEffortSection.tsx   滑块本体
src/client/effort/api.ts             双代 API 适配（旧 connection.api / 新 remote.session）
src/client/effort/useWebglFire.ts    火焰效果
src/client/effort/shaders.ts         WebGL2 着色器
src/client/effort/effort.module.css  样式
```

## 许可

Apache-2.0。滑块 UI 与 WebGL 效果来自 wzl0813/dsh-web-ui 的极光皮肤。
