// lib/shared/bootstrap.js — Bridge 自愈代码（共享模块）
//
// 由 cli.js 和 server/router.js 共用，确保一致的 __bridge 注入逻辑。
// __bridge 定义的唯一事实源在 lib/shared/bridge-api.js —— 新增 API 改那里即可，
// 油猴脚本（scripts/build-userscript.js 生成）与这里的自愈注入自动同步。

const { BRIDGE_API } = require('./bridge-api');

// 自愈注入的代码：首次向某 site 派发 eval 时由 server/router.js 自动 prepend。
// 这是完整版 __bridge 定义，__bridge 丢失时（页面刷新/SPA 导航）能恢复全部能力。
const BRIDGE_BOOTSTRAP = BRIDGE_API;

module.exports = { BRIDGE_BOOTSTRAP };
