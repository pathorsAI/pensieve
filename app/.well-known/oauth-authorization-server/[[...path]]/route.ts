import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// RFC 8414 puts this at the root, either bare or with the issuer path appended
// (/.well-known/oauth-authorization-server/api/auth). Serve every shape.
export const GET = oauthProviderAuthServerMetadata(auth);
