import * as pulumi from '@pulumi/pulumi';
import * as service from '@pulumi/pulumiservice';
import { bootstrapProject } from './bootstrap-project.ts';
import {
  platformProvisionerServiceAccount,
  platformReaderServiceAccount,
  platformSecretsReaderServiceAccount,
  pool,
  poolProvider,
} from './platform-identity.ts';
import { platformSecrets } from './platform-secrets.ts';
import {
  ESC_ENVIRONMENT,
  ESC_PROJECT,
  ESC_READER_ENVIRONMENT,
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
 * Everything the platform stack is configured with.
 *
 * Its credentials are read out of Secret Manager as this is opened, rather than kept here as
 * ciphertext. The value is then versioned and audited where it lives, rotating one is a
 * `gcloud` command that touches nothing in Pulumi, and who may have it is an IAM decision.
 *
 * The login exists to be handed to the secrets provider, and to nothing else. It is deliberately
 * not mapped into `environmentVariables` or `pulumiConfig`, and must not be: a GCP credential
 * that reaches the stack is explicit provider configuration, which beats the credentials a
 * deployment mints for itself — so mapping it would quietly demote every deployment to the
 * account that may only read secrets. That is the same trap `platform/reader` exists to avoid,
 * arrived at from the other direction.
 */
export const platformEnvironment = new service.Environment(
  'platform-gcp',
  {
    organization: pulumiOrganization,
    project: ESC_PROJECT,
    name: ESC_ENVIRONMENT,
    yaml: pulumi
      .all({
        projectNumber: bootstrapProject.number,
        workloadPoolId: pool.workloadIdentityPoolId,
        providerId: poolProvider.workloadIdentityPoolProviderId,
        serviceAccount: platformSecretsReaderServiceAccount.email,
        githubAppPrivateKey: platformSecrets.githubAppPrivateKey.secretId,
        cloudflareApiToken: platformSecrets.cloudflareApiToken.secretId,
        accessClientSecret: platformSecrets.accessIdentityProviderClientSecret.secretId,
        neonApiKey: platformSecrets.neonApiKey.secretId,
      })
      .apply(
        ({
          projectNumber,
          workloadPoolId,
          providerId,
          serviceAccount,
          githubAppPrivateKey,
          cloudflareApiToken,
          accessClientSecret,
          neonApiKey,
        }) =>
          new pulumi.asset.StringAsset(`# What the platform stack is configured with, and where its credentials come from.
#
# The login below is handed to the secrets provider and mapped nowhere. A GCP credential
# reaching the stack would be explicit provider configuration, which beats what a deployment
# mints for itself — every deployment would run as the account that may only read secrets.

values:
  gcp:
    login:
      fn::open::gcp-login:
        project: ${projectNumber}
        oidc:
          workloadPoolId: ${workloadPoolId}
          providerId: ${providerId}
          serviceAccount: ${serviceAccount}
    secrets:
      fn::open::gcp-secrets:
        login: \${gcp.login}
        access:
          githubAppPrivateKey:
            name: ${githubAppPrivateKey}
          cloudflareApiToken:
            name: ${cloudflareApiToken}
          accessIdentityProviderClientSecret:
            name: ${accessClientSecret}
          neonApiKey:
            name: ${neonApiKey}

  pulumiConfig:
    # Which GitHub App this stack acts as. Identifiers rather than credentials — the key is
    # the credential, and it is read above.
    # https://github.com/organizations/medusa-software-hq/settings/apps/medusa-platform-terraformer
    medusa-platform:githubAppId: '4874543'
    # https://github.com/organizations/medusa-software-hq/settings/installations/160089048
    medusa-platform:githubAppInstallationId: '160089048'
    medusa-platform:githubAppPrivateKey: \${gcp.secrets.githubAppPrivateKey}

    # https://dash.cloudflare.com/b703ded0019355a0913800063af2a5f5
    medusa-platform:cloudflareAccountId: 'b703ded0019355a0913800063af2a5f5'
    medusa-platform:accessIdentityProviderClientSecret: \${gcp.secrets.accessIdentityProviderClientSecret}

    cloudflare:apiToken: \${gcp.secrets.cloudflareApiToken}
    neon:apiKey: \${gcp.secrets.neonApiKey}

  environmentVariables:
    # Deployments injects a short-lived GITHUB_TOKEN because this stack has the GitHub
    # integration enabled. The GitHub provider reads that variable as a default, so the
    # token lands in provider inputs and changes on every run — a permanent phantom diff
    # on a stack whose plans are meant to be read. Blanked here because the provider
    # authenticates as the App instead; empty is treated as unset.
    GITHUB_TOKEN: ''
`),
      ),
  },
  // No `import` here: the environment this once adopted was `platform/gcp`, and it is
  // in state already. Leaving the option would point a replacement at a name that does
  // not exist yet.
);

/**
 * Read-only GCP credentials, for previewing from a workstation.
 *
 * Exposed as an environment variable and not as `pulumiConfig`, and not imported by
 * the environment above, because both of those routes would reach the stack — and
 * anything that reaches the stack overrides what a deployment mints for itself.
 *
 *   pulumi env run platform/reader -- pulumi preview
 */
export const platformReaderEnvironment = new service.Environment('platform-reader', {
  organization: pulumiOrganization,
  project: ESC_PROJECT,
  name: ESC_READER_ENVIRONMENT,
  yaml: pulumi
    .all([
      bootstrapProject.number,
      pool.workloadIdentityPoolId,
      poolProvider.workloadIdentityPoolProviderId,
      platformReaderServiceAccount.email,
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
  environmentVariables:
    GOOGLE_OAUTH_ACCESS_TOKEN: \${gcp.login.accessToken}
`),
    ),
});

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
          serviceAccount: platformProvisionerServiceAccount.email,
        },
      },
    },
  },
  { import: `${pulumiOrganization}/${PLATFORM_PROJECT}/${PLATFORM_STACK}` },
);
