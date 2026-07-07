#!/bin/bash
# 実AI解析テスト: test_documents/ の3書類（PDF/PNG/Excel）をアップロードし解析結果を表示する
# 前提: backend/.env に ANTHROPIC_API_KEY 設定済み + サーバー再起動済み（provider=anthropic）
set -e
cd "$(dirname "$0")/.."
BASE=http://localhost:8710
PY=backend/.venv/bin/python

TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"exhibitor-a@dosl-hub.example.com","password":"exhibitor1234"}' \
  | $PY -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
EXID=$(curl -s $BASE/api/exhibitions -H "Authorization: Bearer $TOKEN" \
  | $PY -c "import sys,json;d=json.load(sys.stdin);print((d if isinstance(d,list) else d.get('items',[]))[0]['id'])")

declare -a FILES=(
  "test_documents/電気工事申込書_サンライズ電子_B-14.pdf|電気申込"
  "test_documents/弁当注文書_手書き_山口木工.png|弁当注文"
  "test_documents/備品レンタル申込書_グリーンフィールド_D-22.xlsx|備品レンタル"
)

CATS=$(curl -s "$BASE/api/exhibitions/$EXID/submission-categories" -H "Authorization: Bearer $TOKEN")

DOC_IDS=()
for entry in "${FILES[@]}"; do
  FILE="${entry%%|*}"; CATNAME="${entry##*|}"
  CATID=$(echo "$CATS" | $PY -c "
import sys, json
d = json.load(sys.stdin)
items = d if isinstance(d, list) else d.get('items', [])
print(next(c['id'] for c in items if c['name'] == '$CATNAME'))
")
  DOCID=$(curl -s -X POST $BASE/api/documents/upload -H "Authorization: Bearer $TOKEN" \
    -F "file=@$FILE" -F "exhibition_id=$EXID" -F "submission_category_id=$CATID" \
    | $PY -c "import sys,json;print(json.load(sys.stdin)['id'])")
  echo "uploaded: $FILE -> $DOCID"
  DOC_IDS+=("$DOCID|$FILE")
done

echo "--- 解析待ち（最大120秒ポーリング） ---"
for i in $(seq 1 40); do
  sleep 3
  PENDING=0
  for entry in "${DOC_IDS[@]}"; do
    DOCID="${entry%%|*}"
    ST=$(curl -s "$BASE/api/documents/$DOCID" -H "Authorization: Bearer $TOKEN" \
      | $PY -c "import sys,json;print(json.load(sys.stdin)['status'])")
    [[ "$ST" == "uploaded" || "$ST" == "processing" ]] && PENDING=1
  done
  [[ $PENDING -eq 0 ]] && break
done

echo "=== 結果 ==="
for entry in "${DOC_IDS[@]}"; do
  DOCID="${entry%%|*}"; FILE="${entry##*|}"
  curl -s "$BASE/api/documents/$DOCID" -H "Authorization: Bearer $TOKEN" | $PY -c "
import sys, json
d = json.load(sys.stdin)
a = d.get('ai_analysis') or {}
s = a.get('structured_data') or {}
print(f\"\"\"
■ $FILE
  status={d['status']}  confidence={a.get('confidence_score')}  review={a.get('review_status')}  model={a.get('llm_model')}
  会社名: {s.get('detected_company_name')}  ブース: {s.get('detected_booth_number')}
  合計金額: {s.get('total_amount')}  納期: {s.get('delivery_date')}
  品目数: {len(s.get('order_items') or [])}
  要約: {s.get('summary')}
  注意点: {s.get('extraction_notes')}\"\"\")
"
done
