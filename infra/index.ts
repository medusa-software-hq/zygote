import { organization } from './organization.ts';
import { platformFolder } from './platform-delegation.ts';
import { platformServiceAccount, pool, poolProvider } from './platform-identity.ts';

export const organizationId = organization.orgId;

//region Handed to the platform stack

export const platformFolderName = platformFolder.name;
export const platformServiceAccountEmail = platformServiceAccount.email;
export const workloadIdentityPoolName = pool.name;
export const workloadIdentityProviderName = poolProvider.name;

//endregion
