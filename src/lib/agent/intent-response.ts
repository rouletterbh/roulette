import { DEMO, err, ok } from "./envelope";
import type { TxIntent } from "./intents";

/**
 * Wraps an intent payload in the API envelope. When the target contract is not
 * deployed (no NEXT_PUBLIC_*_ADDRESS), the call fails with CONTRACTS_NOT_DEPLOYED
 * and the fully-encoded intent is attached as `preview` with `to: null`.
 */
export function intentResponse<T extends { intent: TxIntent }>(data: T) {
  if (!data.intent.to) {
    return err("CONTRACTS_NOT_DEPLOYED", `${data.intent.contract} is not deployed in this environment. The preview shows the exact calldata that will be returned once it is.`, {
      preview: data,
      demo: true,
    });
  }
  return ok(data, { demo: DEMO });
}
