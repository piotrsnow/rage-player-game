#!/usr/bin/env bash
# Gen1 GitHub trigger for krzemo2 + IAM required since ~2024 for Cloud Build triggers.
# Run from Cloud Shell or any machine with gcloud (project must match 152180839448 or override).
set -euo pipefail

REGION="${REGION:-europe-west1}"
SERVICE_NAME="${SERVICE_NAME:-krzemo2}"
TRIGGER_NAME="${TRIGGER_NAME:-krzemo2-deploy-main}"
REPO_OWNER="${REPO_OWNER:-piotrsnow}"
REPO_NAME="${REPO_NAME:-rage-player-game}"
BRANCH_PATTERN="${BRANCH_PATTERN:-^main$}"
RUNTIME_SA="${RUNTIME_SA:-rage-player-game-runtime}"
SELF_URL="${SELF_URL:-https://krzemo2-152180839448.europe-west1.run.app}"
CORS_ORIGIN="${CORS_ORIGIN:-$SELF_URL}"

PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CB_SA_RESOURCE="projects/${PROJECT_ID}/serviceAccounts/${CB_SA}"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project: ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "Cloud Build SA: ${CB_SA}"
echo "Service: ${SERVICE_NAME} @ ${REGION}"

echo "==> Enabling APIs..."
gcloud services enable \
  iam.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

echo "==> IAM for Cloud Build service account..."
for ROLE in roles/run.builder roles/run.admin roles/iam.serviceAccountUser roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CB_SA}" \
    --role="$ROLE" \
    --condition=None \
    >/dev/null
done

echo "==> IAM: Cloud Build may deploy as runtime SA..."
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  >/dev/null

echo "==> Removing broken Console triggers for ${SERVICE_NAME} (if any)..."
while IFS= read -r TID; do
  [[ -z "$TID" ]] && continue
  echo "    delete trigger ${TID}"
  gcloud builds triggers delete "$TID" --region="$REGION" --quiet || true
done < <(gcloud builds triggers list --region="$REGION" --format='value(id)' \
  --filter="name~'${SERVICE_NAME}' OR description~'${SERVICE_NAME}'" 2>/dev/null || true)

if gcloud builds triggers describe "$TRIGGER_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "==> Updating existing trigger ${TRIGGER_NAME}..."
  gcloud builds triggers update github "$TRIGGER_NAME" \
    --region="$REGION" \
    --repo-name="$REPO_NAME" \
    --repo-owner="$REPO_OWNER" \
    --branch-pattern="$BRANCH_PATTERN" \
    --build-config=cloudbuild.yaml \
    --service-account="$CB_SA_RESOURCE" \
    --substitutions="_SERVICE_NAME=${SERVICE_NAME},_SELF_URL=${SELF_URL},_CORS_ORIGIN=${CORS_ORIGIN},_RUNTIME_SERVICE_ACCOUNT=${RUNTIME_SA}"
else
  echo "==> Creating gen1 GitHub trigger ${TRIGGER_NAME}..."
  gcloud builds triggers create github "$TRIGGER_NAME" \
    --region="$REGION" \
    --repo-name="$REPO_NAME" \
    --repo-owner="$REPO_OWNER" \
    --branch-pattern="$BRANCH_PATTERN" \
    --build-config=cloudbuild.yaml \
    --service-account="$CB_SA_RESOURCE" \
    --substitutions="_SERVICE_NAME=${SERVICE_NAME},_SELF_URL=${SELF_URL},_CORS_ORIGIN=${CORS_ORIGIN},_RUNTIME_SERVICE_ACCOUNT=${RUNTIME_SA}"
fi

echo "==> Running trigger once..."
gcloud builds triggers run "$TRIGGER_NAME" --region="$REGION" --branch=main

echo ""
echo "Done. Watch: https://console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}"
echo "After success, verify: curl ${SELF_URL}/health"
echo ""
echo "Legacy rage-player-game deploy:"
echo "  gcloud builds submit --config cloudbuild.yaml \\"
echo "    --substitutions=_SERVICE_NAME=rage-player-game,_SELF_URL=https://rage-player-game-152180839448.europe-west1.run.app,_CORS_ORIGIN=https://rage-player-game-152180839448.europe-west1.run.app"
