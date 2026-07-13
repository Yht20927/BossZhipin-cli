// lib/expression.js — Expression Builder：安全构建浏览器侧 JS 表达式
//
// 统一所有命令的 expression 构建逻辑，消除字符串拼接中的注入风险，
// 并提取共享的浏览器侧数据精简 transformers（.then() 链）。

/**
 * 构建浏览器侧 eval 表达式。
 *
 * 用法：
 *   new ExpressionBuilder()
 *     .call('search', { query: 'python', city: '100010000' })
 *     .then(ExpressionBuilder.TRANSFORMS.jobList)
 *     .build()
 *
 * 生成：
 *   window.__bridge.search({"query":"python","city":"100010000"})
 *     .then(function(r){...jobList transform...})
 */
class ExpressionBuilder {
  constructor() {
    this._parts = [];
  }

  /**
   * 调用 __bridge 方法（每个参数独立 JSON.stringify，防止注入）
   * @param {string} method - __bridge 方法名
   * @param {...any} args - 方法参数
   */
  call(method, ...args) {
    const serializedArgs = args.map(a => JSON.stringify(a)).join(', ');
    this._parts.push(`window.__bridge.${method}(${serializedArgs})`);
    return this;
  }

  /**
   * 调用 __bridge 方法（传入单个对象参数）
   * @param {string} method
   * @param {object} params
   */
  callObj(method, params) {
    this._parts.push(`window.__bridge.${method}(${JSON.stringify(params)})`);
    return this;
  }

  /**
   * 追加 .then() 链（浏览器侧数据精简）
   * @param {string} fnBody - .then(function(r){ ... }) 的函数体
   */
  then(fnBody) {
    this._parts.push(`.then(function(r){${fnBody}})`);
    return this;
  }

  /** 构建最终表达式字符串 */
  build() {
    return this._parts.join('');
  }
}

// ── 共享的浏览器侧 transformers ──
// 每个 transformer 是 .then(function(r){ ... }) 的函数体（不含 function(r){ 包裹）。
// 输出必须返回 { code: 0, message: "Success", zpData: { _t: 1, ... } } 格式。

const _T1 = '_t:1'; // 浏览器侧已精简标记

ExpressionBuilder.TRANSFORMS = {
  /** 职位列表精简（search / recommend 共用） */
  jobList: [
    `if(!r||r.code!==0)return r;`,
    `var d=r.zpData;`,
    `return{code:0,message:"Success",zpData:{${_T1},`,
      `resCount:d.resCount,hasMore:d.hasMore,lid:d.lid,`,
      `jobList:(d.jobList||[]).map(function(j){`,
        `return{jobName:j.jobName,salaryDesc:j.salaryDesc,`,
        `jobExperience:j.jobExperience,jobDegree:j.jobDegree,`,
        `cityName:j.cityName,areaDistrict:j.areaDistrict,`,
        `businessDistrict:j.businessDistrict,brandName:j.brandName,`,
        `brandStageName:j.brandStageName,brandScaleName:j.brandScaleName,`,
        `brandIndustry:j.brandIndustry,skills:j.skills,`,
        `welfareList:j.welfareList,jobLabels:j.jobLabels,`,
        `securityId:j.securityId,encryptJobId:j.encryptJobId,`,
        `encryptBossId:j.encryptBossId,lid:j.lid,`,
        `bossName:j.bossName,bossTitle:j.bossTitle,`,
        `bossOnline:j.bossOnline,jobValidStatus:j.jobValidStatus,`,
        `contact:j.contact}`,
      `})}}`,
  ].join(''),

  /** 职位详情精简 */
  jobDetail: [
    `if(!r||r.code!==0)return r;var d=r.zpData;`,
    `return{code:0,message:"Success",zpData:{${_T1},`,
      `jobInfo:(d.jobInfo?{jobName:d.jobInfo.jobName,salaryDesc:d.jobInfo.salaryDesc,jobLabels:d.jobInfo.jobLabels,jobExperience:d.jobInfo.jobExperience,jobDegree:d.jobInfo.jobDegree,cityName:d.jobInfo.cityName,areaDistrict:d.jobInfo.areaDistrict,businessDistrict:d.jobInfo.businessDistrict,address:d.jobInfo.address,postDescription:d.jobInfo.postDescription,brandName:d.jobInfo.brandName,brandStageName:d.jobInfo.brandStageName,brandScaleName:d.jobInfo.brandScaleName,brandIndustry:d.jobInfo.brandIndustry,welfareList:d.jobInfo.welfareList}:null),`,
      `bossInfo:(d.bossInfo?{bossName:d.bossInfo.bossName,bossTitle:d.bossInfo.bossTitle,bossOnline:d.bossInfo.bossOnline,activeTimeDesc:d.bossInfo.activeTimeDesc}:null),`,
      `brandComInfo:(d.brandComInfo?{brandName:d.brandComInfo.brandName,brandStageName:d.brandComInfo.brandStageName,brandScaleName:d.brandComInfo.brandScaleName,brandIndustry:d.brandComInfo.brandIndustry}:null)}}`,
  ].join(''),

  /** 好友列表精简 */
  friendList: [
    `if(!r||r.code!==0)return r;var d=r.zpData;`,
    `return{code:0,message:"Success",zpData:{${_T1},`,
      `friendList:(d.friendList||[]).map(function(f){`,
        `return{name:f.name,title:f.bossTitle||f.title,`,
        `brandName:f.brandName,jobName:f.jobName,jobCity:f.jobCity,`,
        `positionName:f.positionName,uid:f.uid||f.friendId,`,
        `encryptUid:f.encryptUid||f.encryptFriendId,`,
        `securityId:f.securityId,encryptJobId:f.encryptJobId,`,
        `encryptBossId:f.encryptBossId,lastMsg:f.lastMsg,`,
        `lastTime:f.lastTime,unreadMsgCount:f.unreadMsgCount,`,
        `chatStatus:f.chatStatus,score:f.score,`,
        `waterLevel:f.waterLevel,friendSource:f.friendSource}`,
      `}),`,
      `foldText:d.foldText}}`,
  ].join(''),

  /** 城市数据精简 */
  cityList: [
    `if(!r||r.code!==0)return r;var d=r.zpData;`,
    `return{code:0,message:"Success",zpData:{${_T1},`,
      `hotCities:(d.otherCitySites||[]).map(function(c){return{name:c.name,code:c.code}}),`,
      `allCities:(d.siteGroup||[]).map(function(g){`,
        `return{letter:g.firstChar,cities:(g.cityList||[]).map(function(c){return{name:c.name,code:c.code}})}`,
      `})}}`,
  ].join(''),
};

module.exports = { ExpressionBuilder };
