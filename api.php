<?php
require_once 'koneksi.php';

ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => '/'
]);
session_start();

$method = $_SERVER['REQUEST_METHOD'];

function respond($statusCode, $payload) {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function requireAdmin() {
    if (empty($_SESSION['admin_id'])) {
        respond(401, ["status" => "error", "message" => "Silakan login sebagai admin terlebih dahulu."]);
    }
}

// 1. AMBIL DATA (Karyawan & Riwayat Absensi)
if ($method === 'GET') {
    $action = isset($_GET['action']) ? $_GET['action'] : '';

    if ($action === 'auth_status') {
        global $conn;
        $adminQuery = $conn->query("SELECT COUNT(*) AS total FROM admin_users");
        if (!$adminQuery) {
            respond(500, ["status" => "error", "message" => "Gagal memeriksa akun admin."]);
        }

        $adminExists = (int) $adminQuery->fetch_assoc()['total'] > 0;
        respond(200, [
            "status" => "success",
            "authenticated" => !empty($_SESSION['admin_id']),
            "adminExists" => $adminExists,
            "username" => $_SESSION['admin_username'] ?? ''
        ]);
    }

    requireAdmin();

    if ($action === 'get_all') {
        // Ambil Daftar Karyawan
        $karyawanQuery = $conn->query("SELECT * FROM karyawan ORDER BY created_at DESC");
        $daftarKaryawan = [];
        while ($row = $karyawanQuery->fetch_assoc()) {
            $daftarKaryawan[] = $row;
        }

        // Ambil Riwayat Absensi
        $absensiQuery = $conn->query("SELECT * FROM absensi");
        $riwayatAbsensi = [];
        while ($row = $absensiQuery->fetch_assoc()) {
            $tgl = $row['tanggal'];
            $nip = $row['nip'];
            if (!isset($riwayatAbsensi[$tgl])) {
                $riwayatAbsensi[$tgl] = [];
            }
            $riwayatAbsensi[$tgl][$nip] = [
                'status' => $row['status'],
                'jamMasuk' => $row['jam_masuk'],
                'jamPulang' => $row['jam_pulang']
            ];
        }

        echo json_encode([
            "status" => "success",
            "karyawan" => $daftarKaryawan,
            "riwayat" => $riwayatAbsensi
        ]);
    }
}

// 2. SIMPAN & UPDATE (Karyawan atau Absensi)
elseif ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!is_array($data)) {
        respond(400, ["status" => "error", "message" => "Permintaan tidak valid."]);
    }
    $type = isset($data['type']) ? $data['type'] : '';

    if ($type === 'login') {
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $statement = $conn->prepare("SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1");
        if (!$statement) {
            respond(500, ["status" => "error", "message" => "Gagal memeriksa akun admin."]);
        }

        $statement->bind_param("s", $username);
        $statement->execute();
        $admin = $statement->get_result()->fetch_assoc();
        $statement->close();

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            respond(401, ["status" => "error", "message" => "Username atau password salah."]);
        }

        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $admin['id'];
        $_SESSION['admin_username'] = $admin['username'];
        respond(200, ["status" => "success", "username" => $admin['username']]);
    }

    if ($type === 'setup_admin') {
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $passwordConfirm = is_string($data['passwordConfirm'] ?? null) ? $data['passwordConfirm'] : '';

        if (!preg_match('/^[A-Za-z0-9._-]{3,100}$/', $username)) {
            respond(400, ["status" => "error", "message" => "Username harus 3-100 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung."]);
        }
        if (strlen($password) < 12) {
            respond(400, ["status" => "error", "message" => "Password admin harus terdiri dari minimal 12 karakter."]);
        }
        if (!hash_equals($password, $passwordConfirm)) {
            respond(400, ["status" => "error", "message" => "Konfirmasi password tidak sama."]);
        }

        $conn->begin_transaction();
        try {
            $adminQuery = $conn->query("SELECT id FROM admin_users LIMIT 1 FOR UPDATE");
            if (!$adminQuery) {
                throw new RuntimeException("Gagal memeriksa akun admin.");
            }
            if ($adminQuery->num_rows > 0) {
                $conn->rollback();
                respond(409, ["status" => "error", "message" => "Akun admin sudah dibuat. Silakan login."]);
            }

            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            $statement = $conn->prepare("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)");
            if (!$statement) {
                throw new RuntimeException("Gagal menyiapkan pembuatan akun admin.");
            }
            $statement->bind_param("ss", $username, $passwordHash);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException("Gagal menyimpan akun admin.");
            }
            $adminId = $conn->insert_id;
            $statement->close();
            $conn->commit();
        } catch (Throwable $error) {
            $conn->rollback();
            error_log("Gagal membuat akun admin: " . $error->getMessage());
            respond(500, ["status" => "error", "message" => "Akun admin gagal dibuat. Silakan coba lagi."]);
        }

        session_regenerate_id(true);
        $_SESSION['admin_id'] = $adminId;
        $_SESSION['admin_username'] = $username;
        respond(201, ["status" => "success", "username" => $username]);
    }

    if ($type === 'logout') {
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $cookieParameters = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $cookieParameters['path'],
                'domain' => $cookieParameters['domain'],
                'secure' => $cookieParameters['secure'],
                'httponly' => $cookieParameters['httponly'],
                'samesite' => $cookieParameters['samesite']
            ]);
        }
        session_destroy();
        respond(200, ["status" => "success", "message" => "Logout berhasil."]);
    }

    requireAdmin();

    // A. Simpan/Update Karyawan
    if ($type === 'simpan_karyawan') {
        $nip = $conn->real_escape_string($data['nip']);
        $nama = $conn->real_escape_string($data['nama']);
        $jabatan = $conn->real_escape_string($data['jabatan']);
        $divisi = $conn->real_escape_string($data['divisi']);
        $shift = $conn->real_escape_string($data['shift']);
        $foto = isset($data['foto']) ? $conn->real_escape_string($data['foto']) : NULL;
        $isEdit = $data['isEdit'];

        if ($isEdit) {
            $sql = "UPDATE karyawan SET nama='$nama', jabatan='$jabatan', divisi='$divisi', shift='$shift'";
            if ($foto) { $sql .= ", foto='$foto'"; }
            $sql .= " WHERE nip='$nip'";
        } else {
            $sql = "INSERT INTO karyawan (nip, nama, jabatan, divisi, shift, foto) VALUES ('$nip', '$nama', '$jabatan', '$divisi', '$shift', '$foto')";
        }

        if ($conn->query($sql)) {
            echo json_encode(["status" => "success", "message" => "Data karyawan berhasil disimpan!"]);
        } else {
            echo json_encode(["status" => "error", "message" => $conn->error]);
        }
    }

    // B. Simpan Scan Absensi / Ubah Status Manual
    elseif ($type === 'simpan_absensi') {
        $nip = $conn->real_escape_string($data['nip']);
        $tanggal = $conn->real_escape_string($data['tanggal']);
        $status = $conn->real_escape_string($data['status']);
        $jamMasuk = !empty($data['jamMasuk']) ? "'".$conn->real_escape_string($data['jamMasuk'])."'" : "NULL";
        $jamPulang = !empty($data['jamPulang']) ? "'".$conn->real_escape_string($data['jamPulang'])."'" : "NULL";

        $sql = "INSERT INTO absensi (nip, tanggal, status, jam_masuk, jam_pulang)
                VALUES ('$nip', '$tanggal', '$status', $jamMasuk, $jamPulang)
                ON DUPLICATE KEY UPDATE
                status='$status',
                jam_masuk=COALESCE($jamMasuk, jam_masuk),
                jam_pulang=COALESCE($jamPulang, jam_pulang)";

        if ($conn->query($sql)) {
            echo json_encode(["status" => "success", "message" => "Absensi berhasil dicatat!"]);
        } else {
            echo json_encode(["status" => "error", "message" => $conn->error]);
        }
    }
}

// 3. HAPUS KARYAWAN
elseif ($method === 'DELETE') {
    requireAdmin();

    $nip = isset($_GET['nip']) ? $conn->real_escape_string($_GET['nip']) : '';
    if ($nip) {
        if ($conn->query("DELETE FROM karyawan WHERE nip='$nip'")) {
            echo json_encode(["status" => "success", "message" => "Karyawan berhasil dihapus!"]);
        }
    }
}
?>