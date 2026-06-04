import packageJson from "../../package.json";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const CONTACT_URL = "highemerly.net/contact.html";

export const USER_AGENT = APP_URL
  ? `SHAMEZO/${packageJson.version} (+${APP_URL}) (+${CONTACT_URL})`
  : `SHAMEZO/${packageJson.version} (+${CONTACT_URL})`;
