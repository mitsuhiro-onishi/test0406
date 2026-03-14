// ============================================================
// School Schedule Calendar App
// 26年度 (April 2026 – March 2027)
// Firebase Realtime Database で夫婦共有対応
// ============================================================

(function () {
  'use strict';

  // ---- Constants ----
  const SCHOOL_YEAR_START = { year: 2026, month: 3 }; // April (0-indexed)
  const SCHOOL_YEAR_END = { year: 2027, month: 2 };   // March (0-indexed)
  const MAX_DAYS = 15; // 受給者証の上限回数

  const DEFAULT_SERVICES = [
    { id: 'joy', name: 'JOY', color: '#E67E22' },
    { id: 'waku', name: 'わくわく', color: '#27AE60' },
    { id: 'nontan', name: 'のんたん', color: '#8E44AD' },
  ];

  const TRANSPORT_LABELS = {
    'school-bus': { label: 'スクールバス', icon: '🚌' },
    'day-pickup': { label: 'デイお迎え', icon: '🚐' },
    'self-pickup': { label: '自分で送迎', icon: '🚗' },
    'none': { label: '', icon: '' },
  };

  // Japanese holidays for 2026-2027 school year
  const HOLIDAYS = {
    '2026-04-29': '昭和の日',
    '2026-05-03': '憲法記念日',
    '2026-05-04': 'みどりの日',
    '2026-05-05': 'こどもの日',
    '2026-05-06': '振替休日',
    '2026-07-20': '海の日',
    '2026-08-11': '山の日',
    '2026-09-21': '敬老の日',
    '2026-09-22': '秋分の日',
    '2026-09-23': '国民の休日',
    '2026-10-12': 'スポーツの日',
    '2026-11-03': '文化の日',
    '2026-11-23': '勤労感謝の日',
    '2027-01-01': '元日',
    '2027-01-11': '成人の日',
    '2027-02-11': '建国記念の日',
    '2027-02-23': '天皇誕生日',
    '2027-03-21': '春分の日',
  };

  // ---- State ----
  let currentYear, currentMonth;
  let scheduleData = {};
  let services = [];
  let settings = { notify: false, notifyHour: 20, notifyMinute: 0, maxDays: MAX_DAYS };
  let selectedDate = null;
  let familyId = null;
  let db = null;
  let firebaseReady = false;

  // ---- DOM Elements ----
  const monthTitle = document.getElementById('monthTitle');
  const calendarGrid = document.getElementById('calendarGrid');
  const legend = document.getElementById('legend');
  const tomorrowContent = document.getElementById('tomorrowContent');

  const dayModal = document.getElementById('dayModal');
  const modalDate = document.getElementById('modalDate');
  const serviceOptionsEl = document.getElementById('serviceOptions');
  const noteInput = document.getElementById('noteInput');

  const settingsModal = document.getElementById('settingsModal');
  const serviceListEl = document.getElementById('serviceList');

  const familyModal = document.getElementById('familyModal');
  const syncStatus = document.getElementById('syncStatus');

  // ---- Firebase ----
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDEt2n-jJe7BXOPrJeHq7DvhNLFmBfE0nY",
    authDomain: "claude-68f78.firebaseapp.com",
    databaseURL: "https://claude-68f78-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "claude-68f78",
    storageBucket: "claude-68f78.firebasestorage.app",
    messagingSenderId: "1038366882933",
    appId: "1:1038366882933:web:42ac51862a388d6a550c3c"
  };

  function initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded, using localStorage only');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.database();
      firebaseReady = true;
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      return false;
    }
  }

  // ---- Firebase Sync ----
  function syncToFirebase() {
    if (!firebaseReady || !familyId || !db) return;
    updateSyncStatus('syncing');

    const ref = db.ref('families/' + familyId);
    ref.update({
      schedule: scheduleData,
      services: services,
      settings: { maxDays: settings.maxDays },
      updatedAt: Date.now()
    }).then(() => {
      updateSyncStatus('synced');
    }).catch((e) => {
      console.error('Sync error:', e);
      updateSyncStatus('error');
    });
  }

  function listenToFirebase() {
    if (!firebaseReady || !familyId || !db) return;

    const ref = db.ref('families/' + familyId);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        syncToFirebase();
        return;
      }

      if (data.schedule) {
        scheduleData = data.schedule;
        localStorage.setItem('school-cal-data', JSON.stringify(scheduleData));
      }
      if (data.services) {
        services = data.services;
        localStorage.setItem('school-cal-services', JSON.stringify(services));
      }
      if (data.settings && data.settings.maxDays !== undefined) {
        settings.maxDays = data.settings.maxDays;
        localStorage.setItem('school-cal-settings', JSON.stringify(settings));
      }

      renderMonth();
      renderTomorrowPreview();
      renderLegend();
      renderUsageCounter();
      updateSyncStatus('synced');
    });
  }

  function updateSyncStatus(status) {
    if (!syncStatus) return;
    switch (status) {
      case 'syncing':
        syncStatus.textContent = '同期中...';
        syncStatus.style.color = '#F39C12';
        break;
      case 'synced':
        syncStatus.textContent = '同期済み';
        syncStatus.style.color = '#27AE60';
        break;
      case 'error':
        syncStatus.textContent = '同期エラー';
        syncStatus.style.color = '#E74C3C';
        break;
      case 'offline':
        syncStatus.textContent = 'オフライン';
        syncStatus.style.color = '#999';
        break;
      default:
        syncStatus.textContent = '';
    }
  }

  // ---- Family Code ----
  function getFamilyId() {
    return localStorage.getItem('school-cal-family-id');
  }

  function setFamilyId(id) {
    familyId = id;
    localStorage.setItem('school-cal-family-id', id);
  }

  function generateFamilyId() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function showFamilyModal() {
    if (familyId) {
      document.getElementById('familyCodeResultSection').style.display = 'block';
      document.getElementById('familyCodeResult').textContent = familyId;
    }
    familyModal.classList.add('active');
  }

  function closeFamilyModal() {
    familyModal.classList.remove('active');
  }

  // ---- Persistence (localStorage fallback) ----
  function loadData() {
    try {
      const raw = localStorage.getItem('school-cal-data');
      if (raw) scheduleData = JSON.parse(raw);
    } catch (e) { scheduleData = {}; }

    try {
      const raw = localStorage.getItem('school-cal-services');
      if (raw) services = JSON.parse(raw);
      else services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
    } catch (e) { services = JSON.parse(JSON.stringify(DEFAULT_SERVICES)); }

    try {
      const raw = localStorage.getItem('school-cal-settings');
      if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) {}
  }

  function saveSchedule() {
    localStorage.setItem('school-cal-data', JSON.stringify(scheduleData));
    syncToFirebase();
  }

  function saveServices() {
    localStorage.setItem('school-cal-services', JSON.stringify(services));
    syncToFirebase();
  }

  function saveSettings() {
    localStorage.setItem('school-cal-settings', JSON.stringify(settings));
  }

  // ---- Helpers ----
  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function isHoliday(key) {
    return HOLIDAYS.hasOwnProperty(key);
  }

  function isInSchoolYear(y, m) {
    if (y === SCHOOL_YEAR_START.year && m >= SCHOOL_YEAR_START.month) return true;
    if (y === SCHOOL_YEAR_END.year && m <= SCHOOL_YEAR_END.month) return true;
    return false;
  }

  function getServiceById(id) {
    return services.find(s => s.id === id);
  }

  function formatDate(y, m, d) {
    const dow = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(y, m, d);
    return `${y}年${m + 1}月${d}日（${dow[date.getDay()]}）`;
  }

  // ---- Usage Counter (受給者証) ----
  function countMonthlyUsage(year, month) {
    let count = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      const data = scheduleData[key];
      if (data && data.service && data.service !== 'none') {
        count++;
      }
    }
    return count;
  }

  function renderUsageCounter() {
    const el = document.getElementById('usageCounter');
    if (!el) return;

    const used = countMonthlyUsage(currentYear, currentMonth);
    const max = settings.maxDays || MAX_DAYS;
    const remaining = max - used;

    const barPercent = Math.min((used / max) * 100, 100);
    const barColor = remaining <= 2 ? '#E74C3C' : remaining <= 5 ? '#F39C12' : '#27AE60';

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:600;">受給者証 利用状況</span>
        <span style="font-size:13px;"><strong>${used}</strong> / ${max}回　残り <strong style="color:${barColor}">${remaining}</strong>回</span>
      </div>
      <div style="background:#E0E0E0;border-radius:6px;height:8px;overflow:hidden;">
        <div style="background:${barColor};height:100%;width:${barPercent}%;border-radius:6px;transition:width 0.3s;"></div>
      </div>
    `;
  }

  // ---- Render Calendar ----
  function renderMonth() {
    const year = currentYear;
    const month = currentMonth;

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月',
      '7月', '8月', '9月', '10月', '11月', '12月'];
    monthTitle.innerHTML = `${monthNames[month]} <span class="year">${year}年</span>`;

    calendarGrid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell empty';
      calendarGrid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      const date = new Date(year, month, d);
      const dow = date.getDay();
      const key = dateKey(year, month, d);
      const holiday = isHoliday(key);

      let classes = 'day-cell';
      if (dow === 0) classes += ' sunday';
      if (dow === 6) classes += ' saturday';
      if (holiday) classes += ' holiday';
      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d) {
        classes += ' today';
      }

      // 放デイ設定がある日は背景色を変更
      const data = scheduleData[key];
      let svcColor = null;
      if (data && data.service && data.service !== 'none') {
        const svc = getServiceById(data.service);
        if (svc) {
          svcColor = svc.color;
          classes += ' has-service';
        }
      }

      cell.className = classes;

      if (svcColor) {
        cell.style.background = svcColor + '25'; // 薄い背景色(15%透過)
        cell.style.borderLeft = `3px solid ${svcColor}`;
      }

      const dayNum = document.createElement('div');
      dayNum.className = 'day-number';
      dayNum.textContent = d;

      // 放デイ設定日は日付の丸を該当色に
      if (svcColor && !classes.includes('today')) {
        dayNum.style.background = svcColor;
        dayNum.style.color = 'white';
      }

      cell.appendChild(dayNum);

      if (data) {
        if (data.service && data.service !== 'none') {
          const svc = getServiceById(data.service);
          if (svc) {
            const badge = document.createElement('div');
            badge.className = 'service-badge';
            badge.style.background = svc.color;
            badge.textContent = svc.name;
            cell.appendChild(badge);
          }
        }
        if (data.transport && data.transport !== 'none') {
          const ti = document.createElement('div');
          ti.className = 'transport-icon';
          ti.textContent = TRANSPORT_LABELS[data.transport]?.icon || '';
          cell.appendChild(ti);
        }
      }

      cell.addEventListener('click', () => openDayModal(year, month, d));
      calendarGrid.appendChild(cell);
    }

    renderLegend();
    renderUsageCounter();
  }

  function renderLegend() {
    legend.innerHTML = '';
    services.forEach(svc => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const dot = document.createElement('div');
      dot.className = 'legend-dot';
      dot.style.background = svc.color;
      item.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = svc.name;
      item.appendChild(label);
      legend.appendChild(item);
    });
  }

  // ---- Tomorrow Preview ----
  function renderTomorrowPreview() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = dateKey(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const data = scheduleData[key];
    const dateStr = formatDate(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

    if (!data || (!data.service || data.service === 'none')) {
      tomorrowContent.innerHTML = `<div style="color:#999">${dateStr}<br>予定なし</div>`;
      return;
    }

    let html = `<strong>${dateStr}</strong><br>`;

    const svc = getServiceById(data.service);
    if (svc) {
      html += `<span class="preview-service" style="background:${svc.color}">${svc.name}</span> `;
    }

    if (data.transport && data.transport !== 'none') {
      const t = TRANSPORT_LABELS[data.transport];
      html += `${t.icon} ${t.label} `;
    }

    // Show time for each transport
    if (data.schoolBusTime) html += `<br>🚌 バス: ${data.schoolBusTime}`;
    if (data.dayPickupTime) html += `<br>🚐 デイお迎え: ${data.dayPickupTime}`;
    if (data.selfPickupTime) html += `<br>🚗 自分送迎: ${data.selfPickupTime}`;
    if (data.returnTime) html += `<br>🏠 帰宅: ${data.returnTime}`;

    if (data.note) {
      html += `<br>📝 ${data.note}`;
    }

    tomorrowContent.innerHTML = html;
  }

  // ---- Time Picker Helpers ----
  function createTimePicker(id, defaultHour, defaultMin) {
    const hourEl = document.getElementById(id + 'Hour');
    const minEl = document.getElementById(id + 'Min');
    if (!hourEl || !minEl) return;

    hourEl.innerHTML = '';
    for (let h = 9; h <= 19; h++) {
      const opt = document.createElement('option');
      opt.value = String(h).padStart(2, '0');
      opt.textContent = String(h).padStart(2, '0');
      hourEl.appendChild(opt);
    }
    hourEl.value = String(defaultHour).padStart(2, '0');

    minEl.innerHTML = '';
    for (let m = 0; m < 60; m += 5) {
      const opt = document.createElement('option');
      opt.value = String(m).padStart(2, '0');
      opt.textContent = String(m).padStart(2, '0');
      minEl.appendChild(opt);
    }
    minEl.value = String(defaultMin).padStart(2, '0');
  }

  function getTimeValue(id) {
    const hourEl = document.getElementById(id + 'Hour');
    const minEl = document.getElementById(id + 'Min');
    if (!hourEl || !minEl) return null;
    return `${hourEl.value}:${minEl.value}`;
  }

  function setTimeValue(id, timeStr) {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':');
    const hourEl = document.getElementById(id + 'Hour');
    const minEl = document.getElementById(id + 'Min');
    if (hourEl) hourEl.value = h;
    if (minEl) minEl.value = m;
  }

  // ---- Day Modal ----
  function openDayModal(year, month, day) {
    selectedDate = { year, month, day };
    const key = dateKey(year, month, day);
    const data = scheduleData[key] || {};

    modalDate.textContent = formatDate(year, month, day);

    serviceOptionsEl.innerHTML = '';
    const noneBtn = document.createElement('button');
    noneBtn.className = 'service-btn none-btn' + (!data.service || data.service === 'none' ? ' selected' : '');
    noneBtn.textContent = 'なし';
    noneBtn.dataset.service = 'none';
    noneBtn.addEventListener('click', () => selectService('none'));
    serviceOptionsEl.appendChild(noneBtn);

    services.forEach(svc => {
      const btn = document.createElement('button');
      btn.className = 'service-btn' + (data.service === svc.id ? ' selected' : '');
      btn.textContent = svc.name;
      btn.dataset.service = svc.id;
      btn.style.borderColor = svc.color;
      btn.style.color = data.service === svc.id ? 'white' : svc.color;
      if (data.service === svc.id) btn.style.background = svc.color;
      btn.addEventListener('click', () => selectService(svc.id));
      serviceOptionsEl.appendChild(btn);
    });

    // Transport
    document.querySelectorAll('.transport-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.transport === (data.transport || 'none'));
    });

    // Time pickers (9:00-19:00)
    createTimePicker('schoolBus', 15, 0);
    createTimePicker('dayPickup', 15, 0);
    createTimePicker('selfPickup', 15, 0);
    createTimePicker('return', 16, 0);

    if (data.schoolBusTime) setTimeValue('schoolBus', data.schoolBusTime);
    if (data.dayPickupTime) setTimeValue('dayPickup', data.dayPickupTime);
    if (data.selfPickupTime) setTimeValue('selfPickup', data.selfPickupTime);
    if (data.returnTime) setTimeValue('return', data.returnTime);

    noteInput.value = data.note || '';
    dayModal.classList.add('active');
  }

  function selectService(serviceId) {
    document.querySelectorAll('#serviceOptions .service-btn').forEach(btn => {
      const svcId = btn.dataset.service;
      const svc = getServiceById(svcId);
      btn.classList.toggle('selected', svcId === serviceId);
      if (svc) {
        btn.style.background = svcId === serviceId ? svc.color : 'white';
        btn.style.color = svcId === serviceId ? 'white' : svc.color;
      }
    });
  }

  function closeDayModal() {
    dayModal.classList.remove('active');
    selectedDate = null;
  }

  function saveDaySchedule() {
    if (!selectedDate) return;
    const key = dateKey(selectedDate.year, selectedDate.month, selectedDate.day);

    const selectedServiceBtn = document.querySelector('#serviceOptions .service-btn.selected');
    const service = selectedServiceBtn ? selectedServiceBtn.dataset.service : 'none';

    const selectedTransportBtn = document.querySelector('.transport-btn.selected');
    const transport = selectedTransportBtn ? selectedTransportBtn.dataset.transport : 'none';

    const schoolBusTime = getTimeValue('schoolBus');
    const dayPickupTime = getTimeValue('dayPickup');
    const selfPickupTime = getTimeValue('selfPickup');
    const returnTime = getTimeValue('return');
    const note = noteInput.value.trim();

    scheduleData[key] = { service, transport, schoolBusTime, dayPickupTime, selfPickupTime, returnTime, note };
    saveSchedule();
    renderMonth();
    renderTomorrowPreview();
    closeDayModal();
  }

  function deleteDaySchedule() {
    if (!selectedDate) return;
    const key = dateKey(selectedDate.year, selectedDate.month, selectedDate.day);
    delete scheduleData[key];
    saveSchedule();
    renderMonth();
    renderTomorrowPreview();
    closeDayModal();
  }

  // ---- Settings Modal ----
  function openSettings() {
    renderServiceList();

    document.getElementById('notifyToggle').checked = settings.notify;
    document.getElementById('maxDaysInput').value = settings.maxDays || MAX_DAYS;

    const notifyHourEl = document.getElementById('notifyHour');
    const notifyMinuteEl = document.getElementById('notifyMinute');
    notifyHourEl.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = String(h).padStart(2, '0');
      if (h === settings.notifyHour) opt.selected = true;
      notifyHourEl.appendChild(opt);
    }
    notifyMinuteEl.innerHTML = '';
    for (let m = 0; m < 60; m += 15) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = String(m).padStart(2, '0');
      if (m === settings.notifyMinute) opt.selected = true;
      notifyMinuteEl.appendChild(opt);
    }

    const familyCodeDisplay = document.getElementById('familyCodeDisplay');
    if (familyCodeDisplay) {
      familyCodeDisplay.textContent = familyId || '未設定';
    }

    settingsModal.classList.add('active');
  }

  function closeSettings() {
    settingsModal.classList.remove('active');
  }

  function renderServiceList() {
    serviceListEl.innerHTML = '';
    services.forEach((svc, idx) => {
      const item = document.createElement('div');
      item.className = 'service-item';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = svc.name;
      nameInput.placeholder = 'サービス名';
      nameInput.dataset.idx = idx;
      nameInput.addEventListener('input', (e) => {
        services[idx].name = e.target.value;
      });

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = svc.color;
      colorInput.dataset.idx = idx;
      colorInput.addEventListener('input', (e) => {
        services[idx].color = e.target.value;
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        services.splice(idx, 1);
        renderServiceList();
      });

      item.appendChild(colorInput);
      item.appendChild(nameInput);
      item.appendChild(delBtn);
      serviceListEl.appendChild(item);
    });
  }

  function addService() {
    const id = 'svc_' + Date.now();
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
    const color = colors[services.length % colors.length];
    services.push({ id, name: '', color });
    renderServiceList();
    const inputs = serviceListEl.querySelectorAll('input[type="text"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  }

  function saveSettingsData() {
    services = services.filter(s => s.name.trim() !== '');
    services.forEach((s, i) => {
      if (!s.id) s.id = 'svc_' + Date.now() + '_' + i;
    });

    settings.notify = document.getElementById('notifyToggle').checked;
    settings.notifyHour = parseInt(document.getElementById('notifyHour').value);
    settings.notifyMinute = parseInt(document.getElementById('notifyMinute').value);
    settings.maxDays = parseInt(document.getElementById('maxDaysInput').value) || MAX_DAYS;

    saveServices();
    saveSettings();
    renderMonth();
    renderLegend();
    renderUsageCounter();
    setupNotification();
    closeSettings();
  }

  // ---- Navigation ----
  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    clampMonth();
    renderMonth();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    clampMonth();
    renderMonth();
  }

  function clampMonth() {
    if (currentYear < SCHOOL_YEAR_START.year ||
      (currentYear === SCHOOL_YEAR_START.year && currentMonth < SCHOOL_YEAR_START.month)) {
      currentYear = SCHOOL_YEAR_START.year;
      currentMonth = SCHOOL_YEAR_START.month;
    }
    if (currentYear > SCHOOL_YEAR_END.year ||
      (currentYear === SCHOOL_YEAR_END.year && currentMonth > SCHOOL_YEAR_END.month)) {
      currentYear = SCHOOL_YEAR_END.year;
      currentMonth = SCHOOL_YEAR_END.month;
    }
  }

  // ---- Notifications ----
  function setupNotification() {
    if (!settings.notify) return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (window._notifyInterval) clearInterval(window._notifyInterval);
    window._notifyInterval = setInterval(checkNotification, 60000);
  }

  function checkNotification() {
    if (!settings.notify) return;
    const now = new Date();
    if (now.getHours() === settings.notifyHour && now.getMinutes() === settings.notifyMinute) {
      sendNotification();
    }
  }

  function sendNotification() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = dateKey(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const data = scheduleData[key];

    if (!data || !data.service || data.service === 'none') return;

    const svc = getServiceById(data.service);
    let body = '';
    if (svc) body += `${svc.name}`;
    if (data.transport && data.transport !== 'none') {
      const t = TRANSPORT_LABELS[data.transport];
      body += ` / ${t.label}`;
    }
    if (data.returnTime) body += ` / 帰宅 ${data.returnTime}`;
    if (data.note) body += `\n${data.note}`;

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('明日の予定', { body, icon: 'icon-192.png' });
    }
  }

  // ---- Firebase Setup Flow ----
  function handleCreateFamily() {
    const code = generateFamilyId();
    setFamilyId(code);
    document.getElementById('familyCodeResult').textContent = code;
    document.getElementById('familyCodeResultSection').style.display = 'block';
    listenToFirebase();
    syncToFirebase();
  }

  function handleJoinFamily() {
    const input = document.getElementById('joinFamilyInput');
    const code = input.value.trim().toLowerCase();
    if (code.length < 4) {
      alert('家族コードを入力してください');
      return;
    }
    setFamilyId(code);
    listenToFirebase();
    closeFamilyModal();
    renderMonth();
  }

  function startFamilySync() {
    familyId = getFamilyId();
    if (familyId) {
      listenToFirebase();
      document.getElementById('familyCodeDisplay').textContent = familyId;
    }
  }

  // ---- Event Listeners ----
  document.getElementById('prevMonth').addEventListener('click', prevMonth);
  document.getElementById('nextMonth').addEventListener('click', nextMonth);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('modalClose').addEventListener('click', closeDayModal);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('saveBtn').addEventListener('click', saveDaySchedule);
  document.getElementById('deleteBtn').addEventListener('click', deleteDaySchedule);
  document.getElementById('addServiceBtn').addEventListener('click', addService);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsData);

  // Family modal
  document.getElementById('familySettingsBtn').addEventListener('click', showFamilyModal);
  document.getElementById('familyModalClose').addEventListener('click', closeFamilyModal);
  document.getElementById('createFamilyBtn').addEventListener('click', handleCreateFamily);
  document.getElementById('joinFamilyBtn').addEventListener('click', handleJoinFamily);

  familyModal.addEventListener('click', (e) => {
    if (e.target === familyModal) closeFamilyModal();
  });

  // Transport buttons
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.transport-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Notification toggle slider
  document.getElementById('notifySlider').addEventListener('click', () => {
    const toggle = document.getElementById('notifyToggle');
    toggle.checked = !toggle.checked;
  });

  // Close modals on overlay click
  dayModal.addEventListener('click', (e) => {
    if (e.target === dayModal) closeDayModal();
  });
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  // ---- Init ----
  function init() {
    loadData();

    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    if (!isInSchoolYear(currentYear, currentMonth)) {
      currentYear = SCHOOL_YEAR_START.year;
      currentMonth = SCHOOL_YEAR_START.month;
    }

    renderMonth();
    renderTomorrowPreview();
    setupNotification();

    if (initFirebase()) {
      startFamilySync();
      updateSyncStatus('synced');
    } else {
      updateSyncStatus('offline');
    }
  }

  init();

  // ---- Service Worker Registration ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
