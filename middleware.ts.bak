import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // Skip middleware if Supabase is not configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refreshing the auth token
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Define protected routes
    const protectedRoutes = ["/dashboard", "/diary", "/settings", "/subscribe"];
    const authRoutes = ["/login", "/signup"];
    const pathname = request.nextUrl.pathname;
    
    const isProtectedRoute = protectedRoutes.some((route) =>
      pathname.startsWith(route)
    );
    const isAuthRoute = authRoutes.some((route) =>
      pathname.startsWith(route)
    );

    // Redirect unauthenticated users from protected routes
    if (isProtectedRoute && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users from auth routes to dashboard
    if (isAuthRoute && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    // If there's an error, just continue without auth check
    console.error("Middleware error:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match paths that need auth checking
     */
    "/dashboard/:path*",
    "/diary/:path*", 
    "/settings/:path*",
    "/subscribe/:path*",
    "/login",
    "/signup",
  ],
};
