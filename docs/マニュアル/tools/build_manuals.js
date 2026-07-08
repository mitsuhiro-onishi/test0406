// DOSL HUB 使い方マニュアル生成（出展社向け・管理者向けの2冊）
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak,
} = require("docx");

const IMG = path.join(__dirname, "images");
const OUT = "/Users/alltokyo42/Projects/exhibition-systems/document-management/docs/マニュアル";
fs.mkdirSync(OUT, { recursive: true });

const FONT = { ascii: "游ゴシック", hAnsi: "游ゴシック", eastAsia: "游ゴシック" };
const CONTENT_W = 9300; // DXA（16.5cm以内）
const PROD_URL = "https://34-168-97-181.sslip.io/login.html";

// ── ヘルパー ──
function pngSize(p) {
  const b = fs.readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function img(name, widthPx = 600) {
  const p = path.join(IMG, `${name}.png`);
  const { w, h } = pngSize(p);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 240 },
    children: [new ImageRun({
      type: "png",
      data: fs.readFileSync(p),
      transformation: { width: widthPx, height: Math.round((widthPx * h) / w) },
      altText: { title: name, description: name, name },
    })],
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text, ...opts })],
  });
}
function note(text) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    indent: { left: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "1565C0", space: 8 } },
    children: [new TextRun({ text, size: 19, color: "444444" })],
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 280 },
    children: [new TextRun(text)],
  });
}
function step(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 100, line: 300 },
    children: [new TextRun(text)],
  });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function makeTable(headers, rows, colWidths) {
  const widths = colWidths;
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((t, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: "222222", type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        spacing: { after: 0, line: 240 },
        children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 19 })],
      })],
    })),
  });
  const bodyRows = rows.map(cells => new TableRow({
    children: cells.map((t, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        spacing: { after: 0, line: 260 },
        children: [new TextRun({ text: t, size: 19 })],
      })],
    })),
  }));
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 160 }, children: [] });
}

function coverTitle(title, subtitle) {
  return [
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [new TextRun({ text: "DOSL HUB 展示会ドキュメント管理システム", size: 22, color: "666666" })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1565C0", space: 6 } },
      children: [new TextRun({ text: title, size: 44, bold: true })],
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: subtitle, size: 21, color: "444444" })],
    }),
  ];
}

function makeDoc(children) {
  return new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 30, bold: true, font: FONT, color: "0D47A1" },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "90CAF9", space: 4 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: FONT, color: "212121" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "・", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] },
        ...["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(ref => ({
          reference: ref,
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480, hanging: 360 } } } }],
        })),
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1300, bottom: 1134, left: 1300 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "", size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888" })],
          })],
        }),
      },
      children,
    }],
  });
}

const STATUS_TABLE_EXHIBITOR = makeTable(
  ["状態", "意味", "対応"],
  [
    ["受信済", "書類を受け付けました", "そのままお待ちください"],
    ["AI解析中", "AIが内容を読み取り中です（通常1分以内）", "そのままお待ちください"],
    ["解析済", "読み取りが完了し、事務局の確認待ちです", "対応不要です"],
    ["要レビュー", "事務局が内容を確認中です", "対応不要です（連絡があれば対応）"],
    ["確認済", "内容が確定しました", "提出完了です"],
    ["差し戻し", "内容に不備があり差し戻されました", "事務局の連絡に沿って再提出してください"],
    ["解析失敗", "ファイルが読み取れませんでした", "事務局が確認します（再提出をお願いする場合があります）"],
  ],
  [1700, 4400, 3200],
);

