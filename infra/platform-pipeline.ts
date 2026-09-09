import * as pulumi from '@pulumi/pulumi';
import * as service from '@pulumi/pulumiservice';
import { bootstrapProject } from './bootstrap-project.ts';
import { platformServiceAccount, pool, poolProvider } from './platform-identity.ts';

/**
 * How the platform stack runs.
 *
 * Held here for the same reason its identity is: the layer above decides what a stack
 * may do and how it gets to do it. It also keeps this out of a web console, where it
 * would be state nobody can review.
 *
 * Because this stack creates the pool, the provider and the account, the environment
 * below is composed from those outputs rather than transcribed — there is no second
 * copy of an identifier to drift.
 */

const config = new pulumi.Config();
const pulumiOrganization = config.require('pulumiOrganization');

const PLATFORM_REPOSITORY = 'medusa-software-hq/platform';
const PLATFORM_PROJECT = 'medusa-platform';
const PLATFORM_STACK = 'main';

const ESC_PROJECT = 'platform';
const ESC_ENVIRONMENT = 'gcp';

/**
 * Mints a short-lived GCP credential by OIDC. Referenced by the platform stack, so a
 * local `up` and a deployment authenticate the same way and neither holds a key.
 */
export const platformEnvironment = new service.Environment(
  'platform-gcp',
  {
    organization: pulumiOrganization,
    project: ESC_PROJECT,
    name: ESC_ENVIRONMENT,
    yaml: pulumi
      .all([
        bootstrapProject.number,
        pool.workloadIdentityPoolId,
        poolProvider.workloadIdentityPoolProviderId,
        platformServiceAccount.email,
      ])
      .apply(
        ([projectNumber, workloadPoolId, providerId, serviceAccount]) =>
          new pulumi.asset.StringAsset(`values:
  gcp:
    login:
      fn::open::gcp-login:
        project: ${projectNumber}
        oidc:
          workloadPoolId: ${workloadPoolId}
          providerId: ${providerId}
          serviceAccount: ${serviceAccount}
  pulumiConfig:
    gcp:accessToken: \${gcp.login.accessToken}
  environmentVariables:
    GOOGLE_OAUTH_ACCESS_TOKEN: \${gcp.login.accessToken}
`),
      ),
  },
  { import: `${pulumiOrganization}/${ESC_PROJECT}/${ESC_ENVIRONMENT}` },
);

/** Pull requests are previewed; merges to the default branch are applied. */
export const platformDeploymentSettings = new service.DeploymentSettings(
  'platform',
  {
    organization: pulumiOrganization,
    project: PLATFORM_PROJECT,
    stack: PLATFORM_STACK,

    // Deprecated in favour of `vcs`, which this provider version accepts without
    // error and then does not apply — the integration is dropped and only a bare git
    // source remains. Verified by reading the settings back afterwards.
    // eslint-disable-next-line typescript/no-deprecated
    github: {
      repository: PLATFORM_REPOSITORY,
      deployCommits: true,
      previewPullRequests: true,
    },

    // No `repoUrl` here: the service rejects one alongside the GitHub integration,
    // and supplying it instead of `github` silently downgrades this to a plain git
    // source — previews and deploy-on-merge quietly stop.
    sourceContext: {
      git: {
        branch: 'refs/heads/main',
        repoDir: 'infra',
      },
    },
  },
  { import: `${pulumiOrganization}/${PLATFORM_PROJECT}/${PLATFORM_STACK}` },
);
