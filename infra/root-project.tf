#region Root GCP project

resource "random_id" "root_project_suffix" {
  byte_length = 4
}

resource "google_project" "root" {
  org_id          = data.google_organization.gcp_organization.org_id
  billing_account = data.google_billing_account.gcp_billing_account.id

  name       = "root"
  project_id = "ms-root-${random_id.root_project_suffix.hex}"

  auto_create_network = false
}

resource "google_project_service" "root" {
  for_each = toset([
    "storage.googleapis.com",
  ])

  project            = google_project.root.id
  service            = each.key
  disable_on_destroy = false
}

#endregion

#region Root Terraform state bucket

resource "random_id" "root_tfstate_bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "root_tfstate" {
  name          = "ms-root-tfstate-${random_id.root_tfstate_bucket_suffix.hex}"
  project       = google_project.root.project_id
  location      = local.primary_location
  storage_class = "STANDARD"

  # Force destroy allows Terraform to delete the bucket even if it has files inside
  force_destroy = true

  # Enforce uniform bucket-level access (security best practice)
  uniform_bucket_level_access = true

  # Prevent the bucket from being accidentally made public
  public_access_prevention = "enforced"

  # Keep old versions of files safe from accidental deletion
  versioning {
    enabled = true
  }

  # Automatically clean up or move old files
  lifecycle_rule {
    condition {
      age = 30 # days
    }

    action {
      type = "Delete"
    }
  }
}

#endregion

#region Outputs

output "gcp_root_project_id" {
  description = "GCP root project ID."
  value       = google_project.root.project_id
}

output "root_tfstate_bucket_name" {
  description = "GCP root Terraform state bucket name."
  value       = google_storage_bucket.root_tfstate.name
}

#endregion
