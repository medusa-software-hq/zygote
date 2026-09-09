import * as pulumi from '@pulumi/pulumi';
import { organization } from './organization.ts';
import { platformFolder } from './platform-delegation.ts';
import { platformServiceAccount, pool, poolProvider } from './platform-identity.ts';
import { platformDeploymentSettings, platformEnvironment } from './platform-pipeline.ts';

export const organizationId = organization.orgId;

//region Handed to the platform stack

export const platformFolderName = platformFolder.name;
export const platformServiceAccountEmail = platformServiceAccount.email;
export const workloadIdentityPoolName = pool.name;
export const workloadIdentityProviderName = poolProvider.name;

export const platformEnvironmentName = pulumi.interpolate`${platformEnvironment.project}/${platformEnvironment.name}`;
export const platformDeploymentStack = platformDeploymentSettings.stack;

//endregion
