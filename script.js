const n8nUrl = "https://abdullah750.app.n8n.cloud/webhook-test/b473b25f-10e3-4168-bbfe-ae314d5e274c";

async function updateDashboard() {
    try {
        const response = await fetch(n8nUrl);
        const data = await response.json();
        
        // لو البيانات جاية في قائمة (Array) بناخد أول عنصر
        const stats = Array.isArray(data) ? data[0] : data;

        // 1. تحديث تاريخ التوليد
        document.getElementById('generated-at').innerText = stats.generatedAt;

        // 2. مثال: عرض بيانات Marita (تأكد إن الـ IDs موجودة في الـ HTML بتاعك)
        if (stats.summary && stats.summary.Marita) {
            const marita = stats.summary.Marita;
            // لو عندك مكان لعرض المكالمات مثلاً:
            // document.getElementById('marita-calls').innerText = marita.calls;
            console.log("Marita Data:", marita);
        }

        // 3. عرض الـ AI Insights (لو موجودة في الـ JavaScript اللي قبلها)
        // document.getElementById('ai-insights').innerText = stats.ai_summary;

    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

updateDashboard();
