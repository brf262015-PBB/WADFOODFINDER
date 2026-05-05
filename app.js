        // ============================================================
        // MYSQL API LAYER — menggantikan semua Firebase SDK calls
        // Semua request diarahkan ke api.php di server yang sama
        // ============================================================
        const API = 'api.php';

        async function apiCall(action, data = {}) {
            try {
                const res = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, ...data })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (e) {
                console.error('API Error:', action, e);
                return { success: false, error: e.message };
            }
        }

        // ROOM_ID dinamis: customer punya room sendiri, vendor masuk ke room yang dipilih
        let ROOM_ID = 'global_foodfinder';
        const ADMIN_PASS = "admin123";
        const RUP = s => Number(s).toLocaleString('id-ID');
        const TIME_FMT = { hour: '2-digit', minute: '2-digit' };
        // ── Pengganti Firebase dbAdd / dbGet / dbUpd / dbDel ──
        // Semua fungsi di bawah ini IDENTIK signature-nya dengan versi Firebase
        // sehingga kode bisnis di bagian bawah tidak perlu diubah sama sekali.

        async function loginCheck(username, password) {
            const r = await apiCall('loginCheck', { username, password });
            return r.success ? r.vendor : null;
        }

        async function getVendors() {
            const r = await apiCall('getVendors');
            return r.success ? r.vendors : [];
        }

        async function getMenuByVendor(name) {
            const r = await apiCall('getMenuByVendor', { vendor: name });
            return r.success ? r.menus : [];
        }

        async function searchMenu(keyword) {
            const r = await apiCall('searchMenu', { keyword });
            return r.success ? r.menus : [];
        }

        async function saveMenu(vName, data) {
            return await apiCall('saveMenu', { vendor: vName, ...data });
        }

        async function updateMenu(id, data) {
            return await apiCall('updateMenu', { id, ...data });
        }

        async function deleteMenu(id) {
            return await apiCall('deleteMenu', { id });
        }

        async function saveOrder(orderData, custData) {
            const orderId = 'ORD-' + Date.now();
            const r = await apiCall('saveOrder', { orderId, orderData, custData, customerSession: getSessionId() });
            return r.success ? orderId : null;
        }

        // ── Vendor CRUD (admin panel) ──
        async function addVendorAdmin(data) {
            return await apiCall('addVendor', data);
        }

        async function deleteVendorAdmin(id) {
            return await apiCall('deleteVendor', { id });
        }

        async function updateVendorAdmin(id, data) {
            return await apiCall('updateVendor', { id, ...data });
        }

        async function updateOrderStatus(id, status) {
            return await apiCall('updateOrderStatus', { id, status });
        }

        // ── Chat ──
        async function sendMsg(pengirim, tipe, isi, menuData = null, targetVendor = null, orderData = null, custSession = null) {
            return await apiCall('sendMsg', {
                roomId: ROOM_ID, pengirim, tipe, isi,
                menuData: menuData ? JSON.stringify(menuData) : null,
                targetVendor, orderData: orderData ? JSON.stringify(orderData) : null,
                custSession, timestampNumber: Date.now()
            });
        }

        async function hapusChatLama() {
            return await apiCall('hapusChatLama', { roomId: ROOM_ID, cutoff: Date.now() - 300000 });
        }

        async function hapusSemuaChat() {
            return await apiCall('hapusSemuaChat', { roomId: ROOM_ID });
        }

        async function hapusChatOrderCustomer(sid) {
            return await apiCall('hapusChatOrderCustomer', { roomId: ROOM_ID, custSession: sid });
        }

        async function getChatMessages() {
            const r = await apiCall('getChat', { roomId: ROOM_ID, cutoff: Date.now() - 300000 });
            return r.success ? r.messages : [];
        }

        async function getOrdersByVendor(vendorName) {
            const r = await apiCall('getOrdersByVendor', { vendorName });
            return r.success ? r.orders : [];
        }

        async function getOrdersBySession(session) {
            const r = await apiCall('getOrdersBySession', { session });
            return r.success ? r.orders : [];
        }

        // ── Customer Rooms ──
        async function registerRoom(roomId, custSession, label) {
            return await apiCall('registerRoom', { roomId, custSession, label, lastSeen: Date.now() });
        }

        async function getActiveRooms() {
            const r = await apiCall('getActiveRooms');
            return r.success ? r.rooms : [];
        }

        async function leaveRoom(roomId) {
            return await apiCall('leaveRoom', { roomId });
        }

        // ── Polling pengganti onSnapshot Firebase ──
        // listenChat / listenOrders / listenMyOrders mengembalikan fungsi "unsubscribe"
        // yang menghentikan polling saat dipanggil — kompatibel penuh dengan kode bisnis.

        function listenChat(cb) {
            let active = true;
            let lastCount = 0;
            async function poll() {
                if (!active) return;
                const msgs = await getChatMessages();
                if (msgs.length !== lastCount) { lastCount = msgs.length; cb(msgs); }
                if (active) setTimeout(poll, 2000);
            }
            poll();
            return () => { active = false; };
        }

        function listenOrders(vendorName, cb) {
            let active = true;
            let lastJson = '';
            async function poll() {
                if (!active) return;
                const orders = await getOrdersByVendor(vendorName);
                const json = JSON.stringify(orders.map(o => ({ id: o.id, status: o.status })));
                if (json !== lastJson) { lastJson = json; cb(orders); }
                if (active) setTimeout(poll, 3000);
            }
            poll();
            return () => { active = false; };
        }

        function listenMyOrders(cb) {
            let active = true;
            let lastJson = '';
            async function poll() {
                if (!active) return;
                const sid = getSessionId();
                if (!sid) { if (active) setTimeout(poll, 3000); return; }
                const orders = await getOrdersBySession(sid);
                const json = JSON.stringify(orders.map(o => ({ id: o.id, status: o.status })));
                if (json !== lastJson) { lastJson = json; cb(orders); }
                if (active) setTimeout(poll, 3000);
            }
            poll();
            return () => { active = false; };
        }

        // ── setupDefaults: insert data awal jika tabel masih kosong ──
        async function setupDefaults() {
            await apiCall('setupDefaults');
        }

        // ============================================================
        // WEB STORAGE HELPER — semua akses sessionStorage terpusat di sini
        // Sebelumnya: data disimpan di variabel JS biasa (hilang saat refresh)
        // Sesudah   : data disimpan di sessionStorage (bertahan selama tab aktif)
        // ============================================================
        const SS = {
            // Ambil nilai dari sessionStorage, parse JSON jika perlu
            get(key, fallback = null) {
                try {
                    const val = sessionStorage.getItem(key);
                    return val !== null ? JSON.parse(val) : fallback;
                } catch { return fallback; }
            },
            // Simpan nilai ke sessionStorage sebagai JSON
            set(key, value) {
                try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('sessionStorage set error:', e); }
            },
            // Hapus satu key dari sessionStorage
            del(key) {
                try { sessionStorage.removeItem(key); } catch (e) { }
            },
            // Hapus semua key milik FoodFinder dari sessionStorage
            clear() {
                const keys = ['ff_mode','ff_vendorName','ff_vendorId','ff_sessionId',
                              'ff_currentOrder','ff_myPlacedOrderIds','ff_myOrderStatusMap','ff_trackerUnreadCount',
                              'ff_roomId','ff_custLabel','ff_vendorEmoji'];
                keys.forEach(k => sessionStorage.removeItem(k));
            }
        };

        // ── KUNCI sessionStorage yang digunakan ──
        // ff_mode              → 'customer' | 'vendor' (sebelumnya: let mode)
        // ff_vendorName        → nama vendor yang login (sebelumnya: let vendorName)
        // ff_vendorId          → id dokumen vendor (sebelumnya: let vendorId)
        // ff_sessionId         → id unik sesi customer (sebelumnya: let sessionId)
        // ff_currentOrder      → keranjang belanja aktif (sebelumnya: let currentOrder)
        // ff_myPlacedOrderIds  → daftar orderId yang sudah di-checkout (sebelumnya: let myPlacedOrderIds)
        // ff_myOrderStatusMap  → map orderId → status terakhir (sebelumnya: let myOrderStatusMap)
        // ff_trackerUnreadCount→ jumlah notif tracker belum dibaca (sebelumnya: let trackerUnreadCount)

        // ── GETTER / SETTER untuk state utama ──
        // Membaca dari sessionStorage (bukan dari variabel JS langsung)
        const getMode            = ()    => SS.get('ff_mode');
        const setMode            = v     => SS.set('ff_mode', v);
        const getVendorName      = ()    => SS.get('ff_vendorName');
        const setVendorName      = v     => SS.set('ff_vendorName', v);
        const getVendorId        = ()    => SS.get('ff_vendorId');
        const setVendorId        = v     => SS.set('ff_vendorId', v);
        const getSessionId       = ()    => SS.get('ff_sessionId');
        const setSessionId       = v     => SS.set('ff_sessionId', v);
        const getCurrentOrder    = ()    => SS.get('ff_currentOrder', { items: [], vendors: {} });
        const setCurrentOrder    = v     => SS.set('ff_currentOrder', v);
        const getPlacedOrderIds  = ()    => SS.get('ff_myPlacedOrderIds', []);
        const setPlacedOrderIds  = v     => SS.set('ff_myPlacedOrderIds', v);
        const getOrderStatusMap  = ()    => SS.get('ff_myOrderStatusMap', {});
        const setOrderStatusMap  = v     => SS.set('ff_myOrderStatusMap', v);
        const getTrackerUnread   = ()    => SS.get('ff_trackerUnreadCount', 0);
        const setTrackerUnread   = v     => SS.set('ff_trackerUnreadCount', v);

        // ── NON-STORAGE state (tidak perlu bertahan, reset tiap render) ──
        let unsubChat = null, unsubOrders = null, unsubTrackerOrders = null, inactivityTimer = null;
        let lastActivity = Date.now(), lastOrderCount = 0, unreadCount = 0, toastTimer = null;
        let editMenuId = null;
        // Vendor: tracking pesanan per-room saat di halaman room list
        let vendorOrderWatcher = null;
        let roomOrderCounts = {};
        let roomUnreadBadges = {};
        let roomListRefreshInterval = null; // auto-refresh daftar rooms

        const DEFAULT_VENDORS = [
            { nama: "Warung Bu Siti", emoji: "🍜", username: "busiti", password: "siti123" },
            { nama: "Kedai Kopi Mas Budi", emoji: "☕", username: "masbudi", password: "budi123" },
            { nama: "Dapur Mama Lina", emoji: "🍛", username: "mamalina", password: "lina123" },
            { nama: "Bakery Pak Amir", emoji: "🥐", username: "pakamir", password: "amir123" }
        ];
        const DEFAULT_MENUS = [
            { vendor: "Warung Bu Siti", nama: "Nasi Goreng Spesial", harga: 25000, deskripsi: "Nasi goreng dengan telur, ayam suwir, dan kerupuk", gambar: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500", kategori: "makanan", opsiVarian: ["Pedas", "Sedang", "Tidak Pedas"] },
            { vendor: "Warung Bu Siti", nama: "Mie Goreng Jawa", harga: 20000, deskripsi: "Mie goreng khas Jawa dengan bumbu rahasia", gambar: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500", kategori: "makanan", opsiVarian: ["Pedas", "Sedang"] },
            { vendor: "Kedai Kopi Mas Budi", nama: "Kopi Susu Gula Aren", harga: 18000, deskripsi: "Kopi susu dengan gula aren asli yang manis dan creamy", gambar: "https://images.unsplash.com/photo-1534687886635-f4f905e6e21f?w=500", kategori: "minuman", opsiVarian: ["Panas", "Dingin"] },
            { vendor: "Kedai Kopi Mas Budi", nama: "Es Teh Manis", harga: 8000, deskripsi: "Teh manis segar dengan es batu", gambar: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500", kategori: "minuman", opsiVarian: [] },
            { vendor: "Dapur Mama Lina", nama: "Ayam Geprek Sambal Matah", harga: 28000, deskripsi: "Ayam crispy geprek dengan sambal matah khas Bali", gambar: "https://images.unsplash.com/photo-1633964913295-ceb43826183c?w=500", kategori: "makanan", opsiVarian: ["Level 1", "Level 2", "Level 3", "Level 5"] },
            { vendor: "Dapur Mama Lina", nama: "Soto Ayam Kuning", harga: 22000, deskripsi: "Soto ayam kuning dengan telur, soun, dan emping", gambar: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500", kategori: "makanan", opsiVarian: [] },
            { vendor: "Bakery Pak Amir", nama: "Roti Croissant Butter", harga: 15000, deskripsi: "Croissant buttery yang renyah di luar, lembut di dalam", gambar: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500", kategori: "snack", opsiVarian: [] },
            { vendor: "Bakery Pak Amir", nama: "Donut Cokelat Premium", harga: 12000, deskripsi: "Donut lembut dengan topping cokelat premium", gambar: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500", kategori: "dessert", opsiVarian: ["Cokelat", "Strawberry", "Vanilla"] }
        ];

        const $ = id => document.getElementById(id);
        const chatlog = $('chatlog');
        const userInput = $('userInput');
        const chatContainer = $('chatContainer');
        const chatHeader = $('chatHeader');
        const headerTitle = $('headerTitle');
        const headerSub = $('headerSubtitle');
        const vendorActions = $('vendorActions');
        const customerActions = $('customerActions');

        // Firebase helpers removed — menggunakan MySQL API layer di atas

        // ── TAMPILKAN INDIKATOR STORAGE ──
        // Badge kecil yang muncul saat sesi aktif, sebagai bukti sessionStorage sedang digunakan
        function showStorageIndicator(active) {
            const el = $('storageIndicator');
            if (el) el.style.display = active ? 'block' : 'none';
        }

        function touch() {
            lastActivity = Date.now();
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(async () => {
                if (Date.now() - lastActivity >= 300000) await hapusChatLama();
            }, 300000);
        }

        // hapusChatLama & hapusSemuaChat → sudah di API layer

        // setupDefaults, getVendors, loginCheck, getMenuByVendor, searchMenu,
        // saveMenu, updateMenu, deleteMenu, saveOrder, listenOrders, listenMyOrders,
        // listenChat, sendMsg, hapusChatLama, hapusSemuaChat
        // → sudah didefinisikan di MySQL API Layer di atas

        function showToast(text, title = '🆕 New Order for You!', icon = '🛒', isOrder = false) {
            const toast = $('notifToast'), msgEl = $('toastMsg'), titleEl = $('toastTitle');
            if (!toast || !msgEl || !titleEl) return;
            titleEl.textContent = title;
            msgEl.textContent = text.length > 60 ? text.slice(0, 60) + '...' : text;
            toast.style.display = 'flex'; toast.getBoundingClientRect(); toast.classList.add('show');
            toast.querySelector('.toast-icon').textContent = icon;
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(tutupToast, isOrder ? 6000 : 4000);
            // Suara notif
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (isOrder) {
                    // Double beep untuk pesanan baru
                    [0, 0.25].forEach(delay => {
                        const osc = ctx.createOscillator(), gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
                        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + delay + 0.15);
                        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
                        osc.start(ctx.currentTime + delay);
                        osc.stop(ctx.currentTime + delay + 0.2);
                    });
                } else {
                    const osc = ctx.createOscillator(), gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.15, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start(); osc.stop(ctx.currentTime + 0.3);
                }
            } catch (e) { }
        }

        // ── VENDOR ORDER WATCHER — polling pesanan dari SEMUA room customer ──
        // Berjalan saat vendor login (baik di halaman room list maupun saat di dalam chat room)
        function startVendorOrderWatcher() {
            stopVendorOrderWatcher();
            const vendorName = getVendorName();
            if (!vendorName) return;

            async function poll() {
                if (getMode() !== 'vendor') return;
                try {
                    const rooms = await getActiveRooms();
                    const roomIds = rooms.map(r => r.roomId);

                    // Fetch pesanan terbaru untuk vendor ini
                    const orders = await getOrdersByVendor(vendorName);
                    // Kelompokkan per room
                    const countPerRoom = {};
                    for (const order of orders) {
                        // order.customerSession tapi kita butuh roomId → pakai prefix 'room_' + custSession
                        const rId = 'room_' + order.customerSession;
                        countPerRoom[rId] = (countPerRoom[rId] || 0) + 1;
                    }

                    let totalNewOrders = 0;
                    for (const rId of roomIds) {
                        const curr = countPerRoom[rId] || 0;
                        const prev = roomOrderCounts[rId];
                        if (prev !== undefined && curr > prev) {
                            const newCount = curr - prev;
                            totalNewOrders += newCount;
                            roomUnreadBadges[rId] = (roomUnreadBadges[rId] || 0) + newCount;
                        }
                        roomOrderCounts[rId] = curr;
                    }

                    if (totalNewOrders > 0) {
                        // Update badge di room list (jika sedang tampil)
                        updateRoomBadgesUI();
                        // Notif toast
                        showToast(
                            `Ada ${totalNewOrders} pesanan baru masuk!`,
                            '🛒 Pesanan Baru!',
                            '🛒',
                            true
                        );
                        browserNotif('🛒 Pesanan Baru!', `${totalNewOrders} pesanan baru untuk ${vendorName}`);
                        // Update badge di tombol "Rooms" jika vendor lagi di dalam chat room
                        updateRoomsButtonBadge();
                    }
                } catch (e) { /* silent */ }
                if (getMode() === 'vendor') {
                    vendorOrderWatcher = setTimeout(poll, 5000);
                }
            }
            poll();
        }

        function stopVendorOrderWatcher() {
            if (vendorOrderWatcher) { clearTimeout(vendorOrderWatcher); vendorOrderWatcher = null; }
        }

        function getTotalUnreadBadges() {
            return Object.values(roomUnreadBadges).reduce((a, b) => a + b, 0);
        }

        function updateRoomsButtonBadge() {
            const btn = $('backToRoomsBtn');
            if (!btn) return;
            const total = getTotalUnreadBadges();
            // Hapus badge lama
            const old = btn.querySelector('.rooms-btn-badge');
            if (old) old.remove();
            if (total > 0) {
                const badge = document.createElement('span');
                badge.className = 'rooms-btn-badge';
                badge.textContent = total > 99 ? '99+' : total;
                btn.appendChild(badge);
            }
        }

        function updateRoomBadgesUI() {
            // Update badge di kartu room jika halaman room list sedang tampil
            Object.entries(roomUnreadBadges).forEach(([rId, count]) => {
                const badgeEl = document.querySelector(`[data-room-badge="${rId}"]`);
                if (badgeEl) {
                    badgeEl.textContent = count > 99 ? '99+' : count;
                    badgeEl.style.display = count > 0 ? 'inline-flex' : 'none';
                }
            });
        }

        window.tutupToast = function () {
            const toast = $('notifToast');
            toast?.classList.remove('show');
            setTimeout(() => { if (toast) toast.style.display = 'none'; }, 350);
            if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        };

        function setBadge(n) {
            const b = $('notifBadge');
            if (!b) return;
            if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.style.display = 'inline-block'; }
            else b.style.display = 'none';
        }

        function setTrackerBadge(n) {
            const b = $('trackOrderBadge');
            if (!b) return;
            if (n > 0) { b.textContent = n > 99 ? '99+' : n; b.style.display = 'inline-block'; }
            else b.style.display = 'none';
        }

        function browserNotif(title, body) {
            if (Notification?.permission === 'granted') {
                try { new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/2250/2250206.png', tag: 'foodfinder', silent: true }); } catch (e) { }
            }
        }

        // ============================================================
        // CUSTOMER MODE — menggunakan sessionStorage untuk menyimpan sesi
        // ============================================================
        window.masukSebagaiCustomer = function () {
            // [STORAGE] Simpan mode ke sessionStorage (sebelumnya: mode = 'customer')
            setMode('customer');
            setVendorName(null);
            setVendorId(null);

            // [STORAGE] Buat sessionId unik & simpan ke sessionStorage (sebelumnya: sessionId = 'cust_...')
            const newSessionId = 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            setSessionId(newSessionId);

            // Set ROOM_ID unik untuk customer ini
            ROOM_ID = 'room_' + newSessionId;
            SS.set('ff_roomId', ROOM_ID);

            // [STORAGE] Reset data order di sessionStorage (sebelumnya: myPlacedOrderIds = [])
            setPlacedOrderIds([]);
            setOrderStatusMap({});
            setTrackerUnread(0);

            // Register room ini ke server agar vendor bisa lihat
            const custLabel = 'Customer #' + newSessionId.slice(-6);
            registerRoom(ROOM_ID, newSessionId, custLabel);
            // Heartbeat: update last_seen tiap 30 detik agar room tetap aktif
            const heartbeat = setInterval(() => {
                if (getMode() !== 'customer') { clearInterval(heartbeat); return; }
                registerRoom(ROOM_ID, newSessionId, custLabel);
            }, 30000);
            SS.set('ff_custLabel', custLabel);

            $('modeSelection').style.display = 'none';
            chatContainer.style.display = 'flex';
            headerTitle.textContent = '🍽️ FoodFinder Chat';
            headerSub.textContent = '👑 Buyers are King — Order anything!';
            chatHeader.classList.remove('vendor-mode');
            vendorActions.style.display = 'none';
            customerActions.style.display = 'flex';
            setTrackerBadge(0);
            showStorageIndicator(true); // tampilkan badge storage aktif
            mulaiChat();
            startCustomerOrderTracker();
        };

        window.tampilkanVendorLogin = function () {
            $('modeSelection').style.display = 'none';
            $('vendorLogin').style.display = 'block';
            $('loginError').style.display = 'none';
        };

        // ============================================================
        // VENDOR LOGIN — menyimpan info vendor ke sessionStorage
        // ============================================================
        window.loginVendor = async function () {
            const u = $('vendorUsername').value.trim(), p = $('vendorPassword').value.trim();
            const err = $('loginError');
            if (!u || !p) { err.textContent = 'Please enter both username and password'; err.style.display = 'block'; return; }
            const vendor = await loginCheck(u, p);
            if (vendor) {
                // [STORAGE] Simpan data vendor yang login ke sessionStorage
                setMode('vendor');
                setVendorName(vendor.nama);
                setVendorId(vendor.id);
                SS.set('ff_vendorEmoji', vendor.emoji);

                $('vendorLogin').style.display = 'none';
                if (Notification?.permission === 'default') Notification.requestPermission();
                showStorageIndicator(true);
                // Mulai watcher pesanan global (semua rooms)
                startVendorOrderWatcher();
                // Tampilkan halaman pilih room customer
                tampilkanRoomList();
            } else { err.textContent = 'Invalid username or password'; err.style.display = 'block'; }
        };

        window.tampilkanAdminPanel = function () {
            if (prompt('Enter admin password:') === ADMIN_PASS) {
                $('modeSelection').style.display = 'none';
                $('adminPanel').style.display = 'block';
                muatVendorListAdmin();
            } else alert('Invalid admin password!');
        };

        // ============================================================
        // VENDOR ROOM LIST — daftar customer rooms yang aktif
        // ============================================================
        async function tampilkanRoomList() {
            ['modeSelection','vendorLogin','adminPanel'].forEach(id => $(id).style.display = 'none');
            chatContainer.style.display = 'none';
            $('backToRoomsBtn').style.display = 'none';
            $('vendorRoomList').style.display = 'block';
            await muatRoomList();
            setTimeout(updateRoomBadgesUI, 100);
            // Auto-refresh daftar room tiap 10 detik (tampilkan customer baru)
            if (roomListRefreshInterval) clearInterval(roomListRefreshInterval);
            roomListRefreshInterval = setInterval(async () => {
                if ($('vendorRoomList').style.display !== 'none') {
                    await muatRoomList();
                    updateRoomBadgesUI();
                } else {
                    clearInterval(roomListRefreshInterval);
                }
            }, 10000);
        }

        function stopRoomListRefresh() {
            if (roomListRefreshInterval) { clearInterval(roomListRefreshInterval); roomListRefreshInterval = null; }
        }

        window.muatRoomList = async function() {
            const c = $('roomListContainer');
            c.innerHTML = '<p class="loading-txt">Memuat customer aktif...</p>';
            const rooms = await getActiveRooms();
            if (!rooms.length) {
                c.innerHTML = `<div class="room-empty"><div class="room-empty-icon">🪑</div><p>Belum ada customer yang aktif saat ini.<br>Tunggu customer masuk, lalu refresh.</p></div>`;
                return;
            }
            c.innerHTML = '';
            rooms.forEach(room => {
                const ago = Math.floor((Date.now() - Number(room.lastSeen)) / 1000);
                const agoText = ago < 60 ? `${ago}d yang lalu` : `${Math.floor(ago/60)}m yang lalu`;
                const unread = roomUnreadBadges[room.roomId] || 0;
                const el = document.createElement('div');
                el.className = 'room-card';
                el.innerHTML = `
                    <div class="room-info">
                        <h4><span class="room-active-dot"></span>${room.label}</h4>
                        <p>🕐 Aktif ${agoText}</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="room-order-badge" data-room-badge="${room.roomId}" style="display:${unread > 0 ? 'inline-flex' : 'none'}">${unread > 99 ? '99+' : unread}</span>
                        <button class="btn-enter-room" onclick="masukKeRoom('${room.roomId}','${room.label}','${room.custSession}')">Masuk →</button>
                    </div>`;
                c.appendChild(el);
            });
        };

        window.masukKeRoom = function(roomId, label, custSession) {
            ROOM_ID = roomId;
            const vendorName = getVendorName();
            const vendorEmoji = SS.get('ff_vendorEmoji') || '🏪';
            $('vendorRoomList').style.display = 'none';
            chatContainer.style.display = 'flex';
            headerTitle.textContent = `${vendorEmoji} ${vendorName}`;
            headerSub.textContent = `💬 Room: ${label}`;
            chatHeader.classList.add('vendor-mode');
            vendorActions.style.display = 'flex';
            customerActions.style.display = 'none';
            $('backToRoomsBtn').style.display = 'inline-block';
            // Reset badge room ini karena sudah dibuka
            roomUnreadBadges[roomId] = 0;
            updateRoomsButtonBadge();
            mulaiChat();
        };

        // ============================================================
        // LOGOUT / KEMBALI — bersihkan sessionStorage saat keluar
        // ============================================================
        window.kembaliKeMode = async function () {
            unsubChat?.(); unsubChat = null;
            unsubOrders?.(); unsubOrders = null;
            unsubTrackerOrders?.(); unsubTrackerOrders = null;
            stopVendorOrderWatcher();
            stopRoomListRefresh();
            if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
            // Jika customer, hapus room dari server
            if (getMode() === 'customer' && ROOM_ID !== 'global_foodfinder') {
                await leaveRoom(ROOM_ID);
            }
            await hapusSemuaChat();
            ['chatContainer', 'vendorLogin', 'adminPanel', 'vendorRoomList'].forEach(id => $(id).style.display = 'none');
            $('modeSelection').style.display = 'block';
            $('backToRoomsBtn').style.display = 'none';
            chatlog.innerHTML = '';

            // [STORAGE] Hapus semua data sesi dari sessionStorage saat logout
            // (sebelumnya: mode = vendorName = vendorId = sessionId = null; currentOrder = {...})
            SS.clear();

            lastOrderCount = 0; unreadCount = 0; roomOrderCounts = {}; roomUnreadBadges = {};
            $('vendorUsername').value = ''; $('vendorPassword').value = '';
            showStorageIndicator(false); // sembunyikan badge storage
        };

        async function muatVendorListAdmin() {
            const c = $('vendorListAdmin');
            c.innerHTML = '<p class="loading-txt">Loading vendors...</p>';
            const vendors = await getVendors();
            if (!vendors.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No vendors yet.</p></div>'; return; }
            c.innerHTML = '';
            vendors.forEach(v => {
                const el = document.createElement('div');
                el.className = 'vendor-item';
                el.innerHTML = `
                    <div><h4>${v.emoji} ${v.nama}</h4><p>@${v.username}</p></div>
                    <div style="display:flex;gap:8px">
                        <button class="btn-edit" onclick="bukaEditVendorModal('${v.id}')">✏️ Edit</button>
                        <button class="btn-delete" onclick="hapusVendorAdmin('${v.id}','${v.nama}')">🗑️ Delete</button>
                    </div>`;
                c.appendChild(el);
            });
        }

        $('addVendorForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const [errEl, okEl] = [$('adminError'), $('adminSuccess')];
            errEl.style.display = okEl.style.display = 'none';
            const nama = $('newVendorName').value.trim(), emoji = $('newVendorEmoji').value,
                username = $('newVendorUsername').value.trim(), password = $('newVendorPassword').value.trim();
            try {
                const r = await addVendorAdmin({ nama, emoji, username, password });
                if (!r.success) throw new Error(r.error || 'failed');
                okEl.textContent = `Vendor "${nama}" successfully added!`; okEl.style.display = 'block';
                this.reset(); await muatVendorListAdmin();
            } catch (e) { errEl.textContent = 'Failed to add vendor.'; errEl.style.display = 'block'; }
        });

        window.hapusVendorAdmin = async function (id, nama) {
            if (!confirm(`Delete vendor "${nama}"?`)) return;
            try { await deleteVendorAdmin(id); alert('Vendor deleted!'); await muatVendorListAdmin(); }
            catch (e) { alert('Failed to delete vendor.'); }
        };

        window.bukaEditVendorModal = async function (id) {
            const vendors = await getVendors();
            const v = vendors.find(x => x.id === id);
            if (!v) return;
            $('editVendorId').value = id; $('editVendorName').value = v.nama;
            $('editVendorEmoji').value = v.emoji; $('editVendorUsername').value = v.username;
            $('editVendorPassword').value = '';
            $('editVendorError').style.display = $('editVendorSuccess').style.display = 'none';
            $('editVendorModal').style.display = 'block';
        };

        $('editVendorForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const [errEl, okEl] = [$('editVendorError'), $('editVendorSuccess')];
            errEl.style.display = okEl.style.display = 'none';
            const id = $('editVendorId').value, nama = $('editVendorName').value.trim(),
                emoji = $('editVendorEmoji').value, username = $('editVendorUsername').value.trim(),
                pw = $('editVendorPassword').value.trim();
            const upd = { nama, emoji, username };
            if (pw) upd.password = pw;
            try {
                const r = await updateVendorAdmin(id, upd);
                if (!r.success) throw new Error(r.error || 'failed');
                okEl.textContent = `Vendor "${nama}" updated!`; okEl.style.display = 'block';
                await muatVendorListAdmin();
                setTimeout(() => tutupModal('editVendorModal'), 1500);
            } catch (e) { errEl.textContent = 'Failed to update vendor.'; errEl.style.display = 'block'; }
        });

        // ── CHAT ──
        function mulaiChat() {
            chatlog.innerHTML = ''; lastOrderCount = 0; unreadCount = 0; setBadge(0);
            const sys = document.createElement('div');
            sys.className = 'sys-msg';
            if (getMode() === 'customer') {
                sys.innerHTML = `👑 <strong>Welcome to FoodFinder — Buyers are King!</strong><br>`;
            } else {
                sys.textContent = `🔔 Welcome ${getVendorName()}! Orders addressed to you will appear here.`;
            }
            chatlog.appendChild(sys);
            unsubChat = listenChat(renderChat);
        }

        function renderChat(msgs) {
            const mode = getMode();
            const vendorName = getVendorName();
            const sessionId = getSessionId();

            const atBottom = chatlog.scrollHeight - chatlog.clientHeight <= chatlog.scrollTop + 1;
            const sysNodes = [...chatlog.querySelectorAll('.sys-msg')];
            // Simpan node lokal (order summary & pesan bot lokal) agar tidak hilang saat polling re-render
            const localNodes = [...chatlog.querySelectorAll('[data-local="true"]')];
            chatlog.innerHTML = '';
            sysNodes.forEach(n => chatlog.appendChild(n));

            msgs.forEach(msg => {
                if (mode === 'customer') {
                    if (msg.tipe === 'text' && msg.custSession === sessionId) {
                        appendTextMsg(msg.pengirim, msg.isi);
                    }
                    else if (msg.tipe === 'menu') {
                        appendMenuMsg(msg.pengirim, msg.menuData);
                    }
                    else if (msg.tipe === 'text' && !msg.custSession) {
                        appendTextMsg(msg.pengirim, msg.isi);
                    }
                    // order_customer tidak lagi disimpan ke DB — ditampilkan lokal langsung
                } else if (mode === 'vendor') {
                    if (msg.tipe === 'text' && msg.pengirim === 'Customer' && !msg.targetVendor)
                        appendTextMsg(msg.pengirim, msg.isi);
                    else if (msg.tipe === 'text' && msg.pengirim === vendorName)
                        appendTextMsg(msg.pengirim, msg.isi);
                    else if (msg.tipe === 'menu' && msg.pengirim === vendorName)
                        appendMenuMsg(msg.pengirim, msg.menuData);
                    else if (msg.tipe === 'vendor_order' && msg.targetVendor === vendorName)
                        appendVendorOrder(msg.orderData);
                }
            });

            if (mode === 'vendor') {
                const myOrders = msgs.filter(m => m.tipe === 'vendor_order' && m.targetVendor === vendorName).length;
                if (myOrders > lastOrderCount && lastOrderCount > 0) {
                    unreadCount += myOrders - lastOrderCount;
                    setBadge(unreadCount);
                    showToast('Pesanan baru masuk untuk Anda!', '🛒 Pesanan Baru!', '🛒', true);
                    browserNotif('🛒 Pesanan Baru!', 'Ada pesanan baru untuk Anda!');
                }
                lastOrderCount = myOrders;
            }

            // Re-insert pesan lokal (order summary dll) setelah pesan dari DB
            localNodes.forEach(n => chatlog.appendChild(n));

            if (atBottom) chatlog.scrollTop = chatlog.scrollHeight;
        }

        function makeMsg(isMe) {
            const wrap = document.createElement('div');
            wrap.className = `msg ${isMe ? 'from-me' : 'from-other'}`;
            const bubble = document.createElement('div');
            bubble.className = 'msg-bubble';
            const timeEl = document.createElement('div');
            timeEl.className = 'msg-time';
            timeEl.textContent = new Date().toLocaleTimeString('id-ID', TIME_FMT);
            bubble.appendChild(timeEl);
            wrap.appendChild(bubble);
            chatlog.appendChild(wrap);
            return { wrap, bubble };
        }

        function appendTextMsg(sender, text, isLocal = false) {
            const mode = getMode();
            const vendorName = getVendorName();
            const isMe = (mode === 'customer' && sender === 'Customer') || (mode === 'vendor' && sender === vendorName);
            const { wrap, bubble } = makeMsg(isMe);
            if (isLocal) wrap.setAttribute('data-local', 'true');
            const name = document.createElement('div');
            name.className = 'msg-name'; name.textContent = sender;
            wrap.insertBefore(name, bubble);
            const p = document.createElement('span');
            p.textContent = text;
            bubble.insertBefore(p, bubble.firstChild);
            chatlog.scrollTop = chatlog.scrollHeight;
        }

        function appendMenuMsg(sender, data) {
            if (!data) return;
            const { wrap, bubble } = makeMsg(false);
            const name = document.createElement('div');
            name.className = 'msg-name'; name.textContent = sender;
            wrap.insertBefore(name, bubble);
            const card = document.createElement('div');
            card.className = 'menu-card';
            card.innerHTML = `
                <img src="${data.gambar}" alt="${data.nama}">
                <div class="menu-card-body">
                    <h4>${data.nama}</h4>
                    <div class="price">Rp ${RUP(data.harga)}</div>
                    <div class="desc">${data.deskripsi}</div>
                    ${data.opsiVarian?.length ? `<div class="variants">Variants: ${data.opsiVarian.join(', ')}</div>` : ''}
                </div>`;
            bubble.insertBefore(card, bubble.firstChild);
            chatlog.scrollTop = chatlog.scrollHeight;
        }

        function appendOrderSummary(orderData) {
            const { wrap, bubble } = makeMsg(false);
            wrap.setAttribute('data-local', 'true'); // Jangan hapus saat polling re-render
            const name = document.createElement('div');
            name.className = 'msg-name'; name.textContent = '🤖 FoodFinder Bot';
            wrap.insertBefore(name, bubble);

            let html = '<div class="order-summary"><h4>📋 Your Order Summary</h4>';
            let total = 0;
            Object.entries(orderData.vendors).forEach(([vendor, items]) => {
                html += `<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #ddd">
                    <div style="font-weight:700;color:var(--burgundy);margin-bottom:8px">${vendor}</div>`;
                items.forEach(item => {
                    const sub = item.price * item.quantity; total += sub;
                    html += `<div class="order-row">
                        <div><div class="name">${item.quantity}× ${item.name}</div>${item.variant ? `<div class="variant">${item.variant}</div>` : ''}</div>
                        <div class="price">Rp ${RUP(sub)}</div>
                    </div>`;
                });
                html += '</div>';
            });
            html += `<div class="order-total"><span>Total:</span><span class="total-price">Rp ${RUP(total)}</span></div>
                <button class="btn-checkout" onclick="bukaCheckoutForm()">📋 Proceed to Checkout</button>
            </div>`;

            const container = document.createElement('div');
            container.innerHTML = html;
            bubble.insertBefore(container.firstChild, bubble.firstChild);
            chatlog.scrollTop = chatlog.scrollHeight;
        }

        function appendVendorOrder(data) {
            const { wrap, bubble } = makeMsg(false);
            const name = document.createElement('div');
            name.className = 'msg-name'; name.textContent = '🛒 New Order';
            wrap.insertBefore(name, bubble);

            const items = data.vendorItems || [];
            let total = 0, rowsHtml = '';
            items.forEach(item => {
                const sub = item.price * item.quantity; total += sub;
                rowsHtml += `<div class="von-row">
                    <div><div class="von-name">${item.quantity}× ${item.name}</div>${item.variant ? `<div class="von-variant">Variant: ${item.variant}</div>` : ''}</div>
                    <div class="von-price">Rp ${RUP(sub)}</div>
                </div>`;
            });

            const el = document.createElement('div');
            el.className = 'von';
            el.innerHTML = `
                <div class="von-header"><span class="von-badge">🆕 New Order</span><span class="von-title">Order for You</span></div>
                ${rowsHtml}
                <div class="von-total"><span>Total:</span><span>Rp ${RUP(total)}</span></div>
                <div class="von-note">📦 Check Orders Dashboard for customer details</div>`;
            bubble.insertBefore(el, bubble.firstChild);
            chatlog.scrollTop = chatlog.scrollHeight;
        }

        function appendStatusUpdateToChat(order, newStatus) {
            const statusConfig = {
                processing: {
                    icon: '🔄',
                    title: 'Pesanan Sedang Diproses!',
                    detail: `Order <strong>${order.orderId}</strong> sedang diproses oleh vendor. Harap tunggu ya!`,
                    cls: 'processing'
                },
                completed: {
                    icon: '✅',
                    title: 'Pesanan Selesai!',
                    detail: `Order <strong>${order.orderId}</strong> telah selesai. Selamat menikmati! 🎉`,
                    cls: ''
                },
                cancelled: {
                    icon: '❌',
                    title: 'Pesanan Dibatalkan',
                    detail: `Order <strong>${order.orderId}</strong> telah dibatalkan oleh vendor.`,
                    cls: 'cancelled'
                }
            };
            const cfg = statusConfig[newStatus];
            if (!cfg) return;

            const { wrap, bubble } = makeMsg(false);
            const name = document.createElement('div');
            name.className = 'msg-name'; name.textContent = '📦 Order Update';
            wrap.insertBefore(name, bubble);

            const el = document.createElement('div');
            el.className = `status-update-bubble ${cfg.cls}`;
            el.innerHTML = `
                <div class="status-update-header">
                    <span class="status-update-icon">${cfg.icon}</span>
                    <span class="status-update-title">${cfg.title}</span>
                </div>
                <div class="status-update-detail">${cfg.detail}</div>`;
            bubble.insertBefore(el, bubble.firstChild);
            chatlog.scrollTop = chatlog.scrollHeight;
        }

        // ============================================================
        // CUSTOMER ORDER TRACKER — membaca & menulis status dari sessionStorage
        // ============================================================
        function startCustomerOrderTracker() {
            unsubTrackerOrders?.();
            unsubTrackerOrders = listenMyOrders(orders => {
                // [STORAGE] Baca statusMap dari sessionStorage (sebelumnya: dari variabel myOrderStatusMap)
                const statusMap = getOrderStatusMap();
                let changed = false;

                orders.forEach(order => {
                    const prevStatus = statusMap[order.orderId];
                    const currStatus = order.status;
                    if (prevStatus && prevStatus !== currStatus) {
                        appendStatusUpdateToChat(order, currStatus);

                        // [STORAGE] Update counter unread di sessionStorage
                        const newUnread = getTrackerUnread() + 1;
                        setTrackerUnread(newUnread);
                        setTrackerBadge(newUnread);

                        const toastMap = {
                            processing: 'Pesanan kamu sedang diproses vendor!',
                            completed: 'Pesanan kamu sudah selesai! 🎉',
                            cancelled: 'Pesanan kamu dibatalkan.'
                        };
                        showToast(toastMap[currStatus] || `Status pesanan berubah ke ${currStatus}`, '📦 Update Pesanan!', '📦');
                    }
                    statusMap[order.orderId] = currStatus;
                    changed = true;
                });

                // [STORAGE] Simpan statusMap yang sudah diupdate kembali ke sessionStorage
                if (changed) setOrderStatusMap(statusMap);

                if ($('trackerModal').style.display === 'block') {
                    renderTrackerOrders(orders);
                }
            });
        }

        window.bukaTrackerPanel = function () {
            $('trackerModal').style.display = 'block';

            // [STORAGE] Reset counter unread di sessionStorage
            setTrackerUnread(0);
            setTrackerBadge(0);

            const c = $('trackerContainer');
            c.innerHTML = '<p class="loading-txt">Loading your orders...</p>';
            const sid = getSessionId(); // ← Baca dari sessionStorage
            getOrdersBySession(sid).then(myOrders => renderTrackerOrders(myOrders));
        };

        window.tutupTrackerPanel = function () { tutupModal('trackerModal'); };

        function renderTrackerOrders(orders) {
            const c = $('trackerContainer');
            if (!orders.length) {
                c.innerHTML = `<div class="tracker-empty">
                    <div class="tracker-empty-icon">🛒</div>
                    <p>Belum ada pesanan.<br>Mulai chat dan pesan makananmu!</p>
                </div>`;
                return;
            }

            const STATUS_STEPS = [
                { key: 'pending', label: 'Diterima', icon: '📥' },
                { key: 'processing', label: 'Diproses', icon: '🔄' },
                { key: 'completed', label: 'Selesai', icon: '✅' }
            ];

            const STATUS_LABELS = {
                pending: 'Menunggu',
                processing: 'Diproses',
                completed: 'Selesai',
                cancelled: 'Dibatalkan'
            };

            c.innerHTML = '';
            orders.forEach(order => {
                const card = document.createElement('div');
                card.className = `tracker-card ${order.status}`;

                let activeStep = 0;
                if (order.status === 'processing') activeStep = 1;
                if (order.status === 'completed') activeStep = 2;
                const isCancelled = order.status === 'cancelled';
                const progressPct = isCancelled ? 0 : (activeStep / (STATUS_STEPS.length - 1)) * 100;

                let stepperHtml = '';
                STATUS_STEPS.forEach((step, idx) => {
                    let circleCls = '', labelCls = '';
                    if (isCancelled) {
                        circleCls = idx === 0 ? 'cancelled-step' : '';
                        labelCls = idx === 0 ? 'cancelled-step' : '';
                    } else if (idx < activeStep) {
                        circleCls = 'done'; labelCls = 'done';
                    } else if (idx === activeStep) {
                        circleCls = 'active'; labelCls = 'active';
                    }
                    stepperHtml += `
                        <div class="tracker-step">
                            <div class="step-circle ${circleCls}">${step.icon}</div>
                            <div class="step-label ${labelCls}">${step.label}</div>
                        </div>`;
                });

                let vendorBlocks = '';
                let grandTotal = 0;
                Object.entries(order.vendors || {}).forEach(([vName, items]) => {
                    let rows = '';
                    items.forEach(item => {
                        const sub = item.price * item.quantity;
                        grandTotal += sub;
                        rows += `<div class="tracker-item-row">
                            <div>
                                <div class="tracker-item-name">${item.quantity}× ${item.name}</div>
                                ${item.variant ? `<div class="tracker-item-variant">${item.variant}</div>` : ''}
                            </div>
                            <div class="tracker-item-price">Rp ${RUP(sub)}</div>
                        </div>`;
                    });
                    vendorBlocks += `<div class="tracker-vendor-block">
                        <div class="tracker-vendor-name">🏪 ${vName}</div>
                        ${rows}
                    </div>`;
                });

                const tsStr = order.timestampNumber ? new Date(order.timestampNumber).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '';

                card.innerHTML = `
                    <div class="tracker-card-header">
                        <span class="tracker-order-id">${order.orderId}</span>
                        <span class="status-badge ${order.status}">${STATUS_LABELS[order.status] || order.status}</span>
                    </div>
                    ${!isCancelled ? `
                    <div style="position:relative">
                        <div class="tracker-stepper">${stepperHtml}</div>
                        <div class="tracker-progress-bar" style="width:calc(${progressPct}% - 32px)"></div>
                    </div>` : `
                    <div style="background:#ffebee;border-radius:10px;padding:12px;margin:10px 0;display:flex;align-items:center;gap:8px">
                        <span style="font-size:20px">❌</span>
                        <div>
                            <div style="font-weight:700;color:#c62828;font-size:13px">Pesanan Dibatalkan</div>
                            <div style="font-size:11px;color:#e57373">Pesanan ini telah dibatalkan oleh vendor</div>
                        </div>
                    </div>`}
                    ${vendorBlocks}
                    <div class="tracker-total">
                        <span>Grand Total</span>
                        <span class="tracker-total-price">Rp ${RUP(grandTotal)}</span>
                    </div>
                    <div style="margin-top:10px;padding:10px;background:var(--g-light);border-radius:8px;font-size:12px">
                        <div style="color:var(--g-dark);margin-bottom:4px">📍 <strong>Alamat:</strong> ${order.customerAddress || '-'}</div>
                        <div style="color:var(--g-dark)">📞 <strong>No. HP:</strong> ${order.customerPhone || '-'}</div>
                        ${order.customerNotes ? `<div style="color:var(--g-dark);margin-top:4px">📝 <strong>Catatan:</strong> ${order.customerNotes}</div>` : ''}
                    </div>
                    ${tsStr ? `<div class="tracker-timestamp">Dipesan: ${tsStr}</div>` : ''}
                `;
                c.appendChild(card);
            });
        }

        // ── SEND MESSAGE ──
        window.kirimPesan = async function () {
            const text = userInput.value.trim(); if (!text) return;
            userInput.value = '';
            const mode = getMode();
            const vendorName = getVendorName();
            const sender = mode === 'customer' ? 'Customer' : vendorName;
            appendTextMsg(sender, text);
            await sendMsg(sender, 'text', text, null, null, null, mode === 'customer' ? getSessionId() : null);
            if (mode !== 'customer') return;

            const lower = text.toLowerCase();

            if (detectCancel(text)) {
                setTimeout(() => cancelCurrentOrder(text), 400);
                return;
            }

            const searchWords = ['cari', 'cariin', 'ada', 'punya', 'mau', 'pengen', 'ingin', 'butuh', 'menu', 'lihat', 'tampil', 'tampilkan', 'tunjukkan', 'search', 'find', 'want', 'show'];
            const isSearch = searchWords.some(w => lower.includes(w));
            const isOrder = await detectOrder(text);

            if (isOrder) { setTimeout(() => processOrder(text), 800); }
            else if (isSearch) { setTimeout(() => handleSearch(text), 800); }
        };

        async function handleSearch(text) {
            const strip = ['cari', 'cariin', 'ada', 'adakah', 'punya', 'mau', 'pengen', 'ingin', 'butuh', 'dong', 'menu', 'lihat', 'tampil', 'tampilkan', 'tunjukkan', 'search', 'find', 'want', 'show', 'yang', 'the', 'a', 'an'];
            let kw = text;
            strip.forEach(w => { kw = kw.replace(new RegExp(`\\b${w}\\b`, 'gi'), '').trim(); });
            kw = kw.replace(/\s+/g, ' ').trim();

            const results = await searchMenu(kw);
            if (results.length > 0) {
                const max = 5;
                appendTextMsg('🤖 FoodFinder Bot', `Ditemukan ${results.length} menu${kw ? ` untuk "${kw}"` : ''}${results.length > max ? `, menampilkan ${max} teratas` : ''}:`);
                setTimeout(() => results.slice(0, max).forEach((m, i) => setTimeout(() => appendMenuMsg(m.vendor, m), i * 400)), 600);
            }
        }

        const CANCEL_KEYWORDS = ['hapus', 'cancel', 'batal', 'batalkan', 'hapus pesanan', 'cancel order', 'remove'];

        function detectCancel(text) {
            const lower = text.toLowerCase().trim();
            return CANCEL_KEYWORDS.some(kw => lower.includes(kw));
        }

        async function cancelCurrentOrder(text) {
            const lower = text.toLowerCase();
            let cancelTarget = null;
            const allMenus = await searchMenu('');
            for (const menu of allMenus) {
                const tokens = menu.nama.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                if (tokens.some(t => lower.includes(t))) {
                    cancelTarget = menu.nama;
                    break;
                }
            }

            const sid = getSessionId(); // ← Baca dari sessionStorage
            await hapusChatOrderCustomer(sid);

            // [STORAGE] Reset keranjang di sessionStorage
            setCurrentOrder({ items: [], vendors: {} });

            const msg = cancelTarget
                ? `Pesanan "${cancelTarget}" telah dihapus dari ringkasan. Silakan pesan ulang jika ingin.`
                : `Semua pesanan telah dibatalkan. Silakan pesan ulang jika ingin.`;
            setTimeout(() => appendTextMsg('🤖 FoodFinder Bot', msg), 400);
        }

        async function detectOrder(text) {
            if (!/\d+/.test(text)) return false;
            const lower = text.toLowerCase();
            const allMenus = await searchMenu('');
            for (const menu of allMenus) {
                const nameTokens = menu.nama.toLowerCase().split(/\s+/);
                const hasMatch = nameTokens.some(t => t.length > 2 && lower.includes(t));
                if (hasMatch) return true;
            }
            return false;
        }

        async function processOrder(text) {
            const allMenus = await searchMenu('');
            const lower = text.toLowerCase();

            const scored = allMenus.map(menu => {
                const nameTokens = menu.nama.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                const matchCount = nameTokens.filter(token => lower.includes(token)).length;
                const score = nameTokens.length > 0 ? matchCount / nameTokens.length : 0;
                return { menu, score, matchCount };
            })
            .filter(x => x.matchCount > 0)
            .sort((a, b) => b.score - a.score);

            if (!scored.length) {
                setTimeout(() => appendTextMsg('🤖 FoodFinder Bot', `Maaf, tidak bisa mengenali pesanan.\n\nContoh: "es teh 2" atau "nasi goreng pedas 1 sedang 2"`), 600);
                return;
            }

            const picked = [];
            const usedTokens = new Set();
            for (const { menu, score } of scored) {
                if (score < 0.4) continue;
                const nameTokens = menu.nama.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                const coreToken = nameTokens[0];
                if (usedTokens.has(coreToken)) continue;
                nameTokens.forEach(t => usedTokens.add(t));
                picked.push(menu);
            }

            if (!picked.length) {
                setTimeout(() => appendTextMsg('🤖 FoodFinder Bot', `Maaf, pesanan tidak dikenali dengan jelas.\n\nContoh: "es teh 2" atau "nasi goreng pedas 1 sedang 2"`), 600);
                return;
            }

            const words = lower.split(/\s+/);
            const found = [];

            for (const menu of picked) {
                const menuNameTokens = new Set(menu.nama.toLowerCase().split(/\s+/));
                const menuVariants = menu.opsiVarian || [];
                const vMatches = [], vQtys = [];

                for (const v of menuVariants) {
                    const vWords = v.toLowerCase().split(/\s+/);
                    const variantOnlyWords = vWords.filter(vw => !menuNameTokens.has(vw));
                    if (variantOnlyWords.length === 0) continue;
                    const allMatch = variantOnlyWords.every(vw => words.some(w => w === vw));
                    if (!allMatch) continue;
                    const firstMatchIdx = words.findIndex(w => variantOnlyWords.includes(w));
                    let qty = 1;
                    for (let bi = Math.max(0, firstMatchIdx - 3); bi < firstMatchIdx; bi++) {
                        const q = parseInt(words[bi]);
                        if (!isNaN(q) && q > 0) { qty = q; break; }
                    }
                    vMatches.push(v);
                    vQtys.push(qty);
                }

                if (vMatches.length) {
                    vMatches.forEach((v, i) => found.push({ menu, variant: v, quantity: vQtys[i] }));
                } else {
                    const nums = text.match(/\d+/g) || ['1'];
                    found.push({ menu, variant: '', quantity: parseInt(nums[0]) });
                }
            }

            // [STORAGE] Akumulasi item ke order yang sudah ada (bukan replace)
            const existingOrder = getCurrentOrder();
            const mergedOrder = { items: [...(existingOrder.items || [])], vendors: { ...existingOrder.vendors } };
            for (const { menu, variant, quantity } of found) {
                const v = menu.vendor;
                if (!mergedOrder.vendors[v]) mergedOrder.vendors[v] = [];
                // Cek apakah item + variant sudah ada → update quantity
                const idx = mergedOrder.vendors[v].findIndex(i => i.name === menu.nama && i.variant === variant);
                if (idx >= 0) {
                    mergedOrder.vendors[v][idx].quantity += quantity;
                    const itemsIdx = mergedOrder.items.findIndex(i => i.vendor === v && i.name === menu.nama && i.variant === variant);
                    if (itemsIdx >= 0) mergedOrder.items[itemsIdx].quantity += quantity;
                } else {
                    const item = { name: menu.nama, price: menu.harga, quantity, variant, description: menu.deskripsi };
                    mergedOrder.vendors[v].push(item);
                    mergedOrder.items.push({ vendor: v, ...item });
                }
            }
            setCurrentOrder(mergedOrder); // ← Simpan keranjang terakumulasi ke sessionStorage

            const sid = getSessionId();

            // Tampilkan ringkasan lokal (tidak disimpan ke DB agar tidak hilang saat polling)
            setTimeout(() => {
                appendTextMsg('🤖 FoodFinder Bot', 'Pesanan ditambahkan! Berikut ringkasan terkini:', true);
                setTimeout(() => appendOrderSummary(mergedOrder), 300);
            }, 600);

            // Kirim notif ke vendor lewat DB
            setTimeout(async () => {
                for (const [vName, items] of Object.entries(mergedOrder.vendors)) {
                    const newItems = found.filter(f => f.menu.vendor === vName).map(f => ({
                        name: f.menu.nama, price: f.menu.harga, quantity: f.quantity, variant: f.variant
                    }));
                    if (newItems.length > 0) {
                        await sendMsg('🤖 FoodFinder Bot', 'vendor_order', `New order for ${vName}`, null, vName, {
                            vendorName: vName, vendorItems: newItems, orderedAt: new Date().toISOString()
                        });
                    }
                }
            }, 1200);
        }

        // ── CHECKOUT ──
        window.bukaCheckoutForm = function () { $('checkoutModal').style.display = 'block'; $('checkoutForm').reset(); };
        $('checkoutForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const currentOrder = getCurrentOrder(); // ← Baca dari sessionStorage
            const orderId = await saveOrder(currentOrder, {
                name: $('customerName').value.trim(), phone: $('customerPhone').value.trim(),
                address: $('customerAddress').value.trim(), notes: $('customerNotes').value.trim()
            });
            if (orderId) {
                tutupModal('checkoutModal');

                // [STORAGE] Tambahkan orderId baru ke list di sessionStorage
                const ids = getPlacedOrderIds();
                ids.push(orderId);
                setPlacedOrderIds(ids);

                // [STORAGE] Daftarkan status awal order ke sessionStorage
                const statusMap = getOrderStatusMap();
                statusMap[orderId] = 'pending';
                setOrderStatusMap(statusMap);

                toast('✅ Order placed! ID: ' + orderId);
                setTimeout(() => appendTextMsg('🤖 FoodFinder Bot', `Terima kasih! Pesanan (${orderId}) sedang diproses vendor. Pantau pesananmu di tombol 📦 My Orders!`), 500);

                // [STORAGE] Reset keranjang di sessionStorage setelah checkout
                setCurrentOrder({ items: [], vendors: {} });
                // Hapus ringkasan order lokal dari chat
                document.querySelectorAll('[data-local="true"]').forEach(n => n.remove());
            } else toast('❌ Failed to place order.');
        });

        // ── VENDOR MENU MANAGEMENT ──
        window.bukaManagementPanel = async function () { $('managementModal').style.display = 'block'; await muatMenuVendor(); };

        async function muatMenuVendor() {
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            const c = $('menuListContainer');
            c.innerHTML = '<p class="loading-txt">Loading menu...</p>';
            const list = await getMenuByVendor(vendorName);
            if (!list.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No menu items yet.</p></div>'; return; }
            c.innerHTML = '';
            list.forEach(m => {
                const el = document.createElement('div');
                el.className = 'menu-mgmt-card';
                el.innerHTML = `
                    <img src="${m.gambar}" alt="${m.nama}">
                    <div class="menu-mgmt-info">
                        <h5>${m.nama}</h5>
                        <div class="price">Rp ${RUP(m.harga)}</div>
                        <div class="desc">${m.deskripsi}</div>
                        <div class="variants">${m.opsiVarian?.length ? 'Variants: ' + m.opsiVarian.join(', ') : 'No variants'}</div>
                    </div>
                    <div class="menu-actions">
                        <button style="background:var(--gold);color:#fff" onclick="bukaFormMenu('${m.id}')">✏️ Edit</button>
                        <button style="background:var(--burgundy);color:#fff" onclick="hapusMenu('${m.id}','${m.nama}')">🗑️ Del</button>
                    </div>`;
                c.appendChild(el);
            });
        }

        window.bukaFormMenu = async function (menuId) {
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            editMenuId = menuId;
            $('formTitle').textContent = menuId ? '✏️ Edit Menu' : '➕ Add New Menu';
            $('menuForm').reset();
            resetOpsiContainer();
            if (menuId) {
                const list = await getMenuByVendor(vendorName);
                const m = list.find(x => x.id === menuId);
                if (m) {
                    $('namaMenu').value = m.nama; $('kategoriMenu').value = m.kategori;
                    $('hargaMenu').value = m.harga; $('deskripsiMenu').value = m.deskripsi; $('gambarMenu').value = m.gambar;
                    const c = $('opsiContainer'); c.innerHTML = '';
                    (m.opsiVarian?.length ? m.opsiVarian : ['']).forEach((v, i) => {
                        const row = document.createElement('div'); row.className = 'option-row';
                        row.innerHTML = `<input type="text" class="opsi-input" value="${v}" placeholder="e.g., Spicy">
                            <button type="button" class="btn-rm-opt" onclick="hapusOpsi(this)" ${i === 0 ? 'style="display:none"' : ''}>✕</button>`;
                        c.appendChild(row);
                    });
                }
            }
            $('menuFormModal').style.display = 'block';
        };

        function resetOpsiContainer() {
            $('opsiContainer').innerHTML = `<div class="option-row"><input type="text" class="opsi-input" placeholder="e.g., Spicy"><button type="button" class="btn-rm-opt" onclick="hapusOpsi(this)" style="display:none">✕</button></div>`;
        }

        window.tambahInputOpsi = function () {
            const row = document.createElement('div'); row.className = 'option-row';
            row.innerHTML = `<input type="text" class="opsi-input" placeholder="e.g., Spicy"><button type="button" class="btn-rm-opt" onclick="hapusOpsi(this)">✕</button>`;
            $('opsiContainer').appendChild(row);
        };
        window.hapusOpsi = btn => btn.parentElement.remove();

        $('menuForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            const opsiVarian = [...document.querySelectorAll('.opsi-input')].map(i => i.value.trim()).filter(Boolean);
            const data = {
                nama: $('namaMenu').value, harga: Number($('hargaMenu').value),
                deskripsi: $('deskripsiMenu').value, gambar: $('gambarMenu').value,
                kategori: $('kategoriMenu').value, opsiVarian
            };
            if (editMenuId) { await updateMenu(editMenuId, data); alert('Menu updated!'); }
            else { await saveMenu(vendorName, data); alert('Menu added!'); }
            editMenuId = null;
            tutupModal('menuFormModal');
            await muatMenuVendor();
        });

        window.hapusMenu = async function (id, nama) {
            if (!confirm(`Delete "${nama}"?`)) return;
            await deleteMenu(id); alert('Menu deleted!'); await muatMenuVendor();
        };

        // ── SHOW MENU TO CUSTOMERS ──
        window.bukaShowMenuModal = async function () {
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            $('showMenuModal').style.display = 'block';
            const c = $('showMenuListContainer');
            c.innerHTML = '<p class="loading-txt">Loading...</p>';
            const list = await getMenuByVendor(vendorName);
            if (!list.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No menu yet.</p></div>'; return; }
            c.innerHTML = '';
            list.forEach(m => {
                const el = document.createElement('div'); el.className = 'show-menu-pick';
                el.onclick = async () => {
                    await sendMsg(vendorName, 'menu', 'Menu offer', m);
                    tutupModal('showMenuModal');
                    alert(`"${m.nama}" displayed to customers!`);
                };
                el.innerHTML = `<img src="${m.gambar}" alt="${m.nama}"><div><h5>${m.nama}</h5><div class="price">Rp ${RUP(m.harga)}</div></div>`;
                c.appendChild(el);
            });
        };

        // ── VENDOR ORDERS DASHBOARD ──
        window.bukaOrdersPanel = function () {
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            $('ordersModal').style.display = 'block';
            unsubOrders?.();
            unsubOrders = listenOrders(vendorName, renderOrders);
        };
        window.tutupOrdersPanel = function () {
            tutupModal('ordersModal');
            unsubOrders?.(); unsubOrders = null;
        };

        function renderOrders(orders) {
            const vendorName = getVendorName(); // ← Baca dari sessionStorage
            const c = $('ordersContainer');
            if (!orders.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No orders yet.</p></div>'; return; }
            const STATUS = { pending: 'Pending', processing: 'Processing', completed: 'Completed', cancelled: 'Cancelled' };
            c.innerHTML = '';
            orders.forEach(order => {
                const items = order.vendors[vendorName]; if (!items) return;
                let rowsHtml = '', total = 0;
                items.forEach(item => {
                    const sub = item.price * item.quantity; total += sub;
                    rowsHtml += `<div class="order-row">
                        <div><div class="name">${item.quantity}× ${item.name}</div>${item.variant ? `<div class="variant">${item.variant}</div>` : ''}</div>
                        <div class="price">Rp ${RUP(sub)}</div></div>`;
                });
                const el = document.createElement('div');
                el.className = `order-card ${order.status}`;
                el.innerHTML = `
                    <div class="order-card-header"><span class="order-id-label">${order.orderId}</span><span class="status-badge ${order.status}">${STATUS[order.status]}</span></div>
                    <div class="customer-info"><h5>Customer Info</h5>
                        <p><strong>Name:</strong> ${order.customerName}</p>
                        <p><strong>Phone:</strong> ${order.customerPhone}</p>
                        <p><strong>Address:</strong> ${order.customerAddress}</p>
                        ${order.customerNotes ? `<p><strong>Notes:</strong> ${order.customerNotes}</p>` : ''}
                    </div>
                    <div>${rowsHtml}</div>
                    <div class="order-total" style="margin-top:10px;padding-top:10px;border-top:2px solid var(--g-mid)"><span>Total:</span><span class="total-price">Rp ${RUP(total)}</span></div>
                    <div class="order-actions">
                        ${order.status === 'pending' ? `<button class="order-act-btn btn-process" onclick="ubahStatus('${order.id}','processing')">Process</button><button class="order-act-btn btn-cancel-order" onclick="ubahStatus('${order.id}','cancelled')">Cancel</button>` : ''}
                        ${order.status === 'processing' ? `<button class="order-act-btn btn-complete" onclick="ubahStatus('${order.id}','completed')">Complete</button>` : ''}
                    </div>`;
                c.appendChild(el);
            });
        }

        window.ubahStatus = async function (id, status) {
            const labels = { processing: 'process', completed: 'complete', cancelled: 'cancel' };
            if (!confirm(`${labels[status]} this order?`)) return;
            try { await updateOrderStatus(id, status); toast(`✅ Order ${labels[status]}d!`); }
            catch (e) { toast('❌ Failed to update order.'); }
        };

        window.tutupModal = id => $(id).style.display = 'none';

        function toast(msg) {
            const n = document.createElement('div');
            n.style.cssText = `position:fixed;top:20px;right:20px;background:linear-gradient(135deg,var(--gold),var(--gold-dark));color:#fff;padding:16px 24px;border-radius:12px;box-shadow:var(--s2);z-index:10000;font-weight:600;max-width:300px;opacity:1;transition:opacity .3s`;
            n.textContent = msg; document.body.appendChild(n);
            setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 300); }, 3000);
        }

        window.onclick = e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
        userInput.addEventListener('keypress', e => { if (e.key === 'Enter') kirimPesan(); });
        userInput.addEventListener('input', touch);

        window.addEventListener('load', setupDefaults);
