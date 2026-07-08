import { NextResponse } from "next/server";
import http from "http";

function createWatchtowerContainer() {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      Image: "containrrr/watchtower",
      Cmd: ["--run-once", "--cleanup", "9router-app"],
      HostConfig: {
        Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
        AutoRemove: true
      }
    });

    const options = {
      socketPath: "/var/run/docker.sock",
      path: "/containers/create",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 201) {
          try {
            resolve(JSON.parse(data).Id);
          } catch {
            reject(new Error("Failed to parse container create response."));
          }
        } else {
          reject(new Error(`Docker API create container returned HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

function startContainer(containerId) {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: "/var/run/docker.sock",
      path: `/containers/${containerId}/start`,
      method: "POST"
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`Docker API start container returned HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

export async function POST() {
  try {
    console.log("[Update] Spawning on-demand Watchtower container to update 9router-app...");
    const containerId = await createWatchtowerContainer();
    console.log(`[Update] Watchtower container created: ${containerId}. Starting...`);
    await startContainer(containerId);
    console.log("[Update] Watchtower started successfully.");

    return NextResponse.json({ success: true, message: "Update initiated. Watchtower is pulling and restarting 9Router." });
  } catch (error) {
    console.error("[Update] Apply failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
