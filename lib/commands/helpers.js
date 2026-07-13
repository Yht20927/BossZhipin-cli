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

module.exports = { SITE, getArg, positionalArgs };
