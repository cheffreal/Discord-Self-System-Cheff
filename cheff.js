const axios = require("axios");
const fs = require("fs");
const path = require("path");

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
} catch (err) {
  console.error("config.json not found or invalid");
  process.exit(1);
}

const token = (config.token || "").trim();
const headers = { Authorization: token };

const arkadaslariCikar = config.arkadaslariCikar !== false;
const gelenIstekleriReddet = config.gelenIstekleriReddet === true;
const engelleriKaldir = config.engelleriKaldir === true;
const dmleriKapat = config.dmleriKapat !== false;
const sunuculardanCik = config.sunuculardanCik !== false;
const minDelay = config.minDelay ?? 2.5;
const maxDelay = config.maxDelay ?? 3;
const htmlReport = config.htmlReport !== false;

const stats = {
  hesap: null,
  user: null,
  arkadaslar: { toplam: 0, basarili: 0, hata: 0 },
  gelenIstekler: { toplam: 0, reddedilen: 0, hata: 0 },
  engeller: { toplam: 0, kaldirilan: 0, hata: 0 },
  dmler: { toplam: 0, kapatilan: 0, hata: 0 },
  sunucular: { toplam: 0, cikilan: 0, hata: 0 }
};

function getRandomDelay() {
  const sec = minDelay + Math.random() * (maxDelay - minDelay);
  return Math.round(sec * 1000);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runWithDelay() {
  await sleep(getRandomDelay());
}

async function removeAllFriends() {
  if (!arkadaslariCikar && !gelenIstekleriReddet && !engelleriKaldir) return;

  const { data: relationships } = await axios.get(
    "https://discord.com/api/v9/users/@me/relationships",
    { headers }
  );

  const types = [];
  if (arkadaslariCikar) types.push(1, 4);
  if (gelenIstekleriReddet) types.push(3);
  if (engelleriKaldir) types.push(2);

  const list = relationships.filter(r => types.includes(r.type));

  if (list.length === 0) return;

  if (arkadaslariCikar) stats.arkadaslar.toplam = list.filter(r => r.type === 1 || r.type === 4).length;
  if (gelenIstekleriReddet) stats.gelenIstekler.toplam = list.filter(r => r.type === 3).length;
  if (engelleriKaldir) stats.engeller.toplam = list.filter(r => r.type === 2).length;

  for (let i = 0; i < list.length; i++) {
    const rel = list[i];
    const username = rel.user?.username || rel.id;

    try {
      await axios.delete(
        `https://discord.com/api/v9/users/@me/relationships/${rel.id}`,
        { headers }
      );
      if (rel.type === 1 || rel.type === 4) stats.arkadaslar.basarili++;
      if (rel.type === 3) stats.gelenIstekler.reddedilen++;
      if (rel.type === 2) stats.engeller.kaldirilan++;
      console.log(`[rels] ${i + 1}/${list.length} ${username}`);
    } catch (err) {
      if (rel.type === 1 || rel.type === 4) stats.arkadaslar.hata++;
      if (rel.type === 3) stats.gelenIstekler.hata++;
      if (rel.type === 2) stats.engeller.hata++;
      console.error(`[rels] ${username}: ${err.response?.data?.message || err.message}`);
    }

    if (i < list.length - 1) await runWithDelay();
  }
}

async function closeAllDMs() {
  if (!dmleriKapat) return;

  try {
    const { data: channels } = await axios.get(
      "https://discord.com/api/v9/users/@me/channels",
      { headers }
    );

    const channelList = Array.isArray(channels) ? channels : [];
    stats.dmler.toplam = channelList.length;

    if (channelList.length === 0) return;

    for (let i = 0; i < channelList.length; i++) {
      const ch = channelList[i];
      const name = ch.name || ch.recipients?.[0]?.username || ch.id;

      try {
        await axios.delete(
          `https://discord.com/api/v9/channels/${ch.id}`,
          { headers }
        );
        stats.dmler.kapatilan++;
        console.log(`[dms] ${i + 1}/${channelList.length} ${name}`);
      } catch (err) {
        stats.dmler.hata++;
        console.error(`[dms] ${name}: ${err.response?.data?.message || err.message}`);
      }

      if (i < channelList.length - 1) await runWithDelay();
    }
  } catch (err) {
    console.error("[dms]", err.response?.data?.message || err.message);
  }
}

async function leaveAllGuilds() {
  if (!sunuculardanCik) return;

  const { data: guilds } = await axios.get(
    "https://discord.com/api/v9/users/@me/guilds",
    { headers }
  );

  stats.sunucular.toplam = guilds.length;

  if (guilds.length === 0) return;

  for (let i = 0; i < guilds.length; i++) {
    const guild = guilds[i];
    const name = guild.name || guild.id;

    try {
      await axios.delete(
        `https://discord.com/api/v9/users/@me/guilds/${guild.id}`,
        { headers }
      );
      stats.sunucular.cikilan++;
      console.log(`[guilds] ${i + 1}/${guilds.length} ${name}`);
    } catch (err) {
      stats.sunucular.hata++;
      console.error(`[guilds] ${name}: ${err.response?.data?.message || err.message}`);
    }

    if (i < guilds.length - 1) await runWithDelay();
  }
}

function fmt(n) { return n === 0 ? "Yok" : n; }

function printStats() {
  const report = {
    hesap: stats.hesap,
    kullanici: stats.user,
    arkadaslar: { toplam: fmt(stats.arkadaslar.toplam), basarili: fmt(stats.arkadaslar.basarili), hata: fmt(stats.arkadaslar.hata) },
    gelen_istekler: { toplam: fmt(stats.gelenIstekler.toplam), reddedilen: fmt(stats.gelenIstekler.reddedilen), hata: fmt(stats.gelenIstekler.hata) },
    engeller: { toplam: fmt(stats.engeller.toplam), kaldirilan: fmt(stats.engeller.kaldirilan), hata: fmt(stats.engeller.hata) },
    dmler: { toplam: fmt(stats.dmler.toplam), kapatilan: fmt(stats.dmler.kapatilan), hata: fmt(stats.dmler.hata) },
    sunucular: { toplam: fmt(stats.sunucular.toplam), cikilan: fmt(stats.sunucular.cikilan), hata: fmt(stats.sunucular.hata) },
    zaman: new Date().toLocaleString("tr-TR")
  };
  const date = new Date();
  const base = `report_${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}_${String(date.getHours()).padStart(2,"0")}-${String(date.getMinutes()).padStart(2,"0")}`;
  const jsonPath = path.join(__dirname, `${base}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  if (htmlReport) generateHtmlReport(report, base, stats);

  console.log("");
  console.log("========================================");
  console.log("  İşlemler başarıyla tamamlandı");
  console.log("========================================");
  console.log(`  JSON:  ${base}.json`);
  if (htmlReport) console.log(`  HTML:  ${base}.html`);
  console.log("  Log dosyasına yazıldı.");
  console.log("========================================");
  console.log(JSON.stringify(report, null, 2));
}

function generateHtmlReport(report, base, stats) {
  const date = new Date();
  const dateStr = date.toLocaleString("tr-TR");
  const total = stats.arkadaslar.basarili + stats.gelenIstekler.reddedilen + stats.engeller.kaldirilan + stats.dmler.kapatilan + stats.sunucular.cikilan;
  const failed = stats.arkadaslar.hata + stats.gelenIstekler.hata + stats.engeller.hata + stats.dmler.hata + stats.sunucular.hata;

  const val = (n) => n === 0 ? "Yok" : n;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cheff Discord Self Multi System - Rapor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'SF Pro Display', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      background: linear-gradient(135deg, #1a1b26 0%, #16161e 50%, #0f0f14 100%);
      min-height: 100vh;
      color: #e4e4e7;
      padding: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { max-width: 440px; width: 100%; }
    .card {
      background: rgba(36, 39, 48, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 1.75rem;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .card-header::before {
      content: "";
      width: 4px;
      height: 24px;
      background: linear-gradient(180deg, #7c3aed, #a78bfa);
      border-radius: 2px;
    }
    .card-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #f4f4f5;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .stat-list { display: flex; flex-direction: column; gap: 8px; }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      transition: all 0.2s ease;
    }
    .stat-row:hover {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.08);
    }
    .stat-label { color: #a1a1aa; font-size: 0.9rem; font-weight: 500; }
    .stat-value { font-weight: 600; color: #f4f4f5; font-size: 0.95rem; }
    .stat-value.success { color: #34d399; }
    .stat-value.failed { color: #f87171; }
    .total-row {
      margin-top: 12px;
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(167,139,250,0.1) 100%);
      border: 1px solid rgba(124,58,237,0.35);
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(124,58,237,0.15);
    }
    .total-row .stat-value { font-size: 1.05rem; }
    .report-footer {
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 0.75rem;
      color: #71717a;
      font-weight: 500;
    }
    .emoji {
      display: inline-block;
      animation: bounce 2s ease-in-out infinite;
    }
    .stat-row:nth-child(1) .emoji { animation-delay: 0s; }
    .stat-row:nth-child(2) .emoji { animation-delay: 0.2s; }
    .stat-row:nth-child(3) .emoji { animation-delay: 0.4s; }
    .stat-row:nth-child(4) .emoji { animation-delay: 0.6s; }
    .stat-row:nth-child(5) .emoji { animation-delay: 0.8s; }
    .total-row .emoji { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.15); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="card-header">
        <div class="card-title">📋 İşlem Özeti</div>
      </div>
      <div class="stat-list">
      <div class="stat-row">
        <span class="stat-label"><span class="emoji">👥</span> Arkadaşlar</span>
        <span class="stat-value">${val(stats.arkadaslar.basarili)}${stats.arkadaslar.hata ? `<span class="stat-value failed"> (${stats.arkadaslar.hata} hata)</span>` : ""}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label"><span class="emoji">❌</span> Reddedilen istekler</span>
        <span class="stat-value">${val(stats.gelenIstekler.reddedilen)}${stats.gelenIstekler.hata ? `<span class="stat-value failed"> (${stats.gelenIstekler.hata} hata)</span>` : ""}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label"><span class="emoji">🔓</span> Engeller kaldırıldı</span>
        <span class="stat-value">${val(stats.engeller.kaldirilan)}${stats.engeller.hata ? `<span class="stat-value failed"> (${stats.engeller.hata} hata)</span>` : ""}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label"><span class="emoji">💬</span> DM kapatıldı</span>
        <span class="stat-value">${val(stats.dmler.kapatilan)}${stats.dmler.hata ? `<span class="stat-value failed"> (${stats.dmler.hata} hata)</span>` : ""}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label"><span class="emoji">🚪</span> Sunucudan çıkıldı</span>
        <span class="stat-value">${val(stats.sunucular.cikilan)}${stats.sunucular.hata ? `<span class="stat-value failed"> (${stats.sunucular.hata} hata)</span>` : ""}</span>
      </div>
      <div class="stat-row total-row">
        <span class="stat-label"><span class="emoji">🎉</span> Toplam</span>
        <span class="stat-value success">${total === 0 && failed === 0 ? "Yapılacak işlem yoktu" : `${total} başarılı${failed ? ` · ${failed} hata` : ""}`}</span>
      </div>
      </div>
      <div class="report-footer">🕐 ${dateStr}</div>
    </div>
  </div>
</body>
</html>`;

  const filename = `${base}.html`;
  fs.writeFileSync(path.join(__dirname, filename), html);
  console.log(`[report] ${filename}`);
}

async function main() {
  if (!token || token.length < 30) {
    console.error("config.json: token required");
    return;
  }

  try {
    const { data: me } = await axios.get("https://discord.com/api/v9/users/@me", { headers });
    stats.hesap = me.discriminator && me.discriminator !== "0" ? `${me.username}#${me.discriminator}` : me.username;
    stats.user = {
      id: me.id,
      username: me.username,
      global_name: me.global_name || me.username,
      avatar: me.avatar,
      discriminator: me.discriminator
    };

    console.log(`Cheff Discord Self Multi System | ${stats.hesap}`);

    await Promise.all([
      removeAllFriends(),
      closeAllDMs()
    ]);

    if (sunuculardanCik) await runWithDelay();
    await leaveAllGuilds();

    printStats();
  } catch (err) {
    console.error(err.response?.data?.message || err.message);
    if (err.response?.status === 401) console.error("invalid token");
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
