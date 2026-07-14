import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const db = await getAdapter();
    
    // Query successful requests joined with usage history using date prefix (up to seconds)
    const query = `
      SELECT 
        rd.id, 
        rd.timestamp, 
        rd.provider, 
        rd.model, 
        rd.data,
        uh.cost,
        uh.promptTokens,
        uh.completionTokens
      FROM requestDetails rd
      LEFT JOIN usageHistory uh ON 
        SUBSTR(rd.timestamp, 1, 19) = SUBSTR(uh.timestamp, 1, 19)
        AND rd.provider = uh.provider 
        AND rd.model = uh.model
      WHERE rd.status = 'success'
      ORDER BY rd.timestamp DESC
      LIMIT 2000
    `;
    
    const rows = db.all(query);
    
    let summary = {
      totalRequests: 0,
      totalActualTokens: 0,
      totalSavedTokens: 0,
      totalActualPromptTokens: 0,
      totalSavedPromptTokens: 0,
      totalActualCompletionTokens: 0,
      totalSavedCompletionTokens: 0,
      totalActualCost: 0,
      totalSavedCost: 0
    };
    
    let distribution = {
      rtk: { count: 0, savedTokens: 0, bytesBefore: 0, bytesAfter: 0 },
      headroom: { count: 0, savedTokens: 0, bytesBefore: 0, bytesAfter: 0, phantomCount: 0 },
      caveman: { count: 0, savedTokens: 0 },
      ponytail: { count: 0, savedTokens: 0 }
    };
    
    const dailyMap = {};
    const modelMap = {};
    const recentLogs = [];
    
    for (const row of rows) {
      let data = {};
      try {
        data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      } catch (e) {
        continue;
      }
      
      const timestamp = row.timestamp || data.timestamp;
      if (!timestamp) continue;
      
      const dateKey = timestamp.split("T")[0]; // YYYY-MM-DD
      const model = row.model || data.model || "unknown";
      const provider = row.provider || data.provider || "unknown";
      
      // Actual tokens
      const promptTokens = data.tokens?.prompt_tokens || row.promptTokens || 0;
      const completionTokens = data.tokens?.completion_tokens || row.completionTokens || 0;
      const actualCost = row.cost || 0;
      
      // Latency
      const latency = data.latency?.total || 0;
      
      // 1. Detect Prompt Optimization (RTK vs Headroom) and Completion Optimization (Caveman vs Ponytail)
      let promptTokensSaved = 0;
      let promptMode = null; // "rtk" or "headroom"
      let origSize = 0;
      let compSize = 0;
      
      let cavemanSaved = 0;
      let ponytailSaved = 0;
      let isCaveman = false;
      let isPonytail = false;

      const opts = data.optimizations || {};
      const hasOptimizationsMeta = data.optimizations !== undefined;

      if (hasOptimizationsMeta) {
        promptTokensSaved = opts.promptSaved || 0;
        if (opts.rtk) {
          promptMode = "rtk";
        } else if (opts.headroom) {
          promptMode = "headroom";
        }
        isCaveman = !!opts.caveman;
        isPonytail = !!opts.ponytail;
      } else {
        const req = data.request;
        const provReq = data.providerRequest;
        
        if (req && provReq) {
          origSize = req._originalSize || JSON.stringify(req).length;
          compSize = provReq._originalSize || JSON.stringify(provReq).length;
          
          if (origSize && compSize && compSize < origSize && promptTokens > 0) {
            const diff = origSize - compSize;
            if (diff > 50) { // significant character difference
              const origTokens = Math.round(promptTokens * (origSize / compSize));
              promptTokensSaved = Math.max(0, origTokens - promptTokens);
              
              if (promptTokensSaved > 0) {
                // Check if tool outputs were present
                let hasTool = false;
                if (req.messages && Array.isArray(req.messages)) {
                  hasTool = req.messages.some(m => {
                    if (!m) return false;
                    if (m.role === "tool" || m.type === "function_call_output") return true;
                    if (Array.isArray(m.content)) {
                      return m.content.some(c => c && c.type === "tool_result");
                    }
                    return false;
                  });
                }
                
                if (hasTool) {
                  promptMode = "rtk";
                } else {
                  promptMode = "headroom";
                }
              }
            }
          }
        }

        // Check system prompts
        let systemPrompt = "";
        if (req && Array.isArray(req.messages)) {
          const sys = req.messages.find(m => m && (m.role === "system" || m.role === "developer"));
          if (sys && typeof sys.content === "string") systemPrompt = sys.content;
        }
        let provSystemPrompt = "";
        if (provReq && Array.isArray(provReq.messages)) {
          const sys = provReq.messages.find(m => m && (m.role === "system" || m.role === "developer"));
          if (sys && typeof sys.content === "string") provSystemPrompt = sys.content;
        }
        
        const fullSystemText = (systemPrompt + "\n" + provSystemPrompt).toLowerCase();
        if (fullSystemText.includes("terse caveman")) {
          isCaveman = true;
        }
        if (fullSystemText.includes("lazy senior dev")) {
          isPonytail = true;
        }
      }
      
      if (completionTokens > 0) {
        if (isCaveman && isPonytail) {
          // Both active
          const origOut = Math.round(completionTokens / 0.2625);
          const totalSaved = origOut - completionTokens;
          cavemanSaved = Math.round(totalSaved * 0.6);
          ponytailSaved = Math.round(totalSaved * 0.4);
        } else if (isCaveman) {
          const origOut = Math.round(completionTokens / 0.35);
          cavemanSaved = Math.max(0, origOut - completionTokens);
        } else if (isPonytail) {
          const origOut = Math.round(completionTokens / 0.75);
          ponytailSaved = Math.max(0, origOut - completionTokens);
        }
      }
      
      const completionTokensSaved = cavemanSaved + ponytailSaved;
      const totalSavedTokens = promptTokensSaved + completionTokensSaved;
      const totalActualTokens = promptTokens + completionTokens;
      
      // 3. Cost Saved
      let costSaved = 0;
      if (actualCost > 0 && totalActualTokens > 0) {
        costSaved = actualCost * (totalSavedTokens / totalActualTokens);
      }
      
      // Skip records with 0 actual and 0 saved tokens
      if (totalActualTokens === 0 && totalSavedTokens === 0) continue;
      
      // Aggregations
      summary.totalRequests++;
      summary.totalActualTokens += totalActualTokens;
      summary.totalSavedTokens += totalSavedTokens;
      summary.totalActualPromptTokens += promptTokens;
      summary.totalSavedPromptTokens += promptTokensSaved;
      summary.totalActualCompletionTokens += completionTokens;
      summary.totalSavedCompletionTokens += completionTokensSaved;
      summary.totalActualCost += actualCost;
      summary.totalSavedCost += costSaved;
      
      // Distribution & Mode Flags
      const activeModes = [];
      const hasRtk = hasOptimizationsMeta ? !!opts.rtk : (promptMode === "rtk");
      const hasHeadroom = hasOptimizationsMeta ? !!opts.headroom : (promptMode === "headroom");

      if (hasRtk) {
        distribution.rtk.count++;
        distribution.rtk.savedTokens += hasHeadroom ? Math.round(promptTokensSaved / 2) : promptTokensSaved;
        distribution.rtk.bytesBefore += origSize;
        distribution.rtk.bytesAfter += compSize;
        activeModes.push("RTK");
      }
      if (hasHeadroom) {
        distribution.headroom.count++;
        distribution.headroom.savedTokens += hasRtk ? Math.round(promptTokensSaved / 2) : promptTokensSaved;
        distribution.headroom.bytesBefore += origSize;
        distribution.headroom.bytesAfter += compSize;
        // Detect phantom saving: size shrank by less than 5%
        if (compSize >= origSize * 0.95) {
          distribution.headroom.phantomCount++;
        }
        activeModes.push("Headroom");
      }
      if (isCaveman) {
        distribution.caveman.count++;
        distribution.caveman.savedTokens += cavemanSaved;
        activeModes.push("Caveman");
      }
      if (isPonytail) {
        distribution.ponytail.count++;
        distribution.ponytail.savedTokens += ponytailSaved;
        activeModes.push("Ponytail");
      }
      
      // Daily history
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, promptSaved: 0, completionSaved: 0, costSaved: 0, totalRequests: 0 };
      }
      dailyMap[dateKey].promptSaved += promptTokensSaved;
      dailyMap[dateKey].completionSaved += completionTokensSaved;
      dailyMap[dateKey].costSaved += costSaved;
      dailyMap[dateKey].totalRequests++;
      
      // Model breakdown
      const modelKey = `${provider}/${model}`;
      if (!modelMap[modelKey]) {
        modelMap[modelKey] = { model, provider, requests: 0, savedTokens: 0, savedCost: 0, actualTokens: 0, actualCost: 0 };
      }
      modelMap[modelKey].requests++;
      modelMap[modelKey].savedTokens += totalSavedTokens;
      modelMap[modelKey].savedCost += costSaved;
      modelMap[modelKey].actualTokens += totalActualTokens;
      modelMap[modelKey].actualCost += actualCost;
      
      // Recent logs (limit to 20)
      if (recentLogs.length < 20) {
        recentLogs.push({
          id: row.id,
          timestamp,
          model,
          provider,
          activeModes,
          promptTokens,
          promptTokensSaved,
          completionTokens,
          completionTokensSaved,
          cost: actualCost,
          costSaved,
          latency
        });
      }
    }
    
    // Sort and format daily history
    const dailyHistory = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => {
        const parts = d.date.split("-");
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const label = `${monthNames[parseInt(parts[1]) - 1]} ${parts[2]}`;
        return {
          ...d,
          label
        };
      });
      
    const modelBreakdown = Object.values(modelMap)
      .sort((a, b) => b.savedTokens - a.savedTokens);
      
    return NextResponse.json({
      summary,
      distribution,
      dailyHistory,
      modelBreakdown,
      recentLogs
    });
    
  } catch (error) {
    console.error("[API] Token Saver Stats Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Token Saver statistics" },
      { status: 500 }
    );
  }
}
