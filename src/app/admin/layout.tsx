import StaffShell from "@/components/staff-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell area="admin">{children}</StaffShell>;
}
