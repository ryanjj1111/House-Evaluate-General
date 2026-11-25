# 暫時用：社區名冊（臺中 PDF、臺南 CSV）對社區分組的命中率
import csv, io, json, re, sys, zipfile, urllib.request, urllib.parse, subprocess, html
from collections import Counter, defaultdict
sys.path.insert(0, "tools")
import fetch_rent as F

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 house-evaluate"})
    with urllib.request.urlopen(req, timeout=180, context=F.ssl_ctx()) as r:
        return r.read()
FW = str.maketrans("０１２３４５６７８９－", "0123456789-")
CNUM = "一二三四五六七八九"
def norm(a):
    a = a.translate(FW).replace("臺", "台").replace(" ", "")
    a = re.sub(r"(\d+)段", lambda x: (CNUM[int(x.group(1))-1] if 0 < int(x.group(1)) < 10 else x.group(1)) + "段", a)
    a = re.sub(r"(\d+)-(\d+)號", r"\1之\2號", a)
    return a
def parse(a, dist=""):
    a = norm(a)
    a = re.sub(r"^(台中市|台南市|高雄市)", "", a)
    m = re.match(r"^(\S{1,3}?[區鄉鎮市])", a)
    if m and len(m.group(1)) <= 4: dist = dist or m.group(1); a = a[len(m.group(1)):]
    a = re.sub(r"^\S{1,3}?[村里]\d*鄰?", "", a)
    m = re.match(r"(.*?[路街道大道](?:[一二三四五六七八九]段)?)(.*?)(\d+)(?:之\d+)?號", a)
    if not m: return None
    return dist, m.group(1), m.group(2), int(m.group(3))   # 區、路段、巷弄、號
ROC = lambda s: int(re.sub(r"\D", "", s)[:-4] or 0) + 1911 if len(re.sub(r"\D", "", s)) >= 6 else 0

# 臺中 PDF
page = get("https://thd.taichung.gov.tw/981520/Lpsimplelist").decode("utf-8", "replace")
pdfs = re.findall(r'href="([^"]+\.pdf)"[^>]*>([^<]*)', page) + re.findall(r'href="(/media/\d+/[^"]+)"', page)
print("PDF 連結樣本：", pdfs[:6])
links = [html.unescape(p[0] if isinstance(p, tuple) else p) for p in pdfs]
links = [l for l in links if "公寓大廈" in urllib.parse.unquote(l)] or links
url = links[0] if links else None
reg = {"台中": [], "台南": []}
if url:
    if url.startswith("/"): url = "https://thd.taichung.gov.tw" + url
    print("臺中 PDF：", urllib.parse.unquote(url))
    open("/tmp/tc.pdf", "wb").write(get(url))
    subprocess.run(["pdftotext", "-layout", "/tmp/tc.pdf", "/tmp/tc.txt"], check=True)
    for line in open("/tmp/tc.txt", encoding="utf-8"):
        m = re.match(r"\s*(\d{3})-\d{5}(?:,\S+)?\s+(.+?)\s+(?:管理委員會|管理負責人)?\s*(\d+)\s+(\S+區\S+)", line)
        if m:
            p = parse(m.group(4))
            if p: reg["台中"].append((p, int(m.group(1)) + 1911, 0, m.group(2).strip()))
    print("臺中名冊解析：", len(reg["台中"]), reg["台中"][:3])
for did in [120168]:
    j = json.loads(get(f"https://data.gov.tw/api/v2/rest/dataset/{did}"))["result"]
    d = [x for x in j["distribution"] if (x.get("resourceFormat") or "").upper() == "CSV"]
    d.sort(key=lambda x: x.get("resourceDescription", ""))
    R = list(csv.DictReader(io.StringIO(get(d[-1]["resourceDownloadUrl"]).decode("utf-8-sig", "replace"))))
    print("臺南用：", d[-1]["resourceDescription"], len(R))
    for r in R:
        p = parse(r["建築物地址"])
        y = re.match(r"\((\d+)\)", r.get("使用執照", ""))
        if p: reg["台南"].append((p, int(y.group(1)) + 1911 if y else 0, int(r.get("地上層數") or 0), r["管理委員會"]))
    print("臺南名冊解析：", len(reg["台南"]))

CN2 = {c: i + 1 for i, c in enumerate(CNUM)}
def floors(s):
    s = s.replace("層", "")
    if not s: return 0
    if s.isdigit(): return int(s)
    n = 0; t = 0
    for ch in s:
        if ch == "十": t = (n or 1) * 10; n = 0
        elif ch in CN2: n = CN2[ch]
    return t + n

data = get(F.SEASON_URL.format(season="115S3"))
z = zipfile.ZipFile(io.BytesIO(data))
for c, city in [("b", "台中"), ("d", "台南")]:
    raw = z.read(f"{c}_lvr_land_a.csv").decode("utf-8-sig", "replace")
    rows = list(csv.reader(io.StringIO(raw))); h = rows[0]
    R = [dict(zip(h, r)) for r in rows[2:] if r]
    R = [r for r in R if "建物" in r["交易標的"] and r["建物型態"].startswith(("住宅大樓", "華廈"))]
    cl = defaultdict(list)
    for r in R:
        p = parse(r["土地位置建物門牌"], r["鄉鎮市區"])
        if not p: continue
        k = (p[0], p[1], re.sub(r"\D", "", r["建築完成年月"]), floors(r["總樓層數"]))
        cl[k].append(p[3])
    idx = defaultdict(list)
    for (p, y, f, name) in reg[city]:
        idx[(p[0], p[1])].append((p[3], y, f, name))
    hit = 0; hitn = 0; ex = []
    for k, nums in cl.items():
        y = ROC(k[2]) if k[2] else 0
        best = None
        for (n, ry, rf, name) in idx.get((k[0], k[1]), []):
            if ry and y and not (0 <= ry - y <= 2 or -1 <= ry - y < 0): continue
            if rf and k[3] and rf != k[3]: continue
            d = min(abs(n - x) for x in nums)
            if d <= 40 and (best is None or d < best[0]): best = (d, name)
        if best:
            hit += 1; hitn += len(nums)
            if len(ex) < 6: ex.append((k, best[1]))
    tot = sum(len(v) for v in cl.values())
    print(city, "社區分組", len(cl), "對到名稱", hit, f"({hit/max(1,len(cl)):.0%})，成交筆數", tot, "其中對到", hitn, f"({hitn/max(1,tot):.0%})")
    print("  樣本：", ex)
    big = sorted(cl.items(), key=lambda x: -len(x[1]))[:5]
    print("  成交最多的分組：", [(k, len(v), min(v), max(v)) for k, v in big])
