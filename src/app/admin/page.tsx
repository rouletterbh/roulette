import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

/**
 * Operator dashboard. Deliberately unlinked from navigation and footer and
 * excluded from indexing. Access is gated client-side by a wallet allowlist
 * read from NEXT_PUBLIC_ADMIN_WALLETS (comma-separated); anyone else sees a
 * 404-style page. Real authorization lives onchain in the admin role.
 */
export const metadata: Metadata = { title: "Not found", robots: { index: false, follow: false } };

export default function AdminPage() {
  const allowlist = (process.env.NEXT_PUBLIC_ADMIN_WALLETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s));
  return <AdminDashboard allowlist={allowlist} />;
}
