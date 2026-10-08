function adminAbsensiApp() {
  return {
    activeTab: 'scan',
    scanMode: 'masuk',
    isCameraActive: false,
    html5QrcodeScanner: null,
    inputNipScan: '',
    lastScannedKaryawan: null,
    
    showToast: false,
    toastMessage: '',

    showPrintModal: false,
    selectedKaryawanPrint: null,
    employeeSearch: '',
    employeePage: 1,
    employeesPerPage: 8,
    isBulkPrint: false,
    bulkPrintPageSize: 8,

    isEditMode: false,

    // Filter Rekap Absensi
    filterTanggal: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    filterShift: 'Semua',
    filterDivisi: 'Semua',
    filterStatus: 'Semua',

    form: {
      nip: '',
      nama: '',
      jabatan: '',
      divisi: 'Teknik & Lapangan',
      shift: 'Shift 1 (Pagi)',
      foto: null
    },

    currentTime: '',

    // Data dari Database MySQL
    riwayatAbsensi: {},
    daftarKaryawan: [],

    authChecked: false,
    isAuthenticated: false,
    adminExists: true,
    adminUsername: '',
    authLoading: false,
    authError: '',
    authForm: {
      username: '',
      password: '',
      passwordConfirm: ''
    },

    async init() {
      try {
        const { response, result } = await this.apiRequest('api.php?action=auth_status');
        if (!response.ok || result.status !== 'success') {
          throw new Error(result.message || 'Gagal memeriksa sesi admin.');
        }

        this.authChecked = true;
        this.isAuthenticated = result.authenticated;
        this.adminExists = result.adminExists;
        this.adminUsername = result.username || '';
        if (this.isAuthenticated) {
          await this.loadDataFromDatabase();
        }
      } catch (error) {
        this.authChecked = true;
        this.authError = error.message || 'Tidak dapat terhubung ke server.';
        console.error('Gagal memeriksa sesi admin:', error);
      }
      this.updateTime();
      setInterval(() => this.updateTime(), 1000);
    },

    async apiRequest(url, options = {}) {
      const response = await fetch(url, options);
      const result = await response.json();

      if (response.status === 401) {
        this.isAuthenticated = false;
        this.authChecked = true;
        this.authError = result.message || 'Sesi admin telah berakhir. Silakan login kembali.';
      }

      return { response, result };
    },

    async submitAuth() {
      this.authLoading = true;
      this.authError = '';
      const type = this.adminExists ? 'login' : 'setup_admin';

      try {
        const { response, result } = await this.apiRequest('api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            ...this.authForm
          })
        });

        if (!response.ok || result.status !== 'success') {
          this.authError = result.message || 'Autentikasi admin gagal.';
          return;
        }

        this.isAuthenticated = true;
        this.adminExists = true;
        this.adminUsername = result.username;
        this.authForm = { username: '', password: '', passwordConfirm: '' };
        await this.loadDataFromDatabase();
      } catch (error) {
        this.authError = error.message || 'Tidak dapat terhubung ke server.';
      } finally {
        this.authLoading = false;
      }
    },

    async logout() {
      try {
        const { response, result } = await this.apiRequest('api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'logout' })
        });

        if (!response.ok || result.status !== 'success') {
          this.authError = result.message || 'Logout gagal.';
          return;
        }

        this.isAuthenticated = false;
        this.adminUsername = '';
        this.authError = '';
        this.activeTab = 'scan';
        this.stopCamera();
      } catch (error) {
        this.authError = error.message || 'Tidak dapat terhubung ke server.';
      }
    },

    // ==========================================
    // INTEGRASI DATABASE MYSQL (API FETCH)
    // ==========================================
    async loadDataFromDatabase() {
      try {
        const { response, result } = await this.apiRequest('api.php?action=get_all');
        if (response.ok && result.status === 'success') {
          this.daftarKaryawan = result.karyawan || [];
          this.riwayatAbsensi = result.riwayat || {};
        } else {
          console.error('Gagal memuat data dari database:', result.message);
        }
      } catch (e) {
        console.error('Koneksi database gagal:', e);
      }
    },

    get filteredKaryawan() {
      const query = this.employeeSearch.trim().toLocaleLowerCase('id');
      if (!query) return this.daftarKaryawan;

      return this.daftarKaryawan.filter(karyawan =>
        [karyawan.nama, karyawan.nip, karyawan.jabatan, karyawan.divisi]
          .some(value => (value || '').toLocaleLowerCase('id').includes(query))
      );
    },

    get employeePageCount() {
      return Math.max(1, Math.ceil(this.filteredKaryawan.length / this.employeesPerPage));
    },

    get paginatedKaryawan() {
      const start = (this.employeePage - 1) * this.employeesPerPage;
      return this.filteredKaryawan.slice(start, start + this.employeesPerPage);
    },

    get bulkPrintPages() {
      const pages = [];
      for (let start = 0; start < this.daftarKaryawan.length; start += this.bulkPrintPageSize) {
        pages.push(this.daftarKaryawan.slice(start, start + this.bulkPrintPageSize));
      }
      return pages;
    },

    updateTime() {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },

    getPageTitle() {
      if (this.activeTab === 'scan') return 'Scan Barcode Kehadiran';
      if (this.activeTab === 'karyawan') return 'Kelola Data & Cetak Barcode';
      if (this.activeTab === 'rekap') return 'Laporan Rekap Kehadiran Karyawan';
      return '';
    },

    switchTab(tab) {
      this.activeTab = tab;
      if (tab !== 'scan' && this.isCameraActive) {
        this.stopCamera();
      }
    },

    notify(msg) {
      this.toastMessage = msg;
      this.showToast = true;
      setTimeout(() => { this.showToast = false; }, 3000);
    },

    // ==========================================
    // UPLOAD FOTO & HANDLER DATA FORM KARYAWAN
    // ==========================================
    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          alert('Ukuran file foto maksimal 2MB!');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          this.form.foto = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    },

    async simpanKaryawan() {
      const payload = {
        type: 'simpan_karyawan',
        ...this.form,
        isEdit: this.isEditMode
      };

      try {
        const { response, result } = await this.apiRequest('api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok && result.status === 'success') {
          this.notify(result.message);
          await this.loadDataFromDatabase(); // Refresh data dari DB
          this.resetForm();
        } else {
          alert(result.message);
        }
      } catch (e) {
        alert('Gagal terhubung ke server database!');
      }
    },

    editKaryawan(karyawan) {
      this.isEditMode = true;
      this.form = {
        nip: karyawan.nip,
        nama: karyawan.nama,
        jabatan: karyawan.jabatan,
        divisi: karyawan.divisi,
        shift: karyawan.shift || 'Shift 1 (Pagi)',
        foto: karyawan.foto || null
      };
    },

    async hapusKaryawan(nip) {
      if (confirm(`Apakah Anda yakin ingin menghapus karyawan dengan NIP ${nip}?`)) {
        try {
          const { response, result } = await this.apiRequest(`api.php?nip=${encodeURIComponent(nip)}`, { method: 'DELETE' });

          if (response.ok && result.status === 'success') {
            this.notify(result.message);
            await this.loadDataFromDatabase(); // Refresh data dari DB
            if (this.form.nip === nip) {
              this.resetForm();
            }
          } else {
            alert(result.message);
          }
        } catch (e) {
          alert('Gagal menghapus data dari database!');
        }
      }
    },

    resetForm() {
      this.isEditMode = false;
      this.form = {
        nip: '',
        nama: '',
        jabatan: '',
        divisi: 'Teknik & Lapangan',
        shift: 'Shift 1 (Pagi)',
        foto: null
      };
      const fileInput = document.getElementById('foto-input');
      if (fileInput) fileInput.value = '';
    },

    // ==========================================
    // LOGIKA FILTER REKAP ABSENSI JADWAL
    // ==========================================
    get filteredRekapKaryawan() {
      return this.daftarKaryawan.filter(k => {
        const matchShift = this.filterShift === 'Semua' || (k.shift || 'Shift 1 (Pagi)') === this.filterShift;
        const matchDivisi = this.filterDivisi === 'Semua' || k.divisi === this.filterDivisi;
        
        const statusKey = this.getStatusJadwal(k);
        const matchStatus = this.filterStatus === 'Semua' || statusKey === this.filterStatus;

        return matchShift && matchDivisi && matchStatus;
      });
    },

    getStatusJadwal(karyawan) {
      const tgl = this.filterTanggal;
      if (this.riwayatAbsensi[tgl] && this.riwayatAbsensi[tgl][karyawan.nip]) {
        return this.riwayatAbsensi[tgl][karyawan.nip].status || 'Belum Hadir / Alpha';
      }
      return 'Belum Hadir / Alpha';
    },

    getJamMasukJadwal(karyawan) {
      const tgl = this.filterTanggal;
      if (this.riwayatAbsensi[tgl] && this.riwayatAbsensi[tgl][karyawan.nip]) {
        return this.riwayatAbsensi[tgl][karyawan.nip].jamMasuk || '-';
      }
      return '-';
    },

    getJamPulangJadwal(karyawan) {
      const tgl = this.filterTanggal;
      if (this.riwayatAbsensi[tgl] && this.riwayatAbsensi[tgl][karyawan.nip]) {
        return this.riwayatAbsensi[tgl][karyawan.nip].jamPulang || '-';
      }
      return '-';
    },

    hitungJumlahStatus(statusName) {
      return this.daftarKaryawan.filter(k => this.getStatusJadwal(k) === statusName).length;
    },

    // ==========================================
    // LOGIKA SCANNER KAMERA & PROSES ABSEN
    // ==========================================
    startCamera() {
      this.isCameraActive = true;
      this.$nextTick(() => {
        this.html5QrcodeScanner = new Html5Qrcode("reader");
        this.html5QrcodeScanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            this.processScan(decodedText);
          },
          () => {}
        ).catch(() => {
          this.isCameraActive = false;
          alert('Kamera tidak dapat diakses atau diblokir.');
        });
      });
    },

    stopCamera() {
      if (this.html5QrcodeScanner) {
        this.html5QrcodeScanner.stop().then(() => {
          this.isCameraActive = false;
        }).catch(() => {
          this.isCameraActive = false;
        });
      } else {
        this.isCameraActive = false;
      }
    },

    async processScan(nipInput) {
      if (!nipInput) return;
      const target = this.daftarKaryawan.find(k => k.nip.toLowerCase() === nipInput.trim().toLowerCase());

      if (!target) {
        alert(`NIP (${nipInput}) tidak ditemukan dalam sistem!`);
        this.inputNipScan = '';
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const jamSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Deteksi Terlambat (misal jika masuk >= 08.00)
      const jamInt = parseInt(jamSekarang.split('.')[0]);
      let statusHitung = 'Hadir';
      if (jamInt >= 8 && this.scanMode === 'masuk') {
        statusHitung = 'Terlambat';
      }

      const payload = {
        type: 'simpan_absensi',
        nip: target.nip,
        tanggal: today,
        status: statusHitung,
        jamMasuk: this.scanMode === 'masuk' ? jamSekarang : null,
        jamPulang: this.scanMode === 'pulang' ? jamSekarang : null
      };

      try {
        const { response, result } = await this.apiRequest('api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok && result.status === 'success') {
          this.notify(`Absen ${this.scanMode.toUpperCase()} Berhasil: ${target.nama}`);
          await this.loadDataFromDatabase();

          this.lastScannedKaryawan = {
            ...target,
            jamMasuk: this.riwayatAbsensi[today]?.[target.nip]?.jamMasuk || '-',
            jamPulang: this.riwayatAbsensi[today]?.[target.nip]?.jamPulang || '-'
          };
        } else {
          alert(result.message);
        }
      } catch (e) {
        alert('Gagal menyimpan absensi ke database!');
      }

      this.inputNipScan = '';
    },

    async ubahStatusJadwalManual(karyawan, statusBaru) {
      const tgl = this.filterTanggal;
      const jamSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const payload = {
        type: 'simpan_absensi',
        nip: karyawan.nip,
        tanggal: tgl,
        status: statusBaru,
        jamMasuk: (statusBaru === 'Hadir' || statusBaru === 'Terlambat') ? jamSekarang : null,
        jamPulang: null
      };

      try {
        const { response, result } = await this.apiRequest('api.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok && result.status === 'success') {
          this.notify(`[Jadwal ${tgl}] Status ${karyawan.nama} diubah ke ${statusBaru}`);
          await this.loadDataFromDatabase();
        } else {
          alert(result.message);
        }
      } catch (e) {
        alert('Gagal mengupdate status ke database!');
      }
    },

    // ==========================================
    // LOGIKA CETAK KARTU & LAPORAN PDF
    // ==========================================
    previewCetakBarcode(karyawan) {
      this.selectedKaryawanPrint = karyawan;
      this.showPrintModal = true;

      this.$nextTick(() => {
        JsBarcode("#barcode-svg", karyawan.nip, {
          format: "CODE128",
          lineColor: "#000",
          width: 2,
          height: 45,
          displayValue: false
        });
      });
    },

    cetakKartuBarcode() {
      document.body.classList.add('print-card-mode');
      window.print();
      document.body.classList.remove('print-card-mode');
    },

    cetakSemuaBarcode() {
      if (this.daftarKaryawan.length === 0) {
        this.notify('Belum ada data karyawan untuk dicetak.');
        return;
      }

      this.isBulkPrint = true;
      this.$nextTick(() => {
        document.querySelectorAll('.bulk-print-barcode').forEach(barcode => {
          JsBarcode(barcode, barcode.dataset.nip, {
            format: 'CODE128',
            lineColor: '#000',
            width: 1.5,
            height: 32,
            displayValue: false,
            margin: 2
          });
        });

        document.body.classList.add('print-bulk-mode');
        window.print();
        document.body.classList.remove('print-bulk-mode');
        this.isBulkPrint = false;
      });
    },

    cetakLaporanPDF() {
      document.body.classList.add('print-laporan-mode');
      window.print();
      document.body.classList.remove('print-laporan-mode');
    }
  }
}