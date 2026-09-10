import * as gcp from '@pulumi/gcp';
import { billingAccount, organization } from './organization.ts';
import { platformServiceAccount } from './platform-identity.ts';

/**
 * What the platform stack is allowed to do.
 *
 * These grants live here rather than in the stack they empower. An identity that can
 * rewrite its own permissions is not bounded by them, so the boundary has to be owned
 * by the layer above — the same reason organization policy cannot sit in the tree it
 * constrains.
 *
 * Creating the identity is not the thing that needs containing; granting it power is.
 * The platform stack mints its own service account, which is inert until something
 * here grants it something. So only the grants are held at this level, and the account
 * they name arrives as configuration.
 */

const member = platformServiceAccount.member;

/**
 * Everything the platform stack manages lives beneath this folder.
 *
 * Delegating a folder rather than the organization is what keeps platform's write
 * access off the organization node: `folderAdmin` and `projectCreator` are both
 * grantable on a folder, so the only organization-level grant below is read-only.
 */
export const platformFolder = new gcp.organizations.Folder(
  'platform',
  {
    displayName: 'platform',
    parent: organization.name,
  },
  { import: 'folders/523003355329' },
);

/** Read-only organization metadata, so the organization and its folders resolve. */
new gcp.organizations.IAMMember('platform-browser', {
  orgId: organization.orgId,
  role: 'roles/browser',
  member,
});

/**
 * Manage the hierarchy and create projects, but only beneath the delegated folder.
 *
 * `projectDeleter` is the counterpart to `projectCreator`: `folderAdmin` does not carry
 * `projects.delete`, so without it removing an app from the model would fail instead of
 * tearing its project down.
 */
for (const role of [
  'roles/resourcemanager.folderAdmin',
  'roles/resourcemanager.projectCreator',
  'roles/resourcemanager.projectDeleter',
]) {
  new gcp.folder.IAMMember(`platform-${role.split('.')[1]}`, {
    folder: platformFolder.name,
    role,
    member,
  });
}

/** Attach billing to projects the platform stack creates. */
new gcp.billing.AccountIamMember('platform-billing-user', {
  billingAccountId: billingAccount.id,
  role: 'roles/billing.user',
  member,
});
