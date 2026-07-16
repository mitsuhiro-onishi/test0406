    // ──── Auth ────
    const currentUser = requireAuth(['admin', 'organizer', 'partner', 'viewer']);
    if (currentUser) {
    const isManager = currentUser && ['admin', 'organizer'].includes(currentUser.role);

    // ──── State ────
    let exhibitions = [];
    let exhibition = null;
    let categories = [];
    let organizations = [];
    let queue = [];
    let activeAnalysis = null;
    let docsOffset = 0;
    const DOCS_LIMIT = 20;
    let docsTotal = 0;
    let previewObjectUrl = null;

    document.getElementById('userLabel').textContent =
      currentUser.organization_name + ' / ' + currentUser.name;
    document.getElementById('btnLogout').addEventListener('click', logout);

    function createIconButton(title, iconName) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn';
      button.title = title;
      const icon = document.createElement('span');
      icon.className = 'material-icons';
      icon.style.fontSize = '18px';
      icon.textContent = iconName;
      button.appendChild(icon);
      return button;
    }

    const actionHandlers = {
      'open-exhibitor-portal': () => { location.href = 'index.html'; },
      'close-category-dialog': closeCategoryDialog,
      'close-doc-dialog': closeDocDialog,
      'close-approve-dialog': closeApproveDialog,
      'close-credentials-dialog': closeCredentialsDialog,
      'close-reject-dialog': closeRejectDialog,
      'close-spec-dialog': closeSpecDialog,
      'close-org-dialog': closeOrgDialog,
      'close-user-dialog': closeUserDialog,
      'close-exhibitions-dialog': closeExhibitionsDialog,
      'close-exhibition-edit-dialog': closeExhibitionEditDialog,
      'jump-to-docs': target => jumpToDocs(target.dataset.key),
      'change-doc-category': target => changeDocCategory(target.dataset.id),
      'select-queue-item': target => selectQueueItem(Number(target.dataset.index)),
      'submit-review': target => submitReview(target.dataset.mode),
      'edit-category': target => showEditCategory(target.dataset.id),
      'delete-category': target => deleteCategory(target.dataset.id),
      'approve-application': target => showApproveDialog(target.dataset.id),
      'reject-application': target => showRejectDialog(target.dataset.id),
      'show-spec': target => showSpecDialog(target.dataset.id),
      'edit-org': target => showEditOrg(target.dataset.id),
      'delete-org': target => deleteOrg(target.dataset.id),
      'toggle-user': target => toggleUserActive(target.dataset.id),
      'edit-user': target => showEditUser(target.dataset.id),
      'reset-user-password': target => resetUserPassword(target.dataset.id),
      'edit-exhibition': target => showEditExhibition(target.dataset.id),
    };

    document.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const handler = actionHandlers[target.dataset.action];
      if (handler) handler(target);
    });

    // partner/viewerはカテゴリ管理・出展申込タブを隠す（レビューは閲覧可・操作はサーバー側で拒否）
    if (!isManager) {
      document.getElementById('navCategories').style.display = 'none';
      document.getElementById('navApplications').style.display = 'none';
      document.getElementById('navUsers').style.display = 'none';
    }

    // ──── Sidebar / tabs ────
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    document.getElementById('menuToggle').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('show');
    });
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    });

    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
      item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    function switchTab(tabId) {
      document.querySelectorAll('.sidebar-item[data-tab]').forEach(i =>
        i.classList.toggle('active', i.dataset.tab === tabId));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.add('active');
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');

      runTabLoader(tabId);
    }

    function runTabLoader(tabId) {
      if (tabId === 'dashboard') loadDashboard();
      if (tabId === 'documents') loadDocs();
      if (tabId === 'review') loadQueue();
      if (tabId === 'orders') loadOrders();
      if (tabId === 'designspecs') loadSpecs();
      if (tabId === 'categories') loadCategories();
      if (tabId === 'applications') loadApplications();
      if (tabId === 'users') loadUsersTab();
    }

    function activeTabId() {
      const item = document.querySelector('.sidebar-item[data-tab].active');
      return item ? item.dataset.tab : 'dashboard';
    }

    // ──── Init ────
    async function init() {
      try {
        exhibitions = await api('/api/exhibitions');
        if (!exhibitions.length) { showSnackbar('展示会がありません'); return; }
        // 前回選択した展示会が残っていればそれを、なければ先頭を選ぶ
        const savedId = localStorage.getItem('doslhub_exhibition_id');
        const initial = exhibitions.find(e => e.id === savedId) || exhibitions[0];

        if (isManager) {
          const res = await api('/api/organizations');
          organizations = res.data;
          document.getElementById('btnManageExhibitions').style.display = '';
        }

        renderExhibitionSelect(initial.id);
        await applyExhibition(initial);
        await loadDashboard();
        loadNotifications();
      } catch (err) {
        showSnackbar(err.message);
      }
    }

    // ──── Exhibition switcher ────
    function renderExhibitionSelect(selectedId) {
      document.getElementById('exhibitionSelect').innerHTML = exhibitions.map(e =>
        `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
      ).join('');
    }

    // 展示会を差し替え、タイトル・カテゴリ・件数チップを更新する
    async function applyExhibition(ex) {
      exhibition = ex;
      localStorage.setItem('doslhub_exhibition_id', ex.id);
      document.getElementById('appTitle').textContent = ex.name + ' - 管理';
      document.title = 'DOSL HUB 管理 - ' + ex.name;

      categories = await api('/api/exhibitions/' + ex.id + '/submission-categories?include_inactive=' + isManager);
      const sel = document.getElementById('filterCategory');
      sel.innerHTML = '<option value="">全カテゴリ</option>' + categories
        .filter(c => c.is_active)
        .map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');

      refreshQueueCount();
      if (isManager) refreshApplicationCount();
    }

    document.getElementById('exhibitionSelect').addEventListener('change', async (e) => {
      const ex = exhibitions.find(x => x.id === e.target.value);
      if (!ex || (exhibition && ex.id === exhibition.id)) return;
      try {
        await applyExhibition(ex);
        runTabLoader(activeTabId());
        showSnackbar('「' + ex.name + '」に切り替えました');
      } catch (err) { showSnackbar(err.message); }
    });

    // ──── Dashboard ────
    const SUMMARY_DEFS = [
      { key: 'total', icon: 'inbox', color: '#1565c0', label: '受信書類数' },
      { key: 'analyzed', icon: 'auto_awesome', color: '#7b1fa2', label: '解析済（未確認）' },
      { key: 'review_needed', icon: 'rate_review', color: '#ef6c00', label: '要レビュー' },
      { key: 'confirmed', icon: 'verified', color: '#2e7d32', label: '確認済' },
    ];

    async function loadDashboard() {
      if (!exhibition) return;
      const res = await api('/api/exhibitions/' + exhibition.id + '/summary');
      const d = res.data;
      const values = {
        total: d.total_documents,
        analyzed: d.documents_by_status.analyzed,
        review_needed: d.documents_by_status.review_needed,
        confirmed: d.documents_by_status.confirmed,
      };
      document.getElementById('summaryGrid').innerHTML = SUMMARY_DEFS.map(s => `
        <div class="summary-card" data-action="jump-to-docs" data-key="${s.key}">
          <div class="icon-wrap" style="background:${s.color}">
            <span class="material-icons">${s.icon}</span>
          </div>
          <div class="number">${values[s.key]}</div>
          <div class="label">${s.label}</div>
        </div>
      `).join('');

      document.getElementById('categoryProgress').innerHTML = d.category_progress.map(c => `
        <div class="progress-row">
          <span class="progress-label">${escapeHtml(c.name)} ${c.is_required ? '<span class="chip-required">必須</span>' : ''}</span>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:${Math.min(c.rate * 100, 100)}%"></div></div>
          <span class="progress-count">${c.submitted_org_count}/${c.expected_org_count}社</span>
          <span class="progress-pct">${Math.round(c.rate * 100)}%</span>
        </div>
      `).join('') || '<p style="color:#9e9e9e;font-size:13px">カテゴリが設定されていません</p>';

      document.getElementById('activityList').innerHTML = d.recent_documents.map(doc => `
        <li class="activity-item">
          <span class="activity-time">${formatDateTime(doc.created_at)}</span>
          <span class="activity-text">
            <strong>${escapeHtml(doc.uploaded_by_org_name || '')}</strong> が
            <span class="chip-category">${escapeHtml(doc.category_name || '')}</span>
            「${escapeHtml(doc.file_name)}」を提出
            ${doc.confidence_score != null ? '（AI信頼度 ' + Math.round(doc.confidence_score * 100) + '%）' : ''}
          </span>
          ${statusChip(doc.status)}
        </li>
      `).join('') || '<li class="activity-item"><span class="activity-text" style="color:#9e9e9e">まだ書類がありません</span></li>';
    }

    function jumpToDocs(key) {
      switchTab('documents');
      const sel = document.getElementById('filterStatus');
      sel.value = (key === 'total') ? '' : key;
      docsOffset = 0;
      loadDocs();
    }

    // ──── Documents ────
    async function loadDocs() {
      if (!exhibition) return;
      const params = new URLSearchParams({
        exhibition_id: exhibition.id,
        limit: DOCS_LIMIT,
        offset: docsOffset,
      });
      const status = document.getElementById('filterStatus').value;
      const cat = document.getElementById('filterCategory').value;
      const q = document.getElementById('filterQ').value.trim();
      if (status) params.set('status', status);
      if (cat) params.set('submission_category_id', cat);
      if (q) params.set('q', q);

      const res = await api('/api/documents?' + params);
      docsTotal = res.total;
      const tbody = document.getElementById('docsTableBody');
      if (!res.data.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="color:#9e9e9e;text-align:center;padding:24px">該当する書類がありません</td></tr>';
      } else {
        tbody.replaceChildren();
        for (const doc of res.data) {
          const row = document.createElement('tr');
          row.className = 'clickable';
          row.addEventListener('click', () => showDocDetail(doc.id));

          const appendTextCell = (value) => {
            const cell = row.insertCell();
            cell.textContent = value == null ? '' : String(value);
            return cell;
          };
          appendTextCell(formatDateTime(doc.created_at)).style.whiteSpace = 'nowrap';
          appendTextCell(doc.uploaded_by_org_name || '');
          appendTextCell(doc.booth_number || '—');

          const categoryCell = row.insertCell();
          const categoryChip = document.createElement('span');
          categoryChip.className = 'chip-category';
          categoryChip.textContent = doc.submission_category_name || '';
          categoryCell.appendChild(categoryChip);

          const fileNameCell = appendTextCell(doc.file_name);
          fileNameCell.textContent = doc.file_name;
          fileNameCell.title = doc.file_name;
          Object.assign(fileNameCell.style, {
            maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          });
          appendTextCell(sourceChannelLabel(doc.source_channel)).style.whiteSpace = 'nowrap';
          appendTextCell(doc.confidence_score != null ? Math.round(doc.confidence_score * 100) + '%' : '—');

          const statusCell = row.insertCell();
          statusCell.appendChild(statusChipElement(doc.status));

          const actionsCell = row.insertCell();
          actionsCell.style.whiteSpace = 'nowrap';
          actionsCell.addEventListener('click', event => event.stopPropagation());
          const downloadButton = createIconButton('ダウンロード', 'download');
          downloadButton.addEventListener('click', () => downloadDoc(doc.id, doc.file_name));
          actionsCell.appendChild(downloadButton);
          if (isManager) {
            const reanalyzeButton = createIconButton('再解析', 'autorenew');
            reanalyzeButton.addEventListener('click', () => reanalyzeDoc(doc.id));
            actionsCell.appendChild(reanalyzeButton);
          }
          tbody.appendChild(row);
        }
      }
      const from = docsTotal === 0 ? 0 : docsOffset + 1;
      const to = Math.min(docsOffset + DOCS_LIMIT, docsTotal);
      document.getElementById('docsPageInfo').textContent = `${from}〜${to}件 / 全${docsTotal}件`;
      document.getElementById('btnDocsPrev').disabled = docsOffset === 0;
      document.getElementById('btnDocsNext').disabled = to >= docsTotal;
    }

    document.getElementById('btnDocSearch').addEventListener('click', () => { docsOffset = 0; loadDocs(); });
    document.getElementById('filterQ').addEventListener('keydown', e => {
      if (e.key === 'Enter') { docsOffset = 0; loadDocs(); }
    });
    document.getElementById('btnDocsPrev').addEventListener('click', () => {
      docsOffset = Math.max(0, docsOffset - DOCS_LIMIT); loadDocs();
    });
    document.getElementById('btnDocsNext').addEventListener('click', () => {
      docsOffset += DOCS_LIMIT; loadDocs();
    });
    document.getElementById('btnDocsCsv').addEventListener('click', () =>
      apiDownload('/api/exhibitions/' + exhibition.id + '/reports/documents.csv', 'documents.csv')
        .catch(e => showSnackbar(e.message)));

    async function downloadDoc(id, name) {
      try { await apiDownload('/api/documents/' + id + '/download', name); }
      catch (e) { showSnackbar(e.message); }
    }

    async function reanalyzeDoc(id) {
      try {
        await api('/api/documents/' + id + '/reanalyze', { method: 'POST' });
        showSnackbar('再解析を開始しました');
        setTimeout(loadDocs, 2500);
      } catch (e) { showSnackbar(e.message); }
    }

    async function showDocDetail(id) {
      try {
        const doc = await api('/api/documents/' + id);
        const a = doc.ai_analysis;
        const sd = a ? (a.structured_data || {}) : {};
        document.getElementById('docDialogTitle').textContent = doc.file_name;
        document.getElementById('docDialogBody').innerHTML = `
          <div class="field-row"><span class="field-label">出展社</span><span class="field-value">${escapeHtml(doc.uploaded_by_org_name || '')}（ブース: ${escapeHtml(doc.booth_number || '—')}）</span></div>
          <div class="field-row"><span class="field-label">カテゴリ</span><span class="field-value">${escapeHtml(doc.submission_category_name || '')} → ${escapeHtml(doc.recipient_org_name || '')}</span></div>
          <div class="field-row"><span class="field-label">状態</span><span class="field-value">${statusChip(doc.status)}</span></div>
          <div class="field-row"><span class="field-label">受信日時</span><span class="field-value">${formatDateTime(doc.created_at)}（経路: ${sourceChannelLabel(doc.source_channel)}）</span></div>
          ${isManager && doc.submission_category_name === 'メール受信（未分類）' ? `
          <div style="margin-top:12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px">
            <div class="field-label" style="margin-bottom:6px">この書類はメール取込の未分類です。正しいカテゴリへ振り替えてください</div>
            <div style="display:flex;gap:8px;align-items:center">
              <select id="docCategorySelect" style="flex-grow:1;padding:8px 12px;font-size:13px;font-family:inherit;border:1px solid #ccc;border-radius:6px">
                ${categories.filter(c => c.is_active && c.name !== 'メール受信（未分類）').map(c =>
                  `<option value="${c.id}">${escapeHtml(c.name)}（受取: ${escapeHtml(c.recipient_org_name || '')}）</option>`).join('')}
              </select>
              <button class="btn btn-contained btn-sm" data-action="change-doc-category" data-id="${doc.id}">振り替える</button>
            </div>
          </div>` : ''}
          ${a ? `
          <div class="field-row"><span class="field-label">AI信頼度</span><span class="field-value">${Math.round(a.confidence_score * 100)}%（${escapeHtml(a.llm_model || '')}）</span></div>
          <div class="field-row"><span class="field-label">AI要約</span><span class="field-value">${escapeHtml(sd.summary || '—')}</span></div>
          ${sd.order_items && sd.order_items.length ? `
          <div style="margin-top:12px">
            <div class="field-label" style="margin-bottom:6px">読み取った品目</div>
            <div class="table-wrap"><table>
              <thead><tr><th>品目</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>
              <tbody>${sd.order_items.map(i => `
                <tr><td>${escapeHtml(i.item_name)}</td><td>${i.quantity ?? ''}${escapeHtml(i.unit || '')}</td>
                <td>${i.unit_price != null ? formatYen(i.unit_price) : '—'}</td>
                <td>${i.total_price != null ? formatYen(i.total_price) : '—'}</td></tr>`).join('')}
              </tbody>
            </table></div>
            <p style="font-size:14px;margin-top:8px;text-align:right">合計: <strong>${formatYen(sd.total_amount)}</strong></p>
          </div>` : ''}
          ${a.review_notes ? `<div class="field-row"><span class="field-label">レビューメモ</span><span class="field-value">${escapeHtml(a.review_notes)}</span></div>` : ''}
          ` : '<p style="color:#9e9e9e;font-size:13px;margin-top:12px">AI解析結果はまだありません</p>'}
        `;
        document.getElementById('docDialog').classList.add('show');
      } catch (e) { showSnackbar(e.message); }
    }
    function closeDocDialog() { document.getElementById('docDialog').classList.remove('show'); }

    // メール取込（未分類）書類のカテゴリ振り替え
    async function changeDocCategory(docId) {
      const sel = document.getElementById('docCategorySelect');
      if (!sel || !sel.value) return;
      try {
        await api('/api/documents/' + docId, {
          method: 'PATCH',
          body: { submission_category_id: sel.value },
        });
        closeDocDialog();
        showSnackbar('カテゴリを振り替えました');
        loadDocs();
      } catch (e) { showSnackbar(e.message); }
    }

    // ──── AI Review ────
    async function refreshQueueCount() {
      try {
        const res = await api('/api/ai-analyses/review-queue?exhibition_id=' + exhibition.id);
        const chip = document.getElementById('reviewCountChip');
        chip.textContent = res.data.length;
        chip.style.display = res.data.length ? 'flex' : 'none';
      } catch {}
    }

    async function loadQueue() {
      const res = await api('/api/ai-analyses/review-queue?exhibition_id=' + exhibition.id);
      queue = res.data;
      refreshQueueCount();
      const list = document.getElementById('queueList');
      if (!queue.length) {
        list.innerHTML = '<div class="empty-state"><span class="material-icons">task_alt</span><p>レビュー待ちはありません</p></div>';
        document.getElementById('reviewDetail').innerHTML =
          '<div class="card empty-state"><span class="material-icons">celebration</span><p>すべてのレビューが完了しています</p></div>';
        return;
      }
      list.innerHTML = queue.map((a, i) => `
        <div class="queue-item" data-action="select-queue-item" data-index="${i}">
          <div class="f">${escapeHtml(a.document.file_name)}</div>
          <div class="s">${escapeHtml(a.document.uploaded_by_org_name || '')} / ${escapeHtml(a.document.submission_category_name || '')}</div>
          <div class="s">信頼度 ${Math.round(a.confidence_score * 100)}% ・ ${formatDateTime(a.created_at)}</div>
        </div>
      `).join('');
      selectQueueItem(0);
    }

    async function selectQueueItem(i) {
      activeAnalysis = queue[i];
      document.querySelectorAll('.queue-item').forEach(el =>
        el.classList.toggle('active', Number(el.dataset.i) === i));
      renderReviewDetail();
      loadOriginalPreview();
    }

    function confidenceClass(score) {
      if (score >= 0.85) return 'confidence-high';
      if (score >= 0.7) return 'confidence-mid';
      return 'confidence-low';
    }

    function renderReviewDetail() {
      const a = activeAnalysis;
      const sd = a.structured_data || {};
      const low = a.low_confidence_fields || [];
      const items = sd.order_items || [];
      const pct = Math.round(a.confidence_score * 100);

      document.getElementById('reviewDetail').innerHTML = `
        <div class="review-split">
          <div class="review-panel">
            <h3><span class="material-icons" style="font-size:20px">description</span>原本プレビュー</h3>
            <div class="preview-area" id="previewArea">
              <span class="material-icons">hourglass_empty</span>
              <p>読み込み中...</p>
            </div>
            <div class="action-row">
              <button class="btn btn-outlined btn-sm" id="btnReviewDownload">
                <span class="material-icons" style="font-size:16px">download</span>原本をダウンロード
              </button>
            </div>
          </div>
          <div class="review-panel">
            <h3><span class="material-icons" style="font-size:20px">auto_awesome</span>AI解析結果</h3>
            <div class="confidence ${confidenceClass(a.confidence_score)}">
              <span class="confidence-score">${pct}%</span>
              <span class="confidence-label">
                AI信頼度<br />
                ${low.length ? '<span style="color:#e65100">要確認: ' + low.map(escapeHtml).join(', ') + '</span>' : '全フィールド良好'}
              </span>
            </div>
            <div class="field-row"><span class="field-label">書類種別</span><span class="field-value">${escapeHtml(sd.document_type || '—')}</span></div>
            <div class="field-row"><span class="field-label">会社名</span><span class="field-value">${escapeHtml(sd.detected_company_name || '—')}</span></div>
            <div class="field-row"><span class="field-label">要約</span><span class="field-value">${escapeHtml(sd.summary || '—')}</span></div>
            <div class="field-row">
              <span class="field-label">合計金額</span>
              <span class="field-value"><input type="number" id="editTotal" class="${low.includes('total_amount') ? 'low' : ''}" value="${sd.total_amount ?? ''}" ${isManager ? '' : 'disabled'} /></span>
            </div>
            <div class="field-row">
              <span class="field-label">希望納期</span>
              <span class="field-value"><input type="date" id="editDelivery" class="${low.includes('delivery_date') ? 'low' : ''}" value="${sd.delivery_date || ''}" ${isManager ? '' : 'disabled'} /></span>
            </div>
            ${items.length ? `
            <div style="margin-top:14px">
              <div class="field-label" style="margin-bottom:6px">品目（修正できます）</div>
              <div class="table-wrap"><table class="items-table" id="editItems">
                <thead><tr><th>品目名</th><th style="width:70px">数量</th><th style="width:60px">単位</th><th style="width:90px">単価</th><th style="width:90px">金額</th></tr></thead>
                <tbody>
                  ${items.map((it, idx) => `
                    <tr data-idx="${idx}">
                      <td><input data-f="item_name" value="${escapeHtml(it.item_name || '')}" ${isManager ? '' : 'disabled'} /></td>
                      <td><input data-f="quantity" type="number" class="${low.includes('order_items') ? 'low' : ''}" value="${it.quantity ?? ''}" ${isManager ? '' : 'disabled'} /></td>
                      <td><input data-f="unit" value="${escapeHtml(it.unit || '')}" ${isManager ? '' : 'disabled'} /></td>
                      <td><input data-f="unit_price" type="number" class="${low.includes('order_items') ? 'low' : ''}" value="${it.unit_price ?? ''}" ${isManager ? '' : 'disabled'} /></td>
                      <td><input data-f="total_price" type="number" value="${it.total_price ?? ''}" ${isManager ? '' : 'disabled'} /></td>
                    </tr>`).join('')}
                </tbody>
              </table></div>
            </div>` : ''}
            ${renderDesignSpecCard(sd.design_spec)}
            ${sd.extraction_notes ? `<p style="font-size:12px;color:#757575;margin-top:10px">AIメモ: ${escapeHtml(sd.extraction_notes)}</p>` : ''}
            <div class="field" style="margin-top:14px">
              <input type="text" id="reviewNotes" placeholder="レビューメモ（任意）" style="width:100%;padding:8px 12px;border:1px solid #e0e0e0;border-radius:4px;font-family:inherit;font-size:14px" ${isManager ? '' : 'disabled'} />
            </div>
            ${isManager ? `
            <div class="action-row">
              <button class="btn btn-danger" data-action="submit-review" data-mode="reject">
                <span class="material-icons" style="font-size:16px">close</span>差し戻し
              </button>
              <button class="btn btn-outlined" data-action="submit-review" data-mode="approve_with_corrections">
                <span class="material-icons" style="font-size:16px">edit</span>修正して承認
              </button>
              <button class="btn btn-success" data-action="submit-review" data-mode="approve">
                <span class="material-icons" style="font-size:16px">check</span>このまま承認
              </button>
            </div>` : '<p style="font-size:12px;color:#9e9e9e;margin-top:14px">承認・差し戻しは主催者アカウントで行えます</p>'}
          </div>
        </div>
      `;
      document.getElementById('btnReviewDownload')?.addEventListener(
        'click', () => downloadDoc(a.document.id, a.document.file_name)
      );
    }

    // 設営・図面系書類の解析に含まれるdesign_specを読み取り専用で表示する
    // （編集は承認後に「設計仕様」タブで行う運用）
    function renderDesignSpecCard(spec) {
      if (!spec) return '';
      const dim = (v) => v == null ? '—' : Number(v).toLocaleString('ja-JP');
      const elec = spec.electrical_requirements || {};
      const elecText = [
        elec.power_kw != null ? '電源 ' + elec.power_kw + 'kW' : '',
        elec.outlet_count != null ? 'コンセント ' + elec.outlet_count + '口' : '',
        elec.lighting || '',
      ].filter(Boolean).join('　') || '—';
      return `
        <div style="margin-top:14px;background:#f8fbff;border:1px solid #e3f2fd;border-radius:8px;padding:14px">
          <div class="field-label" style="margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span class="material-icons" style="font-size:16px;color:#1565c0">architecture</span>
            設計仕様（読み取り結果・承認後に「設計仕様」タブで編集できます）
          </div>
          <div class="field-row"><span class="field-label">寸法 W×D×H</span><span class="field-value">${dim(spec.width_mm)} × ${dim(spec.depth_mm)} × ${dim(spec.height_mm)} mm</span></div>
          <div class="field-row"><span class="field-label">素材</span><span class="field-value">${
            (spec.materials || []).map(m =>
              escapeHtml([m.name, m.specification, m.color, m.area].filter(Boolean).join(' / '))
            ).join('<br>') || '—'
          }</span></div>
          <div class="field-row"><span class="field-label">電気要件</span><span class="field-value">${escapeHtml(elecText)}</span></div>
          ${spec.structural_details ? `<div class="field-row"><span class="field-label">構造詳細</span><span class="field-value">${escapeHtml(spec.structural_details)}</span></div>` : ''}
          ${spec.special_requirements ? `<div class="field-row"><span class="field-label">特殊要件</span><span class="field-value">${escapeHtml(spec.special_requirements)}</span></div>` : ''}
        </div>
      `;
    }

    async function loadOriginalPreview() {
      const a = activeAnalysis;
      const area = document.getElementById('previewArea');
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
      const type = (a.document.file_type || '');
      const isImage = type.startsWith('image/');
      const isPdf = type === 'application/pdf';
      if (!isImage && !isPdf) {
        area.innerHTML = '<span class="material-icons">description</span><p>' +
          escapeHtml(a.document.file_name) + '</p><p style="font-size:12px">この形式はプレビューできません。原本をダウンロードして確認してください。</p>';
        return;
      }
      try {
        const res = await fetch('/api/documents/' + a.document.id + '/download', {
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        previewObjectUrl = URL.createObjectURL(blob);
        area.innerHTML = isImage
          ? '<img src="' + previewObjectUrl + '" alt="原本" />'
          : '<iframe src="' + previewObjectUrl + '"></iframe>';
      } catch {
        area.innerHTML = '<span class="material-icons">error_outline</span><p>プレビューを読み込めませんでした</p>';
      }
    }

    function collectCorrections() {
      const sd = activeAnalysis.structured_data || {};
      const corrections = {};
      const total = document.getElementById('editTotal').value;
      const delivery = document.getElementById('editDelivery').value;
      corrections.total_amount = total === '' ? null : Number(total);
      corrections.delivery_date = delivery || null;
      const table = document.getElementById('editItems');
      if (table) {
        const items = [];
        table.querySelectorAll('tbody tr').forEach(tr => {
          const get = f => tr.querySelector('[data-f="' + f + '"]').value;
          const name = get('item_name').trim();
          if (!name) return;
          items.push({
            item_name: name,
            quantity: Number(get('quantity')) || 0,
            unit: get('unit') || null,
            unit_price: get('unit_price') === '' ? null : Number(get('unit_price')),
            total_price: get('total_price') === '' ? null : Number(get('total_price')),
          });
        });
        corrections.order_items = items;
      }
      return corrections;
    }

    async function submitReview(action) {
      if (!activeAnalysis) return;
      const body = { action, notes: document.getElementById('reviewNotes').value || null };
      if (action === 'approve_with_corrections') body.corrected_data = collectCorrections();
      try {
        await api('/api/ai-analyses/' + activeAnalysis.id + '/review', { method: 'PUT', body });
        showSnackbar(action === 'reject' ? '差し戻しました' : '承認しました');
        await loadQueue();
        loadNotifications();
      } catch (e) { showSnackbar(e.message); }
    }

    document.getElementById('btnQueueReload').addEventListener('click', loadQueue);

    // ──── Orders ────
    async function loadOrders() {
      const [summaryRes, listRes] = await Promise.all([
        api('/api/orders/summary?exhibition_id=' + exhibition.id),
        api('/api/orders?exhibition_id=' + exhibition.id + '&limit=100'),
      ]);
      const s = summaryRes.data;
      document.getElementById('orderSummaryGrid').innerHTML = `
        <div class="summary-card">
          <div class="icon-wrap" style="background:#1565c0"><span class="material-icons">receipt_long</span></div>
          <div class="number">${s.total_orders}</div>
          <div class="label">確定注文数</div>
        </div>
        <div class="summary-card">
          <div class="icon-wrap" style="background:#2e7d32"><span class="material-icons">payments</span></div>
          <div class="number">${Number(s.total_amount).toLocaleString('ja-JP')}<span style="font-size:15px">円</span></div>
          <div class="label">注文金額合計</div>
        </div>
      `;
      document.getElementById('ordersByExhibitor').innerHTML = s.by_exhibitor.map(e => `
        <tr><td>${escapeHtml(e.exhibitor_name)}</td><td>${escapeHtml(e.booth || '—')}</td>
        <td>${e.count}</td><td>${formatYen(e.amount)}</td></tr>
      `).join('') || '<tr><td colspan="4" style="color:#9e9e9e;text-align:center;padding:24px">確定注文はまだありません</td></tr>';

      document.getElementById('ordersTableBody').innerHTML = listRes.data.map(o => `
        <tr>
          <td style="white-space:nowrap">${formatDateTime(o.created_at)}</td>
          <td>${escapeHtml(o.exhibitor_name || '')}</td>
          <td>${escapeHtml(o.booth_number || '—')}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(o.file_name || '')}</td>
          <td>${o.items.length}</td>
          <td>${formatYen(o.total_amount)}</td>
          <td>${o.delivery_date || '—'}</td>
        </tr>
      `).join('') || '<tr><td colspan="7" style="color:#9e9e9e;text-align:center;padding:24px">確定注文はまだありません</td></tr>';
    }

    document.getElementById('btnOrdersCsv').addEventListener('click', () =>
      apiDownload('/api/orders/export.csv?exhibition_id=' + exhibition.id, 'orders.csv')
        .catch(e => showSnackbar(e.message)));

    // ──── Categories ────
    let editingCategoryId = null;

    async function loadCategories() {
      categories = await api('/api/exhibitions/' + exhibition.id + '/submission-categories?include_inactive=true');
      document.getElementById('categoriesTableBody').innerHTML = categories.map(cat => `
        <tr style="${cat.is_active ? '' : 'opacity:0.5'}">
          <td>${cat.sort_order}</td>
          <td>${escapeHtml(cat.name)}${cat.is_active ? '' : '（無効）'}</td>
          <td>${escapeHtml(cat.recipient_org_name || '')}</td>
          <td>${cat.is_required ? '<span class="chip-required">必須</span>' : '<span class="chip-optional">任意</span>'}</td>
          <td>${cat.document_count}件</td>
          <td>${cat.submitted_org_count}社</td>
          <td style="white-space:nowrap">
            <button class="icon-btn" title="編集" data-action="edit-category" data-id="${cat.id}">
              <span class="material-icons" style="font-size:18px">edit</span>
            </button>
            <button class="icon-btn" title="削除" data-action="delete-category" data-id="${cat.id}">
              <span class="material-icons" style="font-size:18px">delete</span>
            </button>
          </td>
        </tr>
      `).join('');
    }

    function fillRecipientOptions(selectedId) {
      const targets = organizations.filter(o => o.org_type !== 'exhibitor');
      document.getElementById('catRecipient').innerHTML = targets.map(o =>
        `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
      ).join('');
    }

    document.getElementById('btnAddCategory').addEventListener('click', () => {
      editingCategoryId = null;
      document.getElementById('categoryDialogTitle').textContent = 'カテゴリを追加';
      document.getElementById('catName').value = '';
      document.getElementById('catDesc').value = '';
      document.getElementById('catSort').value = categories.length + 1;
      document.getElementById('catRequired').checked = true;
      fillRecipientOptions();
      document.getElementById('categoryDialog').classList.add('show');
    });

    function showEditCategory(id) {
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      editingCategoryId = id;
      document.getElementById('categoryDialogTitle').textContent = 'カテゴリを編集';
      document.getElementById('catName').value = cat.name;
      document.getElementById('catDesc').value = cat.description || '';
      document.getElementById('catSort').value = cat.sort_order;
      document.getElementById('catRequired').checked = cat.is_required;
      fillRecipientOptions(cat.recipient_org_id);
      document.getElementById('categoryDialog').classList.add('show');
    }

    function closeCategoryDialog() {
      document.getElementById('categoryDialog').classList.remove('show');
    }

    document.getElementById('btnSaveCategory').addEventListener('click', async () => {
      const body = {
        name: document.getElementById('catName').value.trim(),
        description: document.getElementById('catDesc').value.trim() || null,
        recipient_org_id: document.getElementById('catRecipient').value,
        is_required: document.getElementById('catRequired').checked,
        sort_order: Number(document.getElementById('catSort').value) || 0,
      };
      if (!body.name) { showSnackbar('カテゴリ名を入力してください'); return; }
      try {
        if (editingCategoryId) {
          await api('/api/exhibitions/' + exhibition.id + '/submission-categories/' + editingCategoryId, { method: 'PUT', body });
        } else {
          await api('/api/exhibitions/' + exhibition.id + '/submission-categories', { method: 'POST', body });
        }
        closeCategoryDialog();
        showSnackbar('保存しました');
        loadCategories();
      } catch (e) { showSnackbar(e.message); }
    });

    async function deleteCategory(id) {
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      if (!confirm('カテゴリ「' + cat.name + '」を削除しますか？\n（提出済み書類がある場合は無効化されます）')) return;
      try {
        await api('/api/exhibitions/' + exhibition.id + '/submission-categories/' + id, { method: 'DELETE' });
        showSnackbar('削除しました');
        loadCategories();
      } catch (e) { showSnackbar(e.message); }
    }

    // ──── Exhibitor applications ────
    let applications = [];
    let approvingApplicationId = null;
    let rejectingApplicationId = null;
    const APPLICATION_STATUS = {
      pending: { text: '審査中', cls: 'status-review' },
      approved: { text: '承認済み', cls: 'status-confirmed' },
      rejected: { text: '却下', cls: 'status-error' },
    };

    async function refreshApplicationCount() {
      try {
        const res = await api('/api/exhibitions/' + exhibition.id + '/applications?status=pending');
        const chip = document.getElementById('applicationCountChip');
        chip.textContent = res.data.length;
        chip.style.display = res.data.length ? 'flex' : 'none';
      } catch {}
    }

    async function loadApplications() {
      try {
        const info = await api('/api/public/exhibitions/' + exhibition.id + '/application-info');
        document.getElementById('acceptingToggle').checked = info.data.accepting_applications;

        const status = document.getElementById('applicationStatusFilter').value;
        const res = await api('/api/exhibitions/' + exhibition.id + '/applications' + (status ? '?status=' + status : ''));
        applications = res.data;
        document.getElementById('applicationsTableBody').innerHTML = applications.map(a => {
          const st = APPLICATION_STATUS[a.status] || { text: a.status, cls: 'status-received' };
          const actions = a.status === 'pending' ? `
            <button class="btn btn-contained btn-sm" data-action="approve-application" data-id="${a.id}">承認</button>
            <button class="btn btn-text btn-sm" data-action="reject-application" data-id="${a.id}">却下</button>
          ` : (a.status === 'rejected' && a.rejection_reason
              ? `<span style="font-size:12px;color:#9e9e9e" title="${escapeHtml(a.rejection_reason)}">理由あり</span>` : '');
          return `
            <tr>
              <td style="white-space:nowrap">${formatDateTime(a.created_at)}</td>
              <td>${escapeHtml(a.company_name)}</td>
              <td>${escapeHtml(a.contact_name)}</td>
              <td style="font-size:12px">${escapeHtml(a.email)}${a.phone ? '<br>' + escapeHtml(a.phone) : ''}</td>
              <td>${a.booth_count}コマ</td>
              <td style="max-width:220px;font-size:12px;color:#616161">${escapeHtml(a.message || '—')}</td>
              <td><span class="chip-status ${st.cls}">${st.text}</span></td>
              <td style="white-space:nowrap">${actions}</td>
            </tr>
          `;
        }).join('') || '<tr><td colspan="8" style="color:#9e9e9e;text-align:center;padding:24px">申込はまだありません</td></tr>';
        refreshApplicationCount();
      } catch (e) { showSnackbar(e.message); }
    }

    document.getElementById('applicationStatusFilter').addEventListener('change', loadApplications);

    document.getElementById('acceptingToggle').addEventListener('change', async (e) => {
      try {
        await api('/api/exhibitions/' + exhibition.id + '/application-settings', {
          method: 'PATCH',
          body: { accepting_applications: e.target.checked },
        });
        showSnackbar(e.target.checked ? '出展申込の受付を開始しました' : '出展申込の受付を停止しました');
      } catch (err) {
        e.target.checked = !e.target.checked;
        showSnackbar(err.message);
      }
    });

    document.getElementById('btnCopyApplyUrl').addEventListener('click', async () => {
      const url = location.origin + '/apply.html?exhibition=' + exhibition.id;
      try {
        await navigator.clipboard.writeText(url);
        showSnackbar('申込ページURLをコピーしました');
      } catch {
        prompt('申込ページURL（コピーしてください）', url);
      }
    });

    function showApproveDialog(id) {
      const a = applications.find(x => x.id === id);
      if (!a) return;
      approvingApplicationId = id;
      document.getElementById('approveSummary').textContent =
        a.company_name + ' / ' + a.contact_name + '（' + a.email + '・希望' + a.booth_count + 'コマ）';
      document.getElementById('approveBoothNumber').value = '';
      document.getElementById('approveDialog').classList.add('show');
    }
    function closeApproveDialog() {
      document.getElementById('approveDialog').classList.remove('show');
    }

    document.getElementById('btnConfirmApprove').addEventListener('click', async () => {
      const btn = document.getElementById('btnConfirmApprove');
      btn.disabled = true;
      try {
        const res = await api('/api/applications/' + approvingApplicationId + '/approve', {
          method: 'POST',
          body: { booth_number: document.getElementById('approveBoothNumber').value.trim() || null },
        });
        closeApproveDialog();
        const c = res.data.credentials;
        const booth = res.data.booth_number;
        document.querySelector('#credentialsDialog h3').textContent = 'アカウントを発行しました';
        lastCredentialsText =
          'DOSL HUB ログイン情報\nURL: ' + location.origin + '/login.html' +
          '\nメールアドレス: ' + c.email + '\n初期パスワード: ' + c.initial_password +
          (booth ? '\nブース番号: ' + booth : '');
        document.getElementById('credentialsBody').innerHTML =
          'ログインURL: ' + escapeHtml(location.origin + '/login.html') + '<br>' +
          'メールアドレス: <b>' + escapeHtml(c.email) + '</b><br>' +
          '初期パスワード: <b>' + escapeHtml(c.initial_password) + '</b>' +
          (booth ? '<br>ブース番号: <b>' + escapeHtml(booth) + '</b>' : '') +
          (res.data.email_sent ? '<br><span style="color:#2e7d32;font-size:13px">✓ 本人宛にメールでも送信済みです</span>' : '');
        document.getElementById('credentialsDialog').classList.add('show');
        loadApplications();
      } catch (e) { showSnackbar(e.message); }
      btn.disabled = false;
    });

    let lastCredentialsText = '';
    document.getElementById('btnCopyCredentials').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lastCredentialsText);
        showSnackbar('ログイン情報をコピーしました');
      } catch { showSnackbar('コピーできませんでした'); }
    });
    function closeCredentialsDialog() {
      lastCredentialsText = '';
      document.getElementById('credentialsDialog').classList.remove('show');
    }

    function showRejectDialog(id) {
      const a = applications.find(x => x.id === id);
      if (!a) return;
      rejectingApplicationId = id;
      document.getElementById('rejectSummary').textContent =
        a.company_name + ' / ' + a.contact_name + '（' + a.email + '）';
      document.getElementById('rejectReason').value = '';
      document.getElementById('rejectDialog').classList.add('show');
    }
    function closeRejectDialog() {
      document.getElementById('rejectDialog').classList.remove('show');
    }

    document.getElementById('btnConfirmReject').addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) { showSnackbar('却下理由を入力してください'); return; }
      try {
        await api('/api/applications/' + rejectingApplicationId + '/reject', {
          method: 'POST',
          body: { reason },
        });
        closeRejectDialog();
        showSnackbar('申込を却下しました');
        loadApplications();
      } catch (e) { showSnackbar(e.message); }
    });

    // ──── Design specs ────
    let designSpecs = [];
    let viewingSpecId = null;
    const SPEC_STATUS = {
      draft: { text: '下書き', cls: 'status-received' },
      confirmed: { text: '確定', cls: 'status-confirmed' },
      revised: { text: '修正あり', cls: 'status-review' },
    };
    const fmtMm = (v) => v == null ? '—' : Number(v).toLocaleString('ja-JP');

    async function loadSpecs() {
      if (!exhibition) return;
      try {
        const status = document.getElementById('specStatusFilter').value;
        const res = await api('/api/design-specs?exhibition_id=' + exhibition.id + (status ? '&status=' + status : ''));
        designSpecs = res.data;
        document.getElementById('specsTableBody').innerHTML = designSpecs.map(s => {
          const st = SPEC_STATUS[s.status] || { text: s.status, cls: 'status-received' };
          const elec = s.electrical_requirements;
          return `
            <tr>
              <td>${escapeHtml(s.booth_number || '—')}</td>
              <td>${escapeHtml(s.exhibitor_org_name || '')}</td>
              <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.file_name || '')}</td>
              <td style="white-space:nowrap">${fmtMm(s.width_mm)} × ${fmtMm(s.depth_mm)} × ${fmtMm(s.height_mm)}</td>
              <td>${(s.materials || []).length}種</td>
              <td>${elec && (elec.power_kw || elec.outlet_count || elec.lighting) ? 'あり' : '—'}</td>
              <td>v${s.version}</td>
              <td><span class="chip-status ${st.cls}">${st.text}</span></td>
              <td>
                <button class="icon-btn" title="詳細" data-action="show-spec" data-id="${s.id}">
                  <span class="material-icons" style="font-size:18px">visibility</span>
                </button>
              </td>
            </tr>
          `;
        }).join('') || '<tr><td colspan="9" style="color:#9e9e9e;text-align:center;padding:24px">設計仕様はまだありません（ブース設営書類が解析されると自動で作成されます）</td></tr>';
      } catch (e) { showSnackbar(e.message); }
    }

    document.getElementById('specStatusFilter').addEventListener('change', loadSpecs);

    async function showSpecDialog(id) {
      try {
        const res = await api('/api/design-specs/' + id);
        const s = res.data;
        viewingSpecId = id;
        document.getElementById('specDialogTitle').textContent =
          '設計仕様の詳細 — ' + (s.booth_number ? 'ブース ' + s.booth_number : '') + ' v' + s.version;
        document.getElementById('specDialogInfo').textContent =
          (s.exhibitor_org_name || '') + ' / 元ファイル: ' + (s.file_name || '');
        document.getElementById('specW').value = s.width_mm ?? '';
        document.getElementById('specD').value = s.depth_mm ?? '';
        document.getElementById('specH').value = s.height_mm ?? '';
        document.getElementById('specMaterialsBody').innerHTML = (s.materials || []).map(m => `
          <tr>
            <td>${escapeHtml(m.name || '')}</td>
            <td style="font-size:12px">${escapeHtml(m.specification || '')}</td>
            <td>${escapeHtml(m.color || '')}</td>
            <td style="font-size:12px">${escapeHtml(m.area || '')}</td>
          </tr>
        `).join('') || '<tr><td colspan="4" style="color:#9e9e9e;text-align:center">素材情報なし</td></tr>';
        const elec = s.electrical_requirements || {};
        document.getElementById('specElectrical').textContent =
          (elec.power_kw != null ? '電源 ' + elec.power_kw + 'kW　' : '') +
          (elec.outlet_count != null ? 'コンセント ' + elec.outlet_count + '口　' : '') +
          (elec.lighting || '') || '電気要件なし';
        document.getElementById('specStructural').value = s.structural_details || '';
        document.getElementById('specSpecial').value = s.special_requirements || '';
        // 編集は主催者のみ。partner/viewerは閲覧のみ
        const editable = isManager;
        ['specW', 'specD', 'specH', 'specStructural', 'specSpecial'].forEach(fid =>
          document.getElementById(fid).disabled = !editable);
        document.getElementById('btnSaveSpec').style.display = editable ? '' : 'none';
        document.getElementById('btnSpecConfirm').style.display =
          editable && s.status !== 'confirmed' ? '' : 'none';
        document.getElementById('specDialog').classList.add('show');
      } catch (e) { showSnackbar(e.message); }
    }

    function closeSpecDialog() {
      document.getElementById('specDialog').classList.remove('show');
    }

    async function saveSpec(extra) {
      const numOrNull = (fid) => {
        const v = document.getElementById(fid).value;
        return v === '' ? null : Number(v);
      };
      const body = {
        width_mm: numOrNull('specW'),
        depth_mm: numOrNull('specD'),
        height_mm: numOrNull('specH'),
        structural_details: document.getElementById('specStructural').value.trim() || null,
        special_requirements: document.getElementById('specSpecial').value.trim() || null,
        ...extra,
      };
      try {
        await api('/api/design-specs/' + viewingSpecId, { method: 'PUT', body });
        closeSpecDialog();
        showSnackbar('保存しました');
        loadSpecs();
      } catch (e) { showSnackbar(e.message); }
    }

    document.getElementById('btnSaveSpec').addEventListener('click', () => saveSpec({}));
    document.getElementById('btnSpecConfirm').addEventListener('click', () => saveSpec({ status: 'confirmed' }));

    // ──── User management ────
    let managedUsers = [];
    let editingOrgId = null;
    let editingUserId = null;
    const ROLE_LABELS = {
      admin: '管理者', organizer: '主催者', exhibitor: '出展社',
      partner: '協力会社', viewer: '閲覧のみ',
    };
    const ORG_TYPE_LABELS = {
      organizer: '主催者', decorator: '装飾', exhibitor: '出展社', partner: '協力会社',
    };

    async function loadUsersTab() {
      try {
        const [orgRes, userRes] = await Promise.all([
          api('/api/organizations'),
          api('/api/users' + buildUserQuery()),
        ]);
        organizations = orgRes.data;
        managedUsers = userRes.data;
        renderOrgs();
        renderUsers();
        fillUserOrgFilter();
      } catch (e) { showSnackbar(e.message); }
    }

    function buildUserQuery() {
      const params = new URLSearchParams();
      const org = document.getElementById('userFilterOrg').value;
      const role = document.getElementById('userFilterRole').value;
      const q = document.getElementById('userFilterQ').value.trim();
      if (org) params.set('organization_id', org);
      if (role) params.set('role', role);
      if (q) params.set('search', q);
      const s = params.toString();
      return s ? '?' + s : '';
    }

    function renderOrgs() {
      document.getElementById('orgsTableBody').innerHTML = organizations.map(o => `
        <tr>
          <td>${escapeHtml(o.name)}</td>
          <td>${ORG_TYPE_LABELS[o.org_type] || escapeHtml(o.org_type)}</td>
          <td style="font-size:12px">${escapeHtml(o.contact_email || '')}${o.contact_phone ? '<br>' + escapeHtml(o.contact_phone) : ''}</td>
          <td>${o.user_count}名</td>
          <td style="white-space:nowrap">
            <button class="icon-btn" title="編集" data-action="edit-org" data-id="${o.id}">
              <span class="material-icons" style="font-size:18px">edit</span>
            </button>
            <button class="icon-btn" title="削除" data-action="delete-org" data-id="${o.id}">
              <span class="material-icons" style="font-size:18px">delete</span>
            </button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" style="color:#9e9e9e;text-align:center;padding:24px">組織がありません</td></tr>';
    }

    function renderUsers() {
      document.getElementById('usersTableBody').innerHTML = managedUsers.map(u => {
        const isSelf = u.id === currentUser.id;
        const toggle = isSelf ? '' : `
          <button class="icon-btn" title="${u.is_active ? '無効化' : '有効化'}" data-action="toggle-user" data-id="${u.id}">
            <span class="material-icons" style="font-size:18px">${u.is_active ? 'person_off' : 'how_to_reg'}</span>
          </button>`;
        return `
        <tr style="${u.is_active ? '' : 'opacity:0.5'}">
          <td>${escapeHtml(u.name)}${isSelf ? ' <span style="font-size:11px;color:#1565c0">(自分)</span>' : ''}</td>
          <td style="font-size:12px">${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.organization_name || '')}</td>
          <td>${ROLE_LABELS[u.role] || escapeHtml(u.role)}</td>
          <td>${u.is_active ? '<span class="chip-status status-confirmed">有効</span>' : '<span class="chip-status status-error">無効</span>'}</td>
          <td style="white-space:nowrap">
            <button class="icon-btn" title="編集" data-action="edit-user" data-id="${u.id}">
              <span class="material-icons" style="font-size:18px">edit</span>
            </button>
            <button class="icon-btn" title="パスワード再発行" data-action="reset-user-password" data-id="${u.id}">
              <span class="material-icons" style="font-size:18px">key</span>
            </button>
            ${toggle}
          </td>
        </tr>
      `;
      }).join('') || '<tr><td colspan="6" style="color:#9e9e9e;text-align:center;padding:24px">該当するユーザーがいません</td></tr>';
    }

    function fillUserOrgFilter() {
      const sel = document.getElementById('userFilterOrg');
      const current = sel.value;
      sel.innerHTML = '<option value="">全組織</option>' + organizations.map(o =>
        `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('');
    }

    document.getElementById('btnUserSearch').addEventListener('click', loadUsersTab);
    document.getElementById('userFilterOrg').addEventListener('change', loadUsersTab);
    document.getElementById('userFilterRole').addEventListener('change', loadUsersTab);
    document.getElementById('userFilterQ').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadUsersTab();
    });

    // ── 組織の追加・編集・削除 ──
    document.getElementById('btnAddOrg').addEventListener('click', () => {
      editingOrgId = null;
      document.getElementById('orgDialogTitle').textContent = '組織を追加';
      document.getElementById('orgName').value = '';
      document.getElementById('orgType').value = 'exhibitor';
      document.getElementById('orgEmail').value = '';
      document.getElementById('orgPhone').value = '';
      document.getElementById('orgDialog').classList.add('show');
    });

    function showEditOrg(id) {
      const o = organizations.find(x => x.id === id);
      if (!o) return;
      editingOrgId = id;
      document.getElementById('orgDialogTitle').textContent = '組織を編集';
      document.getElementById('orgName').value = o.name;
      document.getElementById('orgType').value = o.org_type;
      document.getElementById('orgEmail').value = o.contact_email || '';
      document.getElementById('orgPhone').value = o.contact_phone || '';
      document.getElementById('orgDialog').classList.add('show');
    }

    function closeOrgDialog() {
      document.getElementById('orgDialog').classList.remove('show');
    }

    document.getElementById('btnSaveOrg').addEventListener('click', async () => {
      const body = {
        name: document.getElementById('orgName').value.trim(),
        org_type: document.getElementById('orgType').value,
        contact_email: document.getElementById('orgEmail').value.trim() || null,
        contact_phone: document.getElementById('orgPhone').value.trim() || null,
      };
      if (!body.name) { showSnackbar('組織名を入力してください'); return; }
      try {
        if (editingOrgId) {
          await api('/api/organizations/' + editingOrgId, { method: 'PATCH', body });
        } else {
          await api('/api/organizations', { method: 'POST', body });
        }
        closeOrgDialog();
        showSnackbar('保存しました');
        loadUsersTab();
      } catch (e) { showSnackbar(e.message); }
    });

    async function deleteOrg(id) {
      const o = organizations.find(x => x.id === id);
      if (!o) return;
      if (!confirm('組織「' + o.name + '」を削除しますか？\n（ユーザーや書類が紐づく場合は削除できません）')) return;
      try {
        await api('/api/organizations/' + id, { method: 'DELETE' });
        showSnackbar('削除しました');
        loadUsersTab();
      } catch (e) { showSnackbar(e.message); }
    }

    // ── ユーザーの追加・編集・無効化・パスワード再発行 ──
    function fillUserOrgOptions(selectedId) {
      document.getElementById('usrOrg').innerHTML = organizations.map(o =>
        `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${escapeHtml(o.name)}（${ORG_TYPE_LABELS[o.org_type] || o.org_type}）</option>`
      ).join('');
    }

    document.getElementById('btnAddUser').addEventListener('click', () => {
      editingUserId = null;
      document.getElementById('userDialogTitle').textContent = 'ユーザーを追加';
      document.getElementById('usrEmail').value = '';
      document.getElementById('usrEmail').disabled = false;
      document.getElementById('usrName').value = '';
      document.getElementById('usrRole').value = 'exhibitor';
      document.getElementById('userDialogNote').style.display = '';
      fillUserOrgOptions();
      document.getElementById('userDialog').classList.add('show');
    });

    function showEditUser(id) {
      const u = managedUsers.find(x => x.id === id);
      if (!u) return;
      editingUserId = id;
      document.getElementById('userDialogTitle').textContent = 'ユーザーを編集';
      document.getElementById('usrEmail').value = u.email;
      document.getElementById('usrEmail').disabled = true;  // メールは変更不可
      document.getElementById('usrName').value = u.name;
      document.getElementById('usrRole').value = u.role;
      document.getElementById('userDialogNote').style.display = 'none';
      fillUserOrgOptions(u.organization_id);
      document.getElementById('userDialog').classList.add('show');
    }

    function closeUserDialog() {
      document.getElementById('userDialog').classList.remove('show');
    }

    document.getElementById('btnSaveUser').addEventListener('click', async () => {
      const name = document.getElementById('usrName').value.trim();
      if (!name) { showSnackbar('名前を入力してください'); return; }
      const btn = document.getElementById('btnSaveUser');
      btn.disabled = true;
      try {
        if (editingUserId) {
          await api('/api/users/' + editingUserId, {
            method: 'PATCH',
            body: {
              name,
              role: document.getElementById('usrRole').value,
              organization_id: document.getElementById('usrOrg').value,
            },
          });
          closeUserDialog();
          showSnackbar('保存しました');
        } else {
          const email = document.getElementById('usrEmail').value.trim();
          if (!email) { showSnackbar('メールアドレスを入力してください'); btn.disabled = false; return; }
          const res = await api('/api/users', {
            method: 'POST',
            body: {
              email,
              name,
              role: document.getElementById('usrRole').value,
              organization_id: document.getElementById('usrOrg').value,
            },
          });
          closeUserDialog();
          showCredentials('アカウントを発行しました', res.data.credentials.email, res.data.credentials.initial_password, res.data.email_sent);
        }
        loadUsersTab();
      } catch (e) { showSnackbar(e.message); }
      btn.disabled = false;
    });

    async function toggleUserActive(id) {
      const u = managedUsers.find(x => x.id === id);
      if (!u) return;
      const next = !u.is_active;
      if (!confirm('「' + u.name + '」を' + (next ? '有効化' : '無効化') + 'しますか？' +
        (next ? '' : '\n（無効化するとログインできなくなります）'))) return;
      try {
        await api('/api/users/' + id, { method: 'PATCH', body: { is_active: next } });
        showSnackbar(next ? '有効化しました' : '無効化しました');
        loadUsersTab();
      } catch (e) { showSnackbar(e.message); }
    }

    async function resetUserPassword(id) {
      const u = managedUsers.find(x => x.id === id);
      if (!u) return;
      if (!confirm('「' + u.name + '」のパスワードを再発行しますか？\n（現在のパスワードは使えなくなります）')) return;
      try {
        const res = await api('/api/users/' + id + '/reset-password', { method: 'POST' });
        showCredentials('パスワードを再発行しました', res.data.email, res.data.new_password, res.data.email_sent);
      } catch (e) { showSnackbar(e.message); }
    }

    // 初期パスワード表示（出展申込の承認ダイアログを共用）
    function showCredentials(title, email, password, emailSent) {
      document.querySelector('#credentialsDialog h3').textContent = title;
      lastCredentialsText =
        'DOSL HUB ログイン情報\nURL: ' + location.origin + '/login.html' +
        '\nメールアドレス: ' + email + '\nパスワード: ' + password;
      document.getElementById('credentialsBody').innerHTML =
        'ログインURL: ' + escapeHtml(location.origin + '/login.html') + '<br>' +
        'メールアドレス: <b>' + escapeHtml(email) + '</b><br>' +
        'パスワード: <b>' + escapeHtml(password) + '</b>' +
        (emailSent ? '<br><span style="color:#2e7d32;font-size:13px">✓ 本人宛にメールでも送信済みです</span>' : '');
      document.getElementById('credentialsDialog').classList.add('show');
    }

    // ──── Exhibition management（managerのみ） ────
    let editingExhibitionId = null;
    const EXHIBITION_STATUS = {
      preparing: { text: '準備中', cls: 'status-review' },
      active: { text: '開催中', cls: 'status-confirmed' },
      closed: { text: '終了', cls: 'status-error' },
    };

    function renderExhibitionsTable() {
      document.getElementById('exhibitionsTableBody').innerHTML = exhibitions.map(e => {
        const st = EXHIBITION_STATUS[e.status] || { text: e.status, cls: 'status-received' };
        return `
          <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.venue || '')}</td>
            <td style="white-space:nowrap;font-size:13px">${e.start_date} 〜 ${e.end_date}</td>
            <td><span class="chip-status ${st.cls}">${st.text}</span></td>
            <td>
              <button class="icon-btn" title="編集" data-action="edit-exhibition" data-id="${e.id}">
                <span class="material-icons" style="font-size:18px">edit</span>
              </button>
            </td>
          </tr>
        `;
      }).join('') || '<tr><td colspan="5" style="color:#9e9e9e;text-align:center;padding:24px">展示会がありません</td></tr>';
    }

    document.getElementById('btnManageExhibitions').addEventListener('click', () => {
      renderExhibitionsTable();
      document.getElementById('exhibitionsDialog').classList.add('show');
    });
    function closeExhibitionsDialog() {
      document.getElementById('exhibitionsDialog').classList.remove('show');
    }

    document.getElementById('btnAddExhibition').addEventListener('click', () => {
      editingExhibitionId = null;
      document.getElementById('exhibitionEditTitle').textContent = '展示会を作成';
      document.getElementById('exName').value = '';
      document.getElementById('exVenue').value = '';
      document.getElementById('exStart').value = '';
      document.getElementById('exEnd').value = '';
      document.getElementById('exStatus').value = 'preparing';
      document.getElementById('exCopyField').style.display = '';
      document.getElementById('exCopyFrom').innerHTML = '<option value="">コピーしない</option>' +
        exhibitions.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
      document.getElementById('exhibitionEditDialog').classList.add('show');
    });

    function showEditExhibition(id) {
      const e = exhibitions.find(x => x.id === id);
      if (!e) return;
      editingExhibitionId = id;
      document.getElementById('exhibitionEditTitle').textContent = '展示会を編集';
      document.getElementById('exName').value = e.name;
      document.getElementById('exVenue').value = e.venue || '';
      document.getElementById('exStart').value = e.start_date;
      document.getElementById('exEnd').value = e.end_date;
      document.getElementById('exStatus').value = e.status;
      document.getElementById('exCopyField').style.display = 'none';  // コピーは新規作成時のみ
      document.getElementById('exhibitionEditDialog').classList.add('show');
    }

    function closeExhibitionEditDialog() {
      document.getElementById('exhibitionEditDialog').classList.remove('show');
    }

    document.getElementById('btnSaveExhibition').addEventListener('click', async () => {
      const body = {
        name: document.getElementById('exName').value.trim(),
        venue: document.getElementById('exVenue').value.trim(),
        start_date: document.getElementById('exStart').value,
        end_date: document.getElementById('exEnd').value,
        status: document.getElementById('exStatus').value,
      };
      if (!body.name) { showSnackbar('展示会名を入力してください'); return; }
      if (!body.venue) { showSnackbar('会場を入力してください'); return; }
      if (!body.start_date || !body.end_date) { showSnackbar('会期を入力してください'); return; }
      if (body.end_date < body.start_date) { showSnackbar('会期終了日は開始日以降にしてください'); return; }

      const btn = document.getElementById('btnSaveExhibition');
      btn.disabled = true;
      try {
        if (editingExhibitionId) {
          const updated = await api('/api/exhibitions/' + editingExhibitionId, { method: 'PATCH', body });
          if (exhibition && exhibition.id === editingExhibitionId) {
            exhibition = updated;
            document.getElementById('appTitle').textContent = updated.name + ' - 管理';
            document.title = 'DOSL HUB 管理 - ' + updated.name;
          }
          showSnackbar('保存しました');
        } else {
          const created = await api('/api/exhibitions', { method: 'POST', body });
          const copyFrom = document.getElementById('exCopyFrom').value;
          if (copyFrom) {
            const res = await api(
              '/api/exhibitions/' + created.id + '/submission-categories/copy-from/' + copyFrom,
              { method: 'POST' });
            showSnackbar('展示会を作成しました（カテゴリを' + res.data.copied_count + '件コピー）');
          } else {
            showSnackbar('展示会を作成しました');
          }
        }
        exhibitions = await api('/api/exhibitions');
        renderExhibitionSelect(exhibition.id);
        renderExhibitionsTable();
        closeExhibitionEditDialog();
      } catch (e) { showSnackbar(e.message); }
      btn.disabled = false;
    });

    // ──── Notifications ────
    async function loadNotifications() {
      try {
        const res = await api('/api/notifications?limit=20');
        const badge = document.getElementById('notifBadge');
        badge.textContent = res.unread_count;
        badge.style.display = res.unread_count ? 'flex' : 'none';
        document.getElementById('notifList').innerHTML = res.data.map(n => `
          <div class="notif-item ${n.is_read ? '' : 'unread'}">
            <div class="t">${escapeHtml(n.title)}</div>
            ${n.message ? '<div class="m">' + escapeHtml(n.message) + '</div>' : ''}
            <div class="d">${formatDateTime(n.created_at)}</div>
          </div>
        `).join('') || '<div class="notif-item" style="color:#9e9e9e">通知はありません</div>';
      } catch {}
    }

    // 1分ごとに自動更新（タブが非表示のときはスキップ）
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadNotifications();
    }, 60000);

    document.getElementById('btnNotif').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notifPanel').classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notifPanel');
      if (panel.classList.contains('show') && !panel.contains(e.target)) {
        panel.classList.remove('show');
      }
    });
    document.getElementById('btnReadAll').addEventListener('click', async () => {
      try {
        await api('/api/notifications/read-all', { method: 'PUT' });
        loadNotifications();
      } catch (e) { showSnackbar(e.message); }
    });

    // ──── Snackbar ────
    function showSnackbar(text) {
      const sb = document.getElementById('snackbar');
      document.getElementById('snackbarText').textContent = text;
      sb.classList.add('show');
      setTimeout(() => sb.classList.remove('show'), 3000);
    }

    // ──── Start ────
    init();
    }