// ════════════════════════════════════════════
// ① 出展社向けマニュアル
// ════════════════════════════════════════════
const exhibitorDoc = makeDoc([
  ...coverTitle("出展社向け 操作マニュアル", "提出書類のアップロード手順のご案内（所要時間：約3分）"),

  h1("1. DOSL HUBとは"),
  p("DOSL HUBは、展示会の提出書類（電気申込・弁当注文・ブース設営図面など）をWebでかんたんに提出できるシステムです。今までお使いの申込書のファイルをそのままアップロードするだけで提出が完了します。書式の書き直しは必要ありません。"),
  bullet("パソコン・スマートフォンのどちらからでも使えます"),
  bullet("紙の書類は、スマートフォンのカメラで撮影してそのまま提出できます"),
  bullet("提出した書類の状況（受付済み・確認済みなど）がいつでも確認できます"),
  spacer(),

  h1("2. ログイン"),
  step("インターネットブラウザ（Safari・Chromeなど）で次のURLを開きます。", "s1"),
  note(PROD_URL),
  step("主催事務局から届いたメールアドレスとパスワードを入力し、「ログイン」を押します。", "s1"),
  img("login", 420),
  note("ログイン情報が分からない場合は、主催事務局までお問い合わせください。"),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("3. 書類を提出する（3ステップ）")] }),

  h2("STEP 1　ファイルを選ぶ"),
  step("「ファイルを選択」を押してファイルを選ぶか、点線の枠にファイルをドラッグ＆ドロップします。", "s2"),
  step("紙の書類は「カメラで撮影」を押すと、スマートフォンのカメラで撮影してそのまま提出できます。", "s2"),
  step("ファイルが追加されたことを確認し、「次へ」を押します。", "s2"),
  img("exhibitor_step1", 560),
  bullet("対応形式：Excel（.xlsx）・Word（.docx）・PDF・写真（JPG／PNG／HEIC）"),
  bullet("1ファイルの上限は50MBです。複数ファイルをまとめて選ぶこともできます（最大20ファイル）"),

  h2("STEP 2　カテゴリを選ぶ"),
  step("提出する書類の種類（カテゴリ）を1つ選び、「次へ」を押します。", "s3"),
  img("exhibitor_step2", 560),
  note("「必須」マークのカテゴリは、全出展社に提出をお願いしている書類です。"),

  h2("STEP 3　確認して送信"),
  step("ファイルとカテゴリに間違いがないか確認し、「送信する」を押します。", "s4"),
  img("exhibitor_step3", 560),
  p("送信が完了すると「アップロード完了」と表示され、AIが自動で内容の読み取りを開始します。これで提出は完了です。"),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("4. 提出した書類の状況を確認する")] }),
  p("画面下の「提出済み書類」に、提出したファイルの一覧と現在の状態が表示されます。"),
  img("exhibitor_doclist", 560),
  STATUS_TABLE_EXHIBITOR,
  spacer(),

  h1("5. 送信できなかったとき"),
  p("送信できなかったファイルは、選択済みファイルの一覧に赤字で理由が表示されます。"),
  bullet("「対応していないファイル形式です」→ Excel・Word・PDF・写真のいずれかで提出してください"),
  bullet("「ファイルサイズが50MBを超えています」→ ファイルを分けるか、写真の場合は撮り直してください"),
  bullet("赤字のファイルは「×」で削除するか、正しいファイルに差し替えてもう一度送信してください"),
  spacer(),

  h1("6. 複数の展示会に出展している場合"),
  p("複数の展示会に出展している場合は、画面上部（青いバー）の展示会名を押すと切り替えられます。書類は展示会ごとに提出してください。"),
  spacer(),

  h1("7. メールでの提出（準備中）"),
  p("Webの操作が難しい場合のために、専用メールアドレスへ書類を添付して送るだけの提出方法を準備しています（利用開始時期・宛先は主催事務局からご案内します）。"),
  bullet("このシステムに登録されているご自身のメールアドレスから送ってください（別のアドレスからは受け付けられません）"),
  bullet("件名に書類の種類を入れてください（例:「電気申込 3コマ分」）"),
  bullet("添付できるのはWeb提出と同じ形式（Excel・Word・PDF・写真、50MBまで）です"),
  bullet("取り込まれた書類は「提出済み書類」にメールのマークつきで表示されます"),
  spacer(),

  h1("8. 困ったときは"),
  bullet("パスワードを忘れた → 主催事務局へご連絡ください（再発行します）"),
  bullet("提出する書類を間違えた → 主催事務局へご連絡ください"),
  bullet("その他のお問い合わせ → 主催事務局の担当窓口までお願いします"),
]);

// ════════════════════════════════════════════
// ② 管理者向けマニュアル
// ════════════════════════════════════════════
const ROLE_TABLE = makeTable(
  ["ロール", "対象", "できること"],
  [
    ["管理者（admin）", "システム管理者", "すべての機能＋ユーザー管理・展示会作成"],
    ["主催者（organizer）", "主催事務局", "すべての機能＋レビュー承認・展示会作成"],
    ["出展社（exhibitor）", "出展企業の担当者", "自社の書類の提出・確認のみ"],
    ["協力会社（partner）", "電気・装飾・ケータリング等", "自社宛カテゴリの書類・注文の閲覧のみ"],
    ["閲覧のみ（viewer）", "関係者", "全書類の閲覧のみ（操作不可）"],
  ],
  [2300, 2600, 4400],
);

const STATUS_TABLE_ADMIN = makeTable(
  ["状態", "意味", "次のアクション"],
  [
    ["受信", "アップロード直後の状態", "自動でAI解析に進みます"],
    ["AI解析中", "AIが内容を読み取り中", "通常1分以内に完了します"],
    ["解析済", "読み取り完了（信頼度85%以上で自動承認済み）", "内容はいつでも確認できます"],
    ["要レビュー", "信頼度が低く、人の確認が必要", "「AIレビュー」画面で承認/差し戻し"],
    ["確認済", "レビューで承認済み", "注文・設計仕様に反映済み"],
    ["差し戻し", "レビューで差し戻した書類", "出展社へ再提出を依頼"],
    ["解析失敗", "ファイル破損などで読み取れなかった", "「再解析」ボタンで再実行"],
  ],
  [1700, 4200, 3400],
);

