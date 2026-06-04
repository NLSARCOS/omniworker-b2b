/**
 * Flux Agent B2B — Fixed models.
 *
 * Only two modes are exposed to B2B users:
 *   1. Flux Agent Normal  — general-purpose assistant
 *   2. Flux Agent Code    — code-optimized assistant
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
    name: "Flux Agent Normal",
    provider: "flux-agent",
    model: "flux-agent",
    baseUrl: "",
  },
  {
    name: "Flux Agent Code",
    provider: "flux-agent",
    model: "flux-agent-code",
    baseUrl: "",
  },
];

export default DEFAULT_MODELS;
