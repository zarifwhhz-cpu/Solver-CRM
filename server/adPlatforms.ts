export interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdAccountInfo {
  id: string;
  name: string;
  currency: string;
  timezone?: string;
  status?: string;
  spend?: string;
}

export async function fetchFacebookCampaigns(accessToken: string, accountId: string): Promise<{ account: AdAccountInfo; campaigns: Campaign[] }> {
  const cleanId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  const acctRes = await fetch(
    `https://graph.facebook.com/v21.0/${cleanId}?fields=name,currency,timezone_name,account_status,amount_spent`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!acctRes.ok) {
    const err = await acctRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Facebook API error (${acctRes.status})`);
  }
  const acctData = await acctRes.json();

  const statusMap: Record<number, string> = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review", 9: "In Grace Period", 100: "Pending Closure", 101: "Closed" };
  const account: AdAccountInfo = {
    id: cleanId,
    name: acctData.name || cleanId,
    currency: acctData.currency || "USD",
    timezone: acctData.timezone_name,
    status: statusMap[acctData.account_status] || "Unknown",
    spend: acctData.amount_spent ? (parseFloat(acctData.amount_spent) / 100).toFixed(2) : "0",
  };

  const campaignsRes = await fetch(
    `https://graph.facebook.com/v21.0/${cleanId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,start_time,stop_time&limit=50`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!campaignsRes.ok) {
    const err = await campaignsRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Facebook Campaigns API error (${campaignsRes.status})`);
  }
  const campaignsData = await campaignsRes.json();

  const campaignIds = (campaignsData.data || []).map((c: any) => c.id);
  let insightsMap: Record<string, any> = {};

  if (campaignIds.length > 0) {
    try {
      const insightsPromises = campaignIds.map(async (cId: string) => {
        const insRes = await fetch(
          `https://graph.facebook.com/v21.0/${cId}/insights?fields=spend,impressions,clicks,ctr,cpc&date_preset=maximum`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        if (insRes.ok) {
          const insData = await insRes.json();
          if (insData.data?.[0]) insightsMap[cId] = insData.data[0];
        }
      });
      await Promise.all(insightsPromises);
    } catch (e) {
      console.error("Error fetching campaign insights:", e);
    }
  }

  const campaigns: Campaign[] = (campaignsData.data || []).map((c: any) => {
    const insights = insightsMap[c.id] || {};
    return {
      id: c.id,
      name: c.name,
      status: c.status || "UNKNOWN",
      objective: c.objective,
      dailyBudget: c.daily_budget ? (parseFloat(c.daily_budget) / 100).toFixed(2) : undefined,
      lifetimeBudget: c.lifetime_budget ? (parseFloat(c.lifetime_budget) / 100).toFixed(2) : undefined,
      spend: insights.spend,
      impressions: insights.impressions,
      clicks: insights.clicks,
      ctr: insights.ctr ? parseFloat(insights.ctr).toFixed(2) : undefined,
      cpc: insights.cpc,
      startDate: c.start_time?.split("T")[0],
      endDate: c.stop_time?.split("T")[0],
    };
  });

  return { account, campaigns };
}

