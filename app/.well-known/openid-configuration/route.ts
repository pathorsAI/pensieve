import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// Same reason as the authorization-server document: the basePath keeps the
// plugin's own route off the site root, so re-export it here.
export const GET = oauthProviderOpenIdConfigMetadata(auth);
