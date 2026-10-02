//#region src/index.ts
/**
* 宿主半区：本插件只做浏览器侧的菜单注入，宿主不注册任何东西。
* 保留一个空的 apply 是为了让加载树的那一行（cordis.patch.yml 的 insert）
* 有可加载的 node 入口。
*/
/** 稳定插件名（对应 cordis.patch.yml 的 insert id）。 */
const name = "ui-effort-slider";
/** 宿主侧无操作。 */
function apply() {}
//#endregion
export { apply, name };
