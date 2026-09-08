# Constants
locals {
  primary_location    = "europe-west1"
  organization_domain = "medusa.software"
}

# Terraform configuration
terraform {
  required_version = ">= 1.15"

  required_providers {
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

#region Referenced global resources

data "google_organization" "gcp_organization" {
  domain = local.organization_domain
}

data "google_billing_account" "gcp_billing_account" {
  display_name = "My Billing Account"
  open         = true
}

#endregion
