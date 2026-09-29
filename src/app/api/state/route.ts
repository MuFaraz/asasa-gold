import { handle } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { loadAppState } from "@/lib/state";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => loadAppState(getDb()));
