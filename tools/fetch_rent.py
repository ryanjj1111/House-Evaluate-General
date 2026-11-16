#!/usr/bin/env python3
"""租金行情：下載內政部實價登錄開放資料（不動產租賃），整理成各縣市、各行政區的租金統計。

輸出（給網頁讀）：
  data/rent/index.json      更新日、資料期間、各縣市代碼與筆數
  data/rent/<代碼>.json     某縣市各行政區：全部、依房數（1～4，4＝4 房以上）、依建物型態的
                            月租中位數、25%／75% 位數、每坪月租中位數、筆數

篩選：整棟(戶)出租或分層出租、住家用途、有房數；排除親友等特殊關係租約；
      含車位的租約扣掉車位租金與車位面積。期間：最近 12 個月（到本月往前 2 個月，因為登錄有延遲）。

用法：
  python3 tools/fetch_rent.py                      下載並輸出到 data/rent
  python3 tools/fetch_rent.py --zip a.zip b.zip    用本機的 zip（測試用）
  python3 tools/fetch_rent.py --today 2026-11-16   指定「今天」（測試用）
只用 Python 標準函式庫。
"""
import argparse
import csv
import io
import json
import re
import ssl
import statistics
import sys
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SEASON_URL = "https://plvr.land.moi.gov.tw/DownloadSeason?season={season}&type=zip&fileName=lvr_landcsv.zip"
CURRENT_URL = "https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip"
SOURCE_URL = "https://plvr.land.moi.gov.tw/DownloadOpenData"
COUNTIES = {
    "a": "臺北市", "b": "臺中市", "c": "基隆市", "d": "臺南市", "e": "高雄市", "f": "新北市",
    "g": "宜蘭縣", "h": "桃園市", "i": "嘉義市", "j": "新竹縣", "k": "苗栗縣", "m": "南投縣",
    "n": "彰化縣", "o": "新竹市", "p": "雲林縣", "q": "嘉義縣", "t": "屏東縣", "u": "花蓮縣",
    "v": "臺東縣", "w": "金門縣", "x": "澎湖縣", "z": "連江縣",
}
WHOLE = ("整棟(戶)出租", "分層出租")
TYPE_BUCKET = [("住宅大樓", "大樓"), ("華廈", "華廈"), ("公寓", "公寓"), ("透天", "透天"), ("套房", "套房")]
SPECIAL = ("親友", "特殊關係", "員工")
WINDOW = 12   # 月
LAG = 2       # 月
SEASONS = 5   # 最多試幾季（最新一季常常還沒發布）
PING = 3.305785
REQUIRED = ["鄉鎮市區", "交易標的", "租賃年月日", "主要用途", "建物現況格局-房", "總額元", "編號", "出租型態"]
TZ = timezone(timedelta(hours=8))


def ssl_ctx():
    # 政府網站的憑證缺少部分延伸欄位，新版 Python 的嚴格模式會拒絕；仍驗證憑證鏈與主機名稱
    c = ssl.create_default_context()
    c.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)
    return c


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "house-evaluate rent updater"})
    with urllib.request.urlopen(req, timeout=240, context=ssl_ctx()) as r:
        return r.read()


def season_codes(today, n):
    """由新到舊的民國年季別，例如 ['115S4', '115S3', ...]（從上一季開始）。"""
    y, q = today.year - 1911, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        q -= 1
        if q == 0:
            y, q = y - 1, 4
        out.append(f"{y}S{q}")
    return out


def month_add(y, m, k):
    i = y * 12 + m - 1 + k
    return i // 12, i % 12 + 1


def roc_month(s):
    """'1150821' → (2026, 8)。"""
    s = (s or "").strip()
    if not re.fullmatch(r"\d{6,7}", s):
        return None
    y, m = int(s[:-4]) + 1911, int(s[-4:-2])
    return (y, m) if 1 <= m <= 12 else None


def num(s):
    try:
        return float(str(s).replace(",", "").strip())
    except ValueError:
        return 0.0


def has_cjk(s):
    return any("一" <= ch <= "鿿" for ch in s)


def rental_rows(zbytes):
    """讀出 zip 裡每個縣市的租賃主表（x_lvr_land_c.csv），產生 (代碼, dict)。"""
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        for name in zf.namelist():
            m = re.fullmatch(r"([a-z])_lvr_land_c\.csv", Path(name).name.lower())
            if not m or m.group(1) not in COUNTIES:
                continue
            text = zf.read(name).decode("utf-8-sig", errors="replace")
            rd = csv.reader(io.StringIO(text))
            head = [h.strip() for h in next(rd, [])]
            if not head:
                continue
            miss = [k for k in REQUIRED if k not in head]
            if miss:
                raise RuntimeError(f"{name} 缺少欄位 {miss}；目前欄位：{head}")
            for row in rd:
                if row and not has_cjk("".join(row[:3])) and row[0].strip().lower().startswith("the"):
                    continue  # 第二列英文欄名
                yield m.group(1), dict(zip(head, row))


