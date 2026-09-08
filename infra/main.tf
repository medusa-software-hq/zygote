# Constants
locals {
  organization_domain = "medusa.software"

  gcp_primary_location         = "europe-west1"
  gcp_root_project_id          = "ms-root-cc216992"
  gcp_root_tfstate_bucket_name = "ms-root-tfstate-9d350b22"

  gh_organization_name = "medusa-software-hq"
}

# Terraform configuration
terraform {
  required_version = ">= 1.15"

  backend "gcs" {
    bucket = "ms-root-tfstate-9d350b22"
    prefix = "zygote"
  }

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.11"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 7.25"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.8"
    }
  }
}

#region Terraform providers

provider "google" {
  project = local.gcp_root_project_id
  region  = local.gcp_primary_location
}

provider "github" {
  owner = local.gh_organization_name
}

#endregion

#region Referenced global resources

data "google_organization" "gcp_organization" {
  domain = local.organization_domain
}

data "google_billing_account" "gcp_billing_account" {
  display_name = "My Billing Account"
  open         = true
}

#endregion
