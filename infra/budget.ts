import * as gcp from '@pulumi/gcp';
import { bootstrapProject, bootstrapServices } from './bootstrap-project.ts';
import { billingAccount } from './organization.ts';
import { platformFolder } from './platform-delegation.ts';

/**
 * What everything beneath the delegated folder is expected to cost, and who hears when it
 * costs more.
 *
 * One budget for the whole platform rather than one per app. It is filtered by the folder,
 * not by projects, so a project the platform stack creates next month is inside it without
 * this stack ever hearing of that project — the same reason the service envelope is a folder
 * policy.
 *
 * It alerts, and does nothing else. A budget never stops spending; what bounds spending is
 * elsewhere — the services apps are denied outright, and each app's own limits, like a Cloud
 * Run service's cap on instances. This is what notices when those were not enough.
 *
 * Held here rather than in the platform stack for the reason everything here is: it is a
 * ceiling on that stack's tree, and creating one needs rights on the billing account that
 * stack deliberately does not have.
 *
 * Alerts go to the billing account's administrators and users, by role rather than by
 * address, so who hears is decided by who holds the role and not by this program.
 */

/**
 * The Budget API bills its calls to a project, and the credentials this stack is applied
 * with name none of their own.
 */
const billingProvider = new gcp.Provider('billing', {
  project: bootstrapProject.projectId,
  billingProject: bootstrapProject.projectId,
  userProjectOverride: true,
});

export const platformBudget = new gcp.billing.Budget(
  'platform',
  {
    billingAccount: billingAccount.id,
    displayName: 'platform',
    budgetFilter: {
      resourceAncestors: [platformFolder.name],
      calendarPeriod: 'MONTH',
    },

    // No currency given: a budget without one is in the billing account's own, and naming a
    // different one is refused rather than converted.
    amount: { specifiedAmount: { units: '10' } },

    /**
     * Half, most, all — of what has been spent — and all of what the month is forecast to
     * reach. The forecast is the one that arrives while there is still time to act on it.
     */
    thresholdRules: [
      { thresholdPercent: 0.5 },
      { thresholdPercent: 0.9 },
      { thresholdPercent: 1.0 },
      { thresholdPercent: 1.0, spendBasis: 'FORECASTED_SPEND' },
    ],
  },
  { provider: billingProvider, dependsOn: bootstrapServices },
);
