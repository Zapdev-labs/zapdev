const BACKEND_INTENT =
  /\b(convex|database|db\b|backend|persistent|persist(ed|ence)?|real[\s-]?time|authentication|authorize|login|signup|sign[\s-]?up|user\s+(accounts?|profiles?)|crud|rest\s+api|graphql|mutations?|queries?|schema\b|postgres|sqlite|mongodb|supabase|prisma|drizzle|kv\s+store|sessions?)\b/i;

export function wantsConvexBackend(prompt: string): boolean {
  return BACKEND_INTENT.test(prompt);
}
