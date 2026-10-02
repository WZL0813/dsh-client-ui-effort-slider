import { clientBundle } from './shared/tsdown.client.ts'

// 本插件只做浏览器侧注入：宿主半区是空的 apply，client 半区才是全部内容。
export default clientBundle('@wzl0813/dsh-client-ui-effort-slider', ['src/index.ts'])
