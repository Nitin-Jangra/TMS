// Legacy login route forwarder -> /staff-login
import { redirect } from "next/navigation";

export default function LoginRedirect() {
  redirect("/staff-login");
}
