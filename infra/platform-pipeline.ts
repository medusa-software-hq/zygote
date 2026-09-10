import * as pulumi from '@pulumi/pulumi';
import * as service from '@pulumi/pulumiservice';
import { bootstrapProject } from './bootstrap-project.ts';
import {
  platformReaderServiceAccount,
  platformServiceAccount,
  pool,
  poolProvider,
} from './platform-identity.ts';
import {
  ESC_ENVIRONMENT,
  ESC_PROJECT,
  PLATFORM_PROJECT,
  PLATFORM_REPOSITORY,
  PLATFORM_STACK,
  pulumiOrganization,
} from './platform-stack.ts';

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
        platformReaderServiceAccount.email,
      ])
      .apply(
        ([projectNumber, workloadPoolId, providerId, serviceAccount]) =>
          new pulumi.asset.StringAsset(`# Read-only. This mints the reader account, not the one that can change things —
# opening an environment says nothing about which operation follows, so it grants the
# credential that is safe for all of them. Applies get theirs from the deployment's own
# OIDC token, which names the stack and the operation.

imports:
  # Hand-managed, holding the GitHub App key the platform stack manages app
  # repositories with. Kept out of this definition deliberately: this environment is
  # owned declaratively, so anything set here by hand would be overwritten silently.
  - platform/github

values:
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

    # Deployments injects a short-lived GITHUB_TOKEN because this stack has the GitHub
    # integration enabled. The GitHub provider reads that variable as a default, so the
    # token lands in provider inputs and changes on every run — a permanent phantom diff
    # on a stack whose plans are meant to be read. Blanked here because the provider
    # authenticates as the App instead; empty is treated as unset.
    GITHUB_TOKEN: ''
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

    // Where the deployment's own GCP credentials come from. Distinct from the ESC
    // environment above: this token's subject names the stack and the operation, so a
    // run outside the pipeline cannot produce it.
    operationContext: {
      oidc: {
        gcp: {
          projectId: bootstrapProject.number,
          workloadPoolId: pool.workloadIdentityPoolId,
          providerId: poolProvider.workloadIdentityPoolProviderId,
          serviceAccount: platformServiceAccount.email,
        },
      },
    },
  },
  { import: `${pulumiOrganization}/${PLATFORM_PROJECT}/${PLATFORM_STACK}` },
);
