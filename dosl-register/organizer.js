// ============================================================
// Organizer Dashboard - Registration Data Management
// 主催者向け：登録者データ閲覧・チェックイン管理
// ============================================================

(function () {
  'use strict';

  var currentFilter = 'all';
  var currentSort = 'newest';
  var currentSearch = '';
  var selectedRegId = null;

  // ---- Render ----
  function render() {
    renderStats();
    renderList();
  }

  function renderStats() {
    var regs = ExhibitionConfig.loadRegistrations();
    var total = regs.length;
    var checkedIn = regs.filter(function (r) { return r.checkedIn; }).length;
    var pending = total - checkedIn;
    var companions = regs.reduce(function (sum, r) { return sum + (parseInt(r.companions) || 0); }, 0);

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCheckedIn').textContent = checkedIn;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statCompanions').textContent = companions;
    document.getElementById('totalCount').textContent = total + '件';
  }

  function renderList() {
    var regs = ExhibitionConfig.loadRegistrations();

    // Filter
    if (currentFilter === 'checked') {
      regs = regs.filter(function (r) { return r.checkedIn; });
    } else if (currentFilter === 'pending') {
      regs = regs.filter(function (r) { return !r.checkedIn; });
    }

    // Search
    if (currentSearch) {
      var q = currentSearch.toLowerCase();
      regs = regs.filter(function (r) {
        return (r.companyName || '').toLowerCase().includes(q) ||
               (r.lastName || '').toLowerCase().includes(q) ||
               (r.firstName || '').toLowerCase().includes(q) ||
               (r.id || '').toLowerCase().includes(q) ||
               (r.email || '').toLowerCase().includes(q);
      });
    }

    // Sort
    regs.sort(function (a, b) {
      switch (currentSort) {
        case 'oldest': return new Date(a.registeredAt) - new Date(b.registeredAt);
        case 'company': return (a.companyName || '').localeCompare(b.companyName || '');
        case 'name': return (a.lastName || '').localeCompare(b.lastName || '');
        case 'checkin':
          if (a.checkedIn && !b.checkedIn) return -1;
          if (!a.checkedIn && b.checkedIn) return 1;
          return new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0);
        default: return new Date(b.registeredAt) - new Date(a.registeredAt);
      }
    });

    var container = document.getElementById('regList');

    if (regs.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">📋</div>' +
          '<div class="empty-state-text">登録データがありません</div>' +
        '</div>';
      return;
    }

    container.innerHTML = '';
    regs.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'reg-card' + (r.checkedIn ? ' checked-in' : '');
      card.dataset.id = r.id;

      var dateStr = formatDate(r.registeredAt);
      var statusClass = r.checkedIn ? 'status-checked' : 'status-pending';
      var statusText = r.checkedIn ? '来場済' : '未来場';

      card.innerHTML =
        '<div class="reg-card-top">' +
          '<div class="reg-card-company">' + esc(r.companyName || '') + '</div>' +
          '<span class="reg-card-status ' + statusClass + '">' + statusText + '</span>' +
        '</div>' +
        '<div class="reg-card-name">' + esc(r.lastName || '') + ' ' + esc(r.firstName || '') +
          (r.companions > 0 ? '（＋' + r.companions + '名）' : '') +
        '</div>' +
        '<div class="reg-card-bottom">' +
          '<div class="reg-card-meta">' +
            '<span>' + dateStr + '</span>' +
          '</div>' +
          '<span class="reg-card-id">' + esc(r.id) + '</span>' +
        '</div>';

      card.addEventListener('click', function () {
        showDetail(r.id);
      });

      container.appendChild(card);
    });
  }

  // ---- Detail Modal ----
  function showDetail(ticketId) {
    var reg = ExhibitionConfig.findRegistration(ticketId);
    if (!reg) return;

    selectedRegId = ticketId;
    var body = document.getElementById('detailBody');

    var statusHtml = reg.checkedIn
      ? '<span class="detail-checkin-status checked">✓ チェックイン済（' + formatDateTime(reg.checkedInAt) + '）</span>'
      : '<span class="detail-checkin-status pending">● 未来場</span>';

    body.innerHTML =
      '<div style="margin-bottom:16px;">' + statusHtml + '</div>' +
      '<table class="detail-table">' +
        detailRow('チケットID', reg.id) +
        detailRow('会社名', reg.companyName) +
        detailRow('会社名(カナ)', reg.companyKana) +
        detailRow('氏名', (reg.lastName || '') + ' ' + (reg.firstName || '')) +
        detailRow('フリガナ', (reg.lastNameKana || '') + ' ' + (reg.firstNameKana || '')) +
        detailRow('電話番号', reg.phone || '-') +
        detailRow('メールアドレス', reg.email) +
        detailRow('業種', reg.industry || '-') +
        detailRow('エントリー番号', reg.entryNumber || '-') +
        detailRow('同伴者数', (reg.companions || 0) + '名') +
        detailRow('登録日時', formatDateTime(reg.registeredAt)) +
      '</table>';

    var checkInBtn = document.getElementById('detailCheckInBtn');
    if (reg.checkedIn) {
      checkInBtn.textContent = 'チェックイン取消';
      checkInBtn.className = 'org-btn org-btn-outline';
    } else {
      checkInBtn.textContent = 'チェックイン';
      checkInBtn.className = 'org-btn org-btn-success';
    }

    document.getElementById('detailModal').style.display = '';
  }

  function detailRow(label, value) {
    return '<tr><th>' + esc(label) + '</th></tr><tr><td>' + esc(value || '') + '</td></tr>';
  }

  // ---- Check-in ----
  function checkIn(ticketId) {
    var regs = ExhibitionConfig.loadRegistrations();
    var found = false;
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].id === ticketId) {
        if (regs[i].checkedIn) {
          return { status: 'already', reg: regs[i] };
        }
        regs[i].checkedIn = true;
        regs[i].checkedInAt = new Date().toISOString();
        localStorage.setItem('daimatsu_registrations', JSON.stringify(regs));
        found = true;
        return { status: 'ok', reg: regs[i] };
      }
    }
    return { status: 'not_found', reg: null };
  }

  function undoCheckIn(ticketId) {
    var regs = ExhibitionConfig.loadRegistrations();
    for (var i = 0; i < regs.length; i++) {
      if (regs[i].id === ticketId) {
        regs[i].checkedIn = false;
        regs[i].checkedInAt = null;
        localStorage.setItem('daimatsu_registrations', JSON.stringify(regs));
        return true;
      }
    }
    return false;
  }

  // ---- Scanner Modal ----
  var videoStream = null;

  document.getElementById('toggleScanner').addEventListener('click', function () {
    document.getElementById('scannerModal').style.display = '';
    document.getElementById('checkinResult').style.display = 'none';
    document.querySelector('#scannerModal .modal-body').style.display = '';
    startCamera();
  });

  function closeScannerModal() {
    document.getElementById('scannerModal').style.display = 'none';
    stopCamera();
  }

  document.getElementById('closeScannerModal').addEventListener('click', closeScannerModal);

  document.getElementById('manualCheckInBtn').addEventListener('click', function () {
    var id = document.getElementById('manualTicketId').value.trim().toUpperCase();
    if (!id) return;
    processCheckIn(id);
  });

  document.getElementById('checkinNextBtn').addEventListener('click', function () {
    document.getElementById('checkinResult').style.display = 'none';
    document.querySelector('#scannerModal .modal-body').style.display = '';
    document.getElementById('manualTicketId').value = '';
  });

  function processCheckIn(ticketId) {
    var result = checkIn(ticketId);
    showCheckInResult(result);
    render();
  }

  function showCheckInResult(result) {
    document.querySelector('#scannerModal .modal-body').style.display = 'none';
    var resultEl = document.getElementById('checkinResult');
    resultEl.style.display = '';

    var iconEl = document.getElementById('checkinIcon');
    var textEl = document.getElementById('checkinText');
    var detailEl = document.getElementById('checkinDetail');

    if (result.status === 'ok') {
      iconEl.className = 'checkin-result-icon success';
      iconEl.textContent = '✓';
      textEl.textContent = 'チェックイン完了';
      detailEl.innerHTML =
        esc(result.reg.companyName) + '<br>' +
        esc(result.reg.lastName + ' ' + result.reg.firstName) +
        (result.reg.companions > 0 ? '<br>同伴者 ' + result.reg.companions + '名' : '');
    } else if (result.status === 'already') {
      iconEl.className = 'checkin-result-icon warning';
      iconEl.textContent = '!';
      textEl.textContent = 'チェックイン済みです';
      detailEl.innerHTML =
        esc(result.reg.companyName) + '<br>' +
        esc(result.reg.lastName + ' ' + result.reg.firstName) + '<br>' +
        '<small>' + formatDateTime(result.reg.checkedInAt) + 'にチェックイン済</small>';
    } else {
      iconEl.className = 'checkin-result-icon error';
      iconEl.textContent = '✕';
      textEl.textContent = '該当データなし';
      detailEl.textContent = 'このチケットIDは登録されていません';
    }
  }

  // ---- Camera (QR scan placeholder) ----
  function startCamera() {
    var video = document.getElementById('scannerVideo');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (stream) {
          videoStream = stream;
          video.srcObject = stream;
          video.play();
        })
        .catch(function () {
          document.getElementById('scannerArea').innerHTML =
            '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">カメラを使用できません<br>手動入力をご利用ください</div>';
        });
    }
  }

  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(function (t) { t.stop(); });
      videoStream = null;
    }
  }

  // ---- Detail Modal ----
  document.getElementById('closeDetailModal').addEventListener('click', function () {
    document.getElementById('detailModal').style.display = 'none';
  });

  document.getElementById('detailCloseBtn').addEventListener('click', function () {
    document.getElementById('detailModal').style.display = 'none';
  });

  document.getElementById('detailCheckInBtn').addEventListener('click', function () {
    if (!selectedRegId) return;
    var reg = ExhibitionConfig.findRegistration(selectedRegId);
    if (!reg) return;

    if (reg.checkedIn) {
      if (confirm('チェックインを取り消しますか？')) {
        undoCheckIn(selectedRegId);
        showToast('チェックインを取り消しました');
      }
    } else {
      checkIn(selectedRegId);
      showToast('チェックインしました');
    }

    document.getElementById('detailModal').style.display = 'none';
    render();
  });

  // ---- Filter Tabs ----
  document.querySelectorAll('.filter-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderList();
    });
  });

  // ---- Search ----
  document.getElementById('searchInput').addEventListener('input', function () {
    currentSearch = this.value;
    renderList();
  });

  // ---- Sort ----
  document.getElementById('sortSelect').addEventListener('change', function () {
    currentSort = this.value;
    renderList();
  });

  // ---- CSV Export ----
  document.getElementById('exportBtn').addEventListener('click', function () {
    var regs = ExhibitionConfig.loadRegistrations();
    if (regs.length === 0) {
      showToast('データがありません');
      return;
    }

    var headers = ['チケットID', '会社名', '会社名カナ', '姓', '名', 'セイ', 'メイ',
                   '電話番号', 'メールアドレス', '業種', 'エントリー番号', '同伴者数',
                   'チェックイン', 'チェックイン日時', '登録日時'];

    var rows = regs.map(function (r) {
      return [
        r.id, r.companyName, r.companyKana, r.lastName, r.firstName,
        r.lastNameKana, r.firstNameKana, r.phone, r.email,
        r.industry, r.entryNumber, r.companions,
        r.checkedIn ? '済' : '未', r.checkedInAt || '', r.registeredAt
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

  // ---- Close modals on overlay click ----
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        stopCamera();
      }
    });
  });

  // ---- Utility ----
  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    var d = new Date(isoStr);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    var d = new Date(isoStr);
    return d.getFullYear() + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function showToast(msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 2000);
  }

  // ---- Init ----
  render();

  // Auto-refresh every 5 seconds
  setInterval(render, 5000);

})();
