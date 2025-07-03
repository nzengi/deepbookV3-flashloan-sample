# DeepBook v3 Flash Loan Arbitrage Bot

Sui blockchain üzerinde tam fonksiyonel flash loan arbitraj botu. DeepBook v3 protokolünü kullanarak otomatik arbitraj işlemleri gerçekleştirir.

## ✨ Özellikler

- **Flash Loan Arbitraj**: Teminatsız borçlanma ile kar fırsatları
- **Üçgen Arbitraj**: 3 farklı işlem çifti arasında arbitraj
- **Çapraz Exchange Arbitraj**: DeepBook vs diğer borsalar arası fiyat farkları
- **Gerçek Zamanlı Dashboard**: Web tabanlı kontrol paneli
- **Risk Yönetimi**: Otomatik stop-loss ve pozisyon kontrolü
- **Üretim Hazır**: 7/24 çalışacak şekilde tasarlanmış

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler

```bash
# Node.js 18+ gerekli (otomatik yüklendi)
node --version  # v20.x.x
```

### 2. Konfigürasyon

```bash
# .env dosyasını oluşturun
cp .env.example .env

# .env dosyasını düzenleyin - ÖNEMLİ!
nano .env
```

**Gerekli konfigürasyon:**
```bash
# Sui cüzdan bilgilerinizi girin
PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=your_wallet_address_here

# Ödeme adresi (önceden yapılandırılmış)
FEE_RECIPIENT_ADDRESS=0x3f350562c0151db2394cb9813e987415bca1ef3826287502ce58382f6129f953
```

### 3. Çalıştırma

```bash
# Botu başlat
node start.js
```

### 4. Dashboard Erişimi

Bot başladıktan sonra:
- **URL**: http://localhost:3000
- **Özellikler**: Gerçek zamanlı kar/zarar, işlem geçmişi, risk metrikleri

## 📊 Dashboard Özellikleri

### Ana Ekran
- **Bot Durumu**: Çalışıyor/Durduruldu
- **Toplam Kar**: SUI cinsinden net kar
- **İşlem Sayısı**: Toplam arbitraj işlemi
- **Başarı Oranı**: Kar eden işlem yüzdesi
- **Çalışma Süresi**: Bot'un aktif çalışma süresi

### Sistem Metrikleri
- Gas ücretleri ve net kar hesabı
- Ortalama işlem süresi
- Mevcut cüzdan bakiyesi
- Bellek kullanımı

### Strateji Kontrolü
- Üçgen arbitraj aktif/pasif
- Çapraz DEX arbitraj aktif/pasif
- Gerçek zamanlı ayar değişikliği

### Risk Yönetimi
- Günlük PnL takibi
- Aktif işlem sayısı
- Pozisyon büyüklüğü kontrolü
- Risk seviyesi değerlendirmesi

## 🛡️ Güvenlik ve Risk Yönetimi

### Otomatik Korumalar
- **Günlük Zarar Limiti**: 100 SUI maksimum
- **Pozisyon Büyüklüğü**: 50 SUI maksimum
- **Stop Loss**: %2 pozisyon koruması
- **Acil Durum Kapatma**: Yüksek risk durumunda otomatik durdurma

### İşlem Güvenliği
- Hot potato pattern ile flash loan güvenliği
- Transaction atomicity garantisi
- Slippage koruması (%3 maksimum)
- Gas tahmin ve optimizasyonu

## 💰 Kar Mekanizması

### Arbitraj Türleri

**1. Üçgen Arbitraj**
```
SUI → USDC → DEEP → SUI
Başlangıç: 100 SUI
Sonuç: 100.5 SUI (+0.5 SUI kar)
```

**2. Çapraz Exchange Arbitraj**
```
DeepBook'ta SUI/USDC: $2.10
Binance'te SUI/USDT: $2.15
Fark: %2.38 kar fırsatı
```

### Fee Yapısı
- **Trading Fee**: %0.25 - %2.5 (DEEP token stake durumuna göre)
- **Bot Fee**: Karın %0.1'i belirlenen adrese
- **Gas Maliyeti**: İşlem başına ~0.05-0.1 SUI

## ⚙️ Gelişmiş Konfigürasyon

