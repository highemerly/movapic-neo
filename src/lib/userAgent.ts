import { APP_VERSION } from "@/lib/version";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const CONTACT_URL = "highemerly.net/contact.html";

export const USER_AGENT = APP_URL
  ? `SHAMEZO/${APP_VERSION} (+${APP_URL}) (+${CONTACT_URL})`
  : `SHAMEZO/${APP_VERSION} (+${CONTACT_URL})`;
