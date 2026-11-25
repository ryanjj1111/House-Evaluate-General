# 暫時用：看實價登錄買賣與社區名冊的實際格式（不提交資料）
import csv, io, json, re, sys, zipfile, urllib.request
from collections import Counter
sys.path.insert(0, "tools")
import fetch_rent as F

def show(z, name, n=4, cols=None):
    names = [x for x in z.namelist() if x.lower() == name]
    if not names:
        print("沒有", name); return []
    raw = z.read(names[0]).decode("utf-8-sig", "replace")
    rows = list(csv.reader(io.StringIO(raw)))
    print(f"== {name}：{len(rows)-2} 列"); print("欄位：", "、".join(rows[0])); print("英文：", "、".join(rows[1][:40]))
    for r in rows[2:2+n]:
        print("  ", " | ".join(r))
    return rows

for season in ["115S3"]:
    data = F.download(F.SEASON_URL.format(season=season))
    z = zipfile.ZipFile(io.BytesIO(data))
    print("檔案：", [x for x in z.namelist() if x.lower().startswith(("b_", "d_", "e_"))])
    for c in "bde":
        rows = show(z, f"{c}_lvr_land_a.csv", 3)
        if not rows: continue
        h = rows[0]; R = [dict(zip(h, r)) for r in rows[2:]]
        print("交易標的：", Counter(r.get("交易標的","") for r in R).most_common(8))
        print("建物型態：", Counter(r.get("建物型態","") for r in R).most_common(8))
        adr = [r.get("土地位置建物門牌","") for r in R if "建物" in r.get("交易標的","")]
        print("門牌含 ~ 的比例：", sum("~" in a for a in adr), "/", len(adr))
        print("門牌樣本：", adr[:12])
        print("備註樣本：", Counter(r.get("備註","")[:20] for r in R).most_common(8))
        print("移轉層次樣本：", Counter(r.get("移轉層次","") for r in R).most_common(6), "總樓層數：", Counter(r.get("總樓層數","") for r in R).most_common(4))
        show(z, f"{c}_lvr_land_a_build.csv", 3)
        show(z, f"{c}_lvr_land_a_park.csv", 3)
    show(z, "b_lvr_land_b.csv", 2)

# 社區名冊
def get(url, n=600):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 house-evaluate"})
        with urllib.request.urlopen(req, timeout=60, context=F.ssl_ctx()) as r:
            b = r.read()
        print(f"-- {url} → {len(b)} bytes"); print(b[:n].decode("utf-8", "replace")); return b
    except Exception as e:
        print(f"-- {url} 失敗：{e}"); return b""

b = get("https://data.gov.tw/api/v2/rest/dataset/105739", 3000)
lst = get("https://data.gov.tw/datasets/export/csv", 300)
if lst:
    t = lst.decode("utf-8-sig", "replace")
    for line in t.splitlines():
        if ("公寓大廈" in line or "管理組織" in line) and any(k in line for k in ("臺南", "台南", "高雄", "臺中", "台中")):
            print("清單：", line[:400])
