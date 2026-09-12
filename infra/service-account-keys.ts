import * as gcp from '@pulumi/gcp';
import { platformFolder } from './platform-delegation.ts';

/**
 * Service account keys, permitted beneath the delegated folder and made to expire.
 *
 * The organization forbids them by default, and is right to. A key is a credential
 * that leaves Google: it can be copied, it appears in no session, and it goes on
 * working until somebody remembers to delete it. Every identity inside this tree has
 * a better option — a service agent that Google hands out and rotates, or federation
 * from a pipeline that proves what it is each time it runs.
 *
 * An app's edge has neither. A Cloudflare Worker has no metadata server and no
 * identity Workload Identity Federation will accept, so an app whose Worker must call
 * its own private Cloud Run service cannot hold anything but a key. The alternative is
 * to let the service answer to everyone, which trades a credential that expires for an
 * API with no door on it — and needs Domain Restricted Sharing relaxed to arrange,
 * which is a wider hole than this one.
 *
 * The relaxation and its bound are therefore one change, and belong together. Keys may
 * be created; they stop working after a week. An app that fails to rotate one breaks
 * loudly on a schedule, which is the opposite of what unbounded keys do.
 *
 * Set on the folder rather than per project, unlike the app this pattern came from: org
 * policy cannot sit in the tree it constrains, so the layer that knows which projects
 * exist is not the layer allowed to write this. Granting that layer `policyAdmin` on
 * the folder would also let it lift the service envelope, which is the one thing the
 * envelope exists to prevent. So the permission is blanket for everything beneath the
 * folder, and the expiry is what keeps it small.
 */

/**
 * How long a key lasts. A week: long enough that a day's rotation may miss six times,
 * short enough that a leaked key is a problem with an end date.
 */
const KEY_LIFETIME = '168h';

/**
 * Keys may be created here.
 *
 * The organization enforces this constraint; `FALSE` on the folder lifts it for this
 * subtree and nowhere else.
 */
export const keysPermitted = new gcp.orgpolicy.Policy('permit-service-account-keys', {
  name: platformFolder.name.apply(
    (folder) => `${folder}/policies/iam.disableServiceAccountKeyCreation`,
  ),
  parent: platformFolder.name,
  spec: {
    rules: [{ enforce: 'FALSE' }],
  },
});

/**
 * And they die on their own.
 *
 * A single allowed value, which is what makes this a bound rather than a choice: a key
 * created beneath this folder gets that lifetime whether or not whoever created it
 * asked for one.
 */
export const keyLifetime = new gcp.orgpolicy.Policy('bound-service-account-key-lifetime', {
  name: platformFolder.name.apply(
    (folder) => `${folder}/policies/iam.serviceAccountKeyExpiryHours`,
  ),
  parent: platformFolder.name,
  spec: {
    rules: [{ values: { allowedValues: [KEY_LIFETIME] } }],
  },
});
