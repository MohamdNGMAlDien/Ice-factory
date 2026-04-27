// ============================================
// إدارة قاعدة البيانات - عمليات CRUD موحدة
// ============================================

const DB = {
    collections: {
        CUSTOMERS: 'customers',
        TRANSACTIONS: 'transactions',
        PRODUCTIONS: 'productions',
        EXPENSES: 'expenses',
        DAMAGES: 'damages',
        WORKERS: 'workers',
        WORKERS_MONTHLY: 'workersMonthly',
        CYCLE_LOGS: 'cycleLogs',
        MONTHLY_SALARIES: 'monthlySalaries',
        BACKUPS: 'backups'
    },
    
    // حفظ البيانات (مع دعم غير متصل)
    async save(collection, data, id = null) {
        try {
            const dbRef = window.firebaseAPI.db;
            if (!dbRef || !window.firebaseAPI.isAvailable) {
                // حفظ محلي في localStorage كنسخة احتياطية
                return this.saveLocal(collection, data, id);
            }
            
            const docId = id || Date.now().toString();
            await dbRef.collection(collection).doc(docId).set({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            return { success: true, id: docId };
        } catch (error) {
            console.error(`Error saving to ${collection}:`, error);
            // fallback للتخزين المحلي
            return this.saveLocal(collection, data, id);
        }
    },
    
    // حفظ محلي (نسخة احتياطية)
    saveLocal(collection, data, id) {
        try {
            const localKey = `local_${collection}`;
            let localData = JSON.parse(localStorage.getItem(localKey)) || [];
            const docId = id || Date.now().toString();
            const existingIndex = localData.findIndex(item => item.id === docId);
            
            const newData = { ...data, id: docId, updatedAt: new Date().toISOString() };
            
            if (existingIndex >= 0) {
                localData[existingIndex] = newData;
            } else {
                localData.push(newData);
            }
            
            localStorage.setItem(localKey, JSON.stringify(localData));
            return { success: true, id: docId, local: true };
        } catch (error) {
            console.error('Local save error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // قراءة البيانات
    async getAll(collection) {
        try {
            const dbRef = window.firebaseAPI.db;
            if (!dbRef || !window.firebaseAPI.isAvailable) {
                return this.getAllLocal(collection);
            }
            
            const snapshot = await dbRef.collection(collection).get();
            const data = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() });
            });
            
            // تحديث localStorage كنسخة احتياطية
            localStorage.setItem(`local_${collection}`, JSON.stringify(data));
            
            return data;
        } catch (error) {
            console.error(`Error reading ${collection}:`, error);
            return this.getAllLocal(collection);
        }
    },
    
    getAllLocal(collection) {
        const localKey = `local_${collection}`;
        const data = localStorage.getItem(localKey);
        return data ? JSON.parse(data) : [];
    },
    
    // حذف مستند
    async delete(collection, id) {
        try {
            const dbRef = window.firebaseAPI.db;
            if (dbRef && window.firebaseAPI.isAvailable) {
                await dbRef.collection(collection).doc(id).delete();
            }
            
            // حذف من localStorage أيضاً
            const localKey = `local_${collection}`;
            let localData = JSON.parse(localStorage.getItem(localKey)) || [];
            localData = localData.filter(item => item.id !== id);
            localStorage.setItem(localKey, JSON.stringify(localData));
            
            return { success: true };
        } catch (error) {
            console.error(`Error deleting from ${collection}:`, error);
            return { success: false, error: error.message };
        }
    },
    
    // مزامنة جميع البيانات
    async syncAll() {
        if (!window.firebaseAPI.isAvailable) {
            console.warn('Firebase not available, skipping sync');
            return false;
        }
        
        window.syncInProgress = true;
        this.showLoading(true);
        
        try {
            const collections = Object.values(this.collections);
            
            for (const collection of collections) {
                const localData = this.getAllLocal(collection);
                
                for (const item of localData) {
                    await this.save(collection, item, item.id);
                }
            }
            
            this.showToast('✅ تمت المزامنة مع السحابة بنجاح');
            return true;
        } catch (error) {
            console.error('Sync error:', error);
            this.showToast('❌ فشلت المزامنة، سيتم المحاولة لاحقاً', true);
            return false;
        } finally {
            window.syncInProgress = false;
            this.showLoading(false);
        }
    },
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    },
    
    showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.style.background = isError ? 'var(--danger)' : 'var(--secondary)';
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }
};

// جعل DB متاحاً عالمياً
window.DB = DB;
