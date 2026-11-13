import StaffShell from "@/components/staff-shell";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell area="staff">{children}</StaffShell>;
}
