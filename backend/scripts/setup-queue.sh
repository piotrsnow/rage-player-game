#!/usr/bin/env bash
# setup-queue.sh — create / update the Cloud Tasks queue used by post-scene work.
#
# Run once per GCP project (or after changing retry parameters).
# Requires: gcloud CLI authenticated with roles/cloudtasks.admin.
#
# Usage:
#   GCP_PROJECT=my-project GCP_REGION=europe-central2 ./setup-queue.sh

set -euo pipefail

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:?Set GCP_REGION}"
QUEUE="post-scene-work"
DLQ_TOPIC="post-scene-work-dlq"

echo "==> Creating Pub/Sub DLQ topic (idempotent)…"
gcloud pubsub topics create "$DLQ_TOPIC" \
  --project="$PROJECT" 2>/dev/null || true

echo "==> Creating / updating Cloud Tasks queue '$QUEUE'…"
gcloud tasks queues create "$QUEUE" \
  --project="$PROJECT" \
  --location="$REGION" 2>/dev/null || true

gcloud tasks queues update "$QUEUE" \
  --project="$PROJECT" \
  --location="$REGION" \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=300s

echo "==> Done. Queue '$QUEUE' configured in $PROJECT / $REGION."
echo "    DLQ topic: $DLQ_TOPIC (wire manually in console if not already linked)."
