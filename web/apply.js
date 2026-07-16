    const exhibitionId = new URLSearchParams(location.search).get('exhibition');
    const loadingBox = document.getElementById('loadingBox');
    const closedBox = document.getElementById('closedBox');
    const formBox = document.getElementById('formBox');

    async function init() {
      if (!exhibitionId) {
        loadingBox.style.display = 'none';
        document.getElementById('closedText').textContent =
          '申込ページのURLが正しくありません。主催事務局から案内されたURLをご確認ください。';
        closedBox.style.display = 'block';
        return;
      }
      try {
        const res = await api('/api/public/exhibitions/' + exhibitionId + '/application-info');
        const ex = res.data;
        loadingBox.style.display = 'none';
        if (!ex.accepting_applications) {
          closedBox.style.display = 'block';
          return;
        }
        document.getElementById('exName').textContent = ex.name;
        document.getElementById('exMeta').textContent =
          (ex.venue ? ex.venue + ' / ' : '') + ex.start_date + ' 〜 ' + ex.end_date;
        formBox.style.display = 'block';
      } catch (err) {
        loadingBox.style.display = 'none';
        document.getElementById('closedText').textContent = err.message;
        closedBox.style.display = 'block';
      }
    }
    init();

    document.getElementById('applyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmit');
      const errorBox = document.getElementById('errorBox');
      errorBox.classList.remove('show');
      btn.disabled = true;
      btn.textContent = '送信中...';
      try {
        await api('/api/public/exhibitions/' + exhibitionId + '/applications', {
          method: 'POST',
          body: {
            company_name: document.getElementById('companyName').value,
            contact_name: document.getElementById('contactName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value || null,
            booth_count: Number(document.getElementById('boothCount').value),
            message: document.getElementById('message').value || null,
          },
        });
        formBox.style.display = 'none';
        document.getElementById('doneBox').style.display = 'block';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.add('show');
        btn.disabled = false;
        btn.textContent = '申込を送信';
      }
    });
