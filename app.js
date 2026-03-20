// ============================================================
// School Support App (スクールサポート)
// 養護学校のプリント読み取り・持ち物管理・スケジュール管理
// Firebase Realtime Database で家族共有対応
// ============================================================

(function () {
  'use strict';

  // ---- Constants ----
  const SCHOOL_YEAR_START = { year: 2026, month: 3 }; // April (0-indexed)
  const SCHOOL_YEAR_END = { year: 2027, month: 2 };   // March (0-indexed)
  const MAX_DAYS = 15;

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

  const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
  const DAY_NAMES_FULL = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

  // ---- State ----
  let currentView = 'home';
  let currentYear, currentMonth;
  let scheduleData = {};
  let services = [];
  let settings = { notify: false, notifyHour: 20, notifyMinute: 0, maxDays: MAX_DAYS, pickupTimes: {} };
  let selectedDate = null;
  let familyId = null;
  let db = null;
  let firebaseReady = false;

  // Packing list state
  let packingItems = [];
  let packingFilter = 'all';

  // OCR state
  let ocrParsedSchedule = [];
  let ocrParsedItems = [];
  let ocrParsedEvents = []; // 行事予定: { date: 'YYYY-MM-DD', day: '月', text: '...', schoolTime: '...' }

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
    if (typeof firebase === 'undefined') return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
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
    db.ref('families/' + familyId).update({
      schedule: scheduleData,
      services: services,
      settings: { maxDays: settings.maxDays },
      packingItems: packingItems,
      updatedAt: Date.now()
    }).then(() => updateSyncStatus('synced'))
      .catch(() => updateSyncStatus('error'));
  }

  function listenToFirebase() {
    if (!firebaseReady || !familyId || !db) return;
    db.ref('families/' + familyId).on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) { syncToFirebase(); return; }
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
      if (data.packingItems) {
        packingItems = data.packingItems;
        localStorage.setItem('school-packing-items', JSON.stringify(packingItems));
      }
      if (currentView === 'calendar') {
        renderMonth();
        renderUsageCounter();
        renderLegend();
      }
      renderTomorrowPreview();
      if (currentView === 'packing') renderPackingList();
      updatePackingBadge();
      updateSyncStatus('synced');
    });
  }

  function updateSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const map = {
      syncing: { text: '同期中...', color: '#F39C12' },
      synced: { text: '同期済み', color: '#27AE60' },
      error: { text: '同期エラー', color: '#E74C3C' },
      offline: { text: 'オフライン', color: '#999' },
    };
    const info = map[status] || { text: '', color: '' };
    el.textContent = info.text;
    el.style.color = info.color;
  }

  // ---- Family Code ----
  function getFamilyId() { return localStorage.getItem('school-cal-family-id'); }
  function setFamilyId(id) { familyId = id; localStorage.setItem('school-cal-family-id', id); }
  function generateFamilyId() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let r = '';
    for (let i = 0; i < 6; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
  }

  // ---- Persistence ----
  function loadData() {
    try { const r = localStorage.getItem('school-cal-data'); if (r) scheduleData = JSON.parse(r); } catch (e) { scheduleData = {}; }
    try { const r = localStorage.getItem('school-cal-services'); if (r) services = JSON.parse(r); else services = JSON.parse(JSON.stringify(DEFAULT_SERVICES)); } catch (e) { services = JSON.parse(JSON.stringify(DEFAULT_SERVICES)); }
    try { const r = localStorage.getItem('school-cal-settings'); if (r) settings = { ...settings, ...JSON.parse(r) }; } catch (e) {}
    try { const r = localStorage.getItem('school-packing-items'); if (r) packingItems = JSON.parse(r); } catch (e) { packingItems = []; }
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
  function savePackingItems() {
    localStorage.setItem('school-packing-items', JSON.stringify(packingItems));
    syncToFirebase();
  }

  // ---- Helpers ----
  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function isHoliday(key) { return HOLIDAYS.hasOwnProperty(key); }
  function isInSchoolYear(y, m) {
    if (y === SCHOOL_YEAR_START.year && m >= SCHOOL_YEAR_START.month) return true;
    if (y === SCHOOL_YEAR_END.year && m <= SCHOOL_YEAR_END.month) return true;
    return false;
  }
  function getServiceById(id) { return services.find(s => s.id === id); }
  function formatDate(y, m, d) {
    const date = new Date(y, m, d);
    return `${y}年${m + 1}月${d}日（${DAY_NAMES[date.getDay()]}）`;
  }
  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}（${DAY_NAMES[d.getDay()]}）`;
  }
  function todayKey() {
    const t = new Date();
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function tomorrowKey() {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }

  // ---- Toast ----
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ---- View Management ----
  function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewName + '-view').classList.add('active');

    const backBtn = document.getElementById('backBtn');
    const headerTitle = document.getElementById('headerTitle');

    if (viewName === 'home') {
      backBtn.style.display = 'none';
      headerTitle.textContent = 'スクールサポート';
    } else {
      backBtn.style.display = 'inline-block';
      const titles = {
        scanner: 'プリント読み取り',
        packing: '持ち物リスト',
        calendar: 'カレンダー',
      };
      headerTitle.textContent = titles[viewName] || '';
    }

    // View-specific init
    if (viewName === 'calendar') {
      renderMonth();
      renderTomorrowPreview();
    }
    if (viewName === 'packing') {
      renderPackingList();
    }
    if (viewName === 'home') {
      renderTomorrowPreview();
      updatePackingBadge();
      updateGreeting();
    }
  }

  function updateGreeting() {
    const hour = new Date().getHours();
    const el = document.getElementById('homeGreeting');
    if (hour < 10) el.textContent = 'おはようございます';
    else if (hour < 17) el.textContent = 'こんにちは';
    else el.textContent = 'こんばんは';
  }

  // ============================================================
  // CALENDAR (existing functionality preserved)
  // ============================================================

  function countMonthlyUsageByService(year, month) {
    const counts = {};
    let total = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      const data = scheduleData[key];
      if (data && data.service && data.service !== 'none') {
        total++;
        counts[data.service] = (counts[data.service] || 0) + 1;
      }
    }
    return { total, counts };
  }

  function renderUsageCounter() {
    const el = document.getElementById('usageCounter');
    if (!el) return;
    const { total, counts } = countMonthlyUsageByService(currentYear, currentMonth);
    const max = settings.maxDays || MAX_DAYS;
    const remaining = max - total;
    const barPercent = Math.min((total / max) * 100, 100);
    const barColor = remaining <= 2 ? '#E74C3C' : remaining <= 5 ? '#F39C12' : '#27AE60';
    let perServiceHtml = services.map(svc => {
      const cnt = counts[svc.id] || 0;
      if (cnt === 0) return '';
      return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;font-size:12px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${svc.color};display:inline-block;"></span>
        ${svc.name}: <strong>${cnt}</strong>回</span>`;
    }).join('');
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:13px;font-weight:600;">受給者証 利用状況</span>
        <span style="font-size:13px;"><strong>${total}</strong> / ${max}回　残り <strong style="color:${barColor}">${remaining}</strong>回</span>
      </div>
      <div style="background:#E0E0E0;border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
        <div style="background:${barColor};height:100%;width:${barPercent}%;border-radius:6px;transition:width 0.3s;"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;">${perServiceHtml}</div>`;
  }

  function renderMonth() {
    const year = currentYear;
    const month = currentMonth;
    const monthTitle = document.getElementById('monthTitle');
    const calendarGrid = document.getElementById('calendarGrid');
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
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
      if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d) classes += ' today';

      const data = scheduleData[key];
      let svcColor = null;
      const hasService = data && data.service && data.service !== 'none';
      const hasPersonalNote = data && (!data.service || data.service === 'none') && data.note;

      if (hasService) {
        const svc = getServiceById(data.service);
        if (svc) { svcColor = svc.color; classes += ' has-service'; }
      } else if (hasPersonalNote) {
        classes += ' has-personal';
      }

      cell.className = classes;
      if (svcColor) {
        cell.style.background = svcColor + '25';
        cell.style.borderLeft = `3px solid ${svcColor}`;
      } else if (hasPersonalNote) {
        cell.style.background = '#E0E0E0';
        cell.style.borderLeft = '3px solid #999';
      }

      const dayNum = document.createElement('div');
      dayNum.className = 'day-number';
      dayNum.textContent = d;
      if (svcColor && !classes.includes('today')) { dayNum.style.background = svcColor; dayNum.style.color = 'white'; }
      else if (hasPersonalNote && !classes.includes('today')) { dayNum.style.background = '#999'; dayNum.style.color = 'white'; }
      cell.appendChild(dayNum);

      if (hasService) {
        const svc = getServiceById(data.service);
        if (svc) {
          const badge = document.createElement('div');
          badge.className = 'service-badge';
          badge.style.background = svc.color;
          badge.textContent = svc.name;
          cell.appendChild(badge);
        }
        if (data.note) {
          const memoBadge = document.createElement('div');
          memoBadge.className = 'service-badge';
          memoBadge.style.background = '#999';
          memoBadge.style.fontSize = '7px';
          memoBadge.textContent = 'メモ';
          cell.appendChild(memoBadge);
        }
      } else if (hasPersonalNote) {
        const badge = document.createElement('div');
        badge.className = 'service-badge';
        badge.style.background = '#999';
        badge.textContent = 'メモ';
        cell.appendChild(badge);
      }

      cell.addEventListener('click', () => openDayModal(year, month, d));
      calendarGrid.appendChild(cell);
    }
    renderLegend();
    renderUsageCounter();
  }

  function renderLegend() {
    const legend = document.getElementById('legend');
    if (!legend) return;
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
    const tomorrowContent = document.getElementById('tomorrowContent');
    if (!tomorrowContent) return;
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
    if (svc) html += `<span class="preview-service" style="background:${svc.color}">${svc.name}</span> `;
    if (data.transport && data.transport !== 'none') {
      const t = TRANSPORT_LABELS[data.transport];
      html += `${t.icon} ${t.label} `;
    }
    if (data.transportTime) {
      const t = TRANSPORT_LABELS[data.transport];
      html += `<br>${t?.icon || ''} ${t?.label || '送迎'}: ${data.transportTime}`;
    }
    if (data.returnTime) html += `<br>🏠 帰宅: ${data.returnTime}`;
    if (data.note) html += `<br>📝 ${data.note}`;

    // Also show tomorrow's packing items
    const tomorrowItems = packingItems.filter(i => i.date === key && !i.checked);
    if (tomorrowItems.length > 0) {
      html += `<br>🎒 持ち物: ${tomorrowItems.map(i => i.text).join('、')}`;
    }

    tomorrowContent.innerHTML = html;
  }

  // ---- Time Picker ----
  function populateSelect(el, start, end, step, defaultVal) {
    if (!el) return;
    el.innerHTML = '';
    for (let v = start; v <= end; v += step) {
      const opt = document.createElement('option');
      opt.value = String(v).padStart(2, '0');
      opt.textContent = String(v).padStart(2, '0');
      el.appendChild(opt);
    }
    el.value = String(defaultVal).padStart(2, '0');
  }
  function getTimeFromSelects(hourId, minId) {
    const h = document.getElementById(hourId);
    const m = document.getElementById(minId);
    if (!h || !m) return null;
    return `${h.value}:${m.value}`;
  }
  function setTimeToSelects(hourId, minId, timeStr) {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':');
    const hEl = document.getElementById(hourId);
    const mEl = document.getElementById(minId);
    if (hEl) hEl.value = h;
    if (mEl) mEl.value = m;
  }

  const TRANSPORT_TIME_LABELS = {
    'school-bus': '🚌 バス時間',
    'day-pickup': '🚐 お迎え時間',
    'self-pickup': '🚗 送迎時間',
  };

  function showTransportTimeSection(transport) {
    const section = document.getElementById('timeSection');
    if (!section) return;
    if (transport === 'none') { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const label = document.getElementById('transportTimeLabel');
    if (label) label.textContent = TRANSPORT_TIME_LABELS[transport] || '送迎時間';
  }

  // ---- Day Modal ----
  function openDayModal(year, month, day) {
    selectedDate = { year, month, day };
    const key = dateKey(year, month, day);
    const data = scheduleData[key] || {};

    document.getElementById('modalDate').textContent = formatDate(year, month, day);
    const serviceOptionsEl = document.getElementById('serviceOptions');
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

    const currentTransport = data.transport || 'none';
    document.querySelectorAll('.transport-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.transport === currentTransport);
    });

    populateSelect(document.getElementById('transportHour'), 9, 19, 1, 15);
    populateSelect(document.getElementById('transportMin'), 0, 55, 5, 0);
    populateSelect(document.getElementById('returnHour'), 9, 19, 1, 16);
    populateSelect(document.getElementById('returnMin'), 0, 55, 5, 0);
    if (data.transportTime) setTimeToSelects('transportHour', 'transportMin', data.transportTime);
    if (data.returnTime) setTimeToSelects('returnHour', 'returnMin', data.returnTime);
    showTransportTimeSection(currentTransport);

    document.getElementById('noteInput').value = data.note || '';
    updateGcalButton();
    document.getElementById('dayModal').classList.add('active');
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
    document.getElementById('dayModal').classList.remove('active');
    selectedDate = null;
  }

  // ---- Google Calendar / ICS ----
  function generateIcsForMonth(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const events = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      const data = scheduleData[key];
      const hasService = data && data.service && data.service !== 'none';
      const hasNote = data && data.note;
      if (!hasService && !hasNote) continue;
      const svc = hasService ? getServiceById(data.service) : null;
      const title = svc ? svc.name : (data.note || '予定');
      const dateStr = `${year}${String(month + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
      let description = '';
      if (data.transport && data.transport !== 'none') {
        const t = TRANSPORT_LABELS[data.transport];
        description += `送迎: ${t.label}`;
        if (data.transportTime) description += ` ${data.transportTime}`;
        description += '\\n';
      }
      if (data.returnTime) description += `帰宅: ${data.returnTime}\\n`;
      if (data.note) description += `メモ: ${data.note}\\n`;
      let dtStart, dtEnd;
      if (data.transportTime && data.returnTime) {
        dtStart = `DTSTART;TZID=Asia/Tokyo:${dateStr}T${data.transportTime.replace(':', '')}00`;
        dtEnd = `DTEND;TZID=Asia/Tokyo:${dateStr}T${data.returnTime.replace(':', '')}00`;
      } else {
        dtStart = `DTSTART;VALUE=DATE:${dateStr}`;
        dtEnd = `DTEND;VALUE=DATE:${dateStr}`;
      }
      events.push('BEGIN:VEVENT', dtStart, dtEnd,
        `SUMMARY:${title}`, `DESCRIPTION:${description}`,
        `UID:${key}-${data.service}@school-calendar`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
        'END:VEVENT');
    }
    if (events.length === 0) return null;
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SchoolCalendar//JP',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Asia/Tokyo',
      ...events, 'END:VCALENDAR'].join('\r\n');
  }

  function exportMonthIcs() {
    const ics = generateIcsForMonth(currentYear, currentMonth);
    if (!ics) { alert('この月には予定がありません'); return; }
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${currentYear}_${String(currentMonth + 1).padStart(2, '0')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildGoogleCalendarUrl(dateInfo, data) {
    const { year, month, day } = dateInfo;
    const svc = data.service && data.service !== 'none' ? getServiceById(data.service) : null;
    const title = svc ? svc.name : (data.note || '予定');
    let details = '';
    if (data.transport && data.transport !== 'none') {
      const t = TRANSPORT_LABELS[data.transport];
      details += `送迎: ${t.icon} ${t.label}`;
      if (data.transportTime) details += ` ${data.transportTime}`;
      details += '\n';
    }
    if (data.returnTime) details += `帰宅: ${data.returnTime}\n`;
    if (data.note) details += `メモ: ${data.note}\n`;
    let dates;
    if (data.transportTime && data.returnTime) {
      const startDt = `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}T${data.transportTime.replace(':', '')}00`;
      const endDt = `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}T${data.returnTime.replace(':', '')}00`;
      dates = `${startDt}/${endDt}`;
    } else {
      const d = `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;
      dates = `${d}/${d}`;
    }
    return `https://calendar.google.com/calendar/render?${new URLSearchParams({
      action: 'TEMPLATE', text: title, dates: dates, details: details, ctz: 'Asia/Tokyo'
    }).toString()}`;
  }

  function updateGcalButton() {
    const btn = document.getElementById('addToGcalBtn');
    if (!btn || !selectedDate) return;
    const key = dateKey(selectedDate.year, selectedDate.month, selectedDate.day);
    const data = scheduleData[key];
    btn.style.display = (data && ((data.service && data.service !== 'none') || data.note)) ? 'block' : 'none';
  }

  function saveDaySchedule() {
    if (!selectedDate) return;
    const key = dateKey(selectedDate.year, selectedDate.month, selectedDate.day);
    const selectedServiceBtn = document.querySelector('#serviceOptions .service-btn.selected');
    const service = selectedServiceBtn ? selectedServiceBtn.dataset.service : 'none';
    const selectedTransportBtn = document.querySelector('.transport-btn.selected');
    const transport = selectedTransportBtn ? selectedTransportBtn.dataset.transport : 'none';
    const transportTime = transport !== 'none' ? getTimeFromSelects('transportHour', 'transportMin') : null;
    const returnTime = transport !== 'none' ? getTimeFromSelects('returnHour', 'returnMin') : null;
    const note = document.getElementById('noteInput').value.trim();
    scheduleData[key] = { service, transport, transportTime, returnTime, note };
    saveSchedule();
    renderMonth();
    renderTomorrowPreview();
    updateGcalButton();
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

  // ---- Settings ----
  function openSettings() {
    renderServiceList();
    document.getElementById('notifyToggle').checked = settings.notify;
    document.getElementById('maxDaysInput').value = settings.maxDays || MAX_DAYS;
    const notifyHourEl = document.getElementById('notifyHour');
    const notifyMinuteEl = document.getElementById('notifyMinute');
    notifyHourEl.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = String(h).padStart(2, '0');
      if (h === settings.notifyHour) opt.selected = true;
      notifyHourEl.appendChild(opt);
    }
    notifyMinuteEl.innerHTML = '';
    for (let m = 0; m < 60; m += 15) {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = String(m).padStart(2, '0');
      if (m === settings.notifyMinute) opt.selected = true;
      notifyMinuteEl.appendChild(opt);
    }
    renderPickupTimeSettings();
    document.getElementById('familyCodeDisplay').textContent = familyId || '未設定';
    document.getElementById('settingsModal').classList.add('active');
  }
  function closeSettings() { document.getElementById('settingsModal').classList.remove('active'); }

  function renderPickupTimeSettings() {
    const container = document.getElementById('pickupTimeSettings');
    if (!container) return;
    container.innerHTML = '';
    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
    const pt = settings.pickupTimes || {};

    [1, 2, 3, 4, 5].forEach(dow => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'pickup-dow-toggle';
      toggle.dataset.dow = dow;
      toggle.checked = pt[dow] ? true : false;
      toggle.style.cssText = 'width:18px;height:18px;accent-color:var(--primary);';

      const label = document.createElement('span');
      label.style.cssText = 'font-size:14px;font-weight:600;min-width:30px;';
      label.textContent = dowNames[dow];

      const timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.className = 'pickup-dow-time';
      timeInput.dataset.dow = dow;
      timeInput.value = pt[dow] || '15:00';
      timeInput.style.cssText = 'flex:1;padding:6px 8px;border:2px solid var(--border);border-radius:8px;font-size:14px;';

      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(timeInput);
      container.appendChild(row);
    });
  }

  function collectPickupTimes() {
    const result = {};
    document.querySelectorAll('.pickup-dow-toggle').forEach(toggle => {
      if (toggle.checked) {
        const dow = toggle.dataset.dow;
        const timeInput = document.querySelector(`.pickup-dow-time[data-dow="${dow}"]`);
        if (timeInput && timeInput.value) {
          result[dow] = timeInput.value;
        }
      }
    });
    return result;
  }

  function applyPickupTimesToCalendar(year, month) {
    const pt = settings.pickupTimes || {};
    if (Object.keys(pt).length === 0) return;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dow = date.getDay();
      const key = dateKey(year, month, d);

      if (pt[dow]) {
        const existing = scheduleData[key] || {};
        // 休日フラグが立っている日はスキップ
        if (existing.holiday) continue;
        scheduleData[key] = {
          ...existing,
          service: existing.service || 'none',
          transport: 'school-bus',
          transportTime: pt[dow],
          note: existing.note || '',
        };
      } else {
        // 設定にない曜日でバスが自動設定されていた場合はクリア
        const existing = scheduleData[key];
        if (existing && existing.transport === 'school-bus' && !existing.manualEdit) {
          delete existing.transportTime;
          existing.transport = 'none';
        }
      }
    }
    saveSchedule();
  }

  function renderServiceList() {
    const serviceListEl = document.getElementById('serviceList');
    serviceListEl.innerHTML = '';
    services.forEach((svc, idx) => {
      const item = document.createElement('div');
      item.className = 'service-item';
      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.value = svc.name; nameInput.placeholder = 'サービス名';
      nameInput.addEventListener('input', (e) => { services[idx].name = e.target.value; });
      const colorInput = document.createElement('input');
      colorInput.type = 'color'; colorInput.value = svc.color;
      colorInput.addEventListener('input', (e) => { services[idx].color = e.target.value; });
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => { services.splice(idx, 1); renderServiceList(); });
      item.appendChild(colorInput);
      item.appendChild(nameInput);
      item.appendChild(delBtn);
      serviceListEl.appendChild(item);
    });
  }

  function addService() {
    const id = 'svc_' + Date.now();
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
    services.push({ id, name: '', color: colors[services.length % colors.length] });
    renderServiceList();
    const inputs = document.getElementById('serviceList').querySelectorAll('input[type="text"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  }

  function saveSettingsData() {
    services = services.filter(s => s.name.trim() !== '');
    services.forEach((s, i) => { if (!s.id) s.id = 'svc_' + Date.now() + '_' + i; });
    settings.notify = document.getElementById('notifyToggle').checked;
    settings.notifyHour = parseInt(document.getElementById('notifyHour').value);
    settings.notifyMinute = parseInt(document.getElementById('notifyMinute').value);
    settings.maxDays = parseInt(document.getElementById('maxDaysInput').value) || MAX_DAYS;
    settings.pickupTimes = collectPickupTimes();
    saveServices();
    saveSettings();
    applyPickupTimesToCalendar(currentYear, currentMonth);
    if (currentView === 'calendar') { renderMonth(); renderLegend(); renderUsageCounter(); }
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
    if (currentYear < SCHOOL_YEAR_START.year || (currentYear === SCHOOL_YEAR_START.year && currentMonth < SCHOOL_YEAR_START.month)) {
      currentYear = SCHOOL_YEAR_START.year; currentMonth = SCHOOL_YEAR_START.month;
    }
    if (currentYear > SCHOOL_YEAR_END.year || (currentYear === SCHOOL_YEAR_END.year && currentMonth > SCHOOL_YEAR_END.month)) {
      currentYear = SCHOOL_YEAR_END.year; currentMonth = SCHOOL_YEAR_END.month;
    }
  }

  // ---- Notifications ----
  function setupNotification() {
    if (!settings.notify) return;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (window._notifyInterval) clearInterval(window._notifyInterval);
    window._notifyInterval = setInterval(checkNotification, 60000);
  }
  function checkNotification() {
    if (!settings.notify) return;
    const now = new Date();
    if (now.getHours() === settings.notifyHour && now.getMinutes() === settings.notifyMinute) sendNotification();
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
    if (data.transport && data.transport !== 'none') body += ` / ${TRANSPORT_LABELS[data.transport].label}`;
    if (data.returnTime) body += ` / 帰宅 ${data.returnTime}`;
    if (data.note) body += `\n${data.note}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('明日の予定', { body, icon: 'icon-192.png' });
    }
  }

  // ---- Family ----
  function showFamilyModal() {
    if (familyId) {
      document.getElementById('familyCodeResultSection').style.display = 'block';
      document.getElementById('familyCodeResult').textContent = familyId;
    }
    document.getElementById('familyModal').classList.add('active');
  }
  function closeFamilyModal() { document.getElementById('familyModal').classList.remove('active'); }
  function handleCreateFamily() {
    const code = generateFamilyId();
    setFamilyId(code);
    document.getElementById('familyCodeResult').textContent = code;
    document.getElementById('familyCodeResultSection').style.display = 'block';
    listenToFirebase();
    syncToFirebase();
  }
  function handleJoinFamily() {
    const code = document.getElementById('joinFamilyInput').value.trim().toLowerCase();
    if (code.length < 4) { alert('家族コードを入力してください'); return; }
    setFamilyId(code);
    listenToFirebase();
    closeFamilyModal();
    if (currentView === 'calendar') renderMonth();
  }
  function startFamilySync() {
    familyId = getFamilyId();
    if (familyId) {
      listenToFirebase();
      document.getElementById('familyCodeDisplay').textContent = familyId;
    }
  }

  // ============================================================
  // PACKING LIST
  // ============================================================

  function updatePackingBadge() {
    const badge = document.getElementById('packingBadge');
    const unchecked = packingItems.filter(i => !i.checked).length;
    if (unchecked > 0) {
      badge.style.display = 'block';
      badge.textContent = `${unchecked}件`;
    } else {
      badge.style.display = 'none';
    }
  }

  function renderPackingList() {
    const container = document.getElementById('packingListContainer');
    if (!container) return;
    container.innerHTML = '';

    const today = todayKey();
    const tomorrow = tomorrowKey();

    let filtered = [...packingItems];
    if (packingFilter === 'unchecked') filtered = filtered.filter(i => !i.checked);
    else if (packingFilter === 'checked') filtered = filtered.filter(i => i.checked);

    if (filtered.length === 0) {
      container.innerHTML = `<div class="packing-empty">
        <div class="packing-empty-icon">📋</div>
        <div>持ち物はありません</div>
      </div>`;
      return;
    }

    // Sort: unchecked first, then by deadline (urgent first), no-date last
    filtered.sort((a, b) => {
      // Unchecked before checked
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      // Both have dates: earlier first
      if (a.date && b.date) return a.date.localeCompare(b.date);
      // Has date before no date
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return 0;
    });

    // Single flat list
    filtered.forEach(item => container.appendChild(createPackingItemEl(item)));
  }

  function createPackingItemEl(item) {
    const el = document.createElement('div');
    el.className = 'packing-item' + (item.checked ? ' checked' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.checked;
    checkbox.addEventListener('change', () => {
      item.checked = checkbox.checked;
      savePackingItems();
      renderPackingList();
      updatePackingBadge();
    });

    const textWrapper = document.createElement('div');
    textWrapper.style.flex = '1';
    const text = document.createElement('div');
    text.className = 'packing-item-text';
    text.textContent = item.text;
    textWrapper.appendChild(text);

    if (item.date) {
      const today = todayKey();
      const tomorrow = tomorrowKey();
      const deadlineEl = document.createElement('div');
      deadlineEl.className = 'packing-item-date';
      let deadlineText = formatDateShort(item.date) + 'まで';
      if (item.date === today) {
        deadlineText = '今日まで';
        deadlineEl.style.color = 'var(--danger)';
        deadlineEl.style.fontWeight = '600';
      } else if (item.date === tomorrow) {
        deadlineText = '明日まで';
        deadlineEl.style.color = '#F39C12';
        deadlineEl.style.fontWeight = '600';
      } else if (item.date < today) {
        deadlineText = '期限切れ（' + formatDateShort(item.date) + '）';
        deadlineEl.style.color = 'var(--danger)';
        deadlineEl.style.fontWeight = '600';
      }
      deadlineEl.textContent = deadlineText;
      textWrapper.appendChild(deadlineEl);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'packing-item-delete';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      packingItems = packingItems.filter(i => i.id !== item.id);
      savePackingItems();
      renderPackingList();
      updatePackingBadge();
    });

    el.appendChild(checkbox);
    el.appendChild(textWrapper);
    el.appendChild(delBtn);
    return el;
  }

  function addPackingItem(text, date) {
    if (!text.trim()) return;
    packingItems.push({
      id: 'pkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      text: text.trim(),
      date: date || null,
      checked: false,
      source: 'manual',
    });
    savePackingItems();
    renderPackingList();
    updatePackingBadge();
  }

  // ============================================================
  // OCR & PRINT SCANNER
  // ============================================================

  function handleImageUpload(file) {
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = function (e) {
      const previewContainer = document.getElementById('previewContainer');
      const previewImage = document.getElementById('previewImage');
      previewImage.src = e.target.result;
      previewContainer.style.display = 'block';

      // Start OCR
      startOCR(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  async function startOCR(imageData) {
    const progressEl = document.getElementById('ocrProgress');
    const progressText = document.getElementById('ocrProgressText');
    const progressBar = document.getElementById('ocrProgressBar');
    const resultsEl = document.getElementById('ocrResults');

    progressEl.style.display = 'block';
    resultsEl.style.display = 'none';

    try {
      // Check if Tesseract is available
      if (typeof Tesseract === 'undefined') {
        progressText.textContent = 'OCRライブラリを読み込めませんでした';
        progressBar.style.width = '0%';
        // Fall back to manual input
        setTimeout(() => {
          progressEl.style.display = 'none';
          showManualInputFallback();
        }, 2000);
        return;
      }

      progressText.textContent = 'プリントを読み取り中...（初回は少し時間がかかります）';
      progressBar.style.width = '10%';

      const result = await Tesseract.recognize(imageData, 'jpn', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            progressBar.style.width = `${Math.max(10, pct)}%`;
            progressText.textContent = `読み取り中... ${pct}%`;
          } else if (m.status === 'loading language traineddata') {
            progressText.textContent = '日本語データを読み込み中...';
            progressBar.style.width = '5%';
          }
        }
      });

      progressBar.style.width = '100%';
      progressText.textContent = '解析完了！';

      const text = result.data.text;
      setTimeout(() => {
        progressEl.style.display = 'none';
        showOCRResults(text);
      }, 500);

    } catch (err) {
      console.error('OCR error:', err);
      progressText.textContent = '読み取りに失敗しました';
      setTimeout(() => {
        progressEl.style.display = 'none';
        showManualInputFallback();
      }, 2000);
    }
  }

  function showManualInputFallback() {
    const resultsEl = document.getElementById('ocrResults');
    resultsEl.style.display = 'block';
    document.getElementById('ocrScheduleCard').style.display = 'none';
    document.getElementById('ocrPackingCard').style.display = 'none';
    document.getElementById('ocrRawText').value = '';
    document.getElementById('ocrRawText').placeholder = '読み取りに失敗しました。\nプリントの内容を手入力してください。\n\n例：\n月曜日 14:30下校\n火曜日 15:00下校\n持ち物：体操着、水筒';
  }

  function showOCRResults(text) {
    const resultsEl = document.getElementById('ocrResults');
    resultsEl.style.display = 'block';

    document.getElementById('ocrRawText').value = text;

    // Parse the text
    parseOCRText(text);
  }

  function parseOCRText(text) {
    ocrParsedSchedule = [];
    ocrParsedItems = [];
    ocrParsedEvents = [];

    // Normalize text
    const normalized = text
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/：/g, ':')
      .replace(/，/g, ',');

    const lines = normalized.split('\n').map(l => l.trim()).filter(l => l);

    // ---- Detect monthly event calendar format ----
    // Look for header like "○月行事予定" or "令和○年度 ○月行事予定"
    let eventMonth = null;
    let eventYear = null;
    const dayMap = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };

    // Try to detect month from header
    for (const line of lines) {
      // "5月行事予定" or "5月 行事" or "令和8年度 5月"
      const monthMatch = line.match(/(\d{1,2})月\s*(?:行事|予定|の予定)/);
      if (monthMatch) {
        eventMonth = parseInt(monthMatch[1]) - 1; // 0-indexed
        // Try year from same line or nearby: "令和8年度" → 2026
        const reMatch = line.match(/令和\s*(\d{1,2})\s*年/);
        if (reMatch) {
          eventYear = 2018 + parseInt(reMatch[1]);
        }
        break;
      }
      // Also try "行事等及び校時" with month detected elsewhere
      if (/行事.*校時/.test(line)) {
        // Look for month in nearby lines
        for (const l2 of lines) {
          const m2 = l2.match(/(\d{1,2})月/);
          if (m2 && !l2.match(/～\d{1,2}月/)) {
            eventMonth = parseInt(m2[1]) - 1;
            break;
          }
        }
      }
    }

    // Default to current year if not found
    if (eventYear === null) {
      const now = new Date();
      eventYear = now.getFullYear();
      // If event month is Apr-Mar of school year
      if (eventMonth !== null && eventMonth < 3 && now.getMonth() >= 3) {
        eventYear = now.getFullYear() + 1;
      }
    }
    if (eventMonth === null) {
      // Fallback: detect from content - look for the most common "日 曜" pattern
      eventMonth = new Date().getMonth();
    }

    // Parse "日 曜 行事内容" rows
    // Pattern: number + day-char + text (e.g. "13 月 小・中学部入学式、視力検査")
    const eventEntries = [];
    const eventLineRegex = /^(\d{1,2})\s*[|｜]?\s*([月火水木金土日])\s*[|｜]?\s*(.*)/;
    // Also handle: "13月小・中学部入学式" (no space after day char)
    const eventLineRegex2 = /^(\d{1,2})\s*([月火水木金土日])\s*(.*)/;

    lines.forEach(line => {
      let match = line.match(eventLineRegex) || line.match(eventLineRegex2);
      if (!match) return;

      const dayNum = parseInt(match[1]);
      const dayChar = match[2];
      let eventText = match[3].trim();

      // Validate: day number should be 1-31
      if (dayNum < 1 || dayNum > 31) return;
      // Skip header rows like "日 曜 行事等及び校時"
      if (/行事|校時/.test(eventText) && eventText.length < 10) return;

      // Extract school time code from end of line (半, 水, 小1, etc.)
      let schoolTime = '';
      const timeCodeMatch = eventText.match(/\s+(半|水|小\d?|小1|小I)$/);
      if (timeCodeMatch) {
        schoolTime = timeCodeMatch[1];
        eventText = eventText.substring(0, eventText.length - timeCodeMatch[0].length).trim();
      }

      if (eventText.length === 0) return; // Skip empty events (just day/date)

      const dateStr = dateKey(eventYear, eventMonth, dayNum);
      eventEntries.push({
        date: dateStr,
        day: dayChar,
        dayNum,
        text: eventText,
        schoolTime,
        checked: true,
      });
    });

    if (eventEntries.length > 0) {
      ocrParsedEvents = eventEntries;
    }

    // ---- Parse day-of-week + time patterns (original logic) ----
    const dayPatterns = [
      { regex: /([月火水木金土日])(?:曜日?)?[^\d]*(\d{1,2})[:\s時](\d{2})?/g, type: 'dayTime' },
      { regex: /([月火水木金土日])(?:曜日?)?.*?(\d{1,2}時\d{2}分)/g, type: 'dayTimeFull' },
      { regex: /([月火水木金土日])(?:曜日?)?.*?下校[^\d]*(\d{1,2})[:\s時](\d{2})?/g, type: 'dismissal' },
    ];

    // Only parse day-time if we didn't find event calendar format
    if (ocrParsedEvents.length === 0) {
      const foundDays = new Set();
      lines.forEach(line => {
        for (const pat of dayPatterns) {
          const regex = new RegExp(pat.regex.source, pat.regex.flags);
          let match;
          while ((match = regex.exec(line)) !== null) {
            const dayChar = match[1];
            const dayIdx = dayMap[dayChar];
            if (dayIdx === undefined || foundDays.has(dayChar)) continue;

            let hour, min;
            if (pat.type === 'dayTimeFull') {
              const timeParts = match[2].match(/(\d{1,2})時(\d{2})分/);
              if (timeParts) { hour = timeParts[1]; min = timeParts[2]; }
            } else {
              hour = match[2];
              min = match[3] || '00';
            }

            if (hour) {
              const h = parseInt(hour);
              if (h >= 8 && h <= 19) {
                foundDays.add(dayChar);
                ocrParsedSchedule.push({
                  day: dayChar,
                  dayIndex: dayIdx,
                  time: `${String(h).padStart(2, '0')}:${String(parseInt(min)).padStart(2, '0')}`,
                  label: `${dayChar}曜日`,
                });
              }
            }
          }
        }
      });
      ocrParsedSchedule.sort((a, b) => {
        const order = [1, 2, 3, 4, 5, 6, 0];
        return order.indexOf(a.dayIndex) - order.indexOf(b.dayIndex);
      });
    }

    // Parse packing items with deadline detection
    // Look for: 持ち物, 準備物, もちもの, 用意するもの, etc.
    const itemKeywords = ['持ち物', '持物', 'もちもの', '準備物', '用意', '必要な物', '持参'];
    let inItemsSection = false;
    let sectionDeadline = null; // deadline detected for the current section
    const itemMap = new Map(); // item name -> { text, deadline }

    // Helper: detect date from text (e.g. "4月15日", "4/15", "月曜日", "明日")
    function detectDeadline(line) {
      // "○月○日" pattern
      const mdMatch = line.match(/(\d{1,2})[月/](\d{1,2})日?/);
      if (mdMatch) {
        const now = new Date();
        let y = now.getFullYear();
        const m = parseInt(mdMatch[1]) - 1;
        const d = parseInt(mdMatch[2]);
        // If the date is in the past, assume next year
        const candidate = new Date(y, m, d);
        if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          y++;
        }
        return dateKey(y, m, d);
      }
      // Day-of-week pattern: "月曜日に", "火曜までに"
      const dowMatch = line.match(/([月火水木金土日])曜日?(?:に|まで)/);
      if (dowMatch) {
        const dayMap = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };
        const targetDow = dayMap[dowMatch[1]];
        if (targetDow !== undefined) {
          const now = new Date();
          for (let i = 1; i <= 7; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + i);
            if (d.getDay() === targetDow) {
              return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
            }
          }
        }
      }
      // "明日" or "あした"
      if (/明日|あした/.test(line)) {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
      }
      // "明後日" or "あさって"
      if (/明後日|あさって/.test(line)) {
        const t = new Date();
        t.setDate(t.getDate() + 2);
        return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
      }
      return null;
    }

    lines.forEach((line, idx) => {
      // Check if this line starts a packing items section
      if (itemKeywords.some(kw => line.includes(kw))) {
        inItemsSection = true;
        // Detect deadline from this header line
        sectionDeadline = detectDeadline(line);
        // Extract items from same line after keyword
        const afterKeyword = line.replace(/.*?(?:持ち物|持物|もちもの|準備物|用意するもの|必要な物|持参)[：:\s]*/i, '');
        if (afterKeyword && afterKeyword !== line) {
          const lineDeadline = detectDeadline(afterKeyword) || sectionDeadline;
          extractItems(afterKeyword).forEach(item => {
            if (!itemMap.has(item)) itemMap.set(item, { text: item, deadline: lineDeadline });
          });
        }
        return;
      }

      if (inItemsSection) {
        // Empty line or new section ends the items section
        if (line.length < 2 || /^[\d０-９]|^[月火水木金土日]曜/.test(line)) {
          inItemsSection = false;
          sectionDeadline = null;
          return;
        }
        const lineDeadline = detectDeadline(line) || sectionDeadline;
        extractItems(line).forEach(item => {
          if (!itemMap.has(item)) itemMap.set(item, { text: item, deadline: lineDeadline });
        });
      }
    });

    // Also look for common school items mentioned anywhere
    const commonItems = [
      '体操着', '体操服', '水筒', '上靴', '上履き', 'うわばき',
      '給食セット', 'ナフキン', 'はし', 'スプーン', 'フォーク',
      '歯ブラシ', '歯磨き粉', 'コップ', 'タオル', 'ハンカチ',
      'ティッシュ', '連絡帳', 'プール', '水着', '水泳帽', 'ゴーグル',
      '雑巾', 'ぞうきん', '図書', '絵の具', 'クレヨン', 'のり', 'はさみ',
      'お弁当', 'おべんとう', 'エプロン', '三角巾',
    ];
    const fullText = normalized;
    commonItems.forEach(item => {
      if (fullText.includes(item) && !itemMap.has(item)) {
        // Try to find deadline near the mention
        const mentionIdx = fullText.indexOf(item);
        const context = fullText.substring(Math.max(0, mentionIdx - 30), mentionIdx + item.length + 30);
        const deadline = detectDeadline(context);
        itemMap.set(item, { text: item, deadline });
      }
    });

    ocrParsedItems = Array.from(itemMap.values());

    // Render parsed results
    renderOCRSchedule();
    renderOCREvents();
    renderOCRPackingItems();
  }

  function extractItems(text) {
    // Split by common delimiters
    return text
      .split(/[、,・\s　]+/)
      .map(s => s.trim().replace(/^[・\-\s]+/, '').replace(/[。\s]+$/, ''))
      .filter(s => s.length >= 2 && s.length <= 20);
  }

  function renderOCRSchedule() {
    const card = document.getElementById('ocrScheduleCard');
    const list = document.getElementById('ocrScheduleList');

    if (ocrParsedSchedule.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    ocrParsedSchedule.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'ocr-schedule-item';
      row.innerHTML = `
        <input type="checkbox" class="ocr-item-checkbox ocr-sched-checkbox" checked data-sched-idx="${idx}">
        <span class="ocr-schedule-day">${item.label}</span>
        <input type="time" class="ocr-schedule-time-input" data-sched-idx="${idx}" value="${item.time}">
        <span class="ocr-schedule-label">下校</span>
      `;
      list.appendChild(row);
    });
  }

  function renderOCREvents() {
    const card = document.getElementById('ocrEventsCard');
    const list = document.getElementById('ocrEventsList');
    if (!card || !list) return;

    if (ocrParsedEvents.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    ocrParsedEvents.forEach((evt, idx) => {
      const row = document.createElement('div');
      row.className = 'ocr-item-row';
      row.style.justifyContent = 'flex-start';
      const dateLabel = `${evt.dayNum}日(${evt.day})`;
      const timeLabel = evt.schoolTime ? `<span style="font-size:11px;background:var(--primary-light);color:var(--primary);padding:1px 6px;border-radius:4px;margin-left:6px;">${evt.schoolTime}</span>` : '';
      row.innerHTML = `
        <input type="checkbox" class="ocr-event-checkbox" checked data-idx="${idx}">
        <span style="font-size:13px;font-weight:600;min-width:60px;">${dateLabel}</span>
        <input type="text" class="ocr-item-text-input ocr-event-text" data-evt-idx="${idx}" value="${evt.text}" style="font-size:13px;">
        ${timeLabel}
      `;
      list.appendChild(row);
    });
  }


  function renderOCRPackingItems() {
    const card = document.getElementById('ocrPackingCard');
    const list = document.getElementById('ocrPackingList');

    if (ocrParsedItems.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    list.innerHTML = '';

    ocrParsedItems.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'ocr-item-row';
      const deadlineLabel = item.deadline ? `（${formatDateShort(item.deadline)}まで）` : '';
      row.innerHTML = `
        <input type="checkbox" class="ocr-item-checkbox" checked data-idx="${idx}">
        <input type="text" class="ocr-item-text-input" data-idx="${idx}" value="${item.text}${deadlineLabel}">
      `;
      list.appendChild(row);
    });
  }

  // Collect edited OCR data from inputs
  function collectEditedOCRData() {
    const schedules = [];
    const events = [];
    const items = [];

    // Collect schedule data from editable inputs
    document.querySelectorAll('.ocr-sched-checkbox').forEach(cb => {
      const idx = parseInt(cb.dataset.schedIdx);
      const timeInput = document.querySelector(`.ocr-schedule-time-input[data-sched-idx="${idx}"]`);
      if (cb.checked && timeInput && timeInput.value) {
        schedules.push({
          ...ocrParsedSchedule[idx],
          time: timeInput.value,
        });
      }
    });

    // Collect event data (with edited text)
    document.querySelectorAll('.ocr-event-checkbox').forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      if (cb.checked && ocrParsedEvents[idx]) {
        const textInput = document.querySelector(`.ocr-event-text[data-evt-idx="${idx}"]`);
        const editedText = textInput ? textInput.value.trim() : ocrParsedEvents[idx].text;
        events.push({ ...ocrParsedEvents[idx], text: editedText });
      }
    });

    // Collect packing items from editable inputs
    document.querySelectorAll('.ocr-item-checkbox[data-idx]').forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const textInput = document.querySelector(`.ocr-item-text-input[data-idx="${idx}"]`);
      if (cb.checked && textInput && textInput.value.trim()) {
        items.push(textInput.value.trim());
      }
    });

    return { schedules, events, items };
  }

  // Show confirmation modal
  function showOCRConfirmation() {
    const { schedules, events, items } = collectEditedOCRData();
    const pt = settings.pickupTimes || {};
    const hasPickup = Object.keys(pt).length > 0;
    const holidayKeywords = ['休み', '休日', '休校', '休業', '代休', '振替休', '祝日', '閉校'];

    if (events.length === 0 && items.length === 0) {
      showToast('反映するデータがありません。項目にチェックを入れてください。');
      return;
    }

    const body = document.getElementById('ocrConfirmBody');
    let html = '';
    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];

    if (events.length > 0) {
      // 休み日を検出してハイライト
      const holidayEvents = events.filter(evt => holidayKeywords.some(kw => evt.text.includes(kw)));
      html += '<div class="ocr-confirm-section"><h4>📅 行事予定</h4>';
      events.forEach(evt => {
        const isHol = holidayKeywords.some(kw => evt.text.includes(kw));
        const style = isHol ? ' style="color:#e74c3c;font-weight:600;"' : '';
        const badge = isHol ? ' 🚫お迎えなし' : '';
        html += `<div class="ocr-confirm-item"${style}>${evt.dayNum}日(${evt.day}) ${evt.text}${badge}</div>`;
      });
      html += '</div>';

      if (hasPickup) {
        html += '<div class="ocr-confirm-section"><h4>🚌 お迎え自動反映</h4>';
        html += `<div class="ocr-confirm-item">設定済みの曜日別お迎え時間をカレンダーに反映します</div>`;
        if (holidayEvents.length > 0) {
          html += `<div class="ocr-confirm-item" style="color:#e74c3c;">休み${holidayEvents.length}日はお迎えをスキップします</div>`;
        }
        html += '</div>';
      }
    }

    if (items.length > 0) {
      html += '<div class="ocr-confirm-section"><h4>🎒 追加する持ち物</h4>';
      items.forEach(item => {
        html += `<div class="ocr-confirm-item">・${item}</div>`;
      });
      html += '</div>';
    }

    body.innerHTML = html;
    document.getElementById('ocrConfirmOverlay').style.display = 'flex';
  }

  // Actually apply after confirmation
  function applyOCRResults() {
    document.getElementById('ocrConfirmOverlay').style.display = 'none';

    const { schedules, events, items } = collectEditedOCRData();
    let eventCount = 0;
    let itemCount = 0;
    let busCount = 0;

    // 休みキーワード: これらが含まれる日はお迎え不要
    const holidayKeywords = ['休み', '休日', '休校', '休業', '代休', '振替休', '祝日', '閉校'];

    // Apply event calendar to calendar notes + 休み検出
    const holidayDates = new Set();
    if (events.length > 0) {
      events.forEach(evt => {
        const key = evt.date;
        const existing = scheduleData[key] || {};
        const isHolidayEvent = holidayKeywords.some(kw => evt.text.includes(kw));
        const newNote = existing.note
          ? (existing.note.includes(evt.text) ? existing.note : existing.note + '\n' + evt.text)
          : evt.text;
        scheduleData[key] = {
          ...existing,
          service: existing.service || 'none',
          transport: existing.transport || 'none',
          note: newNote,
        };
        if (isHolidayEvent) {
          scheduleData[key].holiday = true;
          holidayDates.add(key);
        }
        eventCount++;
      });
    }

    // お迎え時間の自動反映（設定ベース + 休み日スキップ）
    const pt = settings.pickupTimes || {};
    if (Object.keys(pt).length > 0 && ocrParsedEvents.length > 0) {
      const firstEvt = ocrParsedEvents[0];
      const d0 = new Date(firstEvt.date);
      const targetYear = d0.getFullYear();
      const targetMonth = d0.getMonth();
      const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(targetYear, targetMonth, d);
        const dow = date.getDay();
        const key = dateKey(targetYear, targetMonth, d);

        // 土日はスキップ
        if (dow === 0 || dow === 6) continue;
        // 祝日スキップ
        if (isHoliday(key)) continue;
        // OCRで休みと検出された日はスキップ
        if (holidayDates.has(key)) continue;
        // 該当曜日の設定がなければスキップ
        if (!pt[dow]) continue;

        const existing = scheduleData[key] || {};
        scheduleData[key] = {
          ...existing,
          service: existing.service || 'none',
          transport: 'school-bus',
          transportTime: pt[dow],
          note: existing.note || '',
        };
        busCount++;
      }
    }

    if (eventCount > 0 || busCount > 0) saveSchedule();

    // Apply packing items
    items.forEach((text, idx) => {
      const exists = packingItems.some(i => i.text === text);
      if (!exists) {
        packingItems.push({
          id: 'pkg_' + Date.now() + '_' + idx,
          text: text,
          date: null,
          checked: false,
          source: 'ocr',
        });
        itemCount++;
      }
    });
    if (itemCount > 0) savePackingItems();

    // Show confirmation
    const parts = [];
    if (eventCount > 0) parts.push(`行事${eventCount}件`);
    if (busCount > 0) parts.push(`お迎え${busCount}日分`);
    if (holidayDates.size > 0) parts.push(`休み${holidayDates.size}日検出`);
    if (itemCount > 0) parts.push(`持ち物${itemCount}件`);
    const msg = parts.length > 0 ? parts.join('、') + 'を反映しました' : '反映するデータがありませんでした。';

    showToast(msg);
    updatePackingBadge();

    setTimeout(() => {
      resetScanner();
      switchView('home');
    }, 1500);
  }

  function resetScanner() {
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('ocrProgress').style.display = 'none';
    document.getElementById('ocrResults').style.display = 'none';
    document.getElementById('ocrRawText').value = '';
    document.getElementById('previewImage').src = '';
    ocrParsedSchedule = [];
    ocrParsedItems = [];
    ocrParsedEvents = [];
    const eventsCard = document.getElementById('ocrEventsCard');
    if (eventsCard) eventsCard.style.display = 'none';
  }

  // ============================================================
  // PRINT CALENDAR (A4)
  // ============================================================

  function printCalendar() {
    const year = currentYear;
    const month = currentMonth;
    const container = document.getElementById('printContainer');
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const today = new Date();
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    let html = `<div class="print-header">${year}年 ${monthNames[month]} スケジュール</div>`;
    html += '<table class="print-calendar-grid">';
    html += '<tr>';
    const dowClasses = ['sun', '', '', '', '', '', 'sat'];
    const dowNames = ['日', '月', '火', '水', '木', '金', '土'];
    dowNames.forEach((name, i) => {
      html += `<th class="${dowClasses[i]}">${name}</th>`;
    });
    html += '</tr>';

    let dayCounter = 1;
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      if (i % 7 === 0) html += '<tr>';

      if (i < firstDay || dayCounter > daysInMonth) {
        html += '<td></td>';
      } else {
        const d = dayCounter;
        const date = new Date(year, month, d);
        const dow = date.getDay();
        const key = dateKey(year, month, d);
        const data = scheduleData[key];
        const holiday = isHoliday(key);
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

        let tdClass = '';
        if (dow === 0 || holiday) tdClass = 'sun holiday';
        else if (dow === 6) tdClass = 'sat';
        if (isToday) tdClass += ' today';

        let cellContent = `<div class="print-day-num">${d}</div>`;

        if (holiday) {
          cellContent += `<div class="print-holiday-name">${HOLIDAYS[key]}</div>`;
        }

        if (data) {
          const hasService = data.service && data.service !== 'none';
          if (hasService) {
            const svc = getServiceById(data.service);
            if (svc) {
              cellContent += `<div class="print-service-tag" style="background:${svc.color};">${svc.name}</div>`;
            }
          }

          let details = [];
          if (data.transport && data.transport !== 'none') {
            const t = TRANSPORT_LABELS[data.transport];
            let line = `${t.icon} ${t.label}`;
            if (data.transportTime) line += ` ${data.transportTime}`;
            details.push(line);
          }
          if (data.returnTime) {
            details.push(`🏠 帰宅 ${data.returnTime}`);
          }
          if (data.note) {
            // Split long notes into lines
            const noteLines = data.note.split('\n');
            noteLines.forEach(nl => {
              if (nl.trim()) details.push(`📝 ${nl.trim()}`);
            });
          }

          if (details.length > 0) {
            cellContent += '<div class="print-detail">';
            details.forEach(line => {
              cellContent += `<div class="print-detail-line">${line}</div>`;
            });
            cellContent += '</div>';
          }
        }

        html += `<td class="${tdClass}">${cellContent}</td>`;
        dayCounter++;
      }

      if (i % 7 === 6) html += '</tr>';
    }

    html += '</table>';
    html += `<div class="print-footer">印刷日: ${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}</div>`;

    container.innerHTML = html;
    window.print();
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  // View navigation
  document.getElementById('goScanner').addEventListener('click', () => switchView('scanner'));
  document.getElementById('goPacking').addEventListener('click', () => switchView('packing'));
  document.getElementById('goCalendar').addEventListener('click', () => switchView('calendar'));
  document.getElementById('backBtn').addEventListener('click', () => {
    resetScanner();
    switchView('home');
  });

  // Calendar
  document.getElementById('prevMonth').addEventListener('click', prevMonth);
  document.getElementById('nextMonth').addEventListener('click', nextMonth);
  document.getElementById('modalClose').addEventListener('click', closeDayModal);
  document.getElementById('saveBtn').addEventListener('click', saveDaySchedule);
  document.getElementById('deleteBtn').addEventListener('click', deleteDaySchedule);
  document.getElementById('addToGcalBtn').addEventListener('click', () => {
    if (!selectedDate) return;
    const key = dateKey(selectedDate.year, selectedDate.month, selectedDate.day);
    const data = scheduleData[key];
    if (!data) return;
    window.open(buildGoogleCalendarUrl(selectedDate, data), '_blank');
  });
  document.getElementById('exportIcsBtn').addEventListener('click', exportMonthIcs);
  document.getElementById('printCalendarBtn').addEventListener('click', printCalendar);

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('addServiceBtn').addEventListener('click', addService);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsData);
  document.getElementById('notifySlider').addEventListener('click', () => {
    const toggle = document.getElementById('notifyToggle');
    toggle.checked = !toggle.checked;
  });

  // Family
  document.getElementById('familySettingsBtn').addEventListener('click', showFamilyModal);
  document.getElementById('familyModalClose').addEventListener('click', closeFamilyModal);
  document.getElementById('createFamilyBtn').addEventListener('click', handleCreateFamily);
  document.getElementById('joinFamilyBtn').addEventListener('click', handleJoinFamily);

  // Transport buttons
  document.querySelectorAll('.transport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.transport-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      showTransportTimeSection(btn.dataset.transport);
    });
  });

  // Modal close on overlay
  document.getElementById('dayModal').addEventListener('click', (e) => { if (e.target.id === 'dayModal') closeDayModal(); });
  document.getElementById('settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  document.getElementById('familyModal').addEventListener('click', (e) => { if (e.target.id === 'familyModal') closeFamilyModal(); });

  // Scanner
  document.getElementById('uploadZone').addEventListener('click', () => {
    document.getElementById('cameraInput').click();
  });
  document.getElementById('cameraBtn').addEventListener('click', () => {
    document.getElementById('cameraInput').click();
  });
  document.getElementById('galleryBtn').addEventListener('click', () => {
    document.getElementById('galleryInput').click();
  });
  document.getElementById('cameraInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageUpload(e.target.files[0]);
  });
  document.getElementById('galleryInput').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageUpload(e.target.files[0]);
  });
  document.getElementById('ocrApplyBtn').addEventListener('click', showOCRConfirmation);
  document.getElementById('ocrConfirmOk').addEventListener('click', applyOCRResults);
  document.getElementById('ocrConfirmBack').addEventListener('click', () => {
    document.getElementById('ocrConfirmOverlay').style.display = 'none';
  });
  document.getElementById('ocrRetryBtn').addEventListener('click', () => {
    resetScanner();
  });
  document.getElementById('reParseBtn').addEventListener('click', () => {
    const text = document.getElementById('ocrRawText').value;
    if (text.trim()) parseOCRText(text);
    else showToast('テキストを入力してください');
  });

  // Packing list
  document.getElementById('packingAddBtn').addEventListener('click', () => {
    const inline = document.getElementById('packingAddInline');
    inline.classList.toggle('active');
    if (inline.classList.contains('active')) {
      document.getElementById('packingNewItem').focus();
    }
  });
  document.getElementById('packingAddCancel').addEventListener('click', () => {
    document.getElementById('packingAddInline').classList.remove('active');
    document.getElementById('packingNewItem').value = '';
    document.getElementById('packingNewDate').value = '';
  });
  document.getElementById('packingAddSave').addEventListener('click', () => {
    const text = document.getElementById('packingNewItem').value;
    const dateVal = document.getElementById('packingNewDate').value;
    if (!text.trim()) { showToast('持ち物を入力してください'); return; }
    addPackingItem(text, dateVal || null);
    document.getElementById('packingNewItem').value = '';
    document.getElementById('packingNewDate').value = '';
    document.getElementById('packingAddInline').classList.remove('active');
    showToast('追加しました');
  });
  document.getElementById('packingNewItem').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('packingAddSave').click();
  });

  // Packing filter
  document.querySelectorAll('.packing-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.packing-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      packingFilter = btn.dataset.filter;
      renderPackingList();
    });
  });

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    loadData();
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    if (!isInSchoolYear(currentYear, currentMonth)) {
      currentYear = SCHOOL_YEAR_START.year;
      currentMonth = SCHOOL_YEAR_START.month;
    }

    updateGreeting();
    renderTomorrowPreview();
    updatePackingBadge();
    setupNotification();

    if (initFirebase()) {
      startFamilySync();
      updateSyncStatus('synced');
    } else {
      updateSyncStatus('offline');
    }
  }

  init();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
