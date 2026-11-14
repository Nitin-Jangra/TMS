// Portal forwarder -> /staff-login
import { redirect } from "next/navigation";

export default function PortalRedirect() {
  redirect("/staff-login");
}
