import { notFound } from "next/navigation";
import { VaultClient } from "./VaultClient";

export const dynamic = "force-dynamic";

export default async function VaultPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <VaultClient vaultId={id} />;
}
