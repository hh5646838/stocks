/* ===== 极简持仓比例估算与调仓计划长图生成器 ===== */

// ---------- 全局状态 ----------
const STATE = {
  config: null,
  stocks: [],
  stockColors: [
    '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
    '#f43f5e', '#6366f1', '#14b8a6', '#a855f7', '#eab308'
  ],
  fixedColors: {
    cash: '#3b82f6',
    gold: '#f59e0b',
    btc: '#f7931a',
    other: '#94a3b8'
  },
  adTriggered: false // 本次会话是否已触发过广告弹窗
};

// ---------- 工具函数 ----------
function $(id) { return document.getElementById(id); }

function showToast(msg, duration = 2000) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

function formatMoney(val, currency, masked) {
  if (masked) return '****';
  const num = Number(val) || 0;
  return currency + num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPercent(val) {
  return (val * 100).toFixed(1) + '%';
}

function getNowTime() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------- 配置加载 ----------
async function loadConfig() {
  try {
    const res = await fetch('config.json');
    STATE.config = await res.json();
  } catch (e) {
    console.warn('config.json 加载失败，使用默认配置', e);
    STATE.config = {
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=stockmaster',
      authorName: '持仓估算君',
      homepage: '#',
      wechatName: '持仓估算君',
      wechatQrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=#',
      adPopup: { firstTriggerCount: 6, intervalCount: 3, countdownSeconds: 5 }
    };
  }
  renderConfig();
}

function renderConfig() {
  const c = STATE.config;
  $('navAvatar').src = c.avatarUrl;
  $('navAuthorName').textContent = c.authorName;
  $('modalQrImg').src = c.wechatQrUrl;
  $('modalWechatName').textContent = c.wechatName;
  $('adQrImg').src = c.wechatQrUrl;
}

// ---------- 默认初始数据 ----------
function initDefaultData() {
  const now = new Date();
  // 动态生成年份选项 2020-2035
  const yearSel = $('yearInput');
  if (yearSel.options.length === 0) {
    for (let y = 2020; y <= 2035; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSel.appendChild(opt);
    }
  }
  yearSel.value = now.getFullYear();
  $('monthInput').value = now.getMonth() + 1;
  $('dayInput').value = now.getDate();
  $('marketSelect').value = 'A股';
  $('currencyInput').value = '¥';
  $('moodSelect').value = '📈 继续格局';
  $('cashInput').value = 50000;
  $('goldInput').value = 20000;
  $('btcInput').value = 10000;
  $('privacyToggle').checked = true;

  STATE.stocks = [
    { name: '贵州茅台 600519', holding: 30000, target: 40000 },
    { name: '宁德时代 300750', holding: 20000, target: 25000 },
    { name: '比亚迪 002594',   holding: 15000, target: 20000 },
    { name: '中国平安 601318', holding: 10000, target: 10000 },
    { name: '招商银行 600036', holding: 8000,  target: 5000  }
  ];
  renderStockList();
}

// ---------- 股票列表渲染 ----------
function renderStockList() {
  const container = $('stockList');
  container.innerHTML = '';
  STATE.stocks.forEach((stock, idx) => {
    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `
      <input type="text" class="stock-name-input" placeholder="股票代码/名称" value="${escapeHtml(stock.name)}" data-idx="${idx}" data-field="name">
      <input type="number" placeholder="持仓金额" value="${stock.holding}" data-idx="${idx}" data-field="holding" min="0" step="0.01">
      <input type="number" placeholder="计划持仓" value="${stock.target}" data-idx="${idx}" data-field="target" min="0" step="0.01">
      <button class="remove-stock-btn" data-idx="${idx}" title="删除">×</button>
    `;
    container.appendChild(row);
  });

  // 绑定事件
  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', onStockInputChange);
    if (inp.dataset.field === 'name') {
      inp.addEventListener('blur', onStockNameBlur);
    }
  });
  container.querySelectorAll('.remove-stock-btn').forEach(btn => {
    btn.addEventListener('click', onRemoveStock);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function onStockInputChange(e) {
  const idx = Number(e.target.dataset.idx);
  const field = e.target.dataset.field;
  if (field === 'name') {
    STATE.stocks[idx].name = e.target.value;
  } else {
    STATE.stocks[idx][field] = Number(e.target.value) || 0;
  }
  renderPreview();
}

function onStockNameBlur(e) {
  const idx = Number(e.target.dataset.idx);
  const name = e.target.value.trim();
  if (!name) return;
  // 检查与其他行是否完全相同
  const duplicate = STATE.stocks.some((s, i) => i !== idx && s.name.trim() === name);
  if (duplicate) {
    STATE.stocks.splice(idx, 1);
    renderStockList();
    renderPreview();
    showToast(`股票名称"${name}"重复，已自动删除重复项`, 2500);
  }
}

function onRemoveStock(e) {
  const idx = Number(e.currentTarget.dataset.idx);
  STATE.stocks.splice(idx, 1);
  renderStockList();
  renderPreview();
}

function addStock() {
  STATE.stocks.push({ name: '', holding: 0, target: 0 });
  renderStockList();
  renderPreview();
}

// ---------- 市场货币联动 ----------
function onMarketChange() {
  const market = $('marketSelect').value.trim();
  const map = { 'A股': '¥', '港股': 'HK$', '美股': '$', '日股': '¥', '韩股': '₩' };
  if (map[market]) {
    $('currencyInput').value = map[market];
  }
  renderPreview();
}

// ---------- 自定义下拉菜单 ----------
function initCustomDropdown(dropdownId, inputId, onSelect) {
  const dropdown = document.getElementById(dropdownId);
  const input = document.getElementById(inputId);
  const menu = dropdown.querySelector('.dropdown-menu');
  const wrap = dropdown.querySelector('.datalist-wrap');

  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    // 关闭其他已展开的菜单
    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
      if (m !== menu) m.classList.remove('active');
    });
    menu.classList.toggle('active');
    // 高亮当前选中项
    menu.querySelectorAll('li').forEach(li => {
      li.classList.toggle('selected', li.dataset.value === input.value);
    });
  });

  menu.querySelectorAll('li').forEach(li => {
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = li.dataset.value;
      input.value = val;
      menu.classList.remove('active');
      if (onSelect) onSelect(val);
      renderPreview();
    });
  });
}

