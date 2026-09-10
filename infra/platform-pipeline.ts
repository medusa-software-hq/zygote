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
  ESC_READER_ENVIRONMENT,
  ESC_SECRETS_ENVIRONMENT,
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
 * Everything the platform stack inherits that is not a credential.
 *
 * No GCP login here on purpose. A referenced environment's `gcp:accessToken` is Pulumi
 * configuration, and explicit configuration beats the credentials a deployment mints
 * for itself — so a login here would quietly override the deployment's own identity,
 * whichever account it named. The stack's credentials come from its OIDC token; a
 * workstation opens the reader environment instead.
 */
export const platformEnvironment = new service.Environment(
  'platform-gcp',
  {
    organization: pulumiOrganization,
    project: ESC_PROJECT,
    name: ESC_ENVIRONMENT,
    yaml: new pulumi.asset.StringAsset(`# Carries no credentials. Anything set here as pulumiConfig would override what a
# deployment mints for itself, so the GCP login lives in platform/reader, which the
# stack does not reference.

imports:
  # Hand-managed. Holds the credentials no stack can mint: the GitHub App key and the
  # Cloudflare token. Kept out of this definition because this one is replaced whole on
  # every apply.
  - ${ESC_PROJECT}/${ESC_SECRETS_ENVIRONMENT}

values:
  environmentVariables:
    # Deployments injects a short-lived GITHUB_TOKEN because this stack has the GitHub
    # integration enabled. The GitHub provider reads that variable as a default, so the
    # token lands in provider inputs and changes on every run — a permanent phantom diff
    # on a stack whose plans are meant to be read. Blanked here because the provider
    # authenticates as the App instead; empty is treated as unset.
    GITHUB_TOKEN: ''
`),
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
      // TEMPORARY. A refresh authenticates as something holding organization-level read
      // but no access inside the projects this stack owns, and nothing visible from
      // outside says which account that is. Remove once answered.
      preRunCommands: [
        `python3 -c "import json,os;c=json.loads(os.environ.get('GOOGLE_CREDENTIALS') or '{}');print('CRED_TYPE',c.get('type'));print('IMPERSONATES',c.get('service_account_impersonation_url'));print('AUDIENCE',c.get('audience'))"`,
        'sh -c \'for v in GOOGLE_CREDENTIALS GOOGLE_OAUTH_ACCESS_TOKEN GOOGLE_APPLICATION_CREDENTIALS; do eval "x=\\$$v"; [ -n "$x" ] && echo "ENV $v=set" || echo "ENV $v=unset"; done\'',
      ],

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
