import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/database/db";
import { audiobooks as audiobooksTable } from "@/database/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  // Ensure page is at least 1 to prevent negative offset
  let page = parseInt(searchParams.get("page") || "1", 10);
  if (page < 1) page = 1;
  
  const limit = parseInt(searchParams.get("limit") || "9", 9);
  const offset = (page - 1) * limit;
  
  try {
    // Get paginated audiobooks
    const audiobooks = await db.query.audiobooks.findMany({
      where: eq(audiobooksTable.userId, session.user.id),
      orderBy: [desc(audiobooksTable.createdAt)],
      with: {
        pdf: true
      },
      limit,
      offset
    });
    
    // Get total count for pagination
    const result = await db.query.audiobooks.findMany({
      where: eq(audiobooksTable.userId, session.user.id)
    });
    
    const totalCount = result.length;
    const totalPages = Math.ceil(totalCount / limit);
    
    return NextResponse.json({
      audiobooks,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error("API: Error fetching audiobooks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}