// 点击页面其他区域关闭所有下拉
function initDropdownOutsideClose() {
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
  });
}

// ---------- 数据计算 ----------
function computeData() {
  const cash = Number($('cashInput').value) || 0;
  const gold = Number($('goldInput').value) || 0;
  const btc = Number($('btcInput').value) || 0;
  const currency = $('currencyInput').value || '¥';
  const masked = $('privacyToggle').checked;

  // 当前持仓明细
  const currentItems = [];
  if (cash > 0) currentItems.push({ name: '现金', value: cash, color: STATE.fixedColors.cash });
  if (gold > 0) currentItems.push({ name: '黄金', value: gold, color: STATE.fixedColors.gold });
  if (btc > 0) currentItems.push({ name: '大饼', value: btc, color: STATE.fixedColors.btc });

  STATE.stocks.forEach((s, i) => {
    if (s.holding > 0) {
      currentItems.push({
        name: s.name || `股票${i + 1}`,
        value: s.holding,
        color: STATE.stockColors[i % STATE.stockColors.length]
      });
    }
  });

  const totalAsset = currentItems.reduce((sum, it) => sum + it.value, 0);

  // 计算比例
  currentItems.forEach(it => {
    it.percent = totalAsset > 0 ? it.value / totalAsset : 0;
  });

  // 目标持仓（计划）
  const targetItems = [];
  let targetAllocated = 0;
  STATE.stocks.forEach((s, i) => {
    if (s.target > 0) {
      targetItems.push({
        name: s.name || `股票${i + 1}`,
        value: s.target,
        color: STATE.stockColors[i % STATE.stockColors.length]
      });
      targetAllocated += s.target;
    }
  });

  // 未分配部分计入"其他"
  const otherValue = Math.max(0, totalAsset - targetAllocated);
  if (otherValue > 0) {
    targetItems.push({ name: '其他', value: otherValue, color: STATE.fixedColors.other });
  }

  targetItems.forEach(it => {
    it.percent = totalAsset > 0 ? it.value / totalAsset : 0;
  });

  // 达成率
  const achievements = [];
  STATE.stocks.forEach((s, i) => {
    if (s.target > 0) {
      const rate = s.holding / s.target;
      achievements.push({
        name: s.name || `股票${i + 1}`,
        rate: rate,
        over: rate > 1,
        color: STATE.stockColors[i % STATE.stockColors.length]
      });
    }
  });

  // 检查计划是否填满：存在持仓>0但计划持仓=0的行即为未填满
  const hasUnfilledTarget = STATE.stocks.some(s => Number(s.holding) > 0 && Number(s.target) <= 0);
  const targetFilled = !hasUnfilledTarget;

  return {
    cash, gold, btc, currency, masked,
    currentItems, totalAsset,
    targetItems, targetAllocated, otherValue,
    achievements, targetFilled
  };
}

