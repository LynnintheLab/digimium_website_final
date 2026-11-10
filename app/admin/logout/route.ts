import { endSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => endSession(request);
