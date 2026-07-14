// lib/commands/token.js — __zp_stoken__ 令牌操作
//
// 通过 Bridge 调浏览器生成 __zp_stoken__。
// 参考 BossZhipin_reverse 的逆向成果:
//   - token = new ABC().z(seed, ts_correction)
//   - seed 由服务端 code:37 响应下发, 缓存在 localStorage['passport_config']
//   - 一个 seed 约可复用 5 次
//   - token 含 '+' 和 '/', 入 cookie 前必须 URL 编码
//   - genStoken 返回 { token, tokenEncoded, tsUsed }

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function token(ctx, args) {
  const seed = getArg(args, 'seed', '');
  const ts = getArg(args, 'ts', String(Date.now()));
  const action = args[0];

  if (action === 'info') {
    // 读取缓存的 passport_config (含 seed)
    const expr = new ExpressionBuilder()
      .call('getPassportConfig')
      .build();

    const result = await ctx.bridgeCall(expr);
    if (result) {
      return {
        ok: true,
        hasCachedSeed: !!result.seed,
        seedName: result.name || null,
        seedTs: result.ts || null,
        message: result.message || null,
      };
    }
    return { ok: true, hasCachedSeed: false, hint: 'passport_config 未缓存，发送一次正常请求触发 code:37 后可获取 seed' };
  }

  if (action === 'gen') {
    // 从缓存读取 seed 或使用传入的 seed
    let effectiveSeed = seed;
    let effectiveTs = parseInt(ts);

    if (!effectiveSeed) {
      // 尝试从 passport_config 读取
      const configExpr = new ExpressionBuilder()
        .call('getPassportConfig')
        .build();
      const config = await ctx.bridgeCall(configExpr);
      if (config && config.seed) {
        effectiveSeed = config.seed;
        if (!ts || ts === String(Date.now())) {
          effectiveTs = config.ts || effectiveTs;
        }
      } else {
        throw new Error(
          '未找到 seed。请先:\n' +
          '  1. 在浏览器中正常使用 BOSS 直聘，等页面触发 token 生成\n' +
          '  2. 或手动传入: node cli.js token gen --seed <seed> --ts <ts>\n' +
          '  3. 查看缓存: node cli.js token info'
        );
      }
    }

    const expr = new ExpressionBuilder()
      .call('genStoken', effectiveSeed, String(effectiveTs))
      .build();

    const result = await ctx.bridgeCall(expr);
    return {
      ok: true,
      ...result,
      hint: 'tokenEncoded 可直接用于 Cookie: __zp_stoken__=<tokenEncoded>',
    };
  }

  throw new Error(
    '用法:\n' +
    '  node cli.js token info              查看 passport_config 缓存\n' +
    '  node cli.js token gen               生成 __zp_stoken__ (自动从缓存读 seed)\n' +
    '  node cli.js token gen --seed <s> --ts <ms>  手动指定 seed 和 ts'
  );
}

module.exports = { token };
