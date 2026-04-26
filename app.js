// -------------------- Firebase Config --------------------
const firebaseConfig = {
    apiKey: "AIzaSyDn0R9N4QW1DAWuwEkDF3LrYpT30a0vbRA",
    authDomain: "ice-factory-7a261.firebaseapp.com",
    projectId: "ice-factory-7a261",
    storageBucket: "ice-factory-7a261.firebasestorage.app",
    messagingSenderId: "816018835521",
    appId: "1:816018835521:web:68f4bcea2826fb027a5ec0"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// -------------------- متغيرات عامة --------------------
let currentUser = null;
let userRole = "guest";
let customers = [];
let customerTransactions = [];
let productions = [];
let expenses = [];
let damages = [];
let workers = [];
let cyclesLog = [];
let charts = {};

// -------------------- دوال مساعدة --------------------
function showToast(msg, isErr = false) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.background = isErr ? "#c44536" : "#1e6f5c";
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// -------------------- إحصائيات محسوبة --------------------
function getTotalProduction() {
    return productions.reduce((s, p) => s + (p.boards || 0), 0);
}

function getTotalSalesQty() {
    return customerTransactions.filter(t => t.type === "purchase").reduce((s, t) => s + (t.qty || 0), 0);
}

function getTotalDamages() {
    return damages.reduce((s, d) => s + d.qty, 0);
}

function getApproxStock() {
    return getTotalProduction() - getTotalSalesQty() - getTotalDamages();
}

function getCashTotal() {
    const cashSales = customerTransactions.filter(t => t.type === "purchase" && t.remaining === 0).reduce((s, t) => s + (t.paid || 0), 0);
    const repayments = customerTransactions.filter(t => t.type === "repayment").reduce((s, t) => s + (t.paid || 0), 0);
    return cashSales + repayments;
}

function getDebtsTotal() {
    return customers.reduce((s, c) => s + (c.totalDebt || 0), 0);
}

function getExpensesTotal() {
    return expenses.reduce((s, e) => s + (e.amount || 0), 0);
}

function getNetProfit() {
    return getCashTotal() - getExpensesTotal();
}

function updateCustomersDebt() {
    const debtMap = new Map();
    customers.forEach(c => debtMap.set(c.id, 0));
    customerTransactions.forEach(t => {
        if (t.type === "purchase") {
            debtMap.set(t.customerId, (debtMap.get(t.customerId) || 0) + (t.remaining || 0));
        } else if (t.type === "repayment") {
            debtMap.set(t.customerId, (debtMap.get(t.customerId) || 0) - (t.paid || 0));
        }
    });
    customers.forEach(c => {
        c.totalDebt = Math.max(0, debtMap.get(c.id) || 0);
    });
}

// -------------------- حفظ وتحميل Firebase --------------------
async function saveToFirestore() {
    if (!currentUser) return;
    try {
        await db.collection("factoryData").doc("main").set({
            customers,
            transactions: customerTransactions,
            productions,
            expenses,
            damages,
            workers,
            cyclesLog,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error("Save error:", e);
        showToast("⚠️ فشل الحفظ على السحابة", true);
    }
}

async function loadFromFirestore() {
    if (!currentUser) return;
    try {
        const doc = await db.collection("factoryData").doc("main").get();
        if (doc.exists) {
            const data = doc.data();
            customers = data.customers || [];
            customerTransactions = data.transactions || [];
            productions = data.productions || [];
            expenses = data.expenses || [];
            damages = data.damages || [];
            workers = data.workers || [];
            cyclesLog = data.cyclesLog || [];
        } else {
            workers = [
                { id: "w1", name: "محمد أحمد", cycles: 0, totalEarned: 0, advances: 0 },
                { id: "w2", name: "خالد علي", cycles: 0, totalEarned: 0, advances: 0 },
                { id: "w3", name: "سعيد جمال", cycles: 0, totalEarned: 0, advances: 0 },
                { id: "w4", name: "نادر سمير", cycles: 0, totalEarned: 0, advances: 0 }
            ];
        }
        updateCustomersDebt();
        updateUI();
        showToast("تم تحميل البيانات من السحابة");
    } catch (e) {
        console.error("Load error:", e);
        showToast("⚠️ خطأ في تحميل البيانات", true);
    }
}

// -------------------- بناء واجهة HTML --------------------
function buildUI() {
    document.getElementById("mainContainer").innerHTML = `
        <div id="sales" class="page active-page">
            <div class="card">
                <h3>➕ بيع الثلج</h3>
                <div class="flex-btns">
                    <button id="incQty1">+1</button>
                    <button id="incQty5">+5</button>
                    <button id="incQty10">+10</button>
                    <button id="resetQtyBtn">تصفير</button>
                </div>
                <input type="number" id="saleQty" placeholder="الكمية" value="0">
                <input type="number" id="salePrice" placeholder="السعر" value="3000" step="0.1">
                <input type="number" id="paidNow" placeholder="المدفوع الآن" value="0" step="0.1">
                <select id="customerSelect"><option value="">-- اختر عميل --</option></select>
                <button id="addCustomerBtn" class="btn-outline">➕ عميل جديد</button>
                <button id="addSaleBtn">✅ تسجيل</button>
            </div>
            <div class="card">
                <h3>📋 ملخص</h3>
                <div id="quickStats"></div>
            </div>
        </div>
        <div id="productionExp" class="page">
            <div class="card">
                <h3>🏭 الإنتاج (340 لوح)</h3>
                <input type="date" id="prodDate">
                <button id="addProductionBtn">➕ إضافة دورة</button>
                <p>📦 الإنتاج: <strong id="totalProdSpan">0</strong></p>
            </div>
            <div class="card">
                <h3>💸 المصروفات</h3>
                <input type="text" id="expDesc" placeholder="الوصف">
                <input type="number" id="expAmount" placeholder="المبلغ">
                <input type="date" id="expDate">
                <button id="addExpenseBtn">➕ إضافة</button>
            </div>
            <div class="card">
                <h3>⚠️ التالف</h3>
                <input type="number" id="damageQty" placeholder="عدد الألواح">
                <input type="date" id="damageDate">
                <button id="addDamageBtn" class="btn-warning">تسجيل</button>
            </div>
            <div class="card">
                <h3>📉 المصروفات والتالف</h3>
                <div style="overflow-x:auto;">
                    <table id="expensesTable">
                        <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th></th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div id="workers" class="page">
            <div class="card">
                <h3>👥 العمال</h3>
                <div style="overflow-x:auto;">
                    <table class="workers-table">
                        <thead><tr><th>#</th><th>الاسم</th><th>الدورات</th><th>المستحق</th><th>السلف</th><th>الصافي</th><th>إجراءات</th></tr></thead>
                        <tbody id="workersTableBody"></tbody>
                    </table>
                </div>
                <button id="addWorkerBtn" class="btn-outline">➕ عامل جديد</button>
            </div>
            <div class="card">
                <h3>🔄 دورة إنتاج</h3>
                <button id="recordCycleBtn" class="btn-warning">تسجيل دورة (حضور يدوي)</button>
            </div>
            <div class="card">
                <h3>📋 ملخص العمال</h3>
                <div id="workersSummaryTable"></div>
            </div>
        </div>
        <div id="debts" class="page">
            <div class="card">
                <h3>📋 الديون النشطة</h3>
                <div style="overflow-x:auto;">
                    <table class="debt-table">
                        <thead><tr><th>العميل</th><th>المتبقي</th><th>آخر معاملة</th><th></th></tr></thead>
                        <tbody id="activeDebtsTable"></tbody>
                    </table>
                </div>
            </div>
            <div class="card">
                <h3>💰 تسديد دين</h3>
                <select id="repayCustomerSelect"></select>
                <input type="number" id="repayAmount" placeholder="المبلغ">
                <button id="repayDebtBtn">تسديد</button>
            </div>
            <div class="card">
                <h3>📜 سجل معاملات العميل</h3>
                <select id="historyCustomerSelect"></select>
                <button id="showHistoryBtn" class="btn-outline">عرض</button>
                <div id="customerHistory"></div>
            </div>
        </div>
        <div id="reports" class="page">
            <div class="card">
                <h3>📈 تقرير شامل</h3>
                <div id="fullReportDiv"></div>
                <div class="flex-btns">
                    <button id="generatePdfBtn">📄 PDF</button>
                    <button id="sharePdfBtn">📤 مشاركة</button>
                    <button id="copyReportBtn">📋 نسخ</button>
                    <button id="resetWeekBtn" class="btn-danger">🔄 أسبوع جديد</button>
                </div>
            </div>
            <div class="card">
                <h3>📅 سجل يومي</h3>
                <div style="overflow-x:auto;">
                    <table id="dailyLedger">
                        <thead><tr><th>التاريخ</th><th>البيان</th><th>الكمية</th><th>المبلغ</th><th>النوع</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div id="analytics" class="page">
            <div class="card">
                <h3>📈 المبيعات اليومية</h3>
                <canvas id="dailySalesChart"></canvas>
            </div>
            <div class="card">
                <h3>🏆 أعلى 5 ديون</h3>
                <canvas id="topDebtsChart"></canvas>
            </div>
            <div class="card">
                <h3>💰 هيكل الإيرادات</h3>
                <canvas id="revenuePieChart"></canvas>
            </div>
            <div class="card">
                <h3>🏭 إنتاج vs مبيعات</h3>
                <canvas id="prodVsSalesChart"></canvas>
            </div>
        </div>
        <div id="archive" class="page">
            <div class="card">
                <h3>📅 تصفح التقارير السابقة</h3>
                <div class="date-range">
                    <input type="date" id="archiveStartDate">
                    <input type="date" id="archiveEndDate">
                    <button id="archiveFilterBtn">عرض</button>
                </div>
                <div id="archiveReportArea"></div>
                <button id="exportArchiveBtn" class="btn-outline">📎 تصدير CSV</button>
            </div>
        </div>
    `;
}

// -------------------- تحديث الواجهة --------------------
function updateUI() {
    updateCustomersDebt();

    // الملخص السريع
    document.getElementById("quickStats").innerHTML = `💰 كاش: ${getCashTotal().toFixed(2)} | 📋 ديون: ${getDebtsTotal().toFixed(2)} | 🧊 مخزون: ${getApproxStock()}`;
    document.getElementById("totalProdSpan").innerText = getTotalProduction();

    // جدول المصروفات والتالف
    const expAll = [
        ...expenses.map((e, i) => ({ ...e, i, isDamage: false })),
        ...damages.map((d, i) => ({ date: d.date, desc: `تالف ${d.qty} لوح`, amount: 0, i, isDamage: true }))
    ];
    expAll.sort((a, b) => b.date.localeCompare(a.date));
    document.querySelector("#expensesTable tbody").innerHTML = expAll.map(e =>
        e.isDamage ?
        `<tr><td>${e.date}</td><td>🔴 ${e.desc}</td><td>0</td><td><button onclick="deleteDamage(${e.i})">X</button></td></tr>` :
        `<tr><td>${e.date}</td><td>${e.desc}</td><td>${e.amount.toFixed(2)}</td><td><button onclick="deleteExpense(${e.i})">X</button></td></tr>`
    ).join("");

    // جدول العمال
    renderWorkersTable();

    // قوائم العملاء
    updateCustomerSelects();

    // الديون النشطة
    renderActiveDebts();

    // التقرير المالي
    const cash = getCashTotal();
    const debts = getDebtsTotal();
    const expTot = getExpensesTotal();
    const net = cash - expTot;
    const stock = getApproxStock();
    document.getElementById("fullReportDiv").innerHTML = `
        <div>📦 إنتاج: ${getTotalProduction()}</div>
        <div>🧊 مبيعات: ${getTotalSalesQty()}</div>
        <div>⚠️ تالف: ${getTotalDamages()}</div>
        <div>📦 مخزون: ${stock}</div>
        <hr>
        <div>💰 كاش: ${cash.toFixed(2)}</div>
        <div>📋 ديون: ${debts.toFixed(2)}</div>
        <div>💸 مصروفات: ${expTot.toFixed(2)}</div>
        <div style="color:#15803d;">✅ صافي الربح: ${net.toFixed(2)}</div>
    `;

    // السجل اليومي
    const ledger = [];
    customerTransactions.filter(t => t.type === "purchase").forEach(s => ledger.push({
        date: s.date,
        desc: `بيع ${s.qty} لوح`,
        qty: s.qty,
        amount: s.paid,
        type: s.remaining === 0 ? "كاش" : "دين"
    }));
    productions.forEach(p => ledger.push({
        date: p.date,
        desc: `إنتاج ${p.boards}`,
        qty: p.boards,
        amount: 0,
        type: "إنتاج"
    }));
    expenses.forEach(e => ledger.push({
        date: e.date,
        desc: `مصروف: ${e.desc}`,
        qty: "-",
        amount: e.amount,
        type: "مصروف"
    }));
    damages.forEach(d => ledger.push({
        date: d.date,
        desc: `تالف ${d.qty}`,
        qty: d.qty,
        amount: 0,
        type: "تالف"
    }));
    ledger.sort((a, b) => a.date.localeCompare(b.date));
    document.querySelector("#dailyLedger tbody").innerHTML = ledger.map(l =>
        `<tr><td>${l.date}</td><td>${l.desc}</td><td>${l.qty}</td><td>${l.amount === 0 ? "-" : l.amount.toFixed(2)}</td><td>${l.type}</td></tr>`
    ).join("");

    // تحديث الرسوم البيانية
    updateCharts();
}

function renderWorkersTable() {
    const tbody = document.getElementById("workersTableBody");
    tbody.innerHTML = workers.map((w, idx) => {
        const net = w.totalEarned - w.advances;
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${w.name}</td>
                <td>${w.cycles}</td>
                <td>${w.totalEarned.toFixed(2)}</td>
                <td>${w.advances.toFixed(2)}</td>
                <td style="color:${net >= 0 ? '#15803d' : '#c44536'}">${net.toFixed(2)}</td>
                <td class="action-icons">
                    ${userRole === "admin" ? `
                        <button class="icon-btn edit" onclick="editWorker(${idx})">تعديل</button>
                        <button class="icon-btn cycle" onclick="addCycle(${idx})">دورة</button>
                        <button class="icon-btn advance" onclick="addAdvance(${idx})">سلفة</button>
                        <button class="icon-btn" style="background:#c44536;color:white;" onclick="deleteWorker(${idx})">حذف</button>
                    ` : "عرض فقط"}
                </td>
            </tr>
        `;
    }).join("");

    const sumHtml = `
        <table><thead><tr><th>العامل</th><th>المستحق</th><th>السلف</th><th>الصافي</th></tr></thead>
        <tbody>${workers.map(w => {
            const net = w.totalEarned - w.advances;
            return `<tr><td>${w.name}</td><td>${w.totalEarned.toFixed(2)}</td><td>${w.advances.toFixed(2)}</td><td>${net.toFixed(2)}</td></tr>`;
        }).join("")}</tbody></table>
        <div style="margin-top:8px;background:#e0f2fe;padding:8px;border-radius:12px;">
            <strong>💰 إجمالي الصرف: ${workers.reduce((s, w) => s + (w.totalEarned - w.advances), 0).toFixed(2)}</strong>
        </div>
    `;
    document.getElementById("workersSummaryTable").innerHTML = sumHtml;
}

function updateCustomerSelects() {
    const options = customers.map(c => `<option value="${c.id}">${c.name} (متبقي: ${(c.totalDebt || 0).toFixed(2)})</option>`).join("");
    document.getElementById("customerSelect").innerHTML = `<option value="">-- اختر عميل --</option>` + options;
    document.getElementById("repayCustomerSelect").innerHTML = `<option value="">اختر عميلاً</option>` + options;
    document.getElementById("historyCustomerSelect").innerHTML = `<option value="">اختر عميلاً</option>` + options;
}

function renderActiveDebts() {
    const active = customers.filter(c => (c.totalDebt || 0) > 0);
    const tbody = document.getElementById("activeDebtsTable");
    if (!active.length) {
        tbody.innerHTML = `<tr><td colspan="4">لا توجد ديون نشطة</td></tr>`;
        return;
    }
    tbody.innerHTML = active.map(c => `
        <tr>
            <td><strong>${c.name}</strong></td>
            <td class="badge-debt">${c.totalDebt.toFixed(2)}</td>
            <td>${c.lastTransactionDate || "-"}</td>
            <td>${userRole === "admin" ? `<button onclick="quickRepay('${c.id}')" style="background:#2e7d32;">تسديد</button>` : "-"}</td>
        </tr>
    `).join("");
}

window.quickRepay = (id) => {
    if (userRole === "admin") {
        document.getElementById("repayCustomerSelect").value = id;
        document.getElementById("repayAmount").focus();
    }
};

// -------------------- العمليات الأساسية --------------------
function addCustomer() {
    if (userRole !== "admin") return;
    const name = prompt("اسم العميل الجديد:");
    if (name && name.trim()) {
        customers.push({ id: "c" + Date.now(), name: name.trim(), totalDebt: 0 });
        saveToFirestore();
        updateUI();
        showToast(`➕ تم إضافة العميل ${name}`);
    }
}

function addPurchase() {
    if (userRole !== "admin") return;
    const qty = parseInt(document.getElementById("saleQty").value);
    const price = parseFloat(document.getElementById("salePrice").value);
    let paidNow = parseFloat(document.getElementById("paidNow").value);
    const customerId = document.getElementById("customerSelect").value;

    if (!qty || qty <= 0 || !price || price <= 0) {
        alert("أدخل كمية وسعر صحيح");
        return;
    }
    if (isNaN(paidNow)) paidNow = 0;

    const totalAmount = qty * price;
    const remaining = totalAmount - paidNow;
    if (remaining < 0) {
        alert("المبلغ المدفوع لا يمكن أن يزيد عن الإجمالي");
        return;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (remaining === 0) {
        customerTransactions.push({
            id: "t" + Date.now(), customerId: "cash", customerName: "كاش", date: today,
            type: "purchase", qty, price, totalAmount, paid: paidNow, remaining: 0, note: "كاش"
        });
        saveToFirestore();
        document.getElementById("saleQty").value = "0";
        document.getElementById("paidNow").value = "0";
        updateUI();
        showToast(`✅ بيع كاش: ${qty} لوح, ${totalAmount.toFixed(2)}`);
        return;
    }

    if (!customerId) {
        alert("عند الدفع الجزئي أو الدين الكامل، يجب اختيار عميل");
        return;
    }

    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert("العميل غير موجود");
        return;
    }

    customerTransactions.push({
        id: "t" + Date.now(), customerId, customerName: customer.name, date: today,
        type: "purchase", qty, price, totalAmount, paid: paidNow, remaining,
        note: paidNow === 0 ? "دين كامل" : `دفع ${paidNow} والباقي ${remaining}`
    });
    updateCustomersDebt();
    saveToFirestore();
    document.getElementById("saleQty").value = "0";
    document.getElementById("paidNow").value = "0";
    updateUI();
    showToast(`✅ ${qty} لوح للعميل ${customer.name}, دفع ${paidNow}, متبقي ${remaining}`);
}

function repayDebt() {
    if (userRole !== "admin") return;
    const customerId = document.getElementById("repayCustomerSelect").value;
    const amount = parseFloat(document.getElementById("repayAmount").value);
    if (!customerId) {
        alert("اختر عميلاً");
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert("أدخل مبلغاً صحيحاً");
        return;
    }
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    if (amount > customer.totalDebt) {
        alert(`المبلغ أكبر من المتبقي (${customer.totalDebt})`);
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    customerTransactions.push({
        id: "t" + Date.now(), customerId, date: today,
        type: "repayment", paid: amount, note: `تسديد ${amount}`
    });
    updateCustomersDebt();
    saveToFirestore();
    document.getElementById("repayAmount").value = "";
    updateUI();
    showToast(`💰 تم تسديد ${amount} من حساب ${customer.name}`);
}

function showCustomerHistory() {
    const customerId = document.getElementById("historyCustomerSelect").value;
    if (!customerId) {
        alert("اختر عميلاً");
        return;
    }
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    const transactions = customerTransactions.filter(t => t.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date));
    let html = `
        <table style="width:100%">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
            <tbody>
    `;
    transactions.forEach(t => {
        if (t.type === "purchase") {
            html += `<tr><td>${t.date}</td><td>شراء</td><td>${t.qty}</td><td>${t.totalAmount.toFixed(2)}</td><td>${t.paid.toFixed(2)}</td><td class="badge-debt">${t.remaining.toFixed(2)}</td></tr>`;
        } else {
            html += `<tr><td>${t.date}</td><td>سداد</td><td>-</td><td>-</td><td>${t.paid.toFixed(2)}</td><td>-</td></tr>`;
        }
    });
    html += `</tbody></table><div style="margin-top:8px;background:#e0f2fe;padding:8px;border-radius:12px;"><strong>💰 المتبقي: ${customer.totalDebt.toFixed(2)}</strong></div>`;
    document.getElementById("customerHistory").innerHTML = html;
}

function addProduction() {
    if (userRole !== "admin") return;
    productions.push({ date: document.getElementById("prodDate").value, boards: 340 });
    saveToFirestore();
    updateUI();
    showToast("🏭 دورة إنتاج 340 لوح");
}

function addExpense() {
    if (userRole !== "admin") return;
    const desc = document.getElementById("expDesc").value;
    const amount = parseFloat(document.getElementById("expAmount").value);
    const date = document.getElementById("expDate").value;
    if (desc && amount > 0) {
        expenses.push({ date, desc, amount });
        saveToFirestore();
        updateUI();
        showToast(`💸 مصروف: ${desc}`);
        document.getElementById("expDesc").value = "";
        document.getElementById("expAmount").value = "";
    }
}

function addDamage() {
    if (userRole !== "admin") return;
    const qty = parseInt(document.getElementById("damageQty").value);
    const date = document.getElementById("damageDate").value;
    if (qty > 0) {
        damages.push({ date, qty });
        saveToFirestore();
        updateUI();
        showToast(`⚠️ تالف ${qty} لوح`);
        document.getElementById("damageQty").value = "";
    }
}

function addNewWorker() {
    if (userRole !== "admin") return;
    const name = prompt("اسم العامل الجديد:");
    if (name && name.trim()) {
        workers.push({ id: "w" + Date.now(), name: name.trim(), cycles: 0, totalEarned: 0, advances: 0 });
        saveToFirestore();
        updateUI();
        showToast(`➕ تم إضافة العامل ${name}`);
    }
}

function recordGroupCycle() {
    if (userRole !== "admin") return;
    const d = new Date().toISOString().slice(0, 10);
    workers.forEach(w => {
        if (confirm(`هل حضر ${w.name} الدورة اليوم؟`)) {
            const wage = parseFloat(prompt(`أجر ${w.name} عن هذه الدورة:`));
            if (wage > 0) {
                w.cycles++;
                w.totalEarned += wage;
                cyclesLog.push({ workerId: w.id, date: d, earned: wage });
            }
        }
    });
    saveToFirestore();
    updateUI();
    showToast("✅ تم تسجيل الدورة");
}

window.editWorker = (idx) => {
    if (userRole !== "admin") return;
    const newName = prompt("الاسم الجديد:", workers[idx].name);
    if (newName && newName.trim()) workers[idx].name = newName.trim();
    saveToFirestore();
    updateUI();
};

window.addCycle = (idx) => {
    if (userRole !== "admin") return;
    const w = workers[idx];
    const wage = parseFloat(prompt(`أجر ${w.name} للدورة الجديدة:`));
    if (wage > 0) {
        w.cycles++;
        w.totalEarned += wage;
        cyclesLog.push({ workerId: w.id, date: new Date().toISOString().slice(0, 10), earned: wage });
        saveToFirestore();
        updateUI();
        showToast(`✅ دورة ${w.name} +${wage}`);
    }
};

window.addAdvance = (idx) => {
    if (userRole !== "admin") return;
    const amount = parseFloat(prompt(`سلفة للعامل ${workers[idx].name}:`));
    if (amount > 0) {
        workers[idx].advances += amount;
        expenses.push({ date: new Date().toISOString().slice(0, 10), desc: `سلفة عامل - ${workers[idx].name}`, amount });
        saveToFirestore();
        updateUI();
        showToast(`💰 سلفة ${amount} للعامل ${workers[idx].name}`);
    }
};

window.deleteWorker = (idx) => {
    if (userRole !== "admin") return;
    if (confirm(`حذف العامل ${workers[idx].name}؟`)) {
        workers.splice(idx, 1);
        saveToFirestore();
        updateUI();
        showToast("🗑 تم حذف العامل");
    }
};

window.deleteExpense = (idx) => {
    if (userRole !== "admin") return;
    expenses.splice(idx, 1);
    saveToFirestore();
    updateUI();
    showToast("🗑 تم حذف المصروف");
};

window.deleteDamage = (idx) => {
    if (userRole !== "admin") return;
    damages.splice(idx, 1);
    saveToFirestore();
    updateUI();
    showToast("🗑 تم حذف التالف");
};

function resetWeek() {
    if (userRole !== "admin") return;
    const remainingStock = getApproxStock();
    if (confirm(`⚠️ سيتم حذف سجل الأسبوع الحالي. سيتم ترحيل المخزون المتبقي (${remainingStock} لوح). هل تريد المتابعة؟`)) {
        localStorage.setItem("factory_backup", JSON.stringify({
            customers, customerTransactions, productions, expenses, damages, workers, cyclesLog
        }));
        customerTransactions = [];
        expenses = [];
        damages = [];
        if (remainingStock > 0) {
            productions = [{ date: new Date().toISOString().slice(0, 10), boards: remainingStock, note: "رصيد من الأسبوع السابق" }];
        } else {
            productions = [];
        }
        cyclesLog = [];
        workers.forEach(w => { w.cycles = 0; w.totalEarned = 0; });
        saveToFirestore();
        updateUI();
        showToast(`✅ بدأ أسبوع جديد، تم ترحيل ${remainingStock} لوح`);
    }
}

// -------------------- الرسوم البيانية --------------------
function updateCharts() {
    const last7Days = [];
    const dailySalesData = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        last7Days.push(dateStr.slice(5));
        const daySales = customerTransactions.filter(t => t.type === "purchase" && t.date === dateStr).reduce((s, t) => s + (t.paid || 0), 0);
        dailySalesData.push(daySales);
    }

    if (charts.dailySales) charts.dailySales.destroy();
    const ctx1 = document.getElementById("dailySalesChart").getContext("2d");
    charts.dailySales = new Chart(ctx1, {
        type: "line",
        data: { labels: last7Days, datasets: [{ label: "المبيعات", data: dailySalesData, borderColor: "#1e6f5c", tension: 0.3 }] },
        options: { responsive: true }
    });

    const topDebts = [...customers].sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0)).slice(0, 5);
    if (charts.topDebts) charts.topDebts.destroy();
    const ctx2 = document.getElementById("topDebtsChart").getContext("2d");
    charts.topDebts = new Chart(ctx2, {
        type: "bar",
        data: { labels: topDebts.map(c => c.name), datasets: [{ label: "المتبقي", data: topDebts.map(c => c.totalDebt), backgroundColor: "#e6a017" }] },
        options: { responsive: true }
    });

    if (charts.revenuePie) charts.revenuePie.destroy();
    const ctx3 = document.getElementById("revenuePieChart").getContext("2d");
    charts.revenuePie = new Chart(ctx3, {
        type: "pie",
        data: { labels: ["كاش", "ديون"], datasets: [{ data: [getCashTotal(), getDebtsTotal()], backgroundColor: ["#1e6f5c", "#c44536"] }] },
        options: { responsive: true }
    });

    const last7DaysProd = [];
    const prodData = [];
    const salesQtyData = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        last7DaysProd.push(dateStr.slice(5));
        const dayProd = productions.filter(p => p.date === dateStr).reduce((s, p) => s + (p.boards || 0), 0);
        prodData.push(dayProd);
        const daySalesQty = customerTransactions.filter(t => t.type === "purchase" && t.date === dateStr).reduce((s, t) => s + (t.qty || 0), 0);
        salesQtyData.push(daySalesQty);
    }
    if (charts.prodVsSales) charts.prodVsSales.destroy();
    const ctx4 = document.getElementById("prodVsSalesChart").getContext("2d");
    charts.prodVsSales = new Chart(ctx4, {
        type: "bar",
        data: { labels: last7DaysProd, datasets: [{ label: "الإنتاج", data: prodData, backgroundColor: "#1e4660" }, { label: "المبيعات", data: salesQtyData, backgroundColor: "#1e6f5c" }] },
        options: { responsive: true }
    });
}

// -------------------- PDF والتقارير --------------------
async function generatePDF(shareMode = false) {
    showToast("⏳ جاري تجهيز التقرير...");
    try {
        const div = document.createElement("div");
        div.style.padding = "20px";
        div.style.fontFamily = "'Cairo', sans-serif";
        div.style.background = "white";
        div.innerHTML = `
            <div style="text-align:center;">
                <h2 style="color:#0b3b5f;">🏭 تقرير مصنع الثلج</h2>
                <p>${new Date().toLocaleDateString('ar-EG')}</p>
            </div>
            <h3>📊 الملخص المالي</h3>
            <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;">
                <tr style="background:#e2e8f0;"><th>البند</th><th>القيمة</th>去
                <tr><td>📦 الإنتاج</td><td>${getTotalProduction()} لوح</td></tr>
                <tr><td>🧊 المبيعات</td><td>${getTotalSalesQty()} لوح</td></tr>
                <tr><td>⚠️ التالف</td><td>${getTotalDamages()} لوح</td></tr>
                <tr><td>📦 المخزون</td><td>${getApproxStock()} لوح</td></tr>
                <tr style="background:#e0f2fe;"><td>💰 الكاش</td><td>${getCashTotal().toFixed(2)}</td></tr>
                <tr style="background:#fff3e0;"><td>📋 الديون</td><td>${getDebtsTotal().toFixed(2)}</td></tr>
                <tr style="background:#fee2e2;"><td>💸 المصروفات</td><td>${getExpensesTotal().toFixed(2)}</td></tr>
                <tr style="background:#dff9e6;"><td>✅ صافي الربح</td><td>${getNetProfit().toFixed(2)}</td></tr>
            </table>
            <h3>📋 الديون النشطة</h3>
            <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;">
                <tr style="background:#e2e8f0;"><th>العميل</th><th>المتبقي</th>去
                ${customers.filter(c => c.totalDebt > 0).map(c => `<tr><td>${c.name}</td><td>${c.totalDebt.toFixed(2)}</td></tr>`).join("")}
                ${customers.filter(c => c.totalDebt > 0).length === 0 ? '<tr><td colspan="2">لا توجد ديون نشطة</td></tr>' : ''}
            </table>
            <h3>📅 السجل اليومي</h3>
            <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;">
                <tr style="background:#e2e8f0;"><th>التاريخ</th><th>البيان</th><th>الكمية</th><th>المبلغ</th><th>النوع</th>去
                ${(() => {
                    const ledger = [];
                    customerTransactions.filter(t => t.type === "purchase").forEach(s => ledger.push({ date: s.date, desc: `بيع ${s.qty} لوح`, qty: s.qty, amount: s.paid, type: s.remaining === 0 ? "كاش" : "دين" }));
                    productions.forEach(p => ledger.push({ date: p.date, desc: `إنتاج ${p.boards}`, qty: p.boards, amount: 0, type: "إنتاج" }));
                    expenses.forEach(e => ledger.push({ date: e.date, desc: `مصروف: ${e.desc}`, qty: "-", amount: e.amount, type: "مصروف" }));
                    damages.forEach(d => ledger.push({ date: d.date, desc: `تالف ${d.qty}`, qty: d.qty, amount: 0, type: "تالف" }));
                    ledger.sort((a, b) => a.date.localeCompare(b.date));
                    return ledger.map(l => `<tr><td>${l.date}</td><td>${l.desc}</td><td>${l.qty}</td><td>${l.amount === 0 ? "-" : l.amount.toFixed(2)}</td><td>${l.type}</td></tr>`).join("");
                })()}
            </table>
        `;
        document.body.appendChild(div);
        const canvas = await html2canvas(div, { scale: 2, backgroundColor: "#ffffff" });
        document.body.removeChild(div);
        const imgData = canvas.toDataURL("image/png");
        const { jsPDF } = window.jspdf;
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const pdf = new jsPDF({ unit: "mm", format: "a4" });
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
        if (shareMode && navigator.share) {
            const blob = pdf.output("blob");
            const file = new File([blob], `report_${Date.now()}.pdf`, { type: "application/pdf" });
            await navigator.share({ title: "تقرير المصنع", files: [file] });
            showToast("📤 تمت المشاركة");
        } else {
            pdf.save(`report_${Date.now()}.pdf`);
            showToast("📄 تم حفظ التقرير");
        }
    } catch (e) {
        console.error(e);
        showToast("❌ حدث خطأ", true);
    }
}

function copyReport() {
    const text = `تقرير المصنع\nكاش: ${getCashTotal().toFixed(2)}\nديون: ${getDebtsTotal().toFixed(2)}\nمصروفات: ${getExpensesTotal().toFixed(2)}\nصافي الربح: ${getNetProfit().toFixed(2)}\nالمخزون: ${getApproxStock()}`;
    navigator.clipboard.writeText(text);
    showToast("📋 تم نسخ التقرير");
}

function showArchive() {
    const startDate = document.getElementById("archiveStartDate").value;
    const endDate = document.getElementById("archiveEndDate").value;
    if (!startDate || !endDate) {
        alert("اختر تاريخ البداية والنهاية");
        return;
    }
    const filteredTransactions = customerTransactions.filter(t => t.date >= startDate && t.date <= endDate);
    const filteredProductions = productions.filter(p => p.date >= startDate && p.date <= endDate);
    const filteredExpenses = expenses.filter(e => e.date >= startDate && e.date <= endDate);
    const filteredDamages = damages.filter(d => d.date >= startDate && d.date <= endDate);
    
    let html = `<h4>📅 الفترة: ${startDate} إلى ${endDate}</h4>`;
    html += `<div><strong>💰 إجمالي الكاش:</strong> ${filteredTransactions.filter(t => t.type === "purchase" && t.remaining === 0).reduce((s, t) => s + t.paid, 0).toFixed(2)}</div>`;
    html += `<div><strong>📋 إجمالي الديون الجديدة:</strong> ${filteredTransactions.filter(t => t.type === "purchase" && t.remaining > 0).reduce((s, t) => s + t.remaining, 0).toFixed(2)}</div>`;
    html += `<div><strong>💰 إجمالي التحصيل:</strong> ${filteredTransactions.filter(t => t.type === "repayment").reduce((s, t) => s + t.paid, 0).toFixed(2)}</div>`;
    html += `<div><strong>🏭 الإنتاج:</strong> ${filteredProductions.reduce((s, p) => s + p.boards, 0)} لوح</div>`;
    html += `<div><strong>💸 المصروفات:</strong> ${filteredExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}</div>`;
    html += `<div><strong>⚠️ التالف:</strong> ${filteredDamages.reduce((s, d) => s + d.qty, 0)} لوح</div>`;
    document.getElementById("archiveReportArea").innerHTML = html;
}

function exportCSV() {
    const data = customerTransactions.map(t => `${t.date},${t.type},${t.qty || ""},${t.totalAmount || ""},${t.paid || ""},${t.remaining || ""}`).join("\n");
    const blob = new Blob([data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📎 تم تصدير البيانات");
}

// -------------------- الصلاحيات --------------------
function applyPermissions() {
    const btns = document.querySelectorAll("button:not(#logoutBtn):not(#loginBtn):not(#guestBtn)");
    if (userRole !== "admin") {
        btns.forEach(btn => { if (btn.id !== "incQty1" && btn.id !== "incQty5" && btn.id !== "incQty10" && btn.id !== "resetQtyBtn") btn.disabled = true; });
    } else {
        btns.forEach(btn => btn.disabled = false);
    }
    if (userRole === "guest") {
        document.querySelectorAll(".tab-btn").forEach(tab => { if (tab.dataset.page !== "analytics") tab.style.display = "none"; });
    } else {
        document.querySelectorAll(".tab-btn").forEach(tab => tab.style.display = "block");
    }
}

// -------------------- المصادقة --------------------
window.onload = () => {
    buildUI();

    auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) {
            const email = user.email;
            if (email === "admin@icefactory.com") userRole = "admin";
            else userRole = "viewer";
            document.getElementById("userInfo").innerText = `مرحباً ${email} (${userRole === "admin" ? "مدير" : "مستخدم"})`;
            document.getElementById("logoutBtn").style.display = "inline-block";
            document.getElementById("authScreen").style.display = "none";
            document.querySelector(".tabs").style.display = "flex";
            await loadFromFirestore();
        } else {
            userRole = "guest";
            document.getElementById("userInfo").innerText = "زائر";
            document.getElementById("logoutBtn").style.display = "none";
            document.getElementById("authScreen").style.display = "block";
            document.querySelector(".tabs").style.display = "none";
        }
        applyPermissions();
        updateUI();
    });

    document.getElementById("loginBtn").onclick = async () => {
        const email = document.getElementById("loginEmail").value;
        const pwd = document.getElementById("loginPassword").value;
        try {
            await auth.signInWithEmailAndPassword(email, pwd);
            showToast("✅ تم تسجيل الدخول");
        } catch (e) {
            alert("فشل الدخول: " + e.message);
        }
    };

    document.getElementById("guestBtn").onclick = () => {
        auth.signOut();
        userRole = "guest";
        location.reload();
    };

    document.getElementById("logoutBtn").onclick = async () => {
        await auth.signOut();
        localStorage.clear();
        location.reload();
    };

    // ربط الأحداث
    document.getElementById("addCustomerBtn")?.addEventListener("click", addCustomer);
    document.getElementById("addSaleBtn")?.addEventListener("click", addPurchase);
    document.getElementById("repayDebtBtn")?.addEventListener("click", repayDebt);
    document.getElementById("showHistoryBtn")?.addEventListener("click", showCustomerHistory);
    document.getElementById("addProductionBtn")?.addEventListener("click", addProduction);
    document.getElementById("addExpenseBtn")?.addEventListener("click", addExpense);
    document.getElementById("addDamageBtn")?.addEventListener("click", addDamage);
    document.getElementById("recordCycleBtn")?.addEventListener("click", recordGroupCycle);
    document.getElementById("addWorkerBtn")?.addEventListener("click", addNewWorker);
    document.getElementById("generatePdfBtn")?.addEventListener("click", () => generatePDF(false));
    document.getElementById("sharePdfBtn")?.addEventListener("click", () => generatePDF(true));
    document.getElementById("copyReportBtn")?.addEventListener("click", copyReport);
    document.getElementById("resetWeekBtn")?.addEventListener("click", resetWeek);
    document.getElementById("archiveFilterBtn")?.addEventListener("click", showArchive);
    document.getElementById("exportArchiveBtn")?.addEventListener("click", exportCSV);
    
    document.getElementById("incQty1")?.addEventListener("click", () => {
        const inp = document.getElementById("saleQty");
        inp.value = (+inp.value || 0) + 1;
    });
    document.getElementById("incQty5")?.addEventListener("click", () => {
        const inp = document.getElementById("saleQty");
        inp.value = (+inp.value || 0) + 5;
    });
    document.getElementById("incQty10")?.addEventListener("click", () => {
        const inp = document.getElementById("saleQty");
        inp.value = (+inp.value || 0) + 10;
    });
    document.getElementById("resetQtyBtn")?.addEventListener("click", () => {
        document.getElementById("saleQty").value = 0;
    });

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".page").forEach(p => p.classList.remove("active-page"));
            document.getElementById(btn.dataset.page).classList.add("active-page");
        };
    });
};
