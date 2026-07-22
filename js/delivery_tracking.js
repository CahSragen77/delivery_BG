// CONFIGURATION
    const GOOGLE_SCRIPT_URL = "GANTI_DENGAN_URL_DEPLOYMENT_GOOGLE_APPS_SCRIPT_MU";
    const NOMOR_WA_TOKO = "6281122220723"; // Ganti dengan nomor WA Toko/Admin

    let deliveryState = {
      namaDeliman: '',
      phoneDeliman: '',
      phoneKonsumen: '',
      titikAwal: null,
      titikAkhir: null,
      fotoStruk: '',
      fotoPenyerahan: ''
    };

    // --- FITUR CACHE LOCALSTORAGE (ANTI HILANG SAAT KEPENCET HOME) ---
    const STORAGE_KEY = "deliman_cache_state";

    function saveToCache() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deliveryState));
    }

    function loadFromCache() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          deliveryState = JSON.parse(saved);
          // Auto-fill kembali input form jika data sudah ada sebelumnya
          if (deliveryState.namaDeliman) document.getElementById('namaDeliman').value = deliveryState.namaDeliman;
          if (deliveryState.phoneDeliman) document.getElementById('phoneDeliman').value = deliveryState.phoneDeliman;
          if (deliveryState.phoneKonsumen) document.getElementById('phoneKonsumen').value = deliveryState.phoneKonsumen;
          
          if (deliveryState.titikAwal) {
            log("Memulihkan sesi pengiriman sebelumnya dari cache HP...");
          }
        } catch(e) {
          console.error("Gagal load cache", e);
        }
      }
    }

    function clearCache() {
      localStorage.removeItem(STORAGE_KEY);
    }

    // Jalankan saat halaman pertama kali dibuka/direfresh
    window.onload = function() {
      loadFromCache();
    };
    // -------------------------------------------------------------

    function log(msg) {
      const logArea = document.getElementById('logArea');
      logArea.innerHTML += `<br>> ${msg}`;
      console.log(msg);
    }

    function showLog() {
      document.getElementById('logArea').classList.toggle('hidden');
    }

    // Convert Image file to Base64 (agar hemat & bisa dikirim ke log)
    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        if(!file) resolve("");
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    }

    // Helper Geolocation
    function getGPSLocation() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject("Geolocation tidak didukung browser ini.");
        } else {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject("Gagal mengambil lokasi GPS: " + err.message)
          );
        }
      });
    }

    // Calculation Jarak Sederhana (Haversine Formula) jika tanpa Google Maps API Paid Key
    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371; // Radius bumi (KM)
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return (R * c).toFixed(2); // KM
    }

    // FLOW 1 & 2: Mulai Berangkat
    async function mulaiPengiriman() {
      const nama = document.getElementById('namaDeliman').value;
      const phoneD = document.getElementById('phoneDeliman').value;
      const phoneK = document.getElementById('phoneKonsumen').value;
      const fileStruk = document.getElementById('fotoStruk').files[0];

      if (!nama || !phoneD || !phoneK) {
        alert("Harap isi Nama, No WA Deliman, dan No WA Konsumen terlebih dahulu!");
        return;
      }
      if (!fileStruk && !deliveryState.fotoStruk) {
        alert("Harap foto barang & struk belanjaan terlebih dahulu!");
        return;
      }

      try {
        log("Mengambil lokasi titik awal...");
        const loc = await getGPSLocation();
        deliveryState.titikAwal = loc;
        deliveryState.namaDeliman = nama;
        deliveryState.phoneDeliman = phoneD;
        deliveryState.phoneKonsumen = phoneK;
        
        if (fileStruk) {
          deliveryState.fotoStruk = await fileToBase64(fileStruk);
        }

        // SIMPAN KE CACHE HP
        saveToCache();

        log(`Titik Awal Set & Tersimpan di Cache: ${loc.lat}, ${loc.lng}`);

        // Buat link WA otomatis ke konsumen
        const msg = encodeURIComponent(`Halo, pesanan Anda sedang diantar oleh Deliman *${nama}*.\n\nLokasi Keberangkatan Terdeteksi: https://maps.google.com/?q=${loc.lat},${loc.lng}`);
        const waUrl = `https://wa.me/${phoneK}?text=${msg}`;

        log("Membuka WhatsApp Konsumen...");
        window.open(waUrl, '_blank');
      } catch (err) {
        alert(err);
        log("ERROR: " + err);
      }
    }

    // FLOW 3, 4, 5: Selesai & Kirim Log
    async function selesaiPengiriman() {
      // Cek apakah ada data di state atau di cache
      if (!deliveryState.titikAwal) {
        loadFromCache();
        if (!deliveryState.titikAwal) {
          alert("Anda belum menekan tombol Mulai/Titik Awal!");
          return;
        }
      }

      const filePenyerahan = document.getElementById('fotoPenyerahan').files[0];
      if (!filePenyerahan) {
        alert("Harap foto penyerahan barang bersama konsumen!");
        return;
      }

      try {
        log("Mengambil lokasi titik akhir...");
        const locAkhir = await getGPSLocation();
        deliveryState.titikAkhir = locAkhir;
        deliveryState.fotoPenyerahan = await fileToBase64(filePenyerahan);

        // Perhitungan Jarak Rute (Awal ke Akhir)
        const jarakKM = calculateDistance(
          deliveryState.titikAwal.lat, deliveryState.titikAwal.lng,
          locAkhir.lat, locAkhir.lng
        );

        log(`Titik Akhir Set: ${locAkhir.lat}, ${locAkhir.lng}`);
        log(`Total Jarak Ditempuh: ${jarakKM} KM`);

        // 1. Simpan ke Google Sheet
        log("Mengirim data ke Google Sheets...");
        const payload = {
          namaDeliman: deliveryState.namaDeliman,
          phoneDeliman: deliveryState.phoneDeliman,
          phoneKonsumen: deliveryState.phoneKonsumen,
          titikAwal: `${deliveryState.titikAwal.lat},${deliveryState.titikAwal.lng}`,
          titikAkhir: `${locAkhir.lat},${locAkhir.lng}`,
          jarak: `${jarakKM} KM`,
          fotoStruk: "Tersimpan (Base64 Data)",
          fotoPenyerahan: "Tersimpan (Base64 Data)"
        };

        fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        log("Data dikirim ke database!");

        // 2. Kirim Info Laporan Kerja ke WA Toko
        const msgToko = encodeURIComponent(`*LAPORAN PENGIRIMAN SELESAI*\n\n` +
          `• Deliman: ${deliveryState.namaDeliman} (${deliveryState.phoneDeliman})\n` +
          `• Konsumen: ${deliveryState.phoneKonsumen}\n` +
          `• Total Jarak Rute: *${jarakKM} KM*\n` +
          `• Titik Awal: https://maps.google.com/?q=${deliveryState.titikAwal.lat},${deliveryState.titikAwal.lng}\n` +
          `• Titik Akhir: https://maps.google.com/?q=${locAkhir.lat},${locAkhir.lng}\n\n` +
          `Status: Berhasil Disimpan ke Log Sheet.`
        );

        const waTokoUrl = `https://wa.me/${NOMOR_WA_TOKO}?text=${msgToko}`;
        window.open(waTokoUrl, '_blank');

        // BERSIHKAN CACHE SETELAH SELESAI
        clearCache();

      } catch (err) {
        alert(err);
        log("ERROR: " + err);
      }
    }
