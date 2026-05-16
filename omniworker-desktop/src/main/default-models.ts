/**
 * OmniWorker B2B — Fixed models.
 *
 * Only two modes are exposed to B2B users:
 *   1. OmniWorker Normal  — general-purpose assistant
 *   2. OmniWorker Code    — code-optimized assistant
 *
 * The actual LLM routing happens on the SaaS backend.
 */

export interface DefaultModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
}

const DEFAULT_MODELS: DefaultModel[] = [
  {
    name: "OmniWorker Normal",
    provider: "omniworker",
    model: "omniworker",
    baseUrl: "",
  },
  {
    name: "OmniWorker Code",
    provider: "omniworker",
    model: "omniworker-code",
    baseUrl: "",
  },
];

export default DEFAULT_MODELS;
