import * as gcp from '@pulumi/gcp';
import { platformFolder } from './platform-delegation.ts';

/**
 * A ceiling on everything beneath the delegated folder.
 *
 * Apps hold broad rights inside their own projects — enough to create whatever they
 * need — and this is the small set they cannot reach whatever rights they accumulate.
 * Overriding it needs `orgpolicy.policyAdmin`, which nothing below this stack has.
 *
 * Deliberately a deny list. An allow list would need editing for every new product an
 * app adopts, which is the coupling this design exists to remove; a deny list changes
 * only when something newly expensive ships. It fails open, which is acceptable
 * because budgets, not this policy, are the real cost guard.
 *
 * Everything here either cannot scale to zero or bills by the hour.
 */
const DENIED_SERVICES = [
  'composer.googleapis.com',
  'compute.googleapis.com',
  'container.googleapis.com',
  'dataflow.googleapis.com',
  'dataproc.googleapis.com',
  'notebooks.googleapis.com',
  'sqladmin.googleapis.com',
];

export const serviceEnvelope = new gcp.orgpolicy.Policy(
  'restrict-service-usage',
  {
    name: platformFolder.name.apply((folder) => `${folder}/policies/gcp.restrictServiceUsage`),
    parent: platformFolder.name,
    spec: {
      rules: [{ values: { deniedValues: DENIED_SERVICES } }],
    },
  },
  { import: 'folders/523003355329/policies/gcp.restrictServiceUsage' },
);
