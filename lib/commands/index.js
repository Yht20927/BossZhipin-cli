// lib/commands/index.js — 命令注册表

const { search } = require('./search');
const { job } = require('./job');
const { me } = require('./me');
const { friends } = require('./friends');
const { chat } = require('./chat');
const { city } = require('./city');
const { recommend } = require('./recommend');
const { filters } = require('./filters');
const { industries } = require('./industries');
const { resume } = require('./resume');
const { expect } = require('./expect');
const { contact } = require('./contact');
const { greetBatch } = require('./greet-batch');
const { llmGreet } = require('./llm-greet');
const { llmStats } = require('./llm-stats');
const { token } = require('./token');
const { refresh } = require('./refresh');

module.exports = {
  search,
  job,
  me,
  friends,
  chat,
  city,
  recommend,
  filters,
  industries,
  resume,
  expect,
  contact,
  'greet-batch': greetBatch,
  'llm-greet': llmGreet,
  'llm-stats': llmStats,
  token,
  refresh,
};
