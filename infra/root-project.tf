# Constants
locals {
  gcp_root_project_id          = "ms-root-cc216992"
  gcp_root_tfstate_bucket_name = "ms-root-tfstate-9d350b22"
}

#region Root GCP project

data "google_project" "root" {
  project_id = local.gcp_root_project_id
}

resource "google_project_service" "root" {
  for_each = toset([
    "storage.googleapis.com",
  ])

  project            = data.google_project.root.id
  service            = each.key
  disable_on_destroy = false
}

#endregion

#region Root Terraform state bucket

data "google_storage_bucket" "root_tfstate" {
  name          = local.gcp_root_tfstate_bucket_name
}

#endregion

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
