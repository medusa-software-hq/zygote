import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { bootstrapProject, bootstrapServices } from './bootstrap-project.ts';
import {
  DEPLOY_OPERATIONS,
  ESC_ENVIRONMENT,
  ESC_PROJECT,
  ESC_READER_ENVIRONMENT,
  PLATFORM_PROJECT,
  PLATFORM_STACK,
  deploySubject,
  escSubject,
  pulumiOrganization,
} from './platform-stack.ts';

/**
 * The identity the platform stack runs as.
 *
 * Pulumi Cloud mints an OIDC token, GCP exchanges it, and the result impersonates this
 * account. No key exists anywhere, and a local run takes the same path as a remote one.
 *
 * It lives here rather than in the stack that uses it because the account, the trust
 * that lets Pulumi Cloud assume it, and the grants that give it power are all things
 * platform must not be able to rewrite for itself.
 */

const dependsOn = { dependsOn: bootstrapServices };

export const pool = new gcp.iam.WorkloadIdentityPool(
  'pulumi-cloud',
  {
    project: bootstrapProject.projectId,
    workloadIdentityPoolId: 'pulumi-cloud',
    displayName: 'Pulumi Cloud',
    description: 'Identities issued by Pulumi Cloud for this organization.',
  },
  dependsOn,
);

export const poolProvider = new gcp.iam.WorkloadIdentityPoolProvider(
  'pulumi-cloud',
  {
    project: bootstrapProject.projectId,
    workloadIdentityPoolId: pool.workloadIdentityPoolId,
    workloadIdentityPoolProviderId: 'pulumi-cloud',
    displayName: 'Pulumi Cloud',

    // Only the subject. Every mapped attribute becomes a grantable principal, and an
    // attribute nothing binds to is a principal nobody meant to create — the audience
    // in particular is identical for every environment in the organization.
    attributeMapping: {
      'google.subject': 'assertion.sub',
    },

    oidc: {
      issuerUri: 'https://api.pulumi.com/oidc',
      // Pulumi will not issue a token bearing another organization's audience, so
      // this is the discriminator that matters. Two forms, because ESC and Deployments
      // issue under different audiences for the same organization.
      allowedAudiences: [`gcp:${pulumiOrganization}`, pulumiOrganization],
    },
  },
  dependsOn,
);

/**
 * The identity that forms the platform.
 *
 * Not the platform, and not the stack: the account a run of that stack assumes to make the
 * folders, projects and grants beneath the delegated folder. Named for what it does, because
 * `platform` read as though this were the thing itself.
 */
export const platformProvisionerServiceAccount = new gcp.serviceaccount.Account(
  'platform-provisioner',
  {
    project: bootstrapProject.projectId,
    accountId: 'platform-provisioner',
    displayName: 'Platform (provisioner)',
    description: 'Applies the platform stack, which is what forms the platform.',
  },
  dependsOn,
);

/**
 * A second identity for the same stack, able to read and nothing else.
 *
 * Previews are diffs, not writes, so they do not need the account that can change
 * things. Splitting them is what lets the ESC environment stay usable from a
 * workstation without that also being a way to apply from one.
 */
export const platformReaderServiceAccount = new gcp.serviceaccount.Account(
  'platform-reader',
  {
    project: bootstrapProject.projectId,
    accountId: 'platform-reader',
    displayName: 'Platform (reader)',
    description: 'Previews the platform stack. Holds no permission to change anything.',
  },
  dependsOn,
);

/**
 * Service account IAM changes take well over a minute to take effect here, and until
 * they do the failure is indistinguishable from a wrong principal: the token exchange
 * succeeds and only the impersonation afterwards is denied. Wait before concluding the
 * member is malformed.
 */
new gcp.serviceaccount.IAMMember('platform-reader-workload-identity', {
  serviceAccountId: platformReaderServiceAccount.name,
  role: 'roles/iam.workloadIdentityUser',
  // `principal://` with an exact subject, not a set: one environment, one account.
  // The ESC subject names an environment and no operation, so whatever it can reach,
  // it can reach for any operation — which is why it reaches the reader.
  member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/${escSubject(ESC_PROJECT, ESC_READER_ENVIRONMENT)}`,
});

/**
 * A third identity, holding nothing but the right to read what the platform stack is given.
 *
 * ESC assumes it while opening the platform environment, so the binding below names that
 * environment's subject rather than the reader's. It is a separate account from both of the
 * others because reading a credential and using one are different powers, and an account that
 * can do both would hand whoever reaches either of them the other.
 *
 * It carries no role in any project. What it may read is granted on each secret, one at a time,
 * where those secrets are declared.
 */
export const platformSecretsReaderServiceAccount = new gcp.serviceaccount.Account(
  'platform-secrets-reader',
  {
    project: bootstrapProject.projectId,
    accountId: 'platform-secrets-reader',
    displayName: 'Platform (secrets reader)',
    description: 'Reads the credentials the platform stack is given, and nothing else.',
  },
  dependsOn,
);

new gcp.serviceaccount.IAMMember('platform-secrets-reader-workload-identity', {
  serviceAccountId: platformSecretsReaderServiceAccount.name,
  role: 'roles/iam.workloadIdentityUser',
  // The environment the stack draws its configuration from, which is the one whose secrets
  // have to be opened. An environment's subject names no operation, so this is reachable
  // whenever that environment is opened — by a deployment, and by anyone who may open it.
  member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/${escSubject(ESC_PROJECT, ESC_ENVIRONMENT)}`,
});

/**
 * The same account, assumable by a deployment of the platform stack.
 *
 * Bound per operation, since the subject carries the operation and GCP has no wildcard
 * — which is what makes the omissions in `DEPLOY_OPERATIONS` mean something.
 */
for (const operation of DEPLOY_OPERATIONS) {
  new gcp.serviceaccount.IAMMember(`platform-provisioner-${operation}`, {
    serviceAccountId: platformProvisionerServiceAccount.name,
    role: 'roles/iam.workloadIdentityUser',
    member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/${deploySubject(PLATFORM_PROJECT, PLATFORM_STACK, operation)}`,
  });
}
