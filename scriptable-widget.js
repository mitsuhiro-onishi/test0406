// ============================================================
// スクールカレンダー Scriptable Widget
// iOSホーム画面に放課後デイの予定を表示
//
// 【セットアップ手順】
// 1. App Storeから「Scriptable」をインストール
// 2. Scriptableを開き、右上の「＋」で新規スクリプト作成
// 3. このコードを全てコピー＆ペースト
// 4. 下の FAMILY_ID を自分の家族コードに変更
// 5. スクリプト名を「スクールカレンダー」に変更して保存
// 6. ホーム画面を長押し → 「＋」→ Scriptable を検索
// 7. ウィジェットサイズを選んで追加（中サイズ推奨）
// 8. ウィジェットを長押し →「ウィジェットを編集」
// 9. Script で「スクールカレンダー」を選択
// ============================================================

// ★★★ ここを自分の家族コードに変更 ★★★
const FAMILY_ID = "ここに家族コードを入力";

const FIREBASE_DB_URL = "https://claude-68f78-default-rtdb.asia-southeast1.firebasedatabase.app";
const DAYS_TO_SHOW = 7; // 表示する日数

// サービスのデフォルト色（Firebaseから取得できない場合のフォールバック）
const FALLBACK_COLORS = {
  'joy': '#E67E22',
  'waku': '#27AE60',
  'nontan': '#8E44AD',
};

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// ---- データ取得 ----
async function fetchData() {
  try {
    const url = `${FIREBASE_DB_URL}/families/${FAMILY_ID}.json`;
    const req = new Request(url);
    const data = await req.loadJSON();
    return data;
  } catch (e) {
    console.error("Firebase fetch error: " + e);
    return null;
  }
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getServiceInfo(services, serviceId) {
  if (!services || !serviceId || serviceId === 'none') return null;
  const svc = Array.isArray(services)
    ? services.find(s => s.id === serviceId)
    : null;
  if (svc) return svc;
  // フォールバック
  if (FALLBACK_COLORS[serviceId]) {
    return { id: serviceId, name: serviceId.toUpperCase(), color: FALLBACK_COLORS[serviceId] };
  }
  return null;
}

function hexToColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color(hex, 1);
}

// ---- ウィジェット構築 ----
async function createWidget() {
  const familyData = await fetchData();
  const schedule = familyData?.schedule || {};
  const services = familyData?.services || [];

  const widget = new ListWidget();
  widget.backgroundColor = new Color("#1C1C1E");
  widget.setPadding(12, 14, 12, 14);

  // ヘッダー
  const header = widget.addStack();
  header.centerAlignContent();
  const titleText = header.addText("📅 スクールカレンダー");
  titleText.font = Font.boldSystemFont(13);
  titleText.textColor = Color.white();
  header.addSpacer();

  const now = new Date();
  const monthText = header.addText(`${now.getMonth() + 1}月`);
  monthText.font = Font.mediumSystemFont(12);
  monthText.textColor = new Color("#8E8E93");

  widget.addSpacer(8);

  // 日付行ヘッダー
  const daysHeader = widget.addStack();
  daysHeader.spacing = 0;

  for (let i = 0; i < DAYS_TO_SHOW; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);

    const dayStack = daysHeader.addStack();
    dayStack.size = new Size(0, 0);
    dayStack.layoutVertically();
    dayStack.centerAlignContent();

    if (i < DAYS_TO_SHOW - 1) daysHeader.addSpacer();

    // 曜日
    const dowText = dayStack.addText(DOW[d.getDay()]);
    dowText.font = Font.mediumSystemFont(10);
    const dowColor = d.getDay() === 0 ? "#FF453A" : d.getDay() === 6 ? "#5E5CE6" : "#8E8E93";
    dowText.textColor = new Color(dowColor);
    dowText.centerAlignText();

    dayStack.addSpacer(2);

    // 日付の丸
    const key = dateKey(d);
    const dayData = schedule[key];
    const hasService = dayData?.service && dayData.service !== 'none';
    const hasNote = dayData?.note && (!dayData?.service || dayData.service === 'none');
    const svc = hasService ? getServiceInfo(services, dayData.service) : null;

    const numStack = dayStack.addStack();
    numStack.size = new Size(28, 28);
    numStack.cornerRadius = 14;
    numStack.centerAlignContent();

    if (i === 0) {
      // 今日
      numStack.backgroundColor = new Color("#0A84FF");
    } else if (svc) {
      numStack.backgroundColor = hexToColor(svc.color);
    } else if (hasNote) {
      numStack.backgroundColor = new Color("#636366");
    } else {
      numStack.backgroundColor = new Color("#2C2C2E");
    }

    const numText = numStack.addText(String(d.getDate()));
    numText.font = Font.boldSystemFont(13);
    numText.textColor = Color.white();
    numText.centerAlignText();
  }

  widget.addSpacer(8);

  // 予定リスト（今日〜数日）
  let shownCount = 0;
  const maxShow = 4;

  for (let i = 0; i < DAYS_TO_SHOW && shownCount < maxShow; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const dayData = schedule[key];

    const hasService = dayData?.service && dayData.service !== 'none';
    const hasNote = dayData?.note;
    if (!hasService && !hasNote) continue;

    const svc = hasService ? getServiceInfo(services, dayData.service) : null;

    const row = widget.addStack();
    row.centerAlignContent();
    row.spacing = 6;

    // 日付
    const dateLabel = row.addText(`${d.getMonth() + 1}/${d.getDate()}`);
    dateLabel.font = Font.monospacedSystemFont(11, 0.3);
    dateLabel.textColor = new Color("#8E8E93");
    dateLabel.lineLimit = 1;

    // カラーバー
    const bar = row.addStack();
    bar.size = new Size(3, 16);
    bar.cornerRadius = 1.5;
    bar.backgroundColor = svc ? hexToColor(svc.color) : new Color("#636366");

    // サービス名 or メモ
    let labelStr = '';
    if (svc) labelStr += svc.name;
    if (hasNote && hasService) labelStr += ' / ' + dayData.note;
    else if (hasNote) labelStr += dayData.note;

    const label = row.addText(labelStr);
    label.font = Font.mediumSystemFont(12);
    label.textColor = Color.white();
    label.lineLimit = 1;

    row.addSpacer();

    // 時間
    if (dayData?.returnTime) {
      const timeLabel = row.addText(dayData.returnTime);
      timeLabel.font = Font.monospacedSystemFont(11, 0.3);
      timeLabel.textColor = new Color("#8E8E93");
    }

    shownCount++;
    if (shownCount < maxShow) widget.addSpacer(4);
  }

  if (shownCount === 0) {
    const noData = widget.addText("予定なし");
    noData.font = Font.regularSystemFont(13);
    noData.textColor = new Color("#636366");
  }

  widget.addSpacer();

  // Web版へのリンク
  widget.url = "https://mitsuhiro-onishi.github.io/test0406/";

  return widget;
}

// ---- 実行 ----
const widget = await createWidget();

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
