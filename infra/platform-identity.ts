import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { bootstrapProject, bootstrapServices } from './bootstrap-project.ts';
import {
  DEPLOY_OPERATIONS,
  ESC_ENVIRONMENT,
  ESC_PROJECT,
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

export const platformServiceAccount = new gcp.serviceaccount.Account(
  'platform',
  {
    project: bootstrapProject.projectId,
    accountId: 'platform',
    displayName: 'Platform',
    description: 'Runs the platform stack.',
  },
  dependsOn,
);

/**
 * Service account IAM changes take well over a minute to take effect here, and until
 * they do the failure is indistinguishable from a wrong principal: the token exchange
 * succeeds and only the impersonation afterwards is denied. Wait before concluding the
 * member is malformed.
 */
new gcp.serviceaccount.IAMMember('platform-workload-identity', {
  serviceAccountId: platformServiceAccount.name,
  role: 'roles/iam.workloadIdentityUser',
  // `principal://` with an exact subject, not a set: one environment, one account.
  member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/${escSubject(ESC_PROJECT, ESC_ENVIRONMENT)}`,
});

/**
 * The same account, assumable by a deployment of the platform stack.
 *
 * Bound per operation, since the subject carries the operation and GCP has no wildcard
 * — which is what makes the omissions in `DEPLOY_OPERATIONS` mean something.
 */
for (const operation of DEPLOY_OPERATIONS) {
  new gcp.serviceaccount.IAMMember(`platform-deploy-${operation}`, {
    serviceAccountId: platformServiceAccount.name,
    role: 'roles/iam.workloadIdentityUser',
    member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/${deploySubject(PLATFORM_PROJECT, PLATFORM_STACK, operation)}`,
  });
}
