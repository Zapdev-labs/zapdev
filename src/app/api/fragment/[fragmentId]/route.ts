import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getUser } from "@/lib/auth-server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fragmentId: string }> }
) {
  try {
    const user = await getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fragmentId } = await params;

    // Use the authenticated version that checks project ownership
    const result = await fetchQuery(api.messages.getFragmentByIdAuth, {
      fragmentId: fragmentId as Id<"fragments">
    });

    if (!result || !result.fragment) {
      return NextResponse.json(
        { error: "Fragment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.fragment);
  } catch (error) {
    console.error("[ERROR] Failed to fetch fragment:", error);

    // Check if error is due to unauthorized access
    if (error instanceof Error && error.message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized to access this fragment" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch fragment" },
      { status: 500 }
    );
  }
}
