import * as gcp from '@pulumi/gcp';
import * as random from '@pulumi/random';
import { billingAccount, organization } from './organization.ts';

/**
 * Holds the identity the platform stack runs as.
 *
 * Deliberately at the organization root rather than inside the delegated folder.
 * `folderAdmin` carries `resourcemanager.projects.setIamPolicy`, so any project inside
 * that folder is one call away from platform granting itself ownership of it — which
 * would put the very identity it authenticates with back within its own reach.
 */

const suffix = new random.RandomId('bootstrap-project-suffix', { byteLength: 4 });

export const bootstrapProject = new gcp.organizations.Project('bootstrap', {
  name: 'bootstrap',
  projectId: suffix.hex.apply((hex) => `ms-bootstrap-${hex}`),
  orgId: organization.orgId,
  billingAccount: billingAccount.id,
  deletionPolicy: 'DELETE',
});

export const bootstrapServices = [
  // For the platform budget, whose API calls this project pays for.
  'billingbudgets.googleapis.com',
  'cloudbilling.googleapis.com',
  'cloudresourcemanager.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  // Holds the credentials the platform stack is given, which used to be ciphertext in its
  // own environment.
  'secretmanager.googleapis.com',
  'serviceusage.googleapis.com',
  'sts.googleapis.com',
].map(
  (service) =>
    new gcp.projects.Service(`bootstrap-${service}`, {
      project: bootstrapProject.projectId,
      service,
      disableOnDestroy: false,
    }),
);
