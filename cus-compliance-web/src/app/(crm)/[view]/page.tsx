import { notFound } from "next/navigation";
import type { CrmView } from "@/lib/crm/types";

const ALLOWED_VIEWS: CrmView[] = [
  "dashboard",
  "daily",
  "master",
  "compliance",
  "target",
  "incentive",
  "history",
  "reports",
  "workflows",
  "backup",
  "admin",
];

/** Validates the URL segment; UI is rendered once in the (crm) layout. */
export default async function ViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!ALLOWED_VIEWS.includes(view as CrmView)) notFound();
  return null;
}
