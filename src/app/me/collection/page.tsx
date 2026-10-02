import type { Metadata } from "next";
import { CollectionView } from "@/components/collection/collection-view";

export const metadata: Metadata = { title: "Collection", robots: { index: false } };

export default function CollectionPage() {
  return <CollectionView />;
}
