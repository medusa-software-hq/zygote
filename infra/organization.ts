import * as gcp from '@pulumi/gcp';

/** The organization's Internet domain, and the name of its Cloud Identity account. */
export const organizationDomain = 'medusa.software';

export const organization = gcp.organizations.getOrganizationOutput({
  domain: organizationDomain,
});

export const billingAccount = gcp.organizations.getBillingAccountOutput({
  displayName: 'My Billing Account',
  open: true,

  // Enumerating the account's projects needs a permission that nothing here requires,
  // and the result is discarded.
  lookupProjects: false,
});
