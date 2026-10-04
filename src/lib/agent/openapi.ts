import { CHAIN_BACKED } from "./mode";
import { demoOpenapiDocument } from "./openapi-demo";
import { chainOpenapiDocument } from "./openapi-chain";

/**
 * The OpenAPI 3.1 document served at /api/v1/openapi.json. It describes what the API
 * actually returns in this deployment: the chain-backed shapes when
 * NEXT_PUBLIC_DEMO_MODE=false, the simulated ones otherwise.
 */
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string; [k: string]: unknown };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
  [k: string]: unknown;
}

export { chainOpenapiDocument, demoOpenapiDocument };

export const openapiDocument: OpenApiDocument = CHAIN_BACKED ? chainOpenapiDocument : (demoOpenapiDocument as unknown as OpenApiDocument);