const adminDoc = makeDoc([
  ...coverTitle("管理者向け 操作マニュアル", "主催事務局・協力会社向け：書類の受付からレビュー・集計までの操作ガイド"),

  h1("1. システム概要"),
  p("DOSL HUBは、出展社から提出される書類をWebで受け付け、AIが内容を自動で読み取って構造化するシステムです。フォーマットがばらばらの申込書でも、AIが差異を吸収して一覧・集計できる形に変換します。"),
  p("書類が届いてからの流れは次のとおりです。", { bold: true }),
  step("出展社が書類をアップロードすると、AIが自動で内容を読み取ります（約1分）。", "s1"),
  step("読み取りの信頼度が85%以上なら自動承認され、注文データ・設計仕様が自動作成されます。", "s1"),
  step("信頼度が低い書類だけが「AIレビュー」に入ります。原本と読み取り結果を見比べて承認します。", "s1"),
  step("承認済みデータは「注文集計」「設計仕様」で確認・CSV出力できます。", "s1"),
  note("つまり、日常の運用で人がやることは「要レビューの書類を確認する」ことだけです。"),
  spacer(),
  ROLE_TABLE,

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("2. ログインと画面構成")] }),
  p(`ブラウザで ${PROD_URL} を開き、管理者アカウントでログインします。`),
  img("admin_dashboard", 600),
  bullet("上部バー：展示会の切替（プルダウン）／歯車＝展示会の管理／ベル＝通知／ログアウト"),
  bullet("左メニュー：各機能への切替。オレンジの数字は「対応が必要な件数」です"),
  bullet("スマートフォンでは左上のメニューボタンからメニューを開きます"),
  spacer(),

  h1("3. ダッシュボード"),
  p("展示会全体の状況をひと目で確認できます。"),
  bullet("上段カード：受信書類数・解析済・要レビュー・確認済の件数（カードを押すと書類一覧へ）"),
  bullet("提出カテゴリ別の提出状況：出展社ごとの提出率。締切前の催促にご活用ください"),
  bullet("最近の受信書類：新しく届いた書類が時系列で並びます"),
  spacer(),

  h1("4. 書類一覧"),
  img("admin_documents", 600),
  bullet("ステータス・カテゴリ・キーワード（ファイル名/出展社名）で絞り込みできます"),
  bullet("行を押すと詳細（AI読み取り結果・品目・金額）が開きます"),
  bullet("「経路」列で提出方法（Web／カメラ／メール）が分かります"),
  bullet("ダウンロードアイコン＝原本の保存／回転矢印アイコン＝AI再解析"),
  bullet("「CSV出力」で提出状況の一覧をExcelで開ける形式で保存できます"),
  spacer(),
  STATUS_TABLE_ADMIN,

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("5. AIレビュー（一番よく使う画面）")] }),
  p("AIの読み取り信頼度が低い書類（手書き・低画質など）がここに並びます。左のリストから書類を選ぶと、原本プレビューとAI読み取り結果が左右に表示されます。"),
  img("admin_review", 600),
  step("信頼度と「要確認」のフィールド（黄色の入力欄）を原本と見比べます。", "s2"),
  step("読み取りが間違っていれば、品目・金額・納期をその場で修正します。", "s2"),
  step("ボタンで確定します：", "s2"),
  bullet("このまま承認 … 読み取り結果をそのまま確定（注文・設計仕様が作成されます）"),
  bullet("修正して承認 … 画面上で修正した内容で確定"),
  bullet("差し戻し … 内容に問題があるとき（出展社の書類一覧に「差し戻し」と表示されます）"),
  note("ブース設営・図面系の書類では、読み取った寸法・素材・電気要件が青いカードで表示されます（編集は承認後に「設計仕様」タブで行います）。"),
  spacer(),

  h1("6. 注文集計"),
  p("承認済みの申込書・注文書から自動作成された注文データを集計します。"),
  img("admin_orders", 600),
  bullet("出展社別の注文金額と、注文の明細一覧が確認できます"),
  bullet("「CSV出力」で品目明細つきの注文一覧を保存できます（協力会社への発注にご活用ください）"),
  spacer(),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("7. 設計仕様（ブース設営書類）")] }),
  p("ブース設営・図面系の書類からAIが抽出した寸法（mm）・素材・電気要件をブース別に管理します。装飾会社・電気会社との仕様確認にご活用ください。"),
  img("admin_designspecs", 600),
  p("目のアイコンを押すと詳細が開き、寸法や素材を修正できます。内容が固まったら「確定にする」を押してください（修正すると版数が上がります）。"),
  img("admin_spec_dialog", 480),
  spacer(),

  h1("8. カテゴリ管理"),
  p("出展社がアップロード時に選ぶ「提出カテゴリ」と、その受取先（協力会社）を設定します。"),
  img("admin_categories", 600),
  bullet("「カテゴリを追加」で新しい提出物を設定できます。受取先の組織を必ず指定してください"),
  bullet("「必須」にすると、ダッシュボードの提出率の集計対象になります"),
  bullet("提出済み書類があるカテゴリは削除できません（無効化されます）"),
  spacer(),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("9. 出展申込（セルフサービス受付）")] }),
  p("展示会ごとに、出展社が自分で申し込めるWebフォームを公開できます。"),
  img("admin_applications", 600),
  step("「この展示会で出展申込を受け付ける」をONにします。", "s3"),
  step("「申込ページURLをコピー」で公開フォームのURLを取得し、案内メールやWebサイトに掲載します。", "s3"),
  step("申込が届いたら内容を確認し、「承認」または「却下」します。", "s3"),
  note("承認すると、出展社の組織とログインアカウントが自動作成され、初期パスワードが一度だけ画面に表示されます。この画面を閉じると再表示できないため、必ずコピーして出展社の担当者へ安全な方法でお伝えください。（メール通知の有効化後は本人宛に自動送信され、画面に「✓ メールでも送信済み」と表示されます）"),
  spacer(),

  h1("10. ユーザー管理"),
  p("組織（出展社・協力会社など）とログインユーザーを管理します。"),
  img("admin_users", 600),
  bullet("ユーザー作成時は初期パスワードが自動発行され、一度だけ表示されます（メール通知の有効化後は本人宛にも自動送信されます）"),
  bullet("鍵アイコン＝パスワード再発行（忘れた場合はこちら）"),
  bullet("人型アイコン＝無効化／有効化（退職・交代時はアカウントを無効化してください）"),
  bullet("自分自身の無効化・ロール変更はできません"),
  spacer(),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("11. 展示会の作成・切替")] }),
  p("上部バーの歯車アイコンから、展示会の一覧・新規作成・編集ができます。"),
  img("admin_exhibitions_dialog", 480),
  bullet("上部バーのプルダウンで表示する展示会を切り替えます（選択は次回ログイン時も維持されます）"),
  bullet("新規作成時に「カテゴリを既存展示会からコピー」を選ぶと、提出カテゴリ設定を引き継げます"),
  bullet("終了した展示会は状態を「終了」にしてください。出展社の画面に表示されなくなります（データは残ります）"),
  spacer(),

  new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("12. メールでの書類受付（準備中）")] }),
  p("Webが苦手な出展社向けに、専用メールアドレスへ添付して送るだけの提出経路を準備しています。有効化すると次のように動きます（宛先アドレス・開始時期は決まり次第ご案内します）。"),
  bullet("約2分ごとに専用メールボックスを自動チェックし、添付書類を取り込んでAI解析に流します"),
  bullet("登録ユーザーのメールアドレスから届いたものだけを取り込みます。未登録アドレスからのメールは取り込まず、通知でお知らせします"),
  bullet("書類の種類は件名で自動判定します（例: 件名「電気申込 3コマ分」→カテゴリ「電気申込」）"),
  bullet("判定できなかった書類は「メール受信（未分類）」に入ります。書類の詳細を開くと下のような振替欄が出るので、正しいカテゴリへ振り替えてください"),
  img("admin_doc_transfer", 560),
  note("同じメールが二重に取り込まれることはありません（処理済みメールには自動でラベルが付きます）。"),
  spacer(),

  h1("13. 困ったときは"),
  bullet("書類が「解析失敗」になった → 書類一覧の回転矢印アイコン（再解析）を押してください。繰り返し失敗する場合はファイルが破損している可能性があります"),
  bullet("出展社がパスワードを忘れた → ユーザー管理の鍵アイコンで再発行し、新しいパスワードを伝えてください"),
  bullet("通知が来ない → ベルの通知は画面表示中に約1分間隔で自動更新されます"),
  bullet("システムの不具合・ご要望 → システム管理者（DOSL）までご連絡ください"),
]);

// ── 出力 ──
(async () => {
  fs.writeFileSync(path.join(OUT, "DOSL_HUB_出展社向け操作マニュアル.docx"), await Packer.toBuffer(exhibitorDoc));
  fs.writeFileSync(path.join(OUT, "DOSL_HUB_管理者向け操作マニュアル.docx"), await Packer.toBuffer(adminDoc));
  console.log("written to", OUT);
})();
