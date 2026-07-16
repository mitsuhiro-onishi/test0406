    // ──── Auth ────
    const currentUser = requireAuth(['exhibitor']);
    if (currentUser) {

    // ──── State ────
    let selectedFiles = [];
    let selectedCategory = null;  // {id, name, recipient_org_name}
    let currentStep = 0;
    let exhibition = null;
    let categories = [];
    const MAX_FILES_PER_UPLOAD = 5;

    // ──── DOM refs ────
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const fileListContainer = document.getElementById('fileListContainer');
    const fileCountLabel = document.getElementById('fileCountLabel');
    const btnNext1 = document.getElementById('btnNext1');
    const btnNext2 = document.getElementById('btnNext2');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnSelectFile = document.getElementById('btnSelectFile');
    const btnCamera = document.getElementById('btnCamera');

    document.getElementById('userLabel').textContent =
      currentUser.organization_name + ' / ' + currentUser.name;
    document.getElementById('btnLogout').addEventListener('click', logout);

    // ──── Initial data load ────
    let exhibitions = [];

    async function init() {
      try {
        // 出展社には閉幕した展示会は見せない
        exhibitions = (await api('/api/exhibitions')).filter(e => e.status !== 'closed');
        if (!exhibitions.length) {
          showSnackbar('参加中の展示会がありません');
          return;
        }
        // 前回選択した展示会が残っていればそれを、なければ先頭を選ぶ
        const savedId = localStorage.getItem('doslhub_exhibition_id');
        const initial = exhibitions.find(e => e.id === savedId) || exhibitions[0];

        if (exhibitions.length > 1) {
          const sel = document.getElementById('exhibitionSelect');
          sel.innerHTML = exhibitions.map(e =>
            `<option value="${e.id}" ${e.id === initial.id ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
          ).join('');
          sel.style.display = '';
        }
        await applyExhibition(initial);
      } catch (err) {
        showSnackbar(err.message);
      }
    }

    // 展示会を差し替え、カテゴリと提出済み書類を読み直す
    async function applyExhibition(ex) {
      exhibition = ex;
      localStorage.setItem('doslhub_exhibition_id', ex.id);
      document.getElementById('appTitle').textContent = ex.name + ' - 出展社ポータル';
      document.title = 'DOSL HUB - ' + ex.name;

      categories = await api('/api/exhibitions/' + ex.id + '/submission-categories');
      selectedCategory = null;
      btnNext2.disabled = true;
      renderCategories();
      await loadDocuments();
    }

    document.getElementById('exhibitionSelect').addEventListener('change', async (e) => {
      const ex = exhibitions.find(x => x.id === e.target.value);
      if (!ex || (exhibition && ex.id === exhibition.id)) return;
      try {
        await applyExhibition(ex);
        if (currentStep > 0) goToStep(0);  // アップロード途中ならカテゴリ選択をやり直す
        showSnackbar('「' + ex.name + '」に切り替えました');
      } catch (err) { showSnackbar(err.message); }
    });

    function renderCategories() {
      const list = document.getElementById('categoryList');
      if (!categories.length) {
        list.innerHTML = '<p class="empty" style="font-size:13px;color:#9e9e9e;">提出カテゴリが設定されていません</p>';
        return;
      }
      list.innerHTML = categories.map(cat => `
        <label class="category-item" data-id="${cat.id}">
          <input type="radio" name="cat" value="${cat.id}" />
          <div class="category-info">
            <div class="category-name">${escapeHtml(cat.name)} ${cat.is_required ? '<span class="chip-required">必須</span>' : ''}</div>
            <div class="category-desc">受取: ${escapeHtml(cat.recipient_org_name || '')} ― ${escapeHtml(cat.description || '')}</div>
          </div>
        </label>
      `).join('');

      list.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
          list.querySelectorAll('.category-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          item.querySelector('input').checked = true;
          selectedCategory = categories.find(c => c.id === item.dataset.id);
          btnNext2.disabled = false;
        });
      });
    }

    // ──── Document list ────
    async function loadDocuments(silent) {
      if (!exhibition) return;
      try {
        const res = await api('/api/documents?limit=50&exhibition_id=' + exhibition.id);
        document.getElementById('docCount').textContent = '全' + res.total + '件';
        const tbody = document.getElementById('docTableBody');
        if (!res.data.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="color:#9e9e9e;text-align:center;padding:24px;">まだ書類が提出されていません</td></tr>';
          return;
        }
        tbody.innerHTML = res.data.map(doc => {
          const srcIcon = { camera_capture: 'camera_alt', email: 'mail' }[doc.source_channel] || 'insert_drive_file';
          return `
            <tr>
              <td>
                <div class="td-file">
                  <span class="material-icons icon" title="${sourceChannelLabel(doc.source_channel)}">${srcIcon}</span>
                  <span class="name" title="${escapeHtml(doc.file_name)}">${escapeHtml(doc.file_name)}</span>
                </div>
              </td>
              <td><span class="chip-category">${escapeHtml(doc.submission_category_name || '')}</span></td>
              <td>${formatSize(doc.file_size_bytes)}</td>
              <td>${statusChip(doc.status)}</td>
              <td>${formatDateTime(doc.created_at)}</td>
            </tr>
          `;
        }).join('');

        // 解析中の書類があれば自動更新を続ける
        if (res.data.some(d => d.status === 'received' || d.status === 'processing')) {
          schedulePoll();
        }
      } catch (err) {
        if (!silent) showSnackbar(err.message);
      }
    }

    let pollTimer = null;
    function schedulePoll() {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => loadDocuments(true), 5000);
    }

    // ──── File selection ────
    btnSelectFile.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', () => fileInput.click());

    btnCamera.addEventListener('click', () => {
      fileInput.setAttribute('capture', 'environment');
      fileInput.click();
      setTimeout(() => fileInput.removeAttribute('capture'), 500);
    });

    fileInput.addEventListener('change', (e) => {
      addFiles(e.target.files);
      fileInput.value = '';
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });

    const fileErrors = new Map();  // ファイル名 → アップロード失敗理由（赤字表示用）

    function addFiles(fileList) {
      for (const file of fileList) {
        if (selectedFiles.length >= MAX_FILES_PER_UPLOAD) {
          showSnackbar('一度に選択できるのは' + MAX_FILES_PER_UPLOAD + 'ファイルまでです');
          break;
        }
        if (file.size > 50 * 1024 * 1024) {
          showSnackbar('ファイルサイズが50MBを超えています: ' + file.name);
          continue;
        }
        if (selectedFiles.some(f => f.name === file.name)) continue;
        selectedFiles.push(file);
      }
      renderFileList();
    }

    function removeFile(index) {
      fileErrors.delete(selectedFiles[index]?.name);
      selectedFiles.splice(index, 1);
      renderFileList();
    }

    function renderFileList() {
      fileCountLabel.textContent = '選択済みファイル (' + selectedFiles.length + '件)';
      btnNext1.disabled = selectedFiles.length === 0;

      if (selectedFiles.length === 0) {
        fileListContainer.innerHTML = '<p class="empty">ファイルが選択されていません</p>';
        return;
      }

      fileListContainer.innerHTML = selectedFiles.map((file, i) => {
        const err = fileErrors.get(file.name);
        return `
        <div class="file-item${err ? ' has-error' : ''}">
          <span class="material-icons" style="font-size:18px;color:${err ? '#d32f2f' : '#9e9e9e'}">${err ? 'error_outline' : 'insert_drive_file'}</span>
          <div style="flex-grow:1;min-width:0">
            <div class="name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</div>
            ${err ? '<div class="err">' + escapeHtml(err) + '</div>' : ''}
          </div>
          <span class="size">${formatSize(file.size)}</span>
          <button type="button" class="remove material-icons" data-remove-file="${i}" aria-label="削除">close</button>
        </div>
      `;
      }).join('');
    }

    // ──── Step navigation ────
    btnNext1.addEventListener('click', () => goToStep(1));
    btnNext2.addEventListener('click', () => goToStep(2));
    document.querySelectorAll('[data-step]').forEach(button => {
      button.addEventListener('click', () => goToStep(Number(button.dataset.step)));
    });
    fileListContainer.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-file]');
      if (button) removeFile(Number(button.dataset.removeFile));
    });

    function goToStep(step) {
      currentStep = step;
      document.querySelectorAll('.step-view').forEach(el => el.classList.remove('active'));
      document.getElementById('step-' + step).classList.add('active');
      updateStepper(step);
      if (step === 2) populateConfirmation();
      document.getElementById('uploadCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateStepper(activeStep) {
      const stepperHTML = buildStepperHTML(activeStep);
      const currentView = document.getElementById('step-' + activeStep);
      const stepper = currentView.querySelector('.stepper');
      if (stepper) stepper.innerHTML = stepperHTML;
    }

    function buildStepperHTML(activeStep) {
      const steps = ['ファイル選択', 'カテゴリ選択', '確認・送信'];
      let html = '';
      steps.forEach((label, i) => {
        const num = i + 1;
        let circleClass, labelClass, circleContent;

        if (i < activeStep) {
          circleClass = 'done';
          labelClass = 'active';
          circleContent = '<span class="material-icons" style="font-size:16px">check</span>';
        } else if (i === activeStep) {
          circleClass = 'active';
          labelClass = 'active';
          circleContent = num;
        } else {
          circleClass = 'inactive';
          labelClass = 'inactive';
          circleContent = num;
        }

        html += `<div class="step">
          <div class="step-circle ${circleClass}">${circleContent}</div>
          <span class="step-label ${labelClass}">${label}</span>
        </div>`;

        if (i < 2) {
          const lineClass = i < activeStep ? 'done' : '';
          html += `<div class="step-line ${lineClass}"></div>`;
        }
      });
      return html;
    }

    // ──── Confirmation ────
    function populateConfirmation() {
      const confirmFiles = document.getElementById('confirmFiles');
      confirmFiles.innerHTML = selectedFiles.map(f =>
        `<div class="confirm-value">${escapeHtml(f.name)} (${formatSize(f.size)})</div>`
      ).join('');

      const confirmCat = document.getElementById('confirmCategory');
      confirmCat.textContent = selectedCategory
        ? selectedCategory.name + '（受取: ' + (selectedCategory.recipient_org_name || '') + '）'
        : '';
    }

    // ──── Submit（一括アップロード） ────
    btnSubmit.addEventListener('click', async () => {
      if (!selectedFiles.length || !selectedCategory || !exhibition) return;
      const overlay = document.getElementById('uploadOverlay');
      const dialog = document.getElementById('uploadDialog');
      overlay.classList.add('show');
      btnSubmit.disabled = true;
      document.getElementById('uploadMsg').textContent =
        'アップロード中... (' + selectedFiles.length + '件)';
      document.getElementById('uploadSub').textContent = 'まとめて送信しています';

      let results;
      try {
        const form = new FormData();
        for (const file of selectedFiles) form.append('files', file);
        form.append('exhibition_id', exhibition.id);
        form.append('submission_category_id', selectedCategory.id);
        results = (await api('/api/documents/bulk-upload', { method: 'POST', body: form })).data;
      } catch (err) {
        // リクエスト全体の失敗（ネットワーク・件数超過など）
        overlay.classList.remove('show');
        btnSubmit.disabled = false;
        showSnackbar(err.message);
        return;
      }

      const okCount = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);

      dialog.innerHTML = `
        <div class="complete-icon"${failed.length ? ' style="background:#ff9800"' : ''}>
          <span class="material-icons" style="font-size:28px">${failed.length ? 'priority_high' : 'check'}</span>
        </div>
        <p>アップロード完了</p>
        <p class="sub">${okCount}件のファイルを送信しました。AI解析を開始します。${failed.length ? '<br>' + failed.length + '件は送信できませんでした。' : ''}</p>
      `;

      await loadDocuments(true);

      setTimeout(() => {
        overlay.classList.remove('show');
        dialog.innerHTML = `
          <div class="spinner" id="uploadSpinner"></div>
          <p id="uploadMsg">アップロード中...</p>
          <p class="sub" id="uploadSub">しばらくお待ちください</p>
        `;

        // 成功分は選択リストから外し、失敗分は理由つきの赤字で残す
        fileErrors.clear();
        failed.forEach(r => fileErrors.set(r.file_name, r.error));
        selectedFiles = selectedFiles.filter(f => fileErrors.has(f.name));
        selectedCategory = null;
        renderFileList();
        document.querySelectorAll('.category-item').forEach(i => {
          i.classList.remove('selected');
          i.querySelector('input').checked = false;
        });
        btnNext2.disabled = true;
        btnSubmit.disabled = false;
        goToStep(0);

        if (failed.length) {
          showSnackbar(failed.length + '件のファイルが送信できませんでした（一覧の赤字を確認してください）');
        } else {
          showSnackbar('書類のアップロードが完了しました');
        }
      }, 1600);
    });

    // ──── Snackbar ────
    function showSnackbar(text) {
      const sb = document.getElementById('snackbar');
      document.getElementById('snackbarText').textContent = text;
      sb.classList.add('show');
      setTimeout(() => sb.classList.remove('show'), 3000);
    }

    // ──── Refresh button ────
    document.getElementById('btnRefresh').addEventListener('click', function() {
      this.style.animation = 'spin 0.5s ease';
      setTimeout(() => this.style.animation = '', 500);
      loadDocuments();
    });

    // ──── Initialize ────
    updateStepper(0);
    init();
    }
