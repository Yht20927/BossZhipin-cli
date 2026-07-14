// lib/commands/helpers.js — 共享常量和工具函数

const SITE = 'zhipin.com';

// 参数解析：支持 --key=value 和 --key value 两种格式
// arrayGetArg(args, 'city') 从 ['--city', '101290100'] 或 ['--city=101290100'] 中取值
function getArg(args, key, defaultValue) {
  const eqIdx = args.findIndex(a => a.startsWith(`--${key}=`));
  if (eqIdx !== -1) return args[eqIdx].split('=')[1] || defaultValue;

  const spaceIdx = args.findIndex(a => a === `--${key}`);
  if (spaceIdx !== -1 && spaceIdx + 1 < args.length) {
    const val = args[spaceIdx + 1];
    if (val && !val.startsWith('--')) return val;
  }
  return defaultValue;
}

// 过滤掉所有 --options 和它们后面的值，返回纯位置参数
function positionalArgs(args) {
  const result = [];
  let skip = false;
  for (const a of args) {
    if (a.startsWith('--')) {
      if (a.includes('=')) continue;  // --key=value 整体跳过
      skip = true;  // --key value 跳过下一个值
      continue;
    }
    if (skip) { skip = false; continue; }
    result.push(a);
  }
  return result;
}

// ═══════════════════════════════════════════
// @ref 引用解析
// ═══════════════════════════════════════════

/**
 * 判断字符串是否是 @ref 引用格式
 */
function isRef(str) {
  return typeof str === 'string' && str.startsWith('@');
}

/**
 * 从缓存解析 @ref，返回完整记录。
 * 如果输入不是 ref，原样返回。
 *
 * @param {string} str - 可能是 @ref 或原始值
 * @param {import('../cache/result-cache').ResultCache} cache
 * @returns {object|null} 解析结果 { resolved: true, record: {...} } 或 { resolved: false, value: str }
 */
function resolveRef(str, cache) {
  if (!isRef(str)) return { resolved: false, value: str };

  if (!cache || !cache.isRef(str)) return { resolved: false, value: str, error: 'invalid ref format' };

  const record = cache.resolve(str);
  if (!record) return { resolved: false, value: str, error: `cache miss: ${str}` };

  return { resolved: true, record };
}

module.exports = { SITE, getArg, positionalArgs, isRef, resolveRef };
