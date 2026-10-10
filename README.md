# Maç Bülteni (web uygulaması)

Statik site. Sunucu gerekmez: sayfa her açılışta iddaa bültenini tarayıcıdan canlı çeker,
olasılıkları `builder.js` ile telefonda/bilgisayarda hesaplar.

- `index.html` — uygulama (filtreler, banko, pazar arama, ★/◆, lig listesi)
- `builder.js` — hesap motoru (piyasa adil olasılığı + büyük 7 lig istatistik modeli)
- `model.json` — takım güçleri (SofaScore, 7 lig). Yeni maç verisi gelince güncellenir.
- `manifest.webmanifest`, `sw.js`, ikonlar — telefona "uygulama" olarak kurulabilmesi için

Yayınlama: bu klasörü olduğu gibi Netlify Drop / Cloudflare Pages / GitHub Pages'e yükle.
Not: iddaa verisi Türkiye dışından erişilemeyebilir.
