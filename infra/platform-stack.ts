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
export const ESC_ENVIRONMENT = 'gcp';

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
