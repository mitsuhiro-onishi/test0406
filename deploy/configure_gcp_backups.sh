#!/bin/bash
# GCSバックアップバケットと日次GCEスナップショットを設定する。
# デフォルトはdry-run。外部変更を行う場合だけ --apply を明示する。
set -euo pipefail

PROJECT="${PROJECT:-dosl-hub-01}"
REGION="${REGION:-us-west1}"
ZONE="${ZONE:-us-west1-b}"
DISK="${DISK:-dosl-hub}"
BUCKET="${BACKUP_GCS_BUCKET:-dosl-hub-01-db-backups}"
POLICY="${SNAPSHOT_POLICY:-dosl-hub-daily-snapshots}"
VM_SERVICE_ACCOUNT="${VM_SERVICE_ACCOUNT:-426933437313-compute@developer.gserviceaccount.com}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" != "--apply" ]; then
  cat <<EOF
dry-run: 次の設定を行います（変更はまだ実行していません）
- gs://$BUCKET を $REGION に作成
- Uniform Bucket-Level Access / Public Access Prevention / Soft Delete 14日
- 通常オブジェクト30日保持（削除後はSoft Delete期間内に復旧可能）
- VMサービスアカウントへ、このバケット限定の objectCreator を付与
- $DISK に毎日18:00 UTC（03:00 JST）のスナップショット、14日保持

実行: $0 --apply
EOF
  exit 0
fi

if ! gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention \
    --soft-delete-duration=14d
fi
gcloud storage buckets update "gs://$BUCKET" \
  --project="$PROJECT" \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --soft-delete-duration=14d \
  --lifecycle-file="$SCRIPT_DIR/backup-bucket-lifecycle.json"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --project="$PROJECT" \
  --member="serviceAccount:$VM_SERVICE_ACCOUNT" \
  --role="roles/storage.objectCreator"

if ! gcloud compute resource-policies describe "$POLICY" \
  --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule "$POLICY" \
    --project="$PROJECT" \
    --region="$REGION" \
    --daily-schedule \
    --start-time=18:00 \
    --max-retention-days=14 \
    --on-source-disk-delete=keep-auto-snapshots \
    --snapshot-labels=app=dosl-hub,purpose=disaster-recovery
fi

ATTACHED_POLICIES="$(gcloud compute disks describe "$DISK" \
  --project="$PROJECT" --zone="$ZONE" \
  --format='value(resourcePolicies)' || true)"
if [[ "$ATTACHED_POLICIES" != *"$POLICY"* ]]; then
  gcloud compute disks add-resource-policies "$DISK" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --resource-policies="$POLICY"
fi

echo "GCPバックアップ基盤の設定が完了しました"
echo "BACKUP_GCS_BUCKET=$BUCKET を /opt/dosl-hub/backend/.env に設定してください"
