// lib/transform.js — 数据精简层
// 从 API 原始响应中提取关键字段，删除冗余，大幅节省上下文占用
//
// 设计原则：
// - 保留后续 CLI 操作必需字段（如 securityId / encryptJobId 等联动 key）
// - 删除纯展示、冗余、或前端渲染专用字段
// - 对数组类型递归精简
// - 未匹配类型原样返回（不丢失数据）

// ── 职位列表/搜索结果 ──
function transformJob(j) {
  if (!j || typeof j !== 'object') return j;
  return {
    jobName: j.jobName,
    salaryDesc: j.salaryDesc,
    jobExperience: j.jobExperience,
    jobDegree: j.jobDegree,
    cityName: j.cityName,
    areaDistrict: j.areaDistrict,
    businessDistrict: j.businessDistrict,
    brandName: j.brandName,
    brandStageName: j.brandStageName,
    brandScaleName: j.brandScaleName,
    brandIndustry: j.brandIndustry,
    skills: j.skills,
    welfareList: j.welfareList,
    jobLabels: j.jobLabels,
    // 联动 key
    securityId: j.securityId,
    encryptJobId: j.encryptJobId,
    encryptBossId: j.encryptBossId,
    encryptBrandId: j.encryptBrandId,
    lid: j.lid,
    // 老板
    bossName: j.bossName,
    bossTitle: j.bossTitle,
    bossOnline: j.bossOnline,
    bossCert: j.bossCert,
    // 状态
    jobValidStatus: j.jobValidStatus,
    // 投递相关
    contact: j.contact,
    showTopPosition: j.showTopPosition,
  };
}

// ── 用户信息 ──
function transformUser(u) {
  if (!u || typeof u !== 'object') return u;
  return {
    userId: u.userId,
    name: u.name,
    showName: u.showName,
    token: u.token,
    identity: u.identity,
    tinyAvatar: u.tinyAvatar,
    complete: u.complete,
    studentFlag: u.studentFlag,
    encryptUserId: u.encryptUserId,
  };
}

// ── 好友/联系人 ──
function transformFriend(f) {
  if (!f || typeof f !== 'object') return f;
  return {
    name: f.name,
    title: f.bossTitle || f.title,
    brandName: f.brandName,
    jobName: f.jobName,
    jobCity: f.jobCity,
    positionName: f.positionName,
    avatar: f.avatar || f.tinyUrl,
    uid: f.uid || f.friendId,
    encryptUid: f.encryptUid || f.encryptFriendId,
    securityId: f.securityId,
    encryptJobId: f.encryptJobId,
    encryptBossId: f.encryptBossId,
    relationType: f.relationType,
    lastMsg: f.lastMsg,
    lastTime: f.lastTime,
    lastTS: f.lastTS,
    unreadMsgCount: f.unreadMsgCount,
    chatStatus: f.chatStatus,
    filtered: f.filtered,
    isTop: f.isTop,
    score: f.score,
    waterLevel: f.waterLevel,
    friendSource: f.friendSource,
  };
}

// ── 消息 ──
function transformMessage(m) {
  if (!m || typeof m !== 'object') return m;
  return {
    msgId: m.msgId,
    encryptMsgId: m.encryptMsgId,
    fromId: m.fromId,
    toId: m.toId,
    showText: m.showText,
    status: m.status,
    msgTime: m.msgTime,
    msgType: m.msgType,
    msgContent: m.msgContent,
  };
}

// ── 城市数据 ──
function transformCity(c) {
  if (!c || typeof c !== 'object') return c;
  return {
    name: c.name,
    code: c.code,
    subLevelModelList: c.subLevelModelList,
  };
}

// ── 路由 ──
function transformResult(data, type) {
  if (!data || typeof data !== 'object') return data;
  // 浏览器侧已精简过，直接透传
  if (data._t === 1) { delete data._t; return data; }

  switch (type) {
    case 'search':
    case 'recommend':
      return {
        resCount: data.resCount,
        hasMore: data.hasMore,
        lid: data.lid,
        jobList: Array.isArray(data.jobList) ? data.jobList.map(transformJob) : data.jobList,
      };

    case 'job':
      // 职位详情数据结构与搜索列表不同，做轻量精简
      return {
        jobInfo: data.jobInfo ? {
          jobName: data.jobInfo.jobName,
          salaryDesc: data.jobInfo.salaryDesc,
          jobLabels: data.jobInfo.jobLabels,
          jobExperience: data.jobInfo.jobExperience,
          jobDegree: data.jobInfo.jobDegree,
          cityName: data.jobInfo.cityName,
          areaDistrict: data.jobInfo.areaDistrict,
          businessDistrict: data.jobInfo.businessDistrict,
          address: data.jobInfo.address,
          postDescription: data.jobInfo.postDescription,
          brandName: data.jobInfo.brandName,
          brandStageName: data.jobInfo.brandStageName,
          brandScaleName: data.jobInfo.brandScaleName,
          brandIndustry: data.jobInfo.brandIndustry,
          welfareList: data.jobInfo.welfareList,
          securityId: data.securityId,
          encryptJobId: data.jobInfo.encryptJobId,
          encryptBossId: data.jobInfo.encryptBossId,
        } : null,
        bossInfo: data.bossInfo ? {
          bossName: data.bossInfo.bossName,
          bossTitle: data.bossInfo.bossTitle,
          bossOnline: data.bossInfo.bossOnline,
          bossAvatar: data.bossInfo.bossAvatar,
          activeTimeDesc: data.bossInfo.activeTimeDesc,
        } : null,
        brandComInfo: data.brandComInfo ? {
          brandName: data.brandComInfo.brandName,
          brandLogo: data.brandComInfo.brandLogo,
          brandStageName: data.brandComInfo.brandStageName,
          brandScaleName: data.brandComInfo.brandScaleName,
          brandIndustry: data.brandComInfo.brandIndustry,
        } : null,
      };

    case 'me':
      return transformUser(data);

    case 'friends':
      return {
        friendList: Array.isArray(data.friendList) ? data.friendList.map(transformFriend) : data.friendList,
        foldText: data.foldText,
        filterEncryptIdList: data.filterEncryptIdList,
      };

    case 'chat':
      return {
        hasMore: data.hasMore,
        lastId: data.lastId,
        type: data.type,
        messages: Array.isArray(data.messages) ? data.messages.map(transformMessage) : data.messages,
      };

    case 'city':
      // 注意：当 city.js 的浏览器侧 expression 已设置 _t:1 标记时（正常 CLI 路径），
      // 此分支不会执行（上方 _t:1 检查会先拦截并透传）。此分支作为防御性代码保留，
      // 用于处理 raw bridgeCall 未经过浏览器侧 transform 的场景。
      // site.json 返回 { otherCitySites, siteGroup }
      // city.json 返回 { hotCityList, locationCityList }
      if (data.siteGroup || data.otherCitySites) {
        return {
          hotCities: Array.isArray(data.otherCitySites) ? data.otherCitySites.map(transformCity) : [],
          allCities: Array.isArray(data.siteGroup) ? data.siteGroup.map(g => ({
            letter: g.firstChar,
            cities: (g.cityList || []).map(transformCity),
          })) : [],
        };
      }
      if (data.hotCityList) {
        return {
          hotCityList: data.hotCityList.map(transformCity),
          locationCityList: Array.isArray(data.locationCityList) ? data.locationCityList.map(transformCity) : data.locationCityList,
        };
      }
      return Array.isArray(data) ? data.map(transformCity) : data;

    default:
      return data;
  }
}

module.exports = { transformResult, transformJob, transformUser, transformFriend, transformMessage };
