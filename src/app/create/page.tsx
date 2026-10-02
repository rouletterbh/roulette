import type { Metadata } from "next";
import { CreateTableWizard } from "@/components/table/create-table-wizard";

export const metadata: Metadata = { title: "Create a table" };

export default function CreatePage() {
  return <CreateTableWizard />;
}
