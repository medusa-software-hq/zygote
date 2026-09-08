locals {
  # Root Terraform state bucket prefix for the Platform stack
  platform_tfstate_prefix = "platform"
}

# Platform GitHub repository
resource "github_repository" "platform" {
  name = "platform"

  visibility = "public"

  is_template = false

  has_discussions = false
  has_issues      = true
  has_projects    = false
  has_wiki        = false

  allow_merge_commit = true
  allow_squash_merge = false
  allow_rebase_merge = false

  allow_forking          = true
  allow_auto_merge       = true
  delete_branch_on_merge = true
}

import {
  id = "platform"
  to = github_repository.platform
}

#region Platform CI/CD

# Workload identity provider
resource "google_iam_workload_identity_pool_provider" "platform_cicd" {
  project                            = data.google_project.root.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.root.workload_identity_pool_id
  workload_identity_pool_provider_id = "platform-github-actions-provider"
  display_name                       = "Platform / GitHub Actions"
  description                        = "Workload identity provider for GitHub Actions in the Platform repo."
  disabled                           = false

  attribute_mapping = {
    "google.subject"                  = "assertion.sub"
    "attribute.actor"                 = "assertion.actor"
    "attribute.aud"                   = "assertion.aud"
    "attribute.ref"                   = "assertion.ref"
    "attribute.repository"            = "assertion.repository"
    "attribute.repository_owner"      = "assertion.repository_owner"
    "attribute.repository_visibility" = "assertion.repository_visibility"
    "attribute.workflow"              = "assertion.workflow_ref"
  }

  # Trust only the Platform repository
  attribute_condition = "assertion.repository == '${local.gh_organization_name}/${github_repository.platform.name}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

#region Service account

resource "google_service_account" "platform_cicd" {
  project      = data.google_project.root.project_id
  account_id   = "platform-cicd"
  display_name = "CI/CD Service Account"

  depends_on = [google_project_service.root["iam.googleapis.com"]]
}

# Grant the Platform CI/CD service account access to the root Terraform state bucket
resource "google_storage_bucket_iam_member" "platform_cicd_bucket_access" {
  bucket = data.google_storage_bucket.root_tfstate.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.platform_cicd.email}"

  # Restrict access to the specific prefix
  condition {
    title      = "platform-prefix"
    expression = <<-EOT
      resource.type == "storage.googleapis.com/Object" &&
      resource.name.startsWith("projects/_/buckets/${data.google_storage_bucket.root_tfstate.name}/objects/${local.platform_tfstate_prefix}/")
    EOT
  }
}

#endregion

#region GitHub Actions variables

resource "github_actions_variable" "platform_gcp_cicd_wi_provider" {
  repository    = github_repository.platform.name
  variable_name = "GCP_CICD_WI_PROVIDER"
  value         = google_iam_workload_identity_pool_provider.platform_cicd.workload_identity_pool_provider_id
}

resource "github_actions_variable" "platform_gcp_cicd_sa_email" {
  repository    = github_repository.platform.name
  variable_name = "GCP_CICD_SA_EMAIL"
  value         = google_service_account.platform_cicd.email
}

#endregion

#region GitHub Actions secrets

resource "github_actions_secret" "platform_gh_app_pem" {
  secret_name = "GH_TERRAFORMER_APP_PEM"

  # https://github.com/medusa-software-hq/platform/settings/secrets/actions/GH_APP_PEM
  value = "" # Placeholder
  repository  = github_repository.platform.name

  lifecycle {
    ignore_changes = [value]
  }
}

#endregion
