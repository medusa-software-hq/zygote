import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { bootstrapProject, bootstrapServices } from './bootstrap-project.ts';

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

const config = new pulumi.Config();

/** Pulumi Cloud organization, which is also the audience it issues tokens for. */
const pulumiOrganization = config.require('pulumiOrganization');

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

    attributeMapping: {
      'google.subject': 'assertion.sub',
      // Constant for a given Pulumi organization, which is what the binding below
      // keys on. The subject also carries the organization but its shape is Pulumi's
      // to change, so it is a poor thing to pin.
      'attribute.pulumi_audience': 'assertion.aud',
    },

    oidc: {
      issuerUri: 'https://api.pulumi.com/oidc',
      // Pulumi will not issue a token bearing another organization's audience, so
      // this is the discriminator that matters.
      allowedAudiences: [`gcp:${pulumiOrganization}`],
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
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.pulumi_audience/gcp:${pulumiOrganization}`,
});
