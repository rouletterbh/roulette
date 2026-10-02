import { openapiDocument } from "@/lib/agent/openapi";

export const dynamic = "force-static";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" };

export async function GET() {
  return new Response(JSON.stringify(openapiDocument, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300", ...CORS },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
