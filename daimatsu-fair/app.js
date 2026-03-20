// ============================================================
// Exhibition Registration Form - Config-driven + QR Ticket
// ============================================================

(function () {
  'use strict';

  // ---- Load Config ----
  var config = ExhibitionConfig.loadConfig();

  // ---- DOM Elements ----
  var step1 = document.getElementById('step1');
  var step2 = document.getElementById('step2');
  var step3 = document.getElementById('step3');
  var form = document.getElementById('registrationForm');
  var confirmTable = document.querySelector('#confirmTable tbody');
  var backToInputBtn = document.getElementById('backToInput');
  var submitBtn = document.getElementById('submitBtn');
  var stepIndicators = document.querySelectorAll('.step');

  // ---- Form Fields ----
  var fields = {
    companyName: document.getElementById('companyName'),
    companyKana: document.getElementById('companyKana'),
    lastName: document.getElementById('lastName'),
    firstName: document.getElementById('firstName'),
    lastNameKana: document.getElementById('lastNameKana'),
    firstNameKana: document.getElementById('firstNameKana'),
    phone: document.getElementById('phone'),
    email: document.getElementById('email'),
    emailConfirm: document.getElementById('emailConfirm'),
    industry: document.getElementById('industry'),
    entryNumber: document.getElementById('entryNumber'),
    companions: document.getElementById('companions'),
    agreeTerms: document.getElementById('agreeTerms'),
  };

  // ---- Apply Config to UI ----
  function applyConfig() {
    // Page title
    document.getElementById('pageTitle').textContent = config.eventSubtitle + ' - ご来場事前登録';

    // Header
    var headerArea = document.getElementById('headerArea');
    headerArea.style.background = 'linear-gradient(135deg, ' + config.headerColorFrom + ' 0%, ' + config.headerColorTo + ' 100%)';

    if (config.bannerImage) {
      document.getElementById('headerBanner').style.display = 'block';
      document.getElementById('bannerImg').src = config.bannerImage;
      document.getElementById('headerText').style.display = 'none';
    } else {
      document.getElementById('headerBanner').style.display = 'none';
      document.getElementById('headerText').style.display = '';
      document.getElementById('headerTitle').innerHTML = escHtml(config.eventTitle).replace(/\n/g, '<br>');
      document.getElementById('headerInfo').textContent = config.eventDate + ' ' + config.eventVenue;
    }
    document.getElementById('headerSubtitle').textContent = config.eventSubtitle;

    // Privacy link
    document.getElementById('policyLink').href = config.privacyUrl || '#';

    // Footer
    document.getElementById('footerArea').innerHTML = escHtml(config.copyright);

    // Industry dropdown
    var industrySelect = document.getElementById('industry');
    industrySelect.innerHTML = '<option value="">▼選択してください</option>';
    config.industryOptions.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      industrySelect.appendChild(o);
    });

    // Companion dropdown
    var compSelect = document.getElementById('companions');
    compSelect.innerHTML = '';
    for (var i = 0; i <= config.maxCompanions; i++) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = i + '人';
      compSelect.appendChild(o);
    }

    // Field visibility
    var fieldGroupMap = {
      companyName: 'group-companyName',
      companyKana: 'group-companyKana',
      name: 'group-name',
      nameKana: 'group-nameKana',
      phone: 'group-phone',
      email: 'group-email',
      emailConfirm: 'group-emailConfirm',
      industry: 'group-industry',
      entryNumber: 'group-entryNumber',
      companions: 'group-companions',
    };

    Object.keys(fieldGroupMap).forEach(function (key) {
      var fieldConfig = config.fields[key];
      var groupEl = document.getElementById(fieldGroupMap[key]);
      if (groupEl && fieldConfig) {
        groupEl.style.display = fieldConfig.visible ? '' : 'none';
      }
    });
  }

  // ---- Validation ----
  var ZENKAKU_REGEX = /^[^\x01-\x7E\uFF61-\uFF9F]+$/;
  var KATAKANA_REGEX = /^[\u30A0-\u30FF\u3000\s]+$/;
  var PHONE_REGEX = /^[0-9]{10,11}$/;
  var ENTRY_REGEX = /^[0-9]{5}$/;

  function isFieldActive(key) {
    return config.fields[key] && config.fields[key].visible;
  }

  function isFieldRequired(key) {
    return config.fields[key] && config.fields[key].visible && config.fields[key].required;
  }

  function validateForm() {
    var isValid = true;
    clearErrors();

    if (isFieldActive('companyName') && isFieldRequired('companyName')) {
      if (!fields.companyName.value.trim()) {
        showError('companyName', '会社名を入力してください');
        isValid = false;
      }
    }

    if (isFieldActive('companyKana') && isFieldRequired('companyKana')) {
      if (!fields.companyKana.value.trim()) {
        showError('companyKana', '会社名(カナ)を入力してください');
        isValid = false;
      }
    }

    if (isFieldActive('name')) {
      var lastName = fields.lastName.value.trim();
      var firstName = fields.firstName.value.trim();
      if (isFieldRequired('name') && (!lastName || !firstName)) {
        showError('name', '姓と名を入力してください');
        isValid = false;
      } else if (lastName && firstName && (!ZENKAKU_REGEX.test(lastName) || !ZENKAKU_REGEX.test(firstName))) {
        showError('name', '全角文字で入力してください');
        isValid = false;
      }
    }

    if (isFieldActive('nameKana')) {
      var lastKana = fields.lastNameKana.value.trim();
      var firstKana = fields.firstNameKana.value.trim();
      if (isFieldRequired('nameKana') && (!lastKana || !firstKana)) {
        showError('nameKana', 'フリガナを入力してください');
        isValid = false;
      } else if (lastKana && firstKana && (!KATAKANA_REGEX.test(lastKana) || !KATAKANA_REGEX.test(firstKana))) {
        showError('nameKana', '全角カタカナで入力してください');
        isValid = false;
      }
    }

    if (isFieldActive('phone')) {
      var phone = fields.phone.value.trim();
      if (isFieldRequired('phone') && !phone) {
        showError('phone', '電話番号を入力してください');
        isValid = false;
      } else if (phone && !PHONE_REGEX.test(phone)) {
        showError('phone', '半角数字10〜11桁で入力してください（ハイフンなし）');
        isValid = false;
      }
    }

    if (isFieldActive('email')) {
      var email = fields.email.value.trim();
      if (!email) {
        showError('email', 'メールアドレスを入力してください');
        isValid = false;
      } else if (!isValidEmail(email)) {
        showError('email', '正しいメールアドレスを入力してください');
        isValid = false;
      }
    }

    if (isFieldActive('emailConfirm')) {
      var emailConfirm = fields.emailConfirm.value.trim();
      if (!emailConfirm) {
        showError('emailConfirm', '確認用メールアドレスを入力してください');
        isValid = false;
      } else if (fields.email.value.trim() !== emailConfirm) {
        showError('emailConfirm', 'メールアドレスが一致しません');
        isValid = false;
      }
    }

    if (isFieldActive('entryNumber') && isFieldRequired('entryNumber')) {
      var entry = fields.entryNumber.value.trim();
      if (!entry) {
        showError('entryNumber', 'エントリー番号を入力してください');
        isValid = false;
      } else if (!ENTRY_REGEX.test(entry)) {
        showError('entryNumber', '数字5桁で入力してください');
        isValid = false;
      }
    }

    if (!fields.agreeTerms.checked) {
      showError('agreeTerms', '利用規約に同意してください');
      isValid = false;
    }

    return isValid;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showError(fieldId, message) {
    var errEl = document.getElementById('err-' + fieldId);
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.add('show');
    }
  }

  function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(function (el) {
      el.textContent = '';
      el.classList.remove('show');
    });
    document.querySelectorAll('input.error').forEach(function (el) {
      el.classList.remove('error');
    });
  }

  // ---- Step Navigation ----
  function goToStep(step) {
    step1.style.display = step === 1 ? '' : 'none';
    step2.style.display = step === 2 ? '' : 'none';
    step3.style.display = step === 3 ? '' : 'none';

    stepIndicators.forEach(function (el) {
      var s = parseInt(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (s === step) el.classList.add('active');
      if (s < step) el.classList.add('completed');
    });

    window.scrollTo(0, 0);
  }

  // ---- Build Confirmation ----
  function buildConfirmation() {
    var rows = [];

    if (isFieldActive('companyName')) rows.push(['会社名', fields.companyName.value.trim()]);
    if (isFieldActive('companyKana')) rows.push(['会社名(カナ)', fields.companyKana.value.trim()]);
    if (isFieldActive('name')) rows.push(['氏名', fields.lastName.value.trim() + '　' + fields.firstName.value.trim()]);
    if (isFieldActive('nameKana')) rows.push(['氏名フリガナ', fields.lastNameKana.value.trim() + '　' + fields.firstNameKana.value.trim()]);
    if (isFieldActive('phone')) rows.push(['電話番号', fields.phone.value.trim() || '未入力']);
    if (isFieldActive('email')) rows.push(['メールアドレス', fields.email.value.trim()]);
    if (isFieldActive('industry')) rows.push(['業種', fields.industry.value || '未選択']);
    if (isFieldActive('entryNumber')) rows.push(['エントリー番号', fields.entryNumber.value.trim()]);
    if (isFieldActive('companions')) rows.push(['同伴者数', fields.companions.value + '人']);

    confirmTable.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      var td = document.createElement('td');
      th.textContent = row[0];
      td.textContent = row[1];
      tr.appendChild(th);
      tr.appendChild(td);
      confirmTable.appendChild(tr);
    });
  }

  // ---- Registration & Ticket ----
  function submitRegistration() {
    var data = {
      companyName: fields.companyName.value.trim(),
      companyKana: fields.companyKana.value.trim(),
      lastName: fields.lastName.value.trim(),
      firstName: fields.firstName.value.trim(),
      lastNameKana: fields.lastNameKana.value.trim(),
      firstNameKana: fields.firstNameKana.value.trim(),
      phone: fields.phone.value.trim(),
      email: fields.email.value.trim(),
      industry: fields.industry.value,
      entryNumber: fields.entryNumber.value.trim(),
      companions: parseInt(fields.companions.value) || 0,
    };

    // Save registration and get ticket ID
    var savedData = ExhibitionConfig.saveRegistration(data);

    // Build ticket
    renderTicket(savedData);

    goToStep(3);
  }

  function renderTicket(data) {
    // Ticket header
    document.getElementById('ticketEventTitle').textContent = config.eventSubtitle;
    document.getElementById('ticketEventInfo').textContent = config.eventDateLong;
    document.getElementById('ticketVenue').textContent = config.eventVenueLong;

    // Ticket header color
    var ticketHeader = document.getElementById('ticketHeader');
    ticketHeader.style.background = 'linear-gradient(135deg, ' + config.headerColorFrom + ' 0%, ' + config.headerColorTo + ' 100%)';

    // Ticket details
    document.getElementById('ticketId').textContent = 'ID: ' + data.id;
    document.getElementById('ticketCompany').textContent = data.companyName;
    document.getElementById('ticketName').textContent = data.lastName + ' ' + data.firstName;

    if (data.companions > 0) {
      document.getElementById('ticketCompanionRow').style.display = '';
      document.getElementById('ticketCompanions').textContent = data.companions + '名';
    }

    // Generate QR code
    var qrContainer = document.getElementById('ticketQr');
    qrContainer.innerHTML = '';

    var qrData = JSON.stringify({
      ticketId: data.id,
      company: data.companyName,
      name: data.lastName + ' ' + data.firstName,
      companions: data.companions,
      email: data.email,
    });

    if (typeof QRCode !== 'undefined') {
      var canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, qrData, {
        width: 200,
        margin: 2,
        color: { dark: '#333333', light: '#ffffff' }
      }, function (err) {
        if (err) {
          console.error('QR generation error:', err);
          qrContainer.textContent = 'QR生成エラー';
          return;
        }
        qrContainer.appendChild(canvas);
      });
    }
  }

  // ---- Save Ticket as Image ----
  document.getElementById('saveTicketBtn').addEventListener('click', function () {
    var ticketEl = document.getElementById('ticketArea');
    if (typeof html2canvas === 'undefined') {
      alert('画像保存機能を読み込み中です。しばらくお待ちください。');
      return;
    }
    html2canvas(ticketEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = 'admission-ticket.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  });

  // ---- Event Handlers ----

  // Step 1 → Step 2
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (validateForm()) {
      buildConfirmation();
      goToStep(2);
    } else {
      var firstError = document.querySelector('.error-msg.show');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  // Step 2 → Step 1
  backToInputBtn.addEventListener('click', function () {
    goToStep(1);
  });

  // Step 2 → Step 3 (Submit)
  submitBtn.addEventListener('click', function () {
    submitRegistration();
  });

  // Clear error on input
  Object.keys(fields).forEach(function (key) {
    var el = fields[key];
    if (!el) return;
    var eventType = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventType, function () {
      var errEl = document.getElementById('err-' + key);
      if (errEl) {
        errEl.textContent = '';
        errEl.classList.remove('show');
      }
      el.classList.remove('error');
    });
  });

  // ---- Utility ----
  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Init ----
  applyConfig();

})();
