import { redirect } from "next/navigation";

/**
 * Invite-token URLs are not part of the authentication design.
 * Access is granted via Google OAuth (approval flow or pre-add flow).
 * Any invite link redirects to the standard sign-in page.
 */
export default function InvitePage() {
  redirect("/login");
}
