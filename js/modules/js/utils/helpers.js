// ============================================
// دوال مساعدة عامة
// ============================================

const Helpers = {
    // تنسيق التاريخ
    formatDate(date, format = 'arabic') {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        if (format === 'arabic') {
            return `${day}/${month}/${year}`;
        }
        return `${year}-${month}-${day}`;
    },
    
    // تنسيق العملة
    formatCurrency(amount) {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP',
            minimumFractionDigits: 2
        }).format(amount);
    },
    
    // توليد ID فريد
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // حساب الفرق بين تاريخين
    dateDiff(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },
    
    // تجميع البيانات حسب التاريخ
    groupByDate(data, dateField = 'date') {
        const grouped = {};
        data.forEach(item => {
            const date = this.formatDate(item[dateField], 'iso');
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(item);
        });
        return grouped;
    },
    
    // تنزيل ملف JSON
    downloadJSON(data, filename) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${this.formatDate(new Date())}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    // رفع ملف JSON
    uploadJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
};

window.Helpers = Helpers;