export async function fetchGoogleAdsCampaigns(accessToken: string, customerId: string): Promise<{ account: AdAccountInfo; campaigns: Campaign[] }> {
  const cleanId = customerId.replace(/-/g, "");

  const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 50`;

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${cleanId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    let errorMsg = `Google Ads API error (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      errorMsg = errJson.error?.message || errJson[0]?.error?.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await res.json();
  const results = data[0]?.results || [];

  const account: AdAccountInfo = {
    id: cleanId,
    name: `Google Ads ${cleanId}`,
    currency: "USD",
    status: "Active",
  };

  const campaigns: Campaign[] = results.map((r: any) => ({
    id: r.campaign?.id || "",
    name: r.campaign?.name || "Unknown",
    status: r.campaign?.status || "UNKNOWN",
    objective: r.campaign?.advertisingChannelType,
    dailyBudget: r.campaignBudget?.amountMicros ? (parseInt(r.campaignBudget.amountMicros) / 1000000).toFixed(2) : undefined,
    spend: r.metrics?.costMicros ? (parseInt(r.metrics.costMicros) / 1000000).toFixed(2) : "0",
    impressions: r.metrics?.impressions?.toString(),
    clicks: r.metrics?.clicks?.toString(),
    ctr: r.metrics?.ctr ? (r.metrics.ctr * 100).toFixed(2) : undefined,
    cpc: r.metrics?.averageCpc ? (parseInt(r.metrics.averageCpc) / 1000000).toFixed(2) : undefined,
  }));

  return { account, campaigns };
}

export async function fetchTikTokCampaigns(accessToken: string, advertiserId: string): Promise<{ account: AdAccountInfo; campaigns: Campaign[] }> {
  const acctRes = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${advertiserId}"]`,
    {
      headers: { "Access-Token": accessToken },
    }
  );

  let accountName = `TikTok ${advertiserId}`;
  let accountCurrency = "USD";
  let accountStatus = "Active";

  if (acctRes.ok) {
    const acctData = await acctRes.json();
    if (acctData.data?.list?.[0]) {
      const info = acctData.data.list[0];
      accountName = info.name || accountName;
      accountCurrency = info.currency || accountCurrency;
      const statusMap: Record<string, string> = { STATUS_ENABLE: "Active", STATUS_DISABLE: "Disabled", STATUS_PENDING_CONFIRM: "Pending", STATUS_PENDING_VERIFIED: "Pending Verification", STATUS_CONFIRM_FAIL: "Rejected" };
      accountStatus = statusMap[info.status] || info.status || "Unknown";
    }
  }

  const account: AdAccountInfo = {
    id: advertiserId,
    name: accountName,
    currency: accountCurrency,
    status: accountStatus,
  };

  const campaignsRes = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&page_size=50&fields=["campaign_id","campaign_name","operation_status","objective_type","budget","budget_mode"]`,
    {
      headers: { "Access-Token": accessToken },
    }
  );

  if (!campaignsRes.ok) {
    const errText = await campaignsRes.text();
    throw new Error(`TikTok API error (${campaignsRes.status}): ${errText}`);
  }

  const campaignsData = await campaignsRes.json();
  if (campaignsData.code !== 0) {
    throw new Error(campaignsData.message || "TikTok API returned an error");
  }

  const campaignList = campaignsData.data?.list || [];

  let metricsMap: Record<string, any> = {};
  if (campaignList.length > 0) {
    try {
      const cIds = campaignList.map((c: any) => c.campaign_id);
      const reportRes = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`,
        {
          method: "POST",
          headers: {
            "Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            advertiser_id: advertiserId,
            report_type: "BASIC",
            dimensions: ["campaign_id"],
            data_level: "AUCTION_CAMPAIGN",
            metrics: ["spend", "impressions", "clicks", "ctr", "cpc"],
            filters: [{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify(cIds) }],
            service_type: "AUCTION",
            lifetime: true,
          }),
        }
      );
      if (reportRes.ok) {
        const reportData = await reportRes.json();
        for (const row of reportData.data?.list || []) {
          metricsMap[row.dimensions?.campaign_id] = row.metrics;
        }
      }
    } catch (e) {
      console.error("Error fetching TikTok metrics:", e);
    }
  }

  const campaigns: Campaign[] = campaignList.map((c: any) => {
    const metrics = metricsMap[c.campaign_id] || {};
    return {
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.operation_status || "UNKNOWN",
      objective: c.objective_type,
      dailyBudget: c.budget_mode === "BUDGET_MODE_DAY" ? c.budget?.toString() : undefined,
      lifetimeBudget: c.budget_mode === "BUDGET_MODE_TOTAL" ? c.budget?.toString() : undefined,
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
    };
  });

  return { account, campaigns };
}

export async function discoverFacebookAdAccounts(accessToken: string): Promise<AdAccountInfo[]> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,currency,timezone_name,account_status,amount_spent&limit=100`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Facebook API error (${res.status}). Check your access token.`);
  }
  const data = await res.json();
  const statusMap: Record<number, string> = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review", 9: "In Grace Period", 100: "Pending Closure", 101: "Closed" };
  return (data.data || []).map((a: any) => ({
    id: a.id,
    name: a.name || a.id,
    currency: a.currency || "USD",
    timezone: a.timezone_name,
    status: statusMap[a.account_status] || "Unknown",
    spend: a.amount_spent ? (parseFloat(a.amount_spent) / 100).toFixed(2) : "0",
  }));
}

export async function discoverTikTokAdvertisers(accessToken: string): Promise<AdAccountInfo[]> {
  const res = await fetch(
    `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=0&secret=`,
    { headers: { "Access-Token": accessToken } }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TikTok API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(data.message || "TikTok API returned an error");
  }
  return (data.data?.list || []).map((a: any) => ({
    id: String(a.advertiser_id),
    name: a.advertiser_name || String(a.advertiser_id),
    currency: "USD",
    status: "Active",
  }));
}

export async function fetchCampaigns(platform: string, accessToken: string, accountId: string) {
  switch (platform) {
    case "facebook":
      return fetchFacebookCampaigns(accessToken, accountId);
    case "google":
      return fetchGoogleAdsCampaigns(accessToken, accountId);
    case "tiktok":
      return fetchTikTokCampaigns(accessToken, accountId);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
