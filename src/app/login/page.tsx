// Forwarder: redirects /login to the separate dedicated staff portal at /staff/login
import { redirect } from "next/navigation";

export default function LoginPageRedirect() {
  redirect("/staff/login");
}
