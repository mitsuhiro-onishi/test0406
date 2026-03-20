// ============================================================
// Shared Config Module
// 管理画面と登録フォームの両方から参照される設定管理
// ============================================================

var ExhibitionConfig = (function () {
  'use strict';

  var STORAGE_KEY_CONFIG = 'daimatsu_config';
  var STORAGE_KEY_REGISTRATIONS = 'daimatsu_registrations';

  // ---- Default Config ----
  var DEFAULT_CONFIG = {
    eventTitle: 'DAIMATSU FAIR\n2026',
    eventSubtitle: 'DAIMATSU FAIR 2026',
    eventDate: '4/23-4/24',
    eventVenue: 'INTEX NO.3',
    eventDateLong: '2026年4月23日（木）・24日（金）',
    eventVenueLong: 'インテックス大阪 3号館',
    copyright: 'Copyright © DAIMATSU co.,Ltd.',
    privacyUrl: '#',
    bannerImage: '',
    headerColorFrom: '#4a90d9',
    headerColorTo: '#6db0f0',
    industryOptions: [
      '製造業', '建設業', '卸売業', '小売業', '飲食業',
      'サービス業', 'IT・通信', '不動産業', '運輸業',
      '金融・保険業', '医療・福祉', '教育', '官公庁・団体', 'その他'
    ],
    maxCompanions: 4,
    fields: {
      companyName:   { label: '会社名',                visible: true, required: true,  fixed: true },
      companyKana:   { label: '会社名(カナ)',          visible: true, required: true,  fixed: false },
      name:          { label: '氏名（姓・名）',        visible: true, required: true,  fixed: true },
      nameKana:      { label: '氏名フリガナ（セイ・メイ）', visible: true, required: true,  fixed: false },
      phone:         { label: '電話番号',              visible: true, required: false, fixed: false },
      email:         { label: 'メールアドレス',        visible: true, required: true,  fixed: true },
      emailConfirm:  { label: 'メールアドレス（確認用）', visible: true, required: true,  fixed: false },
      industry:      { label: '業種',                  visible: true, required: false, fixed: false },
      entryNumber:   { label: 'エントリー番号',        visible: true, required: true,  fixed: false },
      companions:    { label: '同伴者情報',            visible: true, required: false, fixed: false },
    }
  };

  // ---- Config CRUD ----
  function loadConfig() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        var parsed = JSON.parse(saved);
        // Merge with defaults to ensure new fields exist
        return mergeDeep(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), parsed);
      }
    } catch (e) {
      console.error('Config load error:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }

  function resetConfig() {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
  }

  // ---- Registration CRUD ----
  function loadRegistrations() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRegistration(data) {
    var regs = loadRegistrations();
    data.id = generateTicketId();
    data.registeredAt = new Date().toISOString();
    regs.push(data);
    localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(regs));
    return data;
  }

  function clearRegistrations() {
    localStorage.removeItem(STORAGE_KEY_REGISTRATIONS);
  }

  function findRegistration(ticketId) {
    var regs = loadRegistrations();
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].id === ticketId) return regs[i];
    }
    return null;
  }

  // ---- Ticket ID Generation ----
  function generateTicketId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = '';
    for (var i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    var regs = loadRegistrations();
    var exists = regs.some(function (r) { return r.id === id; });
    return exists ? generateTicketId() : id;
  }

  // ---- Utility ----
  function mergeDeep(target, source) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }

  // ---- Public API ----
  return {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    resetConfig: resetConfig,
    loadRegistrations: loadRegistrations,
    saveRegistration: saveRegistration,
    clearRegistrations: clearRegistrations,
    findRegistration: findRegistration,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };

})();
