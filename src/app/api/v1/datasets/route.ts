import { ok, OPTIONS } from "@/lib/agent/envelope";
import { datasetCatalog } from "@/lib/agent/datasets";

export const dynamic = "force-static";
export { OPTIONS };

export async function GET() {
  return ok(
    {
      publisher: "Independent product built on Robinhood Chain. Not affiliated with or endorsed by Robinhood.",
      status: "beta",
      baseUrl: "/api/v1",
      openapi: "/api/v1/openapi.json",
      datasets: datasetCatalog,
      count: datasetCatalog.length,
    },
    { maxAge: 300 },
  );
}
