// 1. انسخ اللينك من n8n وحطه هنا
const N8N_URL = "https://abdullah750.app.n8n.cloud/webhook-test/b473b25f-10e3-4168-bbfe-ae314d5e274c";

async function fetchHuddleData() {
    try {
        const response = await fetch(N8N_URL);
        const data = await response.json();
        
        // n8n أحياناً بيبعت البيانات في Array، فبناخد أول عنصر
        const result = Array.isArray(data) ? data[0] : data;

        // 2. تحديث الوقت (تأكد إن الـ ID في الـ HTML هو 'generated-at')
        if (result.generatedAt) {
            document.getElementById('generated-at').innerText = result.generatedAt;
        }

        // 3. تحديث البيانات (مثال لماريتة وزين)
        if (result.summary) {
            console.log("Data Received:", result.summary);
            // هنا تقدر تضيف الكود اللي بيعرض الأرقام في المربعات الخاصة بيها
        }

    } catch (error) {
        console.error("فشل في جلب البيانات:", error);
        document.getElementById('generated-at').innerText = "Error loading data";
    }
}

// تشغيل الدالة فور تحميل الصفحة
window.onload = fetchHuddleData;