// ---------- 预览渲染 ----------
function renderPreview() {
  const data = computeData();
  const card = $('previewCard');
  const market = $('marketSelect').value || '未指定';
  const year = $('yearInput').value;
  const month = $('monthInput').value;
  const day = $('dayInput').value;
  const mood = $('moodSelect').value;

  let dateStr = '';
  if (year && month) {
    dateStr = `${year}年${Number(month)}月`;
    if (day) dateStr += `${Number(day)}日`;
  }

  // 当前持仓图例 HTML
  const legendHtml = data.currentItems.map(it => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${it.color}"></span>
      <span class="legend-name">${escapeHtml(it.name)}</span>
      <span class="legend-value">${formatMoney(it.value, data.currency, data.masked)}</span>
      <span class="legend-percent">${formatPercent(it.percent)}</span>
    </div>
  `).join('');

  // 目标持仓条
  const targetHtml = data.targetItems.map(it => `
    <div class="target-item">
      <span class="target-name">${escapeHtml(it.name)}</span>
      <div class="target-bar-wrap">
        <div class="target-bar" style="width:${Math.min(it.percent * 100, 100)}%;background:${it.color}"></div>
      </div>
      <span class="target-percent">${formatPercent(it.percent)}</span>
    </div>
  `).join('');

  // 达成率
  const achieveHtml = data.achievements.map(it => `
    <div class="achievement-item">
      <span class="achievement-name">${escapeHtml(it.name)}</span>
      <div class="achievement-bar-wrap">
        <div class="achievement-bar ${it.over ? 'over' : ''}" style="width:${Math.min(it.rate * 100, 100)}%;background:${it.over ? '' : it.color}"></div>
      </div>
      <span class="achievement-percent ${it.over ? 'over' : ''}">${(it.rate * 100).toFixed(0)}%</span>
    </div>
  `).join('') || '<div class="empty-hint">暂无计划持仓数据</div>';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-market-tag">${escapeHtml(market)}</span>
      <span class="card-date">${dateStr}</span>
      ${mood ? `<span class="card-mood">${escapeHtml(mood)}</span>` : ''}
    </div>

    <div class="card-total-section">
      <div class="card-total-label">资产总金额</div>
      <div class="card-total-value ${data.masked ? 'masked' : ''}">${formatMoney(data.totalAsset, data.currency, data.masked)}</div>
    </div>

    <div class="chart-section">
      <div class="doughnut-container">
        <canvas id="doughnutCanvas" width="400" height="400"></canvas>
        <div class="doughnut-center">
          <div class="doughnut-center-label">总资产</div>
          <div class="doughnut-center-value">${data.masked ? '****' : data.currentItems.length + '项'}</div>
        </div>
      </div>
      <div class="legend-list">${legendHtml || '<div class="empty-hint">暂无持仓数据</div>'}</div>
    </div>

    <div class="target-section">
      <div class="card-part-title">🎯 目标持仓比例</div>
      <div class="target-list">${targetHtml || '<div class="empty-hint">暂无计划数据</div>'}</div>
    </div>

    <div class="achievement-section">
      <div class="card-part-title">📊 目标达成率</div>
      <div class="achievement-list">${achieveHtml}</div>
    </div>

    <div class="card-caption">* 以上持仓比例按当前资产总额计算，数据仅供参考，不构成投资建议。</div>

    <div class="card-timestamp">${getNowTime()}</div>
  `;

  // 绘制环形图
  drawDoughnut(data.currentItems);
}

// ---------- Canvas 环形图 ----------
function drawDoughnut(items) {
  const canvas = $('doughnutCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 400;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = '200px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);

  const centerX = size / 2;
  const centerY = size / 2;
  const outerR = size / 2 - 10;
  const innerR = outerR * 0.62;

  ctx.clearRect(0, 0, size, size);

  const total = items.reduce((s, it) => s + it.value, 0);
  if (total <= 0) {
    // 空环
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerR, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill('evenodd');
    return;
  }

  let startAngle = -Math.PI / 2;
  const showLabels = $('doughnutLabelToggle')?.checked ?? true;
  items.forEach(it => {
    const sliceAngle = (it.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = it.color;
    ctx.fill();

    // 扇区上标注百分比（大于4%才标注，避免重叠）
    if (showLabels && it.percent >= 0.04) {
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = (outerR + innerR) / 2;
      const lx = centerX + labelR * Math.cos(midAngle);
      const ly = centerY + labelR * Math.sin(midAngle);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((it.percent * 100).toFixed(0) + '%', lx, ly);
    }

    startAngle += sliceAngle;
  });
}

// ---------- 生成下载 ----------
async function generateImage() {
  // 校验现金
  const cashVal = $('cashInput').value.trim();
  if (cashVal === '') {
    showToast('现金为必填项，满仓请填0', 2500);
    return;
  }

  const data = computeData();

  // 检查计划持仓是否填满
  if (!data.targetFilled) {
    $('confirmText').textContent = '您未填满各项计划持仓，将用当前总金额作为计划持仓总金额计算（剩余未分配部分将计入"其他"）。';
    $('confirmModal').classList.add('active');
    return;
  }

  await doGenerate();
}

async function doGenerate() {
  $('confirmModal').classList.remove('active');

  const card = $('previewCard');
  showToast('正在生成高清长图...', 1500);

  try {
    const canvas = await html2canvas(card, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#f8fafc',
      logging: false
    });

    const link = document.createElement('a');
    const market = $('marketSelect').value || '持仓';
    const year = $('yearInput').value || '';
    const month = $('monthInput').value || '';
    link.download = `持仓估算_${market}_${year}${month}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // 统计下载数
    incrementDownloadCount();
    showToast('长图已生成并下载', 2000);
  } catch (e) {
    console.error('生成失败', e);
    showToast('生成失败，请重试', 2500);
  }
}

// ---------- 下载统计与广告弹窗 ----------
function incrementDownloadCount() {
  let count = Number(localStorage.getItem('totalProcessedCount') || 0);
  count += 1;
  localStorage.setItem('totalProcessedCount', count);

  const cfg = STATE.config?.adPopup || {};
  const firstTrigger = cfg.firstTriggerCount ?? 6;
  const interval = cfg.intervalCount ?? 3;

  // 首次超过 firstTrigger 触发一次，之后每 interval 次触发
  let shouldTrigger = false;
  if (count === firstTrigger + 1) {
    shouldTrigger = true;
  } else if (count > firstTrigger + 1) {
    const beyond = count - (firstTrigger + 1);
    if (beyond % interval === 0) shouldTrigger = true;
  }

  if (shouldTrigger && !STATE.adTriggered) {
    STATE.adTriggered = true;
    setTimeout(showAdModal, 800);
  }
}

function showAdModal() {
  const cfg = STATE.config?.adPopup || {};
  const seconds = cfg.countdownSeconds ?? 5;
  const btn = $('adCloseBtn');
  const countdownEl = $('adCountdown');
  let remaining = seconds;
  countdownEl.textContent = remaining;
  btn.disabled = true;
  $('adModal').classList.add('active');

  const timer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = '已知晓，继续使用';
    }
  }, 1000);
}

// ---------- 关注弹窗 ----------
function openFollowModal() {
  $('followModal').classList.add('active');
}

function closeFollowModal() {
  $('followModal').classList.remove('active');
}

async function copyWechatName() {
  const name = STATE.config?.wechatName || '';
  try {
    await navigator.clipboard.writeText(name);
    showToast('公众号名称已复制', 1500);
  } catch (e) {
    // 降级方案
    const ta = document.createElement('textarea');
    ta.value = name;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('公众号名称已复制', 1500);
    } catch (e2) {
      showToast('复制失败，请手动复制', 2000);
    }
    document.body.removeChild(ta);
  }
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 自定义下拉
  initCustomDropdown('marketDropdown', 'marketSelect', onMarketChange);
  initCustomDropdown('currencyDropdown', 'currencyInput');
  initDropdownOutsideClose();

  // 所有输入实时预览
  ['currencyInput', 'yearInput', 'monthInput', 'dayInput', 'moodSelect',
   'cashInput', 'goldInput', 'btcInput', 'privacyToggle', 'doughnutLabelToggle'].forEach(id => {
    $(id).addEventListener('input', renderPreview);
    $(id).addEventListener('change', renderPreview);
  });

  // 添加股票
  $('addStockBtn').addEventListener('click', addStock);

  // 生成按钮
  $('generateBtn').addEventListener('click', generateImage);

  // 确认弹窗
  $('confirmContinueFill').addEventListener('click', () => {
    $('confirmModal').classList.remove('active');
  });
  $('confirmContinueGen').addEventListener('click', doGenerate);

  // 关注弹窗
  $('authorArea').addEventListener('click', openFollowModal);
  $('followModalClose').addEventListener('click', closeFollowModal);

  // 复制
  $('copyWechatBtn').addEventListener('click', copyWechatName);

  // 广告弹窗
  $('adModalClose').addEventListener('click', () => {
    $('adModal').classList.remove('active');
  });
  $('adCloseBtn').addEventListener('click', () => {
    $('adModal').classList.remove('active');
  });

  // 声明弹窗
  $('disclaimerCheck').addEventListener('change', (e) => {
    $('disclaimerBtn').disabled = !e.target.checked;
  });
  $('disclaimerBtn').addEventListener('click', () => {
    $('disclaimerModal').classList.remove('active');
  });

  // 帮助弹窗
  $('helpBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('helpModal').classList.add('active');
  });
  $('helpModalClose').addEventListener('click', () => {
    $('helpModal').classList.remove('active');
  });

  // 点击遮罩关闭（关注弹窗不允许点遮罩关闭，只能点×）
  $('followModal').addEventListener('click', (e) => {
    if (e.target.id === 'followModal') {
      // 强硬弹窗：不关闭
    }
  });
}

// ---------- 初始化 ----------
async function init() {
  await loadConfig();
  initDefaultData();
  bindEvents();
  renderPreview();

  // 每次打开都弹出使用声明
  $('disclaimerModal').classList.add('active');
}

document.addEventListener('DOMContentLoaded', init);
