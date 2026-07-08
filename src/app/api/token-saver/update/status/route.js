import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db/repos/settingsRepo.js";

export async function GET() {
  try {
    const settings = await getSettings();
    const username = settings.githubUsername || "kakrobi";
    const token = settings.githubToken;

    if (!token) {
      return NextResponse.json({ success: false, error: "GitHub Personal Access Token (PAT) is not configured in settings." }, { status: 400 });
    }

    const res = await fetch(`https://api.github.com/repos/${username}/9router/actions/runs?per_page=5`, {
      method: "GET",
      headers: {
        "Authorization": `token ${token}`,
        "User-Agent": "9Router-App"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data.message || "GitHub API returned error status." }, { status: res.status });
    }

    const runs = data.workflow_runs || [];
    const latestBuildRun = runs.find(run => run.name === "Build and Push Docker Image");

    if (!latestBuildRun) {
      return NextResponse.json({
        success: true,
        status: "idle",
        message: "No active workflow run found."
      });
    }

    return NextResponse.json({
      success: true,
      status: latestBuildRun.status, // "queued", "in_progress", "completed"
      conclusion: latestBuildRun.conclusion, // "success", "failure", "cancelled", null
      htmlUrl: latestBuildRun.html_url,
      updatedAt: latestBuildRun.updated_at
    });
  } catch (error) {
    console.error("[Update] Status check failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
