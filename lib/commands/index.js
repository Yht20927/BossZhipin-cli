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
};
