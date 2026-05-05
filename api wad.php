<?php
// ============================================================
// FoodFinder — Backend API (api.php)
// Letakkan file ini satu folder dengan index2_mysql.html
// ============================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── KONFIGURASI DATABASE ── ganti sesuai server kamu ──
define('DB_HOST', 'sql104.infinityfree.com');
define('DB_USER', 'if0_41832729');
define('DB_PASS', 'bonaaldofahri15');          // ganti dengan password MySQL kamu
define('DB_NAME', 'if0_41832729_foodfinder');
define('DB_PORT', 3306);

// ============================================================
// KONEKSI
// ============================================================
function getDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    } catch (PDOException $e) {
        jsonError('Database connection failed: ' . $e->getMessage(), 500);
    }
    return $pdo;
}

// ============================================================
// HELPERS
// ============================================================
function jsonOk(array $data = []): void {
    echo json_encode(array_merge(['success' => true], $data));
    exit;
}

function jsonError(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

function getInput(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// Parse JSON string dari kolom chat_rooms
function parseJsonField($val): mixed {
    if (is_null($val)) return null;
    $decoded = json_decode($val, true);
    return (json_last_error() === JSON_ERROR_NONE) ? $decoded : $val;
}

// ============================================================
// ROUTER
// ============================================================
$input  = getInput();
$action = $input['action'] ?? '';

match ($action) {
    'loginCheck'           => actionLoginCheck($input),
    'getVendors'           => actionGetVendors(),
    'addVendor'            => actionAddVendor($input),
    'deleteVendor'         => actionDeleteVendor($input),
    'updateVendor'         => actionUpdateVendor($input),
    'getMenuByVendor'      => actionGetMenuByVendor($input),
    'searchMenu'           => actionSearchMenu($input),
    'saveMenu'             => actionSaveMenu($input),
    'updateMenu'           => actionUpdateMenu($input),
    'deleteMenu'           => actionDeleteMenu($input),
    'saveOrder'            => actionSaveOrder($input),
    'updateOrderStatus'    => actionUpdateOrderStatus($input),
    'getOrdersByVendor'    => actionGetOrdersByVendor($input),
    'getOrdersBySession'   => actionGetOrdersBySession($input),
    'sendMsg'              => actionSendMsg($input),
    'getChat'              => actionGetChat($input),
    'hapusChatLama'        => actionHapusChatLama($input),
    'hapusSemuaChat'       => actionHapusSemuaChat($input),
    'hapusChatOrderCustomer' => actionHapusChatOrderCustomer($input),
    'registerRoom'         => actionRegisterRoom($input),
    'getActiveRooms'       => actionGetActiveRooms(),
    'leaveRoom'            => actionLeaveRoom($input),
    'setupDefaults'        => actionSetupDefaults(),
    default                => jsonError("Unknown action: $action")
};

// ============================================================
// ACTION HANDLERS
// ============================================================

// ── AUTH ──
function actionLoginCheck(array $in): void {
    $db = getDB();
    $stmt = $db->prepare("SELECT id, nama, emoji, username FROM vendor_credentials WHERE username = ? AND password = ?");
    $stmt->execute([$in['username'] ?? '', $in['password'] ?? '']);
    $vendor = $stmt->fetch();
    if ($vendor) jsonOk(['vendor' => $vendor]);
    else jsonOk(['vendor' => null]);
}

// ── VENDORS ──
function actionGetVendors(): void {
    $db = getDB();
    $rows = $db->query("SELECT id, nama, emoji, username FROM vendor_credentials ORDER BY id")->fetchAll();
    jsonOk(['vendors' => $rows]);
}

function actionAddVendor(array $in): void {
    $db = getDB();
    try {
        $stmt = $db->prepare("INSERT INTO vendor_credentials (nama, emoji, username, password) VALUES (?, ?, ?, ?)");
        $stmt->execute([$in['nama'] ?? '', $in['emoji'] ?? '🍽️', $in['username'] ?? '', $in['password'] ?? '']);
        jsonOk(['id' => $db->lastInsertId()]);
    } catch (PDOException $e) {
        jsonError('Vendor already exists or invalid data: ' . $e->getMessage());
    }
}

function actionDeleteVendor(array $in): void {
    $db = getDB();
    $stmt = $db->prepare("DELETE FROM vendor_credentials WHERE id = ?");
    $stmt->execute([$in['id'] ?? 0]);
    jsonOk();
}

function actionUpdateVendor(array $in): void {
    $db = getDB();
    $id = $in['id'] ?? 0;
    $sets = ["nama = ?", "emoji = ?", "username = ?"];
    $vals = [$in['nama'] ?? '', $in['emoji'] ?? '', $in['username'] ?? ''];
    if (!empty($in['password'])) { $sets[] = "password = ?"; $vals[] = $in['password']; }
    $vals[] = $id;
    $stmt = $db->prepare("UPDATE vendor_credentials SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($vals);
    jsonOk();
}

// ── MENU ──
function fetchMenuWithVariants(PDO $db, string $whereSql, array $params): array {
    $stmt = $db->prepare("
        SELECT m.id, m.vendor_id, m.vendor, m.nama, m.harga, m.deskripsi, m.gambar, m.kategori,
               GROUP_CONCAT(v.varian ORDER BY v.urutan SEPARATOR '|||') AS varianRaw
        FROM menu_database m
        LEFT JOIN menu_variants v ON m.id = v.menu_id
        WHERE $whereSql
        GROUP BY m.id
        ORDER BY m.id
    ");
    $stmt->execute($params);
    return array_map(function($row) {
        $row['opsiVarian'] = $row['varianRaw'] ? explode('|||', $row['varianRaw']) : [];
        unset($row['varianRaw']);
        return $row;
    }, $stmt->fetchAll());
}

function actionGetMenuByVendor(array $in): void {
    $menus = fetchMenuWithVariants(getDB(), "m.vendor = ?", [$in['vendor'] ?? '']);
    jsonOk(['menus' => $menus]);
}

function actionSearchMenu(array $in): void {
    $kw = trim($in['keyword'] ?? '');
    $db = getDB();
    if ($kw === '') {
        $menus = fetchMenuWithVariants($db, "1=1", []);
        jsonOk(['menus' => $menus]);
        return;
    }
    // FULLTEXT search + fallback LIKE untuk keyword pendek
    try {
        $menus = fetchMenuWithVariants($db,
            "MATCH(m.nama, m.deskripsi, m.kategori) AGAINST (? IN BOOLEAN MODE)",
            [$kw . '*']
        );
    } catch (\Exception $e) {
        $like = "%$kw%";
        $menus = fetchMenuWithVariants($db,
            "m.nama LIKE ? OR m.deskripsi LIKE ? OR m.kategori LIKE ? OR m.vendor LIKE ?",
            [$like, $like, $like, $like]
        );
    }
    // Sort: nama persis dulu, nama mulai dengan keyword, lainnya
    usort($menus, function($a, $b) use ($kw) {
        $an = strtolower($a['nama']); $bn = strtolower($b['nama']); $lk = strtolower($kw);
        if ($an === $lk) return -1; if ($bn === $lk) return 1;
        if (str_starts_with($an, $lk)) return -1; if (str_starts_with($bn, $lk)) return 1;
        return 0;
    });
    jsonOk(['menus' => $menus]);
}

function actionSaveMenu(array $in): void {
    $db = getDB();
    // Cari vendor_id
    $stmt = $db->prepare("SELECT id FROM vendor_credentials WHERE nama = ?");
    $stmt->execute([$in['vendor'] ?? '']);
    $row = $stmt->fetch();
    $vendorId = $row ? $row['id'] : null;

    $ins = $db->prepare("INSERT INTO menu_database (vendor_id, vendor, nama, harga, deskripsi, gambar, kategori) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $ins->execute([$vendorId, $in['vendor'] ?? '', $in['nama'] ?? '', $in['harga'] ?? 0, $in['deskripsi'] ?? '', $in['gambar'] ?? '', $in['kategori'] ?? 'lainnya']);
    $menuId = $db->lastInsertId();

    saveVariants($db, (int)$menuId, $in['opsiVarian'] ?? []);
    jsonOk(['id' => $menuId]);
}

function actionUpdateMenu(array $in): void {
    $db = getDB();
    $stmt = $db->prepare("UPDATE menu_database SET nama = ?, harga = ?, deskripsi = ?, gambar = ?, kategori = ? WHERE id = ?");
    $stmt->execute([$in['nama'] ?? '', $in['harga'] ?? 0, $in['deskripsi'] ?? '', $in['gambar'] ?? '', $in['kategori'] ?? 'lainnya', $in['id']]);

    // Update varian: hapus dulu lalu insert ulang
    $db->prepare("DELETE FROM menu_variants WHERE menu_id = ?")->execute([$in['id']]);
    saveVariants($db, (int)$in['id'], $in['opsiVarian'] ?? []);
    jsonOk();
}

function saveVariants(PDO $db, int $menuId, array $variants): void {
    $stmt = $db->prepare("INSERT INTO menu_variants (menu_id, varian, urutan) VALUES (?, ?, ?)");
    foreach ($variants as $i => $v) {
        if (trim((string)$v) !== '') $stmt->execute([$menuId, $v, $i]);
    }
}

function actionDeleteMenu(array $in): void {
    $db = getDB();
    $db->prepare("DELETE FROM menu_database WHERE id = ?")->execute([$in['id'] ?? 0]);
    jsonOk();
}

// ── ORDERS ──
function actionSaveOrder(array $in): void {
    $db  = getDB();
    $od  = $in['orderData'] ?? [];
    $cd  = $in['custData'] ?? [];

    // Kalau orderData datang sebagai JSON string (double-encoded), decode dulu
    if (is_string($od)) {
        $od = json_decode($od, true) ?? [];
    }

    $stmt = $db->prepare("
        INSERT INTO orders (order_id, status, customer_name, customer_phone, customer_address, customer_notes, customer_session, timestamp_number)
        VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $in['orderId'] ?? ('ORD-' . time()),
        $cd['name'] ?? '', $cd['phone'] ?? '',
        $cd['address'] ?? '', $cd['notes'] ?? '',
        $in['customerSession'] ?? '',
        time() * 1000
    ]);
    $orderId = $db->lastInsertId();

    // Insert order_items dari vendors map
    $vendors = $od['vendors'] ?? [];
    $itemStmt = $db->prepare("INSERT INTO order_items (order_id, vendor_name, item_name, price, quantity, variant) VALUES (?, ?, ?, ?, ?, ?)");
    foreach ($vendors as $vendorName => $items) {
        foreach ($items as $item) {
            $itemStmt->execute([$orderId, $vendorName, $item['name'] ?? '', $item['price'] ?? 0, $item['quantity'] ?? 1, $item['variant'] ?? null]);
        }
    }
    jsonOk(['orderId' => $in['orderId']]);
}

function actionUpdateOrderStatus(array $in): void {
    $db = getDB();
    $db->prepare("UPDATE orders SET status = ? WHERE id = ?")->execute([$in['status'] ?? 'pending', $in['id'] ?? 0]);
    jsonOk();
}

// Ambil semua order + items, format sesuai struktur yang diharapkan frontend
function fetchOrdersFormatted(PDO $db, string $whereSql, array $params): array {
    $stmt = $db->prepare("
        SELECT o.id, o.order_id AS orderId, o.status,
               o.customer_name AS customerName, o.customer_phone AS customerPhone,
               o.customer_address AS customerAddress, o.customer_notes AS customerNotes,
               o.customer_session AS customerSession, o.timestamp_number AS timestampNumber,
               o.created_at
        FROM orders o
        WHERE $whereSql
        ORDER BY o.created_at DESC
    ");
    $stmt->execute($params);
    $orders = $stmt->fetchAll();

    if (empty($orders)) return [];

    // Ambil semua items untuk order-order di atas
    $ids = array_column($orders, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $iStmt = $db->prepare("SELECT * FROM order_items WHERE order_id IN ($placeholders)");
    $iStmt->execute($ids);
    $items = $iStmt->fetchAll();

    // Group items by order_id
    $itemsByOrder = [];
    foreach ($items as $item) {
        $itemsByOrder[$item['order_id']][$item['vendor_name']][] = [
            'name'     => $item['item_name'],
            'price'    => (int)$item['price'],
            'quantity' => (int)$item['quantity'],
            'variant'  => $item['variant'],
        ];
    }

    // Build final structure
    foreach ($orders as &$order) {
        $order['vendors'] = $itemsByOrder[$order['id']] ?? [];
        $order['id'] = (string)$order['id']; // frontend expects string id for status update
    }
    return $orders;
}

function actionGetOrdersByVendor(array $in): void {
    $db = getDB();
    $vName = $in['vendorName'] ?? '';
    // Ambil order yang punya item dari vendor ini
    $stmt = $db->prepare("SELECT DISTINCT o.id FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE oi.vendor_name = ?");
    $stmt->execute([$vName]);
    $ids = array_column($stmt->fetchAll(), 'id');
    if (empty($ids)) { jsonOk(['orders' => []]); return; }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $orders = fetchOrdersFormatted($db, "o.id IN ($placeholders)", $ids);
    jsonOk(['orders' => $orders]);
}

function actionGetOrdersBySession(array $in): void {
    $db = getDB();
    $orders = fetchOrdersFormatted($db, "o.customer_session = ?", [$in['session'] ?? '']);
    jsonOk(['orders' => $orders]);
}

// ── CHAT ──
function actionSendMsg(array $in): void {
    $db = getDB();
    $stmt = $db->prepare("
        INSERT INTO chat_rooms (room_id, pengirim, tipe, isi, menu_data, order_data, target_vendor, cust_session, timestamp_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $in['roomId'] ?? 'global_foodfinder',
        $in['pengirim'] ?? '',
        $in['tipe'] ?? 'text',
        $in['isi'] ?? '',
        $in['menuData'] ?? null,
        $in['orderData'] ?? null,
        $in['targetVendor'] ?? null,
        $in['custSession'] ?? null,
        $in['timestampNumber'] ?? (time() * 1000)
    ]);
    jsonOk(['id' => $db->lastInsertId()]);
}

function actionGetChat(array $in): void {
    $db = getDB();
    $cutoff = (int)($in['cutoff'] ?? (time() * 1000 - 300000));
    $roomId = $in['roomId'] ?? 'global_foodfinder';

    $stmt = $db->prepare("
        SELECT id, room_id AS roomId, pengirim, tipe, isi, menu_data, order_data,
               target_vendor AS targetVendor, cust_session AS custSession,
               timestamp_number AS timestampNumber, created_at
        FROM chat_rooms
        WHERE room_id = ? AND timestamp_number >= ?
        ORDER BY timestamp_number ASC
        LIMIT 200
    ");
    $stmt->execute([$roomId, $cutoff]);
    $msgs = array_map(function($m) {
        $m['menuData']  = parseJsonField($m['menu_data']);
        $m['orderData'] = parseJsonField($m['order_data']);
        unset($m['menu_data'], $m['order_data']);
        $m['id'] = (string)$m['id'];
        return $m;
    }, $stmt->fetchAll());
    jsonOk(['messages' => $msgs]);
}

function actionHapusChatLama(array $in): void {
    $db = getDB();
    $db->prepare("DELETE FROM chat_rooms WHERE room_id = ? AND timestamp_number < ?")
       ->execute([$in['roomId'] ?? 'global_foodfinder', $in['cutoff'] ?? 0]);
    jsonOk();
}

function actionHapusSemuaChat(array $in): void {
    $db = getDB();
    $db->prepare("DELETE FROM chat_rooms WHERE room_id = ?")
       ->execute([$in['roomId'] ?? 'global_foodfinder']);
    jsonOk();
}

function actionHapusChatOrderCustomer(array $in): void {
    $db = getDB();
    $db->prepare("DELETE FROM chat_rooms WHERE room_id = ? AND tipe = 'order_customer' AND cust_session = ?")
       ->execute([$in['roomId'] ?? 'global_foodfinder', $in['custSession'] ?? '']);
    jsonOk();
}

// ── CUSTOMER ROOMS ──
function actionRegisterRoom(array $in): void {
    $db = getDB();
    // Buat tabel jika belum ada
    $db->exec("CREATE TABLE IF NOT EXISTS customer_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(120) NOT NULL UNIQUE,
        cust_session VARCHAR(120) NOT NULL,
        label VARCHAR(100) NOT NULL DEFAULT 'Customer',
        last_seen BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    $stmt = $db->prepare("INSERT INTO customer_rooms (room_id, cust_session, label, last_seen)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE label = VALUES(label), last_seen = VALUES(last_seen)");
    $stmt->execute([
        $in['roomId'] ?? '',
        $in['custSession'] ?? '',
        $in['label'] ?? 'Customer',
        $in['lastSeen'] ?? (time() * 1000)
    ]);
    jsonOk();
}

function actionGetActiveRooms(): void {
    $db = getDB();
    // Buat tabel jika belum ada
    $db->exec("CREATE TABLE IF NOT EXISTS customer_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(120) NOT NULL UNIQUE,
        cust_session VARCHAR(120) NOT NULL,
        label VARCHAR(100) NOT NULL DEFAULT 'Customer',
        last_seen BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    // Ambil room yang aktif dalam 10 menit terakhir
    $cutoff = (time() - 600) * 1000;
    $stmt = $db->prepare("SELECT room_id AS roomId, cust_session AS custSession, label, last_seen AS lastSeen
        FROM customer_rooms WHERE last_seen >= ? ORDER BY last_seen DESC");
    $stmt->execute([$cutoff]);
    jsonOk(['rooms' => $stmt->fetchAll()]);
}

function actionLeaveRoom(array $in): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS customer_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(120) NOT NULL UNIQUE,
        cust_session VARCHAR(120) NOT NULL,
        label VARCHAR(100) NOT NULL DEFAULT 'Customer',
        last_seen BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");
    $db->prepare("DELETE FROM customer_rooms WHERE room_id = ?")
       ->execute([$in['roomId'] ?? '']);
    jsonOk();
}

// ── SETUP DEFAULTS ──
function actionSetupDefaults(): void {
    $db = getDB();

    $vendorCount = (int)$db->query("SELECT COUNT(*) FROM vendor_credentials")->fetchColumn();
    if ($vendorCount === 0) {
        $defaults = [
            ['Warung Bu Siti',      '🍜', 'busiti',   'siti123'],
            ['Kedai Kopi Mas Budi', '☕', 'masbudi',  'budi123'],
            ['Dapur Mama Lina',     '🍛', 'mamalina', 'lina123'],
            ['Bakery Pak Amir',     '🥐', 'pakamir',  'amir123'],
        ];
        $stmt = $db->prepare("INSERT INTO vendor_credentials (nama, emoji, username, password) VALUES (?, ?, ?, ?)");
        foreach ($defaults as $v) $stmt->execute($v);
    }

    $menuCount = (int)$db->query("SELECT COUNT(*) FROM menu_database")->fetchColumn();
    if ($menuCount === 0) {
        $menus = [
            [1,'Warung Bu Siti','Nasi Goreng Spesial',25000,'Nasi goreng dengan telur, ayam suwir, dan kerupuk','https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500','makanan',['Pedas','Sedang','Tidak Pedas']],
            [1,'Warung Bu Siti','Mie Goreng Jawa',20000,'Mie goreng khas Jawa dengan bumbu rahasia','https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500','makanan',['Pedas','Sedang']],
            [2,'Kedai Kopi Mas Budi','Kopi Susu Gula Aren',18000,'Kopi susu dengan gula aren asli yang manis dan creamy','https://images.unsplash.com/photo-1534687886635-f4f905e6e21f?w=500','minuman',['Panas','Dingin']],
            [2,'Kedai Kopi Mas Budi','Es Teh Manis',8000,'Teh manis segar dengan es batu','https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500','minuman',[]],
            [3,'Dapur Mama Lina','Ayam Geprek Sambal Matah',28000,'Ayam crispy geprek dengan sambal matah khas Bali','https://images.unsplash.com/photo-1633964913295-ceb43826183c?w=500','makanan',['Level 1','Level 2','Level 3','Level 5']],
            [3,'Dapur Mama Lina','Soto Ayam Kuning',22000,'Soto ayam kuning dengan telur, soun, dan emping','https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500','makanan',[]],
            [4,'Bakery Pak Amir','Roti Croissant Butter',15000,'Croissant buttery yang renyah di luar, lembut di dalam','https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500','snack',[]],
            [4,'Bakery Pak Amir','Donut Cokelat Premium',12000,'Donut lembut dengan topping cokelat premium','https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500','dessert',['Cokelat','Strawberry','Vanilla']],
        ];
        $mStmt = $db->prepare("INSERT INTO menu_database (vendor_id, vendor, nama, harga, deskripsi, gambar, kategori) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $vStmt = $db->prepare("INSERT INTO menu_variants (menu_id, varian, urutan) VALUES (?, ?, ?)");
        foreach ($menus as [$vid, $vname, $nama, $harga, $desc, $img, $kat, $variants]) {
            $mStmt->execute([$vid, $vname, $nama, $harga, $desc, $img, $kat]);
            $mid = $db->lastInsertId();
            foreach ($variants as $i => $v) $vStmt->execute([$mid, $v, $i]);
        }
    }
    jsonOk();
}