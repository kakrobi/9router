import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";

export async function POST() {
  try {
    const settings = await getSettings();
    const username = settings.githubUsername || "kakrobi";
    const token = settings.githubToken;

    if (!token) {
      return NextResponse.json({ success: false, error: "GitHub Personal Access Token (PAT) is not configured in settings." }, { status: 400 });
    }

    console.log(`[Update] Triggering GitHub merge-upstream for ${username}/9router...`);
    const res = await fetch(`https://api.github.com/repos/${username}/9router/merge-upstream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `token ${token}`,
        "User-Agent": "9Router-App"
      },
      body: JSON.stringify({
        branch: "master"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.message || "GitHub API returned error status." }, { status: res.status });
    }

    return NextResponse.json({ success: true, message: "Upstream merge triggered successfully.", githubResponse: data });
  } catch (error) {
    console.error("[Update] Sync failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
