// lib/pipeline/index.js — 数据管线框架
//
// 提供可组合的 Pipeline 类，对职位列表等数据进行
// filter → map → sort → enrich → dedup 管线处理。

/**
 * Pipeline — 可链式组合的数据处理管线。
 *
 * 用法：
 *   const pipe = new Pipeline()
 *     .filter(j => j.salaryDesc && !j.salaryDesc.includes('面议'))
 *     .sort((a, b) => salaryMin(b) - salaryMin(a))
 *     .limit(20);
 *   const filtered = pipe.run(searchResult.jobList);
 */
class Pipeline {
  constructor() {
    this._stages = [];
  }

  /** 添加过滤阶段 */
  filter(fn) {
    this._stages.push({ type: 'filter', fn });
    return this;
  }

  /** 添加映射阶段 */
  map(fn) {
    this._stages.push({ type: 'map', fn });
    return this;
  }

  /** 添加排序阶段（传入比较器函数） */
  sort(comparator) {
    this._stages.push({ type: 'sort', comparator });
    return this;
  }

  /** 截断结果集 */
  limit(n) {
    this._stages.push({ type: 'limit', n });
    return this;
  }

  /** 按 key 去重 */
  dedup(keyFn) {
    this._stages.push({ type: 'dedup', keyFn });
    return this;
  }

  /** 富化（对每个元素执行 fn，修改原对象或返回新对象） */
  enrich(fn) {
    this._stages.push({ type: 'enrich', fn });
    return this;
  }

  /**
   * 执行管线
   * @param {Array} data
   * @returns {Array}
   */
  run(data) {
    if (!Array.isArray(data)) return data;
    let result = data;

    for (const stage of this._stages) {
      switch (stage.type) {
        case 'filter':
          result = result.filter(stage.fn);
          break;
        case 'map':
          result = result.map(stage.fn);
          break;
        case 'sort':
          result = [...result].sort(stage.comparator);
          break;
        case 'limit':
          result = result.slice(0, stage.n);
          break;
        case 'dedup': {
          const seen = new Set();
          result = result.filter(item => {
            const key = stage.keyFn(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          break;
        }
        case 'enrich':
          for (const item of result) stage.fn(item);
          break;
      }
    }
    return result;
  }

  /** 获取当前阶段数 */
  get stageCount() {
    return this._stages.length;
  }
}

module.exports = { Pipeline };
