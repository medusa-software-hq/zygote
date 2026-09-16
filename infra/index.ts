import * as pulumi from '@pulumi/pulumi';
// Imported for its resources alone: the credentials the platform stack is given exist
// whether or not anything here names them. Its environment starts reading them in a later
// change, once the values are in.
import './platform-secrets.ts';
import { platformBudget } from './budget.ts';
import { organization } from './organization.ts';
import { platformFolder } from './platform-delegation.ts';
import { platformProvisionerServiceAccount, pool, poolProvider } from './platform-identity.ts';
import { platformDeploymentSettings, platformEnvironment } from './platform-pipeline.ts';
import { keyLifetime, keysPermitted } from './service-account-keys.ts';
import { serviceEnvelope } from './service-envelope.ts';

export const organizationId = organization.orgId;

export const serviceEnvelopeName = serviceEnvelope.name;

export const platformBudgetName = platformBudget.name;

export const serviceAccountKeyPolicyNames = [keysPermitted.name, keyLifetime.name];

//region Handed to the platform stack

export const platformFolderName = platformFolder.name;
export const platformProvisionerServiceAccountEmail = platformProvisionerServiceAccount.email;
export const workloadIdentityPoolName = pool.name;
export const workloadIdentityProviderName = poolProvider.name;

export const platformEnvironmentName = pulumi.interpolate`${platformEnvironment.project}/${platformEnvironment.name}`;
export const platformDeploymentStack = platformDeploymentSettings.stack;

//endregion
