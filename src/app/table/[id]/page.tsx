import type { Metadata } from "next";
import { LiveTablePage } from "@/components/table/live-table-page";

export const metadata: Metadata = { title: "Table" };

export default async function TablePage({ params }: PageProps<"/table/[id]">) {
  const { id } = await params;
  return <LiveTablePage id={id} />;
}
