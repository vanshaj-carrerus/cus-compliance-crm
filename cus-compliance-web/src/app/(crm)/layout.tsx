import { CrmLayoutClient } from "@/components/crm/CrmLayoutClient";

export default function CrmGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CrmLayoutClient>{children}</CrmLayoutClient>;
}
