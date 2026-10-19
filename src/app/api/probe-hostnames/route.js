import { NextResponse } from 'next/server';

export async function GET() {
    const JIRA_URL = process.env.JIRA_URL;
    const JIRA_TOKEN = process.env.JIRA_TOKEN;
    const headers = {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json',
    };

    // Step 1: Look for "Nome de ativo" objects
    const IQL = `objectType = "${process.env.JIRA_HOSTNAME_TYPE || 'Nome de ativo'}"`;
    const url = `${JIRA_URL}/rest/insight/1.0/iql/objects?iql=${encodeURIComponent(IQL)}&resultPerPage=3`;
    const response = await fetch(url, { headers, cache: 'no-store' });
    const data = await response.json();

    // Step 2: Get full details of first object to see all attributes
    const entries = data.objectEntries || [];
    let samples = [];

    for (const entry of entries.slice(0, 2)) {
        const detailRes = await fetch(`${JIRA_URL}/rest/insight/1.0/object/${entry.id}`, { headers });
        const detail = detailRes.ok ? await detailRes.json() : null;
        if (detail) {
            samples.push({
                id: detail.id,
                label: detail.label,
                objectKey: detail.objectKey,
                attributes: detail.attributes?.map(a => ({
                    name: a.objectTypeAttribute?.name || a.objectTypeAttributeName,
                    values: a.objectAttributeValues?.map(v => v.displayValue || v.value)
                }))
            });
        }
    }

    return NextResponse.json({ total: data.totalFilterCount, samples });
}
