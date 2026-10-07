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

    // Riwayat Absensi Bersih (Kosong)
    riwayatAbsensi: {},

    // Daftar Karyawan Bersih (Kosong Tanpa Data Bawaan)
    daftarKaryawan: [],

    init() {
      // Load Data dari LocalStorage jika ada
      const savedKaryawan = localStorage.getItem('trijaya_karyawan');
      if (savedKaryawan) {
        try { this.daftarKaryawan = JSON.parse(savedKaryawan); } catch(e) {}
      }

      const savedRiwayat = localStorage.getItem('trijaya_riwayat_absensi');
      if (savedRiwayat) {
        try { this.riwayatAbsensi = JSON.parse(savedRiwayat); } catch(e) {}
      }

      this.updateTime();
      setInterval(() => this.updateTime(), 1000);
    },

    saveToStorage() {
      localStorage.setItem('trijaya_karyawan', JSON.stringify(this.daftarKaryawan));
      localStorage.setItem('trijaya_riwayat_absensi', JSON.stringify(this.riwayatAbsensi));
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

    simpanKaryawan() {
      if (this.isEditMode) {
        // UPDATE / EDIT KARYAWAN
        const index = this.daftarKaryawan.findIndex(k => k.nip === this.form.nip);
        if (index !== -1) {
          this.daftarKaryawan[index].nama = this.form.nama;
          this.daftarKaryawan[index].jabatan = this.form.jabatan;
          this.daftarKaryawan[index].divisi = this.form.divisi;
          this.daftarKaryawan[index].shift = this.form.shift;
          if (this.form.foto) {
            this.daftarKaryawan[index].foto = this.form.foto;
          }
          this.saveToStorage();
          this.notify(`Data ${this.form.nama} berhasil diperbarui!`);
          this.resetForm();
        }
      } else {
        // TAMBAH KARYAWAN BARU
        const existing = this.daftarKaryawan.find(k => k.nip.toLowerCase() === this.form.nip.toLowerCase());
        if (existing) {
          alert('NIP Karyawan sudah terdaftar!');
          return;
        }

        const newKaryawan = {
          nip: this.form.nip,
          nama: this.form.nama,
          jabatan: this.form.jabatan,
          divisi: this.form.divisi,
          shift: this.form.shift,
          foto: this.form.foto
        };

        this.daftarKaryawan.push(newKaryawan);
        this.employeePage = 1;
        this.saveToStorage();
        this.notify(`Karyawan ${this.form.nama} berhasil ditambahkan!`);
        this.resetForm();
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

    hapusKaryawan(nip) {
      if (confirm(`Apakah Anda yakin ingin menghapus karyawan dengan NIP ${nip}?`)) {
        this.daftarKaryawan = this.daftarKaryawan.filter(k => k.nip !== nip);
        this.employeePage = Math.min(this.employeePage, this.employeePageCount);
        this.saveToStorage();
        this.notify('Karyawan berhasil dihapus.');
        if (this.form.nip === nip) {
          this.resetForm();
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

    processScan(nipInput) {
      if (!nipInput) return;
      const target = this.daftarKaryawan.find(k => k.nip.toLowerCase() === nipInput.trim().toLowerCase());

      if (!target) {
        alert(`NIP (${nipInput}) tidak ditemukan dalam sistem!`);
        this.inputNipScan = '';
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const jamSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      if (!this.riwayatAbsensi[today]) {
        this.riwayatAbsensi[today] = {};
      }

      if (!this.riwayatAbsensi[today][target.nip]) {
        this.riwayatAbsensi[today][target.nip] = {
          status: 'Hadir',
          jamMasuk: null,
          jamPulang: null
        };
      }

      // Deteksi Terlambat (misal jika masuk > 08.00)
      const jamInt = parseInt(jamSekarang.split('.')[0]);
      let statusHitung = 'Hadir';
      if (jamInt >= 8 && this.scanMode === 'masuk') {
        statusHitung = 'Terlambat';
      }

      if (this.scanMode === 'masuk') {
        this.riwayatAbsensi[today][target.nip].status = statusHitung;
        this.riwayatAbsensi[today][target.nip].jamMasuk = jamSekarang;
        this.notify(`Absen Masuk Berhasil (${statusHitung}): ${target.nama}`);
      } else {
        this.riwayatAbsensi[today][target.nip].jamPulang = jamSekarang;
        this.notify(`Absen Pulang Berhasil: ${target.nama}`);
      }

      this.lastScannedKaryawan = {
        ...target,
        jamMasuk: this.riwayatAbsensi[today][target.nip].jamMasuk,
        jamPulang: this.riwayatAbsensi[today][target.nip].jamPulang
      };

      this.inputNipScan = '';
      this.saveToStorage();
    },

    ubahStatusJadwalManual(karyawan, statusBaru) {
      const tgl = this.filterTanggal;
      
      if (!this.riwayatAbsensi[tgl]) {
        this.riwayatAbsensi[tgl] = {};
      }

      if (!this.riwayatAbsensi[tgl][karyawan.nip]) {
        this.riwayatAbsensi[tgl][karyawan.nip] = {
          status: 'Belum Hadir / Alpha',
          jamMasuk: null,
          jamPulang: null
        };
      }

      const record = this.riwayatAbsensi[tgl][karyawan.nip];
      record.status = statusBaru;

      if ((statusBaru === 'Hadir' || statusBaru === 'Terlambat') && !record.jamMasuk) {
        record.jamMasuk = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      } else if (statusBaru === 'Belum Hadir / Alpha') {
        record.jamMasuk = null;
        record.jamPulang = null;
      }

      this.saveToStorage();
      this.notify(`[Jadwal ${tgl}] Status ${karyawan.nama} diubah ke ${statusBaru}`);
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