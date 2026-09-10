import * as pulumi from '@pulumi/pulumi';

/**
 * Where the platform stack lives in Pulumi Cloud, and the environment it draws
 * credentials from. Named here because both the identity and the pipeline need them,
 * and the identity must not depend on the pipeline.
 */

const config = new pulumi.Config();

/** Pulumi Cloud organization, which is also the audience it issues tokens for. */
export const pulumiOrganization = config.require('pulumiOrganization');

export const PLATFORM_REPOSITORY = 'medusa-software-hq/platform';
export const PLATFORM_PROJECT = 'medusa-platform';
export const PLATFORM_STACK = 'main';

export const ESC_PROJECT = 'platform';
export const ESC_ENVIRONMENT = 'main';

/**
 * The hand-managed companion to the environment above.
 *
 * Two documents rather than one because this stack replaces the whole of the other on
 * every apply: a value typed into it by hand would be overwritten silently, secret or
 * not. The split is by who writes the document, not by what is in it.
 */
export const ESC_SECRETS_ENVIRONMENT = 'main-secrets';

/**
 * The subject Pulumi Cloud puts in tokens issued for an ESC environment.
 *
 * Taken from a rejected exchange rather than from the documentation, which describes a
 * different shape. It is per-environment, which is the point: the audience is the same
 * string for every environment in the organization, so binding on that would let any
 * of them assume any account this stack creates.
 */
export const escSubject = (project: string, environment: string): string =>
  `pulumi:environments:org:${pulumiOrganization}:env:${project}/${environment}`;

/**
 * Operations a deployment of the platform stack may authenticate for.
 *
 * `destroy` is absent on purpose: GCP matches subjects exactly and allows no wildcard,
 * so an operation with no binding cannot obtain a credential at all. Removing a
 * resource from the program is an `update` and still works; discarding the whole stack
 * does not.
 *
 * `refresh` is present despite reaching for the same account, because it reads the
 * cloud and writes only Pulumi state. Without it nothing can detect drift — not a
 * scheduled check, and not a person diagnosing an incident. The reader cannot stand in:
 * refreshing needs read access inside every project this stack touches, and recovering
 * afterwards needs write regardless.
 */
export const DEPLOY_OPERATIONS = ['preview', 'update', 'refresh'] as const;

/** The subject Pulumi Cloud puts in tokens issued for a deployment, one per operation. */
export const deploySubject = (project: string, stack: string, operation: string): string =>
  `pulumi:deploy:org:${pulumiOrganization}:project:${project}:stack:${stack}:operation:${operation}:scope:write`;
