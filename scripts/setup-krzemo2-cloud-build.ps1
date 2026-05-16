# Gen1 GitHub trigger for krzemo2 + IAM (same as setup-krzemo2-cloud-build.sh).
# Requires gcloud in PATH (Google Cloud SDK).

$ErrorActionPreference = "Stop"

$REGION = if ($env:REGION) { $env:REGION } else { "europe-west1" }
$SERVICE_NAME = if ($env:SERVICE_NAME) { $env:SERVICE_NAME } else { "krzemo2" }
$TRIGGER_NAME = if ($env:TRIGGER_NAME) { $env:TRIGGER_NAME } else { "krzemo2-deploy-main" }
$REPO_OWNER = if ($env:REPO_OWNER) { $env:REPO_OWNER } else { "piotrsnow" }
$REPO_NAME = if ($env:REPO_NAME) { $env:REPO_NAME } else { "rage-player-game" }
$BRANCH_PATTERN = if ($env:BRANCH_PATTERN) { $env:BRANCH_PATTERN } else { "^main$" }
$RUNTIME_SA = if ($env:RUNTIME_SA) { $env:RUNTIME_SA } else { "rage-player-game-runtime" }
$SELF_URL = if ($env:SELF_URL) { $env:SELF_URL } else { "https://krzemo2-152180839448.europe-west1.run.app" }
$CORS_ORIGIN = if ($env:CORS_ORIGIN) { $env:CORS_ORIGIN } else { $SELF_URL }

$PROJECT_ID = (gcloud config get-value project 2>$null).Trim()
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)").Trim()
$CB_SA = "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
$CB_SA_RESOURCE = "projects/${PROJECT_ID}/serviceAccounts/${CB_SA}"
$RUNTIME_SA_EMAIL = "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

Write-Host "Project: $PROJECT_ID ($PROJECT_NUMBER)"
Write-Host "Cloud Build SA: $CB_SA"
Write-Host "Service: $SERVICE_NAME @ $REGION"

Write-Host "==> Enabling APIs..."
gcloud services enable iam.googleapis.com cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

Write-Host "==> IAM for Cloud Build service account..."
@(
  "roles/run.builder",
  "roles/run.admin",
  "roles/iam.serviceAccountUser",
  "roles/secretmanager.secretAccessor"
) | ForEach-Object {
  gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$CB_SA" --role=$_ --condition=None | Out-Null
}

Write-Host "==> IAM: Cloud Build may deploy as runtime SA..."
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA_EMAIL `
  --member="serviceAccount:$CB_SA" `
  --role="roles/iam.serviceAccountUser" | Out-Null

$subs = "_SERVICE_NAME=$SERVICE_NAME,_SELF_URL=$SELF_URL,_CORS_ORIGIN=$CORS_ORIGIN,_RUNTIME_SERVICE_ACCOUNT=$RUNTIME_SA"

$exists = $false
try {
  gcloud builds triggers describe $TRIGGER_NAME --region=$REGION 2>$null | Out-Null
  $exists = $true
} catch {}

if ($exists) {
  Write-Host "==> Updating existing trigger $TRIGGER_NAME..."
  gcloud builds triggers update github $TRIGGER_NAME `
    --region=$REGION `
    --repo-name=$REPO_NAME `
    --repo-owner=$REPO_OWNER `
    --branch-pattern=$BRANCH_PATTERN `
    --build-config=cloudbuild.yaml `
    --service-account=$CB_SA_RESOURCE `
    --substitutions=$subs
} else {
  Write-Host "==> Creating gen1 GitHub trigger $TRIGGER_NAME..."
  gcloud builds triggers create github $TRIGGER_NAME `
    --region=$REGION `
    --repo-name=$REPO_NAME `
    --repo-owner=$REPO_OWNER `
    --branch-pattern=$BRANCH_PATTERN `
    --build-config=cloudbuild.yaml `
    --service-account=$CB_SA_RESOURCE `
    --substitutions=$subs
}

Write-Host "==> Running trigger once..."
gcloud builds triggers run $TRIGGER_NAME --region=$REGION --branch=main

Write-Host ""
Write-Host "Done. Cloud Build: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"
Write-Host "After success: curl $SELF_URL/health"
