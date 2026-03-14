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
  let settings = { notify: false, notifyHour: 20, notifyMinute: 0 };
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
  const returnHourEl = document.getElementById('returnHour');
  const returnMinuteEl = document.getElementById('returnMinute');
  const noteInput = document.getElementById('noteInput');

  const settingsModal = document.getElementById('settingsModal');
  const serviceListEl = document.getElementById('serviceList');

  const familyModal = document.getElementById('familyModal');
  const syncStatus = document.getElementById('syncStatus');

  // ---- Firebase ----
  function initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded, using localStorage only');
      return false;
    }

    const config = getFirebaseConfig();
    if (!config) return false;

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      db = firebase.database();
      firebaseReady = true;
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      return false;
    }
  }

  function getFirebaseConfig() {
    const raw = localStorage.getItem('school-cal-firebase-config');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return null;
  }

  function saveFirebaseConfig(config) {
    localStorage.setItem('school-cal-firebase-config', JSON.stringify(config));
  }

  // ---- Firebase Sync ----
  function syncToFirebase() {
    if (!firebaseReady || !familyId || !db) return;
    updateSyncStatus('syncing');

    const ref = db.ref('families/' + familyId);
    ref.update({
      schedule: scheduleData,
      services: services,
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
        // First time: push current data
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

      renderMonth();
      renderTomorrowPreview();
      renderLegend();
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
      cell.className = classes;

      const dayNum = document.createElement('div');
      dayNum.className = 'day-number';
      dayNum.textContent = d;
      cell.appendChild(dayNum);

      const data = scheduleData[key];
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

    if (data.returnTime) {
      html += `<br>帰宅: ${data.returnTime}`;
    }

    if (data.note) {
      html += `<br>📝 ${data.note}`;
    }

    tomorrowContent.innerHTML = html;
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

    document.querySelectorAll('.transport-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.transport === (data.transport || 'none'));
    });

    populateTimeSelects();
    if (data.returnTime) {
      const [h, m] = data.returnTime.split(':');
      returnHourEl.value = h;
      returnMinuteEl.value = m;
    } else {
      returnHourEl.value = '15';
      returnMinuteEl.value = '00';
    }

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

  function populateTimeSelects() {
    returnHourEl.innerHTML = '';
    for (let h = 12; h <= 20; h++) {
      const opt = document.createElement('option');
      opt.value = String(h).padStart(2, '0');
      opt.textContent = String(h).padStart(2, '0');
      returnHourEl.appendChild(opt);
    }
    returnMinuteEl.innerHTML = '';
    for (let m = 0; m < 60; m += 5) {
      const opt = document.createElement('option');
      opt.value = String(m).padStart(2, '0');
      opt.textContent = String(m).padStart(2, '0');
      returnMinuteEl.appendChild(opt);
    }
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

    const returnTime = `${returnHourEl.value}:${returnMinuteEl.value}`;
    const note = noteInput.value.trim();

    scheduleData[key] = { service, transport, returnTime, note };
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

    // Show current family code
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

    saveServices();
    saveSettings();
    renderMonth();
    renderLegend();
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
  function handleFirebaseSetup() {
    const configInput = document.getElementById('firebaseConfigInput');
    const raw = configInput.value.trim();

    try {
      // Extract config object from pasted text
      let config;
      // Try to find the config object in the pasted text
      const match = raw.match(/\{[\s\S]*apiKey[\s\S]*\}/);
      if (match) {
        // Clean up: replace single quotes, remove trailing commas
        let cleaned = match[0]
          .replace(/(\w+):/g, '"$1":')  // quote keys
          .replace(/'/g, '"')            // single to double quotes
          .replace(/,\s*}/g, '}');       // trailing commas
        // Try parse
        try {
          config = JSON.parse(cleaned);
        } catch (e) {
          // Try eval-like approach for JS object
          config = {};
          const pairs = match[0].match(/(\w+)\s*:\s*["']([^"']+)["']/g);
          if (pairs) {
            pairs.forEach(pair => {
              const [, key, val] = pair.match(/(\w+)\s*:\s*["']([^"']+)["']/);
              config[key] = val;
            });
          }
        }
      } else {
        config = JSON.parse(raw);
      }

      if (!config.apiKey || !config.databaseURL) {
        alert('apiKey と databaseURL が必要です。Firebase設定を確認してください。');
        return;
      }

      saveFirebaseConfig(config);

      if (initFirebase()) {
        document.getElementById('firebaseSetupSection').style.display = 'none';
        document.getElementById('firebaseConnectedSection').style.display = 'block';
        startFamilySync();
      } else {
        alert('Firebase接続に失敗しました。設定を確認してください。');
      }
    } catch (e) {
      alert('設定の読み取りに失敗しました。Firebaseの設定をそのままコピー＆ペーストしてください。');
      console.error(e);
    }
  }

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
  document.getElementById('saveFirebaseConfigBtn').addEventListener('click', handleFirebaseSetup);
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

    // Try Firebase
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