### Arbitraj Parametreleri
```bash
MIN_PROFIT_THRESHOLD=0.005  # %0.5 minimum kar
MAX_SLIPPAGE=0.03          # %3 maksimum slippage
GAS_BUDGET=100000000       # 0.1 SUI gas bütçesi
```

### Risk Parametreleri
```bash
MAX_POSITION_SIZE=50000000000    # 50 SUI
MAX_DAILY_LOSS=100000000000      # 100 SUI
STOP_LOSS_PERCENTAGE=0.02        # %2
```

### Strateji Aktivasyonu
```bash
TRIANGULAR_ARBITRAGE_ENABLED=true   # Üçgen arbitraj
CROSS_DEX_ARBITRAGE_ENABLED=true    # Çapraz DEX arbitraj
FLASH_LOAN_ENABLED=true             # Flash loan kullanımı
```

## 🔧 Teknik Detaylar

### Desteklenen İşlem Çiftleri
- **Birincil**: DEEP/SUI, DEEP/USDC (%0 fee)
- **Ana Çiftler**: SUI/USDC, WETH/USDC, WBTC/USDC
- **İkincil**: NS/SUI, TYPUS/SUI, WUSDT/USDC

### Performans Optimizasyonları
- 2 saniyede bir fırsat taraması
- Paralel işlem analizi
- Akıllı işlem miktarı optimizasyonu
- Connection pooling ve rate limiting

### Veri Kaynakları
- **Birincil**: DeepBook v3 Indexer (resmi)
- **İkincil**: Binance API (çapraz arbitraj için)
- **Yedek**: Coinbase API

## 📈 Performans Beklentileri

### Günlük Hedefler
- **İşlem Sayısı**: 10-50 arbitraj fırsatı
- **Başarı Oranı**: %70-85
- **Ortalama Kar**: İşlem başına %0.5-2%
- **Gas Verimliliği**: Karın %5-10'u

### Piyasa Koşulları
- **Yüksek Volatilite**: Daha fazla fırsat
- **Düşük Volatilite**: Daha az ama güvenli fırsatlar
- **Yüksek Likidite**: Büyük pozisyon imkanı

## 🔍 Monitoring ve Logging

### Log Dosyaları
- `logs/arbitrage-bot.log`: Genel sistem logları
- `logs/trades.log`: İşlem detayları
- `logs/error.log`: Hata kayıtları

### Real-time Monitoring
- WebSocket ile anlık güncellemeler
- Sistem durumu izleme
- Performans metrikleri

## 🚨 Sorun Giderme

### Yaygın Sorunlar

**1. .env Dosyası Bulunamadı**
```bash
cp .env.example .env
# .env dosyasını düzenleyip private key ekleyin
```

**2. Insufficient Balance**
```bash
# Cüzdanınızda en az 1 SUI bulunduğundan emin olun
```

**3. Network Connection**
```bash
# Internet bağlantınızı kontrol edin
# Sui RPC endpoint'inin erişilebilir olduğundan emin olun
```

**4. High Gas Costs**
```bash
# GAS_BUDGET değerini artırın
GAS_BUDGET=200000000  # 0.2 SUI
```

### Debug Modu
```bash
# Detaylı loglar için
LOG_LEVEL=debug node start.js
```

## 📞 Destek

### İletişim
- **Fee Adresi**: 0x3f350562c0151db2394cb9813e987415bca1ef3826287502ce58382f6129f953
- **Bot Geliştiricisi**: Private key sahibi ile paylaşılan sistem

### Önemli Notlar
- Bu sistem üretim ortamında çalışacak şekilde tasarlanmıştır
- Gerçek fonlarla işlem yapar, dikkatli kullanın
- Risk yönetimi parametrelerini ihtiyacınıza göre ayarlayın
- İlk kullanımda küçük miktarlarla test edin

---

## ⚖️ Yasal Uyarı

Bu bot otomatik finansal işlemler gerçekleştirir. Kullanmadan önce:
- Yerel finansal düzenlemeleri kontrol edin
- Risk toleransınızı değerlendirin
- Sadece kaybetmeyi göze alabileceğiniz miktarlarla başlayın

**Risk Uyarısı**: Kripto arbitraj yüksek getiri potansiyeli sunar ancak kayıp riski de taşır.