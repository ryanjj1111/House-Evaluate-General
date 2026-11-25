# 暫時用：看社區名冊格式，試算門牌對得上幾成
import csv, io, json, re, sys, zipfile, urllib.request
from collections import Counter
sys.path.insert(0, "tools")
import fetch_rent as F

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 house-evaluate"})
    with urllib.request.urlopen(req, timeout=120, context=F.ssl_ctx()) as r:
        return r.read()

def meta(i):
    j = json.loads(get(f"https://data.gov.tw/api/v2/rest/dataset/{i}"))["result"]
    print("==", j["title"], j.get("modifiedDate"))
    for d in j.get("distribution", []):
        print("  ", d.get("resourceFormat"), d.get("resourceDescription"), d.get("resourceDownloadUrl"))
    return j.get("distribution", [])

FW = str.maketrans("０１２３４５６７８９", "0123456789")
CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}
def key(addr):
    a = addr.translate(FW).replace("臺", "台")
    a = re.sub(r"^(台中市|台南市|高雄市)", "", a)
    m = re.match(r"(.+?[區鄉鎮市])?(.*?\d+(?:之\d+)?號)", a)
    if not m: return None
    s = m.group(2)
    s = re.sub(r"(\d+)-(\d+)號", r"\1之\2號", s)
    s = re.sub(r"(\d+)段", lambda x: "一二三四五六七八九"[int(x.group(1))-1] + "段" if 0 < int(x.group(1)) < 10 else x.group(0), s)
    return ((m.group(1) or ""), s)

def rows_csv(b):
    t = b.decode("utf-8-sig", "replace")
    return list(csv.DictReader(io.StringIO(t)))

reg = {}
for did, city in [(105739, "台中"), (120168, "台南")]:
    for d in meta(did):
        if (d.get("resourceFormat") or "").upper() != "CSV": continue
        try:
            R = rows_csv(get(d["resourceDownloadUrl"]))
        except Exception as e:
            print("  下載失敗", e); continue
        print("  欄位：", list(R[0].keys()) if R else None, "筆數", len(R))
        for r in R[:3]: print("    ", r)
        for r in R:
            adr = next((r[k] for k in r if k and ("地址" in k or "門牌" in k)), "")
            dist = r.get("行政區", "") or ""
            name = next((r[k] for k in r if k and ("名稱" in k)), "")
            k = key((dist if dist and dist not in adr else "") + adr)
            if k: reg.setdefault(city, {})[k] = name
    print(city, "名冊可解析門牌：", len(reg.get(city, {})), list(reg.get(city, {}).items())[:5])

data = get(F.SEASON_URL.format(season="115S3"))
z = zipfile.ZipFile(io.BytesIO(data))
for c, city in [("b", "台中"), ("d", "台南"), ("e", "高雄")]:
    raw = z.read(f"{c}_lvr_land_a.csv").decode("utf-8-sig", "replace")
    rows = list(csv.reader(io.StringIO(raw))); h = rows[0]
    R = [dict(zip(h, r)) for r in rows[2:] if r]
    R = [r for r in R if "建物" in r["交易標的"] and r["建物型態"].startswith(("住宅大樓", "華廈"))]
    hit = 0; miss = Counter()
    for r in R:
        k = key(r["鄉鎮市區"] + r["土地位置建物門牌"].translate(FW).replace("臺","台").split("市",1)[-1].split(r["鄉鎮市區"],1)[-1])
        if k and k in reg.get(city, {}): hit += 1
        elif k: miss[k[0]] += 1
    print(city, "大樓／華廈成交", len(R), "對到社區名稱", hit, f"{hit/max(1,len(R)):.0%}")
    ex = [key(r["鄉鎮市區"] + r["土地位置建物門牌"].translate(FW).replace("臺","台").split(r["鄉鎮市區"],1)[-1]) for r in R[:5]]
    print("  成交門牌鍵樣本：", ex)