def clean(row, start, end):
    """符合條件回傳 (行政區, 房數鍵, 型態, 月租, 每坪月租或 None)；否則 None。"""
    if row.get("出租型態", "").strip() not in WHOLE:
        return None
    if "建物" not in row.get("交易標的", "") and "房地" not in row.get("交易標的", ""):
        return None
    if "住" not in row.get("主要用途", ""):
        return None
    if any(k in row.get("備註", "") for k in SPECIAL):
        return None
    ym = roc_month(row.get("租賃年月日"))
    if not ym or not (start <= ym <= end):
        return None
    rooms = int(num(row.get("建物現況格局-房")))
    if rooms <= 0:
        return None
    rent = num(row.get("總額元")) - num(row.get("車位總額元"))
    if not 1000 <= rent <= 1_000_000:
        return None
    dist = row.get("鄉鎮市區", "").strip()
    if not dist:
        return None
    t = row.get("建物型態", "")
    tb = next((b for k, b in TYPE_BUCKET if k in t), "其他")
    area = num(row.get("建物總面積平方公尺")) - num(row.get("車位面積平方公尺"))
    per = rent / (area / PING) if area >= 10 else None
    return dist, str(min(rooms, 4)), tb, rent, per


def stats(vals, pers):
    v = sorted(vals)
    o = {"n": len(v), "med": round(statistics.median(v))}
    if len(v) >= 4:
        q = statistics.quantiles(v, n=4, method="inclusive")
        o["p25"], o["p75"] = round(q[0]), round(q[2])
    p = [x for x in pers if x]
    if p:
        o["ping"] = round(statistics.median(p))
    return o


def build(zips, today):
    end = month_add(today.year, today.month, -LAG)
    start = month_add(*end, -(WINDOW - 1))
    seen, data = set(), {}
    for z in zips:
        for code, row in rental_rows(z):
            sid = row.get("編號", "").strip()
            if sid and sid in seen:
                continue
            seen.add(sid)
            r = clean(row, start, end)
            if not r:
                continue
            dist, rk, tb, rent, per = r
            d = data.setdefault(code, {}).setdefault(dist, {"all": ([], []), "rooms": {}, "type": {}})
            for bucket in (d["all"], d["rooms"].setdefault(rk, ([], [])), d["type"].setdefault(tb, ([], []))):
                bucket[0].append(rent)
                bucket[1].append(per)
    if not data:
        raise RuntimeError("篩選後沒有任何租約，下載網址或欄位可能已變更")
    out = {}
    for code, dists in data.items():
        out[code] = {
            name: {
                "all": stats(*d["all"]),
                "rooms": {k: stats(*v) for k, v in sorted(d["rooms"].items())},
                "type": {k: stats(*v) for k, v in sorted(d["type"].items())},
            }
            for name, d in sorted(dists.items())
        }
    return out, f"{start[0]}-{start[1]:02d}", f"{end[0]}-{end[1]:02d}"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/rent")
    ap.add_argument("--zip", nargs="*")
    ap.add_argument("--today")
    a = ap.parse_args(argv)
    today = date.fromisoformat(a.today) if a.today else datetime.now(TZ).date()
    zips, files = [], []
    if a.zip:
        for f in a.zip:
            zips.append(Path(f).read_bytes())
            files.append(Path(f).name)
    else:
        for s in season_codes(today, SEASONS):
            try:
                z = download(SEASON_URL.format(season=s))
            except Exception as e:  # noqa: BLE001
                print(f"季資料 {s} 下載失敗：{e}")
                continue
            if zipfile.is_zipfile(io.BytesIO(z)):
                zips.append(z)
                files.append(s)
                print(f"季資料 {s}：{len(z) // 1024} KB")
            else:
                print(f"季資料 {s} 還沒發布")
            if len(zips) >= 4:
                break
        try:
            z = download(CURRENT_URL)
            if zipfile.is_zipfile(io.BytesIO(z)):
                zips.append(z)
                files.append("本期")
        except Exception as e:  # noqa: BLE001
            print(f"本期資料下載失敗，只用季資料：{e}")
    if not zips:
        raise RuntimeError("沒有下載到任何資料")
    res, frm, to = build(zips, today)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    index = {
        "source": "內政部不動產成交案件實際資訊（實價登錄）開放資料：不動產租賃",
        "sourceUrl": SOURCE_URL,
        "license": "政府資料開放授權條款－第 1 版",
        "filter": "整棟(戶)出租與分層出租、住家用途；排除親友等特殊關係；含車位者扣除車位租金與面積；房數 4 代表 4 房以上",
        "window": {"from": frm, "to": to},
        "files": files,
        "updated": today.isoformat(),
        "counties": {},
    }
    for code, dists in sorted(res.items()):
        n = sum(d["all"]["n"] for d in dists.values())
        index["counties"][code] = {"name": COUNTIES[code], "n": n}
        (out / f"{code}.json").write_text(json.dumps({"county": COUNTIES[code], "window": index["window"], "districts": dists}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成：{len(res)} 個縣市，期間 {frm} ~ {to}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
