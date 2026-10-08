/* 圈人助手 · 交互演示
 * 交互参考 SQLess 选品助手：左侧对话 + 右侧结果面板。
 * 所有人群、SQL、规模与收益均为模拟数据，不连接真实数据服务。 */
(function (root) {
'use strict';

/* ---------------- 模型（纯函数，供测试） ---------------- */
const TAGS = {
  14520: { name: '品类偏好序列 Top10', level: '受控', table: 'dws_ecom_cate_pref_df' },
  14501: { name: '电商消费力分层', level: '受控', table: 'dws_ecom_consume_level_df' },
  14572: { name: '加购收藏活跃度', level: '通用', table: 'dws_ecom_cart_active_df' },
  14610: { name: '品类兴趣（LLM 侧写）', level: '通用', table: 'dwd_llm_cate_interest_di' },
  14560: { name: '退货退款率分层', level: '受控', table: 'dws_ecom_refund_rate_df' },
  14533: { name: '活跃天数分层（近 30 天）', level: '通用', table: 'dws_ecom_active_days_df' },
  14578: { name: '大促敏感度分层', level: '受控', table: 'dws_ecom_promo_sens_df' },
  14618: { name: '到店品类偏好', level: '通用', table: 'dws_life_cate_pref_df' },
  14624: { name: '常驻商圈分层', level: '高敏', table: 'dwd_life_geo_zone_di' },
  14612: { name: '团购券核销率', level: '通用', table: 'dws_life_coupon_redeem_df' },
  14580: { name: '生服到店消费频次', level: '受控', table: 'dws_life_visit_freq_df' },
  14660: { name: '跨域消费力融合分', level: '高敏', table: 'dwd_xd_consume_fusion_di' },
  14606: { name: '到店客单价分层', level: '受控', table: 'dws_life_aov_level_df' },
  14555: { name: '聚合类目分布（脱敏）', level: '开放', table: 'ads_ecom_cate_dist_df' },
  14566: { name: '客单价分层', level: '通用', table: 'dws_ecom_aov_level_df' },
  14630: { name: '到店时段偏好（脱敏）', level: '开放', table: 'ads_life_time_dist_df' },
};
/* 无权限时「使用其他标签」的替代关系；null 表示直接去掉该条件 */
const ALT = { 14520: 14555, 14501: 14566, 14578: 14572, 14580: 14612, 14660: 14566, 14606: 14612, 14560: null, 14624: 14630 };
const GROUPS = [['must', '必须满足'], ['any', '任一满足'], ['exclude', '排除']];

const SCENES = {
  recall: {
    match: /召回|流失|沉默|没有下单|没下单|未购/, title: '美妆沉默老客召回', base: 412000,
    questions: [
      { id: 'history', title: '"老客"按多长的购买历史算？', why: '历史窗口越长，老客范围越大', options: ['近 180 天买过美妆', '近 365 天买过美妆'] },
      { id: 'dormant', title: '多久没下单算"沉默"？', why: '沉默窗口决定召回范围，原话没有给出天数', options: ['近 30 天未下单', '近 60 天未下单'], pick: 1 },
    ],
    conditions: (a) => [
      { group: 'must', tag: 14520, value: a.history },
      { group: 'must', tag: 14533, value: a.dormant },
      { group: 'any', tag: 14578, value: '大促敏感度 高 / 中' },
      { group: 'exclude', tag: 14560, value: '退货退款率 高' },
    ],
    cases: [['美妆沉默老客召回', '宽口径', '回访率 +3.4%', 'LR 文档 · 2026-06 美妆召回'], ['个护老客券包召回', '窄口径', '核销率 +5.2%，覆盖 -61%', 'LR 文档 · 2026-03 个护召回']],
  },
  local: {
    match: /到店|门店|火锅|商圈/, title: '火锅门店周边获客', base: 96000,
    questions: [
      { id: 'area', title: '门店能服务到哪个范围？', why: '范围决定人群能否真的到店', options: ['上海市（城市级）', '门店周边 3 公里'] },
      { id: 'window', title: '兴趣按多长时间看？', why: '时间窗口会改变入选范围', options: ['近 30 天', '近 90 天'] },
    ],
    conditions: (a) => [
      { group: 'must', tag: 14618, value: `${a.window}偏好：火锅 / 川渝菜` },
      { group: 'must', tag: 14624, value: a.area },
      { group: 'any', tag: 14612, value: '团购券核销率 ≥ 中' },
      { group: 'exclude', tag: 14580, value: '近 30 天已到店本门店' },
    ],
    cases: [['商圈火锅新客获客', '窄口径', '到店核销 +1.8%', 'LR 文档 · 2026-07 生服到店']],
  },
  cross: {
    match: /跨域|高价值|双域/, title: '跨域潜在高价值用户', base: 153000,
    questions: [
      { id: 'level', title: '"生服消费较高"怎么定义？', why: '两个口径的人群规模相差约一倍', options: ['到店客单价 L4 及以上', '到店客单价 L3 及以上'] },
    ],
    conditions: (a) => [
      { group: 'must', tag: 14660, value: '融合分 ≥ 0.7' },
      { group: 'must', tag: 14501, value: '电商消费分层 L1–L2' },
      { group: 'any', tag: 14606, value: a.level },
    ],
    cases: [['电商低消、生服高消人群拉新', '宽口径', '跨域首单 +1.3%', 'LR 文档 · 2026-05 双域拉新']],
  },
  brand: {
    match: /./, title: '羽绒服新品推广人群', base: 268000,
    questions: [
      { id: 'window', title: '行为观察窗口用多久？', why: '时间窗口会直接改变入选范围', options: ['近 30 天', '近 90 天'], pick: 1 },
      { id: 'spend', title: '"中高消费"按哪个口径？', why: '类目内购买力和全平台购买力可能不同', options: ['服饰类目消费分层 L3 及以上', '全平台消费分层 L3 及以上'] },
    ],
    conditions: (a) => [
      { group: 'must', tag: 14520, value: `${a.window}购买：服饰 > 羽绒服 / 外套` },
      { group: 'must', tag: 14501, value: a.spend },
      { group: 'any', tag: 14572, value: `${a.window}加购或收藏羽绒服` },
      { group: 'any', tag: 14610, value: '羽绒服兴趣 ≥ 中' },
      { group: 'exclude', tag: 14560, value: '退货退款率 高' },
    ],
    cases: [['秋冬服饰新品推广', '宽口径', '券核销率 +2.1%', 'LR 文档 · 2026-08 服饰秋上新'], ['羽绒服双 11 预热', '窄口径', '转化率 +4.6%，覆盖 -58%', 'LR 文档 · 2025-11 大促预热']],
  },
};
const EXAMPLES = [
  ['新品推广', '给波司登找对羽绒服感兴趣、近 90 天有服饰消费、中高消费能力的用户，用于新品推广'],
  ['老客召回', '召回买过美妆、但最近一段时间没有下单的老用户，排除高退货人群'],
  ['门店获客', '为上海一家火锅门店找有火锅偏好、可能到店的潜在新客'],
  ['跨域高价值', '圈出电商消费较低、但生服消费较高的潜在高价值用户'],
];

function detect(query) { return Object.keys(SCENES).find((k) => SCENES[k].match.test(query)); }
function defaultAnswers(scene) {
  return Object.fromEntries(SCENES[scene].questions.map((q) => [q.id, q.options[q.pick || 0]]));
}
function buildConditions(task) {
  const list = SCENES[task.scene].conditions(task.answers).map((c) => ({ ...c }));
  if (task.scope === 'narrow') list.push({ group: 'must', tag: null, name: '行为频次（平台规则）', value: '核心行为至少 2 次' });
  return list
    .filter((c) => !task.removed.includes(c.tag))
    .map((c) => {
      const swap = c.tag ? task.swapped[c.tag] : undefined;
      if (swap === null) return null;
      return swap ? { ...c, tag: swap, value: c.value + '（替代口径）', replaced: c.tag } : c;
    })
    .filter(Boolean);
}
function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; }
function estimate(task, scope = task.scope) {
  let n = SCENES[task.scene].base * (1 + (hash(task.id) % 13) / 100);
  if (scope === 'narrow') n *= 0.38;
  if (Object.values(task.answers).some((v) => /30 天|3 公里|L4|180 天/.test(v))) n *= 0.6;
  n *= Math.pow(0.9, Object.keys(task.swapped).length);
  n = Math.round(n / 10) * 10;
  return task.target && task.target < n ? task.target : n;
}
function tagName(c) { return c.tag ? TAGS[c.tag].name : c.name; }
function buildSql(task, conds) {
  const rows = conds.filter((c) => c.tag).map((c) => ({ ...c, value: c.value.replace('（替代口径）', '') }));
  const alias = (i) => 't' + (i + 1);
  const lines = ['SELECT u.user_id', 'FROM   dim_user_base u'];
  rows.forEach((c, i) => {
    if (c.group !== 'exclude') lines.push(`${c.group === 'any' ? 'LEFT JOIN' : 'JOIN'} ${TAGS[c.tag].table} ${alias(i)} ON ${alias(i)}.user_id = u.user_id`);
  });
  lines.push("WHERE  u.date = '2026-09-28'");
  const any = [];
  rows.forEach((c, i) => {
    if (c.group === 'must') lines.push(`  AND ${alias(i)}.label IN ('${c.value}')`);
    if (c.group === 'any') any.push(`${alias(i)}.label IN ('${c.value}')`);
    if (c.group === 'exclude') lines.push(`  AND NOT EXISTS (SELECT 1 FROM ${TAGS[c.tag].table} x WHERE x.user_id = u.user_id AND x.label = '${c.value}')`);
  });
  if (any.length) lines.push(`  AND (${any.join('\n       OR ')})`);
  if (task.scope === 'narrow') lines.push('  AND u.core_action_cnt >= 2');
  lines.push(`LIMIT  ${estimate(task)};`);
  return lines.join('\n');
}
function newTask(query) {
  const scene = detect(query);
  const id = 'AUD-' + Date.now().toString(36).toUpperCase();
  return {
    id, scene, query, title: SCENES[scene].title, created: new Date().toISOString(), updated: new Date().toISOString(),
    version: 1, answers: defaultAnswers(scene), scope: 'wide', target: null, seedCheck: false,
    removed: [], swapped: {}, granted: [], result: null, reportReady: false, periodic: false,
    effects: [], saved: false, messages: [],
  };
}
const Model = { TAGS, ALT, SCENES, detect, defaultAnswers, buildConditions, estimate, buildSql, newTask };
if (typeof module !== 'undefined' && module.exports) { module.exports = Model; return; }

/* ---------------- 界面 ---------------- */
const KEY = 'utup.audience.agent.v2';
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('zh-CN');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ICON = {
  spark: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2 5.6 5.6 2-5.6 2L10 16.7l-2-5.6-5.6-2 5.6-2z"/></svg>',
  plus: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4v12M4 10h12"/></svg>',
  task: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h12M4 10h12M4 15h8"/></svg>',
  tag: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10.5V4h6.5l7 7-6.5 6.5z"/><circle cx="6.5" cy="7.5" r="1"/></svg>',
  book: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h5a2 2 0 012 2v10a2 2 0 00-2-2H4zM16 4h-5a2 2 0 00-2 2v10a2 2 0 012-2h5z"/></svg>',
  lock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 016 0V9"/></svg>',
  check: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.5"/><path d="M6.8 10.2l2.2 2.2 4.2-4.4"/></svg>',
  info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v5M10 13.5v.5"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l3 2"/></svg>',
  cycle: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15.5 8A6 6 0 004.6 6.5M4.5 12a6 6 0 0010.9 1.5M4 3v3.5h3.5M16 17v-3.5h-3.5"/></svg>',
  filter: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h14l-5.5 6.5V16l-3-1.5v-4z"/></svg>',
  people: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3M13 4.6a2.6 2.6 0 010 4.8M14.5 11.9c1.6.5 2.7 1.8 3 4.1"/></svg>',
  chev: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 5l5 5-5 5"/></svg>',
  send: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 10l14-6-5 14-2.5-5.5z"/></svg>',
  side: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12"/></svg>',
};

let host = null, options = {}, tasks = [], activeId = null, view = 'home', busy = false;
let draft = '', sidebarOpen = true, panel = { open: false, tab: 'detail', full: false }, toast = '';
let page = 1, reportTimer = null, lastCount = 0;

function load() { try { tasks = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { tasks = []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch { /* 存储不可用时只保留在本次页面 */ } }
const current = () => tasks.find((t) => t.id === activeId);
function notify(text) { toast = text; render(); setTimeout(() => { if (toast === text) { toast = ''; render(); } }, 2600); }

function tagState(id) {
  if (options.portal?.tagState) return options.portal.tagState(id) || { code: 'apply', label: '可申请' };
  return ['受控', '高敏'].includes(TAGS[id].level) ? { code: 'apply', label: '可申请' } : { code: 'active', label: '可使用' };
}
/* 开放 / 通用级标签自助申请、平台自动通过；只有受控 / 高敏标签需要走审批 */
const needsApproval = (id) => ['受控', '高敏'].includes(TAGS[id].level);
function shownState(task, id) {
  if (task.granted.includes(id)) return { code: 'active', label: '已开通（演示）' };
  const st = tagState(id);
  return st.code !== 'active' && !needsApproval(id) ? { code: 'active', label: '自助开通' } : st;
}
function missingTags(task) {
  const ids = [...new Set(buildConditions(task).map((c) => c.tag).filter(Boolean))];
  return ids.filter((id) => shownState(task, id).code !== 'active');
}

/* ---- 消息与步骤 ---- */
function push(task, msg) { msg.id = msg.id || Math.random().toString(36).slice(2, 9); task.messages.push(msg); task.updated = new Date().toISOString(); save(); render(); return msg; }
async function runSteps(task, msg, key) {
  for (const step of msg[key]) {
    if (step.status === 'done') continue;
    step.status = 'running'; save(); render();
    await wait(520);
    step.status = 'done'; save(); render();
  }
}

async function start(query) {
  const q = query.trim();
  if (!q || busy) return;
  const task = newTask(q);
  tasks.unshift(task); activeId = task.id; view = 'task'; draft = ''; panel = { open: false, tab: 'detail', full: false };
  busy = true;
  push(task, { type: 'user', text: q });
  const ack = push(task, { type: 'ack', open: true, steps: [
    { title: '理解需求', detail: `识别为「${task.title}」，保留业务原话`, status: 'wait' },
    { title: '检索历史策略', detail: `找到 ${SCENES[task.scene].cases.length} 份相似策略，可引用 LR 回收结果`, status: 'wait' },
    { title: '匹配标签资产', detail: '从标签广场匹配可用于圈选的标签', status: 'wait' },
  ] });
  await runSteps(task, ack, 'steps');
  ack.open = false;
  push(task, { type: 'clarify', answered: false });
  busy = false; render();
}

async function confirmClarify(task, msg) {
  if (busy) return;
  msg.answered = true;
  push(task, { type: 'user', text: SCENES[task.scene].questions.map((q) => `${q.title.replace(/？$/, '')}：${task.answers[q.id]}`).join('\n') });
  busy = true;
  const ack = push(task, { type: 'ack', open: true, steps: [{ title: '生成圈选条件', detail: '把业务口径映射为标签条件，保留必须 / 任一 / 排除关系', status: 'wait' }] });
  await runSteps(task, ack, 'steps');
  ack.open = false;
  push(task, { type: 'conditions', version: task.version, confirmed: false });
  busy = false; render();
}

async function confirmConditions(task, msg) {
  if (busy) return;
  msg.confirmed = true;
  const lack = missingTags(task);
  if (lack.length) { push(task, { type: 'permission', ids: lack, status: 'pending' }); return; }
  await execute(task);
}

async function execute(task) {
  busy = true;
  const tables = [...new Set(buildConditions(task).filter((c) => c.tag).map((c) => c.tag))];
  const msg = push(task, { type: 'exec', version: task.version, open: true, openAnalysis: true,
    steps: [
      { title: '生成圈选 SQL', tab: 'sql', status: 'wait' },
      { title: '圈选人群', tab: 'detail', status: 'wait' },
      { title: '同步人群报告生产数据', tab: 'report', status: 'wait' },
    ],
    analysis: [
      { title: '获取数据', detail: '按确认的条件读取标签表；通用级标签已自助开通', tables, tab: 'conditions', status: 'wait' },
      { title: '脚本分析', detail: '统计人群规模、消费分层、城市线级与年龄分布', tab: 'overview', status: 'wait' },
      { title: '报告生成', detail: '生成人群画像报告，对比历史相似策略', tab: 'report', status: 'wait' },
    ] });
  await runSteps(task, msg, 'steps');
  task.result = { size: estimate(task), version: task.version, at: new Date().toLocaleString('zh-CN', { hour12: false }), taskCode: String(6958700000 + hash(task.id + task.version)).slice(0, 10), packId: 'PKG-' + (hash(task.id) + task.version * 7), scope: task.scope, conds: buildConditions(task), sql: buildSql(task, buildConditions(task)) };
  task.reportReady = false;
  await runSteps(task, msg, 'analysis');
  msg.open = false; msg.openAnalysis = false;
  push(task, { type: 'result', version: task.version });
  busy = false;
  panel = { open: true, tab: 'detail', full: false }; page = 1;
  render();
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => { const t = tasks.find((x) => x.id === task.id); if (t && t.result?.version === task.version) { t.reportReady = true; save(); render(); } }, 8000);
}

async function applyPermission(task, msg) {
  msg.status = 'applied'; save();
  if (options.portal?.applyTags) { options.portal.applyTags(msg.ids); return; }
  if (options.onMarket) { options.onMarket(); return; }
  notify('已加入标签广场的待选择清单（演示）');
}
async function useOtherTags(task, msg) {
  if (busy) return;
  msg.status = 'fallback';
  for (const id of msg.ids) { const alt = ALT[id]; task.swapped[id] = alt && shownState(task, alt).code === 'active' ? alt : null; }
  task.version += 1;
  push(task, { type: 'user', text: '由于部分标签暂无权限，改用可直接使用的标签替代，继续圈选。' });
  push(task, { type: 'conditions', version: task.version, confirmed: false, note: '已用可直接使用的标签替代无权限标签，人群规模会有变化，请确认后执行。' });
}
async function grantAndRun(task, msg) {
  if (busy) return;
  msg.status = 'granted';
  task.granted.push(...msg.ids);
  push(task, { type: 'user', text: '标签权限已开通，继续执行。' });
  await execute(task);
}

function modify(task, text) {
  if (busy) return;
  task.version += 1;
  let note = '已保留上一版条件，调整后请确认执行。';
  if (text) {
    push(task, { type: 'user', text });
    if (/窄/.test(text)) { task.scope = 'narrow'; note = '已切换为窄口径。'; }
    if (/宽/.test(text)) { task.scope = 'wide'; note = '已切换为宽口径。'; }
    const m = text.match(/(\d+(?:\.\d+)?)\s*(万)?\s*人/);
    if (m) { task.target = Math.round(parseFloat(m[1]) * (m[2] ? 10000 : 1)); note = `目标规模调整为 ${fmt(task.target)} 人。`; }
  }
  push(task, { type: 'conditions', version: task.version, confirmed: false, note });
}

/* ---------------- 渲染 ---------------- */
function render() {
  if (!host || !host.isConnected) return;
  const stream = host.querySelector('.qa-stream');
  const task = current();
  // 有新消息时总是滚到底部；其余重绘保持用户当前的滚动位置
  const count = task ? task.messages.length : 0;
  const stick = !stream || count !== lastCount || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
  lastCount = count;
  const prevTop = stream ? stream.scrollTop : 0;
  const focusId = document.activeElement && host.contains(document.activeElement) ? document.activeElement.id : null;
  const showPanel = view === 'task' && task && panel.open && task.result;
  host.innerHTML = `<div class="qa ${sidebarOpen ? '' : 'qa-side-closed'} ${showPanel ? 'qa-with-panel' : ''} ${showPanel && panel.full ? 'qa-panel-full' : ''}">
    ${sidebar()}
    <section class="qa-chat">${view === 'center' ? taskCenter() : view === 'task' && task ? chat(task) : home()}</section>
    ${showPanel ? resultPanel(task) : ''}
    ${toast ? `<div class="qa-toast" role="status">${esc(toast)}</div>` : ''}
  </div>`;
  const s = host.querySelector('.qa-stream');
  if (s) s.scrollTop = stick ? s.scrollHeight : prevTop;
  if (focusId) { const n = host.querySelector('#' + focusId); if (n) { n.focus(); if (n.setSelectionRange && n.value) n.setSelectionRange(n.value.length, n.value.length); } }
}

function sidebar() {
  const list = tasks.map((t) => `<button type="button" class="qa-hist ${t.id === activeId && view === 'task' ? 'on' : ''}" data-act="open" data-id="${t.id}" title="${esc(t.query)}"><span>${esc(t.title)}</span><em>圈人</em></button>`).join('');
  return `<aside class="qa-side">
    <div class="qa-side-head"><span class="qa-brand"><i>${ICON.spark}</i>圈人助手</span><button type="button" class="qa-icon-btn" data-act="toggle-side" aria-label="${sidebarOpen ? '收起' : '展开'}侧栏">${ICON.side}</button></div>
    <nav class="qa-side-nav">
      <button type="button" data-act="new" class="${view === 'home' ? 'on' : ''}">${ICON.plus}<span>新建对话</span></button>
      <button type="button" data-act="center" class="${view === 'center' ? 'on' : ''}">${ICON.task}<span>圈人任务中心</span></button>
      <button type="button" data-act="kb" class="is-soon">${ICON.book}<span>策略知识库</span><em>规划中</em></button>
    </nav>
    <div class="qa-side-title">历史对话</div>
    <div class="qa-hist-list">${list || '<p class="qa-muted">暂无历史对话</p>'}</div>
  </aside>`;
}

function home() {
  return `<div class="qa-home">
    <div class="qa-home-hero"><span class="qa-logo-lg">${ICON.spark}</span><h2>今天想圈哪些人？</h2><p>用一句话描述业务目标，我会追问关键口径、匹配标签、检查权限，并生成可复核的人群包。</p></div>
    ${composer('描述你的圈人需求，建议包含：业务目标、目标人群特征、时间范围、消费口径、排除人群、目标规模', '开始圈人')}
    <div class="qa-examples">${EXAMPLES.map(([k, v]) => `<button type="button" data-act="example" data-q="${esc(v)}"><b>${k}</b><span>${esc(v)}</span></button>`).join('')}</div>
    <p class="qa-foot">演示环境 · 人群、规模与收益均为模拟数据</p>
  </div>`;
}

function composer(placeholder, label) {
  return `<div class="qa-composer"><textarea id="qa-input" rows="3" placeholder="${esc(placeholder)}" ${busy ? 'disabled' : ''}>${esc(draft)}</textarea>
    <div class="qa-composer-foot"><span class="qa-muted">Enter 发送 · Shift + Enter 换行</span><button type="button" class="qa-send" data-act="send" ${busy || !draft.trim() ? 'disabled' : ''}>${ICON.send}${label}</button></div></div>`;
}

function chat(task) {
  const last = task.messages[task.messages.length - 1];
  const chips = task.result && !busy && last?.type === 'result'
    ? `<div class="qa-chips"><button type="button" data-act="modify">${ICON.filter}修改圈选条件 ${ICON.chev}</button><button type="button" data-act="panel" data-tab="effect">效果回收 ${ICON.chev}</button><button type="button" data-act="save-template">${task.saved ? '已存为模板' : '保存为模板'}</button></div>` : '';
  return `<header class="qa-chat-head"><h1 title="${esc(task.query)}">${esc(task.title)}</h1>${task.result && !panel.open ? `<button type="button" class="qa-link" data-act="panel" data-tab="detail">查看人群结果</button>` : ''}</header>
    <div class="qa-stream"><div class="qa-date">${esc(new Date(task.created).toLocaleString('zh-CN', { hour12: false }).slice(0, 16))}</div>
      ${task.messages.map((m) => message(task, m)).join('')}
      ${busy ? '<div class="qa-typing"><i></i><i></i><i></i></div>' : ''}
    </div>
    <div class="qa-bottom">${chips}${composer('您也可以用自然语言调整，例如：改成窄口径、目标规模 5 万人、排除近 7 天已触达用户', '发送')}</div>`;
}

function bot(inner) { return `<div class="qa-bot"><div class="qa-bot-name"><span class="qa-logo">${ICON.spark}</span>圈人助手</div>${inner}</div>`; }
function stepIcon(s) { return s === 'done' ? `<i class="qa-si done">${ICON.check}</i>` : s === 'running' ? '<i class="qa-si run"></i>' : `<i class="qa-si wait">${ICON.clock}</i>`; }
function steps(msg, key, label, openKey) {
  const list = msg[key], done = list.filter((s) => s.status === 'done').length;
  return `<details class="qa-proc" data-msg="${msg.id}" data-open="${openKey}" ${msg[openKey] ? 'open' : ''}><summary>${done === list.length ? ICON.check : ICON.info}<span>${label} ${done}/${list.length}</span></summary>
    <ol>${list.map((s) => `<li>${s.tab && s.status === 'done' ? `<button type="button" data-act="panel" data-tab="${s.tab}">` : '<div>'}${stepIcon(s.status)}<span><b>${esc(s.title)}</b>${s.detail ? '：' + esc(s.detail) : ''}${s.tables ? s.tables.map((id) => `<small class="qa-table-ref">选表：<code>${TAGS[id].table}</code><em class="${shownState(current(), id).code === 'active' ? 'ok' : ''}">${esc(shownState(current(), id).label)}</em></small>`).join('') : ''}</span>${s.tab && s.status === 'done' ? ICON.chev + '</button>' : '</div>'}</li>`).join('')}</ol></details>`;
}

function message(task, m) {
  if (m.type === 'user') return `<div class="qa-user"><div class="qa-user-name">你<span class="qa-avatar">U</span></div><div class="qa-bubble">${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
  if (m.type === 'ack') return bot(`<p>已收到你的消息，我将立即开始处理</p>${steps(m, 'steps', '查看分析过程', 'open')}`);
  if (m.type === 'clarify') return bot(clarifyCard(task, m));
  if (m.type === 'conditions') return bot(conditionsCard(task, m));
  if (m.type === 'permission') return bot(permissionCard(task, m));
  if (m.type === 'exec') return bot(`<p>已提交确认，开始圈选</p>${steps(m, 'steps', '执行完成', 'open')}${steps(m, 'analysis', '查看分析过程', 'openAnalysis')}`);
  if (m.type === 'result') return bot(resultCard(task, m));
  return '';
}

function clarifyCard(task, m) {
  const qs = SCENES[task.scene].questions;
  return `<p>有 ${qs.length} 个口径会改变入选范围，需要你确认，其他信息直接按原话处理：</p>
  <div class="qa-card"><div class="qa-card-title">${ICON.info}关键口径确认</div>
    ${qs.map((q) => `<div class="qa-q"><b>${esc(q.title)}</b><small>${esc(q.why)}</small><div class="qa-opts">${q.options.map((o) => `<button type="button" class="${task.answers[q.id] === o ? 'on' : ''}" data-act="answer" data-q="${q.id}" data-v="${esc(o)}" ${m.answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`).join('')}
    <div class="qa-card-foot">${m.answered ? `<span class="qa-done">${ICON.check}已确认</span>` : `<button type="button" class="qa-primary" data-act="clarify-ok" data-msg="${m.id}" ${busy ? 'disabled' : ''}>确认口径，生成条件</button>`}</div></div>`;
}

function conditionsCard(task, m) {
  const live = !m.confirmed && m.version === task.version;
  const conds = buildConditions(task), lack = missingTags(task);
  const row = (c) => `<div class="qa-cond" title="${c.tag ? esc(TAGS[c.tag].table) : '平台规则'}"><span class="k">${esc(tagName(c))}</span><span class="v">${esc(c.value)}</span>${c.tag && lack.includes(c.tag) ? `<span class="qa-lock" title="暂无权限">${ICON.lock}</span>` : ''}${live && c.tag ? `<button type="button" class="qa-x" data-act="remove" data-tag="${c.tag}" aria-label="移除 ${esc(tagName(c))}">×</button>` : ''}</div>`;
  const size = (s) => fmt(estimate(task, s));
  return `${m.note ? `<p>${esc(m.note)}</p>` : '<p>根据你的需求，整理出以下圈选条件：</p>'}
  <div class="qa-card qa-cond-card ${live ? '' : 'is-frozen'}">
    ${GROUPS.map(([g, label], i) => { const rows = conds.filter((c) => c.group === g); return rows.length ? `<div class="qa-card-title">${[ICON.cycle, ICON.filter, ICON.filter][i]}${label}<small>${g === 'must' ? 'AND' : g === 'any' ? 'OR' : 'NOT'}</small></div>${rows.map(row).join('')}` : ''; }).join('')}
    <div class="qa-card-title">${ICON.people}圈选口径</div>
    <div class="qa-scope">${[['wide', '宽口径', '保留全部业务条件，覆盖更完整'], ['narrow', '窄口径', '核心行为至少 2 次，意向更明确']].map(([k, n, d]) => `<button type="button" class="${task.scope === k ? 'on' : ''}" data-act="scope" data-v="${k}" ${live ? '' : 'disabled'}><b>${n}</b><span>${d}</span><em>约 ${size(k)} 人</em></button>`).join('')}</div>
    <div class="qa-cond"><span class="k">目标规模</span>${live ? `<input id="qa-target" type="number" min="100" step="100" placeholder="不限" value="${task.target || ''}"><span class="v qa-muted">人，超出时按偏好分截取</span>` : `<span class="v">${task.target ? fmt(task.target) + ' 人' : '不限'}</span>`}</div>
    <label class="qa-toggle-row"><span class="qa-switch ${task.seedCheck ? 'on' : ''}"><input type="checkbox" data-act="seed" ${task.seedCheck ? 'checked' : ''} ${live ? '' : 'disabled'}><i></i></span><b>种子人群校验</b></label>
    <p class="qa-muted qa-indent">开启后用种子用户检验命中率，需要等待更长时间。</p>
    <div class="qa-card-foot">${live ? `<button type="button" class="qa-link" data-act="sql-preview">查看相关 SQL</button><button type="button" class="qa-primary" data-act="conditions-ok" data-msg="${m.id}" ${busy ? 'disabled' : ''}>确认并执行</button>` : `<span class="qa-done">${ICON.check}已提交确认 · V${m.version}</span>`}</div>
  </div>
  ${m.sql && live ? `<div class="qa-sql-inline"><div class="qa-card-title">${ICON.check}相关 SQL</div>${sqlBlock(buildSql(task, buildConditions(task)))}</div>` : ''}`;
}

function permissionCard(task, m) {
  const done = m.status !== 'pending' && m.status !== 'applied';
  const conds = buildConditions({ ...task, swapped: {}, removed: [] });
  return `<details class="qa-perm" open><summary>${ICON.lock}<span>${m.ids.length} 个标签权限待申请，快速审批无负担~</span></summary>
    ${m.ids.map((id) => { const c = conds.find((x) => x.tag === id); const st = tagState(id); return `<div class="qa-perm-row"><span class="qa-perm-icon">${ICON.lock}</span><div><div class="qa-perm-name"><b>${esc(TAGS[id].name)}</b><span class="qa-pill">${esc(TAGS[id].level)}</span><button type="button" class="qa-mini" data-act="market">标签详情 ${ICON.chev}</button></div><code>${TAGS[id].table}</code><p>用于 ${esc(c ? c.value : '圈选条件')} · <em>${esc(st.label)}</em></p></div></div>`; }).join('')}
    ${done ? `<p class="qa-done">${ICON.check}${m.status === 'fallback' ? '已改用其他标签' : '权限已开通，已继续执行'}</p>` : `<div class="qa-perm-actions">
      <button type="button" class="qa-primary" data-act="perm-apply" data-msg="${m.id}">一键申请权限</button>
      <button type="button" class="qa-outline" data-act="perm-other" data-msg="${m.id}">使用其他标签</button></div>
      ${m.status === 'applied' ? `<p class="qa-muted qa-center">已放进标签广场的待选择清单。审批通过后回到这里继续。<button type="button" class="qa-link" data-act="perm-granted" data-msg="${m.id}">权限已开通，继续执行（演示）</button></p>` : `<p class="qa-center"><button type="button" class="qa-link" data-act="perm-granted" data-msg="${m.id}">权限已开通，继续执行（演示）</button></p>`}`}
  </details>`;
}

function resultCard(task, m) {
  const stale = m.version !== task.result?.version;
  return `<p>我已按要求圈出 ${fmt(task.result && !stale ? task.result.size : 0)} 人。下方是人群结果和人群报告（报告异步产出，约 20 分钟），也可以前往<button type="button" class="qa-link" data-act="center">任务中心</button>管理任务。</p>
  <button type="button" class="qa-result" data-act="panel" data-tab="detail" ${stale ? 'disabled' : ''}>
    <span class="qa-chip">${ICON.people}人群包</span><b>${esc(task.title)}</b><small>人群规模 ${stale ? '（已被新版本替代）' : fmt(task.result.size) + ' 人'} · ${(task.result?.scope || task.scope) === 'narrow' ? '窄口径' : '宽口径'} · V${m.version}</small>
    <span class="qa-result-art"><i></i><i></i><i></i></span></button>
  <div class="qa-report-line">${ICON.clock}<span>人群报告 · ${task.reportReady && !stale ? '<b class="ok">已生成</b>' : '生成中'}</span>${!stale ? `<button type="button" class="qa-link" data-act="panel" data-tab="report">查看</button>` : ''}</div>`;
}

function sqlBlock(sql) {
  return `<pre class="qa-sql">${sql.split('\n').map((l, i) => `<span><i>${i + 1}</i>${esc(l)}</span>`).join('')}</pre>`;
}

/* ---- 右侧结果面板 ---- */
const TABS = [['detail', '人群明细'], ['overview', '人群概览'], ['conditions', '圈选条件'], ['sql', '相关 SQL'], ['report', '人群报告'], ['effect', '效果回收']];
function resultPanel(task) {
  const r = task.result;
  return `<aside class="qa-panel" aria-label="人群结果">
    <header class="qa-panel-head"><div><h2>${esc(task.title)} · 人群结果</h2><span>更新时间：${esc(r.at)}</span></div>
      <div><button type="button" class="qa-mini" data-act="full">${panel.full ? '退出全屏' : '全屏'}</button><button type="button" class="qa-icon-btn" data-act="close-panel" aria-label="关闭结果面板">×</button></div></header>
    <div class="qa-panel-bar"><label class="qa-toggle-row"><span class="qa-switch ${task.periodic ? 'on' : ''}"><input type="checkbox" data-act="periodic" ${task.periodic ? 'checked' : ''}><i></i></span>定期更新${task.periodic ? '<em class="qa-on-badge">已开启</em>' : ''}</label>
      <p class="qa-periodic-note">${task.periodic
        ? `每天 08:00 按 V${r.version} 的圈选条件自动重算，下次更新：明天 08:00。人群包 ID <code>${r.packId}</code> 保持不变，已推送的投放平台会自动使用最新人群。`
        : `开启后，每天 08:00 按本次确认的圈选条件（V${r.version}）自动重算人群，人群包 ID 不变，已推送的投放平台会自动使用最新人群。`}
        条件被修改或标签权限失效时，会暂停更新并在对话中提醒你。</p></div>
    <nav class="qa-tabs">${TABS.map(([k, n]) => `<button type="button" class="${panel.tab === k ? 'on' : ''}" data-act="panel" data-tab="${k}">${n}</button>`).join('')}</nav>
    ${task.version !== r.version ? `<div class="qa-panel-note">${ICON.info}条件已调整为 V${task.version}，当前展示的是 V${r.version} 的结果；确认执行后更新。</div>` : ''}
    <div class="qa-panel-body">${panelBody(task)}</div>
  </aside>`;
}

function panelBody(task) {
  const r = task.result, conds = r.conds || buildConditions(task), h = hash(task.id + r.version), scope = r.scope || task.scope;
  if (panel.tab === 'detail') {
    const prefs = conds.filter((c) => c.group !== 'exclude' && c.tag).map((c) => c.value.replace('（替代口径）', ''));
    const rows = Array.from({ length: 10 }, (_, i) => { const k = (h + i * 37 + page * 101) % 997; return [`U****${String(1000 + k * 7).slice(-4)}`, ['L5', 'L4', 'L3'][k % 3], prefs[k % Math.max(prefs.length, 1)] || '—', `${1 + (k % 26)} 天前`, `${Math.min(conds.length, 2 + (k % 3))} / ${conds.length}`]; });
    return `<div class="qa-toolbar"><input placeholder="输入用户 ID，按回车搜索（演示）"><button type="button" class="qa-outline sm" data-act="noop">批量剔除</button><span class="qa-spacer"></span><span class="qa-muted">任务 code：${r.taskCode} · 人群包 ID：${r.packId}</span><button type="button" class="qa-outline sm" data-act="download">下载</button><button type="button" class="qa-outline sm" data-act="push">推送到投放平台</button></div>
      <table class="qa-table"><thead><tr><th class="c"><input type="checkbox" aria-label="全选"></th><th>用户（脱敏）</th><th>消费分层</th><th>命中偏好</th><th>最近活跃</th><th>命中条件</th></tr></thead>
      <tbody>${rows.map((x) => `<tr><td class="c"><input type="checkbox" aria-label="选择 ${x[0]}"></td><td><b>${x[0]}</b></td><td>${x[1]}</td><td>${esc(x[2])}</td><td>${x[3]}</td><td>${x[4]}</td></tr>`).join('')}</tbody></table>
      <div class="qa-pager"><span class="qa-muted">共 ${fmt(r.size)} 人 · 仅展示演示样例</span>${[1, 2, 3, 4, 5].map((p) => `<button type="button" class="${p === page ? 'on' : ''}" data-act="page" data-p="${p}">${p}</button>`).join('')}</div>`;
  }
  if (panel.tab === 'overview') {
    const dims = [['消费分层', ['L5', 'L4', 'L3', 'L1–L2']], ['城市线级', ['一线', '新一线', '二线', '三线及以下']], ['年龄段', ['18–24', '25–30', '31–40', '40+']]];
    return `<div class="qa-kpis">${[['人群规模', fmt(r.size) + ' 人'], ['圈选口径', scope === 'narrow' ? '窄口径' : '宽口径'], ['条件数', conds.length + ' 条'], ['版本', 'V' + r.version]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      ${dims.map(([name, keys], d) => { const raw = keys.map((_, i) => 10 + ((h >> (i + d)) % 30)); const sum = raw.reduce((a, b) => a + b, 0); return `<section class="qa-dist"><h4>${name}</h4>${keys.map((k, i) => { const p = Math.round((raw[i] / sum) * 100); return `<div><span>${k}</span><i><b style="width:${p}%"></b></i><em>${p}%</em></div>`; }).join('')}</section>`; }).join('')}`;
  }
  if (panel.tab === 'conditions') {
    return `<table class="qa-table"><thead><tr><th>条件组</th><th>标签</th><th>取值</th><th>来源表</th><th>权限</th></tr></thead><tbody>${conds.map((c) => `<tr><td>${GROUPS.find((g) => g[0] === c.group)[1]}</td><td><b>${esc(tagName(c))}</b>${c.replaced ? `<small class="qa-muted"> 替代 ${esc(TAGS[c.replaced].name)}</small>` : ''}</td><td>${esc(c.value)}</td><td>${c.tag ? `<code>${TAGS[c.tag].table}</code>` : '平台规则'}</td><td>${c.tag ? esc(shownState(task, c.tag).label) : '—'}</td></tr>`).join('')}</tbody></table>
      <p class="qa-muted">必须满足 AND（任一满足 OR）AND NOT 排除。修改条件请在对话中点「修改圈选条件」，会生成新版本。</p>`;
  }
  if (panel.tab === 'sql') return `<div class="qa-toolbar"><span class="qa-muted">示例 SQL · 按 V${r.version} 条件生成，不可用于生产</span><span class="qa-spacer"></span><button type="button" class="qa-outline sm" data-act="copy-sql">复制</button></div>${sqlBlock(r.sql || buildSql(task, conds))}`;
  if (panel.tab === 'report') {
    if (!task.reportReady) return `<div class="qa-empty">${ICON.clock}<b>人群报告生成中</b><p>报告异步产出，约 20 分钟。生成后会在对话中提示。</p><button type="button" class="qa-outline sm" data-act="report-now">立即查看（演示）</button></div>`;
    const feats = conds.filter((c) => c.tag).map((c, i) => [tagName(c), c.value, (1.4 + ((h >> i) % 18) / 10).toFixed(1)]);
    return `<section class="qa-report"><h4>一句话结论</h4><p>这批人以 ${scope === 'narrow' ? '高意向、低频次放大' : '覆盖优先'} 为主，${feats[0] ? `「${esc(feats[0][0])}」` : ''}是区分度最高的特征，建议分两批触达并保留对照组。</p>
      <h4>特征显著性（TGI）</h4><table class="qa-table"><thead><tr><th>标签</th><th>取值</th><th>TGI</th></tr></thead><tbody>${feats.map((f) => `<tr><td>${esc(f[0])}</td><td>${esc(f[1])}</td><td><b>${f[2]}</b></td></tr>`).join('')}</tbody></table>
      <h4>投放建议</h4><ul><li>先对 20% 人群做小流量实验，核心指标与对照组比较后再放量。</li><li>结果回收后在「效果回收」挂上 LR 文档，下一次相似需求会自动引用。</li></ul></section>`;
  }
  if (panel.tab === 'effect') {
    return `<section class="qa-report"><h4>历史相似策略 · 引用收益</h4><p class="qa-muted">来自业务回填的 LR 文档，仅作类比，不代表本次效果。</p>
      ${SCENES[task.scene].cases.map(([n, s, g, d]) => `<div class="qa-case"><div><b>${esc(n)}</b><span class="qa-pill">${s}</span></div><em>${esc(g)}</em><small>${esc(d)} · 示例数据</small></div>`).join('')}
      <h4>本次效果回收</h4>${task.effects.map((e) => `<div class="qa-case"><div><b>${esc(e.metric)}</b><span class="qa-pill">V${e.version}</span></div><em>${esc(e.result)}</em><small>${esc(e.doc)}</small></div>`).join('') || '<p class="qa-muted">还没有回收记录。投放两周后会提醒你补充。</p>'}
      <div class="qa-form"><input id="qa-eff-metric" placeholder="核心指标，如：券核销率"><input id="qa-eff-result" placeholder="结论，如：+2.3%（对照组 1.1%）"><input id="qa-eff-doc" placeholder="LR 文档链接"><button type="button" class="qa-primary" data-act="effect-save">记录回收结果</button></div></section>`;
  }
  return '';
}

function taskCenter() {
  return `<header class="qa-chat-head"><h1>圈人任务中心</h1></header><div class="qa-center-body">
    <table class="qa-table"><thead><tr><th>任务</th><th>状态</th><th>人群规模</th><th>定期更新</th><th>更新时间</th><th></th></tr></thead><tbody>
    ${tasks.map((t) => `<tr><td><b>${esc(t.title)}</b><br><small class="qa-muted">${esc(t.query.slice(0, 36))}</small></td><td>${t.result ? '已完成' : t.messages.some((m) => m.type === 'permission' && m.status !== 'granted' && m.status !== 'fallback') ? '权限待申请' : '进行中'}</td><td>${t.result ? fmt(t.result.size) : '—'}</td><td>${t.periodic ? '每天' : '关闭'}</td><td>${esc(new Date(t.updated).toLocaleString('zh-CN', { hour12: false }).slice(5, 16))}</td><td><button type="button" class="qa-link" data-act="open" data-id="${t.id}">继续</button></td></tr>`).join('') || '<tr><td colspan="6" class="qa-muted">还没有任务</td></tr>'}
    </tbody></table></div>`;
}

/* ---------------- 事件 ---------------- */
async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || !host.contains(el) || el.disabled) return;
  const act = el.dataset.act, task = current();
  const msg = task && el.dataset.msg ? task.messages.find((m) => m.id === el.dataset.msg) : null;
  if (['seed', 'periodic'].includes(act) && e.target.tagName !== 'INPUT') return;
  switch (act) {
    case 'toggle-side': sidebarOpen = !sidebarOpen; break;
    case 'new': view = 'home'; activeId = null; panel.open = false; break;
    case 'center': view = 'center'; panel.open = false; break;
    case 'market': if (options.onMarket) options.onMarket(); else location.href = 'https://utup-mvp-frontend.vercel.app/#market'; return;
    case 'kb': notify('策略知识库规划中：沉淀分析思路与历史策略，支持共建'); return;
    case 'open': activeId = el.dataset.id; view = 'task'; panel.open = !!current()?.result; break;
    case 'example': draft = el.dataset.q; render(); host.querySelector('#qa-input')?.focus(); return;
    case 'send': return send();
    case 'answer': task.answers[el.dataset.q] = el.dataset.v; save(); break;
    case 'clarify-ok': return confirmClarify(task, msg);
    case 'remove': task.removed.push(+el.dataset.tag); save(); break;
    case 'scope': task.scope = el.dataset.v; save(); break;
    case 'seed': task.seedCheck = e.target.checked; save(); break;
    case 'sql-preview': { const m = [...task.messages].reverse().find((x) => x.type === 'conditions'); m.sql = !m.sql; break; }
    case 'conditions-ok': return confirmConditions(task, msg);
    case 'perm-apply': return applyPermission(task, msg);
    case 'perm-other': return useOtherTags(task, msg);
    case 'perm-granted': return grantAndRun(task, msg);
    case 'modify': return modify(task);
    case 'panel': panel.open = true; panel.tab = el.dataset.tab; break;
    case 'close-panel': panel.open = false; panel.full = false; break;
    case 'full': panel.full = !panel.full; break;
    case 'periodic': task.periodic = e.target.checked; save(); notify(task.periodic ? '已开启定期更新（演示）' : '已关闭定期更新'); return;
    case 'page': page = +el.dataset.p; break;
    case 'report-now': task.reportReady = true; save(); break;
    case 'copy-sql': try { await navigator.clipboard.writeText(task.result.sql || buildSql(task, buildConditions(task))); notify('已复制示例 SQL'); } catch { notify('复制失败，请手动选择'); } return;
    case 'download': notify('演示环境不导出真实用户，已记录下载请求'); return;
    case 'push': notify('已模拟推送到投放平台，人群包 ' + task.result.packId); return;
    case 'save-template': task.saved = true; save(); notify('已保存为圈人模板，可在任务中心复用'); return;
    case 'effect-save': {
      const v = (id) => host.querySelector(id)?.value.trim();
      if (!v('#qa-eff-metric') || !v('#qa-eff-result')) { notify('请填写核心指标和结论'); return; }
      task.effects.push({ metric: v('#qa-eff-metric'), result: v('#qa-eff-result'), doc: v('#qa-eff-doc') || '未附文档', version: task.result.version });
      save(); notify('已记录，下一次相似需求会引用这条结果'); return;
    }
    default: return;
  }
  render();
}
function send() {
  const text = draft.trim();
  if (!text || busy) return;
  draft = '';
  const task = current();
  if (view === 'task' && task) modify(task, text); else start(text);
}
function onInput(e) {
  if (e.target.id === 'qa-input') { draft = e.target.value; const b = host.querySelector('[data-act="send"]'); if (b) b.disabled = busy || !draft.trim(); }
  if (e.target.id === 'qa-target') { const t = current(); const n = parseInt(e.target.value, 10); t.target = n > 0 ? n : null; save(); host.querySelectorAll('.qa-scope em').forEach((em, i) => { em.textContent = '约 ' + fmt(estimate(t, i ? 'narrow' : 'wide')) + ' 人'; }); }
}
function onKey(e) {
  if (e.target.id === 'qa-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
}
function onToggle(e) {
  const d = e.target.closest?.('details[data-msg]');
  if (!d) return;
  const m = current()?.messages.find((x) => x.id === d.dataset.msg);
  if (m) m[d.dataset.open] = d.open;
}

root.AudienceWorkspace = {
  mount(node, opts = {}) {
    host = node; options = opts; load();
    host.classList.add('qa-host');
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('keydown', onKey);
    host.addEventListener('toggle', onToggle, true);
    if (activeId && current()) view = 'task';
    sidebarOpen = host.clientWidth >= 1100;
    render();
  },
  unmount() {
    if (!host) return;
    host.removeEventListener('click', onClick);
    host.removeEventListener('input', onInput);
    host.removeEventListener('keydown', onKey);
    host.removeEventListener('toggle', onToggle, true);
    host = null; busy = false;
  },
  openAsset() { view = 'home'; activeId = null; render(); },
};
})(typeof window !== 'undefined' ? window : globalThis);
