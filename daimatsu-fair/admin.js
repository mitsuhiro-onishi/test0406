// ============================================================
// Admin Panel Logic
// ============================================================

(function () {
  'use strict';

  var config = ExhibitionConfig.loadConfig();

  // ---- Tab Navigation ----
  var navBtns = document.querySelectorAll('.nav-btn');
  var tabs = document.querySelectorAll('.tab-content');

  navBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tabId = btn.dataset.tab;
      navBtns.forEach(function (b) { b.classList.remove('active'); });
      tabs.forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');

      if (tabId === 'registrations') renderRegistrations();
    });
  });

  // ---- Event Settings ----
  function loadEventSettings() {
    document.getElementById('eventTitle').value = config.eventTitle.replace(/\n/g, ' ');
    document.getElementById('eventSubtitle').value = config.eventSubtitle;
    document.getElementById('eventDate').value = config.eventDate;
    document.getElementById('eventVenue').value = config.eventVenue;
    document.getElementById('eventDateLong').value = config.eventDateLong;
    document.getElementById('eventVenueLong').value = config.eventVenueLong;
    document.getElementById('eventCopyright').value = config.copyright;
    document.getElementById('privacyUrl').value = config.privacyUrl;
    document.getElementById('headerColorFrom').value = config.headerColorFrom;
    document.getElementById('headerColorTo').value = config.headerColorTo;
    document.getElementById('industryOptions').value = config.industryOptions.join('\n');

    // Banner
    if (config.bannerImage) {
      document.getElementById('bannerPreview').innerHTML =
        '<img src="' + config.bannerImage + '" alt="バナー">';
    }
  }

  document.getElementById('saveEventSettings').addEventListener('click', function () {
    config.eventTitle = document.getElementById('eventTitle').value.trim();
    config.eventSubtitle = document.getElementById('eventSubtitle').value.trim();
    config.eventDate = document.getElementById('eventDate').value.trim();
    config.eventVenue = document.getElementById('eventVenue').value.trim();
    config.eventDateLong = document.getElementById('eventDateLong').value.trim();
    config.eventVenueLong = document.getElementById('eventVenueLong').value.trim();
    config.copyright = document.getElementById('eventCopyright').value.trim();
    config.privacyUrl = document.getElementById('privacyUrl').value.trim();
    config.headerColorFrom = document.getElementById('headerColorFrom').value;
    config.headerColorTo = document.getElementById('headerColorTo').value;

    var optText = document.getElementById('industryOptions').value.trim();
    config.industryOptions = optText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);

    ExhibitionConfig.saveConfig(config);
    showToast('設定を保存しました');
  });

  // Banner upload
  document.getElementById('bannerUpload').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      config.bannerImage = ev.target.result;
      document.getElementById('bannerPreview').innerHTML =
        '<img src="' + ev.target.result + '" alt="バナー">';
      ExhibitionConfig.saveConfig(config);
      showToast('バナー画像を更新しました');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('removeBanner').addEventListener('click', function () {
    config.bannerImage = '';
    document.getElementById('bannerPreview').innerHTML =
      '<span class="banner-placeholder">画像未設定</span>';
    ExhibitionConfig.saveConfig(config);
    showToast('バナー画像を削除しました');
  });

  // ---- Form Fields Settings ----
  function loadFieldSettings() {
    var tbody = document.getElementById('fieldsTableBody');
    tbody.innerHTML = '';
    var fieldKeys = Object.keys(config.fields);

    fieldKeys.forEach(function (key) {
      var f = config.fields[key];
      var tr = document.createElement('tr');

      // Visible checkbox
      var tdVis = document.createElement('td');
      var cbVis = document.createElement('input');
      cbVis.type = 'checkbox';
      cbVis.checked = f.visible;
      cbVis.disabled = f.fixed;
      cbVis.dataset.key = key;
      cbVis.dataset.prop = 'visible';
      tdVis.appendChild(cbVis);
      tr.appendChild(tdVis);

      // Label
      var tdLabel = document.createElement('td');
      tdLabel.textContent = f.label;
      if (f.fixed) tdLabel.style.fontWeight = '700';
      tr.appendChild(tdLabel);

      // Required checkbox
      var tdReq = document.createElement('td');
      var cbReq = document.createElement('input');
      cbReq.type = 'checkbox';
      cbReq.checked = f.required;
      cbReq.disabled = f.fixed;
      cbReq.dataset.key = key;
      cbReq.dataset.prop = 'required';
      tdReq.appendChild(cbReq);
      tr.appendChild(tdReq);

      tbody.appendChild(tr);
    });

    document.getElementById('maxCompanions').value = config.maxCompanions;
  }

  document.getElementById('saveFieldSettings').addEventListener('click', function () {
    var checkboxes = document.querySelectorAll('#fieldsTableBody input[type="checkbox"]');
    checkboxes.forEach(function (cb) {
      var key = cb.dataset.key;
      var prop = cb.dataset.prop;
      if (key && prop && !config.fields[key].fixed) {
        config.fields[key][prop] = cb.checked;
      }
    });
    config.maxCompanions = parseInt(document.getElementById('maxCompanions').value) || 4;
    ExhibitionConfig.saveConfig(config);
    showToast('フォーム設定を保存しました');
  });

  // ---- Registrations ----
  function renderRegistrations(searchQuery) {
    var regs = ExhibitionConfig.loadRegistrations();
    var container = document.getElementById('regList');
    var countEl = document.getElementById('regCount');

    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      regs = regs.filter(function (r) {
        return (r.companyName || '').toLowerCase().includes(q) ||
               (r.lastName || '').includes(q) ||
               (r.firstName || '').includes(q) ||
               (r.id || '').toLowerCase().includes(q);
      });
    }

    countEl.textContent = regs.length + '件';

    if (regs.length === 0) {
      container.innerHTML = '<p class="empty-msg">登録データはありません</p>';
      return;
    }

    // Sort by newest first
    regs.sort(function (a, b) {
      return new Date(b.registeredAt) - new Date(a.registeredAt);
    });

    container.innerHTML = '';
    regs.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'reg-item';
      var date = new Date(r.registeredAt);
      var dateStr = date.getFullYear() + '/' +
        String(date.getMonth() + 1).padStart(2, '0') + '/' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0');

      div.innerHTML =
        '<div class="reg-item-header">' +
          '<span class="reg-item-company">' + escHtml(r.companyName || '') + '</span>' +
          '<span class="reg-item-id">ID: ' + escHtml(r.id) + '</span>' +
        '</div>' +
        '<div class="reg-item-name">' + escHtml(r.lastName || '') + ' ' + escHtml(r.firstName || '') +
          (r.companions > 0 ? '（＋同伴者' + r.companions + '名）' : '') + '</div>' +
        '<div class="reg-item-meta">' +
          '<span>' + escHtml(r.email || '') + '</span>' +
          '<span>' + dateStr + '</span>' +
        '</div>';

      container.appendChild(div);
    });
  }

  document.getElementById('regSearch').addEventListener('input', function () {
    renderRegistrations(this.value);
  });

  document.getElementById('clearRegistrations').addEventListener('click', function () {
    if (confirm('全ての登録データを削除してよろしいですか？この操作は取り消せません。')) {
      ExhibitionConfig.clearRegistrations();
      renderRegistrations();
      showToast('登録データを削除しました');
    }
  });

  document.getElementById('exportCsv').addEventListener('click', function () {
    var regs = ExhibitionConfig.loadRegistrations();
    if (regs.length === 0) {
      showToast('データがありません');
      return;
    }

    var headers = ['チケットID', '会社名', '会社名カナ', '姓', '名', 'セイ', 'メイ',
                   '電話番号', 'メールアドレス', '業種', 'エントリー番号', '同伴者数', '登録日時'];
    var rows = regs.map(function (r) {
      return [
        r.id, r.companyName, r.companyKana, r.lastName, r.firstName,
        r.lastNameKana, r.firstNameKana, r.phone, r.email,
        r.industry, r.entryNumber, r.companions, r.registeredAt
      ].map(function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; });
    });

    var bom = '\uFEFF';
    var csv = bom + headers.join(',') + '\n' + rows.map(function (r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'registrations_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSVを出力しました');
  });

  // ---- Utility ----
  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2000);
  }

  // ---- Init ----
  loadEventSettings();
  loadFieldSettings();

})();
