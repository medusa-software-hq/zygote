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

#region Delegation boundary

# The folder that the Platform stack manages.
resource "google_folder" "platform" {
  display_name = "platform"
  parent       = data.google_organization.gcp_organization.name
}

#endregion

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

  depends_on = [google_project_service.root]
}

# Let GitHub Actions in the Platform repo impersonate the CI/CD service account
resource "google_service_account_iam_member" "platform_cicd_workload_identity" {
  service_account_id = google_service_account.platform_cicd.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.root.name}/attribute.repository/${local.gh_organization_name}/${github_repository.platform.name}"
}

#region Terraform state access

# Object reads and writes, restricted to the Platform prefix
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

# Bucket listing (_not_ reading the objects' content)
resource "google_storage_bucket_iam_member" "platform_cicd_bucket_list" {
  bucket = data.google_storage_bucket.root_tfstate.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.platform_cicd.email}"
}

#endregion

#region Delegated permissions

# Read-only org metadata, so the Platform stack can resolve the org and its folders
resource "google_organization_iam_member" "platform_cicd_browser" {
  org_id = data.google_organization.gcp_organization.org_id
  role   = "roles/browser"
  member = "serviceAccount:${google_service_account.platform_cicd.email}"
}

# Manage sub-folders under the delegation boundary
resource "google_folder_iam_member" "platform_cicd_folder_admin" {
  folder = google_folder.platform.name
  role   = "roles/resourcemanager.folderAdmin"
  member = "serviceAccount:${google_service_account.platform_cicd.email}"
}

# Create projects under the delegation boundary
resource "google_folder_iam_member" "platform_cicd_project_creator" {
  folder = google_folder.platform.name
  role   = "roles/resourcemanager.projectCreator"
  member = "serviceAccount:${google_service_account.platform_cicd.email}"
}

# Attach the billing account to newly created projects
resource "google_billing_account_iam_member" "platform_cicd_billing_user" {
  billing_account_id = data.google_billing_account.gcp_billing_account.id
  role               = "roles/billing.user"
  member             = "serviceAccount:${google_service_account.platform_cicd.email}"
}

#endregion

#endregion

#region Policies

# Prevent the default VPC from ever being created.
resource "google_org_policy_policy" "platform_skip_default_network_creation" {
  name   = "${google_folder.platform.name}/policies/compute.skipDefaultNetworkCreation"
  parent = google_folder.platform.name

  spec {
    rules {
      enforce = "TRUE"
    }
  }
}

# Restrict usage of some pricey services that we won't use for now
resource "google_org_policy_policy" "platform_restrict_service_usage" {
  name   = "${google_folder.platform.name}/policies/gcp.restrictServiceUsage"
  parent = google_folder.platform.name

  spec {
    rules {
      values {
        denied_values = [
          "composer.googleapis.com",
          "compute.googleapis.com",
          "container.googleapis.com",
          "dataflow.googleapis.com",
          "dataproc.googleapis.com",
          "notebooks.googleapis.com",
          "sqladmin.googleapis.com",
        ]
      }
    }
  }
}

#endregion

#region Terraformer GitHub App credentials

# Terraformer app PEM key (versions are hand-managed)
resource "google_secret_manager_secret" "platform_terraformer_app_pem" {
  project   = data.google_project.root.project_id
  secret_id = "gh-platform-terraformer-app-pem"

  replication {
    user_managed {
      replicas {
        location = local.gcp_primary_location
      }
    }
  }

  depends_on = [google_project_service.root]
}

resource "google_secret_manager_secret_iam_member" "platform_cicd_secret_accessor" {
  project   = google_secret_manager_secret.platform_terraformer_app_pem.project
  secret_id = google_secret_manager_secret.platform_terraformer_app_pem.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.platform_cicd.email}"
}

#endregion

#region GitHub Actions variables

resource "github_actions_variable" "platform_gcp_cicd_wi_provider" {
  repository    = github_repository.platform.name
  variable_name = "GCP_CICD_WI_PROVIDER"
  value         = google_iam_workload_identity_pool_provider.platform_cicd.name
}

resource "github_actions_variable" "platform_gcp_cicd_sa_email" {
  repository    = github_repository.platform.name
  variable_name = "GCP_CICD_SA_EMAIL"
  value         = google_service_account.platform_cicd.email
}

#endregion

#endregion

#region Outputs

output "gcp_platform_folder_id" {
  description = "GCP folder that the Platform stack manages."
  value       = google_folder.platform.folder_id
}

output "platform_terraformer_app_pem_secret_id" {
  description = "Secret Manager secret holding the Terraformer GitHub App PEM."
  value       = google_secret_manager_secret.platform_terraformer_app_pem.secret_id
}

#endregion
