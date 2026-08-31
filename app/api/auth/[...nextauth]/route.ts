import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import {
  createVercelAuthOptions,
  VercelAuthConfigurationError,
} from '@/server/vercel-auth';

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authHandler(request: NextRequest, context: AuthRouteContext): Promise<Response> {
  try {
    const handler = NextAuth(createVercelAuthOptions()) as (
      authRequest: NextRequest,
      authContext: AuthRouteContext,
    ) => Promise<Response>;
    return await handler(request, context);
  } catch (error) {
    if (!(error instanceof VercelAuthConfigurationError)) throw error;
    return Response.json(
      { error: { code: 'deployment_locked', message: 'Authentication is not configured.' } },
      {
        status: 503,
        headers: {
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    );
  }
}

export { authHandler as GET, authHandler as POST };
