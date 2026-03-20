// ============================================================
// DAIMATSU FAIR 2026 - Registration Form Logic
// ============================================================

(function () {
  'use strict';

  // ---- DOM Elements ----
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const form = document.getElementById('registrationForm');
  const confirmTable = document.querySelector('#confirmTable tbody');
  const backToInputBtn = document.getElementById('backToInput');
  const submitBtn = document.getElementById('submitBtn');
  const stepIndicators = document.querySelectorAll('.step');

  // ---- Form Fields ----
  const fields = {
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

  // ---- Validation Rules ----
  const ZENKAKU_REGEX = /^[^\x01-\x7E\uFF61-\uFF9F]+$/;
  const KATAKANA_REGEX = /^[\u30A0-\u30FF\u3000\s]+$/;
  const PHONE_REGEX = /^[0-9]{10,11}$/;
  const ENTRY_REGEX = /^[0-9]{5}$/;

  // ---- Validation ----
  function validateForm() {
    let isValid = true;
    clearErrors();

    // 会社名
    if (!fields.companyName.value.trim()) {
      showError('companyName', '会社名を入力してください');
      isValid = false;
    }

    // 会社名(カナ)
    if (!fields.companyKana.value.trim()) {
      showError('companyKana', '会社名(カナ)を入力してください');
      isValid = false;
    }

    // 氏名
    const lastName = fields.lastName.value.trim();
    const firstName = fields.firstName.value.trim();
    if (!lastName || !firstName) {
      showError('name', '姓と名を入力してください');
      isValid = false;
    } else if (!ZENKAKU_REGEX.test(lastName) || !ZENKAKU_REGEX.test(firstName)) {
      showError('name', '全角文字で入力してください');
      isValid = false;
    }

    // 氏名フリガナ
    const lastKana = fields.lastNameKana.value.trim();
    const firstKana = fields.firstNameKana.value.trim();
    if (!lastKana || !firstKana) {
      showError('nameKana', 'フリガナを入力してください');
      isValid = false;
    } else if (!KATAKANA_REGEX.test(lastKana) || !KATAKANA_REGEX.test(firstKana)) {
      showError('nameKana', '全角カタカナで入力してください');
      isValid = false;
    }

    // 電話番号（任意だが入力があればバリデーション）
    const phone = fields.phone.value.trim();
    if (phone && !PHONE_REGEX.test(phone)) {
      showError('phone', '半角数字10〜11桁で入力してください（ハイフンなし）');
      isValid = false;
    }

    // メールアドレス
    const email = fields.email.value.trim();
    if (!email) {
      showError('email', 'メールアドレスを入力してください');
      isValid = false;
    } else if (!isValidEmail(email)) {
      showError('email', '正しいメールアドレスを入力してください');
      isValid = false;
    }

    // メールアドレス確認
    const emailConfirm = fields.emailConfirm.value.trim();
    if (!emailConfirm) {
      showError('emailConfirm', '確認用メールアドレスを入力してください');
      isValid = false;
    } else if (email !== emailConfirm) {
      showError('emailConfirm', 'メールアドレスが一致しません');
      isValid = false;
    }

    // エントリー番号
    const entry = fields.entryNumber.value.trim();
    if (!entry) {
      showError('entryNumber', 'エントリー番号を入力してください');
      isValid = false;
    } else if (!ENTRY_REGEX.test(entry)) {
      showError('entryNumber', '数字5桁で入力してください');
      isValid = false;
    }

    // 利用規約
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
    const errEl = document.getElementById('err-' + fieldId);
    if (errEl) {
      errEl.textContent = message;
      errEl.classList.add('show');
    }
    // Add error class to input
    const input = fields[fieldId];
    if (input && input.classList) {
      input.classList.add('error');
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

  // ---- Build Confirmation Table ----
  function buildConfirmation() {
    var rows = [
      ['会社名', fields.companyName.value.trim()],
      ['会社名(カナ)', fields.companyKana.value.trim()],
      ['氏名', fields.lastName.value.trim() + '　' + fields.firstName.value.trim()],
      ['氏名フリガナ', fields.lastNameKana.value.trim() + '　' + fields.firstNameKana.value.trim()],
      ['電話番号', fields.phone.value.trim() || '未入力'],
      ['メールアドレス', fields.email.value.trim()],
      ['業種', fields.industry.value || '未選択'],
      ['エントリー番号', fields.entryNumber.value.trim()],
      ['同伴者数', fields.companions.value + '人'],
    ];

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

  // ---- Event Handlers ----

  // Step 1 → Step 2
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (validateForm()) {
      buildConfirmation();
      goToStep(2);
    } else {
      // Scroll to first error
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

  // Step 2 → Step 3
  submitBtn.addEventListener('click', function () {
    goToStep(3);
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

})();
