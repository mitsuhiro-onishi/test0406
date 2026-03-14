// モックデータ（API不要で静的に動作）

export interface MockCategory {
  id: string;
  name: string;
  description: string;
  recipient_org_name: string;
  is_required: boolean;
  sort_order: number;
}

export interface MockDocument {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  submission_category_name: string;
  source_channel: string;
  status: string;
  created_at: string;
}

export const MOCK_EXHIBITION = {
  id: "ex-001",
  name: "第15回 国際産業展示会",
  venue: "東京ビッグサイト",
  start_date: "2026-06-01",
  end_date: "2026-06-03",
};

export const MOCK_CATEGORIES: MockCategory[] = [
  {
    id: "cat-001",
    name: "コマ申込",
    description: "ブースの小間割・レイアウトに関する申込書",
    recipient_org_name: "○○装飾株式会社",
    is_required: true,
    sort_order: 1,
  },
  {
    id: "cat-002",
    name: "ブース設営",
    description: "ブースの施工・設営に関する設計書",
    recipient_org_name: "○○装飾株式会社",
    is_required: true,
    sort_order: 2,
  },
  {
    id: "cat-003",
    name: "電気申込",
    description: "電気工事・照明に関する申込書",
    recipient_org_name: "△△電気工事株式会社",
    is_required: true,
    sort_order: 3,
  },
  {
    id: "cat-004",
    name: "弁当注文",
    description: "出展者向け弁当・ケータリングの注文書",
    recipient_org_name: "□□フードサービス",
    is_required: false,
    sort_order: 4,
  },
  {
    id: "cat-005",
    name: "備品レンタル",
    description: "テーブル・椅子・ショーケース等の備品レンタル申込",
    recipient_org_name: "○○装飾株式会社",
    is_required: false,
    sort_order: 5,
  },
];

export const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: "doc-001",
    file_name: "コマ申込書_A社_2026.xlsx",
    file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    file_size_bytes: 245760,
    submission_category_name: "コマ申込",
    source_channel: "web_upload",
    status: "confirmed",
    created_at: "2026-03-10T14:30:00+09:00",
  },
  {
    id: "doc-002",
    file_name: "電気配線図.pdf",
    file_type: "application/pdf",
    file_size_bytes: 1258291,
    submission_category_name: "電気申込",
    source_channel: "web_upload",
    status: "received",
    created_at: "2026-03-12T09:15:00+09:00",
  },
  {
    id: "doc-003",
    file_name: "ブース設計図_v2.pdf",
    file_type: "application/pdf",
    file_size_bytes: 3145728,
    submission_category_name: "ブース設営",
    source_channel: "web_upload",
    status: "review_needed",
    created_at: "2026-03-13T16:45:00+09:00",
  },
  {
    id: "doc-004",
    file_name: "弁当注文書_撮影.jpg",
    file_type: "image/jpeg",
    file_size_bytes: 892416,
    submission_category_name: "弁当注文",
    source_channel: "camera_capture",
    status: "received",
    created_at: "2026-03-14T10:00:00+09:00",
  },
];
