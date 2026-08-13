export interface ExportData {
  person: { id: string; name: string; relation: string | null };
  generatedAt: string;
  sessions: {
    id: string;
    questionText: string;
    recordedAt: string | null;
    durationSec: number;
    videoFile: string;
    subtitleFile: string;
  }[];
  episodes: {
    id: string;
    sessionId: string;
    title: string;
    startSec: number;
    endSec: number;
    tags: string[];
    era: string | null;
    people: string[];
    theme: string | null;
    occasion: string | null;
    occasionLabel: string;
  }[];
}

// 自己完結型ビューア。サーバー・LLM不要、外部通信なし。
// data.jsonを別途fetchするとfile://で開いたときにCORSでブロックされるため、
// JSONはHTMLにインライン埋め込みする（design 8章の意図＝サーバー不要を確実に満たすため）。
export function buildViewerHtml(data: ExportData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.person.name)}さんの記録 - ノコセル エクスポート</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; margin: 0; background: #f7f5f2; color: #2a2622; }
  header { padding: 24px 20px 12px; border-bottom: 1px solid #e2ddd5; background: #fffdfa; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #766f64; font-size: 13px; }
  main { max-width: 880px; margin: 0 auto; padding: 20px; display: grid; gap: 20px; }
  .search { width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 15px; border-radius: 10px; border: 1px solid #d8d1c6; background: #fff; }
  .player-wrap { background: #111; border-radius: 12px; overflow: hidden; }
  video { width: 100%; display: block; max-height: 420px; background: #000; }
  .player-caption { padding: 10px 14px; background: #fffdfa; border: 1px solid #e2ddd5; border-top: none; border-radius: 0 0 12px 12px; font-size: 14px; color: #4a453e; }
  .list { display: grid; gap: 10px; }
  .card { background: #fffdfa; border: 1px solid #e2ddd5; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: border-color .15s; }
  .card:hover { border-color: #b8ac97; }
  .card.active { border-color: #8a7c62; background: #fbf3e4; }
  .card h3 { margin: 0 0 6px; font-size: 15px; }
  .meta { font-size: 12px; color: #8a8378; margin-bottom: 6px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #eee6d8; color: #6b5f45; }
  .empty { text-align: center; color: #8a8378; padding: 40px 0; font-size: 14px; }
  footer { text-align: center; color: #a29c8f; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(data.person.name)}さんの記録</h1>
  <div class="sub">ノコセル エクスポート ／ 生成日時: ${escapeHtml(data.generatedAt)} ／ サーバー・インターネット接続不要</div>
</header>
<main>
  <input class="search" id="q" type="text" placeholder="キーワード・タグで検索（例: 結婚、仕事、料理）" autocomplete="off" />
  <div class="player-wrap" id="playerWrap" style="display:none">
    <video id="player" controls></video>
  </div>
  <div class="player-caption" id="playerCaption" style="display:none"></div>
  <div class="list" id="list"></div>
  <div class="empty" id="empty" style="display:none">記録がありません</div>
</main>
<footer>この記録は端末内のファイルのみで動作しています。動画・字幕・タグ情報以外は保存されていません。</footer>
<script>
  var DATA = ${json};
  var sessionsById = {};
  DATA.sessions.forEach(function (s) { sessionsById[s.id] = s; });

  var listEl = document.getElementById("list");
  var emptyEl = document.getElementById("empty");
  var qEl = document.getElementById("q");
  var playerWrap = document.getElementById("playerWrap");
  var playerCaption = document.getElementById("playerCaption");
  var player = document.getElementById("player");
  var activeEndSec = null;
  var activeCard = null;

  function matches(ep, q) {
    if (!q) return true;
    var hay = [ep.title, ep.theme || "", ep.era || "", ep.occasionLabel || ""]
      .concat(ep.tags || [])
      .concat(ep.people || [])
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function render() {
    var q = qEl.value.trim().toLowerCase();
    var matched = DATA.episodes.filter(function (ep) { return matches(ep, q); });
    listEl.innerHTML = "";
    emptyEl.style.display = matched.length === 0 ? "block" : "none";
    matched.forEach(function (ep) {
      var card = document.createElement("div");
      card.className = "card";
      var session = sessionsById[ep.sessionId];
      var tagsHtml = (ep.tags || []).map(function (t) { return '<span class="tag">' + escapeHtml(t) + "</span>"; }).join("");
      card.innerHTML =
        "<h3>" + escapeHtml(ep.title) + "</h3>" +
        '<div class="meta">' + escapeHtml(ep.occasionLabel || "") + (ep.era ? " ／ " + escapeHtml(ep.era) : "") + "</div>" +
        '<div class="tags">' + tagsHtml + "</div>";
      card.addEventListener("click", function () { play(ep, card); });
      listEl.appendChild(card);
    });
  }

  function play(ep, card) {
    var session = sessionsById[ep.sessionId];
    if (!session) return;
    if (activeCard) activeCard.classList.remove("active");
    card.classList.add("active");
    activeCard = card;
    playerWrap.style.display = "block";
    playerCaption.style.display = "block";
    playerCaption.textContent = session.questionText + "への回答より";
    activeEndSec = ep.endSec;
    if (player.getAttribute("data-src") !== session.videoFile) {
      player.src = session.videoFile;
      player.setAttribute("data-src", session.videoFile);
    }
    var seekAndPlay = function () {
      player.currentTime = ep.startSec;
      player.play();
    };
    if (player.readyState >= 1) {
      seekAndPlay();
    } else {
      player.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    }
  }

  player.addEventListener("timeupdate", function () {
    // 動画の切り出し・結合は行わない。該当区間の終端で一時停止するのみ（design方針）。
    if (activeEndSec !== null && player.currentTime >= activeEndSec) {
      player.pause();
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  qEl.addEventListener("input", render);
  render();
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}
