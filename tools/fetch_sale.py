#!/usr/bin/env python3
"""實價登錄買賣：下載臺中、臺南、高雄最近 3 年的住宅買賣，整理成每個行政區一個小檔，給 💸 出售頁的「社區實價」讀。

資料來源：內政部不動產成交案件實際資訊（實價登錄）開放資料，每季檔加本期檔，政府資料開放授權條款第 1 版。
社區名稱：臺南市公寓大廈管理委員清冊（有地址，自動對到社區）；臺中市公寓大廈報備資料（沒有地址，
只能依「行政區＋使照年份」讓使用者自己挑）；高雄目前沒有開放的名冊。

做法：
1. 每季的 zip 下載一次後放在 --cache 資料夾（Actions 用 actions/cache 保留），每月只會真的下載新的一季和本期。
2. 只留房地或建物交易、大樓／華廈／公寓、住宅用途，排除親友、員工、債務、政府標售等特殊交易。
3. 「同一個社區」＝同行政區、同路段（含巷弄）、同完工日期、同總樓層。實價登錄的完工日期精確到日，
   同一條路上兩棟樓同一天完工、樓層又一樣的機會很小。
4. 輸出：
   <out>/index.json                 更新日、資料期間、各縣市的行政區與筆數、欄位說明
   <out>/<代碼>/<行政區>.json        clusters（社區）＋ rows（成交）
   <out>/<代碼>/names.json          可以用名稱搜尋的社區名冊（臺南對到社區、臺中只有區與使照年）

用法：python3 tools/fetch_sale.py --out out/sale --cache .cache/lvr
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_rent as FR  # noqa: E402  共用下載、季別、民國年轉換

CITIES = {"b": "臺中市", "d": "臺南市", "e": "高雄市"}
YEARS = 3
SEASONS = 14          # 3 年＝12 季，多試兩季（最新一季常常還沒發布）
PING = FR.PING
TYPES = ["大樓", "華廈", "公寓"]
TYPE_KEYS = [("住宅大樓", 0), ("華廈", 1), ("公寓", 2)]
EXCLUDE = ("親友", "員工", "共有人", "特殊關係", "債權債務", "債務抵償", "政府機關", "標讓售", "協議價購",
           "法院", "拍賣", "地上權", "瑕疵", "凶宅", "急買急賣", "畸零地", "合建")
F_ADD, F_FURN, F_PRESALE = 1, 2, 4     # 標記：有增建／頂加／外推、含家具、預售屋或分件登記
CLUSTER_COLS = ["street", "built", "floors", "type", "name", "nmin", "nmax"]
ROW_COLS = ["c", "ym", "no", "floor", "rooms", "ping", "price", "car", "carN", "flags"]
TC_REG_URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=3ea99d8b-494f-4e16-884e-50f5a82aff36"
TN_REG_DATASET = 120168
FW = str.maketrans("０１２３４５６７８９－（）", "0123456789-()")
CN = "一二三四五六七八九"
CN2 = {c: i + 1 for i, c in enumerate(CN)}


# ---------- 門牌
def norm_addr(a):
    a = (a or "").translate(FW).replace("臺", "台").replace(" ", "").replace("　", "")
    a = re.sub(r"(\d+)段", lambda m: (CN[int(m.group(1)) - 1] if 0 < int(m.group(1)) < 10 else m.group(1)) + "段", a)
    a = re.sub(r"(\d+)-(\d+)號", r"\1之\2號", a)
    return a


def parse_addr(a, dist=""):
    """'台中市南區福田二街１８０號十二樓' → ('南區', '福田二街', 180)；巷弄算在路段裡。看不懂回 None。"""
    a = norm_addr(a)
    a = re.sub(r"^(台中市|台南市|高雄市|台中縣|台南縣|高雄縣)", "", a)
    m = re.match(r"^(\S{1,3}?區)", a) or re.match(r"^(\S{1,3}?[鄉鎮市])", a)
    if m:
        dist = dist or m.group(1)
        a = a[len(m.group(1)):]
    a = re.sub(r"^\S{1,3}?[村里](\d+鄰)?", "", a)
    m = re.match(r"(.*?(?:大道|路|街|道)(?:[一二三四五六七八九]段)?(?:\d+巷)?(?:\d+弄)?)(\d+)(?:之\d+)?號", a)
    if not m or not m.group(1):
        return None
    return dist, m.group(1), int(m.group(2))


def floor_num(s):
    """'十二層'／'12樓'／'地下一層' → 12；'全' 或看不懂 → 0。"""
    s = (s or "").strip()
    if not s or s.startswith("地下"):
        return 0
    s = s.split("，")[0].split(",")[0]
    d = re.match(r"(\d+)", s.translate(FW))
    if d:
        return int(d.group(1))
    n = t = 0
    for ch in s:
        if ch == "十":
            t += (n or 1) * 10
            n = 0
        elif ch in CN2:
            n = CN2[ch]
        elif ch in "層樓":
            break
    return t + n


def built_day(s):
    """建築完成年月 '1060815' → 20170815；'1060800' → 20170800；看不懂 0。"""
    d = re.sub(r"\D", "", s or "")
    if len(d) < 6:
        return 0
    y = int(d[:-4]) + 1911
    return y * 10000 + int(d[-4:]) if 1930 <= y <= 2100 else 0


# ---------- 一筆成交
def clean(row, start, why=None):
    def no(stage):
        if why is not None:
            why[stage] += 1
        return None
    if "建物" not in row.get("交易標的", ""):
        return no("交易標的")
    t = row.get("建物型態", "")
    ti = next((i for k, i in TYPE_KEYS if k in t), None)
    if ti is None:
        return no("建物型態")
    use = row.get("主要用途", "")
    rooms = int(FR.num(row.get("建物現況格局-房")))
    if not ("住" in use or rooms > 0):
        return no("主要用途")
    note = row.get("備註", "")
    if any(k in note for k in EXCLUDE):
        return no("特殊交易")
    ym = FR.roc_month(row.get("交易年月日"))
    if not ym or ym < start:
        return no("期間")
    p = parse_addr(row.get("土地位置建物門牌", ""), row.get("鄉鎮市區", "").strip())
    if not p:
        return no("門牌")
    built = built_day(row.get("建築完成年月"))
    floors = floor_num(row.get("總樓層數"))
    if not built or not floors:
        return no("完工或樓層")
    price = FR.num(row.get("總價元"))
    car = FR.num(row.get("車位總價元"))
    area = FR.num(row.get("建物移轉總面積平方公尺")) - FR.num(row.get("車位移轉總面積平方公尺"))
    if price < 300_000 or area < 10:
        return no("金額或面積")
    m = re.search(r"車位(\d+)", row.get("交易筆棟數", ""))
    car_n = int(m.group(1)) if m else 0
    flags = ((F_ADD if any(k in note for k in ("增建", "頂樓加蓋", "外推")) else 0)
             | (F_FURN if "傢俱" in note or "家具" in note else 0)
             | (F_PRESALE if "預售屋" in note else 0))
    return {"dist": p[0], "street": p[1], "no": p[2], "built": built, "floors": floors, "type": ti,
            "ym": ym[0] * 100 + ym[1], "floor": floor_num(row.get("移轉層次")), "rooms": min(rooms, 9),
            "ping": round(area / PING, 1), "price": round(price / 1000), "car": round(car / 1000), "carN": car_n,
            "flags": flags, "id": row.get("編號", "").strip()}


def sale_rows(zbytes, codes):
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        for name in zf.namelist():
            m = re.fullmatch(r"([a-z])_lvr_land_a\.csv", Path(name).name.lower())
            if not m or m.group(1) not in codes:
                continue
            text = zf.read(name).decode("utf-8-sig", errors="replace")
            rd = csv.reader(io.StringIO(text))
            head = [h.strip() for h in next(rd, [])]
            for row in rd:
                if row and row[0].strip().lower().startswith("the"):
                    continue
                yield m.group(1), dict(zip(head, row))


# ---------- 社區名冊
def clean_name(n):
    """'%允將海安管理委員會%' → '允將海安'；'江南藝術園林管委會' → '江南藝術園林'。"""
    n = (n or "").strip().strip("%＊*　 ")
    n = re.sub(r"(公寓大廈)?(管理委員會|管委會|管理負責人)$", "", n).strip()
    return n


def tainan_registry(get):
    meta = json.loads(get(f"https://data.gov.tw/api/v2/rest/dataset/{TN_REG_DATASET}"))["result"]
    ds = [d for d in meta.get("distribution", []) if (d.get("resourceFormat") or "").upper() == "CSV"]
    ds.sort(key=lambda d: d.get("resourceDescription", ""))
    if not ds:
        return []
    rows = csv.DictReader(io.StringIO(get(ds[-1]["resourceDownloadUrl"]).decode("utf-8-sig", "replace")))
    out = []
    for r in rows:
        p = parse_addr(r.get("建築物地址", ""))
        y = re.match(r"\((\d+)\)", (r.get("使用執照") or "").strip())
        name = clean_name(r.get("管理委員會"))
        if p and name:
            out.append({"dist": p[0], "street": p[1], "no": p[2], "year": int(y.group(1)) + 1911 if y else 0,
                        "floors": int(FR.num(r.get("地上層數"))), "name": name})
    print(f"臺南名冊（{ds[-1].get('resourceDescription', '')}）：{len(out)} 筆有門牌")
    return out


def taichung_registry(get):
    rows = csv.DictReader(io.StringIO(get(TC_REG_URL).decode("utf-8-sig", "replace")))
    out = []
    for r in rows:
        r = {k.strip("﻿ "): v for k, v in r.items() if k}
        y = re.match(r"(\d{2,3})-", (r.get("使照序號") or "").strip())
        name = clean_name(r.get("公寓大廈名稱"))
        if name and r.get("行政區"):
            out.append({"dist": r["行政區"].strip(), "year": int(y.group(1)) + 1911 if y else 0,
                        "hh": int(FR.num(r.get("戶數"))), "name": name})
    print(f"臺中名冊：{len(out)} 筆（沒有地址，用區＋使照年讓使用者挑）")
    return out


def match_names(clusters, reg):
    """名冊（有門牌）對到社區：同區、同路段、門牌號相差 40 號內、使照年在完工年 -1～+2、樓層一樣（有的話）。"""
    idx = defaultdict(list)
    for r in reg:
        idx[(r["dist"], r["street"])].append(r)
    hit = 0
    for c in clusters:
        y = c["built"] // 10000
        best = None
        for r in idx.get((c["dist"], c["street"]), []):
            if r["year"] and not (-1 <= r["year"] - y <= 2):
                continue
            if r["floors"] and r["floors"] != c["floors"]:
                continue
            d = 0 if c["nmin"] <= r["no"] <= c["nmax"] else min(abs(r["no"] - c["nmin"]), abs(r["no"] - c["nmax"]))
            if d <= 40 and (best is None or d < best[0]):
                best = (d, r["name"])
        if best:
            c["name"] = best[1]
            hit += 1
    return hit


# ---------- 整理
def build(zips, today, codes=tuple(CITIES)):
    start = FR.month_add(today.year, today.month, -(YEARS * 12))
    seen, recs = set(), defaultdict(list)
    why, total = Counter(), 0
    for z in zips:
        for code, row in sale_rows(z, codes):
            sid = row.get("編號", "").strip()
            if sid and sid in seen:
                continue
            seen.add(sid)
            total += 1
            r = clean(row, start, why)
            if r:
                recs[code].append(r)
    print(f"讀到 {total} 筆買賣；篩掉：" + "、".join(f"{k} {v}" for k, v in why.most_common()))
    out = {}
    for code, rs in recs.items():
        cl = {}
        for r in rs:
            k = (r["dist"], r["street"], r["built"], r["floors"])
            c = cl.setdefault(k, {"dist": k[0], "street": k[1], "built": k[2], "floors": k[3], "types": Counter(),
                                  "name": "", "nmin": r["no"], "nmax": r["no"], "rows": []})
            c["types"][r["type"]] += 1
            c["nmin"], c["nmax"] = min(c["nmin"], r["no"]), max(c["nmax"], r["no"])
            c["rows"].append(r)
        for c in cl.values():
            c["type"] = c["types"].most_common(1)[0][0]
        out[code] = list(cl.values())
    fmt = lambda ym: f"{ym[0]}-{ym[1]:02d}"
    return out, fmt(start), total


def write(out_dir, clusters, frm, to, names, today):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    idx = {"updated": today.isoformat(), "source": "內政部不動產成交案件實際資訊（實價登錄）開放資料：不動產買賣",
           "license": "政府資料開放授權條款－第 1 版", "window": {"from": frm, "to": to},
           "clusterCols": CLUSTER_COLS, "rowCols": ROW_COLS, "types": TYPES,
           "note": "street 路段含巷弄；built 完工日 yyyymmdd；price、car 千元；ping 坪（不含車位）；floor 0＝整棟或不明；flags 1 增建、2 含家具、4 預售屋或分件登記",
           "counties": {}}
    for code, cls in sorted(clusters.items()):
        d = out_dir / code
        d.mkdir(exist_ok=True)
        for old in d.glob("*.json"):
            old.unlink()
        by = defaultdict(list)
        for c in cls:
            by[c["dist"]].append(c)
        dists = {}
        for dist, cs in sorted(by.items()):
            cs.sort(key=lambda c: (c["street"], c["built"], c["floors"]))
            rows = []
            for i, c in enumerate(cs):
                for r in c["rows"]:
                    rows.append([i, r["ym"], r["no"], r["floor"], r["rooms"], r["ping"], r["price"], r["car"], r["carN"], r["flags"]])
            rows.sort(key=lambda x: (-x[1], x[0], x[2], x[3]))
            js = {"county": CITIES[code], "dist": dist,
                  "clusters": [[c["street"], c["built"], c["floors"], c["type"], c["name"], c["nmin"], c["nmax"]] for c in cs],
                  "rows": rows}
            (d / f"{dist}.json").write_text(json.dumps(js, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            dists[dist] = len(rows)
        nm = names.get(code, [])
        if nm:
            (d / "names.json").write_text(json.dumps({"county": CITIES[code], "cols": ["name", "dist", "key", "year", "hh"], "names": nm},
                                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        idx["counties"][code] = {"name": CITIES[code], "dists": dists, "names": len(nm),
                                 "nameMode": "match" if code == "d" else "pick" if code == "b" else "none"}
    (out_dir / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")


def names_for(code, clusters, reg):
    """名稱搜尋用的清單：臺南是對到的社區（有 key）；臺中是名冊（只有區、使照年、戶數，沒有 key）。"""
    if code == "d":
        got = {(c["name"], c["dist"]) for c in clusters if c["name"]}
        return sorted({(c["name"], c["dist"], f'{c["street"]}|{c["built"]}|{c["floors"]}', c["built"] // 10000, 0)
                       for c in clusters if c["name"]}
                      | {(r["name"], r["dist"], "", r["year"], 0) for r in reg if (r["name"], r["dist"]) not in got})
    if code == "b":
        return sorted({(r["name"], r["dist"], "", r["year"], r["hh"]) for r in reg})
    return []


def get_cached(url, cache, name):
    if cache:
        p = Path(cache) / name
        if p.exists() and p.stat().st_size > 1000:
            return p.read_bytes(), True
    b = FR.download(url)
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True)
        (Path(cache) / name).write_bytes(b)
    return b, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out/sale")
    ap.add_argument("--cache", default="")
    a = ap.parse_args()
    today = datetime.now(FR.TZ).date()
    zips = []
    try:
        zips.append(FR.download(FR.CURRENT_URL))
        print(f"本期資料：{len(zips[0]) // 1024} KB")
    except Exception as e:
        print(f"本期資料下載失敗（略過）：{e}")
    got = 0
    for s in FR.season_codes(today, SEASONS):
        try:
            b, hit = get_cached(FR.SEASON_URL.format(season=s), a.cache, f"{s}.zip")
            zips.append(b)
            got += 1
            print(f"季資料 {s}：{len(b) // 1024} KB{'（快取）' if hit else ''}")
        except Exception as e:
            print(f"季資料 {s} 還沒有或下載失敗：{e}")
        if got >= YEARS * 4:
            break
    clusters, frm, total = build(zips, today)
    if not clusters:
        raise RuntimeError("篩選後沒有任何成交，官方格式可能改了")
    get = lambda u: FR.download(u)
    names = {}
    try:
        reg = tainan_registry(get)
        hit = match_names(clusters.get("d", []), reg)
        print(f"臺南社區對到名稱：{hit}／{len(clusters.get('d', []))}")
        names["d"] = names_for("d", clusters.get("d", []), reg)
    except Exception as e:
        print(f"臺南名冊失敗（略過）：{e}")
    try:
        names["b"] = names_for("b", [], taichung_registry(get))
    except Exception as e:
        print(f"臺中名冊失敗（略過）：{e}")
    latest = max((r["ym"] for cs in clusters.values() for c in cs for r in c["rows"]), default=0)
    to = f"{latest // 100}-{latest % 100:02d}" if latest else frm
    write(a.out, clusters, frm, to, names, today)
    for code, cs in clusters.items():
        print(f"{CITIES[code]}：{len(cs)} 個社區、{sum(len(c['rows']) for c in cs)} 筆成交")
    print(f"完成：{frm} ~ {to}")


if __name__ == "__main__":
    main()
