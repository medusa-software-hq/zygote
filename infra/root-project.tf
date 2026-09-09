#region Root GCP project

data "google_project" "root" {
  project_id = local.gcp_root_project_id
}

resource "google_project_service" "root" {
  for_each = toset([
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "orgpolicy.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])

  project            = data.google_project.root.project_id
  service            = each.key
  disable_on_destroy = false
}

#endregion

# Root Terraform state bucket
data "google_storage_bucket" "root_tfstate" {
  name = local.gcp_root_tfstate_bucket_name
}

# Root workload identity pool
resource "google_iam_workload_identity_pool" "root" {
  project                   = data.google_project.root.project_id
  workload_identity_pool_id = "root-pool"
  display_name              = "Root"
  description               = "Root workload identity pool."
  disabled                  = false

  depends_on = [google_project_service.root]
}

#region Outputs

output "gcp_root_project_id" {
  description = "GCP root project ID."
  value       = data.google_project.root.project_id
}

output "root_tfstate_bucket_name" {
  description = "GCP root Terraform state bucket name."
  value       = data.google_storage_bucket.root_tfstate.name
}

#endregion
