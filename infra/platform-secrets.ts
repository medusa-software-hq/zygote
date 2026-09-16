import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { bootstrapProject, bootstrapServices } from './bootstrap-project.ts';
import { platformSecretsServiceAccount } from './platform-identity.ts';

/**
 * The credentials the platform stack cannot mint for itself.
 *
 * Kept in Secret Manager rather than as ciphertext in the stack's own environment. What a
 * credential is worth does not change with where it is kept — whoever may open that environment
 * can still have these — but here the value is versioned, every read of it is logged, and who may
 * read it is an IAM decision that can be made without touching Pulumi.
 *
 * Only the containers are declared here, never a version. The value goes in by hand, so no
 * credential passes through this program, its state, or a plan somebody reads:
 *
 *   gcloud secrets versions add <name> --project=<bootstrap project> --data-file=<file>
 *
 * An empty container is not an error here. It becomes one where something opens it — which is
 * why the values go in before the platform environment is pointed at them.
 */

const dependsOn = { dependsOn: bootstrapServices };

/**
 * A credential the platform stack is handed, and the one account that may read it.
 *
 * Granted per secret rather than on the project. A project-wide grant would also cover whatever
 * is put here next, and a grant that widens itself as things are added is not one anybody
 * reviewed.
 */
const platformSecret = (name: string): gcp.secretmanager.Secret => {
  const secret = new gcp.secretmanager.Secret(
    name,
    {
      project: bootstrapProject.projectId,
      secretId: name,

      // Google keeps it wherever it likes. Nothing about these is regional, and naming regions
      // would be a list to keep in step with nothing.
      replication: { auto: {} },
    },
    dependsOn,
  );

  new gcp.secretmanager.SecretIamMember(name, {
    project: bootstrapProject.projectId,
    secretId: secret.secretId,
    role: 'roles/secretmanager.secretAccessor',
    member: pulumi.interpolate`serviceAccount:${platformSecretsServiceAccount.email}`,
  });

  return secret;
};

/**
 * Everything the platform stack is given.
 *
 * The key is what the stack's environment calls it; the name is what it is called in Secret
 * Manager, which is what the command above takes. Each is a credential a third party will not
 * federate — anything obtainable by OIDC, or mintable by a stack, does not belong here.
 */
export const platformSecrets = {
  /** The private key of the GitHub App this organization's repositories are configured by. */
  githubAppPrivateKey: platformSecret('github-app-private-key'),

  /** The token the platform stack creates Workers, tokens and Access applications with. */
  cloudflareApiToken: platformSecret('cloudflare-api-token'),

  /** The secret of the OAuth client Access signs people in to Google Workspace through. */
  accessIdentityProviderClientSecret: platformSecret('access-identity-provider-client-secret'),

  /** The personal key the platform stack creates Neon projects and their own keys with. */
  neonApiKey: platformSecret('neon-api-key'),
};
